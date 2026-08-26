# Changelog

Notable changes to the Unigox partner API, newest first.

## 2026-08-26

**Retail accounts: issue dedicated fiat accounts (IBANs) for your own end customers.** A new optional product lets an entitled partner register retail clients under its customers, push their identity to our banking provider, issue accounts, and read balances, ledger and incoming fiat payments — all under the existing `X-API-Key`. See the Retail accounts reference and the `Retail Accounts` endpoint group.

- **The envelope is different for these endpoints.** Retail responses are flat: `{"source":"depa","ok":true, …}` on success (the payload merged at the top level, not under `data`), and `{"ok":false,"source":"depa","error":"<slug>","detail":"…"}` on error. Branch on `error`. Provider-origin failures add `upstream`; missing-field errors add a `missing` array. `GET /retail/accounts` returns `source` as an object, not the string `"depa"`.
- **Enablement is Unigox-side.** You reach these endpoints only once we have activated the `retail` product on your partner and, for issuing, granted `issue_retail_accounts`. Until then writes answer `403` and `GET /retail/config` reports `enabled: false`. Money movement (funding, swaps, closing, outbound payments) is not on this API.
- **Deposits stay on the customer's account by default.** When money lands on a retail IBAN you issued, it stays on that customer's own account and you read it via `…/fiat-payments`. We can, per partner, switch on collection of those credits into your master account instead — ask us to enable it. Only when collection is on and succeeds do you receive a new `retail.settlement.completed` webhook (same envelope and signature as other events); on the default there is no deposit webhook.

**Widget callbacks now carry the order id.** The embedded widget's `onTradeStarted` and `onTradeCompleted` callbacks include `orderId` alongside `tradeId`. It is the same `order_id` this API and your webhooks use, so a widget trade can now be read directly with `GET /api/v1/partner/orders/{order_id}`.

Previously there was no way to make that call. `tradeId` is a Unigox-internal numeric id, and this API validates the path segment as a UUID — passing `tradeId` answers `400 invalid order_id format`, not a `404`. The order UUID was not exposed to the widget and the order response carries no trade id, so the two identifiers had nothing to join on.

- `orderId` is optional in the callback payload, because a trade opened outside a partner widget has no partner order behind it. Read it defensively rather than asserting it.
- `tradeId` is unchanged and still correlates the widget's own events (`onTradeStarted`, `onTradeCompleted`, `onSendout*`) with each other.
- This does not make widget orders actionable. They remain notify-only — see below.

## 2026-08-25

**Widget orders are notify-only.** If your customers reach Unigox through the embedded widget under your `widgetKey`, the orders they create are attributed to you — they appear in `GET /api/v1/partner/orders` and in your webhook stream, exactly as before. What changes is that they are no longer actionable: every action endpoint (`authorize-crypto-transfer`, `confirm-fiat-received`, `cancel`, `submit-payer-details`, `confirm-payment-sent`, `authorize-bridge`, and the two authorization-parameter reads) now answers `404 ORDER_NOT_FOUND` for them.

The crypto on a widget order belongs to the end user and sits in their own Unigox wallet, while every partner action moves crypto from *your* wallet. Funding a widget order's escrow therefore paid for a customer's trade out of your balance, and a refund on that order paid the customer rather than returning your funds. Refusing the action is what stops that.

- Nothing changes for orders you created through this API. They remain fully actionable.
- Webhooks for widget orders keep arriving, so you can still correlate a widget trade with your own records. Treat them as notifications, not as instructions: an `awaiting_crypto_transfer_authorization` status on a widget order is describing the customer's step, not asking you to take it.
- **Neither `status` nor `allowed_actions` distinguishes a widget order yet.** `allowed_actions` is derived from status alone, so a widget order sitting at `awaiting_crypto_transfer_authorization` still advertises `["authorize-crypto-transfer", "cancel"]` — and both now return `404`. Until that is fixed, the reliable rule is the one below.
- **Only act on orders you created.** Keep the `order_id` returned by your own `POST /offramp/initiate` or `POST /onramp/initiate` call and act on those. Any order id you first learned about from a listing or a webhook came from the widget, and is not yours to act on.

## 2026-08-11

**Chinese mobile wallets pay Chinese nationals only, and WeChat pays fewer of them than Alipay.** Both wallets verify the account holder against a Chinese national ID, so a foreign resident's Alipay or WeChat account cannot receive on the `ewallet` format — use a bank format for those beneficiaries.

- `alipay` settles to the sender themselves, to family, or to a third party.
- `wechat-pay` settles to the sender themselves or to family only. A `wechat-pay` destination quoted as `supplier`, `employee` or `friend` is refused before any money moves.
- The receiving wallet may ask the beneficiary to evidence the declared relationship (proof of income for a payment to the sender themselves, proof of the relationship for family). A relationship the beneficiary cannot evidence is what leaves a payment held inside the wallet.
- Paying a Chinese company from your company (B2C) is not available on this rail yet.

