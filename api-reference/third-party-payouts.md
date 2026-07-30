# Third-party payouts

Use this flow when a KYC-verified customer sends money to another person or
business. The customer is the **sender** and the party receiving money is the
**recipient**.

One Partner API user must represent one real sender. Never route multiple real
customers through a shared shell user. Unigox evaluates recipient fan-out,
payment value and velocity, relationship/purpose coherence, and screening
results for every sender.

## End-to-end flow

1. Create one partner user for the real sender and complete KYC.
2. Register a partner-scoped recipient identity.
3. Add a validated payout destination to the recipient.
4. Request an off-ramp quote with the sender, recipient, destination,
   relationship, and purpose.
5. Initiate the quote. Unigox creates the order and applies the same compliance
   controls used by Portal payouts.
6. Read the order and compliance state.

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

### `details` field names come from the rail

`details` is validated against the selected rail's configuration, and its keys
are that rail's own field names — the same ones
`/api/v1/supported/payment-rails` advertises for the format you are using. Do
not invent generic names such as `account_holder_name`: they are rejected.

For `rail: "cnaps"` the formats are:

| Paying | Required `details` |
| --- | --- |
| a company | `bank_name`, `account_number`, `company_name`, `company_name_native`, `mobile_number` |
| a person | `bank_name`, `account_number`, `id_number`, `first_name`, `last_name`, `native_first_name`, `native_last_name`, `mobile_number` |
| an e-wallet (Alipay / WeChat Pay) | `full_name`, `account_number` |

`mobile_number` must be an 11-digit Chinese mobile number (`13800138000`) —
an international prefix such as `+8613800138000` is rejected.

A missing or malformed field returns `400` with
`code: "INVALID_REQUEST"`. Store the returned `destination.id`.

Sensitive values are masked or omitted on reads.

## 3. Request a quote

For a third-party payout, omit `payment_details_id` and provide the full
payment-specific context on the quote:

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
  "crypto_currency": "USDC",
  "fiat_currency": "CNY",
  "fiat_amount": "250000",
  "rail": "cnaps"
}
```

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

API-created and Portal-created payouts produce the same record through the same
path.

## Compliance in v1

Controls are enforced BEFORE the order exists, not as a partner-visible review
state machine. A payout that fails a control does not come back as a "held"
order — the request is rejected, and you act on the error:

| Error code | HTTP | Meaning | Partner action |
| --- | --- | ---: | --- |
| `KYC_NOT_CLEARED` | 422 | The sender's KYC is not cleared for this partner. | Complete the sender's KYC; do not substitute another user. |
| `THIRD_PARTY_CONTEXT_INVALID` | 422 | The recipient/destination is not usable: not found for this partner, archived, screening not `cleared`, incomplete route, or `sender_id` ≠ `user_uuid`. | Read the message; re-check the recipient, or wait for screening. |
| `INVALID_REQUEST` | 400 | The payload is wrong — e.g. the destination currency does not equal `fiat_currency`, a required third-party field is missing, or the corridor is not CNY/CNAPS. | Fix the request. |
| `NO_OFFERS_AVAILABLE` | 409 | No vendor can currently serve this corridor and amount. | Retry later or use a different amount. |

Operator review happens on the Unigox side, over the same records, in the
compliance queue. Value/velocity and fan-out holds surfaced to partners as
order states are not part of v1 — do not build against the states listed in
earlier drafts of this page.

## Updates and deletion

- Reuse an active recipient instead of creating duplicates.
- Update identity with `PATCH /api/v1/partner/recipients/{recipient_id}`.
- List destinations with
  `GET /api/v1/partner/recipients/{recipient_id}/destinations`.
- Archive a recipient with
  `DELETE /api/v1/partner/recipients/{recipient_id}`.
- Existing orders retain their frozen snapshots after an update or archive.

Partner-facing fields use `recipient_*`,
`sender_recipient_relationship`, and `purpose_of_payment`. Vendor-specific
terminology is translated only inside vendor integrations.
