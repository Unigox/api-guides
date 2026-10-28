# Changelog

Notable changes to the Unigox partner API, newest first.

## 2026-10-26

**Webhooks for business customers.** Business-customer events are now sent to your webhook, signed and retried like order events. See [Business customers: Webhooks](./api-reference/business-customers.md#webhooks).

- `fiat_account.deposit.received` (with `holder_type: business`) when money arrives on a company's account, and the new `fiat_account.payment.sent` when money leaves it. Both carry `payment_id`, the same `id` as on `…/payments`, plus amount, currency, rail, counterparty and description.
- The new `fiat_account.payment.updated` for every status a transfer reaches: `pending`, `confirmed`, `sent`, `blocked`, `refused`, `refunded` and others.
- The new `business_customer.kyb.updated` for every change of a company's KYB status.
- `GET /api/v1/partner/webhooks/events` lists the events raised for you since a time, with delivery status, and `POST …/webhooks/events/{event_id}/redeliver` sends one again.
- `POST /api/v1/partner/webhooks/test` takes an optional `event_type` and sends a signed sample of it. When your endpoint returns non-2xx or does not respond, the call now returns `200` with `"delivered": false` (and the code in `http_status`) instead of `502`.
- The retail `fiat_account.deposit.received` now also carries `holder_type: retail`.

## 2026-10-28

**On a regular THB on-ramp you can tell us which account the customer pays from.** `POST /api/v1/partner/orders/{order_id}/submit-payer-details`, until now only for `payment_request` orders, also takes the customer's own bank account on a regular on-ramp. The incoming transfer is then matched to the order by the sender's account, so two customers paying the same amount at the same time are told apart. It is optional: without it, matching works as before.

- Send it right after initiate, before the customer pays. Accepted while the order is `awaiting_vendor_escrow_funding`, `awaiting_fiat_transfer` or `fiat_transfer_pending`, once per order.
- Inline `payment_details` needs only `details`: `payment_method_id` and `payment_network_id` default to the order's own.
- It is not listed in `allowed_actions`, and the order does not wait for it.
- THB only for now; other currencies answer `409 OPERATION_NOT_ALLOWED`.

## 2026-10-24

**On-ramp orders carry a payment deadline.** Orders carry `payment_deadline_at` (UTC). See [Paying for an on-ramp from the account](./fiat-accounts.md#paying-for-an-on-ramp-from-the-account).

- While an on-ramp is `awaiting_fiat_transfer`, it is the time after which the order can be cancelled if the customer's transfer has not arrived. Have the customer pay before it.
- The order is cancelled shortly after the deadline: on your next read, or, for an `own_account` order, within about 20 minutes even if you do not read it. A transfer that lands in between may still complete it, without guarantee.
- It is `null` in every other status and on every off-ramp.
- The on-ramp's `order.status.changed` event carries the same value, and omits it when not set.

## 2026-10-20

**Finding an order when the initiate response was lost.**

- `GET /api/v1/partner/orders?reference_id=` returns the orders you created with that `reference_id`, newest first. `reference_id` is still not enforced unique, so it is a list. It combines with `type`; combined with `status` it returns `400 INVALID_REQUEST`.
- A retried initiate whose quote was already used returns `QUOTE_ALREADY_USED` with `error.details.order_id`, the order the first call created. On- and off-ramp alike.

**An off-ramp cannot be cancelled while its escrow funding may still execute.** After `authorize-crypto-transfer` has submitted the transfer, `POST /orders/{order_id}/cancel` returns `409 OPERATION_NOT_ALLOWED`. Cancelling works again only if the transfer failed without reaching the chain. Otherwise the order is funded, or it expires at its funding deadline and any crypto that arrives is refunded to the customer.

**Your operating account is readable on the Partner API.** `GET /api/v1/partner/operating-account` (with `/ledger` and `/payments`) shows your operating account: where `transfer-to-partner` sends money and where crypto withdrawals leave from. Read-only. See [Your operating account](./api-reference/business-customers.md#your-operating-account).

- `/operating-account`: the balances, fiat and crypto, as amounts you can spend.
- `/operating-account/ledger`: every entry on its book.
- `/operating-account/payments`: its bank transfers.

**Who onboards, and power of attorney.** Your customers, and anyone with access to their bank accounts, onboard directly with Unigox. To move funds on a customer's behalf you need their power of attorney; nested flows are not permitted. See the top of [Business customers](./api-reference/business-customers.md).

**An on-ramp can be paid from money already on the customer's fiat account.** `POST /api/v1/partner/orders/{order_id}/pay-from-balance` takes the order's `fiat_amount` from the customer's account instead of waiting for a new transfer, and the order continues as if the money had just arrived. Use it for a deposit that arrived before any order was open.

- Offered in `allowed_actions` as `pay-from-balance` on `own_account` orders at `awaiting_fiat_transfer`.
- Refusals: `422 INSUFFICIENT_BALANCE`, `409 FIAT_ACCOUNT_REQUIRED`, `409 OPERATION_NOT_ALLOWED`, `409 INVALID_STATUS`, `422 KYC_NOT_CLEARED`, `503 PAY_FROM_BALANCE_UNAVAILABLE`. Repeating the call never debits twice.

See [Paying from money already on the account](./fiat-accounts.md#paying-from-money-already-on-the-account).

## 2026-10-19

**Business customers are on the Partner API.** Companies you onboard through KYB, and the accounts Unigox issues in their name, are now on `/api/v1/partner/business-customers`. Before, they were reachable only in the B2B console. Enabled per partner. See [Business customers](./api-reference/business-customers.md).

- Start KYB, get the onboarding link and follow the KYB status.
- Issue accounts once KYB is approved, and read balances, the ledger and bank transfers.
- Move balances between a company's account and your operating account with `transfer-to-partner` and `fund`, both with an `Idempotency-Key`.
- Accounts are addressed as `business_<n>` under the customer that holds them.
- Closing an account and crypto withdrawals stay in the console.

**EUR and GBP off-ramps are paid through the customer's own account.** Where customer fiat accounts are active for your partner in that currency, an EUR or GBP off-ramp to the customer's own bank is paid into the customer's account and then to their bank, both in their name. There is nothing to switch on.

- If the customer has no active account in that currency, the quote opens one and returns `409 FIAT_ACCOUNT_OPENING` with `error.details.fiat_account_id`. Quote again once `fiat_account.updated` reports it `active`.
- If the order cannot be paid through the account, and no liquidity provider that pays banks directly takes it, the quote returns `409 FIAT_ACCOUNT_REQUIRED` with `error.details.reason`. Where customer fiat accounts are not active for you in that currency, it returns `409 FIAT_ACCOUNTS_NOT_ENABLED`; if the route cannot be checked, `503 FIAT_ACCOUNT_CHECK_UNAVAILABLE`. The initiate returns the same. Before, such an order was paid straight to the bank.
- GBP is covered too: the bank you name is paid by Faster Payments from the customer's GBP account.
- A `payment_details_id` naming the customer's own fiat account returns `400 INVALID_PAYMENT_DETAILS`: always for an account you opened through this API, and in EUR and GBP for any account Unigox issued to the customer. Name their outside bank.
- If you do not call `confirm-fiat-received`, such an order is confirmed once Unigox has matched the money on the customer's account, and released after the offer's release time.
- The payment into the customer's account, once matched to exactly one such order, does not send `fiat_account.deposit.received`; every other deposit still does.
- Such an order carries `payout_via_own_account: true` on `initiate`, on the order and on `order.status.changed`; the order also carries `own_account_payout_status` and `fiat_account_id`. `completed` means the customer's account was paid; `own_account_payout_status` says whether the money reached the bank. The new event `order.own_account_payout.updated` reports when it was sent on or stopped.

See [Paying an off-ramp through the account](./fiat-accounts.md#paying-an-off-ramp-through-the-account).

**`authorize-crypto-transfer` accepts a `signature` without the `0x` prefix again.** The signature check added on 2026-10-15 refused a bare hex signature with `400 INVALID_REQUEST` (`invalid signature: malformed signature`), although it was accepted before. Both forms are accepted now; sending `0x` is recommended. The signature is still 65 bytes (`r`, `s`, `v`), with `v` as 27/28 or 0/1 and a low `s`.

## 2026-10-16

**You can choose the wallet your markup is paid to.** Set the Fee wallet field in the partner dashboard to any EVM address you control on XAI. The `partner_fee` of an off-ramp order, and of an on-ramp order of a non-custodial (`external_wallet`) customer, is then paid there at release instead of to your partner wallet. Leave it empty to keep the current behaviour.

- It cannot be set with the API key, so a leaked key cannot redirect your fees. Every change is recorded.
- A change applies to orders created after it; an order keeps the fee wallet it was created with.
- Only the markup moves. Off-ramp orders are still funded from, and refunded to, your partner wallet (for an `external_wallet` customer, the customer's address). The markup of other on-ramp orders is withheld at send-out and stays in your partner wallet.

**Bridge refusals are 4xx.** A withdrawal quote, or an on-ramp send-out, to an address the destination chain cannot pay returns `400 INVALID_REQUEST` with `error.details.reason`. An amount too small to bridge returns `422 AMOUNT_TOO_LOW`: either the bridge refused it (`error.details.reason`), or the bridge fee would exceed 2% of the amount (`error.details.bridge_fee`, `estimated_minimum_amount`, `max_fee_pct`). Both returned `500` before.

**Funding your wallet has its own page.** [Funding your wallet](./api-reference/funding-your-wallet.md) describes the deposit addresses Unigox keeps for your partner wallet on other chains, the tokens each chain accepts, and how a deposit is credited on XAI. It was previously covered only under third-party payouts.

## 2026-10-15

**`authorize-crypto-transfer` checks the signature before relaying.** A `forward_request` not signed by `forward_request.from`, with a `deadline` in the past, or with a `nonce` that is not the signer's current forwarder nonce, returns `400 INVALID_REQUEST` and nothing is relayed. Such a request was relayed before and failed as `502 TRANSACTOR_ERROR`. If a relayed request failed without moving funds, a new signed request for the same order is accepted.

**Payout base rate.** A payout estimate or quote may include `fee_breakdown.payout_base_rate`: the conversion rate before the licensed partner's costs and margin, when that licensed partner publishes it, for instant and T+1 offers. Use it to show the recipient amount and one combined fee without charging the fee twice. It is omitted when the rate is not known or is out of date; its absence does not mean there is no margin. Existing amounts and the meaning of `fiat_rail_fee` do not change.

**Other changes to estimates, quotes and orders.**

- `POST /api/v1/partner/offramp/estimate` takes four new optional fields:
  - `recipient_payout: true` prices only on the licensed partners a recipient payout can be matched to.
  - `exclude_delayed_settlement: true` leaves T+1 offers out, and returns `409 NO_OFFERS_AVAILABLE` when no instant offer covers the amount.
  - Both only narrow the estimate; neither changes what a quote matches.
  - `recipient_id` and `recipient_destination_id`, sent together with your API key, price a recipient payout on that destination's own bank or wallet method, rail and country, as the quote does, so a fee a licensed partner charges for that bank is included. Without them a recipient-payout estimate is priced on the corridor and can show a better rate than the quote.
- A third-party quote whose sender, recipient or destination is not found for your partner account, or was archived, still returns `422 THIRD_PARTY_CONTEXT_INVALID`, now with a message that says which: `sender not found or not eligible`, `recipient not found or not eligible` or `recipient destination not found or not eligible`. It used to say `sender, recipient or destination not found or not eligible`.
- Quote and initiate, on both ramps, also require the customer's identity to be verified by Unigox. Under KYC reliance, a customer whose verification is still pending, whom a quote used to price, now gets `422 KYC_NOT_CLEARED` (with `error.details.kyc_status`). The message names the `sender` on an off-ramp and the `customer` on an on-ramp, where it said `beneficiary`.
- A `quote_id` that is not a UUID returns `400 INVALID_REQUEST` (`invalid quote_id format`) on both initiates, instead of `500`. A well-formed id that names no quote still returns `404`.
- On a third-party quote, a `recipient_id` or `recipient_destination_id` that is not a UUID returns `400 INVALID_REQUEST` naming the field (`recipient_id must be a UUID`), instead of `422 THIRD_PARTY_CONTEXT_INVALID`.
- `POST /api/v1/partner/orders/{order_id}/cancel` on an order no liquidity provider has accepted yet cancels it and returns the whole order, instead of `409 INVALID_STATUS`. If a liquidity provider accepts the order at the same moment, the cancel returns `409 OPERATION_NOT_ALLOWED`; retry it.
- A quote's `expires_at` is in UTC and in whole seconds, on both ramps.
- `order_type` is on every order response, including an order no liquidity provider has accepted yet, where it was missing.
- `GET /api/v1/partner/orders?status=` lists orders no liquidity provider has accepted yet under the status they report: `awaiting_liquidity_provider` and `price_changed_requote_needed` return them instead of an empty page, and `cancelled` includes orders cancelled before acceptance. An off-ramp order whose payout failed is listed under `failed`, the status it reports, and no longer under `cancelled`.

**The off-ramp estimate stays public, and credentials change its pricing.** With a credential that authenticates, it is priced as your quote would be matched. A credential that does not authenticate is refused only when the body names `recipient_id` or `recipient_destination_id`; any other request with such a credential is priced as an anonymous caller without T+1 offers, the instant price it got before.

| Credential | Result |
| --- | --- |
| None | Priced for anyone, T+1 offers included. |
| Your `X-API-Key` (checked first), or a `Bearer` token that authenticates | Priced as your quote would be matched: T+1 offers are left out until delayed settlement is enabled for you. |
| A wrong key, or an expired or unknown token | `401 UNAUTHORIZED` when the body names a recipient or destination. |
| A valid token of a user who is not a partner or whose account is inactive | `403 UNAUTHORIZED` when the body names a recipient or destination. |
| Any credential while the authentication service is unavailable | `503` (or `500`) `INTERNAL_ERROR` when the body names a recipient or destination. |
| `X-Secret-Key` | Not a credential on this route: priced as anonymous. |
| `Authorization` with a scheme other than `Bearer` | Ignored. |

**Corrected in the documentation.** These describe how the API already behaves; the API does not change.

- `POST /api/v1/partner/orders/{order_id}/cancel` takes an optional body with a free-text `reason`, kept with the cancellation once a liquidity provider has accepted the order, and returns the order on success.
- `crypto_transfer_authorization_pending` offers no `cancel`: the transfer is in flight.
- `POST /api/v1/partner/orders/{order_id}/confirm-fiat-received` is not idempotent: once the order has moved past the confirmation (already confirmed, or completed), it returns `409 INVALID_STATUS` and changes nothing. Its `409` is now documented.
- `POST /api/v1/partner/offramp/initiate` and `POST /api/v1/partner/onramp/initiate` return `200` on success, not `201`.
- On a third-party quote, a `rail` that is not the destination's and a `fiat_currency` that is not the destination's currency return `422 THIRD_PARTY_CONTEXT_INVALID`; `RAIL_ROUTE_MISMATCH` is a self-payout code only.
- A recipient destination needs `institution_id` on every rail, `alipay` or `wechat-pay` on the wallet rails. The wallet rails take `first_name` and `last_name`, with `full_name` still accepted and split at the first space. The recipient's `recipient_kind`, not `details.beneficiary_type`, selects the individual or business format, so a business recipient cannot hold a wallet destination. On `cnaps`, `mobile_number` accepts a `86` or `+86` prefix and `id_number` is optional.
- `/api/v1/supported/payment-rails` requires `direction`, and returns `has_liquidity` only when the query names both `country` and `currency`.
- `payment_details_id` is `""` on third-party payout events.

## 2026-10-12

**Non-custodial customers.** A customer created with `wallet_type: external_wallet` holds their crypto at their own EVM address and signs every movement of it; your partner wallet does not hold or sign for it. Ask Unigox to switch the mode on for your partner account. See [Non-custodial customers](./non-custodial-customers.md).

- **Link once.** `POST /users/{user_uuid}/wallet/challenge` returns a Sign-In with Ethereum message; the customer signs it with `personal_sign` and you submit it to `POST /users/{user_uuid}/wallet`. The address is fixed from then on.
- **Deposit addresses of their own** on EVM chains, Solana, Tron and TON, credited to the customer's address on XAI. `GET /users/{user_uuid}/wallet` shows the balance; `wallet.deposit.received` fires on each credit.
- **Orders.** On an off-ramp the customer signs the escrow funding and any refund, and refunds land on their own address. On an on-ramp the crypto is released to the customer's address and your partner fee to your partner wallet, in the same transaction.
- **Withdrawals** to any supported chain, signed by the customer, gas paid by Unigox: `POST /users/{user_uuid}/withdrawals/quote`, then `POST /users/{user_uuid}/withdrawals`. `wallet.withdrawal.status.changed` follows each one. Deposits and withdrawals need no KYC; orders do.
- New error codes: `FEATURE_NOT_ENABLED`, `WALLET_NOT_LINKED`, `WALLET_ALREADY_LINKED`, `WALLET_TYPE_MISMATCH`, `INVALID_SIGNATURE`, `CHALLENGE_EXPIRED`, `CUSTOMER_NOT_FOUND`, `WITHDRAWAL_NOT_FOUND`, `ADDRESS_CAP_REACHED`, `BALANCE_UNAVAILABLE`, `DEPOSIT_ADDRESSES_UNAVAILABLE`, `DEPOSIT_ADDRESS_ALLOCATION_UNKNOWN`, `DEPOSIT_ADDRESS_NOT_WATCHED`, `BRIDGE_UNAVAILABLE`.

**Every new customer gets their own Unigox account.** A customer created with `POST /api/v1/partner/users` from today has their own account, separate from a Unigox app user or another partner's customer with the same email. Customers you already have are unchanged.

- Among your customers created from this date, one email is one account: a second `user_ref` with the same email shares it.
- KYC runs per account. A person already verified at Unigox is approved by matching that verification instead of being declined as a repeat.
- `POST /api/v1/partner/users` returns `200` on success, for a new customer and for a repeated `user_ref` alike. The reference previously listed `201` for a new one.

## 2026-10-09

**Unused fiat accounts are closed automatically.** An account with no transactions for a period set by Unigox (30 days by default) is closed, and you receive `fiat_account.updated` with `status: closed`, as for any close. To serve the customer again, open a new account with the usual request; it comes with new pay-in details. See [Unused accounts are closed](./fiat-accounts.md#unused-accounts-are-closed).

## 2026-10-08

**On-ramp send-out uses the same networks as the withdraw screen on unigox.com.** `GET /api/v1/partner/send-out/routes?crypto=USDT` is new: it lists the chains a completed on-ramp order of that crypto can be withdrawn to.

- Pass `destination_chain` to `bridge-authorization-parameters` and `authorize-bridge` exactly as listed (for example `Arbitrum One`, `BNB Smart Chain`), or the `chain_id`. Lowercase slugs such as `arbitrum` are no longer accepted.
- The order's own crypto is sent, so a USDC order now goes out as USDC.
- Tron, Solana and TON addresses are accepted in their own formats.

## 2026-09-23

**`GET /api/v1/partner/stats` is new.** It returns `total_orders`, `completed_orders`, and `volume_usd` and `earned_usd` over completed orders, each order converted to USD at the rate snapshotted when it was created. The partner dashboard tiles now show these figures.

The markup you set in the partner dashboard applies to trades made through the embedded widget only. An API order carries a markup only when its quote or estimate request sends `partner_fee_pct`; without the field the order has no markup.

## 2026-09-21

**USD payouts to China, Hong Kong and Singapore are not on the partner API yet.** The three USD bank rails can appear in `/api/v1/supported/payment-rails`, and a recipient can hold a destination on them, but a quote or an initiate for a USD payout on any of them returns `400 INVALID_REQUEST` with `provider_confirmation_pending`. Nothing that worked before changes. See [Dollars to China, Hong Kong and Singapore](./api-reference/third-party-payouts.md#dollars-to-china-hong-kong-and-singapore-not-yet).

## 2026-09-18

**Fiat accounts are rebuilt around one id, and the identity endpoints are removed.** The previous fiat account routes are removed with no compatibility window; move to the routes below.

- Open an account with `POST /api/v1/partner/fiat-accounts` and `{user_uuid, currency}`. It is addressed by `fiat_account_id`, a UUID (no `id` field, no `retail_` prefix), which paths, webhooks and orders funded from the account use. `GET /fiat-accounts?user_uuid=`, `GET /fiat-accounts/{fiat_account_id}` and `…/transactions` replace the `/users/{user_uuid}/fiat-accounts` tree and the separate ledger and payments reads; an account that is not yours returns `404`. v1 is receive-only, so every transaction is a `credit`, and a credit that funded an order names it.
- An account's status is `pending`, `active`, `failed` or `closed`; a `pending` account has no pay-in details, and `fiat_account.updated` fires on a change. `fiat_account.deposit.received` fires on every credit to an issued account, with `transaction_id`, the amount, and `order_id` when the deposit funded an on-ramp. `retail.settlement.completed` is no longer published.
- `GET /users/{user_uuid}/identity` and `/identification` are removed: account data comes from the KYC record. When a field is missing, issuance returns `422 ISSUANCE_NOT_READY` and names the fields as `PATCH /api/v1/partner/users/{user_uuid}/kyc` takes them (`address`, `city`, `postal_code`, `dob`, `id_number`, `id_type`). `GET /api/v1/partner/users/{user_uuid}` shows the same up front under `fiat_account_issuance`.
- On-ramp orders paid from the customer's own account have `fiat_funding_source: "own_account"` (was `own_iban`) and carry the `fiat_account_id` they are funded from. `next_action` is still `deposit_to_user_account`, and `confirm-payment-sent` still returns `409 OPERATION_NOT_ALLOWED`.

Error codes removed: `CLIENT_NOT_APPROVED`, `ACCOUNT_HOLDER_NOT_FOUND`, `IDENTIFICATION_MISSING`, `IDENTIFICATION_ALREADY_LINKED`, `HOLDER_REGISTRATION_IN_PROGRESS`, `HOLDER_UNAVAILABLE`. New: `KYC_NOT_CLEARED`, `ISSUANCE_NOT_READY`.

## 2026-09-15

**`interac-e-transfer` destinations no longer require an `institution_id`.** `/api/v1/supported/payment-rails` reports `institution_required: false` for `interac-e-transfer`, because an e-Transfer is addressed to the recipient's email or phone number. Creating a destination without an `institution_id` used to fail with `institution_id is required for this rail`. The same fix was made for the Chinese wallet rails on 2026-08-28.

- Omitting `institution_id` on `interac-e-transfer` now works. The destination resolves to `interac-e-transfers` and goes through the same checks as if you had named it.
- Sending an `institution_id` is still accepted: `interac-e-transfers`, or any bank `/api/v1/supported/institutions?rail=interac-e-transfer` lists.
- Destinations you already created are unchanged.

## 2026-09-14

**An on-ramp order can be paid from the fiat account you issued the customer.** Instead of wiring the order's fiat to a vendor and calling `confirm-payment-sent`, the customer transfers the amount into their own account and the order moves on by itself.

- On-ramp orders carry `fiat_funding_source`: `own_iban` (pay into the customer's own account; renamed `own_account` on 2026-09-18) or `vendor_details` (pay the vendor, as before). Read it on every order: it depends on whether the customer holds a payable account in the order's currency, not on a setting you pass.
- On an `own_iban` order there are no `vendor_payment_details`, `next_action` is `deposit_to_user_account` while the order waits for fiat, and `confirm-payment-sent` is not in `allowed_actions`. Calling it anyway returns `409 OPERATION_NOT_ALLOWED`.
- Open the order first, then have the customer transfer. A transfer is matched to an open order of the same customer by amount, to the cent. Two open orders for the same amount are held for review.
- A deposit that matches no open order is handled as before: it stays on the customer's account, or, if Unigox has switched collection on for you, it is collected into your master account with the `retail.settlement.completed` webhook.

## 2026-09-10

**Fiat account routes moved under the customer.** Superseded by 2026-09-18.

- `GET /partner/users/{user_uuid}/fiat-accounts/{id}`, `…/{id}/ledger` and `…/{id}/payments` replaced `GET /partner/fiat-accounts/{id}` and its children. `GET /partner/fiat-accounts` (every account across your customers) was removed; `GET /partner/fiat-accounts/config` stayed. An account under a different customer returned `404`.
- Business-held accounts were removed from this API and stayed in the Unigox console. `holder_type` and the `retail_` id prefix were unchanged.
- Removed error codes: `INVALID_HOLDER_TYPE`, `LEDGER_NOT_ATTRIBUTABLE`.

## 2026-09-09

**Retail accounts became Fiat accounts, and the `/api/v1/partner/retail/*` endpoints were removed.** Superseded by 2026-09-10 and 2026-09-18.

- Routes moved under the customer, with no separate retail client (`POST .../clients`): `POST /api/v1/partner/users/{user_uuid}/identification` (all fields optional; send what `GET /api/v1/partner/users/{user_uuid}/identity` lists under `missing`), `GET /api/v1/partner/users/{user_uuid}/identification` for status (replacing `POST .../identification/refresh`), `POST /api/v1/partner/users/{user_uuid}/fiat-accounts` to issue, and reads at `/api/v1/partner/fiat-accounts`.
- Responses moved to the standard envelope (`PartnerErrorResponse`) with `SCREAMING_SNAKE` codes (`MISSING_FIELDS`, `CLIENT_NOT_APPROVED`, `PROVISIONING_IN_PROGRESS`, `BANKING_ERROR`, `BANKING_UNAVAILABLE`), validation failures in `error.details.missing_fields`, and `snake_case` fields. `source`, `upstream` and provider identifiers and statuses were removed; `bank_name` and `bic` stayed.
- Business-held accounts became readable on the same routes: `holder_type` (`retail` | `business`), `holder_id` (a `user_uuid` or a KYB case id), filter `?holder_type=`, and opaque ids with the holder kind (`retail_412`, `business_87`). Issuing them stayed in the console.
- Unchanged: enablement by Unigox (`retail` product, `issue_retail_accounts` capability), no money movement, issuance idempotent per (customer, currency, jurisdiction), and `retail.settlement.completed` only when collection is switched on for you.

## 2026-09-08

**You can return a funded escrow to the seller yourself.** An off-ramp order that stops before settlement (the payment window expires, a payment proof is declined, the bank returns the payment, or a dispute is resolved for the seller) leaves the crypto in escrow, owed back. Two new endpoints let you sign that refund with your own key, like the funding pair: `GET /api/v1/partner/orders/{order_id}/refund-authorization-parameters` returns the EIP-712 Safe transaction, and `POST /api/v1/partner/orders/{order_id}/authorize-refund` takes the signature.

- Sign with `signer_address`, which the GET returns. The escrow is a 2-of-3 Safe; on an order you opened for your end customer, its seller-side owner is your wallet, and the customer holds no key. Unigox adds the second signature and executes.
- The recipient is fixed server-side to the escrow's seller address. `recipient_address` comes back so you can verify it before signing; no parameter changes where the money goes.
- Your private key never reaches the API. Sign the returned typed data locally and submit only the signature.
- An order already refunded or released, or whose status does not owe the crypto back, returns `409 INVALID_STATUS`. An order held for review returns `409 OPERATION_NOT_ALLOWED`: Unigox operations settle it, and retrying will not clear it. A signature from a key that does not own the escrow returns `502`; check `signer_address` and retry.
- `tx_hash` comes back when the refund executed. If it is absent the refund is still in flight; poll `GET /api/v1/partner/orders/{order_id}`.

**The order shows when that refund is owed.** Such an order reads `cancelled`, like an order that never funded or whose refund was already paid. Two signals tell them apart:

- On the order: `allowed_actions` contains `authorize-refund` while the crypto is still in the escrow, with `next_action: "authorize_refund"` and an `action_required` block naming the endpoint. It appears only for a funded escrow nothing has moved out of. `cancelled` is the one terminal status worth checking `allowed_actions` on.
- By webhook: the new event `order.refund.required` fires at most once per order, with the same `action_required` block. It is separate from `order.status.changed` because the status does not change. No subscription change is needed; if you receive `order.status.changed` you will receive this.

Neither appears on a widget order: your customer funded that escrow and signs for it in the Unigox app, and the refund endpoints return `404 ORDER_NOT_FOUND` for you there, as every other action endpoint does.

**Correction to the 2026-07-13 fee entry.** Nothing is deducted from an order that does not settle, but the refund is not automatic: once the escrow has been funded, the crypto stays in it until the refund is signed with the endpoints above.

## 2026-08-31

**A sender field too long for the payout rail is refused at initiate, with the limit in the response.** Several sender fields behind `SENDER_IDENTITY_REQUIRED` have a length cap on the rail, and the rail rejects the whole payment at payout, after the customer has funded. `POST /api/v1/partner/offramp/initiate` now treats an over-long value as missing and refuses it while a retry is still free.

- `error.details.field_limits` carries the rail's ceiling on any listed field that has one, keyed the way you write it in the KYC patch: `{"address": 70}`. It is absent when no listed field has a ceiling.
- Read the ceilings from there; do not hard-code them. They differ per corridor and are counted in characters, not bytes (a Chinese address is three bytes per character).
- On the Chinese wallet corridor today: first and last name 60, `address` 70, `city` 50, `id_number` 30. `postal_code` has no published ceiling, and `phone_number` needs none because its required format is shorter than the rail accepts.
- A field can now appear in `missing_fields` because its value is too long, not only because it is absent. Records within the limits are unaffected, and `missing_fields` and `kyc_fields` keep their meaning.
- `PATCH /api/v1/partner/users/{user_uuid}/kyc` still accepts an over-long value, because the KYC record is not tied to a corridor. The corridor's `initiate` refuses it.

## 2026-08-28

**The Chinese wallets are their own rails, and `institution_id` is not required on them.** Alipay and WeChat Pay are no longer formats of `cnaps`: they are the rails `alipay-wallet` and `wechat-wallet`, each carrying one wallet and one format (`full_name`, `account_number`, `mobile_number`). `cnaps` now carries the two bank formats only.

- `/api/v1/supported/payment-rails` reports `institution_required: false` for both wallet rails, and creating a destination on them without an `institution_id` now works. It previously failed with `institution_id is required for this rail`.
- Sending the rail's own institution (`alipay`, `wechat-pay`) is still accepted and means the same thing.
- Nothing changes for `cnaps` bank destinations, which continue to require an `institution_id`.

**Fewer sender fields come back on a payout to those wallets.** The sender identity behind `422 SENDER_IDENTITY_REQUIRED` now reads the identity document from a KYC verification you performed and shared with Unigox, not only from Unigox's own. For a customer verified that way, the name, date of birth, document type and number, issuing country, nationality, gender and country of residence are taken from that verification instead of being reported missing.

- What remains in `missing_fields` is what no identity document carries: the residential address (`address`, `city`, `postal_code`), the mobile number and the source of funds. All five are in `kyc_fields`, so `PATCH /api/v1/partner/users/{user_uuid}/kyc` can supply them.
- Retry with a fresh quote after the patch, as before.

## 2026-08-26

**`allowed_actions` is now empty for a widget order.** It is derived from crypto custody as well as status, so it no longer lists actions that would return `404`. A widget order returns `"allowed_actions": []` at every status, including `awaiting_crypto_transfer_authorization`, where it used to list `["authorize-crypto-transfer", "cancel"]` and both calls then failed.

This closes the gap noted in the 2026-08-25 entry. An action listed in `allowed_actions` on `GET /api/v1/partner/orders/{order_id}` and `GET /api/v1/partner/orders` is one that endpoint will accept.

- Orders you created through this API list exactly what they listed before, at every status.
- Reading a widget order is unchanged. It still appears in listings and webhooks, and `status`, `next_action` and `timeline` still describe it; they describe your customer's step, not one for you to take.
- `[]` does not mean a widget order. Your own orders are also `[]` whenever their status carries no action for you, including `crypto_transfer_authorization_pending`, `fiat_received_confirmed` and `crypto_release_pending`. Do not infer from an empty array that an order is a customer's.
- Keep acting only on order ids your own `initiate` call returned. The action endpoints enforce the same rule.

**Retail accounts: issue dedicated fiat accounts (IBANs) for your own end customers.** Superseded by 2026-09-09 and 2026-09-18. An optional product let an entitled partner register retail clients under its customers, submit their identity for account issuance, issue accounts, and read balances, ledger and incoming fiat payments, under the existing `X-API-Key`.

- Responses used a flat envelope: `{"source":"…","ok":true, …}` on success (payload at the top level, not under `data`), and `{"ok":false,"source":"…","error":"<slug>","detail":"…"}` on error. Provider-origin failures added `upstream`; missing-field errors added a `missing` array. `GET /retail/accounts` returned `source` as an object.
- Enablement was by Unigox: the `retail` product, and for issuing the `issue_retail_accounts` capability. Until then writes returned `403` and `GET /retail/config` reported `enabled: false`. Money movement (funding, swaps, closing, outbound payments) was not on this API.
- Deposits stayed on the customer's account by default, readable via `…/fiat-payments`. Unigox could switch on, per partner, collection into your master account; only then was `retail.settlement.completed` sent.

**Widget callbacks now carry the order id.** The embedded widget's `onTradeStarted` and `onTradeCompleted` callbacks include `orderId` alongside `tradeId`. It is the same `order_id` this API and your webhooks use, so you can read a widget trade with `GET /api/v1/partner/orders/{order_id}`. `tradeId` is a Unigox-internal numeric id; passing it as `order_id` returns `400 invalid order_id format`.

- `orderId` is optional in the callback payload, because a trade opened outside a partner widget has no partner order behind it. Read it defensively.
- `tradeId` is unchanged and still correlates the widget's own events (`onTradeStarted`, `onTradeCompleted`, `onSendout*`) with each other.
- Widget orders remain notify-only; see below.

## 2026-08-25

**Widget orders are notify-only.** Orders your customers create through the embedded widget under your `widgetKey` are attributed to you and still appear in `GET /api/v1/partner/orders` and in your webhooks. They are no longer actionable: every action endpoint (`authorize-crypto-transfer`, `confirm-fiat-received`, `cancel`, `submit-payer-details`, `confirm-payment-sent`, `authorize-bridge`, and the two authorization-parameter reads) returns `404 ORDER_NOT_FOUND` for them. The crypto on a widget order belongs to the end user, while partner actions move crypto from your wallet.

- Orders you created through this API remain fully actionable.
- Webhooks for widget orders keep arriving. Treat them as notifications: `awaiting_crypto_transfer_authorization` on a widget order describes the customer's step, not one for you.
- Neither `status` nor `allowed_actions` distinguishes a widget order yet: a widget order at `awaiting_crypto_transfer_authorization` still lists `["authorize-crypto-transfer", "cancel"]`, and both return `404`. (Fixed on 2026-08-26.)
- Act only on orders you created: keep the `order_id` returned by your own `POST /offramp/initiate` or `POST /onramp/initiate` call. An order id you first learned from a listing or a webhook came from the widget.

## 2026-08-11

**Chinese mobile wallets pay Chinese nationals only, and WeChat pays fewer of them than Alipay.** Both wallets verify the account holder against a Chinese national ID, so a foreign resident's Alipay or WeChat account cannot receive on the `ewallet` format; use a bank format for those beneficiaries.

- `alipay` settles to the sender themselves, to family, or to a third party. (Since 2026-09-01: self or family only; see [Third-party payouts](./api-reference/third-party-payouts.md#who-may-be-paid-on-a-chinese-wallet).)
- `wechat-pay` settles to the sender themselves or to family only. A `wechat-pay` destination quoted as `supplier`, `employee` or `friend` is refused before any money moves.
- The receiving wallet may ask the beneficiary to evidence the declared relationship (proof of income for a payment to the sender themselves, proof of the relationship for family). If the beneficiary cannot, the payment can be held inside the wallet.
- Paying a Chinese company from your company (B2B) is not available on this rail yet.

Nothing changes for the bank formats on `cnaps`, which carry no such restriction.

## 2026-08-07

**Consumer-to-consumer payout rails now require the sender's own identity.** Chinese mobile wallets (Alipay, WeChat Pay: the `ewallet` format on `cnaps`) settle person to person: the remitter shown on the receiving wallet must be your paying customer, not Unigox and not your company. When the customer's KYC record cannot name them, `POST /api/v1/partner/offramp/initiate` returns `422 SENDER_IDENTITY_REQUIRED`. No order is created and the quote is reverted.

- `error.details.missing_fields` is what the rail needs; `error.details.kyc_fields` is the subset you can supply, as the request body of `PATCH /api/v1/partner/users/{user_uuid}/kyc`. Send them, then retry with a fresh quote.
- That endpoint gains four fields: `gender` (`M`/`F`), `nationality` and `id_issue_country` (ISO 3166-1 alpha-2), and `source_of_funds` (a fixed vocabulary; see the endpoint). `id_type` also accepts `RESIDENCE_PERMIT`. An unacceptable value is a `400` with `invalid_gender`, `invalid_country_code`, `invalid_source_of_funds` or `invalid_field_value` (a value sent as an object or an array), and nothing is written: the patch is all-or-nothing.
- A recognised field sent blank is a no-op, not an error: the response is `200` and the field is absent from `updated_fields`, so a patch whose recognised fields are all blank returns `{"updated_fields": []}` and the payout still refuses. Read `updated_fields` before retrying.
- When `kyc_fields` is shorter than `missing_fields`, the remainder (the name on the document, the country of residence) can only come from verification itself: the customer has to complete or redo KYC.

Nothing changes for bank-format payouts, on-ramp, or any corridor other than the wallet formats. Send the customer's own details.

## 2026-07-29

**Third-party recipients are now first-class Partner API resources.** A KYC-verified sender can pay a separately registered recipient without representing that recipient as one of the sender's own payment methods.

- Register and manage recipients under `/api/v1/partner/recipients`, including a versioned payout destination.
- Bind `sender_recipient_relationship` and `purpose_of_payment` for each payment.
- Quote an off-ramp with `sender_id`, `recipient_id`, and `recipient_destination_id`; omit `payment_details_id` for this ownership mode.
- Quote and order responses expose the immutable `recipient_context`. Initiation creates a durable `compliance` case visible in the same Unigox Compliance queue used for portal-created payouts.
- Sensitive identity and account values are write-only or masked on reads. Vendor-specific beneficiary terminology is not exposed by the Partner API.

The KYC user identified by `sender_id` must be the real party funding the payout. Partners must not route multiple real customers through a shared shell sender.

## 2026-07-22

**New KYC status `UNDER_REVIEW` for customers under manual compliance review.** When a customer's screening needs human compliance review, their KYC status is now `UNDER_REVIEW` instead of `IN_PROGRESS`. It appears wherever a KYC status is reported: `GET /partner/users/{user_uuid}/verification-status`, `GET /partner/users/{user_uuid}` (`kyc.status`), the KYC submit response (`kyc_status`), and the `user.kyc.updated` webhook. A manual review can take up to 24 hours, while an automated check takes a couple of minutes, so you can set the right expectation with your customer.

`UNDER_REVIEW` is not cleared: treat it like `IN_PROGRESS` for gating. Keep polling and do not unlock on-ramp or off-ramp until the customer reaches `VERIFIED`. If you already wait for `VERIFIED` before transacting, no action is needed.

## 2026-07-21

**On-ramp and off-ramp price estimates are public.** `POST /api/v1/partner/onramp/estimate` and `POST /api/v1/partner/offramp/estimate` no longer require an API key, like `GET /api/v1/partner/liquidity`. They return indicative pricing only (no liquidity reservation, no quote or order). Executable pricing and order creation still need a key: `POST /partner/onramp/quote`, `/onramp/initiate`, `/offramp/quote`, and `/offramp/initiate`.

No code changes required if you already call estimate with a key; the key is optional for these two endpoints.

## 2026-07-13

**You can charge your end users a per-order markup.** Pass an optional `partner_fee_pct` on the quote and estimate requests for both ramps (`POST /onramp/estimate`, `/onramp/quote`, `/offramp/estimate`, `/offramp/quote`); `1` means 1%. The markup is declared per order (no stored config) and computed in crypto on the same base as the platform fee.

- Off-ramp: the markup is settled on-chain to your partner wallet when the order releases. An order that does not settle is never charged the markup, and its refund returns the full funded amount, markup included. Once the escrow has been funded, the refund is not automatic; see the 2026-09-08 entry.
- On-ramp: there is no separate transfer. The full buyer amount lands in your partner wallet at release, and the markup is withheld when the crypto bridges out at send-out. A crypto-anchored order is sized up beforehand so the requested amount still arrives net of the withheld fee.
- Quote, estimate, initiate, and GET/LIST order responses report the real figures in `fee_breakdown.partner_fee` and `fee_breakdown.partner_fee_pct`, and webhook event `data` carries `partner_fee` / `partner_fee_pct` too. The compact action responses (`confirm-payment-sent`, `confirm-fiat-received`, `cancel`, `authorize-crypto-transfer`) don't carry `fee_breakdown`; re-fetch `GET /orders/{order_id}` for the fee figures after those calls.
- `crypto_amount` excludes the partner fee, with two exceptions:
  - A crypto-anchored on-ramp order (the request declares `crypto_amount`) is sized up so the delivered amount stays exact after the markup is withheld, so `crypto_amount` includes the markup.
  - A crypto-anchored off-ramp order (the request declares `crypto_amount`) carves both fees out of the pinned deposit, so `crypto_amount` and `platform_fee` both change relative to a no-markup request, although the markup itself stays out of `crypto_amount`.
  - In every other case the markup shows only in `fee_breakdown`, and in the off-ramp funding amount from transfer authorization, which is `crypto_amount + partner_fee`.
  - Apply your fee on the same side as the platform does, or your receipts won't reconcile with Unigox orders.
- Fiat-anchored off-ramp orders have no cap: the deposit grows to cover the markup. Every other case has a formula bound, not a business cap: on-ramp rejects `partner_fee_pct >= 100` (the withheld or grossed-up fee would consume the entire buyer amount); crypto-anchored off-ramp rejects it when the fee would consume the entire pinned deposit.

Pricing is unchanged if you don't charge a markup: omit `partner_fee_pct` (or send `0`) and every amount is what it was; only `partner_fee` and `partner_fee_pct` read zero. The platform fee still applies, so `platform_fee` and `total_fee` keep reporting it (with `total_fee` equal to `platform_fee`).

One formatting change reaches every partner, including those not charging a markup: in REST responses, `fee_breakdown.partner_fee` previously always returned the literal `"0.00"` and now carries the token's own decimals, like the other fee fields. A zero-fee USDT order reports `"0.000000"`. The value is unchanged; parse it as a decimal rather than comparing strings. This does not apply to the webhook's `data.partner_fee` field, which always used (and still uses) the shortest round-tripping representation: `"1"`, not `"1.00"`; `"0"` for no fee.

## 2026-06-27

**Customers must be KYC-cleared before on-ramp or off-ramp orders.** Quote and initiate calls (`POST /onramp/quote`, `/onramp/initiate`, `/offramp/quote`, `/offramp/initiate`) return `422 KYC_NOT_CLEARED` if the customer is not cleared; `error.details.kyc_status` carries their current status. Poll `GET /partner/users/{user_uuid}/verification-status` until the customer reaches `VERIFIED`.

No action needed if you already wait for `VERIFIED` before transacting.

## 2026-06-24

**Recipient validation moved to saving payment details.** The recipient field check that ran when you created an off-ramp order now runs when you save the payment details (`POST /api/v1/partner/users/{user_uuid}/payment-details`):

- If a required recipient field is missing or malformed for the payout corridor, the request is rejected with `422 Unprocessable Entity` and the `error` message names the fields. Fix them once, before the details are used in any order.
- `POST /api/v1/partner/offramp/initiate` no longer returns `RECIPIENT_UNVERIFIABLE`: saved payment details have already passed field validation. Quote and funds checks at initiate are unchanged.
- This is the only recipient validation; there is no second check at order time. It confirms the details are complete and well-formed for the corridor, not that the destination account exists. If the validation service is temporarily unavailable, the payment details are still saved, so save them before you need them.

No action needed if you already save payment details before ordering. Corridors without recipient requirements are unchanged.

## 2026-06-22

**Off-ramp orders now validate the recipient details before the order is created.**

For payout corridors with recipient requirements (e.g. mobile money and bank transfers in Nigeria, Ghana, and Kenya), `POST /api/v1/partner/offramp/initiate` now checks the recipient up front:

- If a required recipient field is missing or malformed, the request is rejected with `422 RECIPIENT_UNVERIFIABLE` and the fields are listed in `error.details.fields`. Fix the details and create a new order.
- Name requirements are corridor-specific: bank transfers expect the account-holder name, while mobile money pays to the number and accepts a placeholder name.
- This confirms the recipient details are complete and well-formed, not that the destination account exists. If the up-front check can't be completed, the order is still created and the recipient is re-checked before payout.

Corridors without recipient requirements are unchanged; no action required.
