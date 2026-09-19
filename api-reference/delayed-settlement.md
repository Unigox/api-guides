# Delayed settlement (T+1)

Some off-ramp quotes come back as **delayed settlement**: the crypto leaves
escrow on your own release signature, and the fiat reaches the recipient within
`settlement_hours` afterwards, instead of both legs completing together.

Nothing activates it. It is a property of the liquidity that matched, not of your
account, so read the flag on every quote.

## When a quote is delayed

Three conditions, all of them ours rather than yours:

- **No instant offer covers the amount.** An instant offer that covers it always
  wins, whatever its rate. Delayed offers are considered only when none does —
  typically above a provider's instant ceiling.
- **You hold the crypto.** Never a widget order, where the wallet belongs to your
  customer and nobody on this API can sign the release.
- **The matched vendor settles this way.** It is a property of their offer.

You cannot request delayed settlement and cannot decline it for a given amount.
Read the flag, show it, and initiate or re-quote for a smaller amount.

## The quote

```http
POST /api/v1/partner/offramp/quote
X-API-Key: <api-key>
Content-Type: application/json
```

The response carries two new fields:

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
| `delayed_settlement` | boolean | `true` when this quote would open a delayed order. **Always present**, so a client can tell "this build does not know about T+1" from "this quote is not T+1". |
| `settlement_hours` | integer \| null | The payout window, counted from the release — not from now. Rounded to the nearest whole hour, never below `1`. `null` on an instant quote. |

There is no second endpoint that reveals this later: by then the order is open.

`POST /api/v1/partner/offramp/estimate` reports the same two fields, so you can find where a corridor
stops settling instantly without burning quotes. It is indicative about the numbers, not about the
class: the price may move before the quote, but a T+1 estimate does not become an instant order.

`POST /api/v1/partner/offramp/initiate` and the escrow funding pair
(`transfer-authorization-parameters` → `authorize-crypto-transfer`) are
unchanged. The order behaves like any other until the escrow is funded.

## End-to-end flow

1. Quote. If `delayed_settlement` is `true`, show `settlement_hours` before the
   customer commits.
2. Initiate and fund the escrow, as on any off-ramp order.
3. The order parks at `crypto_received` with
   `next_action: "sign_settlement_consent"`.
4. Sign the release:
   `GET /api/v1/partner/orders/{order_id}/settlement-consent-parameters`, then
   `POST /api/v1/partner/orders/{order_id}/settlement-consent`.
5. If the order is at or above the source-of-funds threshold, supply the dossier
   and wait for the review. Below it, the crypto goes as soon as the consent
   lands.
6. Follow the payout on `status`, the six timestamps, and the webhooks.

### 1. Read what the order is waiting for

A parked delayed order is `crypto_received`, exactly like an instant one whose
buyer has not paid yet. `next_action` is what tells them apart:

| `next_action` | What is owed | `allowed_actions` |
| --- | --- | --- |
| `sign_settlement_consent` | Nobody has signed the release yet. | `["settlement-consent", "cancel"]` |
| `submit_source_of_funds` | The consent is in; this order needs a dossier and it is not complete. | `[]` |
| `await_review` | Everything owed has been supplied. A reviewer decides; there is nothing to call. | `[]` |
| absent | The order is held for review, or a payout of yours failed and its escrow refund is in flight. Both consent endpoints answer `409 OPERATION_NOT_ALLOWED`. | not rewritten: `["confirm-fiat-received"]`, which this order does not take either |

The list is rewritten only on an order whose crypto you hold.
`confirm-fiat-received` is **removed**: the endpoint behind it refuses a delayed
order, the fiat not having been paid.

**`cancel` is the one you would not otherwise find.** A parked delayed order is
the only funded state any order can be cancelled from; every other funded order
answers "cannot be cancelled". `POST /api/v1/partner/orders/{order_id}/cancel` is
the ordinary endpoint, unchanged — it refunds the escrow to you while the crypto
is still in it. Both actions are withdrawn the moment the consent is signed. The
cancel loses that race in the database rather than in a check, so calling it
against an order that is already releasing cannot half-cancel it.

