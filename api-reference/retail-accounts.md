# Retail accounts

Issue dedicated fiat accounts (IBANs) for your own end customers, and read
their balances, ledger and incoming payments — all under your partner API key.

This is an optional product. You reach these endpoints only once Unigox has
activated the `retail` product on your partner and, for issuing accounts,
granted the `issue_retail_accounts` capability. You cannot self-grant either —
talk to Unigox. Until then the write endpoints answer `403` and
`GET /retail/config` reports `enabled: false`.

## The response envelope is different here

The rest of the Partner API wraps responses in `{ "success": …, "data": … }`.
**Retail does not.** Every retail response is a flat object stamped by the
banking-provider layer:

```json
{ "source": "depa", "ok": true, "config": { … } }
```

The payload field (`config`, `account`, `clients`, …) sits at the top level, not
under `data`. A `201` still carries `ok: true` — the HTTP status is what tells
you something was created.

Errors are flat too:

```json
{ "ok": false, "source": "depa", "error": "retail_account_not_found",
  "detail": "That retail account does not exist for this partner." }
```

Branch on `error` (a stable machine slug). `detail` is a human sentence and is
omitted when empty. A failure that came from the banking provider adds
`"upstream": "<provider_code>"`. A missing-fields validation error adds a
`"missing": [ … ]` array.

Two shape exceptions worth knowing:

- `GET /retail/accounts` returns `source` as an **object**
  (`{ "accountId": …, "balances": [ … ] }`), not the string `"depa"`.
- The `missing_fields` errors carry the extra `missing` array described above.

Authentication is the same `X-API-Key` as everywhere else. Your partner is
resolved from the key, and every `customerUuid` is scoped to you: a customer you
do not own answers `404 customer_not_found`, indistinguishable from one that
does not exist.

## What you can and cannot do

You can **issue** accounts and **read** them. You cannot move money on this API:
funding, swaps, closing an account and issuing outbound payments are
Unigox-operated and are not exposed here. Nothing in this section debits an
account.

## The customer comes first

A retail client is always registered under one of your existing partner
customers — the same customer you create with `POST /api/v1/partner/users` and
put through KYC. The customer must be KYC-verified by Unigox before you can push
their identity to the banking provider. One customer can hold several retail
clients.

## End-to-end flow

1. Create and KYC-verify a partner customer (`POST /api/v1/partner/users`, then
   the KYC flow). Reuse an existing verified customer if you have one.
2. Check what you can offer: `GET /retail/config` (currencies, jurisdictions),
   and `GET /retail/customers/{customerUuid}/identity` (what identity is still
   missing before issuance).
3. Register a retail client under the customer:
   `POST /retail/customers/{customerUuid}/clients`.
4. Push the client's identity to the provider:
   `POST /retail/customers/{customerUuid}/clients/{clientId}/identification`.
   Poll `…/identification/refresh` until the provider approves.
5. Issue the account:
   `POST /retail/customers/{customerUuid}/clients/{clientId}/accounts`.
6. Read balances, ledger and payments as deposits arrive
   (`GET /retail/accounts`, `…/accounts/{id}`, `…/ledger`,
   `…/fiat-payments`).

### 1. See what you can offer

```http
GET /api/v1/partner/retail/config
X-API-Key: <api-key>
```

`enabled` and `issuesAccounts` tell you whether you may register clients and
issue accounts. `currencies` and `issuers` (currency → jurisdictions, default
first) tell you what an account may be denominated in. This endpoint never
errors on entitlement — when the product is off it returns `enabled: false` with
a `disabledReason` slug.

### 2. Register a retail client

```http
POST /api/v1/partner/retail/customers/{customerUuid}/clients
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "firstName": "Maria",
  "lastName": "ZALISHCHUK",
  "email": "maria@example.com",
  "phone": "+447700900123",
  "countryOfResidence": "GB",
  "documentType": "PASSPORT",
  "documentNumber": "123456789"
}
```

