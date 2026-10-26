# Business customers

Use this flow to onboard **companies** as your customers and have Unigox issue
bank accounts in their name. A company goes through KYB (business verification)
instead of KYC, and once its KYB is approved you can open accounts for it, read
what moves on them, and move balances between them and your own operating
account.

This is the API version of the **Business customers** section of the B2B
console. Both work on the same records: a company you onboard here shows up in
the console, and the other way round.

Accounts for **individuals** are a different flow: see
[Fiat accounts](../fiat-accounts.md).

{% hint style="info" %}
Business customers are enabled per partner. If your calls answer
`403 CAPABILITY_NOT_GRANTED`, ask Unigox to switch them on.
{% endhint %}

## Who onboards with UNIGOX

B2B clients can use their own front end as technology providers, while their
customers onboard directly with UNIGOX. Anyone with access to a customer's bank
account must also onboard with UNIGOX. To initiate fund movements on a
customer's behalf, the B2B client must obtain power of attorney from that
customer. This does not replace direct onboarding with UNIGOX; nested flows are
not permitted.

## What you can and cannot do

| You can | Endpoint |
|---|---|
| Start KYB for a company and get its onboarding link | `POST /api/v1/partner/business-customers` |
| List your business customers and their KYB status | `GET /api/v1/partner/business-customers` |
| Read one, with what is still asked of it | `GET /api/v1/partner/business-customers/{business_customer_id}` |
| Get the current onboarding link, or issue a fresh one | `GET …/onboarding-link`, `POST …/resend-invitation` |
| Issue an account once KYB is approved | `POST …/{business_customer_id}/fiat-accounts` |
| Read the accounts, their bank details and balances | `GET …/fiat-accounts`, `GET …/fiat-accounts/{fiat_account_id}` |
| Read the book and the bank transfers | `GET …/fiat-accounts/{fiat_account_id}/ledger`, `…/payments` |
| Move a balance to your operating account | `POST …/fiat-accounts/{fiat_account_id}/transfer-to-partner` |
| Fund an account from your operating account | `POST …/fiat-accounts/{fiat_account_id}/fund` |

Not on the API, and done in the B2B console instead:

- **Closing an account.** It cannot be undone; a closed IBAN is never issued
  again.
- **Withdrawing crypto straight from a company's account.** Move the balance to
  your operating account with `transfer-to-partner`, then withdraw from there.

## Conventions

- **Envelope.** Every answer is `{"success": true, "data": {…}}` or
  `{"success": false, "error": {"code": "…", "message": "…"}}`, like the rest
  of the Partner API.
- **Ids.** A business customer is addressed by its `id`. An account is
  addressed as `business_<n>` and is only found under the customer that holds
  it. An id that does not exist and one that is not yours both answer `404`.
- **Money movement needs an `Idempotency-Key` header.** Send a new key for each
  transfer, and the same key when you retry one. A retry of a transfer that went
  through answers from the first attempt with `replayed: true` and moves nothing.
  A retry of one that was refused is tried again. A key reused for a different
  amount or account answers `409 IDEMPOTENCY_KEY_CONFLICT`.
- **Amounts** are decimal strings.

## End to end

### 1. Start KYB

```http
POST /api/v1/partner/business-customers
X-API-Key: <your key>
Content-Type: application/json

{
  "legal_name": "NORTHWIND TRADING LTD",
  "country_of_incorporation": "GB",
  "registration_number": "12345678",
  "representative_email": "director@northwind.example",
  "external_ref": "crm-8812",
  "invitation_expiry_days": 7
}
```

`representative_email` is required: the link is emailed there, and only that
person can open it. Every other field is optional. What you send is pre-filled
in the questionnaire, and the representative completes the rest.

The link does not expire unless you send `invitation_expiry_days` (1 to 90);
then `expires_at` says when it does, and otherwise it is `null`.

```json
{
  "success": true,
  "data": {
    "business_customer": {
      "id": "3f6b2a10-9c1e-4d7a-8b2f-1c2d3e4f5a6b",
      "reference": "KYB-2026-0142",
      "status": "not_started",
      "can_open_accounts": false,
      "external_ref": "crm-8812",
      "company": { "legal_name": "NORTHWIND TRADING LTD", "country_of_incorporation": "GB", "registration_number": "12345678" }
    },
    "onboarding_link": {
      "url": "https://unigox.com/kyb/onboarding/…",
      "expires_at": "2026-10-26T12:00:00Z"
    }
  }
}
```

Send `onboarding_link.url` to the company. If it expires or gets lost,
`POST …/{business_customer_id}/resend-invitation` issues a new one (the old one
stops working). Once the KYB is approved or rejected there is no link, and both
calls answer `409 CONFLICT`.

### 2. Follow the KYB

