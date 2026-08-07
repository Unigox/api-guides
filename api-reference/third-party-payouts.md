# Third-party payouts

Use this flow when a KYC-verified customer sends money to another person or
business. The customer is the **sender** and the party receiving money is the
**recipient**.

One Partner API user must represent one real sender. Never route multiple real
customers through a shared shell user. Unigox evaluates recipient fan-out,
payment value and velocity, relationship/purpose coherence, and screening
results for every sender.

## Funding: you pre-fund, we debit

Payouts are funded from **your own crypto balance**, not from your customer's.

Your Unigox partner account is itself an account with a wallet. You top that
wallet up with crypto in advance, and every payout your customers make draws
down that balance: the wallet signs the transfer into each order's escrow. Your
customer never sends crypto to you through Unigox — how they pay you, if at all,
is outside this API.

The practical consequence: **an empty balance stops every payout**, not just the
next one. Keep the wallet funded ahead of demand.

The address is the one on your Unigox wallet page — it does not change, and it
is the same address that appears as `sender_address` on any order's transfer
authorization parameters. Send only the token and chain shown there; a transfer
on another chain cannot fund an order and is not recoverable.

## End-to-end flow

0. Pre-fund your wallet (above). Crypto must be there before you initiate.
1. Create one partner user for the real sender and complete KYC.
2. Register a partner-scoped recipient identity.
3. Add a validated payout destination to the recipient.
4. Request an off-ramp quote with the sender, recipient, destination,
   relationship, and purpose.
5. Initiate the quote. Unigox creates the order and applies the same compliance
   controls used by Portal payouts.