`GET /api/v1/partner/orders` and `GET /api/v1/partner/orders/{order_id}` compute
both fields identically. If either lookup behind the hint fails, both fall back to
`sign_settlement_consent` and leave `settlement-consent` advertised — the safe
direction: being asked again for a signature you have given costs a refused POST,
while `await_review` on an order nobody signed waits forever.

### 2. Get the consent parameters

```http
GET /api/v1/partner/orders/{order_id}/settlement-consent-parameters
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "order_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "status": "crypto_received",
    "escrow_address": "0x9f8eF448C2c0694383B848e32D4d2857eBAEdB94",
    "signer_address": "0xd1c06c202D613594189d119Cad36E2D777b02071",
    "recipient_address": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
    "amount_human": "3000.000000",
    "crypto_currency": "USDT",
    "crypto_decimals": 6,
    "direction": "to_buyer",
    "tx_hash": "0x4c8f9b2a7e1d05c3ab84f6d29e7c1130bb5a4f8e6c2d9017a3b5e8f1c4d70a9d1",
    "safe_params": {
      "to": "0x2222222222222222222222222222222222222222",
      "value": "0",
      "data": "0xa9059cbb000000000000000000000000...",
      "operation": 0,
      "safeTxGas": "0",
      "baseGas": "0",
      "gasPrice": "0",
      "gasToken": "0x0000000000000000000000000000000000000000",
      "refundReceiver": "0x0000000000000000000000000000000000000000",
      "nonce": "0"
    },
    "domain": {
      "chainId": 660279,
      "verifyingContract": "0x9f8eF448C2c0694383B848e32D4d2857eBAEdB94"
    },
    "types": {
      "SafeTx": [
        { "name": "to", "type": "address" },
        { "name": "value", "type": "uint256" }
      ]
    },
    "settlement_hours": 24,
    "consent_deadline_at": "2026-09-21T11:58:30Z",
    "authorization_path": "/api/v1/partner/orders/b2c3d4e5-f6a7-8901-bcde-f12345678901/settlement-consent"
  }
}
```

Same shape as `refund-authorization-parameters`, with three differences:
`direction` is `to_buyer` rather than `to_seller`, `tx_hash` is present, and
`settlement_hours` and `consent_deadline_at` are echoed beside the payload,
signing being the moment the promise is accepted and the moment it stops being
available. `payout_deadline_at` is not here: it is measured from the release,
which has not happened. It appears on the order payload from the moment there is
one.

The escrow is a 2-of-3 Safe whose seller-side owner is *your* wallet — your
customer holds no key. `signer_address` names it; sign with that key and no other.

`recipient_address` is read from the escrow on the server: the vendor providing
the fiat. It and `amount_human` — what that vendor receives, after the platform
fee is split off by the same release — are returned so you can verify both before
signing. No parameter changes either.

This GET runs the same gate as the POST.

### 3. Submit the signature

```http
POST /api/v1/partner/orders/{order_id}/settlement-consent
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "signature": "0xabc123...",
  "signed_data": "0xa9059cbb000000000000000000000000..."
}
```

**Both fields are required**, which is where this differs from
`authorize-refund`: only the artefact you signed distinguishes "send the crypto
to the vendor" from "send it back to me", and storing a refund signature as a
consent would release an order somebody was trying to unwind.

Two artefacts identify the same release, and either is accepted as `signed_data`:
**`safe_params.data`** — the calldata, which is what our own clients send and what
the escrow files the signature under — or **`tx_hash`**. Both are compared
case-insensitively and with surrounding quotes stripped; anything else answers
`400 INVALID_REQUEST` naming the endpoint to take it from.

Your private key never reaches the API. Sign the returned typed data (`domain`,
`types`, `safe_params`) locally and submit only the signature.

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

**`release_started: false` is a success, not a failure.** At or above the
source-of-funds threshold the release waits for a reviewer, and on that class of
order this is the normal outcome; `next_action` then says what is still owed.
Below the threshold the crypto goes immediately and `release_started` is `true`.

