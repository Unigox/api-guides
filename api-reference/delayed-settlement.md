# Delayed settlement (T+1)

On an ordinary off-ramp order the crypto stays locked until your customer's bank
payment has been confirmed. On a **delayed settlement** order the two sides swap
places: once you sign a release, the crypto leaves the lock first, and the bank
payment follows within a fixed window, usually 24 hours. Larger amounts on some
corridors are only available this way.

This page tells you how to spot such an order, what you have to do differently,
and how to follow the payment to the end.

## The words on this page

- **You** are the business integrating this API. **Your customer** is the person
  selling crypto and receiving the bank payment.
- The **escrow** is the wallet that holds the crypto while an order is open. It
  needs two signatures to move the crypto: yours and Unigox's.
- The **licensed partner** is the regulated business on the other side of the
  order. It buys the crypto and arranges the bank payment to your customer. In
  timeline entries it is called the liquidity provider.
- The **payout provider** is the payment service the licensed partner sends the
  bank payment through.
- The **release** is the moment the crypto leaves the escrow for the licensed
  partner. Your **consent** is the signature that allows it.
- **Source of funds** is your customer's explanation of where the money came
  from, with documents. It is only asked for on large orders.

All endpoints here take `X-API-Key`. `{order_id}` is the order's UUID, not the
numeric trade ID. The [OpenAPI specification](../openapi/swagger.yaml) has the
full schemas.

## What changes for you

Three things, and only on orders that are delayed:

1. **Show the window before the customer commits.** The quote tells you the order
   will settle T+1 and how many hours the window is.
2. **Sign the release once the escrow is funded.** Two calls: fetch what to sign,
   post the signature. Without it nothing moves.
3. **On large orders, collect the source of funds.** Above the threshold your
   customer's explanation and documents must be approved before the release.

Everything else, from the quote to funding the escrow, cancelling and refunding,
works exactly as on any other off-ramp order. After the release you only watch:
the status, a few timestamps and the webhooks tell you when the money arrived.

## When an order is delayed

An order is delayed when all three hold:

- **No instant offer covers the amount.** An instant offer that covers it always
  wins, whatever its rate. Delayed offers are considered only when none does,
  which in practice means the amount is above the corridor's instant ceiling.
- **You hold the crypto.** Orders your customers create in the embedded widget
  are never delayed, because there the wallet is theirs.
- **The matched licensed partner offers T+1.**

There is no parameter to ask for or refuse a delayed order. Show the window and
let the customer decide: they can create the order, or ask for a new quote for a
different amount.

## Step 1: the quote

```http
POST /api/v1/partner/offramp/quote
X-API-Key: <api-key>
Content-Type: application/json
```

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
| `settlement_hours` | integer \| null | The payment window, counted from the release, not from now. Whole hours, never below `1`. `null` on an instant quote. |

`POST /api/v1/partner/offramp/estimate` reports the same two fields, so you can
find where a corridor stops settling instantly without spending quotes. Its
amounts are indicative; the matched offer can change by the time you quote.

## Step 2: create and fund the order

`POST /api/v1/partner/offramp/initiate` and the funding pair
(`transfer-authorization-parameters`, then `authorize-crypto-transfer`) are the
same as on any off-ramp order. Read `delayed_settlement` and `settlement_hours`
from `GET /api/v1/partner/orders/{order_id}` from the moment the order exists;
the responses of `initiate` and `authorize-crypto-transfer` do not carry them.

The licensed partner's capacity is reserved when the order is created, before
the escrow is funded. Cancelling the order, or letting the funding window expire,
frees it again.

Until the escrow is funded you can cancel as usual:
`POST /api/v1/partner/orders/{order_id}/cancel` answers `cancelled` at once and
`settlement_refund_reason` reads `cancelled_by_customer`.

The licensed partner can decline a funded order until you sign the release. The
order then reads `cancelled`, `settlement_refund_reason` reads
`cancelled_by_licensed_partner`, and the crypto comes back through the usual
refund. Once you have signed, it can no longer decline.

## Step 3: read what the order is waiting for

A funded delayed order stays at `crypto_received`, the same status an ordinary
order has while its buyer has not paid yet. `next_action` tells the two apart:

