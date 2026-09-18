# USD payments to China, Hong Kong and Singapore

The dollar reaches three destinations, each with its own rail and its own rollout: mainland China
(`usd-wire-china`), Hong Kong (`usd-wire-hong-kong`) and Singapore (`usd-wire-singapore`). Most of
this page is the mainland contract, which is the strictest of the three; the Hong Kong and Singapore
contract is at the end and differs in what it asks for. One country being open says nothing about
another, so read availability per destination and never from the currency alone.

USD beneficiary details and private invoices can be saved. Whether a payment can be executed is a per-deployment rollout setting, off by default. Onshore business accounts need matching liquidity; NRA/OSA accounts additionally require the original invoice, and stay refused until the original-invoice channel is confirmed. A general USD offer alone cannot enable the corridor. These settings are deployment controls, not request parameters.

## Confirmed bank contract (mainland China)

Use country `CN`, currency `USD`, network `usd-wire-china` and institution `china-usd-wire`. This is one generic bank method: the beneficiary's own `bank_name` and `swift_code` route the payment. Never replace `bank_name` with the catalogue label “Bank in China (USD)”. `bank_code` is not used.

The rail lists its fields at the top level and has no `formats`. The rail response carries no beneficiary type: this rail pays business beneficiaries, so treat its top-level fields as the business schema. Clients must support this single-shape schema as well as legacy formatted rails.

| Detail | Constraint |
| --- | --- |
| `company_name` | Required, at most 50 characters |
| `swift_code` | Required, 8–13 alphanumeric characters; do not restrict to 8 or 11 |
| `bank_name` | Required, at most 100 characters |
| `account_number` | Required, 6–23 letters and digits with no spaces; an NRA/OSA account is its prefix followed by exactly 20 digits (23 characters); retain leading zeros and NRA/OSA prefixes |
| `recipient_address` | Required, at most 256 characters; beneficiary address, not bank address |
| `recipient_city` | Required, at most 30 characters |
| `recipient_state` | Required, at most 20 characters; short province name |
| `recipient_postal_code` | Required, exactly 6 digits |

Account details are strings. Whitespace is removed from account numbers before validation. Preserve strings end-to-end to avoid losing leading zeros. Company details must match the existing recipient identity. The platform minimum is USD 25. There is no USD 10,000 ceiling and no per-payment volume limit on the corridor: the executable quote determines the maximum.

## Customer APIs

The authenticated account session at `GET /api/v1/bill-payment/session` returns one USD row per destination — this one is `country: "CN"` with `bank_rails: ["usd-wire-china"]` — each with its own `available` derived from that destination's rollout setting and `preparation_available: true`. When disabled, the reason is `provider_confirmation_pending`. Availability means permission to execute; preparation availability only permits saving details and documents. Missing preparation metadata fails closed.

Use `payout_currency=USD` on `GET /api/v1/bill-payment/payment-rails` and `/institutions`. The institution's actual rail is resolved on our side. To add a separate USD account to an existing supplier, POST `/api/v1/bill-payment/recipients/:id/destinations` with `institution_id`, `payout_currency`, `details` and an `idempotency_key`. Include `beneficiary_type: "business"` in widget details. The recipient's other destinations are retained. Replaying the same key/body returns the saved destination; a changed body returns 409. A caller cannot add to someone else's recipient.

`POST /api/v1/bill-payment/preflight` checks the saved account, amount and live quote. A refusal uses HTTP 200 with `ok: false`, `may_collect: false`, `price: null`; direct bill-create is refused before collection. An enabled onshore account with live liquidity can return `may_collect: true`, then `POST /bills` opens a real USD bill with immutable intent and idempotency. A USD preflight must name `recipient_destination_id`, or it is refused with `destination_required`. An amount below USD 25 is refused with `CHINA_USD_AMOUNT_OUT_OF_RANGE` on this rail; the Hong Kong and Singapore rails answer with `USD_AMOUNT_OUT_OF_RANGE`. NRA/OSA remains refused with `CHINA_USD_INVOICE_CHANNEL_UNAVAILABLE` until its original-invoice channel is confirmed. After that, preflight and `POST /bills` for an NRA/OSA account must name the uploaded invoice in `invoice_document_id`, or they are refused with `INVOICE_DOCUMENT_REQUIRED`. Validation errors use the endpoint's existing 400/422 envelopes; do not treat a successful discovery response as permission to fund.

