# Fiat accounts

Issue dedicated fiat accounts (IBANs) for your own customers, and read their
balances, ledger and incoming payments — all under your partner API key.

Accounts are issued to a customer you already have: the same customer you create
with `POST /api/v1/partner/users` and put through KYC. There is no separate
"retail client" to register and no second identity to keep in step — the person
Unigox verified is the person the account is opened for.

This is an optional product. You reach these endpoints only once Unigox has
activated the `retail` product on your partner and, for issuing accounts,
granted the `issue_retail_accounts` capability. You cannot self-grant either —
talk to Unigox. Until then the write endpoints answer `403` and
`GET /fiat-accounts/config` reports `enabled: false`.

## Conventions

Nothing here departs from the rest of the Partner API. Responses are wrapped:

```json
{ "success": true, "data": { "config": { … } } }
```

Errors carry a machine `code` you can branch on, a human `message`, and — for a
validation failure — the request fields at fault:

```json
{
  "success": false,
  "error": {
    "code": "MISSING_FIELDS",
    "message": "The banking layer needs a few details this customer's verification did not capture.",
    "details": { "missing_fields": ["address", "birthdate"] }
  }
}
```

This is the same `{success, error:{code, message, details}}` shape the order and
off-ramp endpoints use — `code` is stable and safe to branch on, `message` is for
your logs and your support team, and `details` carries whatever the particular
refusal can say.

Field names are `snake_case` at every depth. Authentication is the same
`X-API-Key` as everywhere else, and every `user_id` is scoped to you: a customer
you do not own answers `404`, indistinguishable from one that does not exist.

Nothing in this section identifies the bank or banking platform behind an
account, and nothing branches on it. Which institution issues a given currency
is an operational detail Unigox may change; your integration should not be able
to tell. `bank_name` and `bic` describe the account a payer will send money to,
which is different — those are yours to display.

## What you can and cannot do

You can **issue** accounts and **read** them. You cannot move money on this API:
funding, conversions, closing an account and outbound payments are
Unigox-operated and are not exposed here. Nothing in this section debits an
account.

## End-to-end flow

1. Create and KYC-verify a customer (`POST /api/v1/partner/users`, then the KYC
   flow). Reuse an existing verified customer if you have one.
2. Check what you can offer: `GET /fiat-accounts/config`.
3. Check what identity is still needed: `GET /users/{user_id}/identity`.
4. Submit the customer's identity: `POST /users/{user_id}/identification`, then
   poll `GET /users/{user_id}/identification` until it approves.
5. Issue the account: `POST /users/{user_id}/fiat-accounts`.
6. Read balances, ledger and payments as deposits arrive.

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
      "postal_code_issuers": ["NL"]
    }
  }
}
```

`enabled` and `issues_accounts` tell you whether you may submit identities and
open accounts. `currencies` and `issuers` (currency → jurisdictions, default
first) tell you what an account may be denominated in, and where it can be
issued. `postal_code_issuers` names the jurisdictions that will not issue
without a postal code on file — see step 5.

This endpoint never errors on entitlement. When the product is off it returns
`enabled: false` with a `disabled_reason` slug.

### 2. See what identity is still needed

```http
GET /api/v1/partner/users/{user_id}/identity
X-API-Key: <api-key>
```

Returns what our KYC already established about this customer, and `missing` —
the fields the banking layer still needs. `ready: true` means step 3 will be
accepted with an empty body.

This is a read: it creates nothing and calls no one, so it is safe to poll while
you decide whether to offer the product to a given customer. The document
number is never returned — only its last four digits.

### 3. Submit the customer's identity

```http
POST /api/v1/partner/users/{user_id}/identification
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{ "address": "10 Downing Street", "city": "London", "birthdate": "1990-04-17" }
```

**Every field is optional.** What Unigox verified at KYC is always preferred
over what you send, so send only what step 2 reported as `missing`. The name,
the country of residence and the document are taken from the verification —
sending your own copy cannot override them, by design: the identity a bank opens
an account on has to be the one that was verified.

Accepted fields: `address`, `city`, `birthdate` (`YYYY-MM-DD`),
`document_type`, `document_number`, `email`, `country_of_residence`. Document
types are `PASSPORT`, `NATIONAL_ID`, `DRIVERS_LICENCE`, `WORK_PERMIT`.

The customer must be KYC-verified by Unigox before this is accepted. The
document number is used for the submission and is not stored; only its last four
digits are kept.

A gap answers `400` with `error.code: "MISSING_FIELDS"` and the field list under
`error.details.missing_fields`.

### 4. Wait for approval

```http
GET /api/v1/partner/users/{user_id}/identification
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "holder": {
      "user_id": "9f1c…",
      "full_name": "Maria ZALISHCHUK",
      "status": "approved",
      "kyc_status": "approved",
      "can_open_accounts": true
    }
  }
}
```

Poll this until `can_open_accounts` is `true`. `status` moves
`draft → pending_review → approved | rejected`. Approval is usually immediate
but is not guaranteed to be, which is why this is a poll rather than a
synchronous answer on step 3.

It is a `GET`: checking a verification does not change anything, so it is safe
to retry and safe to run on a schedule. A customer you have not submitted yet
answers `404 ACCOUNT_HOLDER_NOT_FOUND` — polling never creates a holder record.

### 5. Issue the account

```http
POST /api/v1/partner/users/{user_id}/fiat-accounts
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{ "currency": "EUR", "issuer_country": "NL", "postal_code": "1011 AB" }
```

`currency` is required and must be one `GET /fiat-accounts/config` offers.
`issuer_country` is optional — omitted, the currency's default jurisdiction is
used; supplied, it must be one of that currency's `issuers`. `postal_code` is
required only when the chosen jurisdiction is in `postal_code_issuers`, and is
otherwise ignored.

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "412",
      "user_id": "9f1c…",
      "currency": "EUR",
      "issuer_country": "NL",
      "status": "active",
      "iban_last4": "8827",
      "bank_name": "ABN AMRO",
      "bic": "ABNANL2A",
      "holder_name": "Maria ZALISHCHUK",
      "created_at": "2026-09-09T11:04:22Z"
    },
    "created": true
  }
}
```