| `next_action` | What it means | `allowed_actions` |
| --- | --- | --- |
| `sign_settlement_consent` | Your release signature is needed. | `["settlement-consent", "cancel"]` |
| `submit_source_of_funds` | Your signature is in. The order needs the customer's source of funds, and it is not complete. | `[]` |
| `await_review` | Nothing for you to do: Unigox is reviewing documents, or your signature is in and the release has not gone through yet. Do not sign again. | `[]` |
| absent | Read `status` and `allowed_actions`: the order is moving, held, finished, or waiting for a refund signature (`authorize-refund`). | Depends on the state. |

`settlement-consent` and `cancel` appear only on orders whose crypto you hold.
`confirm-fiat-received` never appears on a delayed order and the endpoint refuses
one: there is no fiat to confirm before the release.

`cancel` is offered while the order is waiting for your signature. On a funded
order it starts a refund: follow `authorize-refund` when the order asks for it.
`cancelled` on its own does not mean the crypto is back in your wallet. Once you
have signed, both actions disappear.

The actions describe the order as it was when you read it. An action endpoint
checks again and answers `409` if the state has changed. Once
`consent_deadline_at` has passed, the order stops asking for a signature even if
its status has not moved yet. Do not keep retrying an action from an old read.

## Step 4: sign the release

### Fetch what to sign

```http
GET /api/v1/partner/orders/{order_id}/settlement-consent-parameters
X-API-Key: <api-key>
```

`data` contains:

| Fields | Meaning |
| --- | --- |
| `order_id`, `status` | The order and its current status. |
| `escrow_address` | The wallet holding the crypto. |
| `signer_address` | Your wallet. This is the key that must sign. |
| `recipient_address` | The licensed partner's wallet, where the crypto goes. Check it before signing. |
| `amount_human`, `crypto_currency`, `crypto_decimals` | What the licensed partner receives after the platform fee, as a decimal string, with the currency and token precision. |
| `direction` | Always `to_buyer`: the licensed partner is buying the crypto. |
| `tx_hash` | The hash of the release transaction. Not a broadcast transaction and not proof of anything yet. |
| `safe_params`, `domain`, `types` | The complete EIP-712 payload. Use it exactly as returned. |
| `settlement_hours`, `consent_deadline_at` | The payment window, and the UTC deadline for your signature. |
| `authorization_path` | Where to post the signature. |

Sign with `primaryType: "SafeTx"`, the returned `domain` and `types`, and
`message: safe_params`. `SafeTx` has ten fields: `to`, `value`, `data`,
`operation`, `safeTxGas`, `baseGas`, `gasPrice`, `gasToken`, `refundReceiver`,
`nonce`. Do not rebuild the transaction yourself, do not sign only its calldata,
and do not hard-code a chain ID. The shape is the same as
`refund-authorization-parameters`; the differences are `direction` (`to_buyer`
instead of `to_seller`), the presence of `tx_hash`, and the two window fields.

Both calls check that the order is yours, that you hold its crypto, that it is
delayed, funded and waiting for a signature, that it is not on hold, and that the
deadline has not passed. The state can change between the two calls.

`consent_deadline_at` is the funding time plus the signing window, currently
72 hours. After it, no signature is accepted and the order moves to a refund.

### Post the signature

```http
POST /api/v1/partner/orders/{order_id}/settlement-consent
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "signature": "<hex signature over the returned typed data>",
  "signed_data": "<safe_params.data or tx_hash from the same GET>"
}
```

Both fields are required. `signed_data` may be either `safe_params.data` (the
release calldata) or `tx_hash`; both are compared case-insensitively, with any
surrounding quotes removed. Anything else answers `400 INVALID_REQUEST`. A
signature that does not recover to `signer_address` over this release also
answers `400 INVALID_REQUEST`: sign again with the wallet that funded the order,
because retrying the same signature cannot succeed. Never send a private key.

```json
{
  "success": true,
  "data": {
    "order_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "status": "settlement_in_progress",
    "consent_signed": true,
    "release_started": true
  }
}
```

A `200` means the signature is stored. It does not mean the crypto has moved or
that anyone has been paid. `release_started: true` means the release has started
or is already confirmed; `status` then reads `settlement_in_progress`. `false`
means the release did not start on this call: the order still needs a source of
funds review (`next_action: "submit_source_of_funds"`), the release is held, or a
cancellation or refund went through first. Read the returned `status` and refresh
the order. `payout_deadline_at` appears only once the release is confirmed.

