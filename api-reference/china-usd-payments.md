# USD payments to China

USD beneficiary details and private invoices can be saved. The authenticated bill-payment API uses `LIGHTNET_USD_PAYMENTS_ENABLED` (default false) to enable execution. Onshore business accounts need matching liquidity; NRA/OSA additionally requires the original invoice and `LIGHTNET_USD_ORIGINAL_INVOICE_UPLOAD_CONFIRMED`. An offer or general USD capacity alone cannot enable the corridor. These settings are deployment controls, not request parameters.

## Confirmed bank contract

Use country `CN`, currency `USD`, network `usd-wire-china` and institution `china-usd-wire`. This is one generic bank method: the beneficiary's own `bank_name` and `swift_code` route the payment. Never replace `bank_name` with the catalogue label “Bank in China (USD)”. `bank_code` is not used.

The schema has top-level fields and `beneficiary_type: "business"`; it does not have `formats`. Clients must support this single-shape schema as well as legacy formatted rails.

| Detail | Constraint |
| --- | --- |
| `company_name` | Required, at most 50 characters |
| `swift_code` | Required, 8–13 alphanumeric characters; do not restrict to 8 or 11 |
| `bank_name` | Required, at most 100 characters |
| `account_number` | Required, 6–20 alphanumeric characters; retain leading zeros and NRA/OSA prefixes |
| `recipient_address` | Required, at most 256 characters; beneficiary address, not bank address |
| `recipient_city` | Required, at most 30 characters |
| `recipient_state` | Required, at most 20 characters; short province name |
| `recipient_postal_code` | Required, exactly 6 digits |

Account details are strings. The widget gateway removes whitespace from account numbers before validation. Preserve strings end-to-end to avoid losing leading zeros. Company details must match the existing recipient identity. The platform minimum is USD 25. There is no universal USD 10,000 ceiling: the executable quote and the configured corridor determine the maximum. The public settlement reference returns minutes: 172,800 seconds becomes 2,880 minutes (T+2).

## Customer APIs

The authenticated account session at `GET /api/v1/bill-payment/session` returns USD with `available` derived from the rollout setting, `preparation_available: true` and `bank_rails: ["usd-wire-china"]`. When disabled, the reason is `provider_confirmation_pending`. Availability means permission to execute; preparation availability only permits saving details and documents. Missing preparation metadata fails closed.

Use `payout_currency=USD` on `GET /api/v1/bill-payment/payment-rails` and `/institutions`. The gateway resolves the institution's actual rail itself. To add a separate USD account to an existing supplier, POST `/api/v1/bill-payment/recipients/:id/destinations` with `institution_id`, `payout_currency`, `details` and an `idempotency_key`. Include `beneficiary_type: "business"` in widget details. The recipient's other destinations are retained. Replaying the same key/body returns the saved destination; a changed body returns 409. A caller cannot add to someone else's recipient.

`POST /api/v1/bill-payment/preflight` checks the saved account, amount and live quote. A refusal uses HTTP 200 with `ok: false`, `may_collect: false`, `price: null`; direct bill-create is refused before collection. An enabled onshore account with live liquidity can return `may_collect: true`, then `POST /bills` opens a real USD bill with immutable intent and idempotency. NRA/OSA remains refused with `CHINA_USD_INVOICE_CHANNEL_UNAVAILABLE` until its original-invoice channel is confirmed. Validation errors use the endpoint's existing 400/422 envelopes; do not treat a successful discovery response as permission to fund.

Private documents use `/api/v1/bill-payment/documents/:uuid`: PUT multipart `document`, `recipient_destination_id`, `payout_currency`; GET metadata; GET `/content`; DELETE an unbound draft. PDF/JPEG/PNG, 8 MB maximum. The server binds the original bytes and SHA-256 to the owner, destination and currency. An identical retry is safe; different bytes with the same UUID conflict. Drafts expire after 7 days; a bound invoice is retained as payment evidence. Parsing a receipt does not upload an original invoice to Lightnet. Provider upload remains a separate release requirement.

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
| Begins with NRA or OSA | SWIFT only; domestic USD cannot be used | Required before sending |
| Onshore account with exactly 10 digits and no NRA/OSA prefix | Domestic USD | Not required upfront; the beneficiary bank contacts the recipient for documents |
| Another account format | Route has not been confirmed | To be confirmed with the provider |

The 6–20-character field constraint is separate from route eligibility. Numeric accounts of another length may be saved intact, but Account, Trades and the agent refuse execution with `china_usd_account_unconfirmed` until their route is confirmed. Never shorten an account or remove a prefix. Mode Z exposes the bank fields documented above, with business remitter and beneficiary. That field contract does not confirm whether the intended domestic/SWIFT route must use mode B or Z. Route selection and the original-invoice upload protocol must be verified against the provider contract before enabling execution. A receipt parsed to help fill bank details is not automatically an accepted invoice.

Latest provider delivery clarification (14 September 2026): domestic USD is **same-day guaranteed** for the supported onshore route. SWIFT usually takes two working days; a small rural or other bank without a direct SWIFT connection can take **2–3 days**. These are payout-leg timings, separate from the T+1 settlement schedule. They do not authorize routing an unconfirmed account through domestic USD.