Private documents use `/api/v1/bill-payment/documents/:uuid`, where `:uuid` is a client-generated UUID in canonical lowercase form: PUT multipart `document`, `recipient_destination_id`, `payout_currency`; GET metadata; GET `/content`; DELETE an unbound draft. GET, GET `/content` and DELETE take `recipient_destination_id` and `payout_currency` as query parameters; to read the invoice retained on a payment, GET and GET `/content` also take that payment's `bill_id`. PDF/JPEG/PNG, 8 MiB maximum. The server binds the original bytes and SHA-256 to the owner, destination and currency. An identical retry is safe; different bytes with the same UUID return 409 `invoice_document_mismatch`. Drafts expire after 7 days; a bound invoice is retained as payment evidence. Storing an invoice here is not the same as the provider accepting it.

Advisory recognition uses authenticated `POST /api/v1/bill-payment/recipient-receipt`,
multipart field `receipt`. It accepts PDF/JPEG/PNG/WebP up to **7 MB**, with at most
five PDF pages. HTTP 200 returns the extraction object directly, with
`requires_review: true`; it creates no recipient or payment. These limits differ
from the retained original-invoice upload above. The UI offers only a readable,
positive `amount_due` in the selected currency; `amount_paid` is never proposed
as a new invoice total. Malformed numeric grouping is refused, and a SWIFT code
marked uncertain cannot establish the bank country. HK/SG accounts are not
imported into the mainland-China payment flow. Review the original before saving.

The partner-funded quote/initiate plane remains closed for USD/CN. Its refusal
uses `INVALID_REQUEST` with `provider_confirmation_pending`. Read-only estimates
follow the rollout setting so customer bill preflight can use real matching.
Do not infer readiness from the HTTP status of discovery.

The provider has supplied these account rules:

| Recipient account | Route condition | Invoice |
| --- | --- | --- |
| NRA or OSA prefix followed by 20 digits | SWIFT only; domestic USD cannot be used | Required before sending |
| Onshore account of exactly 20 digits, with no prefix | Domestic USD | Not required upfront; the beneficiary bank contacts the recipient for documents |
| Another account format | Route has not been confirmed | To be confirmed with the provider |

The 6–23-character field constraint is separate from route eligibility. Accounts of another shape may be saved intact, including numeric accounts of another length and an NRA/OSA prefix not followed by exactly 20 digits, but bill preflight and `POST /bills` refuse them with `CHINA_USD_ACCOUNT_UNCONFIRMED` until their route is confirmed. Never shorten an account or remove a prefix. The account number alone does not prove bank or beneficiary eligibility or give the client a domestic/SWIFT selector. Route selection and the original-invoice upload are still being confirmed with the provider. A receipt parsed to help fill bank details is not automatically an accepted invoice.

Provider delivery clarification (15 September 2026): domestic USD to a supported onshore account usually arrives the same working day when sent before about 3pm Singapore time; public holidays in Singapore or China move it to the next working day. SWIFT usually takes two working days; a small rural or other bank without a direct SWIFT connection can take 2–3 days. These are payout timings reported by the provider. They do not authorize routing an unconfirmed account through domestic USD. Provider acceptance of a payout is not bank finality. A payment returned by the beneficiary's bank is refunded through a manual process that can take up to 7 days.

## Payment intent

