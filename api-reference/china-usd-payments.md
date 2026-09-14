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

Account details are strings. The widget gateway removes whitespace from account numbers before validation. Preserve strings end-to-end to avoid losing leading zeros. Company details must match the existing recipient identity. Current platform amount limits are USD 25–10,000. The public settlement reference returns minutes: 172,800 seconds becomes 2,880 minutes (T+2).

## Customer APIs

The authenticated account session at `GET /api/v1/bill-payment/session` returns USD with `available` derived from the rollout setting, `preparation_available: true` and `bank_rails: ["usd-wire-china"]`. When disabled, the reason is `provider_confirmation_pending`. Availability means permission to execute; preparation availability only permits saving details and documents. Missing preparation metadata fails closed.

Use `payout_currency=USD` on `GET /api/v1/bill-payment/payment-rails` and `/institutions`. The gateway resolves the institution's actual rail itself. To add a separate USD account to an existing supplier, POST `/api/v1/bill-payment/recipients/:id/destinations` with `institution_id`, `payout_currency`, `details` and an `idempotency_key`. Include `beneficiary_type: "business"` in widget details. The recipient's other destinations are retained. Replaying the same key/body returns the saved destination; a changed body returns 409. A caller cannot add to someone else's recipient.

`POST /api/v1/bill-payment/preflight` checks the saved account, amount and live quote. A refusal uses HTTP 200 with `ok: false`, `may_collect: false`, `price: null`; direct bill-create is refused before collection. An enabled onshore account with live liquidity can return `may_collect: true`, then `POST /bills` opens a real USD bill with immutable intent and idempotency. NRA/OSA remains refused with `CHINA_USD_INVOICE_CHANNEL_UNAVAILABLE` until its original-invoice channel is confirmed. Validation errors use the endpoint's existing 400/422 envelopes; do not treat a successful discovery response as permission to fund.

Private documents use `/api/v1/bill-payment/documents/:uuid`: PUT multipart `document`, `recipient_destination_id`, `payout_currency`; GET metadata; GET `/content`; DELETE an unbound draft. PDF/JPEG/PNG, 8 MB maximum. The server binds the original bytes and SHA-256 to the owner, destination and currency. An identical retry is safe; different bytes with the same UUID conflict. Drafts expire after 7 days; a bound invoice is retained as payment evidence. Parsing a receipt does not upload an original invoice to Lightnet. Provider upload remains a separate release requirement.

The partner-funded quote/initiate plane remains closed for USD/CN. Its refusal
uses `INVALID_REQUEST` with `provider_confirmation_pending`. Read-only estimates
follow the rollout setting so customer bill preflight can use real matching.
Do not infer readiness from the HTTP status of discovery.

The provider has supplied these account rules:

| Recipient account | Route condition | Invoice |
| --- | --- | --- |
| Begins with NRA or OSA | SWIFT only; domestic USD cannot be used | Required before sending |
| Onshore account, 10 digits, without NRA/OSA | Domestic USD under the provider's account rules | Not required upfront; the beneficiary bank contacts the recipient for documents |
| Another account format | Route has not been confirmed | To be confirmed with the provider |

The account number alone does not prove bank or beneficiary eligibility or give the client a domestic/SWIFT selector. The confirmed API product is mode Z with business remitter and beneficiary; domestic selection through that API, cutoffs and the original-invoice upload protocol still require clarification. A receipt parsed to help fill bank details is not automatically an accepted invoice.

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

The corridor row must carry `funding_model: "float"`. The column defaults to
`bridge`, which is the model a corridor gets by not choosing one, and the bridge
leg does not exist on any deployment today: an order on such a corridor is
accepted, passes compliance, releases the customer's crypto into custody, and
only then finds it has nowhere to send it. Prefunding the provider is what
`float` describes, so the balance and the model have to be set together — a
funded corridor still left at `bridge` settles nothing.

Local account/trades/offers integration has exercised USD quote, bill creation,
idempotent replay and unfunded cancellation. Agent tests exercise original invoice
bytes and Send → upload → Commit against simulated Lightnet responses. These checks
do not establish a live funded payout or beneficiary-bank settlement. Confirm the
USD upload contract, enable the intended environment, fund the provider balance,
and run a controlled provider acceptance test before declaring production readiness.