A consent is recorded once. A second call answers `409 OPERATION_NOT_ALLOWED` —
the release runs on its own once the review, if any, is decided.

### 4. Source of funds

An order whose fiat leg is worth at least `threshold_usd` — **USD 50 000**
today — does not release until a reviewer has decided where the money came from.
An order whose USD equivalent cannot be computed is treated as above it.

Below the threshold there is no dossier: `source-of-funds`,
`…/source-of-funds/declaration` and `…/source-of-funds/documents` answer
`404 ORDER_NOT_FOUND`. `…/source-of-funds/requirements` still serves the
catalogue, for any delayed order of yours.

Your customer supplies the evidence on *your* screens and you post it here. Below
the authorisation line these are the endpoints our own app uses: the same
validation, the same store, the same case the reviewer reads.

#### Read the dossier

```http
GET /api/v1/partner/orders/{order_id}/source-of-funds
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "trade_id": 77,
    "delayed_settlement": true,
    "case_id": "sof_9f1c4e2b",
    "status": "documents_required",
    "consent": { "signed": true, "signed_at": "2026-09-18T12:04:11Z" },
    "threshold_usd": 50000,
    "usd_equivalent": 62500,
    "source_of_funds": {
      "required": true,
      "threshold_usd": 50000,
      "usd_equivalent": 62500,
      "case": {
        "case_id": "sof_9f1c4e2b",
        "status": "documents_required",
        "catalogue_revision": 5,
        "decided_at": null,
        "rejection_reason_code": "",
        "created_at": "2026-09-18T12:00:09Z"
      }
    },
    "declaration": {
      "source_of_funds": "salary",
      "additional_sources": [],
      "explanation": "monthly salary accumulated since 2024",
      "funds_flow_description": "",
      "purpose_of_payment": "",
      "sender_recipient_relationship": "",
      "source_wallet_address": "",
      "source_wallet_network": ""
    },
    "documents": [
      {
        "document_id": "0f0f8a41-7b2e-4c19-9f60-1d2a3b4c5d6e",
        "document_type": "bank_statement",
        "file_name": "statement.pdf",
        "content_type": "application/pdf",
        "size_bytes": 184320,
        "superseded": false,
        "uploaded_at": "2026-09-18T12:10:02Z"
      }
    ],
    "requested_documents": [],
    "requirements_snapshot": {
      "catalogue_revisions": { "salary": 5 },
      "sources": ["salary"],
      "documents": [
        {
          "source_code": "salary",
          "mode": "one_of",
          "documents": ["employment_contract", "payslips", "employer_letter"],
          "minimum_files": { "employment_contract": 1, "payslips": 2, "employer_letter": 1 },
          "maximum_files": { "employment_contract": 1, "payslips": 3, "employer_letter": 1 }
        }
      ],
      "requires_statement": true,
      "statement_months": 3,
      "statement_max_age_days": 31,
      "requires_explanation": true,
      "review_checks": [],
      "frozen_at": "2026-09-18T12:06:44Z"
    },
    "decided_at": null,
    "rejection_reason_code": "",
    "created_at": "2026-09-18T12:00:09Z"
  }
}
```

`requested_at` and `request_expires_at` appear at the top level while a reviewer
has an open request: when they last asked for more, and when that request lapses.

**`404` is an answer, not a failure.** It means this order never crossed the
threshold and owes no dossier. It is also the answer for an order that is not
yours or is not one whose crypto you hold — one code for all three, so ids cannot
be probed. An on-ramp order answers `400 INVALID_REQUEST` instead.

Some fields are served under two spellings (`documents` / `documents_provided`,
`requested_documents` / `documents_requested`, `funds_flow_description` /
`funds_flow`, `purpose_of_payment` / `purpose`, `sender_recipient_relationship` /
`relationship`, `source_wallet_address` / `wallet_address`,
`source_wallet_network` / `wallet_network`, and `document_type` / `document_key`
inside a `requested_documents` entry). Both carry the same value. Prefer the long
spellings above; they are the column names the reviewer's own screens use.