Use the currency agreed with the supplier. CNY and USD require separate saved destinations under the same recipient; do not change the currency of an existing destination. Changing currency starts a separate amount draft and requires a fresh quote. A value of 10,000 CNY must never become 10,000 USD through a currency label change. Alipay and WeChat Pay remain CNY only.

## Discovery

`usd-wire-china` is a payout (off-ramp) network only. The supported-currencies and supported-payment-rails responses do not filter by direction, so do not offer a rail as an on-ramp option because it is listed. Discovery does not replace execution eligibility checks.

## Hong Kong and Singapore

Confirmed by the provider and probed live on 18 September 2026. Use country `HK` with network
`usd-wire-hong-kong` and institution `hong-kong-usd-wire`, or country `SG` with
`usd-wire-singapore` and `singapore-usd-wire`. The pair must agree: a Hong Kong rail sent with
country `CN` is refused as a route mismatch rather than resolved to either.

These rails are SWIFT only — the provider has no domestic alternative outside the mainland — and
they are one generic bank method each: the beneficiary's own `swift_code` routes the payment. A
`bank_name` may be saved for the payer's own reference and is not sent to the provider. Like the mainland rail, they list their fields at the top level and have no `formats`, and
they pay business beneficiaries.

| Detail | Constraint |
| --- | --- |
| `company_name` | Required, at most 100 characters |
| `swift_code` | Required, 8–16 alphanumeric characters |
| `account_number` | Required, 6–30 letters and digits with no spaces; retain leading zeros |
| `bank_name` | Optional, at most 100 characters |

What these two do NOT ask for, and what a client must therefore not send: the beneficiary's postal
address, city, state or postal code, and a purpose-of-remittance code. Hong Kong has no postal code
at all. There is also no NRA/OSA rule here: the provider publishes one account field, the BIC picks
the bank, and `CHINA_USD_ACCOUNT_UNCONFIRMED` has no counterpart beyond the field itself — an
account the field cannot hold is refused with `USD_ACCOUNT_UNCONFIRMED`.

No invoice is required on either rail, before or after the bill opens, so
`INVOICE_DOCUMENT_REQUIRED` and `CHINA_USD_INVOICE_CHANNEL_UNAVAILABLE` cannot arise. An invoice may
still be uploaded and retained as payment evidence.

The platform minimum is USD 25 here too, refused with `USD_AMOUNT_OUT_OF_RANGE`; the maximum is what
the executable quote serves. The provider's flat service charge is the same USD 3 as on the mainland
rail. Correspondent bank charges on a SWIFT payment are the correspondents' own and are not quoted
here, so a beneficiary may receive less than the amount sent. There is no field on these rails for a
payment reference or remark: an order number a supplier asks to see on the wire cannot be carried.

Delivery is what the provider reports for SWIFT: usually two working days. A beneficiary bank
without a direct SWIFT connection can take longer, and public holidays move the date. Provider
acceptance is not bank finality, and a returned payment is refunded through the same manual process
as the mainland rail.

`GET /api/v1/bill-payment/session` lists one payout option per destination, each with its own
`available`, `preparation_available`, `reason` and `bank_rails`. A disabled destination answers
`provider_confirmation_pending`. `GET /api/v1/bill-payment/payment-rails?payout_currency=USD`
returns all three rails; `/institutions` is per rail. Everything else — preflight, `POST /bills`,
documents, destination removal — behaves as described above.

Advisory recognition imports a Hong Kong or Singapore beneficiary onto that country's rail. It
refuses a country none of the three rails reach, by name.

## Removing bank details

DELETE `/api/v1/bill-payment/recipients/:id/destinations/:destination_id` removes
one owned saved account. The supplier and all other accounts remain. Unknown,
foreign or mismatched IDs return 404; a destination with an open bill returns 409
`destination_in_use`. Creating a bill on a destination and removing that destination
cannot overlap. Completed payment history is retained. The UI supports removal, an
inline confirmation, server errors, and adding new details after the last account is removed.