Unigox adds its own signature and releases the crypto automatically as soon as
your consent and any required approval are both in, whichever comes second. If
the release fails on Unigox's side, your signature stays stored; do not sign
again, Unigox resolves it.

A signature is stored once. A second `POST` answers `409`:
`OPERATION_NOT_ALLOWED` while the order is still waiting for the release,
`INVALID_STATUS` once the release has started.

## Step 5: source of funds, on large orders

An order worth **USD 50,000** or more needs the customer's explanation and
documents approved before the release. The figure can change, so read it from
the order: `source_of_funds_threshold_usd` is the threshold in force now, and
`source_of_funds_required` says whether it applies to this order. The value of
the order is its fiat amount at the stored USD rate, or, when that is not
available, its crypto amount at the stored USD rate. An order whose value cannot
be computed is treated as above the threshold. An order that already has a case
keeps needing approval even if the threshold is later raised above its value.

`source_of_funds_required` can stay `true` after approval and after completion;
use `next_action` and the case `status` to know whether anything is still needed.

Below the threshold, and with no existing case, the three case endpoints
(`source-of-funds`, `.../declaration`, `.../documents`) answer
`404 ORDER_NOT_FOUND`. The requirements catalogue still answers for any delayed
order of yours.

The case is normally opened when the escrow is funded. A `404` can also mean it
has not been opened yet. If `source_of_funds_required` is `true`, keep the order
waiting and read it again; contact support if the case never appears.

Your customer answers on your screens; you post the answers here.

### Read the case

```http
GET /api/v1/partner/orders/{order_id}/source-of-funds
X-API-Key: <api-key>
```

`data` holds `trade_id`, `delayed_settlement`, `case_id`, `status`, `consent`
(`signed` and a nullable `signed_at`), `threshold_usd`, `usd_equivalent`,
`source_of_funds` (whether it applies, and the case summary), `declaration`,
`documents`, `requested_documents`, optional `requirements_snapshot`, nullable
`decided_at`, `rejection_reason_code` and `created_at`. Dates are RFC 3339. Use
the IDs as returned. Document metadata does not give access to the file itself.

`requested_at` and `request_expires_at` are the timestamps of the last request a
reviewer made. They stay after the request has been answered; use
`requested_documents` and the case `status` to know whether the customer still
owes something.

`404 ORDER_NOT_FOUND`: no case yet, not your order, or its crypto is not yours.
An on-ramp order answers `400 INVALID_REQUEST`. A decided case still answers.

### The requirements catalogue

Build your form from the catalogue until the first declaration fixes the case's
own requirements:

```http
GET /api/v1/partner/orders/{order_id}/source-of-funds/requirements
X-API-Key: <api-key>
```

The result has a `revision` and a list of `categories`. Each category carries
its code, label, whether an explanation is required, the bank statement policy,
the base documents and the document groups. Build the form from these instead of
hard-coding a document list. `?source_of_funds=salary` narrows it to one
category; an unknown code answers `404 ORDER_NOT_FOUND`. Field names here are
`camelCase`. `requiresAddressScreening` is `true` on `crypto_assets`, where
`source_wallet_address` is required. Categories marked `"legacy": true` are
refused by the declaration endpoint; do not offer them. To cache, compare each
category's own `revision`: the top-level `revision` is the highest of them and
does not change when a lower one does.

`requirements_snapshot` on the case is what was saved when the first declaration
was accepted. Its shape differs from the catalogue. Once it exists, use it to
decide which files to ask for; later catalogue changes do not affect this case.

- `documents[].mode` is `one_of` (the customer picks one document type in the
  group) or `all_of` (every listed type is required). Either way send at least
  `minimum_files[type]` files; choosing payslips, for example, can require two.
- `documents[].documents` lists the `document_type` keys to upload under.
- `minimum_files` and `maximum_files` have an entry for every key in the group,
  both `1` unless the catalogue asks for several; a document that allows several
  files with no published ceiling has `maximum_files` `10`.
- `requires_statement`, `statement_months`, `statement_max_months` (when a
  category publishes one) and `statement_max_age_days` describe the personal
  bank statement (`bank_statement`), required for every category except
  `crypto_assets`.
