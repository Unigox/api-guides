# Third-party payouts

Use third-party payouts when a KYC-verified customer sends money to another person or business. The customer is always the **sender**. The party receiving the money is the **recipient**.

Do not create one shell sender for many real customers. `sender_id` must identify the real person or business funding the payout. Unigox monitors recipient fan-out, payment velocity, volume, relationship coherence, and sanctions results per sender.

## End-to-end flow

1. Create one partner user for the real sender and complete their KYC.
2. Register the recipient and their payout destination.
3. Bind payment-specific relationship and purpose data.
4. Request an off-ramp quote using the sender and recipient identifiers.
5. Initiate the quote. Unigox creates a durable compliance case before execution.
6. Read the returned compliance state and the order status.

Recipient identity and destination values are versioned. The quote freezes the exact versions used for matching. Editing the recipient later does not silently change an existing quote or order.

## 1. Register a recipient

```http
POST /api/v1/partner/recipients
Idempotency-Key: recipient-customer-447-supplier-12
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "sender_id": "550e8400-e29b-41d4-a716-446655440000",
  "recipient_kind": "business",
  "recipient_name": "Shenzhen Example Trading Co Ltd",
  "recipient_native_name": "深圳示例贸易有限公司",
  "recipient_country": "CN",
  "recipient_business_registration_number": "91440300EXAMPLE",
  "recipient_destination": {
    "currency": "CNY",
    "rail": "cnaps",
    "account_holder_name": "Shenzhen Example Trading Co Ltd",
    "account_holder_native_name": "深圳示例贸易有限公司",
    "bank_name": "Example Bank Shenzhen Branch",
    "bank_code": "123456789012",
    "account_number": "6222021234567890",
    "province": "Guangdong",
    "branch": "Shenzhen"
  }
}
```

Store the returned `recipient.id` and `recipient_destination.id`. Read responses contain masked sensitive values; full identity and account numbers are write-only.

## 2. Bind the payment context

Relationship and purpose belong to the payment, not permanently to the recipient.

```http
POST /api/v1/partner/recipients/{recipient_id}/payment-context
Idempotency-Key: invoice-inv-2026-0042
Authorization: Bearer <api-key>
Content-Type: application/json
```

```json
{
  "sender_id": "550e8400-e29b-41d4-a716-446655440000",
  "recipient_destination_id": "881b2818-90dd-4e80-a77d-6ce67b6b95a7",
  "sender_recipient_relationship": "supplier",
  "purpose_of_payment": "goods_and_services",
  "purpose_details": "Industrial components",
  "invoice_reference": "INV-2026-0042",
  "corridor": "CNY-CNAPS"
}
```

This returns a versioned `payment_context`. Screening or policy results can place the context into review before funds move.

## 3. Request a quote

For a third-party payout, omit `payment_details_id`. Supply the canonical sender, recipient, destination, relationship, and purpose fields instead.

```http
POST /api/v1/partner/offramp/quote
Authorization: Bearer <api-key>
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

`user_uuid` and `sender_id` must resolve to the same real, KYC-verified sender. The response includes `recipient_context`, which identifies the immutable context and screening state attached to the quote.

## 4. Initiate the payout

Initiate with the returned quote ID using the standard off-ramp initiate endpoint. Unigox revalidates the frozen recipient context, applies sender-level limits, reserves risk capacity, and creates a durable compliance case before execution.

The response includes:

- `recipient_context`: the sender, recipient, destination, relationship, purpose, and frozen context version;
- `compliance.case_id`: the case visible to Unigox Compliance;
- `compliance.status`: `vendor_ready`, `under_review`, `blocked`, `approved`, or `rejected`;
- `compliance.requires_review`: whether execution is waiting for an operator decision.

An API-created third-party payout enters the same Compliance queue as a portal-created payout. There is no separate or hidden API review path.

## Compliance behavior

| State | Meaning | Partner action |
| --- | --- | --- |
| `vendor_ready` | Automated controls passed and execution can continue. | Continue the normal order flow. |
| `under_review` | An operator must review the payout. | Do not retry or create a duplicate. Poll the order or wait for updates. |
| `blocked` | A policy or risk control stopped execution. | Do not send funds. Follow the returned reason or contact support. |
| `approved` | Compliance approved a reviewed payout. | Continue the normal order flow. |
| `rejected` | Compliance rejected the payout. | Do not retry unchanged data. |

Hard sender-limit breaches fail closed. A compliance operator cannot override a hard value limit from the review screen.

## Idempotency and updates

- Use a stable `Idempotency-Key` when creating recipients and payment contexts.
- Reuse an active recipient instead of creating duplicates.
- Update identity with `PATCH /api/v1/partner/recipients/{recipient_id}`.
- List destinations with `GET /api/v1/partner/recipients/{recipient_id}/destinations`.
- Archive a recipient with `DELETE /api/v1/partner/recipients/{recipient_id}`. Existing orders retain their frozen snapshots.

Partner-facing fields always use `recipient_*`, `sender_recipient_relationship`, and `purpose_of_payment`. PSP-specific terms are translated inside the vendor integration and are never part of the Partner API contract.
