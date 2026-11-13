# Accept crypto payments with Unigox Checkout on your website

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Unigox Checkout guide:** **Quickstart** · [Embed](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links and deposit pages from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference) · [All on one page](https://www.unigox.com/checkout-integration.md)

Add stablecoin payments to your website without building a payment interface. Unigox Checkout lets customers choose a coin and network, shows the amount and receiving address, and tracks the transfer to your Unigox wallet. Use this guide to display checkout, create links for orders and verify payments on your server.

> **Looking for the no-code setup?** Start with [crypto processing help](https://www.unigox.com/crypto-processing/help). It covers payment links, customer top-ups and adding checkout to your site. Share [How to pay a payment link](https://www.unigox.com/crypto-processing/help/how-to-pay) with customers who need help paying.

> **Availability.** Crypto processing is in early access and must be enabled for your business. Production payment notifications, a payment test mode and a read-only server key are not available yet. Your server must check payment status itself. Unigox has not published guaranteed confirmation depths, and screening does not cover every network. See [Networks and coins](https://developers.unigox.com/tutorials/crypto-checkout-reference#networks-and-coins).

A payment link has the form `https://www.unigox.com/pay/{token}`. The `token` contains the amount, order reference and payment addresses. Display the same payment in any of these ways:

- **Hosted:** a link or a redirect to the checkout page.
- **Modal:** a dialog over your page, opened by `checkout.js`.
- **Inline:** the checkout inside a container on your page, mounted by `checkout.js`.

Before fulfilling an order, your server must verify that its payment was credited. It can [check reported transfers without a key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key), or use your wallet's private key to read payment history and find transfers the browser missed. Checkout events update your interface; they do not authorize fulfilment. Creating a link or opening checkout does not move money.

## Words used in this guide

These terms connect the business portal to the API. Names in code font are the exact fields or values used in requests and examples.

| Word | Meaning |
| --- | --- |
| Reference | Your order number, shown to the payer. Keep personal data out of it. |
| Reference text (`memo`) | The text Unigox keeps with a payment address: `<reference> · <amount> USD`, followed by the link's terms for a link made in the portal ([memo v2](https://developers.unigox.com/tutorials/crypto-checkout-links#memo-v2-the-links-terms-in-the-memo)). Requests and answers call it `memo`. Only your wallet reads the text back. |
| Payment address | An address of your wallet that payers send to. A payment has one for each address type it accepts. |
| Address type (`chainType`: `evm`, `tvm`, `ton`, `svm`) | One address serves all Ethereum-style networks (`evm`); TRON (`tvm`), TON (`ton`) and Solana (`svm`) have one each. |
| Reserve an address (a reservation) | The address is set aside for this payment: your reference text is put on it, and while it is reserved, every transfer to it counts for this payment. Ending the reservation takes the reference text off; transfers still reach your wallet, without it. "Get a new address" makes a new address and reserves it in one request. |
| `/memo-locks/…`, `AllocateAndLock`, `Lock`, `Unlock`, `ListLocks` | The names of the requests that get and reserve an address, reserve one you have, end a reservation, and list an address's reservations. They are fixed names: type them exactly as the code shows. |
| `"Unigox Bridge Memo Locks"`, `"Unigox Bridge History"` | Fixed signing labels: the names your server puts in each signature. Type them exactly. Their wording is historic: they do not name a product you use or sign up for. |
| Address ID (`lockId`, `memoLockId`) | The number of one reserved address. The portal shows it as **Address ID**; requests and answers name the field `lockId`, history and events `memoLockId`. |
| Reference fingerprint (`memoHash`) | keccak256 of the reference text's UTF-8 bytes. Public transfer records carry the fingerprint, never the text. |
| Payment link code (`token`) | The last part of a payment link: the reference text, the amount and the addresses. It is not signed; see [Link format](https://developers.unigox.com/tutorials/crypto-checkout-links#link-format-advanced). |
| Your Unigox wallet | Where Unigox credits every payment. "Balance" in this guide is only ever an amount in it. |
| `UNIGOX_BALANCE_CHAIN_ID` (`660279`) | A fixed number Unigox uses to mark a payment as credited to your wallet. Copy it as is. |
| Transfer ID (`quoteId`) | Unigox's ID for one incoming transfer, as the API gives it. Use it to count each payment or deposit once on your server. It is not the **Payment ID** of the portal and its exports: that one is an opaque identifier (`payment_key` in the developer export). Store it whole; do not parse its suffix or substitute the displayed transfer number. |
| Pay-by date (`x`) | The deadline your customer sees. It lives only in the link: a payment after it is still credited, as paid late. |
| Deposit page (`p: "topup"`, `mode: "topup"`) | A customer's own page with their deposit addresses, for any amount, any number of times. `topup` is its code in the link and in events. |

## Choose how you start

| You want to | Who does the work | You need | Start at |
| --- | --- | --- | --- |
| Send a customer an invoice to pay | No code | Crypto processing turned on for your business account | [Payment links](https://www.unigox.com/crypto-processing/help/payment-links) |
| Give a repeat customer a permanent deposit address | No code in the portal, or a developer for your own server | Crypto processing turned on | [Deposit addresses](https://www.unigox.com/crypto-processing/help/deposit-addresses) (portal) or [Customer deposit addresses](https://developers.unigox.com/tutorials/crypto-checkout-links#customer-deposit-addresses) (server) |
| Show the checkout on your site: a button, a window or part of your page | Copy and paste | A payment link and a few lines of HTML | [2. Show the checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed#2-show-the-checkout) |
| Confirm each payment on your server, without a key | A developer | The link's reference text and address IDs (shown on the portal's **Developers** page), Node.js | [Confirm without the key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key) |
| Make a payment link for every order from your server | A developer | Your wallet's private key, which Unigox exports on request | [Option B: from your server](https://developers.unigox.com/tutorials/crypto-checkout-links#option-b-from-your-server) |

Without the key, the checkout on your site shows payment links you make in the portal: one link per order, made by hand, pasted into the button code. With the key, your server makes each order's link itself.

## Quickstart: your first payment without code

1. In the business portal, open **Crypto processing → Payment links → Create payment link**, enter your order reference and the amount in USD, and create the link.
2. Copy the link and send it to your customer, or open it yourself to see what your customer sees.
3. Your customer picks a coin and a network and sends the amount to the address the page shows. The page follows the transfer until it is credited.
4. Open **Crypto processing → Payments**: the payment is there with your reference, the amount received and its status.

That is all you need to take payments. The [Payment links guide](https://www.unigox.com/crypto-processing/help/payment-links) explains every option, every status and the exports. To put the checkout on your own site, take this link to [step 2](https://developers.unigox.com/tutorials/crypto-checkout-embed#2-show-the-checkout). To try your page first, use the [samples](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-your-page-without-money): they need no money.

## Quickstart: the checkout on your site

The payment on your own page, in six steps. Steps 1 to 3 are copy and paste; steps 4 and 5 are for a developer.

1. Create a link in **Crypto processing → Payment links → Create payment link**.
2. Open **Crypto processing → Developers**, paste the link under **Show the checkout on your site**, choose **Button** and copy the code into your page.
3. Test it without money: in the code, put `demo-awaiting` in place of the link's code (the part after `/pay/`), open your page, press the button, then **Send the payment (sample)** in the checkout. Your page receives `READY`, `AWAITING_PAYMENT`, `PAYMENT_DETECTED` and `PAID`, every one with `livemode: false` ([Test your page without money](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-your-page-without-money)).
4. In `onComplete` (and `onStatusChange`), post `payload.payments` to your server with your order's ID.
5. Your server checks each reported transfer with Unigox, with `verifyTransfers()` and `isPaid()` of [Confirm without the key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key), and marks the order paid from its own order record, never from the browser.
6. Put the real link back and make one small real payment ([Test before you go live](https://developers.unigox.com/tutorials/crypto-checkout-testing#test-before-you-go-live)).

To make each order's link on your server instead of in the portal, see [Option B: from your server](https://developers.unigox.com/tutorials/crypto-checkout-links#option-b-from-your-server).

## What you need

- Crypto processing turned on for your business account. Unigox turns it on; the **Crypto processing** section then appears in your business portal.
- Your Unigox wallet address. It owns your payment addresses and receives every payment. The portal's **Developers** page shows it.
- The address of the Unigox payments API, `UNIGOX_PAYMENTS_API` in the code below. Copy it from **Crypto processing → Developers**, where **Environment** shows it as **API address**, and keep it in your configuration, not in code: it can change. Staging has its own address, which Unigox gives you with staging access (see "Test before you go live").
- To make payment links from your own server, or to read your payment history there: that wallet's private key. There is no separate API key: reserving addresses and reading history are both signed with the wallet's key. Unigox exports it only on request: write to support@unigox.com (the portal's **Developers** page has an **Ask for the key** button that fills in your wallet). Once Unigox has turned export on, the settings of your Unigox account (the gear) show **Export Private Key**: the key opens in a secure window for you to copy. Unigox never sends the key by email or chat, and never asks you for it. Without it, create payment links in the portal (step 1, option A), follow their payments in the portal's **Payments** view, and confirm them on your server with the public status read ([Confirm without the key](https://developers.unigox.com/tutorials/crypto-checkout-confirm#confirm-without-the-key)).
- Guard that key like the money itself: it is the key of your whole Unigox wallet: whoever holds it can move every balance the wallet collects, and every other balance in that wallet too. A server that holds it is a hot wallet. Keep it in a secrets manager, KMS or HSM on the server that signs (never in browser code, a repository or a log), keep that wallet's balance low and move collected balances out of it regularly. To keep collections apart from your other money, ask Unigox support about a separate Unigox login that only collects payments.
- No notifications to your server yet, and you do not need to build a receiver: production callbacks are off (`GET /config` answers `memoLimits.maxCallbackUrlBytes: 0` and an empty `webhookKeys`). Your server finds out about a payment by reading its status (step 4), from your return page and from a periodic job.
- The low-level reference, for exact types and complete examples: [Payment addresses for your own payment page](https://developers.unigox.com/tutorials/crypto-payments) and the [API reference: payment addresses](https://developers.unigox.com/api-reference/payment-addresses). Endpoint paths below are relative to `UNIGOX_PAYMENTS_API`.
