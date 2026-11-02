# Unigox Checkout: test and go live

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Unigox Checkout guide:** [Quickstart](https://developers.unigox.com/tutorials/crypto-checkout) · [Embed](https://developers.unigox.com/tutorials/crypto-checkout-embed) · [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) · [Links and deposit pages from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · **Test and go live** · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference) · [All on one page](https://www.unigox.com/checkout-integration.md)

## Test your page without money

There is no test mode for payments: a real link takes real money. To build and test the page that embeds the checkout, use the samples. Each is a checkout of a made-up merchant in one state, with no address anyone can pay: open `https://www.unigox.com/pay/<id>` as a link, or pass the id as the `token` of `checkout.js` (`UnigoxCheckout.create({ token: "demo-awaiting" })`). Every sample says it is a sample on the page, and every event it sends carries `livemode: false`: in production, refuse to act on an event whose `livemode` is not `true`. On every sample that waits for the payment (`demo-awaiting`, `demo-preset`, `demo-unavailable`), **Send the payment (sample)** plays the payment through to the end, and on the underpaid ones (`demo-underpaid`, `demo-underpaid-60`) **Send the rest (sample)** does, so you see every event of a paid checkout.

<!-- samples:start -->
| Id | Shows | Events your page receives |
| --- | --- | --- |
| `demo` | Start: the payer picks a coin and a network | `READY`, `CHOOSING` |
| `demo-link` | A payment link: no order number | `READY`, `CHOOSING` |
| `demo-awaiting` | The address and the amount to send (a sample address that nobody can pay) | `READY`, `AWAITING_PAYMENT`; after **Send the payment (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-detected` | A transfer seen on the network | `READY`, `PAYMENT_DETECTED` |
| `demo-paid` | Payment completed | `READY`, `PAID` (`onComplete`) |
| `demo-underpaid` | Less than the amount: what came and what remains | `READY`, `UNDERPAID`; after **Send the rest (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-overpaid` | More than the amount | `READY`, `OVERPAID` (`onComplete`) |
| `demo-expired` | The pay-by time passed with nothing received | `READY`, `EXPIRED` |
| `demo-late` | Paid after the pay-by time | `READY`, `PAID_LATE` (`onComplete`) |
| `demo-hold` | Received, under review by Unigox | `READY`, `ON_HOLD` |
| `demo-confirming` | A transfer confirming on the network | `READY`, `PAYMENT_DETECTED` with `status: "confirming"` |
| `demo-tolerance` | Paid within the tolerance: 249.10 of 250.00 USD | `READY`, `PAID` (`onComplete`) |
| `demo-parts` | Paid in two transfers | `READY`, `PAID` (`onComplete`) |
| `demo-incomplete` | Less than the amount, and the pay-by time has passed | `READY`, `UNDERPAID` with `status: "underpaid_closed"` |
| `demo-failed` | A transfer that was not completed | `READY`, `FAILED` |
| `demo-too-small` | A transfer below the network's minimum: not credited | `READY`, `FAILED` |
| `demo-refunding` | A transfer that Unigox support is sending back | `READY`, `FAILED` |
| `demo-refunded` | A transfer that was sent back | `READY`, `FAILED` |
| `demo-frozen` | Received and on hold after a review: not in the balance | `READY`, `ON_HOLD` |
| `demo-unreferenced` | Money that reached the address after the link closed | `READY`, `RECEIVED_WITHOUT_REFERENCE` |
| `demo-closed` | A link that was closed: a newer payment uses the address | `READY`, `CANCELLED` with `status: "closed"` |
| `demo-cancelled` | The payer cancelled on the page | `READY`, `CANCELLED` with `status: "cancelled"` |
| `demo-unavailable` | The checkout cannot reach Unigox right now: the address stays, the status waits | `READY`, `AWAITING_PAYMENT`, `UNAVAILABLE` (`onError` `CHECKOUT_UNAVAILABLE`); after **Send the payment (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-preset` | A link that offers one coin on one network: the address straight away | `READY`, `AWAITING_PAYMENT`; after **Send the payment (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-preset-coin` | A link that offers one coin: the payer picks only the network | `READY`, `CHOOSING` |
| `demo-detected-expired` | A transfer seen before the pay-by time, which has passed since | `READY`, `PAYMENT_DETECTED` |
| `demo-underpaid-60` | 60.00 of a 100.00 USD payment received | `READY`, `UNDERPAID`; after **Send the rest (sample)**: `PAYMENT_DETECTED`, then `PAID` (`onComplete`) |
| `demo-repeat` | Paid, then sent again: both transfers and the extra | `READY`, `OVERPAID` (`onComplete`) |
| `demo-topup` | A customer's top-up page | `READY`, `CHOOSING`, both with `mode: "topup"`; once a network is chosen, after **Send a deposit (sample)**: `PAYMENT_DETECTED`, then `DEPOSIT_CREDITED` (`onDeposit`), with `mode: "topup"` and `livemode: false` |
| `embed-demo` | A shop's order page with a Pay with crypto button, its code and every callback it receives | |
<!-- samples:end -->

Any other id is not a sample: the page treats it as a payment link it cannot read (`INVALID_LINK`, `onError` `TOKEN_INVALID`). The samples are served where Unigox has turned them on for the site. If `https://www.unigox.com/pay/demo` answers "page not found", write to support@unigox.com.

## Test before you go live

Write to support@unigox.com for staging access (the portal's **Developers** page has an **Ask for staging access** button that fills in your wallet). Staging has its own API address and its own portal, whose Developers page shows that address. It also has its own site that serves `checkout.js` and `/pay`, which Unigox names with the access: a staging link opens only there, and a production link only on `https://www.unigox.com`, so use the staging site in place of `https://www.unigox.com` in every example while you test. Sign `environment: "staging"` there, sign `callbackUrl: ""`, and ask Unigox which networks and test coins staging accepts before you send anything. Then pay small amounts:

1. Pay exactly the amount: the page shows Payment completed, your check (`verifyTransfers` or `fulfilInvoice`) finds the payment, and the order is paid once.
2. Pay less, then the rest from another network: the page shows how much was received of the amount and what remains, then Payment completed.
3. Pay more: Payment completed with the extra amount shown.
4. Two transfers that together make the amount.
5. A payment after the pay-by date, on a link whose `x` is earlier than the reservation's end: Payment arrived after the deadline.
6. Close the modal in the middle, pay, and open it again: the same state.
7. Close your page before the payment is credited, then pay: your periodic pass finds the payment (`fulfilInvoice` in history with the key; without the key, `verifyTransfers` with the transaction hash).
8. Block the checkout with your CSP (`frame-src 'none'`): Continue to secure checkout opens the same payment.
9. Your periodic pass when Unigox cannot be read: with `UNIGOX_PAYMENTS_API` pointing at an address that answers 502, broken JSON or nothing, the pass logs the error, keeps running and pays the order on the next pass once Unigox answers.
10. Run `fulfilInvoice` for one paid order from two places at once: the order is marked paid and shipped once.

If you give customers deposit addresses ([Customer deposit addresses](https://developers.unigox.com/tutorials/crypto-checkout-links#customer-deposit-addresses)), test them too:

11. Create one customer's deposit page on staging and send two small deposits on two networks: the page and **Payments** show two credited deposits, and `creditDeposits` (or your history job) adds two credits to the customer.
12. Open the deposit page again: `onDeposit` repeats both deposits, and `creditDeposits` adds nothing.
13. Archive the customer, then send a deposit to one of their addresses: it is credited to your wallet as another credit, without the customer's reference text, and is not added to the customer.

## Going live

- Crypto processing is on for your production business account, and its **Developers** page shows **Environment** Production.
- Your server signs `environment: "production"` against the production API address, with `callbackUrl: ""`.
- Every network you offer shows `confirmed: true` for your addresses.
- Your periodic check (`verifyTransfers` or `fulfilInvoice`) runs for every open order, passed tests 9 and 10 on staging, and one small real payment passes tests 1 and 7.
- With deposit addresses: your periodic deposit job (with the key), or the person who credits deposits from **Payments**, runs at least as often as customers expect their balance to update, and passed tests 11 to 13 on staging.
- Only if Unigox turned notifications on for you: your receiver passed [its tests](https://developers.unigox.com/tutorials/crypto-checkout-reference#tests-for-your-receiver) and its production URL is not staging's.
- Your server confirms payments by one of the ways of step 4. If Unigox exported your wallet's private key, it is only in your secrets store.
- Your page ignores events whose `livemode` is not `true`.
- Every token carries your support email (`e`), so a payer with a problem can reach you.
- A link built on production opens on `https://www.unigox.com/pay/…` and shows its address (not "We couldn't check this payment link" or "This payment link can't be used"), and `checkout.js` and your Content-Security-Policy name `https://www.unigox.com`.
