# Fiat accounts

Give your customers a bank account of their own — a dedicated IBAN they can be
paid into — and read what lands on it.

**What you will build.** By the end of this guide one of your customers holds a
real EUR or GBP account in their own name, you can show them where to send
money, and you can read the balance, the transaction history and every incoming
payment.

**What you need first.** A partner API key, and the `retail` product activated on
your partner — plus the `issue_retail_accounts` capability if you want to open
accounts rather than only verify people for them. Neither is self-service; ask
Unigox. Until they are on, the write endpoints answer `403` and
`GET /fiat-accounts/config` reports `enabled: false`, which is the check to run
first.

**How long it takes.** Three calls per customer once they are KYC-verified, and
approval is usually immediate. It is not guaranteed to be, which is why step 4
is a poll rather than a wait.

## The one idea to hold on to

An account belongs to a **person**, and that person is a customer you already
have — the one you created with `POST /api/v1/partner/users` and put through
KYC. It is not a separate banking record with its own identity to register and
keep in step.

Everything follows from that. The routes live under
`/api/v1/partner/users/{user_uuid}/…`, beside the KYC and payment-details routes
for the same customer. An account id on its own is not enough to read an
account — you address it through its holder. And the identity the bank opens the
account on is the one Unigox verified, not one you retype into a request body.

Accounts here are held by individuals. An account issued to a company you
onboarded through business (KYB) onboarding is not on this API: its holder is a
KYB case rather than a customer, so it cannot be addressed through this tree.
Those remain available in the Unigox console.

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
`X-API-Key` as everywhere else, and every id is scoped to you: a customer or an
account you do not own answers `404`, indistinguishable from one that does not
exist.

**Account ids are opaque** — `retail_412`. Pass them back verbatim; do not parse
them and do not assume the numeric part means anything. The prefix is part of
the id, not decoration.

An account is always addressed under its own customer. One that belongs to a
different customer answers `404`, exactly as one that does not exist — so an
account id alone is never enough to read an account.

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
3. Check what identity is still needed: `GET /users/{user_uuid}/identity`.
4. Submit the customer's identity: `POST /users/{user_uuid}/identification`, then
   poll `GET /users/{user_uuid}/identification` until it approves.
5. Issue the account: `POST /users/{user_uuid}/fiat-accounts`.
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
GET /api/v1/partner/users/{user_uuid}/identity
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
POST /api/v1/partner/users/{user_uuid}/identification
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
GET /api/v1/partner/users/{user_uuid}/identification
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "holder": {
      "user_uuid": "9f1c…",
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
POST /api/v1/partner/users/{user_uuid}/fiat-accounts
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
      "id": "retail_412",
      "holder_type": "retail",
      "holder_id": "9f1c…",
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
GET /api/v1/partner/users/{user_uuid}/fiat-accounts                        # this customer's accounts
GET /api/v1/partner/users/{user_uuid}/fiat-accounts/{id}                   # one account, full details
GET /api/v1/partner/users/{user_uuid}/fiat-accounts/{id}/ledger?page=N     # transaction history
GET /api/v1/partner/users/{user_uuid}/fiat-accounts/{id}/payments?page=N   # incoming payments
```

The list carries `iban_last4` (or `account_number_last4` and `sort_code` for a
sterling account, which has no IBAN). The single-account view adds the full
identifier a payer needs, plus `balances` and `balances_unavailable` — a balance
read that failed is reported rather than shown as zero.

**A closed account stays readable.** Closing retires the IBAN; it does not
remove the account, its history, or any money still behind it. Closed accounts
keep appearing in the list with `status: "closed"` and answer every read.

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
| `MISSING_FIELDS` | 400 | See `error.details.missing_fields`. |
| `INVALID_DOCUMENT_TYPE` | 400 | Not one of the four accepted document types. |
| `INVALID_POSTAL_CODE` | 400 | Longer than the banking layer accepts. |
| `UNSUPPORTED_CURRENCY` | 400 | Not in `config.currencies`. |
| `UNSUPPORTED_ISSUER_COUNTRY` | 400 | Not in `config.issuers[currency]`. |
| `POSTAL_CODE_REQUIRED` | 400 | This jurisdiction will not issue without one. |
| `PRODUCT_NOT_ACTIVATED` | 403 | The product is not active on your partner. |
| `ISSUANCE_NOT_GRANTED` | 403 | You may verify customers but not open accounts for them. |
| `ISSUANCE_DISABLED` | 403 | Account issuance is switched off platform-wide. |
| `CURRENCY_NOT_PERMITTED` | 403 | This holder's issuance is limited to other currencies. |
| `CUSTOMER_NOT_FOUND` | 404 | No such customer, or not yours. |
| `FIAT_ACCOUNT_NOT_FOUND` | 404 | No such account, not yours, or not this customer's. |
| `ACCOUNT_HOLDER_NOT_FOUND` | 404 | No such account holder under that customer. |
| `PROVISIONING_IN_PROGRESS` | 409 | The same account is already being opened. |
| `HOLDER_REGISTRATION_IN_PROGRESS` | 409 | This customer is already being registered as a holder. Retry once it settles. |
| `IDENTIFICATION_ALREADY_LINKED` | 409 | This person is already an account holder under a different record. |
| `CLIENT_NOT_APPROVED` | 422 | The identity is not approved yet. |
| `IDENTIFICATION_MISSING` | 422 | Submit the identity before opening an account. |
| `CUSTOMER_NOT_VERIFIED` | 422 | The customer's KYC is not (or no longer) verified. |
| `CURRENCY_NOT_PRICED` | 422 | No pricing is configured for this currency yet. |
| `ACCOUNT_NOT_PROVISIONED` | 422 | The account has not finished being opened, so it has no details or history yet. |
| `RECORD_FAILED` | 500 | The account was opened but could not be recorded. **Do not retry** — contact Unigox to reconcile. |
| `BANKING_ERROR` | 502 | The banking layer refused or failed the request. |
| `BANKING_UNAVAILABLE` | 502 / 503 | The banking layer could not be reached. |
| `ENTITLEMENT_UNAVAILABLE` | 503 | We could not check your entitlements; nothing was done. |
| `HOLDER_UNAVAILABLE` | 503 | The customer could not be registered as a holder just now; nothing was done. |

`BANKING_ERROR` and `BANKING_UNAVAILABLE` mean the request reached the banking
layer and did not complete. Both are safe to retry: issuance is idempotent per
(customer, currency, jurisdiction), so a retry either finishes the account or
returns the one that was already opened.