**The read is never fenced.** A case that has just been decided still answers,
because you still have to show your customer the decision.

#### The requirements catalogue

Render your form from the catalogue until a declaration exists and freezes one:

```http
GET /api/v1/partner/orders/{order_id}/source-of-funds/requirements
X-API-Key: <api-key>
```

```json
{
  "success": true,
  "data": {
    "revision": 5,
    "categories": [
      {
        "code": "salary",
        "label": "Salary or wages",
        "description": "Regular income from an employer.",
        "requiresExplanation": true,
        "requiresBankStatement": true,
        "statement": { "minMonths": 3, "maxAgeDays": 31 },
        "baseDocuments": [
          { "key": "bank_statement", "label": "Personal account statement", "hint": "A PDF from your bank. It must show your name, the bank, the account number, dates including the year, and the balance." }
        ],
        "groups": [
          {
            "mode": "one_of",
            "documents": [
              { "key": "employment_contract", "label": "Employment contract" },
              { "key": "payslips", "label": "2–3 recent payslips", "multiple": true, "minFiles": 2, "maxFiles": 3 },
              { "key": "employer_letter", "label": "Letter from your employer" }
            ]
          }
        ],
        "revision": 5
      }
    ]
  }
}
```

`?source_of_funds=salary` narrows it to one category; a code that does not exist
answers `404 ORDER_NOT_FOUND`. Field names here are `camelCase` — this is the
catalogue's own contract, not the dossier's. `requiresAddressScreening` is set on
`crypto_assets` alone, and is why `source_wallet_address` is required there.
Categories carrying `"legacy": true` are refused by the declaration endpoint and
are served only so a dossier frozen under one can resolve its own label: drop them
from your picker.

This is a read of a static catalogue — safe to poll, and safe to cache against
`revision`.

`requirements_snapshot` on the dossier is the same catalogue **frozen** to what
this case was opened under, and once a declaration exists that is the list to
render instead. An operator editing a rule while cases are open can therefore
neither loosen an open one into approvable nor refuse a customer for a document
that was never on their screen.

- `documents[].mode` is `one_of` (any single document in the group satisfies it)
  or `all_of` (every listed document is owed; such a group carries exactly one).
- `documents[].documents` holds the `document_type` keys to upload under.
- `minimum_files` / `maximum_files` carry an entry for **every** key in the group.
  Both are `1` unless the catalogue asks for a pack — two or three payslips
  establish a pattern one cannot — and a `multiple` document with no published
  ceiling gets `10`.
- `requires_statement`, `statement_months`, `statement_max_months` (when the
  category publishes an upper end) and `statement_max_age_days` describe the
  personal account statement (`bank_statement`), owed on every category except
  `crypto_assets`.
- `requested_documents` is what a reviewer came back and asked for on top. Open
  requests only; each entry carries `document_type`, `document_key`, `label`,
  `reason`, `requested_at`, `satisfied`, and `policy` when that document has a
  format or window rule of its own.
- `review_checks` is **always `[]`** — the reviewer's checklist stays on the admin
  plane. The key is kept and emptied rather than dropped, so consumers mapping
  over it never meet a second shape.

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

Answers with the whole dossier, in the shape above.

| Field | Required | Notes |
| --- | --- | --- |
| `source_of_funds` | yes | One of `salary`, `business_income`, `sale_of_property`, `investment`, `crypto_assets`, `inheritance`, `gift`, `family_support`, `loan`, `savings`, `other`. |
| `explanation` | yes | The customer's own words. Max 4000 characters. |
| `source_wallet_address` | for `crypto_assets` | The on-chain sender is the primary control where there is no banking trail. Max 256 characters. |
| `source_wallet_network` | no | Max 64 characters. |
| `additional_sources` | no | A dossier declares **one** source. This exists only to re-send codes already on the case; adding a new one is refused. |
| `funds_flow_description` | no | Max 4000 characters. |
| `purpose_of_payment` | no | Max 4000 characters. |
| `sender_recipient_relationship` | no | Max 4000 characters. |