6. Wait for a liquidity provider to accept. A new order starts at
   `awaiting_liquidity_provider` and has no escrow yet, so
   `transfer-authorization-parameters` answers `409 INVALID_STATUS` ("no
   liquidity provider has accepted it"). Poll `GET /orders/{order_id}` — or take
   a webhook — until `next_action` becomes `authorize_crypto_transfer`.
7. Fund the order's escrow from your balance:
   `GET /api/v1/partner/orders/{order_id}/transfer-authorization-parameters`,
   sign the returned ForwardRequest, then
   `POST /api/v1/partner/orders/{order_id}/authorize-crypto-transfer`.
   `sender_address` is your wallet; `recipient_address` is the escrow deployed
   for this order.
8. Read the order and compliance state.

Recipient identity and destination values are versioned. The quote freezes the
exact execution values it validated. Later edits never alter an existing quote
or order.

## 1. Register a recipient

```http
POST /api/v1/partner/recipients
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "recipient_kind": "business",
  "recipient_name": "Shenzhen Example Trading Co Ltd",
  "recipient_native_name": "深圳示例贸易有限公司",
  "recipient_country": "CN",
  "recipient_business_registration_number": "91440300EXAMPLE"
}
```

The recipient belongs to the authenticated partner, not to one sender. Store
the returned `recipient.id`.

## 2. Add a payout destination

```http
POST /api/v1/partner/recipients/{recipient_id}/destinations
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "country_code": "CN",
  "currency": "CNY",
  "rail": "cnaps",
  "institution_id": "china-construction-bank",
  "details": {
    "beneficiary_type": "business",
    "bank_name": "China Construction Bank",
    "account_number": "6222021234567890123",
    "company_name": "Shenzhen Example Trading Co Ltd",
    "company_name_native": "深圳示例贸易有限公司",
    "mobile_number": "13800138000"
  }
}
```

`rail` and `institution_id` are partner-facing slugs — take `rail` from
[`/api/v1/supported/payment-rails`](./README.md) and `institution_id` from
`/api/v1/supported/institutions`. Unigox resolves them to the platform's
payment network and payment method IDs and stores those, so the route is a real
reference rather than a string.

`/api/v1/supported/institutions` is **paginated**: `limit` defaults to `20` and
caps at `100` (a larger value is a `400`, not a silent clamp), and `offset`
defaults to `0` — read `pagination.total` to know how far to page. On a corridor
like CNY/CNAPS, which lists hundreds of banks, do not conclude a bank is missing
from the first page: filter with `search` (matches name or slug, case-insensitive
partial), `code` (the institution's own bank code), or `institution_id` (exact
slug) instead of paging through everything. Only institutions that are live on
the queried rail are listed, so an institution absent from the response cannot be
paid — creating a destination on it is refused.

### `details` field names come from the rail

`details` is validated against the selected rail's configuration, and its keys
are that rail's own field names — the same ones
`/api/v1/supported/payment-rails` advertises for the format you are using. Do
not invent generic names such as `account_holder_name`: they are rejected.

**Pick the format from the institution, not from a table.** A rail can carry
several formats, and the one your `details` is validated against is decided by
the institution you chose:

1. take the institution from `/api/v1/supported/institutions` — each carries an
   `institution_type`;
2. find the rail format whose `institution_types` contains that type;
3. send that format's `fields`.

Formats also carry `has_liquidity`. A format with `has_liquidity: false` cannot
currently be settled in that corridor — do not build against it. On `cnaps`/CNY
today the two bank formats are liquid and the `ewallet` format is not: no
`mobile-wallets` institution is active on this corridor, so Alipay and WeChat Pay
destinations cannot be created. Check the endpoint rather than this sentence.

### Paying a company: `beneficiary_type`

A format may have a business sibling (`cnaps-bank` ↔ `cnaps-bank_business`) that
applies to the **same** institutions but collects a company's details instead of
a person's. The sibling is not selected by the institution — it is selected by a
reserved routing key inside `details`:

```json
"beneficiary_type": "business"
```

Omit it, or send `"individual"`, and the individual format is used.

Send it whenever you send company fields. Without it, `company_name` is
validated against the individual format and rejected with `unknown field
'company_name' is not allowed for this payment network`.

For `rail: "cnaps"`, institutions of type `traditional-banks`:

| Paying | `beneficiary_type` | Required `details` |
| --- | --- | --- |
| a company | `business` | `bank_name`, `account_number`, `company_name`, `company_name_native`, `mobile_number` |
| a person | `individual` (or omit) | `bank_name`, `account_number`, `id_number`, `first_name`, `last_name`, `native_first_name`, `native_last_name`, `mobile_number` |

`mobile_number` must be an 11-digit Chinese mobile number (`13800138000`) —
an international prefix such as `+8613800138000` is rejected.

A missing or malformed field returns `400` with `code: "INVALID_REQUEST"`, and
the message names the offending field. Store the returned `data.id`.

### What reads return

Reads mask the values that identify an account or a person, and return the rest
in full so you can tell two destinations apart:

- masked to last-4 (`•••• 1234`): `recipient_id_number`,
  `recipient_business_registration_number`, and inside `details`
  `account_number`, `bank_account_number`, `iban`, `card_number`, `id_number`,
  `national_id`, `tax_id`, `mobile_number`, `phone_number`, `msisdn`;
- returned in full: names, `bank_name`, `province`, `branch`, routing codes,
  `beneficiary_type`, and every identifier we issued (`id`,
  `payment_method_id`, `payment_network_id`, `created_at`).

`kind` comes back lowercase (`individual` | `business`), matching the
`recipient_kind` you send.

## 3. Request a quote

A third-party payout is routed by `recipient_destination_id`, so
`payment_details_id` must be **omitted**. Sending both is rejected with `400
INVALID_REQUEST` rather than one silently winning.

```http
POST /api/v1/partner/offramp/quote
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "sender_id": "550e8400-e29b-41d4-a716-446655440000",
  "recipient_id": "eb83f57f-814e-4da0-84e8-902d1c60204a",
  "recipient_destination_id": "881b2818-90dd-4e80-a77d-6ce67b6b95a7",
  "sender_recipient_relationship": "supplier",
  "purpose_of_payment": "goods_and_services",
  "purpose_details": "Invoice INV-2026-0042",
  "crypto_currency": "USDT",
  "fiat_currency": "CNY",
  "fiat_amount": "5000",
  "rail": "cnaps"
}
```

`crypto_currency` and the amount are not decoration: a pair with no vendor
liquidity, or an amount above what the corridor can currently serve, returns
`409 NO_OFFERS_AVAILABLE`. Call `/api/v1/partner/liquidity` or
`/api/v1/partner/offramp/estimate` first — both are public — instead of
discovering the ceiling from a failed quote.

`user_uuid` and `sender_id` must identify the same real, KYC-verified sender.
The destination currency must exactly equal `fiat_currency`; this flow does not
support cross-currency recipients. A CNY destination receives CNY.

At quote time Unigox verifies tenant ownership, lifecycle, screening, route,
currency, sender eligibility, relationship, and purpose. Trades stores an
internal immutable snapshot and integrity hash.

## 4. Initiate the payout

Initiate the returned quote through the standard off-ramp initiate endpoint.
Unigox revalidates the frozen quote, applies sender-level controls, and sends
reviewable payouts to the shared Compliance queue before execution.

The response includes:

- `recipient_context`: partner-visible sender, recipient, destination,
  relationship, purpose, and the screening status the payout was authorized
  against;
- `compliance.case_id`: the compliance record for this payout. It is the
  `quote_id`, so a partner and a Unigox operator refer to the same record;
- `compliance.status`: `authorized` in v1;
- `compliance.risk_decision`: `allow` in v1;
- `compliance.requires_review`: `false` in v1.

The same two blocks are returned by `GET /api/v1/partner/orders/{order_id}` for
the life of the order, so you do not have to persist the initiate response to
show a payout's compliance state later.

API-created and Portal-created payouts produce the same record through the same
path.

## Compliance in v1

Controls are enforced BEFORE the order exists, not as a partner-visible review
state machine. A payout that fails a control does not come back as a "held"
order — the request is rejected, and you act on the error:

| Error code | HTTP | Meaning | Partner action |
| --- | --- | ---: | --- |
| `KYC_NOT_CLEARED` | 422 | The sender's KYC is not cleared for this partner. | Complete the sender's KYC; do not substitute another user. |
| `SENDER_IDENTITY_REQUIRED` | 422 | The corridor settles consumer-to-consumer and the sender's record cannot name them on the wire. `details.kyc_fields` is what you can supply. | `PATCH /api/v1/partner/users/{user_uuid}/kyc` with those fields, then retry. See below. |
| `THIRD_PARTY_CONTEXT_INVALID` | 422 | The recipient/destination is not usable: not found for this partner, archived, screening not `cleared`, incomplete route, or `sender_id` ≠ `user_uuid`. | Read the message; re-check the recipient, or wait for screening. |
| `INVALID_REQUEST` | 400 | The payload is wrong — a `details` field the rail does not accept, a missing required third-party field, `payment_details_id` sent alongside `recipient_destination_id`, a destination currency that is not `fiat_currency`, or a currency no third-party-enabled payout route serves (`third-party recipient payout is not available for {CURRENCY}`). The message names what to fix. | Fix the request. |
| `RECIPIENT_NOT_FOUND` | 404 | No recipient with that id belongs to your partner account, or it was archived. | Re-create the recipient, or use one from `GET /api/v1/partner/recipients`. |
| `RECIPIENT_SERVICE_UNAVAILABLE` | 503 | The recipient directory could not be reached. Nothing about your request was wrong. | Retry with backoff. |
| `NO_OFFERS_AVAILABLE` | 409 | No vendor can currently serve this corridor and amount. | Retry later or use a different amount. |
| `THIRD_PARTY_PAYOUT_AGENT_NOT_READY` | 409 | The deployed payout agent has not confirmed support for per-payment relationship and purpose, so no third-party CNY order may be created. Your quote is untouched and stays valid. | Do not retry in a loop — this clears on our side, not yours. Contact support if it persists. |
| `RAIL_ROUTE_MISMATCH` | 400 | The rail you asked for does not match the route the destination resolves to. | Send the `rail` the destination was created with, or omit it. |
| `THIRD_PARTY_PAYOUT_UNDER_REVIEW` | 422 | Returned on initiate. Compliance put this payout in review — someone looks at it on our side. | Do not retry the same payout; wait for the outcome. |
| `THIRD_PARTY_PAYOUT_DECLINED` | 422 | Returned on initiate. Compliance refused it outright, with nothing pending: a breached sender limit, or another initiation for the same sender still in flight. | An identical retry fails identically. Change the payout, or retry the in-flight case after the other one settles. |

`THIRD_PARTY_PAYOUT_AGENT_NOT_READY` is a deliberate stop, not a fault: the
relationship and purpose carried per payment on this corridor are only mapped
correctly by an agent that has confirmed the capability, and an order created
before that would be settled against hardcoded values.

Operator review happens on the Unigox side, over the same records, in the
compliance queue. Value/velocity and fan-out holds surfaced to partners as
order states are not part of v1 — do not build against the states listed in
earlier drafts of this page.

### The sender on consumer-to-consumer rails

Chinese mobile wallets (Alipay, WeChat Pay — the `ewallet` format on `cnaps`)
settle person to person. The receiving wallet shows a remitter, and on those
rails it has to be **your customer**, with their own document, address and phone.
It cannot be Unigox and it cannot be your company: a payout whose remitter does
not match the person behind it is what the rail's identity check exists to catch.

Everything else on this page is about the recipient. This is the one control that
looks at the sender, and it is a property of the corridor, not of the recipient —
the same recipient paid over a bank format does not trigger it.

`POST /api/v1/partner/offramp/initiate` refuses with `422 SENDER_IDENTITY_REQUIRED`
when the sender's KYC record cannot name them. No order is created and the quote
is reverted, so the same customer can retry:

```json
{
  "success": false,
  "error": {
    "code": "SENDER_IDENTITY_REQUIRED",
    "message": "payout corridor requires the sender's own identity details; missing: date_of_birth, id_number, source_of_funds",
    "details": {
      "corridor": "cn_wallet",
      "missing_fields": ["date_of_birth", "id_number", "source_of_funds"],
      "kyc_fields": ["dob", "id_number", "source_of_funds"]
    }
  }
}
```

`details.kyc_fields` is the request body of
`PATCH /api/v1/partner/users/{user_uuid}/kyc` — send those keys, then retry the
initiate with a fresh quote. The full set a wallet payout can ask for is `dob`,
`phone_number`, `address`, `city`, `postal_code`, `id_type`, `id_number`,
`id_issue_country`, `gender`, `nationality` and `source_of_funds`.

That patch is all-or-nothing: one rejected value writes none of the others, and
the `error_key` names which one — `invalid_gender`, `invalid_country_code`,
`invalid_source_of_funds`, `invalid_date_of_birth`, `underage_not_allowed`, or
`invalid_field_value` when a value arrives as an object or an array instead of a
string. A recognised field sent blank is not an error and not a write: the
response is `200` with that field absent from `updated_fields`, so a patch whose
recognised fields are all blank answers `{"updated_fields": []}` and the payout
still refuses. Read `updated_fields` before retrying the initiate.

When `kyc_fields` is shorter than `missing_fields`, the difference is what only
verification can supply — the name as printed on the document, the country of
residence. Those are not editable over the KYC update plane by design, so the
customer has to complete or redo KYC before that payout can go out.

## Updates and deletion

- Reuse an active recipient instead of creating duplicates.
- Update identity with `PATCH /api/v1/partner/recipients/{recipient_id}`. This
  bumps `version` and resets `screening_status` to `pending`, because the
  identity that was screened is no longer the identity on file. A quote for that
  recipient returns `THIRD_PARTY_CONTEXT_INVALID` until screening clears again,
  so do not PATCH immediately before quoting.
- List destinations with
  `GET /api/v1/partner/recipients/{recipient_id}/destinations`.
- Archive a recipient with
  `DELETE /api/v1/partner/recipients/{recipient_id}`.
- Existing orders retain their frozen snapshots after an update or archive.

Partner-facing fields use `recipient_*`,
`sender_recipient_relationship`, and `purpose_of_payment`. Vendor-specific
terminology is translated only inside vendor integrations.