**This endpoint is idempotent per (customer, currency, jurisdiction).** A repeat
answers `201` with the same account and `created: false`; it does not open a
second one. One customer may hold accounts in several currencies, and in several
jurisdictions of the same currency — `EUR/NL` and `EUR/MT` are two accounts, and
each is opened by naming its `issuer_country`.

Two requests racing for the same account answer `409
PROVISIONING_IN_PROGRESS` — one of them is already opening it. Retry once it
settles rather than treating it as a failure.

### 6. Read the account

```http
GET /api/v1/partner/fiat-accounts                      # every account you operate
GET /api/v1/partner/users/{user_id}/fiat-accounts      # one customer's accounts
GET /api/v1/partner/fiat-accounts/{id}                 # one account, with balances
GET /api/v1/partner/fiat-accounts/{id}/ledger?page=N   # transaction history
GET /api/v1/partner/fiat-accounts/{id}/payments?page=N # incoming payment records
```

The list views carry `iban_last4` (or `account_number_last4` and `sort_code` for
a sterling account, which has no IBAN). The single-account view adds the full
details a payer needs, plus `balances` and `balances_unavailable` — a balance
read that failed is reported rather than shown as zero.

Ledger and payment pages carry the upstream `pagination` object when one is
available. Its **absence means unknown, not "one page"** — fall back to judging
by the length of the page you got.

## What happens when a deposit lands

By default a deposit stays on the customer's account. Unigox can enable
partner-level collection into your master account; when a collection settles,
the `retail.settlement.completed` webhook fires with the settlement id, the
amount, the currency and the account it came from. Register webhooks with
`POST /api/v1/partner/webhooks` as usual.

## Errors

| `error.code` | Status | What it means |
| --- | --- | --- |
| `PRODUCT_NOT_ACTIVATED` | 403 | The product is not active on your partner. |
| `ISSUANCE_NOT_GRANTED` | 403 | You may verify customers but not open accounts for them. |
| `ISSUANCE_DISABLED` | 403 | Account issuance is switched off platform-wide. |
| `CUSTOMER_NOT_FOUND` | 404 | No such customer, or not yours. |
| `FIAT_ACCOUNT_NOT_FOUND` | 404 | No such account, or not yours. |
| `ACCOUNT_HOLDER_NOT_FOUND` | 404 | No such account holder under that customer. |
| `MISSING_FIELDS` | 400 | See `error.details.missing_fields`. |
| `INVALID_DOCUMENT_TYPE` | 400 | Not one of the four accepted document types. |
| `UNSUPPORTED_CURRENCY` | 400 | Not in `config.currencies`. |
| `UNSUPPORTED_ISSUER_COUNTRY` | 400 | Not in `config.issuers[currency]`. |
| `POSTAL_CODE_REQUIRED` | 400 | This jurisdiction will not issue without one. |
| `CLIENT_NOT_APPROVED` | 422 | The identity is not approved yet. |
| `IDENTIFICATION_MISSING` | 422 | Submit the identity before opening an account. |
| `CURRENCY_NOT_PRICED` | 422 | No pricing is configured for this currency yet. |
| `PROVISIONING_IN_PROGRESS` | 409 | The same account is already being opened. |
| `ENTITLEMENT_UNAVAILABLE` | 503 | We could not check your entitlements; nothing was done. |
| `BANKING_ERROR` | 502 | The banking layer refused or failed the request. |
| `BANKING_UNAVAILABLE` | 502 / 503 | The banking layer could not be reached. |

`BANKING_ERROR` and `BANKING_UNAVAILABLE` mean the request reached the banking
layer and did not complete. Both are safe to retry: issuance is idempotent per
(customer, currency, jurisdiction), so a retry either finishes the account or
returns the one that was already opened.