`catalogue_revision` and the requirement contract are computed on the server and
are never read from the request. Re-posting is allowed while the case is
undecided, and re-freezes the contract.

#### Upload a document

```http
POST /api/v1/partner/orders/{order_id}/source-of-funds/documents
X-API-Key: <api-key>
Content-Type: multipart/form-data
```

| Part | Required | Notes |
| --- | --- | --- |
| `file` | yes | The bytes. Max 15 MB, min 4096 bytes. |
| `document_type` | yes | A key from `requirements_snapshot`, or from a `requested_documents` entry. An unrecognised key is **stored, not refused** — evidence in an AML case is not thrown away over its label — and `satisfies_requirement` reports what happened. |
| `period_start` | no | `YYYY-MM-DD`. The period a statement covers. |
| `period_end` | no | `YYYY-MM-DD`. Must not precede `period_start`. |

**Bytes, not a reference.** A document named in a bucket of your own is evidence
the reviewer who signs the case off can never open, so the file itself travels
here and lands in the private store our own uploads use.

Accepted formats are PDF, JPEG, PNG, HEIC, HEIF and WebP, and each file is
validated against **its own bytes**: a renamed archive, a file whose content type
disagrees with its content, and anything a browser would execute are all refused.
A personal account statement (`bank_statement`) must be the bank-issued PDF — a
photograph of a screen cannot be checked for the account number, the period or the
balance the requirement is written about.

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
- `satisfies_requirement` answers whether this file moved the case forward.
  `false` is not an error — the file is stored either way — and
  `expected_document_types` then lists what the case is waiting for. The field is
  **absent** when nothing has been declared yet, there being no requirement to
  match against.
- `superseded_count` names how many earlier files of the same type this one
  replaced. A superseded file is kept, not deleted.
- `case_status` is where the case landed; the last upload may have completed it.
- The **same bytes under the same `document_type`** twice answers
  `409 INVALID_STATUS`.

#### What the review decides

| Case `status` | Meaning |
| --- | --- |
| `documents_required` | The declaration or its documents are still owed. |
| `documents_submitted` | Everything the frozen contract asks for is in. |
| `in_review` | A reviewer has picked it up. |
| `additional_information_required` | A reviewer asked for something else — see `requested_documents`. |
| `resubmitted` | The answer to that request is in. |
| `approved` | The crypto is released. |
| `rejected` | The crypto is returned to the customer; the order ends `cancelled`. |
| `escalated` | Moved out of the ordinary queue. |

Approval and your consent are two halves of one release, and **whichever arrives
last performs it**. There is nothing to call after either.

**Writes are fenced; reads are not.** A declaration or an upload is accepted only
while the order is still parked and the case is undecided. Outside that window
both answer `409 INVALID_STATUS`.

### 5. Follow the payout

The release is the middle of a delayed order, not the end. Every field below is
present on every order response — `GET /api/v1/partner/orders/{order_id}` and
`GET /api/v1/partner/orders`, on-ramp rows included, where all ten read `false` or
`null` — and a `null` mark is a fact: that step has not happened.