## Payment intent

Use the currency agreed with the supplier. CNY and USD require separate saved destinations under the same recipient; do not change the currency of an existing destination. Changing currency starts a separate amount draft and requires a fresh quote. A value of 10,000 CNY must never become 10,000 USD through a currency label change. Alipay and WeChat Pay remain CNY only.

## Discovery and scheduled settlement

Payment network configuration can declare `directions: ["offramp"]`. The supported-currencies and supported-payment-rails responses respect that restriction. Omitted or null configuration preserves legacy bidirectional discovery; an explicit empty list permits neither direction. Discovery does not replace execution eligibility checks.

For settlement capacity, pass the recipient bank's `country_code` as well as currency and rail. `rail` is the network slug (`usd-wire-china`); a display name that names exactly one network ("USD Wire to China") is resolved to that slug, and matching is case-insensitive. The same resolution applies to `rail` on order open, where a value naming a different network than the trade's is still refused. With rollout disabled, `USD` plus `country_code=CN` returns an empty `corridors` list and `unavailable_reason: "provider_confirmation_pending"`. With rollout enabled, exact configured capacity can admit onshore business accounts. Own-account NRA/OSA settlement is refused before escrow because that flow does not yet carry a bound original invoice. The same refusal applies to a reserved China USD rail. A general USD capacity row cannot authorize a China payout. Existing committed orders retain their recovery path.

The internal settlement payout queue includes `payout_country_code`, read from the trade's actual bank destination. The Lightnet agent resolves USD only from currency, country and rail together. A closed corridor does not stamp a new payout reference or call Send/Commit; existing provider payouts can still be queried and reconciled.

The same rule applies to the vendor trade plane. `GET /trade/{id}`, `GET /trade_request/{id}` and the vendor's pending-request list carry `payment_network_slug` and `route_country_code` at the top level of a SELL trade or request, and `initiator_payment_details` carries `payment_network_slug` and `country_code`; both are frozen into the seller snapshot when the request is created, for a recipient payout and an own-account sale alike. `payment_network_name` is display text and is not a routing key. A trade that names no route is skipped by the USD agent, never paid down a guessed corridor; BUY trades and rows frozen before this field existed carry none.

A scheduled settlement window describes the settlement obligation. It does not guarantee the time at which the beneficiary bank credits a SWIFT payment.

## Removing bank details

DELETE `/api/v1/bill-payment/recipients/:id/destinations/:destination_id` removes
one owned saved account. The supplier and all other accounts remain. Unknown,
foreign or mismatched IDs return 404; a destination with an open bill returns 409
`destination_in_use`. Bill creation and removal serialize on the destination row.
Completed payment history is retained. The UI supports removal, an inline confirmation,
server errors, and adding new details after the last account is removed.

## Release evidence

The Lightnet corridor must carry `funding_model: "float"`. Enabling an unexecutable bridge corridor is refused. The model is snapshotted when each order opens; later operator edits affect new orders only. A separate durable USD cash commitment survives custody release and provider funding. CNY and USD draw from the same Lightnet pool. Cash is released from that ledger only after terminal settlement and a provider balance observation taken after it; a prior balance cannot free the same money twice.

Local account/trades/offers integration has exercised USD quote, bill creation,
idempotent replay and unfunded cancellation. Agent tests exercise original invoice
bytes and Send → upload → Commit against simulated Lightnet responses. These checks
do not establish a live funded payout or beneficiary-bank settlement. Confirm the
USD upload contract, enable the intended environment, fund the provider balance,
and run a controlled provider acceptance test before declaring production readiness.

## Recovery contract (2026-09-14)

A bank return and another payout are separate attempts. The admin `retry_payout` outcome accepts only `returned/fiat_returned`, with documented confirmation that the returned funds are available and a fresh sufficient provider balance. It archives prior provider metadata and payment facts, allocates a new deterministic reference, clears the current attempt's provider state, and queues `provider_credit_confirmation/provider_book`. An old callback cannot complete the new attempt. `reference` on this admin request is return evidence, not an arbitrary PSP id.

`resume_automation` is separate: it re-arms a specific escalated executor after its cause is repaired. It retains submitted transaction references and custody capabilities, refuses live leases and invalid financial locations, and archives the previous attempt ledger in the event. Unrecorded transfers without durable evidence require reconciliation first.

The provider agent attempts immediate acknowledgement reporting. A Trades HTTP outage after Send does not prevent invoice upload or Commit. The durable acknowledgement is retried before any terminal callback is reported. `payout-submitted` records acceptance at `fiat_payout/provider_book`; only matching positive Commit evidence advances to `fiat_payout_in_transit` through `payout-committed`. Replaying acceptance cannot demote an already committed or completed payment. Bank finality is never inferred from this local recovery.

The retry operation uses the **same approved bank details and original invoice**. It does not support replacing a destination. A corrected destination requires a separate authenticated customer flow and a fresh approved recipient/invoice context; that workflow is not implemented by `retry_payout`.