- `requested_documents` is what a reviewer asked for on top, open requests only.
  Each entry has `document_type`, `label`, `reason`, `requested_at`, `satisfied`
  and, when the document has its own format or time rule, a `policy`.
- `review_checks` is always `[]`; the reviewer's checklist is internal.

For a requested bank statement, `policy.accepted_content_types` is
`["application/pdf"]`, `policy.statement.minimum_months` is `3` and
`policy.statement.maximum_age_days` is `31`. Show these to the customer. A file
you uploaded before the request was made does not answer it; upload a new one. A
successful upload means the file is stored, not that it has been approved.

Upload under the keys in the snapshot. If a key does not match, the upload
response lists `expected_document_types`.

### Submit the declaration

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

The answer is the whole case, in the shape above.

| Field | Required | Notes |
| --- | --- | --- |
| `source_of_funds` | yes | One of `salary`, `business_income`, `sale_of_property`, `investment`, `crypto_assets`, `inheritance`, `gift`, `family_support`, `loan`, `savings`, `other`. |
| `explanation` | yes | The customer's own words; not blank. Up to 4000 UTF-8 bytes. |
| `source_wallet_address` | for `crypto_assets` | Up to 256 UTF-8 bytes. |
| `source_wallet_network` | no | Up to 64 UTF-8 bytes. |
| `additional_sources` | no | Only codes already on the case; a new one is refused. |
| `funds_flow_description` | no | Up to 4000 UTF-8 bytes. |
| `purpose_of_payment` | no | Up to 4000 UTF-8 bytes. |
| `sender_recipient_relationship` | no | Up to 4000 UTF-8 bytes. |

The server computes `catalogue_revision` and the document requirements; they
are never read from the request. The first declaration fixes the requirements.
Later edits keep them, with their original date and revision; the declared
source and any saved additional sources cannot be changed or removed. An edit
that conflicts with the saved requirements, or with a concurrent upload or
reviewer action, answers `409`; read the case again before retrying.

### Upload a document

```http
POST /api/v1/partner/orders/{order_id}/source-of-funds/documents
X-API-Key: <api-key>
Content-Type: multipart/form-data
```

| Part | Required | Notes |
| --- | --- | --- |
| `file` | yes | The bytes: 4,096 to 15,728,640 (15 MiB). |
| `document_type` | yes | A key from `requirements_snapshot` or from a `requested_documents` entry. An unknown key is stored, with `satisfies_requirement` `false`. |
| `period_start` | no | `YYYY-MM-DD`. The period a statement covers. |
| `period_end` | no | `YYYY-MM-DD`. Not before `period_start`. |

Accepted: PDF, JPEG, PNG, HEIC, HEIF, WebP, checked against the file's bytes. The
file part's `Content-Type` may name one of these, or be absent or
`application/octet-stream`; the file name's extension then decides, and the bytes
are checked either way. Any other declared type answers `415`. A `bank_statement`
must be a bank-issued PDF. The API checks format and size; a reviewer checks the
contents. A long file name is shortened when it is stored.

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

- `content_type` is read from the bytes, not from the request.
- `satisfies_requirement` says whether the file's type matches a saved
  requirement or answers an open reviewer request. It does not mean every
  required file is in, or approved. When `false`, `expected_document_types`
  lists what was expected. Omitted when the requirements are not known yet,
  for example before the first declaration.
- `superseded_count` is how many earlier files of the same type this one
  replaced. Replaced files are kept, not deleted. Files stand side by side up to
  `maximum_files` for their type: two payslips where two are required both
  count. Past the ceiling, the oldest one gives way.
- `case_status` is the updated review status. Receiving every required file
  moves the case into review; it does not approve it.
- The **same bytes under the same `document_type`** twice answers
  `409 INVALID_STATUS` with `error.details.code: "duplicate_document"`.
  `error.details.retry_safe: true` means the file is already held and no request
  for that document is open, so a lost upload response can be recovered from;
  read the case to see whether more is needed. When `retry_safe` is `false`, do
  not count the repeat as answering a new request.

### What the review decides

| Case `status` | Meaning |
| --- | --- |
| `documents_required` | The declaration or required documents are missing. |
| `documents_submitted` | Everything required is in; nothing is approved yet. |
| `in_review` | A reviewer has picked the case up. |
| `additional_information_required` | The reviewer asked for something more; see `requested_documents`. |
| `resubmitted` | The answer to that request is in. |
| `approved` | Review passed. With your signature stored, Unigox releases the crypto. |
| `rejected` | Review failed. The order goes to a refund; read the refund actions on the order. |
| `escalated` | Further review is needed. Wait, unless more documents are requested. |