| Field | Type | Meaning |
| --- | --- | --- |
| `delayed_settlement` | boolean | Whether this order settles T+1. `false`, not `null`, on an ordinary order. Fixed at creation; a vendor changing their offer later does not change the order's class. |
| `settlement_hours` | integer \| null | The promised window, rounded to the nearest whole hour, never below `1`. `null` on an instant order. |
| `consent_deadline_at` | string \| null | When a **parked** order stops waiting for its consent — funding time plus the consent window, after which the ordinary payment-window sweep refunds the escrow. The only deadline that exists *before* the release, and the one to show your customer while asking them to sign. `null` on any order that is not parked, because by then it either released or it was refunded. |
| `payout_deadline_at` | string \| null | `escrow_released_to_buyer_at` + the window: when the customer was told the money would be there by. `null` until the crypto has left escrow — a parked order waiting on a signature is not running late. |
| `delayed_settlement_crypto_sent_to_provider_at` | string \| null | The crypto left the vendor's wallet for the payout provider. **A refund to the customer stops being possible at this mark.** |
| `delayed_settlement_fiat_payout_authorized_by_admin_at` | string \| null | Unigox authorised the vendor to send the fiat. Never set before the mark above. |
| `delayed_settlement_fiat_payout_submitted_by_provider_at` | string \| null | The provider accepted the payout and put it on the banking rail. |
| `delayed_settlement_fiat_paid_to_customer_at` | string \| null | The fiat reached the recipient. **This is the real completion of the order.** |
| `delayed_settlement_fiat_returned_by_bank_at` | string \| null | The bank sent the payout back. Set together with clearing `paid`, `submitted` and `authorized`, so the order is not finished and will be paid again. |
| `delayed_settlement_crypto_refunded_to_customer_at` | string \| null | The crypto went back to the customer instead. Only reachable while `crypto_sent_to_provider_at` is `null`. |

Two pairs are mutually exclusive by construction: paid **or** returned, and
refunded **or** sent to the provider. A new payment after a return clears
`returned_at` and sets `paid_at`; a return after a payment does the reverse.

## Status on a delayed order

Two values are added to the order status enum, both unreachable for an ordinary
order.

| Status | Meaning |
| --- | --- |
| `settlement_in_progress` | The crypto has left escrow and the fiat has not arrived. `completed` here would be a lie you would act on. |
| `returned` | The bank sent the payout back and no fresh authorisation stands. Distinct from `cancelled`: nothing has been given back to anyone and the order is going to be paid again. |

**Precedence.** More than one mark can be set at once, and the order they are read
in is the whole meaning:

1. `delayed_settlement_fiat_paid_to_customer_at` set → **`completed`**
2. else `delayed_settlement_crypto_refunded_to_customer_at` set → **`cancelled`**
3. else `delayed_settlement_fiat_returned_by_bank_at` set **and**
   `delayed_settlement_fiat_payout_authorized_by_admin_at` `null` → **`returned`**
4. else, on a release status → **`settlement_in_progress`**
5. before the release, the ordinary mapping applies — a parked delayed order is
   `crypto_received` like any other.

Step 3 is conditioned on the authorisation being absent on purpose: a standing
return with a fresh authorisation on top of it is an order being paid a second
time, which reads as `settlement_in_progress`.

### Filtering the list

`GET /api/v1/partner/orders?status=` accepts both new values. On delayed orders
the four release-bearing filters mean:

| `status=` | Returns |
| --- | --- |
| `completed` | Ordinary released orders, and delayed orders whose fiat actually reached the customer. A delayed order that has released but not paid is **not** here — that is the point. |
| `settlement_in_progress` | Delayed, released, not yet resolved either way. |
| `returned` | The bank sent the payout back and nobody has authorised another attempt yet. |
| `cancelled` | Orders that stopped before settlement, as before, **plus** delayed orders whose crypto was refunded after the release. Such an order reports `cancelled` while still sitting in a release state internally. |

The four are disjoint and cover every released delayed order: the set a filter
returns is exactly the set whose own `status` field reports that value.

### Timeline

`timeline` gains an entry per mark on a delayed order. An ordinary order's
timeline is unchanged, entry for entry.

| Entry `status` | `description` |
| --- | --- |
| `settlement_in_progress` | `Crypto released to the liquidity provider, ahead of the payout` |
| `settlement_in_progress` | `Crypto transferred to the payout provider` |
| `settlement_in_progress` | `Fiat payout authorized` |
| `settlement_in_progress` | `Fiat payout submitted by the provider` |
| `completed` | `Fiat paid to the customer` |
| `returned` | `Fiat returned by the bank` |
| `cancelled` | `Crypto refunded to the customer` |

