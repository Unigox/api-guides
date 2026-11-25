# Crypto processing: build your own payment page

> **Not available yet.** This page describes crypto processing ahead of its release. Until this notice is gone, the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

Most businesses do not need this page. The Unigox checkout shows the payment for you, on your site or on a Unigox page, and keeps up with every network, coin and payment state ([Website checkout](https://developers.unigox.com/tutorials/crypto-checkout-embed)). Build your own page only when the checkout cannot fit your product, for example inside a mobile app.

Your own page then has to do what the checkout does: offer the right coins and networks, check the address before showing it, follow the transfer, handle short, late and extra payments, and confirm the payment on your server. You need your wallet's private key ([Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links#before-you-start)).

## How it works

1. **Reserve an address for the order** with its reference text (`POST /memo-locks/allocate`, as in [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links#1-reserve-an-address-for-the-order)). The customer sends an ordinary transfer to it: no memo or tag on chain.
2. **Wait until the network is ready** (`monitoring.chains[].confirmed`, or `watched` on TON and Solana).
3. **Offer only coins and networks that can pay** (below).
4. **Check the address before you show it**, with the [link check](https://developers.unigox.com/api-reference/payment-addresses#link-check): require an `ACTIVE` reservation whose wallet, address and reference fingerprint match your own order record.
5. **Show the instructions:** the address, the exact amount, the coin and the network.
6. **Follow the transfer** with `GET /transaction/{chainId}/{txHash}` once the customer gives you the hash, or with your signed history.
7. **Confirm the payment on your server** exactly as [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm) shows, and fulfil the order from your own record.

## Which coins and networks to offer

`GET /config` lists every network and coin, including ones that are off and native coins. Offer a coin on a network only when:

- the network is `active`, of an address type you reserved, and not `660279` (the chain id that marks a credit to your wallet);
- the coin is `active`, not `native` and has an `address`;
- exactly one coin on chain `660279` matches it: the same `groupId`, or for EVM, TRON and TON coins without a group, the same `symbol`;
- your address is ready on that network.

The [API reference](https://developers.unigox.com/api-reference/payment-addresses#supported-payment-assets) has the exact rules.

## Reference text

Write the reference as `<your order reference> · <amount> USD`, for example `NW-20418-k3f9q2 · 250.00 USD`. The portal reads the amount from it and shows the payment as paid, underpaid or overpaid. The text stays private: only your wallet reads it back. Its fingerprint, `memoHash`, is public in every transfer's status, so keep personal data out of it and add a random part.

For a customer who pays again and again, use a deposit page instead ([Create a deposit page for a customer](https://developers.unigox.com/tutorials/crypto-checkout-links#create-a-deposit-page-for-a-customer)).

## Address reuse

A new address for each order is the safe choice. Reuse an address only when its last payment was paid in full and credited, and its reservation ended at least 7 days ago: a second transfer from the same payer (a double send, an exchange retrying) can still arrive. Never reuse the address of an open, partly paid or unpaid order, or of a customer's deposit page. To reuse it, end the old reservation (`POST /memo-locks/unlock`), then reserve the new reference on it (`POST /memo-locks/lock`). The address gets a new address ID. If reserving the address again after ending its reservation fails, the address has no reference until a reservation succeeds: a payment in between reaches your wallet without one. Retry the reservation, and match such a payment by its address in your history.

## Payment records

Every payment is credited to your Unigox wallet, one for one in the coin that was sent, and appears in the portal's **Payments**. Your server reads it with `GET /transaction/{chainId}/{txHash}` or `POST /transactions/history` ([API reference](https://developers.unigox.com/api-reference/payment-addresses)). Only `DONE` with `subStatus` `COMPLETED` and no `refund` is a credit. Amounts are whole numbers of the coin's smallest unit, sent as strings: keep them as strings or use `BigInt`, because a JavaScript `Number` loses precision on 18-decimal coins.