Nothing changes for the bank formats on `cnaps`, which carry no such restriction.

## 2026-08-07

**Consumer-to-consumer payout rails now require the sender's own identity.** Chinese mobile wallets (Alipay, WeChat Pay — the `ewallet` format on `cnaps`) settle person to person: the remitter shown on the receiving wallet must be your paying customer, not Unigox and not your company. When the customer's KYC record cannot name them, `POST /api/v1/partner/offramp/initiate` returns `422 SENDER_IDENTITY_REQUIRED`. No order is created and the quote is reverted.

- `error.details.missing_fields` is what the rail needs; `error.details.kyc_fields` is the subset you can supply, as the request body of `PATCH /api/v1/partner/users/{user_uuid}/kyc`. Send them, then retry with a fresh quote.
- That endpoint gains four fields for this: `gender` (`M`/`F`), `nationality` and `id_issue_country` (ISO 3166-1 alpha-2), and `source_of_funds` (a fixed vocabulary — see the endpoint). `id_type` also accepts `RESIDENCE_PERMIT`. An unacceptable value is a `400` with `invalid_gender`, `invalid_country_code`, `invalid_source_of_funds` or `invalid_field_value` (a value sent as an object or an array), and nothing is written — the patch is all-or-nothing.
- A recognised field sent blank is a no-op, not an error: the response is `200` and the field is absent from `updated_fields`, so a patch whose recognised fields are all blank answers `{"updated_fields": []}` and the payout still refuses. Read `updated_fields` before retrying.
- When `kyc_fields` is shorter than `missing_fields`, the remainder (the name on the document, the country of residence) can only come from verification itself — the customer has to complete or redo KYC.

Nothing changes for bank-format payouts, on-ramp, or any corridor other than the wallet formats. Send the customer's own details: substituting anyone else's is what the rail's identity check exists to catch.

## 2026-07-29

**Third-party recipients are now first-class Partner API resources.** A KYC-verified sender can pay a separately registered recipient without representing that recipient as one of the sender's own payment methods.

- Register and manage recipients under `/api/v1/partner/recipients`, including a versioned payout destination.
- Bind `sender_recipient_relationship` and `purpose_of_payment` for each payment.
- Quote an off-ramp with `sender_id`, `recipient_id`, and `recipient_destination_id`; omit `payment_details_id` for this ownership mode.
- Quote and order responses expose the immutable `recipient_context`. Initiation creates a durable `compliance` case visible in the same Unigox Compliance queue used for portal-created payouts.
- Sensitive identity and account values are write-only or masked on reads. Vendor-specific beneficiary terminology is not exposed by the Partner API.

The KYC user identified by `sender_id` must be the real party funding the payout. Partners must not route multiple real customers through a shared shell sender.

## 2026-07-22

**New KYC status `UNDER_REVIEW` for customers under manual compliance review.** When a customer's screening needs human compliance review (rather than a quick automated check), their KYC status is now surfaced as `UNDER_REVIEW` instead of `IN_PROGRESS`. It appears wherever a KYC status is reported: `GET /partner/users/{user_uuid}/verification-status`, `GET /partner/users/{user_uuid}` (`kyc.status`), the KYC submit response (`kyc_status`), and the `user.kyc.updated` webhook. A manual review can take **up to 24 hours**, unlike an automated check of a couple of minutes — so you can now tell the two apart and set the right expectation with your customer.

`UNDER_REVIEW` is **not cleared**: treat it exactly like `IN_PROGRESS` for gating — keep polling and do not unlock onramp/offramp until the customer reaches `VERIFIED`. This is an additive status value; if you already wait for `VERIFIED` before transacting, no action is needed.

## 2026-07-21

**On-ramp and off-ramp price estimates are public.** `POST /api/v1/partner/onramp/estimate` and `POST /api/v1/partner/offramp/estimate` no longer require an API key — same as `GET /api/v1/partner/liquidity`. They return indicative pricing only (no liquidity reservation, no quote or order). Executable pricing and order creation still need a key: `POST /partner/onramp/quote`, `/onramp/initiate`, `/offramp/quote`, and `/offramp/initiate`.

No code changes required if you already call estimate with a key; the key is simply optional for these two endpoints.

## 2026-07-13

**You can now charge your end users a per-order markup.** Pass an optional `partner_fee_pct` on the quote and estimate requests for both ramps (`POST /onramp/estimate`, `/onramp/quote`, `/offramp/estimate`, `/offramp/quote`) — `1` means 1%. The markup is declared per order (no stored config), computed in crypto on the same base as the platform fee. For off-ramp, the markup is settled on-chain to your partner wallet when the order releases successfully; cancelled or failed orders refund the full amount, markup included. For on-ramp there's no separate transfer leg: the full buyer amount lands in your partner wallet at release, and the markup is captured by withholding it when the crypto bridges out at send-out (a crypto-anchored order is sized up beforehand so the requested amount still arrives net of the withheld fee).