`GET /api/v1/partner/business-customers/{business_customer_id}` shows where the
case stands:

- `status`: one of `not_started`, `in_progress`, `submitted`,
  `automated_review`, `manual_review`, `additional_information_required`,
  `resubmitted`, `approved`, `rejected`.
- `can_open_accounts`: `true` once the KYB is `approved`.
- `information_requests`: what the company still has to provide.
- `identity_verifications`: each director's or owner's identity check, with
  `verification_url` to resend if they lost it.

Every change of `status` is also pushed to your webhook as
`business_customer.kyb.updated` (see [Webhooks](#webhooks)).

### 3. Issue an account

```http
POST /api/v1/partner/business-customers/{business_customer_id}/fiat-accounts
Content-Type: application/json

{ "currency": "GBP" }
```

`issuer_country` is optional and defaults per currency. A second account in a
currency the company already holds needs `"allow_duplicate": true`; without it
the call answers `409 CURRENCY_ALREADY_ISSUED`. Before approval it answers
`422 KYB_NOT_APPROVED`.

```json
{
  "success": true,
  "data": {
    "fiat_account": {
      "id": "business_412",
      "holder_type": "business",
      "business_customer_id": "3f6b2a10-9c1e-4d7a-8b2f-1c2d3e4f5a6b",
      "currency": "GBP",
      "status": "active",
      "holder_name": "NORTHWIND TRADING LTD",
      "bank_holder_name": "NORTHWIND TRADING LTD",
      "account_number": "12345678",
      "sort_code": "040004",
      "bank_name": "…",
      "balances": [],
      "balance_known": true,
      "details_live": true
    },
    "currency_mismatch": false
  }
}
```

Give the company the bank details to be paid into. `bank_holder_name` is the
name the bank has on file, which is what a payer sees. It can differ from
`holder_name`.

### 4. Read what moved

- `GET …/fiat-accounts/{fiat_account_id}` returns the balances per currency
  (`available`, `pending`, `total`). When the bank could not be read just now,
  `balance_known` is `false` and `balances` is empty. Empty here does not mean
  zero.
- `GET …/ledger?page=1` lists every entry on the account's book, newest first:
  `bank_transfer`, `conversion`, `internal_transfer`, `crypto_transfer`, `fee`
  or `other`, with `balance_after` when the bank reports it.
- `GET …/payments?page=1` lists the bank transfers in (`incoming`) and out
  (`outgoing`), with the counterparty.

Both pages carry `has_more`.

### 5. Move money

To your operating account:

```http
POST /api/v1/partner/business-customers/{business_customer_id}/fiat-accounts/business_412/transfer-to-partner
Idempotency-Key: 7d1f0c9e-2b44-4d3e-9a51-0f6c2a1b8e77
Content-Type: application/json

{ "currency": "GBP", "amount": "1500.00" }
```

Leave out `amount` to move the whole available balance in that currency. The
reverse direction, from your operating account to the company's, is
`POST …/fund`, where `amount` is required. Each direction is enabled for you
separately; one that is not answers `403 CAPABILITY_NOT_GRANTED`.

```json
{
  "success": true,
  "data": {
    "transfer": {
      "fiat_account_id": "business_412",
      "direction": "to_partner",
      "amount": "1500.00",
      "currency": "GBP",
      "status": "completed",
      "replayed": false,
      "idempotency_key": "7d1f0c9e-2b44-4d3e-9a51-0f6c2a1b8e77"
    }
  }
}
```

If the bank does not confirm a transfer in time, the answer is
`504 BANKING_TIMEOUT_UNKNOWN`: the transfer may still have gone through. Do
not retry with a new key. Contact Unigox support; the attempt is held for
reconciliation.

## Webhooks

What happens to your business customers is pushed to your webhook, so you do
not have to poll. The events come in the same envelope and with the same
signature as `order.status.changed` (`X-Unigox-Signature`,
`X-Unigox-Timestamp`), and are retried the same way (up to 10 attempts over
about 3.5 days) until your endpoint answers `2xx`. Register the endpoint with
`POST /api/v1/partner/webhooks`; there is no per-event subscription.

| `event_type` | Fired when |
| --- | --- |
| `fiat_account.deposit.received` | Money arrived on a company's account (`status` `confirmed`). `holder_type` is `business`. |
| `fiat_account.payment.sent` | Money left a company's account (`status` `sent`). |
| `fiat_account.payment.updated` | A transfer in or out reached a new status: pending, held, refused, returned… One event per status. |
| `business_customer.kyb.updated` | A company's KYB `status` changed. |

Moves you make yourself with `transfer-to-partner` or `fund` are not bank
transfers and do not send the `fiat_account.*` events; read them on
`…/ledger`.

### Transfers

The three `fiat_account.*` events carry the same `data`:

```json
{
  "event_id": "evt_fiat_account_deposit_received_5f0c…",
  "event_type": "fiat_account.deposit.received",
  "created_at": "2026-10-26T09:15:02Z",
  "data": {
    "fiat_account_id": "business_412",
    "holder_type": "business",
    "business_customer_id": "3f6b2a10-9c1e-4d7a-8b2f-1c2d3e4f5a6b",
    "holder_name": "NORTHWIND TRADING LTD",
    "payment_id": "5f0c…",
    "transaction_id": "5f0c…",
    "order_id": null,
    "direction": "incoming",
    "amount": "14500.00",
    "currency": "GBP",
    "status": "confirmed",
    "rail": "faster_payments",
    "counterparty_name": "ACME LTD",
    "counterparty_iban": "GB29NWBK60161331926819",
    "description": "INV 42",
    "occurred_at": "2026-10-26T09:14:58Z"
  }
}
```

- `payment_id` is the `id` of the same transfer on `…/payments`.
  `transaction_id` repeats it and `order_id` is always `null`, so a handler
  written for the retail `fiat_account.deposit.received` reads these too. Branch
  on `holder_type` (`retail` or `business`).
- `amount` is always positive; `direction` (`incoming` or `outgoing`) says
  which way the money moved.
- `rail` is the payment scheme: `faster_payments`, `sepa`, `sepa_instant`,
  `swift`.
- `counterparty_*` is the payer on an incoming transfer and the beneficiary on
  an outgoing one. `holder_name`, `rail`, `counterparty_*`, `description` and
  `occurred_at` are left out when blank or not reported.

**Statuses.** `fiat_account.payment.updated` is sent once for every status a
transfer reaches, so you can follow it end to end:

| `status` | Meaning |
| --- | --- |
| `pending` | The bank has the transfer; not yet credited or sent. |
| `confirmed` | Incoming: credited to the account. Same moment as `fiat_account.deposit.received`. |
| `settled` | Incoming: final settlement with the sending bank. |
| `sent` | Outgoing: left the account. Same moment as `fiat_account.payment.sent`. |
| `blocked` | Held for review by the bank. |
| `refused`, `failed`, `expired` | Did not go through. |
| `processing_refund`, `refunded` | Returned to the sender. |

Other values the bank reports are passed on as they are. `held`, `refused` and
`returned` steps are picked up from the bank within about a minute; the others
arrive as soon as the bank reports them. The `status` on
`fiat_account.deposit.received` and `fiat_account.payment.sent` is the status at
that moment and does not change; follow later steps through
`fiat_account.payment.updated`, or read `…/payments`.

### KYB

```json
{
  "event_id": "evt_kyb_3f6b2a10-9c1e-4d7a-8b2f-1c2d3e4f5a6b_approved_1793009730123",
  "event_type": "business_customer.kyb.updated",
  "created_at": "2026-10-26T10:15:30.123Z",
  "data": {
    "business_customer_id": "3f6b2a10-9c1e-4d7a-8b2f-1c2d3e4f5a6b",
    "external_ref": "ER-CUST-77",
    "status": "approved",
    "previous_status": "manual_review",
    "can_open_accounts": true,
    "action_owner": "none",
    "action_type": "decided",
    "action_reason": "Approved",
    "decided_at": "2026-10-26T10:15:30.000Z",
    "updated_at": "2026-10-26T10:15:30.123Z"
  }
}
```

- One event per change of `status` (the values listed in
  [Follow the KYB](#2-follow-the-kyb)), including the review steps, so a
  submission often sends `submitted`, `automated_review` and `manual_review`
  within seconds.
- `external_ref`, `previous_status`, `action_*` and `decided_at` are left out
  when not set. Read `GET …/business-customers/{business_customer_id}` for the
  open `information_requests`.

### Delivery

- Delivery is at least once. `event_id` is the same for every delivery of one
  event, so de-duplicate on it.
- An event raised while your webhook was off is not sent on its own, but it is
  kept: read it back, or have it sent again, as below.
- Webhooks are not sent from fixed IP addresses, so do not allowlist by IP.
  Verify `X-Unigox-Signature` with your webhook secret and reject a request
  whose `X-Unigox-Timestamp` is more than a few minutes old.

### Catching up

`GET /api/v1/partner/webhooks/events?since=2026-10-25T10:00:00Z` lists the
events raised for you since that time, oldest first, each exactly as it was
signed, with how its delivery went:

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "event_id": "evt_fiat_account_payment_updated_5f0c…_blocked",
        "event_type": "fiat_account.payment.updated",
        "created_at": "2026-10-26T09:20:11Z",
        "data": { "…": "as in the webhook" },
        "delivery": {
          "status": "failed",
          "attempts": 10,
          "delivered_at": null,
          "last_http_status": 500,
          "failure_reason": "http_error"
        }
      }
    ],
    "since": "2026-10-25T10:00:00Z",
    "has_more": false,
    "next_cursor": "MTc2…"
  }
}
```

- `since` defaults to 24 hours ago. Filter with `event_type`; page with `limit`
  (50, up to 200) and `cursor` (the `next_cursor` of the previous page).
- `delivery.status` is `pending`, `in_progress`, `delivered` or `failed`.
  `failure_reason` is `webhook_disabled`, `webhook_url_not_set`, `http_error`,
  `network_error` or `delivery_failed`.
- Re-read with some overlap and de-duplicate on `event_id`.
- `POST /api/v1/partner/webhooks/events/{event_id}/redeliver` sends one event
  again (`409` while it is being delivered; `400` if your webhook is off or has
  no URL).

All the events on this page are listed. The retail
`fiat_account.deposit.received` is not yet.

### Testing

- `POST /api/v1/partner/webhooks/test` with no body sends a signed `ping`. With
  `{"event_type": "fiat_account.deposit.received", "holder_type": "business"}`
  (or `fiat_account.payment.sent`, `fiat_account.payment.updated`,
  `business_customer.kyb.updated`, `order.status.changed`) it sends a signed
  sample of that event, with an `evt_test_` id and `"test": true`. The answer
  is `200` with `"delivered": true` when your endpoint answered 2xx, and
  `"delivered": false` with its `http_status` (or `null` if it did not answer)
  otherwise.

## Your operating account

What `transfer-to-partner` moves lands on your own operating account, and crypto
withdrawals leave from there. Three read-only calls show it:

- `GET /api/v1/partner/operating-account` returns what it holds, in
  `fiat_balances` and `crypto_balances` (for example `USDC`). Each line's
  `available` is what you can spend now; fees Unigox has reserved on the account
  are already taken off.
- `GET /api/v1/partner/operating-account/ledger?page=1` lists every entry,
  newest first, in the same shape as a company account's ledger. Money moved in
  from a company's account is an `internal_transfer`.
- `GET /api/v1/partner/operating-account/payments?page=1` lists the bank
  transfers in and out.

```json
{
  "success": true,
  "data": {
    "operating_account": {
      "fiat_balances": [{ "currency": "GBP", "available": "1500.00" }],
      "crypto_balances": [{ "currency": "USDC", "available": "750.50" }]
    }
  }
}
```

If no operating account is set up for you, these answer
`403 NO_OPERATING_ACCOUNT`.

## Errors

| Code | Status | Meaning |
|---|---|---|
| `CAPABILITY_NOT_GRANTED` | 403 | This feature, or this kind of movement, is not enabled for you |
| `PRODUCT_DOES_NOT_ISSUE_ACCOUNTS` | 403 | You can onboard companies but not issue them accounts |
| `ISSUANCE_DISABLED` | 403 | Account issuance and funding are switched off for now |
| `BUSINESS_CUSTOMER_NOT_FOUND` | 404 | No such business customer, or not yours |
| `FIAT_ACCOUNT_NOT_FOUND` | 404 | No such account under this customer |
| `INVALID_REQUEST` | 400 | The body is malformed, or `representative_email` is missing |
| `UNSUPPORTED_CURRENCY`, `INVALID_ISSUER_COUNTRY` | 400 | No account can be issued in that currency or country |
| `CONFLICT` | 409 | The KYB is already decided, so there is no onboarding link |
| `CURRENCY_ALREADY_ISSUED` | 409 | The company already holds an account in this currency; send `allow_duplicate` |
| `KYB_NOT_APPROVED` | 422 | The KYB is not approved yet |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Money movement without an `Idempotency-Key` |
| `INVALID_AMOUNT`, `CURRENCY_MISMATCH` | 400 | The amount is not a positive decimal, or the account does not hold that currency |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | The key was used for a different transfer |
| `TRANSFER_IN_PROGRESS` | 409 | A transfer with this key is still running |
| `TRANSFER_UNRECONCILED` | 409 | An earlier attempt with this key is held for reconciliation |
| `NOTHING_TO_MOVE`, `INSUFFICIENT_FUNDS` | 422 | The balance is zero, or does not cover the amount |
| `FUNDS_NOT_SETTLED` | 422 | The money has arrived but is not available yet |
| `ACCOUNT_CLOSED` | 422 | The account is closed |
| `BANKING_TIMEOUT_UNKNOWN` | 504 | The bank did not confirm a transfer in time; do not retry with a new key |
| `KYB_UNAVAILABLE`, `BANKING_UNAVAILABLE`, `BANKING_ERROR`, `SERVICE_UNAVAILABLE` | 5xx | Try again shortly |
