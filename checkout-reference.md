# Crypto processing: reference

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Crypto processing guide:** [Get started](https://developers.unigox.com/tutorials/crypto-checkout) · [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · **Reference**

## Words this guide uses

Each word has one meaning on every page. The last column is its name in the API, where the two differ.

| Word | What it means | In the API |
| --- | --- | --- |
| Payment link | A link for one order: `https://www.unigox.com/pay/{token}`. Its token holds the amount, the reference and the payment addresses. | The token: [The link format](https://developers.unigox.com/tutorials/crypto-checkout-links#the-link-format) |
| Checkout | What the payer sees when a payment link opens: on a Unigox page (the payment page), in a window over your page, or inside your page. | `checkout.js` |
| Reference | The text that names your order on a payment, for example `NW-20418 · 250.00 USD`. Only your wallet can read it back. | `memo` |
| Payment address | An address the payer sends coins to. An order has one for each address type you accept. | `address`, `depositAddress` |
| Address type | Networks that share one address format: `evm` (Ethereum and the networks built like it), `tvm` (TRON), `ton` and `svm` (Solana). | `chainType` |
| Reservation | A payment address held for one reference. While the reservation is active, every transfer to the address is recorded under that reference. Ending it closes the link. | `memo-locks`, `lock` |
| Address ID | The number of a reservation. An address gets a new one each time it is reserved again. | `lockId`; on a payment, `memoLockId` |
| Fingerprint | The keccak-256 hash of the reference. It is public; the reference is not. | `memoHash` |
| Transfer | One movement of coins on a network. One transaction can hold several transfers. | `quoteId` names one transfer |
| Credited | The money is in your Unigox wallet. Only a credited payment counts as paid. | `status: "DONE"` with `subStatus: "COMPLETED"` and no `refund` |
| Unigox wallet | Your balance at Unigox, and its `0x` address. It receives every payment and owns your payment addresses. | `wallet`, `recipientAddress` |
| Allowance | How far short a payment may be and still count as paid: 0.5 % of the amount, and never more than 1.00 USD. | `tol` |
| Pay-by date | The time the payer is asked to pay by. The page shows it; a payment after it is still credited. | `x` in the token |
| Deposit page | A page with one customer's permanent payment addresses. It has no amount due. | `p: "topup"` in the token |
| Link check | The request the payment page makes before it shows an address: is this address still reserved for this link? | [Link check](https://developers.unigox.com/api-reference/payment-addresses#link-check) |

## Networks and coins

`GET /config` always has the current list. When Unigox turns a network or a coin off, the checkout stops offering it at once. "Credited in about" is an estimate: the network's confirmations and block time, plus Unigox's processing time.

<!-- networks:start -->
| Network | Chain id | Coins | Credited in about |
| --- | --- | --- | --- |
| Ethereum | `1` | USDT, USDC, USDG | 4 min |
| Base | `8453` | USDC | 1 min |
| Arbitrum | `42161` | USDT, USDC, USDG | 1 min |
| Polygon | `137` | USDT, USDC | 6 min |
| Optimism | `10` | USDT, USDC, USDT0 | 1 min |
| BNB Smart Chain | `56` | USDT, USDC | 1 min |
| Avalanche | `43114` | USDC | 1 min |
| Unichain | `130` | USDT, USDC | 1 min |
| HyperEVM | `999` | USDT, USDC | 1 min |
| Robinhood Chain | `4663` | USDG | 1 min |
| TRON | `728126428` | USDT | 1 min |
| TON | `69696969420` | USDT | 1 min |
| Solana | `1151111081099710` | USDT, USDC, USDG | 1 min |
<!-- networks:end -->

- **You receive the coin that was sent.** A USDG payment arrives in your Unigox wallet as USDG, in the same amount. Unigox does not convert it.
- **Native coins are not accepted:** ETH, TRX, TON, SOL and the like.
- **A coin or a network the page did not offer.** Such a transfer is not credited to the payment, and Unigox does not return it automatically. The payer contacts you; you write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed.
- **Minimums.** A payment link is for at least 1.00 USD. Each coin and network also has a minimum transfer, which the page shows. A transfer below it is neither credited nor returned.
- **Count a payment only once it is credited** (`DONE` with `COMPLETED`). A transfer that the checkout shows as seen or confirming is not a payment yet.

## Limits

| What | Limit |
| --- | --- |
| Received before your business is verified | 1,000 USD in total. After that you cannot create links, invoices or deposit addresses until your business is verified. Payments to existing ones still arrive. |
| Payment link amount | At least 1.00 USD, up to two decimals |
| Allowed shortfall | 0.5 % of the amount, never more than 1.00 USD. Invoices, and links made with `tol: "none"`, allow none. |
| Addresses per address type | 1,000; write to support@unigox.com to raise it |
| Reference text | 256 bytes |
| Transfers followed per payment | 200 |
| Signed request deadline | 10 minutes ahead at most |

## Troubleshooting

| What you see | What to do |
| --- | --- |
| The payer sees "This payment link can't be used" (`TOKEN_INVALID`) | The link was edited, or its addresses are not reserved for it any more. Copy it again from **Payment links**, or build it again from your server's answers. |
| The payer sees "This payment link doesn't work" | The link was cut off. Send the whole link again. |
| The payer sees "We couldn't check this payment link" (`CHECKOUT_UNAVAILABLE`) | Unigox did not answer, or too many checks came from the payer's network. Nothing is wrong with the link: the payer presses **Try again**. |
| The payer sees "This payment request is closed" | The link was closed, or a newer payment uses its address. Create a new link. |
| The payer sent money but the checkout shows nothing | The checkout counts only the coins and networks it offered, sent to the address it showed. Look the payment up in **Payments**, or ask the payer for the transaction hash. |
| The payer sees "Payment arrived after this link was closed" | The transfer reached the address after the link was closed, so it carries no order reference. It is in your wallet: match it to the order yourself in **Payments**. |
| The window always shows **Continue to secure checkout** | Your Content Security Policy blocks the checkout. Add `https://www.unigox.com` to `frame-src`. |
| `UnigoxCheckout is not defined` | `checkout.js` did not load (an ad blocker, the network, your `script-src`). Send the payer to the payment page when `window.UnigoxCheckout` is missing. |
| A deposit is missing from the customer's page | The page lists deposits from the time the customer's first address was made, on the coins and networks it offers. The customer can find a deposit by its hash with **Deposit missing? Find it by its hash**. Otherwise look the address up in **Payments**. |
| A deposit was credited twice in your system | Count each deposit once by its `quoteId`, in the same database transaction that adds it to the balance, never by the transaction hash alone. |
| An API error | See the error table in the [API reference](https://developers.unigox.com/api-reference/payment-addresses#errors). |

## Questions

**Do I need a developer?** Not for payment links, invoices, deposit pages or a payment button for a link you made in the portal. You need one to create links for every order from your server, or to confirm payments on your server.

**Is there an API key?** No. Showing the checkout and checking a payment need nothing secret. To create links or read your payment history, your server signs its requests with your wallet's private key.

**Why does my server need the key of my whole wallet?** A payment address is reserved by the wallet that owns it. Unigox has no narrower key yet, one that could only reserve addresses or only read payments. Keep the wallet's balance low and the key in a secrets store.

**Can my customer pay from an exchange?** Yes, if the exchange can withdraw the chosen coin on the chosen network. The customer covers the withdrawal fee. If the exchange takes the fee out of the amount, a shortfall within the allowance still counts as paid.

**What if the customer pays too little, too much or late?** Too little shows as `underpaid`: the customer can send the rest to the same address. Too much is credited in full and shows as `overpaid`. A payment that was completed only after the pay-by date shows as `paid_late`. In each case your server decides what happens to the order.

**Can I refund a payment?** Yes. Agree an address and a network with the payer, then send the money from your Unigox wallet. Unigox does not do this for you. It is a different thing from Unigox sending back a transfer it could not credit.

**Which languages does the checkout have?** English, Spanish, French and Portuguese. It follows the payer's browser, or the `locale` you pass.

**What does it cost?** Write to support@unigox.com.

## Types

`https://www.unigox.com/checkout.d.ts` declares `window.UnigoxCheckout` for TypeScript: every option, method, callback, status, payload field and error code. Copy it into your project.

## Versions

`https://www.unigox.com/checkout.js` is version 1. Unigox updates the file in place, and every update keeps the options, methods, callbacks and events of [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) working. A change that would break your page ships as a new file (`checkout.v2.js`), and version 1 keeps working for at least 90 days after that.

Within version 1, Unigox can add events, statuses, payload fields, options and error codes: write your page so that it ignores the ones it does not know. Within version 1, Unigox does not remove or rename any of them, does not change a field's type, and does not change what `livemode`, `paid` or `onComplete` mean.

The API address and the link check address can change: keep both in your configuration, not in your code.

## Changes

- **2026-11-26:** the guide is rewritten in plainer words, with [Words this guide uses](#words-this-guide-uses). The onboarding no longer asks whether you can link payments to customers. The limit before verification shows on every page. Money: no change.
- **2026-11-25:** the guide is rewritten around tasks. Crypto processing opens before verification, up to 1,000 USD received. Money: no change to how payments are credited.
- **2026-11-15:** portal setup starts in **Checkout**; invoice links keep their document in the checkout; several transfers in one Solana transaction can be listed. Money: listing a transfer never counts it as a credit.
- **2026-11-02:** `checkout.d.ts` lists the `onClose` reason `return`. Money: no change.
- **2026-10-30, 1.1.0:** the checkout follows the payer's browser language (`locale: "auto"`); TypeScript types at `/checkout.d.ts`. Money: no change.
- **2026-10-29, 1.0.1:** a closed window stops checking until it opens again. Money: no change.
- **2026-10-27, 1.0.0:** first version: window, embedded and payment page, `bind()`, the events and the fallback.

None of these is in production yet: the first public release is early access.

## Payment notifications

Unigox does not send payment notifications (webhooks) to your server yet, so there is nothing to build for them. Your server asks for each payment's status itself, as [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) shows. When Unigox turns notifications on, this page will describe them. Links made in the portal will not send them even then.