- Quote, estimate, initiate, and GET/LIST order responses report the real figures in `fee_breakdown.partner_fee` and `fee_breakdown.partner_fee_pct`, and webhook event `data` carries `partner_fee` / `partner_fee_pct` too. The compact action responses (`confirm-payment-sent`, `confirm-fiat-received`, `cancel`, `authorize-crypto-transfer`) don't carry `fee_breakdown` — re-fetch `GET /orders/{order_id}` for the fee figures after those calls.
- `crypto_amount` stays partner-fee-exclusive in composition, with two exceptions to what it's exclusive of: a crypto-anchored onramp order (request declares `crypto_amount`) is sized up so the delivered amount stays exact after the markup is withheld, so `crypto_amount` there includes the markup; a crypto-anchored offramp order (request declares `crypto_amount`) carves both fees out of the pinned deposit, so `crypto_amount` and `platform_fee` both move relative to a no-markup request even though the markup itself stays out of `crypto_amount`. Every other case is unaffected — the markup shows only in `fee_breakdown` (and in the offramp funding amount from transfer authorization, which is `crypto_amount + partner_fee`). Apply your fee on the **same side** the platform does, or your receipts won't reconcile with our orders.
- Fiat-anchored offramp orders have no cap — the deposit grows to cover the markup. Every other case hits a formula domain bound, not a business cap: onramp rejects `partner_fee_pct >= 100` (the withheld or grossed-up fee would consume the entire buyer amount, leaving nothing delivered); crypto-anchored offramp rejects it when the fee would consume the entire pinned deposit.

Pricing is unchanged if you don't charge a markup: omit `partner_fee_pct` (or send `0`) and every amount is what it was — only `partner_fee` and `partner_fee_pct` read zero. The platform fee still applies, so `platform_fee` and `total_fee` keep reporting it (with `total_fee` equal to `platform_fee`).

One formatting change does reach every partner, including those not charging a markup: in REST responses, `fee_breakdown.partner_fee` previously always returned the literal `"0.00"` and now carries the token's own decimals, like the other fee fields — a zero-fee USDT order reports `"0.000000"`. The value is unchanged; parse it as a decimal rather than comparing strings. This does not apply to the webhook's `data.partner_fee` field, which always used (and still uses) the shortest round-tripping representation — `"1"`, not `"1.00"`; `"0"` for no fee.

## 2026-06-27

**Customers must be KYC-cleared before onramping or offramping.** Quote and initiate calls (`POST /onramp/quote`, `/onramp/initiate`, `/offramp/quote`, `/offramp/initiate`) return `422 KYC_NOT_CLEARED` if the customer is not cleared; `error.details.kyc_status` carries their current status. Poll `GET /partner/users/{user_uuid}/verification-status` until the customer reaches `VERIFIED`.

No action needed if you already wait for `VERIFIED` before transacting.

## 2026-06-24

**Recipient validation moved to recipient creation.** The recipient field check that previously ran when you created an offramp order now runs earlier — when you **create the recipient** (`POST /api/v1/partner/users/{user_uuid}/payment-details`):

- If a required recipient field is missing or malformed for the payout corridor, the create is rejected with **`422 Unprocessable Entity`** and the offending fields are named in the `error` message — so you fix the recipient once, up front, before it can be used in any order.
- `POST /api/v1/partner/offramp/initiate` **no longer returns `RECIPIENT_UNVERIFIABLE`**: a recipient you successfully created has already passed field validation. Quote and funds checks at initiate are unchanged.
- This is now the single point of recipient validation — there is no second check at order time. It confirms the recipient details are complete and well-formed for the corridor; it does not by itself guarantee the destination account exists. If the validation service is temporarily unavailable the recipient is still created (creation is never blocked by an outage), so create recipients before you need them.

No action needed if you already create recipients before ordering. Corridors without recipient requirements are unchanged.

## 2026-06-22

**Offramp orders now validate the recipient details before the order is created.**

For payout corridors with recipient requirements (e.g. mobile money and bank transfers in Nigeria, Ghana, and Kenya), `POST /api/v1/partner/offramp/initiate` now checks the recipient up front:

- If a required recipient field is missing or malformed, the request is rejected with **`422 RECIPIENT_UNVERIFIABLE`** and the offending fields are listed in `error.details.fields` — so you can fix the details and create a new order, instead of creating one that can't be paid out.
- Name requirements are corridor-specific: bank transfers expect the account-holder name, while mobile money pays to the number and accepts a placeholder name.
- This confirms the recipient details are complete and well-formed; it does not by itself guarantee the destination account exists. If the up-front check can't be completed, the order is still created and the recipient is re-checked before payout — so an outage never blocks order creation.

Corridors without recipient requirements are unchanged; no action required.
