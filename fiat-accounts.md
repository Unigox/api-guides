# Fiat accounts

The how-to. The endpoint-by-endpoint reference is the **Fiat Accounts** section
of the API reference.

Give your customers an account of their own, in their own name, for them to be
paid into — and read what lands on it.

**What you will build.** By the end of this guide one of your customers holds a
real EUR or GBP account, you can show them where to send money, and you can see
every deposit that arrives, including the one that funds an on-ramp order.

**What you need first.** A partner API key and the fiat accounts product
switched on for you. It is not self-service; ask Unigox.
`GET /api/v1/partner/fiat-accounts/config` answers whether it is on, and is the
check to run first.

**How long it takes.** One call per customer once they are KYC-verified. The
bank usually opens the account immediately, but not always, which is why the
account has a `status` and fires a webhook when it changes.

## An account belongs to a customer, and has one id

The holder is a customer you already have: the one you created with
`POST /api/v1/partner/users` and put through KYC. There is no second identity to
register.

The account is addressed by **`fiat_account_id`**, a uuid, the way a person is
addressed by `user_uuid`. That is the only id on it: there is no field called
`id`, and nothing names the bank behind the account.

```
Your partner account
  └── customer (user_uuid)
        ├── KYC                — who they are
        ├── payment details    — THEIR outside bank, where off-ramp money goes
        ├── fiat accounts      — OUR issued account, where money comes in
        └── orders             — conversion; an on-ramp may be funded from the account
```

Accounts are held by individuals. An account issued to a company you onboarded
through KYB onboarding is not on this API.

## What you can and cannot do

