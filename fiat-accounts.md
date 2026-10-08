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

You can open accounts and read them. v1 is **receive-only**: moving money off an
account is not on this API, and converting what arrives is an order, not a
transfer.

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
    "config": {
      "enabled": true,
      "issues_accounts": true,
      "currencies": ["EUR", "GBP"],
      "issuers": { "EUR": ["NL", "MT"], "GBP": ["GB"] },
      "idle_close_days": 30,
      "idle_close_notice_days": 7
    }
  }
}
```

`enabled` and `issues_accounts` say whether you may use the product and whether
you may open accounts with it. `currencies` and `issuers` (currency →
jurisdictions, default first) say what an account may be denominated in, and
where it can be issued. `idle_close_days` and `idle_close_notice_days` are the
rule for [accounts nobody uses](#accounts-nobody-uses-are-closed), and are
`null` while no account is being closed for inactivity.

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

**Idempotent per (customer, currency, jurisdiction)** while the account is
`pending` or `active`. A repeat answers `201` with the same account and no
`created` field; it does not open a second one. `created: true` is sent only
when the request opened the account. One customer may hold accounts in several
currencies, and in several jurisdictions of the same currency.

Once that account is `closed`, the same request opens a **new** account: a new
`fiat_account_id` and a new IBAN or account number. Send `issuer_country` when
you reopen, or the currency's default jurisdiction is used, which may not be the
one the closed account had. If you call this endpoint as "get or create" before
every order, you will reopen automatically after an inactivity close.

Registering the person with the bank happens behind this call, from the identity
Unigox verified. There is nothing to submit and no second record to keep in
step.

- The customer is not verified: `422 KYC_NOT_CLEARED`.
- The bank needs a field the KYC record does not have: `422
  ISSUANCE_NOT_READY`, with `error.details.missing_fields`. Patch the KYC record
  and post again.
- Another request for the same account is still running (an opening, or a close
  holding the account for a moment): `409 PROVISIONING_IN_PROGRESS`, with
  `error.details.retry_after_seconds`. Read the account, or send the request
  again after that long.
- The account this request would replace is still being closed: `409
  ACCOUNT_CLOSING`, with `error.details.retry_after_seconds`. Nothing was opened;
  send the request again after that long.

### 4. Wait for `active`

An account is `pending` until the bank has opened it, and it carries no pay-in
details while it is: an account that is not open has nowhere to receive money,
and a customer sent to it loses the transfer to a bounce.

| `status` | What it means |
| --- | --- |
| `pending` | Being opened. Do not tell the customer to transfer yet. |
| `active` | Open. The pay-in details are on the account and money may be sent. |
| `failed` | The bank refused. This account will not become usable. |
| `closed` | Retired. Its history stays readable. Do not let the customer pay into it again. With `closing: true` the bank has not confirmed the close yet; see [Before the bank confirms a close](#before-the-bank-confirms-a-close). |

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

An `active` account always carries `closes_at`: `null`, or the date from which
it may be closed for inactivity unless money moves before then. Nothing closes
before that day (UTC) has ended and two more business days have passed. A
`closes_at` in the past still stands: once those two business days have passed,
the account can close at any time until it closes or money moves.
A `closed` account always carries
`closed_at`, `close_reason` (`inactivity` or `operator`, or `null` when the bank
closed the account itself) and `close_idle_days` (the inactivity window that
closed it); each is `null` when it was not recorded, and all three are `null`
while the bank has not confirmed the close. It also always carries `closing`:
`true` while the bank has not confirmed the close, `false` once the close is
final (see
[Before the bank confirms a close](#before-the-bank-confirms-a-close)).

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

v1 is receive-only, so every row is a `credit`. `order_id` names the on-ramp
this deposit funded, and is `null` when it funded none: that money simply stays
on the customer's account.

## Accounts nobody uses are closed

An account with no money in or out for `idle_close_days` days (30 by default)
is closed, while the config publishes `idle_close_days`. An account is never
closed while it holds money in any currency, while an on-ramp order funded from
it is unfinished, or when its payment history with the bank cannot be read in
full. An account opened less than `idle_close_days` ago is never closed.

You are told first. After `idle_close_days` minus `idle_close_notice_days` days
without movement (23 by default), the account gets `closes_at` and you receive
`fiat_account.closing` with that date. Nothing closes before that day (UTC) has
ended and two more business days have passed, so a transfer sent on the date
itself still arrives; the close comes at some point after that, and `closes_at`
stays on the account, in the past, until it does. If money moves in or out
first, the account stays open and `closes_at` goes back to `null` within a few
hours; no event is sent for that, so read the account when you need to know. If
Unigox pauses closing, `closes_at` goes back to `null` at once. When closing
resumes, an account whose date was hidden is not closed on that old date: it
first gets a new `closes_at`, at least `idle_close_notice_days` ahead, and you
receive a new `fiat_account.closing` with it.

When the account closes you receive `fiat_account.updated` with
`status: closed` and `reason: inactivity`. An account the bank closed itself
sends the same event with `reason: null`, and reads `closed` with
`close_reason: null`. Its IBAN is gone for good. To keep
serving the customer, open a new account with the same request as the first
one; it comes with new pay-in details, and the customer must not use the old
ones again.

### Before the bank confirms a close

The bank does not always confirm a close at once, whether the close was for
inactivity or made from the portal. Until it does, the account reads `closed`
with `closing: true`, `closed_at`, `close_reason` and `close_idle_days` all
`null`, it carries no pay-in details, and no `fiat_account.updated` has been
sent. The bank's record is read every five minutes once the close is ten minutes
old, so this normally settles within 15 minutes (longer only while that record
cannot be read), one of two ways:

- The bank closed the IBAN. `closing` turns `false`, `closed_at` and the reason
  are filled in, and `fiat_account.updated` with `status: closed` arrives then.
- It did not. The account reads `active` again, with the same pay-in details. No
  event is sent for that.

So a `closed` read with `closing: true` is not yet a reason to tell the customer
their IBAN is gone. Read the account again with
`GET /fiat-accounts/{fiat_account_id}` about 15 minutes later (an event arrives
only if the close goes through):

- `closing: false`: the close is final. `closed_at` can still be `null` on an
  account closed before close dates were recorded.
- The account reads `active`: the IBAN stayed open, with the same pay-in
  details.
- It still reads `closing: true`: the bank's record still cannot be read. Do not
  send the customer to the IBAN unless it reads `active` again.

Do not send the request that opens an account to find out where a close
stands. When the close is final, that request opens a new account with a new
IBAN, for a customer you may only have meant to look up. Send it when the
customer needs an account again. If the old close is still unsettled then, it
answers `409 ACCOUNT_CLOSING` with `error.details.retry_after_seconds` and opens
nothing; send it again after that long.

## Webhooks

Three events, in the same envelope and with the same signature as
`order.status.changed`.

| `event_type` | Fired when | `data` |
| --- | --- | --- |
| `fiat_account.updated` | The account's status changed. No money moved. | `fiat_account_id`, `user_uuid`, `status`, `currency`; `reason` when `status` is `closed` (`inactivity`, `operator`, or `null` when the bank closed it itself) |
| `fiat_account.closing` | The account may be closed for inactivity once the day of `closes_at` (UTC) has ended and two more business days have passed, unless money moves in or out first. | `fiat_account_id`, `user_uuid`, `currency`, `closes_at`, `last_activity_at` |
| `fiat_account.deposit.received` | Money arrived on the account. | `fiat_account_id`, `user_uuid`, `transaction_id`, `amount`, `currency`, `order_id` (nullable) |

`fiat_account.closing` and the `closed` update are retried like
`order.status.changed` (up to 10 attempts). Each has a fixed `event_id`, so
de-duplicating by `event_id` is enough; a closing notice given again with a new
date has a new `event_id`. The other `fiat_account.updated` events and
`fiat_account.deposit.received` are delivered once and not retried: when one is
missed, the account and its transactions answer the same thing.

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

Off-ramp does not pay out of this account in v1. The customer's outside bank
stays `payment_details`, and a third party stays a Recipient.

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
| `PROVISIONING_IN_PROGRESS` | 409 | Another request for the same account is still running: an opening, or a close holding the account for a moment. Read the account, or retry after `error.details.retry_after_seconds` seconds. |
| `ACCOUNT_CLOSING` | 409 | The account this request would replace is still being closed. Retry after `error.details.retry_after_seconds` seconds. |
| `KYC_NOT_CLEARED` | 422 | The customer is not KYC-verified. |
| `ISSUANCE_NOT_READY` | 422 | Verified, but the bank needs the fields in `error.details.missing_fields`. |
| `CURRENCY_NOT_PRICED` | 422 | No pricing is configured for this currency yet. |
| `BANKING_ERROR` | 502 | The bank refused or failed the request. |
| `BANKING_UNAVAILABLE` | 503 | The bank could not be reached. Nothing was done. |

Both banking failures are safe to retry: issuance is idempotent per (customer,
currency, jurisdiction), so a retry either finishes the account or returns the
one that was already opened.
