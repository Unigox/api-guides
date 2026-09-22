# Delayed settlement (T+1)

With T+1, crypto is released from escrow to the licensed partner **before** the recipient
receives the bank payment. The payout window starts when that release is confirmed,
not when you request a quote, fund escrow or submit a signature.

Here, **you** means the business integrating this API. **Licensed partner** means
the business buying the crypto and arranging the bank payment. **Payout provider**
means the service that sends that payment. **Escrow** holds the crypto until release or refund.
**Source of funds** means the customer's explanation and documents showing where
the money came from.

Release from escrow can start automatically after consent and any required document
approval. After crypto reaches the licensed partner, transfer to the payout provider and the
bank payment are manual. The licensed partner or Unigox operator records those actions.
Submitting consent does not call a provider's payout API.

All partner endpoints use `X-API-Key`. `{order_id}` is the order UUID, not the numeric
trade ID. The [OpenAPI specification](../openapi/swagger.yaml) contains full schemas.

## When a quote is delayed

Three conditions:

- **No instant offer covers the amount.** An instant offer that covers it always
  wins, whatever its rate. Delayed offers are considered only when none does —
  typically above a provider's instant ceiling.
- **You hold the crypto.** Never a widget order, where the wallet belongs to your
  customer.
- **The matched licensed partner offers T+1.**

There is no parameter to force or disable T+1. Show the matched payout window
before the customer continues. They can choose not to create the order or request
a new quote for a different amount.

## The quote

```http
POST /api/v1/partner/offramp/quote
X-API-Key: <api-key>
Content-Type: application/json
```

The response carries two extra fields:

```json
{
  "success": true,
  "data": {
    "quote_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "rate": "7.18",
    "crypto_amount": "3000.00",
    "fiat_amount": "21540.00",
    "anchor_type": "fiat",
    "expires_at": "2026-09-18T12:01:00Z",
    "delayed_settlement": true,
    "settlement_hours": 24
  }
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `delayed_settlement` | boolean | `true` when this quote would open a delayed order. Always present. |
| `settlement_hours` | integer \| null | The payout window, counted from the release — not from now. Rounded to the nearest whole hour, never below `1`. `null` on an instant quote. |

`POST /api/v1/partner/offramp/estimate` reports the same two fields, so you can
find where a corridor stops settling instantly without spending quotes. Its
amounts are indicative; the matched offer and availability may change before a later quote.

`POST /api/v1/partner/offramp/initiate` and the escrow funding pair
(`transfer-authorization-parameters` → `authorize-crypto-transfer`) are
unchanged. The order behaves like any other until the escrow is funded.

## End-to-end flow

1. Quote. If `delayed_settlement` is `true`, show `settlement_hours` before the
   customer commits.
2. Initiate and fund the escrow, as on any off-ramp order.
   Capacity is reserved when the trade is created, including the time before
   funding. Cancellation or funding expiry releases that reservation.
3. The funded order remains at `crypto_received` with
   `next_action: "sign_settlement_consent"`.
4. Sign the release:
   `GET /api/v1/partner/orders/{order_id}/settlement-consent-parameters`, then
   `POST /api/v1/partner/orders/{order_id}/settlement-consent`.
5. If `next_action` is `submit_source_of_funds`, collect the customer's explanation
   and documents, submit them and wait for review. The crypto stays in escrow.
   Unigox adds the second signature only after the case is approved and your
   consent is recorded. Without a required review, consent can start release
   immediately. The API accepts consent and approval in either order; your UI
   should follow `next_action`.
6. Follow the payout on `status`, the six timestamps, and the webhooks.

### 1. Read what the order is waiting for

A funded delayed order awaiting release is `crypto_received`, exactly like an instant one whose
buyer has not paid yet. `next_action` is what tells them apart:

| `next_action` | Required action | `allowed_actions` |
| --- | --- | --- |
| `sign_settlement_consent` | Your release signature is required. | `["settlement-consent", "cancel"]` |
| `submit_source_of_funds` | The consent is in; this order needs a source-of-funds case and it is not complete. | `[]` |
| `await_review` | Wait for Unigox: documents may be under review, or consent is stored but release has not advanced yet. Do not sign again. | `[]` |
| absent | Read `status` and `allowed_actions`: the order may be progressing, held, finished or awaiting a refund. | Depends on the current state; may include `authorize-refund`. |

`settlement-consent` and `cancel` appear only on an order whose crypto you hold.
`confirm-fiat-received` never appears on a delayed order: that endpoint refuses
one, so offering it would advertise a `409`.

`cancel` is available only while the order is awaiting release:
`POST /api/v1/partner/orders/{order_id}/cancel` starts the cancellation flow. For funded escrow, follow `authorize-refund` when requested; `cancelled` alone does not prove the crypto is back in the wallet. The
`settlement-consent` and `cancel` actions are withdrawn once consent is signed; a repeated consent answers
`409 OPERATION_NOT_ALLOWED`.

The order list and the single order report the same fields. Actions describe a
read-time snapshot. The action endpoint checks the current state again and can
return 409 if it changed. Once the consent deadline has passed, reads no longer
request a consent signature, even if the order status has not changed yet.
Do not retry an action from an old response indefinitely.

### 2. Get the consent parameters

```http
GET /api/v1/partner/orders/{order_id}/settlement-consent-parameters
X-API-Key: <api-key>
```

The response `data` contains:

| Fields | Meaning |
| --- | --- |
| `order_id`, `status` | Order UUID and current partner-facing status. |
| `escrow_address` | Safe wallet holding the crypto. |
| `signer_address` | Your wallet, the seller-side escrow owner that must sign. |
| `recipient_address` | Licensed partner's wallet receiving the crypto. Verify before signing. |
| `amount_human`, `crypto_currency`, `crypto_decimals` | Amount the licensed partner receives after the platform fee (decimal string), currency and token precision. |
| `direction` | Always `to_buyer`: the licensed partner is buying the crypto. |
| `tx_hash` | Safe transaction hash. Not a broadcast transaction or proof of confirmed release. |
| `safe_params`, `domain`, `types` | Complete EIP-712 signing payload. Use exactly as returned. |
| `settlement_hours`, `consent_deadline_at` | Payout window and UTC deadline for consent/release to start. |
| `authorization_path` | Path to POST the signature. |

Sign with `primaryType: "SafeTx"`, the returned `domain` and `types`, and
`message: safe_params`. SafeTx includes all ten fields: `to`, `value`, `data`,
`operation`, `safeTxGas`, `baseGas`, `gasPrice`, `gasToken`, `refundReceiver`, `nonce`.
Do not reconstruct the transaction, sign only its calldata, or hard-code a chain ID.

Same shape as `refund-authorization-parameters`, with these differences:
`direction` is `to_buyer` rather than `to_seller`, `tx_hash` is present, and
`settlement_hours` and `consent_deadline_at` are echoed beside the payload.

Sign with the key of `signer_address` (your wallet, the escrow's seller-side
owner). `recipient_address` (the licensed partner) and `amount_human` (what that partner
receives after the platform fee) are read from the escrow; verify both before
signing.

GET and POST check ownership, crypto custody, T+1 eligibility, funded status,
holds, deadline and whether consent is already stored. The state may change
between the calls. An expired or missing deadline prevents a new consent.

### 3. Submit the signature

```http
POST /api/v1/partner/orders/{order_id}/settlement-consent
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "signature": "<hex signature over the returned typed transaction>",
  "signed_data": "<safe_params.data or tx_hash from the same GET>"
}
```

**Both fields are required** (unlike `authorize-refund`).

Either of two values is accepted as `signed_data`: `safe_params.data` (the release
calldata) or `tx_hash`. Both are compared case-insensitively and with surrounding
quotes stripped. Anything else answers `400 INVALID_REQUEST`.

Sign the returned typed data (`domain`, `types`, `safe_params`) locally and submit
both `signature` and `signed_data`. Never send a private key.

```json
{
  "success": true,
  "data": {
    "order_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "status": "crypto_received",
    "next_action": "submit_source_of_funds",
    "consent_signed": true,
    "release_started": false
  }
}
```

A 200 confirms the signature was stored; it does **not** confirm a crypto
transfer or bank payment. `release_started: true` means release has started or
is already confirmed. `false` means the latest read did not show a release state:
review may still be required, release may be blocked or need recovery, or a
concurrent cancellation/refund may have won. Read the returned `status` and refresh
the order. `payout_deadline_at` is set only after confirmed release.

The release service is called automatically after consent, and after approval when
consent already exists. Its failure does not undo a stored signature. Do not sign
again to retry a transfer; Unigox must resolve the release.

A consent is recorded once. A second call answers `409`: `OPERATION_NOT_ALLOWED` while
the order is still awaiting release, `INVALID_STATUS` once the release has started.

### 4. Source of funds

An order whose USD equivalent is at least the source-of-funds threshold —
**USD 50 000** today — requires approval of the customer's explanation and
documents before release. An order whose USD equivalent cannot be computed is treated as
above it. Valuation uses fiat amount multiplied by its stored USD rate, falling
back to total crypto amount multiplied by its stored USD rate when needed.
An existing case still requires approval even if the current threshold would
otherwise exempt the amount.

The figure can change, so read it from the order rather than from this page:
`source_of_funds_threshold_usd` reports the **current configured** threshold,
not a historical threshold saved with the order. `source_of_funds_required`
describes applicability, including an existing case. It can remain true after
approval or completion; use `next_action` and case `status` to decide what is needed.
`threshold_usd` on the case read carries the same current figure.

Below the threshold, with no existing case, `source-of-funds`,
`…/source-of-funds/declaration` and `…/source-of-funds/documents` answer
`404 ORDER_NOT_FOUND`. `…/source-of-funds/requirements` still serves the
catalogue, for any delayed order of yours.

The case is normally created after escrow funding. A `404` can also mean it has
not been created yet; it does not by itself mean review is unnecessary. Check
`source_of_funds_required` on the order. If it is `true`, keep the order waiting
and refresh it; contact support if the case remains unavailable.

Your customer supplies the evidence on *your* screens and you post it here.

#### Read the source-of-funds case

```http
GET /api/v1/partner/orders/{order_id}/source-of-funds
X-API-Key: <api-key>
```

`data` contains `trade_id`, `delayed_settlement`, `case_id`, `status`,
`consent` (`signed`, nullable `signed_at`), `threshold_usd`, `usd_equivalent`,
`source_of_funds` (applicability and case summary), `declaration`, `documents`,
`requested_documents`, optional `requirements_snapshot`, nullable `decided_at`,
`rejection_reason_code` and `created_at`. Dates use RFC3339. Use the returned IDs
unchanged. Document metadata does not grant access to the stored file.

`requested_at` and `request_expires_at` are the last request's timestamps, when
recorded. They can remain after the request is answered. Use `requested_documents`
and case `status` to determine whether the customer still needs to respond.

`404 ORDER_NOT_FOUND`: the order has no source-of-funds case yet, is not yours, or its crypto is
not held by you. An on-ramp order answers `400 INVALID_REQUEST`.

A decided case still answers this read.

#### The requirements catalogue

Render your form from the catalogue until the first declaration saves the case's requirements:

```http
GET /api/v1/partner/orders/{order_id}/source-of-funds/requirements
X-API-Key: <api-key>
```

The result contains `revision` and `categories`. Each category supplies its code,
label, explanation requirement, bank-statement policy, base documents and document
groups. Use these fields to build the form, rather than hard-coding a document list.

`?source_of_funds=salary` narrows it to one category; a code that does not exist
answers `404 ORDER_NOT_FOUND`. Field names here are `camelCase`.
`requiresAddressScreening` is `true` on `crypto_assets`, where
`source_wallet_address` is required. Categories with `"legacy": true` are refused
by the declaration endpoint; do not offer them.

Cache against `revision`.

`requirements_snapshot` contains the requirements saved when the first declaration
was accepted. Its structure differs from the catalogue. Once it is available,
use it to decide which files to request; later catalogue changes do not change
that case's requirements.

- `documents[].mode` is `one_of` (choose one document type in the group)
  or `all_of` (every listed type is required). In both cases send at least
  `minimum_files[type]` files. For example, choosing payslips can require two files.
- `documents[].documents` holds the `document_type` keys to upload under.
- `minimum_files` / `maximum_files` carry an entry for **every** key in the group.
  Both are `1` unless the catalogue asks for several files; a `multiple` document
  with no published ceiling has `maximum_files` `10`.
- `requires_statement`, `statement_months`, `statement_max_months` (when the
  category publishes an upper end) and `statement_max_age_days` describe the
  personal account statement (`bank_statement`), required for every category except
  `crypto_assets`.
- `requested_documents` is what a reviewer came back and asked for on top. Open
  requests only; each entry carries `document_type`, `label`, `reason`,
  `requested_at`, `satisfied`, and `policy` when that document has a format or
  window rule of its own.
- `review_checks` is always `[]`; the reviewer's checklist is available only through the admin API.

For a requested bank statement, `policy.accepted_content_types` is
`["application/pdf"]`; `policy.statement.minimum_months` is `3` and
`policy.statement.maximum_age_days` is `31`. Display these requirements to the
customer. A document already held before the new request does not answer it;
upload a replacement. A successful upload confirms storage, not review approval.

Upload against the keys in the snapshot, and read `expected_document_types` on an
upload response if a key does not match.

#### Submit the declaration

```http
POST /api/v1/partner/orders/{order_id}/source-of-funds/declaration
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "source_of_funds": "salary",
  "explanation": "monthly salary accumulated since 2024",
  "funds_flow_description": "paid by employer to my current account",
  "purpose_of_payment": "family support",
  "sender_recipient_relationship": "self"
}
```

Answers with the whole source-of-funds case, in the shape above.

| Field | Required | Notes |
| --- | --- | --- |
| `source_of_funds` | yes | One of `salary`, `business_income`, `sale_of_property`, `investment`, `crypto_assets`, `inheritance`, `gift`, `family_support`, `loan`, `savings`, `other`. |
| `explanation` | yes | The customer's own words; must not be blank. Max 4000 UTF-8 bytes. |
| `source_wallet_address` | for `crypto_assets` | Max 256 UTF-8 bytes. |
| `source_wallet_network` | no | Max 64 UTF-8 bytes. |
| `additional_sources` | no | Only codes already on the case; a new one is refused. |
| `funds_flow_description` | no | Max 4000 UTF-8 bytes. |
| `purpose_of_payment` | no | Max 4000 UTF-8 bytes. |
| `sender_recipient_relationship` | no | Max 4000 UTF-8 bytes. |

`catalogue_revision` and the document requirements are computed on the server and
are never read from the request. The first declaration saves the requirements.
Later edits preserve those requirements and their original date and revision;
the declared source and any saved additional sources cannot be changed or removed.
Conflicting edits return 409. If another upload or reviewer action changes the case
while the declaration is being saved, re-read the case before retrying.

#### Upload a document

```http
POST /api/v1/partner/orders/{order_id}/source-of-funds/documents
X-API-Key: <api-key>
Content-Type: multipart/form-data
```

| Part | Required | Notes |
| --- | --- | --- |
| `file` | yes | The bytes. 4096–15,728,640 bytes (15 MiB). |
| `document_type` | yes | A key from `requirements_snapshot`, or from a `requested_documents` entry. An unrecognised key is stored; `satisfies_requirement` is then `false`. |
| `period_start` | no | `YYYY-MM-DD`. The period a statement covers. |
| `period_end` | no | `YYYY-MM-DD`. Must not precede `period_start`. |

Accepted: PDF, JPEG, PNG, HEIC, HEIF, WebP, validated against the file's bytes.
A `bank_statement` must be a bank-issued PDF. Send its file part as
`Content-Type: application/pdf`; do not send a generic binary content type.
The API checks format and size. A reviewer checks the statement's contents.

```json
{
  "success": true,
  "data": {
    "document_id": "0f0f8a41-7b2e-4c19-9f60-1d2a3b4c5d6e",
    "document_type": "bank_statement",
    "file_name": "statement.pdf",
    "size_bytes": 184320,
    "content_type": "application/pdf",
    "satisfies_requirement": true,
    "superseded_count": 0,
    "case_status": "documents_submitted"
  }
}
```

- `content_type` is read from the file's own bytes, not from what the request
  called it.
- `satisfies_requirement`: whether the file's type matches a saved requirement
  or answers a reviewer's open request. It does not mean all required files have
  been received or approved. When `false`, `expected_document_types` lists the
  expected types. Omitted when requirements cannot be determined, including before
  the first declaration.
- `superseded_count` names how many earlier files of the same type this one
  replaced. A superseded file is kept, not deleted. Files stand side by side up
  to the `maximum_files` for their type: send two payslips where the requirement
  asks for two, and both count. Past that ceiling the oldest one gives way.
- `case_status` is the updated review status. Receiving all required files moves
  the case to review; it does not approve it.
- The **same bytes under the same `document_type`** twice answers
  `409 INVALID_STATUS`, with `error.details.code: "duplicate_document"`.
  `error.details.retry_safe: true` means the file is already held and no new
  request for that document is outstanding. This lets an integration recover
  from a lost upload response; re-read the case to determine whether more is needed.
  When `retry_safe` is false, do not count the repeat as answering a new request.

#### What the review decides

| Case `status` | Meaning |
| --- | --- |
| `documents_required` | The declaration or required documents are missing. |
| `documents_submitted` | The required information and files were received; they have not yet been approved. |
| `in_review` | A reviewer has picked it up. |
| `additional_information_required` | A reviewer asked for something else — see `requested_documents`. |
| `resubmitted` | The answer to that request is in. |
| `approved` | Review passed. With consent recorded, Unigox attempts crypto release. |
| `rejected` | Review failed. The order proceeds through escrow refund; read the refund actions. |
| `escalated` | Further review is needed. Wait for an update unless more documents are requested. |

Approval attempts release if consent is already stored. Otherwise, consent
attempts it after approval. Neither response proves blockchain confirmation.

A declaration or an upload is accepted only while the order is still awaiting release and
the case is undecided; outside that window both answer `409 INVALID_STATUS`. The
reads have no such window.

### 5. Follow the payout

Every field below is returned by `GET /api/v1/partner/orders/{order_id}` and on
`GET /api/v1/partner/orders`, on-ramp rows included: on an order that does not
settle T+1, the flag is `false` and T+1 timestamps/windows are `null`.
The current numeric `source_of_funds_threshold_usd` is still returned. Another exception is
`settlement_refund_reason`, which is absent rather than empty when it does not
apply.

| Field | Type | Meaning |
| --- | --- | --- |
| `delayed_settlement` | boolean | Whether this order settles T+1. `false`, not `null`, on an ordinary order. Fixed at creation. |
| `settlement_hours` | integer \| null | The promised window, rounded to the nearest whole hour, never below `1`. `null` on an instant order. |
| `consent_deadline_at` | string \| null | Funding time plus the consent window; after it release is blocked and the expiry process starts the refund flow. Set only while the order is awaiting release, `null` otherwise. |
| `payout_deadline_at` | string \| null | Release time plus the promised window (`settlement_hours` is that window rounded to whole hours). `null` until the crypto has left escrow. |
| `delayed_settlement_crypto_sent_to_provider_at` | string \| null | The crypto left the licensed partner's wallet for the payout provider. **The crypto-refund action is no longer available after this transfer.** |
| `delayed_settlement_fiat_payout_authorized_by_admin_at` | string \| null | Unigox authorised the licensed partner to send the bank payment. Never set before the transfer above. |
| `delayed_settlement_fiat_payout_submitted_by_provider_at` | string \| null | Submission of the bank payment was recorded; this does not confirm payment to the recipient. |
| `delayed_settlement_fiat_paid_to_customer_at` | string \| null | The fiat reached the recipient. **This is the real completion of the order.** |
| `delayed_settlement_fiat_returned_by_bank_at` | string \| null | The bank sent the payout back. Set together with clearing `paid`, `submitted` and `authorized`. |
| `delayed_settlement_crypto_refunded_to_customer_at` | string \| null | The crypto went back to the customer instead. Only reachable while `crypto_sent_to_provider_at` is `null`. |
| `source_of_funds_required` | boolean | Whether review applies by threshold or an existing case. Can stay true after approval or completion; use case status and next_action for required action. Always present. |
| `source_of_funds_threshold_usd` | number | The current configured USD threshold, not a historical snapshot. Always present. |
| `settlement_refund_reason` | string | Why a delayed order ended without a payout. One of the four values below. **Absent**, not empty, when the order has not ended that way or when none of the four applies. |

Two pairs are mutually exclusive: paid **or** returned, and refunded **or** sent
to the provider. A new payment after a return clears
`returned_at` and sets `paid_at`; a return after a payment does the reverse.

#### Why an order ended without a payout

`settlement_refund_reason` distinguishes endings that otherwise all read
`cancelled`:

| Value | Meaning |
| --- | --- |
| `dossier_rejected` | A reviewer refused the source-of-funds case. |
| `consent_window_expired` | The consent was never signed and the window ran out. |
| `not_released_in_time` | Consent was signed, but Unigox did not release the crypto before the deadline. |
| `cancelled_by_customer` | The order was cancelled while awaiting release. |

Those four are the whole set, read in the order above: a refusal outranks an
expired window, which outranks a cancellation.

The key is absent when no reason was recorded, and an absence never stands in for
one of the four.

## Status on a delayed order

Two values are added to the order status enum, both unreachable for an ordinary
order.

| Status | Meaning |
| --- | --- |
| `settlement_in_progress` | Crypto release has started or is confirmed; the order is not yet resolved. This alone does not mean a bank payment was sent. |
| `returned` | The bank sent the payout back and no fresh authorisation stands. The crypto has not been refunded; an operator must arrange another payout attempt. |

**Precedence.** More than one timestamp can be set at once; they are read in this
order:

1. `delayed_settlement_fiat_paid_to_customer_at` set → **`completed`**
2. else `delayed_settlement_crypto_refunded_to_customer_at` set → **`cancelled`**
3. else `delayed_settlement_fiat_returned_by_bank_at` set **and**
   `delayed_settlement_fiat_payout_authorized_by_admin_at` `null` → **`returned`**
4. else, on a release status → **`settlement_in_progress`**
5. before the release, the ordinary mapping applies — a delayed order awaiting release is
   `crypto_received` like any other.

A return with a fresh authorisation on top reads as `settlement_in_progress`
(step 4).

### Filtering the list

`GET /api/v1/partner/orders?status=` accepts both new values. On delayed orders
the four release-bearing filters mean:

| `status=` | Returns |
| --- | --- |
| `completed` | Ordinary released orders, and delayed orders whose fiat actually reached the customer. A released but unpaid delayed order is not here. |
| `settlement_in_progress` | Delayed, with crypto release started or confirmed, and payment or refund not yet complete. |
| `returned` | The bank sent the payout back and nobody has authorised another attempt yet. |
| `cancelled` | Orders that stopped before settlement, as before, **plus** delayed orders whose crypto was refunded after the release. |

For these four values a filter returns exactly the orders whose `status` reports
that value. That does not hold for the status filter in general: several partner
statuses share one internal status, so `?status=crypto_transfer_authorization_pending`
returns rows reporting `awaiting_crypto_transfer_authorization`.

### Timeline

`timeline` gains an entry per mark on a delayed order. An ordinary order's
timeline is unchanged.

| Entry `status` | `description` |
| --- | --- |
| `settlement_in_progress` | `Crypto released to the liquidity provider, ahead of the payout` |
| `settlement_in_progress` | `Crypto transferred to the payout provider` |
| `settlement_in_progress` | `Fiat payout authorized` |
| `settlement_in_progress` | `Fiat payout submitted by the provider` |
| `completed` | `Fiat paid to the customer` |
| `returned` | `Fiat returned by the bank` |
| `cancelled` | `Crypto refunded to the customer` |

The release is **one** entry: consecutive entries with the same status and the
same description are collapsed. Each mark after it keeps its own line.

## Webhooks

`order.status.changed` fires at each mark, on top of the ordinary status events a
delayed order already sends before the release. The partner-facing status continues to reflect payout, bank return and refund records.

The payout after crypto reaches the licensed partner is currently performed manually.
The operator or licensed partner records the payment with its receipt. This records
submission and payment together, so that action emits one `completed` event
containing both timestamps, not an intermediate submission event.

Repeating the same payment report does not create another completion event.
A new payment after a bank return does. Webhook delivery is at least once:
deduplicate by `event_id` and use an order read to confirm the current state.
A released but unpaid order remains `settlement_in_progress`.

These six recorded actions can produce events after release; a combined paid report produces one event as described above. The ordinary ones —
`awaiting_crypto_transfer_authorization`, `crypto_received` and the rest — fire
before it.

| Fires when | `data.status` |
| --- | --- |
| Crypto sent to the payout provider | `settlement_in_progress` |
| Fiat payout authorized | `settlement_in_progress` |
| Fiat payout submitted by the provider | `settlement_in_progress` |
| Fiat paid to the customer | `completed` |
| Bank returned the payout | `returned` |
| Crypto refunded to the customer | `cancelled` |

Every T+1 field on `data` is omitted until it has a value:

- `delayed_settlement` and `settlement_hours` are on **every** event of a delayed
  order, including the ones before the release.
- `payout_deadline_at` appears from the release onwards.
- Each `delayed_settlement_*_at` timestamp appears while it is currently set.
  A bank return clears authorization, submission and paid timestamps. Later events
  can therefore omit fields present in earlier events. Do not merge them into a
  permanently non-null map; re-read the order to reconcile its current state.

An absent timestamp means it is not set in that snapshot (never recorded or cleared); none of them is ever sent as
`null`. `consent_deadline_at` is not carried at all, and neither are
`source_of_funds_required`, `source_of_funds_threshold_usd` or
`settlement_refund_reason` — read those three from the order.

```json
{
  "event_id": "evt_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "event_type": "order.status.changed",
  "created_at": "2026-09-19T08:14:02Z",
  "data": {
    "order_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "status": "settlement_in_progress",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "crypto_amount": "3000",
    "crypto_currency": "USDT",
    "fiat_amount": "21540.00",
    "fiat_currency": "CNY",
    "provider": "licensed",
    "payment_details_id": "987",
    "partner_fee": "30",
    "partner_fee_pct": 1,
    "delayed_settlement": true,
    "settlement_hours": 24,
    "payout_deadline_at": "2026-09-19T12:07:55Z",
    "delayed_settlement_crypto_sent_to_provider_at": "2026-09-19T08:14:02Z"
  }
}
```

On an ordinary order these fields are omitted; `delayed_settlement` is `true` or
absent, never `false`.

A bank return can happen more than once; each is its own event with its own
`event_id`. De-duplicate on `event_id`, not on the mark. No subscription change is
needed.

## Errors

Every endpoint on this page answers in the standard partner envelope.

| `error.code` | Status | When |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | The `X-API-Key` header is missing or names no partner. |
| `INVALID_REQUEST` | 400 | Malformed `order_id`; malformed body; `signature` or `signed_data` missing or blank; `signed_data` is not this order's release transaction; the uploaded file could not be read; the order is an on-ramp order. |
| `ORDER_NOT_FOUND` | 404 | No such order, not yours, or not one whose crypto you hold. On source-of-funds endpoints: the order is not T+1, the case does not exist yet, or the requested category does not exist. A missing case does not prove review is unnecessary. |
| `INVALID_STATUS` | 409 | A consent request concerns an order that is not T+1 or is not funded and awaiting release. On source-of-funds writes: the order is no longer awaiting release, the case is decided, a declaration conflicts with its saved requirements or a concurrent edit, or the same file is already held under that `document_type`. |
| `OPERATION_NOT_ALLOWED` | 409 | The order is under review or held, and no crypto may be moved; the consent has already been given, or its deadline is missing/expired. Refresh the order. |
| `INVALID_REQUEST` | 413 | The file is larger than 15 MiB (15,728,640 bytes). |
| `INVALID_REQUEST` | 415 | The file is not an accepted format, its bytes disagree with its content type, or a `bank_statement` was sent as something other than a bank-issued PDF. `error.details.allowed` lists what may be sent. |
| `INVALID_REQUEST` | 422 | A declaration field is missing, unknown or over length; `document_type` or `file` missing; a period is not `YYYY-MM-DD` or ends before it starts; the file is empty or under 4096 bytes. |
| `TRANSACTOR_ERROR` | 502 | The escrow service refused the consent signature or was unreachable. Verify `signer_address`, then retry. |
| `INTERNAL_ERROR` | 500 / 502 / 503 | `502` when document storage failed. `503` when the source-of-funds service or document storage is unavailable. `500` for another server failure. Read the case before retrying an upload: an error does not prove nothing was stored. |

413, 415 and 422 share `INVALID_REQUEST`; branch on the status.

After a consent timeout or 502, read the order first. If it still requests a
signature, fetch fresh consent parameters. A 409 may mean consent was saved, state
changed, a hold applies, or the deadline expired: inspect the error and order;
do not treat every 409 as success. After an uncertain upload, read the document
list before sending identical bytes again. A failure response is not proof that
nothing was stored.