Approval triggers the release if your signature is already stored; otherwise
your signature triggers it after the approval. Neither response is proof that
the transaction has confirmed on chain.

A declaration or an upload is accepted only while the order is still waiting for
the release and the case is undecided; outside that window both answer
`409 INVALID_STATUS`. Reads have no such window, except that before a liquidity
provider has accepted the order every source of funds endpoint answers
`409 INVALID_STATUS`: there is no case to read yet.

## Step 6: follow the payment

After the release the order reads `settlement_in_progress` and the rest happens
on Unigox's and the licensed partner's side. Each step stamps a timestamp on the
order and sends a webhook:

1. **The crypto reaches the payout provider.** The licensed partner moves it
   from its wallet; Unigox records it as `delayed_settlement_crypto_sent_to_provider_at`.
   From this moment a refund of the crypto is no longer possible.
2. **Unigox approves the payment:** `delayed_settlement_fiat_payout_authorized_by_admin_at`.
3. **The payment is sent.** Approval does not send it by itself. Where the
   licensed partner is connected to a payout provider, Unigox or the licensed
   partner then sends it through that provider, and
   `delayed_settlement_fiat_payout_submitted_by_provider_at` is stamped when the
   provider accepts it. Where the licensed partner pays by hand, it records the
   payment with its receipt; submitted and paid are then stamped together.
4. **The money arrives:** `delayed_settlement_fiat_paid_to_customer_at`. The
   order reads `completed`. This is the real end of a delayed order.

Two things can go wrong after the release:

- **The payment does not go through.** The bank sends it back, or the payout
  provider cancels the attempt before it went out. The order reads `returned`,
  `delayed_settlement_fiat_returned_by_bank_at` is set, and the approval and
  submission timestamps are cleared. The crypto is not refunded. Unigox approves
  a new attempt: the order goes back to `settlement_in_progress`, keeps
  `returned_at` until the new payment arrives, and then reads `completed` with
  `returned_at` cleared. This can happen more than once.
- **The crypto goes back** instead of being paid out, which is possible only
  while step 1 has not happened. It goes to the wallet that funded the escrow,
  which on an order whose crypto you hold is yours. The order reads `cancelled`
  with `delayed_settlement_crypto_refunded_to_customer_at` set.

Nothing happens on its own when `payout_deadline_at` passes: the status does not
change and no event is sent. Unigox follows the payment up; contact support if
you need an answer for your customer.

A return that the payout provider reports after the money was already recorded
as paid does not change the order; Unigox keeps it on file. Only an operator
correcting the record can clear `paid_at` and set `returned_at`.

### The fields on the order

Every field below is on `GET /api/v1/partner/orders/{order_id}` and on every row
of `GET /api/v1/partner/orders`, on-ramp rows included. On an order that does not
settle T+1 the flag is `false` and the windows and timestamps are `null`;
`source_of_funds_threshold_usd` is still returned. `settlement_refund_reason` is
the one exception: it is absent, not empty, when it does not apply.

| Field | Type | Meaning |
| --- | --- | --- |
| `delayed_settlement` | boolean | Whether this order settles T+1. `false`, not `null`, on an ordinary order. Fixed when the order is created. |
| `settlement_hours` | integer \| null | The promised window in whole hours, never below `1`. `null` on an instant order. |
| `consent_deadline_at` | string \| null | Funding time plus the signing window. After it the release is blocked and the order moves to a refund. Set while the crypto is in escrow, including after your signature while a source of funds review is open: the review must also finish by then. `null` once the crypto has left the escrow or the order has ended. |
| `payout_deadline_at` | string \| null | Release time plus the promised window. `null` until the crypto has left the escrow. |
| `delayed_settlement_crypto_sent_to_provider_at` | string \| null | The crypto reached the payout provider. **No refund of the crypto is possible after this.** |
| `delayed_settlement_fiat_payout_authorized_by_admin_at` | string \| null | Unigox approved the bank payment. Never set before the one above. |
| `delayed_settlement_fiat_payout_submitted_by_provider_at` | string \| null | The payment was sent. Not yet confirmation that it arrived. |
| `delayed_settlement_fiat_paid_to_customer_at` | string \| null | The money reached your customer. **This is the real completion of the order.** |
| `delayed_settlement_fiat_returned_by_bank_at` | string \| null | The payment did not go through and came back. Set together with clearing the approval, submission and paid timestamps. |
| `delayed_settlement_crypto_refunded_to_customer_at` | string \| null | The crypto went back to the wallet that funded the escrow instead: yours, on an order whose crypto you hold. Only possible while `crypto_sent_to_provider_at` is `null`. |
| `source_of_funds_required` | boolean | Whether a source of funds review applies, by threshold or because a case exists. Can stay `true` after approval and completion. Always present. |
| `source_of_funds_threshold_usd` | number | The threshold in force now, not the one saved with the order. Always present. |
| `settlement_refund_reason` | string | Why a delayed order ended without a payment. One of the five values below. **Absent** when the order did not end that way. |

