# Changelog

Notable changes to the Unigox partner API, newest first.

## 2026-07-13

**You can now charge your end users a per-order markup.** Pass an optional `partner_fee_pct` on the quote and estimate requests for both ramps (`POST /onramp/estimate`, `/onramp/quote`, `/offramp/estimate`, `/offramp/quote`) — `1` means 1%. The markup is declared per order (no stored config), computed in crypto on the same base as the platform fee, and settled on-chain to your partner wallet when the order releases successfully. Cancelled or failed orders refund the full amount, markup included.

- Every response now reports the real figures in `fee_breakdown.partner_fee` and `fee_breakdown.partner_fee_pct` (quote, estimate, initiate, GET/LIST order, and the action responses), and webhook event `data` carries `partner_fee` / `partner_fee_pct` too.
- `crypto_amount` stays partner-fee-exclusive — the markup shows only in `fee_breakdown` (and in the offramp funding amount from transfer authorization). Apply your fee on the **same side** the platform does, or your receipts won't reconcile with our orders.
- Offramp has no cap. Onramp rejects a quote/estimate whose withheld fee would meet or exceed the delivered amount — a formula domain bound, not a business cap.

Pricing is unchanged if you don't charge a markup: omit `partner_fee_pct` (or send `0`) and every amount is what it was — only `partner_fee` and `partner_fee_pct` read zero. The platform fee still applies, so `platform_fee` and `total_fee` keep reporting it (with `total_fee` equal to `platform_fee`).

One formatting change does reach every partner, including those not charging a markup: `partner_fee` previously always returned the literal `"0.00"` and now carries the token's own decimals, like the other fee fields — a zero-fee USDT order reports `"0.000000"`. The value is unchanged; parse these fields as decimals rather than comparing the strings.

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