Only `firstName` and `lastName` are required. No provider call happens yet — the
client is created as a local draft (`status: draft`, `kycStatus: kyc_pending`).
`documentNumber` is never stored; only its last four digits are kept. A missing
name is a `400` with `error: "missing_fields"` and a `missing` array.

### 3. Push identity to the provider

```http
POST /api/v1/partner/retail/customers/{customerUuid}/clients/{clientId}/identification
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "address": "10 Downing Street",
  "city": "London",
  "birthdate": "1990-05-14",
  "documentType": "PASSPORT",
  "documentNumber": "123456789",
  "email": "maria@example.com",
  "countryOfResidence": "GB"
}
```

Every field here is a **fallback**: it is used only when the customer's KYC did
not already capture that value. A verified KYC fact cannot be overridden, and
the name is never taken from the body. After merging with what KYC holds, the
provider needs all of `address`, `city`, `birthdate`, `documentNumber`,
`documentType`, `email`, `countryOfResidence`. `documentType` must be one of
`PASSPORT`, `NATIONAL_ID`, `DRIVERS_LICENCE`, `WORK_PERMIT`.

Call `GET …/identity` first to see exactly what is still missing (`missing` and
`ready`). This step is idempotent: an already-linked client returns `200` with
`alreadyLinked: true`.

### 4. Wait for the provider to approve

```http
POST /api/v1/partner/retail/customers/{customerUuid}/clients/{clientId}/identification/refresh
X-API-Key: <api-key>
```

Re-reads the provider's identification status and reconciles it locally,
returning the client plus the raw `providerStatus`. This is reconcile-only and
keeps working even when issuance is switched off. Poll it until the client is
approved (`canRequestAccount: true` on the client view).

### 5. Issue the account

```http
POST /api/v1/partner/retail/customers/{customerUuid}/clients/{clientId}/accounts
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{ "currency": "GBP", "issuerCountry": "GB" }
```

`currency` is required and must be one your plan prices; `issuerCountry` is
optional (defaults to the currency's default jurisdiction); `postalCode` is
required only for postal-code jurisdictions. Requires the `issue_retail_accounts`
capability. The response carries the account and a `created` flag — `false` when
an existing provider account was adopted or the client already held it (the call
is idempotent).

### 6. Read balances, ledger and payments

- `GET /retail/accounts` — every account you issued, enriched with its client,
  plus aggregate balances. Not paginated. (Remember `source` is an object here.)
- `GET /retail/accounts/{id}` — one account with live status, the provider bank
  account(s) carrying the full IBAN/sort code, and balances.
- `GET /retail/accounts/{id}/ledger?page=N` — provider ledger entries.
- `GET /retail/accounts/{id}/fiat-payments?page=N` — incoming/outgoing fiat
  payments on the account.

List and single-account views truncate IBAN and account number to the last four
digits; the full details live on the nested `bankAccounts` of the single-account
read. Amounts are decimal strings; provider timestamps are Unix epoch seconds.

## What happens when a deposit lands

When money arrives on a retail IBAN you issued, **by default it stays on that
customer's own account** — you see it via the balance and fiat-payment reads
above. That is the whole lifecycle for most partners.

Unigox can, per partner, switch on **collection** of those credits into your
master (operating) account instead — ask Unigox to enable it for you. This is a
Unigox-side setting, not an API call you make. Precedence is: a platform-wide
switch turns the whole mechanism on or off, and above that your per-partner
setting decides whether *your* credits are collected.

Only when collection is on **and** a collection succeeds do you receive a
webhook:

| Event type | Fired when |
|---|---|
| `retail.settlement.completed` | A retail credit was collected into your master account |

Its `data` payload:

```json
{
  "settlement_id": "…",
  "fiat_payment_uuid": "…",
  "amount": "999.00",
  "currency": "GBP",
  "account_id": "…",
  "customer_name": "Maria ZALISHCHUK"
}
```

It uses the same envelope and HMAC-SHA256 signature scheme as every other
webhook (see the Webhooks reference). If you are left on the default (no
collection), a retail deposit fires **no** webhook — there is no separate
"deposit received" event. Reconcile deposits from the fiat-payment reads.