Two pairs never hold at once: paid and returned, and refunded and sent to the
provider. A new payment after a return clears `returned_at` and sets `paid_at`.

### Why an order ended without a payment

`settlement_refund_reason` tells apart endings that all read `cancelled`:

| Value | Meaning |
| --- | --- |
| `dossier_rejected` | A reviewer refused the source of funds. |
| `consent_window_expired` | The release was never signed and the window ran out. |
| `not_released_in_time` | The release was signed, but Unigox did not release the crypto before the deadline. |
| `cancelled_by_customer` | The order was cancelled on your side before the release. |
| `cancelled_by_licensed_partner` | The licensed partner declined the order before your signature. |

These five are the whole set, read in that order: a refusal outranks an expired
window, which outranks a cancellation. When none was recorded the key is absent,
and an absent key never stands for one of the five.

### The two extra statuses

| Status | Meaning |
| --- | --- |
| `settlement_in_progress` | The release has started or is confirmed, and the order is not finished. On its own it does not mean a payment has been sent. |
| `returned` | The last payment attempt did not go through, and no new attempt has been approved yet. The crypto is not refunded; Unigox will approve another attempt. |

When several timestamps are set, the status is read in this order:

1. `delayed_settlement_fiat_paid_to_customer_at` set: **`completed`**
2. else `delayed_settlement_crypto_refunded_to_customer_at` set: **`cancelled`**
3. else `delayed_settlement_fiat_returned_by_bank_at` set and
   `delayed_settlement_fiat_payout_authorized_by_admin_at` `null`: **`returned`**
4. else, once released: **`settlement_in_progress`**
5. before the release, the ordinary statuses apply: a funded delayed order waiting
   for your signature is `crypto_received` like any other.

A return with a fresh approval on top reads `settlement_in_progress` (rule 4).

### Filtering the list

`GET /api/v1/partner/orders?status=` accepts both new values. For delayed orders
the four release-related filters mean:

| `status=` | Returns |
| --- | --- |
| `completed` | Ordinary released orders, and delayed orders whose money reached the customer. A released but unpaid delayed order is not here. |
| `settlement_in_progress` | Delayed orders whose release has started or is confirmed, with neither payment nor refund complete. |
| `returned` | The last payment attempt came back and no new attempt is approved yet. |
| `cancelled` | Orders that stopped before the release, as before, plus delayed orders whose crypto was refunded after it. |

For these four values a filter returns exactly the orders whose `status` reports
that value. That does not hold for every filter: several partner statuses share
one internal status, so `?status=crypto_transfer_authorization_pending` returns
rows that report `awaiting_crypto_transfer_authorization`.

### The timeline

`timeline` gains one entry per step on a delayed order. An ordinary order's
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

The release is one entry: consecutive entries with the same status and the same
description are collapsed. Every later step keeps its own line. Before the
release, a cancelled delayed order shows one `cancelled` entry, like an ordinary
order.

When a payment came back and was sent again, every attempt stays on the
timeline, and the approval, sending and return entries end in `(attempt N)`,
for example `Fiat payout authorized (attempt 2)`. The order's timestamps hold
only the current attempt; the timeline holds all of them.

## Webhooks

`order.status.changed` fires at every step after the release, on top of the
ordinary events a delayed order sends before it (`awaiting_crypto_transfer_authorization`,
`crypto_received`, and `settlement_in_progress` for the release itself).