The release entry reads `settlement_in_progress` rather than `Order completed`.
Consecutive entries are collapsed by status **and** description here, so the three
intermediate facts — all carrying `settlement_in_progress` — each keep their own
line.

## Webhooks

`order.status.changed` fires at each mark. The underlying status does **not** move
for the whole second half of a delayed order's life, so without these you would
hear nothing between the release and the payment.

| Fires when | `data.status` |
| --- | --- |
| Crypto sent to the payout provider | `settlement_in_progress` |
| Fiat payout authorized | `settlement_in_progress` |
| Fiat payout submitted by the provider | `settlement_in_progress` |
| Fiat paid to the customer | `completed` |
| Bank returned the payout | `returned` |
| Crypto refunded to the customer | `cancelled` |

`data` carries nine of the order payload's T+1 fields — `delayed_settlement`,
`settlement_hours`, `payout_deadline_at` and the six `delayed_settlement_*_at`
marks — on **every** event for that order, not only the one each mark triggered.
Three of them report the same status, so without the timestamps three
`settlement_in_progress` events in a day are indistinguishable.

A mark that has not happened is **absent** here, not `null` — the opposite of the
order payload. `consent_deadline_at` is never among them: every one of these
events fires after the release, and the consent window is `null` by then. Read it
on the order while the order is parked.

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

The nine are **omitted entirely on an ordinary order**, whose payload is
byte-for-byte what it was: `delayed_settlement` is `true` or absent, never
`false`, so its presence identifies the class.

**A bank return can happen more than once.** Returned, re-authorised, returned
again is a normal sequence, and each one is its own event. `event_id` is unique
**per emission**, not per mark: de-duplicate on `event_id`, never on the mark, or
the second return is silently dropped. No subscription change is needed; if you
receive `order.status.changed` today you will receive these.

## Errors

Every endpoint on this page answers in the standard partner envelope. The dossier
endpoints derive their code from the status, so this is the whole vocabulary.

| `error.code` | Status | When |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | Malformed `order_id`; malformed body; `signature` or `signed_data` missing or blank; `signed_data` is not this order's release transaction; the order is an on-ramp order. |
| `ORDER_NOT_FOUND` | 404 | No such order, not yours, not one whose crypto you hold — or, on the dossier endpoints, an order that owes no dossier, or a `source_of_funds` category that does not exist. |
| `INVALID_STATUS` | 409 | The order does not settle T+1; it is not parked waiting for a consent; it has no funded escrow. On the dossier endpoints: the order is no longer waiting for your information, the case is already decided, or the same file is already on the case under that `document_type`. |
| `OPERATION_NOT_ALLOWED` | 409 | The order is under review or held, and no crypto may be moved; or the consent has already been given. |
| `INVALID_REQUEST` | 413 | The file is larger than 15 MB. |
| `INVALID_REQUEST` | 415 | The file is not an accepted format, its bytes disagree with its content type, or a `bank_statement` was sent as something other than a bank-issued PDF. `error.details.allowed` lists what may be sent. |
| `INVALID_REQUEST` | 422 | A declaration field is missing, unknown or over length; `document_type` or `file` missing; a period is not `YYYY-MM-DD` or ends before it starts; the file is empty or under 4096 bytes. |
| `TRANSACTOR_ERROR` | 502 | The consent signature could not be accepted. A signature from a key that does not own the escrow and a briefly unreachable escrow service are indistinguishable from here — verify `signer_address`, then retry. |
| `INTERNAL_ERROR` | 500 / 503 | `503` when the dossier store or the document store is unavailable; `500` for anything else that failed. The status carries the retryability. |

413, 415 and 422 share `INVALID_REQUEST` deliberately: no code in this API is
named after an HTTP status. Branch on the status — retry smaller, send a different
type, fix the field — and read the message for the specific problem.

After a `502`, re-fetch `settlement-consent-parameters` before signing again. If
the consent did land, that GET answers `409 OPERATION_NOT_ALLOWED` and there is
nothing left to do; a second signature against a Safe nonce that has already been
spent is the one failure worth avoiding here.
