# Payments API: payment addresses for your own payment page

> **Most businesses do not need this page.** To get paid, send payment links from the business portal: no code. To take payments on your website, show Unigox Checkout there. Both are described under [Unigox Checkout and the business portal](#unigox-checkout-and-the-business-portal) below.

This page is for developers who build their own payment page on the Unigox payments API. Give each invoice its own payment address, reserved for its reference, and let the customer pay in a supported coin.

The invoice reference is stored as the **memo** of the payment address: a text Unigox keeps with the address and returns only to you. Payments are standard token transfers, without an on-chain memo or tag.

## Unigox Checkout and the business portal

> **Not available yet.** Crypto processing is in early access. Unigox turns it on for your business; then payment links, deposit addresses and the checkout appear in your business portal. Until this notice is gone, the pages this section links to can answer 404.

You do not need code to take payments: the [crypto processing help](https://www.unigox.com/crypto-processing/help) explains payment links, deposit addresses for repeat customers and the checkout for your site in plain words, and [Payment links](https://www.unigox.com/crypto-processing/help/payment-links) shows every step.

You do not have to build the payment page yourself. Unigox Checkout shows it for you, as a hosted page, in a window over your site or inside your page, and the business portal makes payment links and customers' deposit addresses without code: see [Accept crypto payments with Unigox Checkout on your website](https://developers.unigox.com/tutorials/crypto-checkout). Building your own payment page on the API, as the rest of this page describes, is for special cases: your page then has to keep up with every network, coin and payment state the checkout already handles.

With Unigox Checkout or the business portal, write the memo as `<reference> · <amount> USD`, for example `NW-20418 · 250.00 USD` (a space, a middle dot U+00B7, a space). The checkout then checks the amount against the memo, and the portal shows the payment as paid, underpaid or overpaid instead of only credited. Links made in the portal add their terms after it; the checkout guide's [Link format](https://developers.unigox.com/tutorials/crypto-checkout-links#link-format-advanced) section describes that form.

For a customer who pays again and again, give them permanent deposit addresses with the memo `Top-up · <customer reference> · <tag>`: the portal does it under **Deposit addresses**, and the checkout guide's [Customer deposit addresses](https://developers.unigox.com/tutorials/crypto-checkout-links#customer-deposit-addresses) shows how your server does it and credits each deposit.

Production callbacks are off today: `GET /config` answers `memoLimits.maxCallbackUrlBytes: 0`. Confirm payments by reading their status: the public `GET /transaction/{fromChain}/{fromTx}` needs no key, and wallet-signed history covers every payment.

## Words used on this page

| Word | Meaning |
| --- | --- |
| Payment address | An address of your wallet that customers send to. One address serves all Ethereum-style networks (`chainType` `evm`); TRON (`tvm`), TON (`ton`) and Solana (`svm`) have one each. |
| Reserve an address, end the reservation | Reserving puts your memo on a payment address, so every transfer to it counts for that invoice. Ending the reservation takes it off. "Get a new address" makes an address and reserves it in one request. The request paths you type for these are below. |
| Address ID (`lockId`, `memoLockId`) | The number of one reserved address. Answers name the field `lockId`, history `memoLockId`. |
| Memo fingerprint (`memoHash`) | keccak256 of the memo. Public transfer records carry it, never the memo text. |
| Your Unigox wallet | Where every payment is credited. "Balance" is only ever an amount in it. |
| `UNIGOX_BALANCE_CHAIN_ID` (`660279`) | A fixed number Unigox uses to mark a payment as credited to your wallet. Copy it as is; nothing needs to be done on that network. |

## Payment flow

The Unigox payments API gives you payment addresses, reserves them for your invoice references, credits each payment to your Unigox wallet and, where callbacks are on (not in production yet), sends a signed `deposit.credited` webhook. Copy its address from the business portal's **Crypto processing → Developers** page (**API address**) and keep it in your configuration, `UNIGOX_PAYMENTS_API` below.

1. Read `GET /config`. Callbacks are available only when `memoLimits.maxCallbackUrlBytes` is above 0 and `webhookKeys` lists at least one key.
2. Get a payment address with `POST /memo-locks/allocate`. The signed request contains the invoice reference (the memo; for Unigox Checkout, in the format given [above](#unigox-checkout-and-the-business-portal)) and a `callbackUrl`. The `callbackUrl` is your public HTTPS receiver when callbacks are available, otherwise `""`. A non-empty URL while callbacks are unavailable is refused with 400 `validation_callback_url_invalid`. Existing addresses can be reused as described below.
3. Wait for the selected network to be ready, then display the payment address, network, coin and amount on your page.
4. With a callback URL, receive the signed `deposit.credited` webhook. Its `memoLockId` identifies the invoice's reservation; its `intentId` identifies the payment. Without one (and in production today, where callbacks are off), read wallet-signed history for the reservation, or the public transaction status of each transfer you know of.
5. Retrieve transaction status or wallet-signed history to confirm the credited amount, coin and recipient. A payment is confirmed only by a completed, non-refunded credit matching the invoice. Any webhook used must also pass signature verification.

Signing schemas, request and response formats, and webhook authentication are defined in the [API reference: payment addresses](api-reference/payment-addresses.md).

## Address reuse

Payment addresses can serve successive invoices. Reuse an address only when its last payment was paid in full and credited, and 7 days have passed since you ended its reservation; never reuse the address of an open, partly paid or closed-unpaid invoice: get a new one instead. A second transfer from the same payer, such as a double send or an exchange retrying a withdrawal, can arrive after the invoice is paid; after reuse it counts toward the new invoice. The business portal works this way: it takes a new address while an address type holds less than 80 % of its limit of 1,000 addresses, and only past that reuses the address of a link that was paid in full and closed at least 7 days ago, longest idle first. It never takes the address of an open link, of a partly paid or unpaid link, or of a customer's deposit page.

Reuse consists of two signed requests:

1. End the previous reservation with `POST /memo-locks/unlock`.
2. Reserve the address for the new invoice reference and callback URL (or `""`) with `POST /memo-locks/lock`.

Reuse keeps the address and creates a new address ID (`lockId`). The new reservation is `ACTIVE`. [Network readiness](api-reference/payment-addresses.md#network-readiness) is reported separately in `monitoring`. Delayed webhooks keep the address ID of the original deposit.

A deposit counts for the memo reserved at the deposit's on-chain time. Deposits during the new reservation carry the new invoice reference; deposits between two reservations have no memo. Ending a reservation, or its expiry, does not stop transfers to the address. If reserving the address again after ending its reservation fails, the address stays without a memo until a reservation succeeds, and a deposit in between is credited without an invoice reference: retry the reservation, or match such deposits through history by payment address.

## Networks and coins

| `chainType` | Payment address |
| --- | --- |
| `evm` | One address for every supported Ethereum-style network |
| `ton` | TON |
| `svm` | Solana |
| `tvm` | TRON |

Payments are taken in the configured ERC-20 tokens on Ethereum-style networks, TRC-20 tokens on TRON, jettons on TON and SPL tokens on Solana. Native coins such as ETH, TRX, TON and SOL are not taken. Your Unigox balance's network (chain ID `660279`) is where payments are credited, not a network customers pay on.

`GET /config` includes inactive and native assets as well as the coins customers can pay with. Offer a coin only on an active network, when it is an active, non-native token with exactly one matching coin on your balance's network, and your payment address is ready on that network. The [supported payment assets](api-reference/payment-addresses.md#supported-payment-assets) section defines the fields and matching rules.

A coin or network your page offers is credited. Payments on a network or in a coin it does not offer are not credited and not returned by themselves: the customer contacts you, and you write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed.

## Credit to your wallet

Your Unigox wallet owns your payment addresses and signs every reservation, on all four address types.

Payments are credited to your **Unigox wallet** (marked by chain ID 660279, `UNIGOX_BALANCE_CHAIN_ID`); nothing needs to be done on that network. Transaction status gives the credited coin, amount, recipient and transaction hash. The webhook's `fromAmount` is the deposit as sent. In status and history, `toAmount` is the expected credited amount; `actualToAmount`, when present, is the confirmed amount received. Use the confirmed amount for reconciliation, falling back to `toAmount` on older completed records that lack it.

See [quoted amounts and confirmed receipts](api-reference/payment-addresses.md#quoted-amounts-and-confirmed-receipts) for the response fields.

## Payment records

An address can receive several payments under one memo. Invoice totals, partial payments and overpayments are managed by your application. A reservation does not enforce a payment amount or start refunds.

Webhook delivery can repeat when an acknowledgement is not received or recorded. Retries keep the same event ID. Deduplicate events by `(environment, type, id)` and payments by `(environment, intentId)`. A transaction can contain several payments, each with its own intent.

The webhook body does not include `environment`. It comes from the receiver configuration: a separate callback URL for each environment, or distinct environment-specific verification keys for a shared URL. See [environment and event identity](api-reference/payment-addresses.md#environment-and-event-identity).

`POST /transactions/history` returns your incoming and outgoing records with a wallet signature and no Unigox account. Memo fields are omitted by default; a signed `includeMemo: true` includes your invoice references. Filters support the original reservation and the payment address.

History covers payments whose callbacks were missed or exhausted their retries. It keeps the original invoice reference after an address is reused. See [wallet transaction history](api-reference/payment-addresses.md#wallet-transaction-history) for signing, pagination and reconciliation.

Amounts are integer strings in token base units. The source and destination token decimals determine their respective scales. Keep them as strings or use integer arithmetic such as `BigInt`: JavaScript `Number` can lose precision on 18-decimal tokens.

The memo text is returned only to you, but its `memoHash` is public in transaction status. A predictable reference, such as a sequential order number with its amount, can be matched to its public transfer by anyone who guesses it. Keep personal data out of references, and add a random part to them.