| Fires when | `data.status` |
| --- | --- |
| The crypto reached the payout provider | `settlement_in_progress` |
| Unigox approved the payment | `settlement_in_progress` |
| The payment was sent | `settlement_in_progress` |
| The money reached the customer | `completed` |
| The payment came back | `returned` |
| The crypto was refunded | `cancelled` |

An order that ends before the release and needs your refund signature also
sends `order.refund.required`, once, with the same `action_required` block the
order carries. Follow it with `authorize-refund`.

`data.provider` is `p2p` on every delayed order: the licensed partner takes part
as a P2P liquidity provider. For the same reason `provider_scope=licensed_only`
does not match a T+1 offer.

A payment recorded by hand with a receipt stamps submitted and paid together and
sends one `completed` event with both timestamps. A repeat of the same report
does not send another one. A new payment after a return does. Delivery is at
least once: deduplicate on `event_id`, and read the order when you need the
current state. A released but unpaid order stays `settlement_in_progress`.

T+1 fields on `data` are omitted until they have a value; none is ever sent as
`null`:

- `delayed_settlement` and `settlement_hours` are on every event of a delayed
  order, including the ones before the release.
- `payout_deadline_at` appears from the release onwards.
- Each `delayed_settlement_*_at` timestamp appears while it is set. A return
  clears the approval, submission and paid timestamps, so a later event can omit
  fields an earlier one carried. Do not merge events into a map that only grows;
  read the order to reconcile.
- `consent_deadline_at`, `source_of_funds_required`,
  `source_of_funds_threshold_usd` and `settlement_refund_reason` are never in a
  webhook; read them from the order.

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
    "provider": "p2p",
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
absent, never `false`. A return can happen more than once; each is its own event
with its own `event_id`. No subscription change is needed.

## Errors

Every endpoint on this page answers in the standard partner envelope.

| `error.code` | Status | When |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | `X-API-Key` is missing or names no partner. |
| `INVALID_REQUEST` | 400 | Malformed `order_id` or body; `signature` or `signed_data` missing or blank; `signed_data` is not this order's release transaction; the signature does not recover to `signer_address` over it; the uploaded file could not be read; the order is an on-ramp order. |
| `ORDER_NOT_FOUND` | 404 | No such order, not yours, or not one whose crypto you hold. On source of funds endpoints: the order is not delayed, the case does not exist yet, or the category does not exist. A missing case does not prove the review is unnecessary. |
| `INVALID_STATUS` | 409 | A consent call on an order that is not delayed, not funded, or no longer waiting for the release. On source of funds endpoints: no liquidity provider has accepted the order yet. On source of funds writes: the order is past the release, the case is decided, the declaration conflicts with its saved requirements or a concurrent edit, or the same file is already held under that `document_type`. |
| `OPERATION_NOT_ALLOWED` | 409 | The order is on hold and no crypto may move; the signature is already stored; or its deadline is missing or has passed. Read the order. |
| `INVALID_REQUEST` | 413 | The file is larger than 15 MiB (15,728,640 bytes). |
| `INVALID_REQUEST` | 415 | The file is not an accepted format, its bytes do not match its content type, or a `bank_statement` is not a bank-issued PDF. `error.details.allowed` lists what is accepted. |
| `INVALID_REQUEST` | 422 | A declaration field is missing, unknown or over 4,000 bytes of UTF-8; `document_type` or `file` is missing; a period is not `YYYY-MM-DD` or ends before it starts; the file is empty or under 4,096 bytes. |
| `TRANSACTOR_ERROR` | 502 | The escrow service could not be reached or failed. Read the order, then retry the same signature. |
| `INTERNAL_ERROR` | 500 / 502 / 503 | `502` when document storage failed; `503` when the source of funds service or document storage is unavailable; `500` for any other server failure. Read the case before retrying an upload: an error does not prove nothing was stored. |

413, 415 and 422 share `INVALID_REQUEST`; branch on the HTTP status.

After a timeout or a `502` on the consent call, read the order first. If it still
asks for a signature, fetch fresh parameters and sign again. A `409` can mean the
signature was saved, the state changed, the order is on hold, or the deadline
passed: read the error and the order rather than treating every `409` as
success. After an uncertain upload, read the document list before sending the
same bytes again.
