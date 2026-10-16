# Funding your wallet

Your Unigox partner account is itself an account with a wallet, and that wallet
is what moves crypto on both sides of the API. You top it up in advance for
off-ramp orders; on-ramp orders pay into it.

This page applies to **off-ramp, third-party payouts and on-ramp alike**, for
your `partner_wallet` customers:

- **Off-ramp and third-party payouts.** The wallet funds each order: it signs the
  transfer into the order's escrow. It appears as `sender_address` on
  `GET /orders/{order_id}/transfer-authorization-parameters`.
- **On-ramp.** The wallet does not fund the order; it receives the purchased
  crypto, which is then sent on to your customer from there. It appears as
  `sender_address` on `GET /orders/{order_id}/bridge-authorization-parameters`.

For `external_wallet` customers the customer's own address is used instead; see
[Non-custodial customers](../non-custodial-customers.md). If you set a fee
wallet, your markup goes there.

You hold the private key to that wallet: every movement out of it is authorized
by an EIP-712 signature you produce.

The practical consequence: **an empty balance stops every off-ramp order and
payout**, not just the next one. Keep the wallet funded ahead of demand.

## Where to see your wallet

Sign in to unigox.com with your partner account and open **My Wallet**. It shows
your balance and your wallet address. The address does not change, and it is the
same address returned as `sender_address` by the authorization endpoints above.
If those two ever disagree, stop and contact us rather than sending to either.

## The wallet lives on XAI

Your wallet address is on the **XAI** chain. Send only USDC or USDT on XAI to it.
A transfer on any other chain to your XAI address is **not recoverable**.

The token you fund with must be the token your orders are denominated in: a USDC
order cannot be funded by a USDT balance.

## Funding from another chain

You do not have to source USDC on XAI yourself.

We provision a deposit address for your account on each supported chain and
monitor it. A deposit that lands there is moved to your XAI wallet automatically
and credited 1:1 with no fee, usually within minutes; a deposit held for a
compliance check is credited after review.

In **My Wallet**, choose **Add Money**, then **Deposit from External Wallet or
Exchange**, to see them. Each chain has its own address, and each accepts only
the tokens listed against it:

| Deposit chain | Accepted |
| --- | --- |
| Ethereum, Arbitrum, BNB Smart Chain, Polygon, Optimism, HyperEVM, Unichain | USDC, USDT |
| Base, Avalanche | USDC |
| Solana | USDC, USDT |
| Tron | USDT |
| TON | USDT |

Other tokens may be credited, but only USDC and USDT can fund orders.

USDC is credited as USDC on XAI and USDT (including USDT0) as USDT.

Very small amounts can round down to zero after decimal conversion; send at
least 1 USDC or USDT.

{% hint style="danger" %}
**A deposit address is not your XAI wallet address, and the two are never
interchangeable.** Sending Solana USDC to your XAI address, or XAI USDC to your
Solana deposit address, is unrecoverable in either direction. Sending a token a
chain does not accept, such as USDC to Tron, is equally unrecoverable.

Always take the address for the exact chain you are sending from, check it
against the accepted-token list, and send a small test amount first.
{% endhint %}