You can open accounts and read them. v1 is **receive-only** for you: neither you
nor the customer can move money off an account through this API, and converting
what arrives is an order, not a transfer. EUR and GBP off-ramps are paid
through the customer's account by Unigox itself, on to the bank you named; see
[Paying an off-ramp through the account](#paying-an-off-ramp-through-the-account).

## Conventions

The same as the rest of the Partner API. Responses are wrapped:

```json
{ "success": true, "data": { … } }
```

Errors carry a machine `code` you can branch on, a human `message`, and — for a
gap in the customer's record — the fields at fault:

```json
{
  "success": false,
  "error": {
    "code": "ISSUANCE_NOT_READY",
    "message": "The bank needs a few details this customer's KYC record does not have.",
    "details": { "missing_fields": ["address", "postal_code"] }
  }
}
```

Field names are `snake_case` at every depth, authentication is the same
`X-API-Key`, and every id is scoped to you: an account or a customer you do not
own answers `404`, indistinguishable from one that does not exist.

## End to end

1. Create and KYC-verify a customer (`POST /api/v1/partner/users`, then the KYC
   flow). Reuse a verified customer if you have one.
2. Check what you can offer: `GET /fiat-accounts/config`.
3. Check the customer is ready: `GET /users/{user_uuid}`.
4. Open the account: `POST /fiat-accounts`.
5. Wait for `active`, then show the customer where to pay in.
6. Read what arrives: `GET /fiat-accounts/{fiat_account_id}/transactions`.

### 1. See what you can offer

```http
GET /api/v1/partner/fiat-accounts/config
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "issues_accounts": true,
    "currencies": ["EUR", "GBP"],
    "issuers": { "EUR": ["NL", "MT"], "GBP": ["GB"] }
  }
}
```

`enabled` and `issues_accounts` say whether you may use the product and whether
you may open accounts with it. `currencies` and `issuers` (currency →
jurisdictions, default first) say what an account may be denominated in, and
where it can be issued.

Entitlement is never an error here: when the product is off this still answers
`200`, with `enabled: false` and a `disabled_reason`.

### 2. Check the customer is ready

```http
GET /api/v1/partner/users/{user_uuid}
X-API-Key: <api-key>
```

The customer carries one more object:

```json
"fiat_account_issuance": {
  "ready": false,
  "missing_fields": ["address", "postal_code"]
}
```

`ready: true` means the next step will be accepted. Anything under
`missing_fields` is a field the bank needs and the KYC record does not have,
named the way `PATCH /api/v1/partner/users/{user_uuid}/kyc` takes it:
`address`, `city`, `postal_code`, `dob`, `id_number`, `id_type`. Fill them there
and the customer is ready.

You can skip this check and read the same list off the refusal in step 3.

### 3. Open the account

```http
POST /api/v1/partner/fiat-accounts
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "currency": "EUR",
  "issuer_country": "NL"
}
```

`currency` is required and must be one `config.currencies` offers.
`issuer_country` is optional: omitted, the currency's default jurisdiction is
used. `postal_code` is accepted for the one jurisdiction that will not issue
without one, and only when the KYC record has none; sent here, it is written
onto that record.

```json
{
  "success": true,
  "data": {
    "fiat_account_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "currency": "EUR",
    "issuer_country": "NL",
    "status": "active",
    "created": true,
    "iban": "NL91ABNA0417164300",
    "bic": "ABNANL2A",
    "bank_name": "ABN AMRO",
    "holder_name": "Maria ZALISHCHUK",
    "created_at": "2026-09-18T10:00:00Z"
  }
}
```

**Idempotent per (customer, currency, jurisdiction).** A repeat answers `201`
with the same account and no `created` flag; it does not open a second one. One
customer may hold accounts in several currencies, and in several jurisdictions
of the same currency.

Registering the person with the bank happens behind this call, from the identity
Unigox verified. There is nothing to submit and no second record to keep in
step.

- The customer is not verified: `422 KYC_NOT_CLEARED`.
- The bank needs a field the KYC record does not have: `422
  ISSUANCE_NOT_READY`, with `error.details.missing_fields`. Patch the KYC record
  and post again.
- The same account is already being opened: `409 PROVISIONING_IN_PROGRESS`.

### 4. Wait for `active`

An account is `pending` until the bank has opened it, and it carries no pay-in
details while it is: an account that is not open has nowhere to receive money,
and a customer sent to it loses the transfer to a bounce.

| `status` | What it means |
| --- | --- |
| `pending` | Being opened. Do not tell the customer to transfer yet. |
| `active` | Open. The pay-in details are on the account and money may be sent. |
| `failed` | The bank refused. This account will not become usable. |
| `closed` | Retired. Its history stays readable; new deposits will not credit it. |

`fiat_account.updated` fires when this changes, and
`GET /fiat-accounts/{fiat_account_id}` answers the same thing when you poll.

### 5. Show the customer where to pay in

```http
GET /api/v1/partner/fiat-accounts/{fiat_account_id}
X-API-Key: <api-key>
```

The pay-in details are shaped by the rail the account is on:

| Currency | Fields |
| --- | --- |
| EUR (SEPA) | `iban`, `bic`, `bank_name`, `holder_name` |
| GBP (Faster Payments) | `account_number`, `sort_code`, `bank_name`, `holder_name` |

Keys that do not apply are absent rather than empty. This view also carries
`balances`, and `balances_unavailable: true` when the balance read failed: a
balance we could not read is reported as unavailable rather than as zero.

`GET /api/v1/partner/fiat-accounts?user_uuid={user_uuid}` lists one customer's
accounts, with the last four digits of the identifier rather than the whole one.

### 6. Read what arrives

```http
GET /api/v1/partner/fiat-accounts/{fiat_account_id}/transactions?page=1
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transaction_id": "5f1b2c9a-1d44-4f0e-9c1a-2b5f0d7e9a31",
        "type": "credit",
        "amount": "500.00",
        "currency": "EUR",
        "order_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "description": "Invoice 2026-114",
        "created_at": "2026-09-18T10:04:22Z"
      }
    ],
    "has_more": false
  }
}
```

Only money coming in is listed, so every row is a `credit`. `order_id` names the on-ramp
this deposit funded, and is `null` when it funded none: that money simply stays
on the customer's account.

## Unused accounts are closed

An account with no transactions for a period set by Unigox (30 days by default)
is closed automatically. You receive `fiat_account.updated` with
`status: closed`, as for any close.

To serve the customer again, open a new account with the usual request
([Open the account](#3-open-the-account)). It comes with new pay-in details.

## Webhooks

These events come in the same envelope and with the same signature as
`order.status.changed`.

| `event_type` | Fired when | `data` |
| --- | --- | --- |
| `fiat_account.updated` | The account's status changed. No money moved. | `fiat_account_id`, `user_uuid`, `status`, `currency` |
| `fiat_account.deposit.received` | Money arrived on the account. Not sent for a credit matched to exactly one off-ramp paid through the account (see `order.own_account_payout.updated`). | `fiat_account_id`, `user_uuid`, `transaction_id`, `amount`, `currency`, `order_id` (nullable) |
| `order.own_account_payout.updated` | An off-ramp paid through the account was sent on to the bank, or stopped on the account. See [Paying an off-ramp through the account](#paying-an-off-ramp-through-the-account). | `order_id`, `user_uuid`, `own_account_payout_status`, `fiat_account_id` (omitted when none), `amount`, `currency` |

Register your endpoint with `POST /api/v1/partner/webhooks` as usual; there is
no per-event subscription.

## Paying for an on-ramp from the account

When a customer holds an account in the order's currency, the on-ramp is funded
from it instead of from a vendor's bank details. Such an order carries
`fiat_funding_source: "own_account"` and the `fiat_account_id` it is funded
from, its `next_action` is `deposit_to_user_account`, and it has no
`vendor_payment_details`.

The customer transfers the order's amount into their own account, and the
deposit completes the order: `confirm-payment-sent` is not used and answers
`409 OPERATION_NOT_ALLOWED`. The transaction on the account carries that
`order_id`, so the two books can be reconciled against each other.

Open the order first, then have the customer transfer. A deposit is matched to
an open order of the same customer by amount, to the cent; two open orders for
the same amount are held for review rather than guessed between.

## Paying an off-ramp through the account

> **Not available yet.** Until this release is live, EUR and GBP off-ramps are
> paid as the previous version of this page describes.

EUR and GBP off-ramps are paid through the customer's own fiat account in that
currency: into the account first, then on to the bank you named, both in the
customer's name. Their bank shows the customer as the sender, not Unigox. There
is nothing to switch on. It applies once customer fiat accounts are active for
your partner in that currency (`GET /api/v1/partner/fiat-accounts/config`).

**When it applies.** An off-ramp (crypto to fiat) in EUR or GBP that pays the
customer's own bank, named by `payment_details` (a third party is still paid
through a Recipient). If a liquidity provider that pays banks directly can take
the order, it may still be paid straight to the bank, as before.

**The customer needs an active account.** If they have none in the order's
currency, the quote opens one for them, as `POST /api/v1/partner/fiat-accounts`
would, and answers `409 FIAT_ACCOUNT_OPENING` with `error.details.fiat_account_id`.
Wait for `fiat_account.updated` to report it `active`, then quote again. Opening
needs the customer's verified KYC with an address. Opening it yourself in
advance avoids the wait.

**The bank you name must be payable from the account.** Same currency, the
account's rail (SEPA to an IBAN for EUR, Faster Payments for GBP), and a holder
name that matches the customer. A Wise username or a Revolut tag, for example,
cannot be paid from the account.

**When it cannot be paid this way, the quote is refused.** It is never paid
from another source instead:

| `error.code` | Status | What it means |
| --- | --- | --- |
| `FIAT_ACCOUNT_OPENING` | 409 | The customer's account in this currency is being opened. `details.fiat_account_id`, `details.fiat_account_status`. Quote again once it is `active`. |
| `FIAT_ACCOUNT_REQUIRED` | 409 | The order cannot be paid through the customer's account. `details.reason` says why (below); `details.missing_fields` lists KYC fields to complete. |
| `FIAT_ACCOUNTS_NOT_ENABLED` | 409 | Customer fiat accounts are not active for your partner in this currency. Ask Unigox to enable them. |
| `FIAT_ACCOUNT_CHECK_UNAVAILABLE` | 503 | The payout route could not be checked. Nothing was created; retry shortly. |

`details.reason` on `FIAT_ACCOUNT_REQUIRED`:

| `reason` | What to do |
| --- | --- |
| `kyc_not_verified` | The customer completes KYC. |
| `kyc_details_missing` | Complete the fields in `details.missing_fields` (for example the address). |
| `currency_not_supported`, `country_not_supported` | An account cannot be opened for this customer in this currency. |
| `issuance_not_available`, `issuance_failed`, `issuance_needs_support`, `bank_refused` | The bank did not open the account. Contact Unigox. |
| `identity_linked_to_another_customer` | This person already holds an account under another of your customers. Contact Unigox. |
| `customer_not_found` | No such customer, or not yours. |
| `account_not_payable` | The customer's account cannot send this payment. Contact Unigox. |
| `onward_rail_not_supported` | The bank you named is not on the account's rail (see above). Name another bank. |
| `onward_name_mismatch` | The holder name of the bank you named does not match the customer. |
| `onward_destination_is_source` | You named the customer's fiat account itself. Name their outside bank. |
| `onward_destination_unusable`, `onward_destination_not_found` | The bank details you named cannot be used. Check or re-create them. |

**Name the customer's outside bank, not the account.** An off-ramp quote whose
`payment_details_id` is the payment details of a fiat account Unigox issued to
the customer, in EUR or GBP, is refused with `400 INVALID_PAYMENT_DETAILS`.
Name the customer's outside bank; the payout goes through their account on its
own.

The initiate checks the same again, and answers the same codes if something
changed since the quote.

**What happens.** Two transfers, both in the customer's own name:

1. The liquidity provider pays the fiat into the customer's own account. When this
   credit is matched to exactly one such order, it is that order paying out,
   not a deposit: `fiat_account.deposit.received` is not sent for it, and
   `order.own_account_payout.updated` tells you what happens to the money. Any
   other credit on the account sends `fiat_account.deposit.received` as before,
   including one Unigox holds for review because it cannot be tied to a single
   order.
2. Unigox pays it on from that account to the bank you named. The customer's
   bank shows the customer as the sender, not Unigox.

You may call `confirm-fiat-received` as today. If you do not, the order is
confirmed once Unigox has matched the money on the customer's account, and the
escrow is released after the offer's release time. The transactions list shows
only money coming in, so the onward payment is not a row there; follow it with
`own_account_payout_status`.

**What you see.** Only on such an order, these fields are added. Every other
order looks exactly as before.

- `POST /api/v1/partner/offramp/initiate` answers `payout_via_own_account: true`.
- `GET /api/v1/partner/orders/{order_id}`, and each item of
  `GET /api/v1/partner/orders`, carry `payout_via_own_account: true`,
  `own_account_payout_status` and the `fiat_account_id` the money goes through.
- `order.status.changed` for such an order carries `payout_via_own_account: true`,
  and its `payment_details_id` is the payment details you named, not the
  account's.

`status: completed` means the liquidity provider paid the customer's own account. Whether
the money has reached the bank is `own_account_payout_status`:

| `own_account_payout_status` | What it means |
| --- | --- |
| `awaiting_credit` | Nothing has landed on the customer's account for this order yet. |
| `in_progress` | The money landed; the onward payment is queued, being sent, or being retried. |
| `sent_to_bank` | The money was sent on to the bank you named. |
| `under_review` | The onward payment ended without a clear result. Unigox checks it; nothing retries it on its own. |
| `held` | The money is on the customer's account and is not moving on by itself. Contact Unigox. |
| `left_on_account` | Unigox decided the money stays on the customer's account. |

The field is omitted when the state cannot be read at that moment; read the
order again.

**The event.** `order.own_account_payout.updated` is sent when the onward
payment reaches `sent_to_bank`, `held`, `under_review` or `left_on_account`,
once per change of state. `in_progress` and `awaiting_credit` are not sent; read
the order for them. It does not change the order's `status`.

```json
{
  "event_id": "evt_own_account_payout_8412_sent_to_bank_3f9a1c0b7d2e4a55",
  "event_type": "order.own_account_payout.updated",
  "created_at": "2026-10-16T12:00:00Z",
  "data": {
    "order_id": "9f1c6b7e-0000-4000-8000-000000000042",
    "user_uuid": "c0ffee00-0000-4000-8000-000000000001",
    "own_account_payout_status": "sent_to_bank",
    "fiat_account_id": "6b1d2c3e-0000-4000-8000-000000000007",
    "amount": "250.00",
    "currency": "EUR"
  }
}
```

`amount` is a decimal string with at least two decimals. `fiat_account_id` is
omitted when the account is not one you can address by id. Deduplicate by
`event_id`.

A third party is still paid through a Recipient, never through this account.

## Errors

| `error.code` | Status | What it means |
| --- | --- | --- |
| `UNSUPPORTED_CURRENCY` | 400 | Not in `config.currencies`. |
| `UNSUPPORTED_ISSUER_COUNTRY` | 400 | Not in `config.issuers[currency]`. |
| `POSTAL_CODE_REQUIRED` | 400 | This jurisdiction will not issue without one, and neither the body nor the KYC record has it. |
| `PRODUCT_NOT_ACTIVATED` | 403 | The product is not active on your partner. |
| `ISSUANCE_NOT_GRANTED` | 403 | You may read accounts but not open them. |
| `CUSTOMER_NOT_FOUND` | 404 | No such customer, or not yours. |
| `FIAT_ACCOUNT_NOT_FOUND` | 404 | No such account, or not yours. |
| `PROVISIONING_IN_PROGRESS` | 409 | The same account is already being opened. Read it rather than retrying. |
| `KYC_NOT_CLEARED` | 422 | The customer is not KYC-verified. |
| `ISSUANCE_NOT_READY` | 422 | Verified, but the bank needs the fields in `error.details.missing_fields`. |
| `CURRENCY_NOT_PRICED` | 422 | No pricing is configured for this currency yet. |
| `BANKING_ERROR` | 502 | The bank refused or failed the request. |
| `BANKING_UNAVAILABLE` | 503 | The bank could not be reached. Nothing was done. |

Both banking failures are safe to retry: issuance is idempotent per (customer,
currency, jurisdiction), so a retry either finishes the account or returns the
one that was already opened.
