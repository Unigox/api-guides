# Crypto processing: reference

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Crypto processing guide:** [Get started](https://developers.unigox.com/tutorials/crypto-checkout) · [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Deposit pages and signed links](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · **Reference**

## Words this guide uses

Each word has one meaning on every page. The last column is its name in the API, where the two differ.

| Word | What it means | In the API |
| --- | --- | --- |
| Order | One payment your server asks Unigox to take: an amount in USD, your order number and, if you like, your customer. Your server creates it with your API key. Every payment on your website is a new order. | `POST /api/v1/partner/crypto/orders`; its `id` is `ord_…` |
| Order token | What opens an order's checkout: `o_` and the 24 characters of the order's `id`. It names the order and holds nothing else. | `token`; the payment page is `payUrl` |
| API key | Your partner key. Your server sends it in the `X-API-Key` header to create and read orders. Never put it in a web page. | `X-API-Key` |
| Payment link | A link for one payment that you make in the portal or that your server signs: `https://www.unigox.com/pay/{token}`. Its token holds the amount, the reference and the payment addresses. | The token: [The link format](https://developers.unigox.com/tutorials/crypto-checkout-links#the-link-format) |
| Checkout | What the payer sees when an order or a payment link opens: on a Unigox page (the payment page), in a window over your page, or inside your page. | `checkout.js` |
| Reference | For an order, your order number. For a payment link, the text that names your order, for example `NW-20418 · 250.00 USD`; only your wallet can read it back. | `reference` on an order; `memo` on a link |
| Payment address | An address the payer sends coins to. An order or a link has one for each address type it accepts. | `address`, `depositAddress` |
| Address type | Networks that share one address format: `evm` (Ethereum and the networks built like it), `tvm` (TRON), `ton` and `svm` (Solana). | `family` on an order; `chainType` on a link |
| Rest | The 24 hours an order's address waits after the order ends before another order can take it. A late transfer from the last payer then cannot land in the next order. | none |
| Reservation | A payment address held for one reference of a link. While the reservation is active, every transfer to the address is recorded under that reference. Ending it closes the link. | `memo-locks`, `lock` |
| Address ID | The number of a reservation. An address gets a new one each time it is reserved again. | `lockId`; on a payment, `memoLockId` |
| Fingerprint | The keccak-256 hash of a link's reference. It is public; the reference is not. | `memoHash` |
| Transfer | One movement of coins on a network. One transaction can hold several transfers. | `quoteId` names one transfer |
| Credited | The money is in your Unigox wallet. Only a credited payment counts as paid. | `credited` on an order's payment; `status: "DONE"` with `subStatus: "COMPLETED"` and no `refund` on a transfer |
| Unigox wallet | Your balance at Unigox, and its `0x` address. It receives every payment and owns your payment addresses. | `wallet`, `recipientAddress` |
| Allowance | How far short a payment may be and still count as paid: 0.5 % of the amount, and never more than 1.00 USD. | `tol` in a link's token; `tolerance` in the examples |
| Pay-by date | The time the payer is asked to pay by. An order stops taking payments at it; a link's page only shows it. | `expiresAt` on an order; `x` in a link's token |
| Deposit page | A page with one customer's permanent payment addresses. It has no amount due. | `p: "topup"` in the token |
| Link check | The request the payment page makes before it shows an address: is this address still reserved for this link? | [Link check](https://developers.unigox.com/api-reference/payment-addresses#link-check) |

## Orders API

Your server calls these with your partner API key in the `X-API-Key` header, at `https://api.unigox.com` (`https://api-staging.unigox.com` on a test account). The API reference lists them under **Crypto Processing**.

| Request | What it does |
| --- | --- |
| `POST /api/v1/partner/crypto/orders` | Creates an order. `201` with the order, or `200` with the existing order for a repeated `reference` |
| `GET /api/v1/partner/crypto/orders/{id}` | The order with what it received and its payments |
| `POST /api/v1/partner/crypto/orders/{id}/close` | Closes an order that is not paid. No body |
| `PUT /api/v1/partner/crypto/customers/{external_id}` | Creates or updates your customer under your own id |
| `GET /api/v1/partner/crypto/customers/{external_id}` | The customer with their latest 20 orders, newest first |

`{id}` is the order's `id` (`ord_…`) or its `token` (`o_…`). `{external_id}` is your own id for the customer, URL-encoded.

Every answer is `{"status": "…", "code": <HTTP status>, "data": {…}}`. The order is in `data`, so its token is `data.token`. An error is `{"status": "bad_request" or "order_failed", "code": <HTTP status>, "details": "<error code>"}`, with `field` on a `400`. A missing or unknown API key answers `401` with `{"success": false, "error": …}`.

### Create an order

| Field | Required | Value |
| --- | --- | --- |
| `reference` | Yes | Your order number, 1 to 64 characters. The payer sees it. |
| `amount` | Yes | USD as a string with up to 12 digits and up to two decimals, at least `"1.00"`. A JSON number is accepted too. |
| `merchantName` | No | The name the payer sees, up to 64 characters. Without it the payer sees your partner account's name, written as the portal writes it (`acme-shop-12` becomes `Acme shop`). The name under **Settings → Shown to the payer as** is kept in your browser, so orders never use it: send `merchantName` with every order. |
| `currency` | No | `"USD"`. Orders are in USD; any other value answers `400` with `field` `currency`. |
| `description` | No | Text about the order for the payer, up to 140 characters. |
| `customer` | No | `{"id": "…", "name": "…", "email": "…"}`. `id` is your own id for the customer, 1 to 64 characters (one with `/` in it cannot be read back by its path, so avoid `/`); `name` is up to 120 characters; `email` up to 254 and must look like an email address, or be `""`. The customer is created, or their name and email updated; a field you leave out keeps its stored value, and `""` clears it. |
| `expiresInMinutes` | No | How long the order takes payments: 5 to 10,080 minutes (7 days). Default 60. |
| `returnUrl` | No | An `https://` page of your site, up to 2,048 characters, without a user name or password. The payment page offers it as a link back to you and never opens it by itself. |

Texts the payer reads (`merchantName`, `reference`, `description` and the customer's fields) refuse control characters, line breaks among them, and the characters that change the direction of text (U+202A to U+202E, U+2066 to U+2069). Spaces at either end are removed. Fields the API does not know are ignored.

### The order

| Field | Value |
| --- | --- |
| `id` | `ord_` and 24 letters and digits. Keep it with your order to read the order later. |
| `token` | `o_` and the same 24 characters. Give it to `checkout.js`. |
| `payUrl` | The order's payment page, `https://www.unigox.com/pay/o_…`. Use it as it is. |
| `merchantName` | The name the payer sees: the one you sent, or your partner account's name |
| `reference`, `description`, `returnUrl` | As you sent them. `description` is `""` and `returnUrl` is `null` when you sent none. |
| `amount`, `currency` | The amount due with two decimals, such as `"25.00"`, and `"USD"` |
| `status` | See [Order statuses](#order-statuses) |
| `received` | USD credited to the order so far, with two to six decimals (`"0.00"`, `"24.995"`). The sum of its `credited` payments. |
| `createdAt`, `expiresAt` | When the order was created, and when it stops taking payments. UTC, such as `"2026-11-26T10:00:00.000000Z"`. |
| `closedAt` | When the order ended: when Unigox found it paid, when you closed it, or `expiresAt` when its time ran out. `null` until then. An order whose time ran out can keep `null` until 15 minutes after `expiresAt`. |
| `addresses` | `[{"family": "evm", "address": "0x…"}, …]`: one payment address for each address type that had a free address when the order was created |
| `customer` | `{"id", "name", "email"}`, or `null`. A name or email that was never sent is `""`. |
| `payments` | When you read or close the order: every transfer that counts for it, oldest first (below) |

Each payment:

| Field | Value |
| --- | --- |
| `txHash` | The transaction on the network the payer sent from |
| `chainId` | That network, a number: see [Networks and coins](#networks-and-coins) |
| `coin` | The coin sent, such as `"USDT"`; `""` when Unigox has no symbol for it |
| `amount` | What the transfer is worth in USD: the amount credited to your wallet, one for one. `""` when Unigox cannot read the coin's decimals; such a payment is not counted. |
| `status` | `credited` (in your wallet, counted in `received`), `pending` (on its way; it counts once credited, also after the order ended), `on_hold` (stopped for a compliance review; it counts if credited), `failed` (not credited) or `refunded` (sent back, or marked to be) |
| `at` | When the transfer was mined on its network; before that, when Unigox first saw it |

A transfer counts for the order when it was sent between one minute before the order was created and 15 minutes after the order ended. The order ends at `expiresAt`, or earlier when you close it or when Unigox finds it paid: `closedAt` says when. A transfer to the same address outside that time is not the order's: it still reaches your wallet, and it appears in the portal's **Payments** under **Needs attention**, with no order.

### Order statuses

| `status` | What it means | Ship? |
| --- | --- | --- |
| `open` | Nothing credited yet. Before `expiresAt` the order takes payments. In the 15 minutes after `expiresAt`, `open` means a transfer sent in time is still on its way. | No. Wait. |
| `partly_paid` | Some money credited, short of the amount by more than the allowance. Before `expiresAt` the payer can send the rest, on any network the order offers. | No. Wait. |
| `paid` | The amount credited, or short of it by at most 0.5 % and never more than 1.00 USD. It never goes back to another status; a later credit inside the window can make it `overpaid`. | Yes |
| `overpaid` | More than the amount credited. The extra is in your wallet. | Yes. Settle the extra with your customer. |
| `expired` | The time ran out before the order was paid; `received` says what came. In the 15 minutes after `expiresAt`, an order with nothing credited and nothing on its way already reads `expired`. 15 minutes after `expiresAt`, every order that is still `open` or `partly_paid` ends as `expired`, whatever came and whatever is still on its way. | No. If `received` is above `"0.00"`, settle that part with your customer. |
| `closed` | You closed the order before it was paid. `received` says what came. | No |

**When a status is final.** A transfer counts for an order when it was sent inside the order's window: from one minute before the order was created until 15 minutes after it ended. A transfer sent inside the window that is credited later still counts, also after the order has ended. So `expired` and `closed` turn `paid` or `overpaid` when such a transfer brings the order to its amount, and `paid` can turn `overpaid`. A status is final once the window has passed and none of the order's `payments` is `pending` or `on_hold`.

An order that is not paid gives up its addresses 15 minutes after `expiresAt` at the latest; they then rest 24 hours.

### Customers

`PUT /api/v1/partner/crypto/customers/{external_id}` takes `{"name": "…", "email": "…"}`, both optional, with the same limits as an order's `customer`: a field you leave out keeps its stored value, and `""` clears it. Send `{}` to create a customer with only an id; a request without a body answers `400` with `field` `body`. A refused value names `customer.id` (the id in the path), `customer.name` or `customer.email`. An id with `/` in it cannot be used in the path, even URL-encoded (`404` with a plain-text body): give customers ids without `/`. The answer (`customer_saved`) is `{"id", "name", "email", "createdAt", "updatedAt"}`. `GET` on the same path answers `customer_retrieved` with the same fields and `orders`: the customer's latest 20 orders, newest first, each without `customer` and `payments`.

### Errors

| HTTP | `details` | What to do |
| --- | --- | --- |
| 400 | `validation_order_request_invalid` | `field` names the value: `body` (not a JSON object, a field of the wrong type, such as a number for `reference` or `5.5` for `expiresInMinutes`, or over 64 KB), `merchantName`, `currency`, `reference`, `amount`, `description`, `customer.id`, `customer.name`, `customer.email`, `expiresInMinutes` or `returnUrl`. Fix it and send again. |
| 401 | none | No `X-API-Key` header, or a key Unigox does not know. The body is `{"success": false, "error": "…"}`, with the reason as text. |
| 403 | none | Your partner access is suspended: `{"success": false, "error": "partner access is suspended"}`. Write to support@unigox.com. |
| 403 | `merchant_unverified_limit` | Your business is not verified and has received 1,000 USD in total. Verify your business in the portal. Orders created before keep taking payments, and a repeat of one of them (same `reference` and `amount`) still answers `200`. |
| 404 | `order_not_found` | You have no order with this id. |
| 404 | `customer_not_found` | You have no customer with this id. |
| 409 | `order_reference_conflict` | The order with this `reference` reads `open`, `partly_paid`, `paid` or `overpaid` and has another amount. Use a new `reference`, or close that order first. |
| 409 | `no_free_addresses` | No address type has a free address: see [Limits](#limits). Show the payer another way to pay, and open **Crypto processing** in the portal. |
| 409 | `merchant_wallet_missing` | The account behind this API key has no Unigox wallet to receive payments. Write to support@unigox.com. |
| 409 | `order_already_paid` | A `paid` or `overpaid` order cannot be closed, also one paid at the moment you close it. Ship it. |
| 500 | `internal_error` | Send the request again later. A repeated create with the same `reference` and `amount` never makes a second order. |
| 503 | `merchant_limit_unavailable` | Unigox could not check how much you may still receive before verification, so no order was created. Send the request again later. |

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

- **You receive the coin that was sent.** A USDG payment arrives in your Unigox wallet as USDG, in the same amount. Unigox does not convert it. Amounts are in USD: one USDT, USDC, USDG or USDT0 counts as 1 USD.
- **Native coins are not accepted:** ETH, TRX, TON, SOL and the like.
- **A coin or a network the page did not offer.** Such a transfer is not credited to the payment, and Unigox does not return it automatically. The payer contacts you; you write to support@unigox.com with the network, the transaction hash, the coin, the amount and the receiving address. Recovery is not guaranteed.
- **Minimums.** An order or a payment link is for at least 1.00 USD. Each coin and network also has a minimum transfer, which the page shows. A transfer below it is neither credited nor returned.
- **Count a payment only once it is credited.** A transfer that the checkout shows as seen or confirming is not a payment yet.

## Limits

| What | Limit |
| --- | --- |
| Received before your business is verified | 1,000 USD in total. Once you reach it, new orders are refused (`403 merchant_unverified_limit`), and you cannot create links, invoices or deposit addresses, until your business is verified. Payments to the ones you already created still arrive. If Unigox cannot check the total, no order is created (`503 merchant_limit_unavailable`). |
| Order amount | 1.00 USD to 999,999,999,999.99 USD, up to two decimals |
| Order time | 5 to 10,080 minutes (7 days); 60 minutes when you send none |
| Addresses an order holds | One per address type, from its creation until it ends. Each then rests 24 hours before another order can take it. |
| Addresses kept ready for orders | The portal adds addresses while you are signed in with **Crypto processing** open, as the account whose wallet receives your orders' payments; a team member signed in with another account adds none. It keeps 10 free addresses of each type, up to 200 of each type in all. Addresses that have rested become free again on their own; new ones are added only while the portal is open. |
| Orders a day | Each address serves one order, then rests 24 hours. 200 addresses of a type serve about 190 orders of 60 minutes a day, and fewer when orders take longer. Write to support@unigox.com if you need more. |
| A late transfer | Counts for the order up to 15 minutes after the order ends |
| Customer's orders returned with the customer | The latest 20 |
| Payment link amount | At least 1.00 USD in the portal, up to two decimals. Use the same minimum for links from your server. |
| Allowed shortfall | 0.5 % of the amount, never more than 1.00 USD. Invoices, and links made with `tol: "none"`, allow none. |
| Addresses per address type | 1,000 for orders, links and deposit pages together; the portal stops adding addresses for orders at 80 % of it. Write to support@unigox.com to raise it. |
| Reference text of a link | 256 bytes |
| Transfers followed per payment | 200 |
| Signed request deadline | 10 minutes ahead at most |

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `409 no_free_addresses` when you create an order | Every address of every type is held by an order or resting. Open **Crypto processing** in the portal, signed in as the account whose wallet receives the payments, and leave it open for a few minutes: it adds addresses. Meanwhile offer the payer another way to pay. |
| An order offers fewer networks than you expected | The order was created while some address types had no free address. Keep the portal open more often, so each type keeps free addresses. |
| `403 merchant_unverified_limit` | Verify your business: **Verify business** in the band at the top of every **Crypto processing** page. |
| `409 order_reference_conflict` | You sent a `reference` that an order still holds, with another amount. A changed cart needs a new `reference`, or close the old order first. |
| The payer sees an order as closed or expired | Create a new order for the payment and open the checkout with its token. |
| The payer sees "This payment link can't be used" (`TOKEN_INVALID`) | The link was edited, or its addresses are not reserved for it any more. Copy it again from **Payment links**, or build it again from your server's answers. For an order, check that your page passes the `token` of an order your server created. |
| The payer sees "This payment link doesn't work" | The link was cut off. Send the whole link again. |
| The payer sees "We couldn't check this payment link" (`CHECKOUT_UNAVAILABLE`) | Unigox did not answer, or too many checks came from the payer's network. Nothing is wrong with the link: the payer presses **Try again**. |
| The payer sees "This payment request is closed" | The link was closed, or a newer payment uses its address. Create a new link. |
| The payer sent money but the checkout shows nothing | The checkout counts only the coins and networks it offered, sent to the address it showed. Look the payment up in **Payments**, or ask the payer for the transaction hash. |
| The payer sees "Payment arrived after this link was closed" | The transfer reached the address after the link was closed, so it carries no order reference. It is in your wallet: match it to the order yourself in **Payments**. |
| The window always shows **Continue to secure checkout** | Your Content Security Policy blocks the checkout. Add `https://www.unigox.com` to `frame-src`. |
| `UnigoxCheckout is not defined` | `checkout.js` did not load (an ad blocker, the network, your `script-src`). Send the payer to the payment page when `window.UnigoxCheckout` is missing. |
| A deposit is missing from the customer's page | The page lists deposits from the time the customer's first address was made, on the coins and networks it offers. The customer can find a deposit by its hash with **Deposit missing? Find it by its hash**. Otherwise look the address up in **Payments**. |
| A deposit was credited twice in your system | Count each deposit once by its `quoteId`, in the same database transaction that adds it to the balance, never by the transaction hash alone. |
| An API error | Orders: [Errors](#errors). Payment addresses signed with your wallet's key: the [API reference](https://developers.unigox.com/api-reference/payment-addresses#errors). |

## Questions

**Do I need a developer?** Not for payment links, invoices or deposit pages made in the portal. You need one to take payments on your website (your server creates an order for each payment) and to confirm payments on your server.

**Is there an API key?** Yes, for orders. Your server creates and reads orders with your partner API key. Showing the checkout needs nothing secret. Deposit pages and links your server signs itself, and your payment history, use your wallet's private key instead ([Deposit pages and signed links](https://developers.unigox.com/tutorials/crypto-checkout-links)).

**Does my server need the key of my whole wallet?** Not for your website: orders need only your API key. Your wallet's private key is needed only to create deposit pages or links from your server, or to read your payment history. Unigox has no narrower key for those. Keep the wallet's balance low and the key in a secrets store.

**Can my customer pay from an exchange?** Yes, if the exchange can withdraw the chosen coin on the chosen network. The customer covers the withdrawal fee. If the exchange takes the fee out of the amount, a shortfall within the allowance still counts as paid.

**What if the customer pays too little, too much or late?** On an order: too little is `partly_paid`, and the customer can send the rest before `expiresAt`; 15 minutes after it the order ends as `expired`, with `received` showing what came. Too much is `overpaid`. A transfer sent more than 15 minutes after the order ended is not the order's: find it in **Payments** under **Needs attention**. On a payment link: too little shows as `underpaid`, too much as `overpaid`, and a payment completed after the pay-by date as `paid_late`. In each case your server decides what happens to the order.

**Can I refund a payment?** Agree an address and a network with the payer, then send the money from your Unigox wallet. Unigox has no refund request in the API and does not do this for you. It is a different thing from Unigox sending back a transfer it could not credit.

**Can an order be in another currency?** No. Orders are in USD.

**Which languages does the checkout have?** English, Spanish, French and Portuguese. It follows the payer's browser, or the `locale` you pass.

**What does it cost?** Write to support@unigox.com.

## Types

`https://www.unigox.com/checkout.d.ts` declares `window.UnigoxCheckout` for TypeScript: every option, method, callback, status, payload field and error code. Copy it into your project.

## Versions

`https://www.unigox.com/checkout.js` is version 1. Unigox updates the file in place, and every update keeps the options, methods, callbacks and events of [Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed) working. A change that would break your page ships as a new file (`checkout.v2.js`), and version 1 keeps working for at least 90 days after that.

Within version 1, Unigox can add events, statuses, payload fields, options and error codes: write your page so that it ignores the ones it does not know. Within version 1, Unigox does not remove or rename any of them, does not change a field's type, and does not change what `livemode`, `paid` or `onComplete` mean.

The API address and the link check address can change: keep both in your configuration, not in your code.

## Changes

- **2026-11-26, orders:** every payment on your website is a new order that your server creates with your API key (`POST /api/v1/partner/crypto/orders`) and reads to confirm. The checkout is no longer tied to one payment link, and the website no longer needs your wallet's key. Payment links, invoices and deposit pages stay as they were. Money: an order is paid by the same rule as a link, short by at most 0.5 % and never more than 1.00 USD.
- **2026-11-26:** the guide is rewritten in plainer words, with [Words this guide uses](#words-this-guide-uses). The onboarding no longer asks whether you can link payments to customers. The limit before verification shows on every page. Money: no change.
- **2026-11-25:** the guide is rewritten around tasks. Crypto processing opens before verification, up to 1,000 USD received. Money: no change to how payments are credited.
- **2026-11-15:** portal setup starts in **Checkout**; invoice links keep their document in the checkout; several transfers in one Solana transaction can be listed. Money: listing a transfer never counts it as a credit.
- **2026-11-02:** `checkout.d.ts` lists the `onClose` reason `return`. Money: no change.
- **2026-10-30, 1.1.0:** the checkout follows the payer's browser language (`locale: "auto"`); TypeScript types at `/checkout.d.ts`. Money: no change.
- **2026-10-29, 1.0.1:** a closed window stops checking until it opens again. Money: no change.
- **2026-10-27, 1.0.0:** first version: window, embedded and payment page, `bind()`, the events and the fallback.

None of these is in production yet: the first public release is early access.

## Payment notifications

Unigox does not send payment notifications (webhooks) to your server yet, for orders or for links, so there is nothing to build for them. Your server reads each order itself ([Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm)): when the payer returns to your site, and from a job that reads your open orders every few minutes. When Unigox turns notifications on, this page will describe them.
