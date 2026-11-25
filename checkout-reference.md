# Crypto processing: reference

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Crypto processing guide:** [Get started](https://developers.unigox.com/tutorials/crypto-checkout) · [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · **Reference**

## Networks and coins

`GET /config` always has the current list; a network or coin Unigox turns off disappears from the checkout at once. "Credited in about" is an estimate from each network's confirmations, block time and Unigox's processing time.

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

- **Each coin is credited one for one** to your Unigox wallet in the same coin: a USDG payment arrives as USDG.
- **Native coins** (ETH, TRX, TON, SOL and others) are not taken.
- **A coin or network the page does not offer** is not credited to the payment and not returned by itself. The payer contacts you, and you write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed.
- **Minimums.** A payment link asks for at least 1.00 USD. A transfer below the minimum of its coin and network, shown on the page, is neither credited nor returned.
- **Count a payment only once it is credited** (`DONE` and `COMPLETED`), never when the checkout shows it as seen or confirming.

## Limits

| What | Limit |
| --- | --- |
| Received before your business is verified | 1,000 USD in all. Then new links, invoices and deposit addresses wait for verification; payments to existing ones still arrive. |
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

**Is there an API key?** No. The checkout and checking a payment need nothing secret. Creating links and reading your history are signed with your wallet's private key.

**Why does my server need my whole wallet's key?** A payment address is reserved by the wallet that owns it, and Unigox has no key that can only reserve addresses or only read payments yet. Keep the wallet's balance low and the key in a secrets store.

**Can my customer pay from an exchange?** Yes, when it can withdraw the chosen coin on the chosen network. The customer must cover the withdrawal fee; a small shortfall within the allowance still counts as paid.

**What if they pay too little, too much or late?** Too little shows as `underpaid`, and the customer can send the rest to the same address. More is credited as `overpaid`. A payment that needed a transfer after the pay-by date is `paid_late`. In each case your server decides about the order.

**Can I refund a payment?** Yes: confirm an address and network with the payer, then send the money from your Unigox wallet. This is separate from Unigox returning a transfer it could not credit.

**Which languages does the checkout speak?** English, Spanish, French and Portuguese. It follows the payer's browser, or the `locale` you pass.

**What does it cost?** Write to support@unigox.com.

## Types

`https://www.unigox.com/checkout.d.ts` declares `window.UnigoxCheckout` for TypeScript: every option, method, callback, status, payload field and error code. Copy it into your project.

## Versions

`https://www.unigox.com/checkout.js` is version 1. It updates in place, and every update keeps the options, methods, callbacks and events above working. A change that is not compatible ships as a new file (`checkout.v2.js`), and version 1 keeps working for at least 90 days after it.

Within version 1, Unigox may add events, statuses, payload fields, options and error codes: let your page ignore what it does not know. Unigox never removes or renames one, never changes a field's type, and never changes what `livemode`, `paid` or `onComplete` mean without a new version.

The API address and the link check address are hosting addresses and can change: keep them in your configuration.

## Changes

- **2026-11-25:** the guide is rewritten around tasks. Crypto processing opens before verification, up to 1,000 USD received. Money: no change to how payments are credited.
- **2026-11-15:** portal setup starts in **Checkout**; invoice links keep their document in the checkout; several transfers in one Solana transaction can be listed. Money: listing a transfer never counts it as a credit.
- **2026-11-02:** `checkout.d.ts` lists the `onClose` reason `return`. Money: no change.
- **2026-10-30, 1.1.0:** the checkout follows the payer's browser language (`locale: "auto"`); TypeScript types at `/checkout.d.ts`. Money: no change.
- **2026-10-29, 1.0.1:** a closed window stops checking until it opens again. Money: no change.
- **2026-10-27, 1.0.0:** first version: window, embedded and payment page, `bind()`, the events and the fallback.

None of these is in production yet: the first public release is early access.

## Payment notifications

Unigox does not send payment notifications to your server yet, and links made in the portal never will: build nothing for them. Your server confirms payments as [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) shows. This page will describe notifications when Unigox turns them on.
