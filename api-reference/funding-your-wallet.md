# Funding your wallet

Your Unigox partner account is itself an account with a wallet, and that wallet
is what moves crypto on both sides of the API. You top it up in advance; orders
draw it down.

This page applies to **off-ramp, third-party payouts and on-ramp alike** — the
same wallet, the same address, in every flow:

- **Off-ramp and third-party payouts.** The wallet signs the transfer into each
  order's escrow. It appears as `sender_address` on
  `GET /orders/{order_id}/transfer-authorization-parameters`.
- **On-ramp.** The purchased crypto is released to the wallet and bridged out to
  your customer from there. It appears as `sender_address` on
  `GET /orders/{order_id}/bridge-authorization-parameters`, and any partner
  markup you charge is withheld into the same wallet.

You hold the private key to that wallet: every movement out of it is authorized
by an EIP-712 signature you produce.

The practical consequence: **an empty balance stops every order**, not just the
next one. Keep the wallet funded ahead of demand. You can read the balance at any
time with `GET /wallet/funding-balance`.

## The wallet lives on XAI

`GET /deposit-addresses` returns the wallet address as `funding_wallet_address`.
It does not change, and it is the same address returned as `sender_address` by
the authorization endpoints above — if those two ever disagree, stop and contact
us rather than sending to either.

That address is on the **XAI** chain. Send only USDC or USDT on XAI to it. A
transfer on any other chain to your XAI address is **not recoverable**.

The token you fund with must be the token your orders are denominated in: a USDC
order cannot be funded by a USDT balance.

## Funding from another chain

You do not have to source USDC on XAI yourself.

We provision a deposit address for your account on each supported chain and
monitor it. A deposit that lands there is bridged to your XAI wallet
automatically and credited 1:1 with no bridge fee — normally within a minute —
and is spendable as soon as it arrives.

The same `GET /deposit-addresses` call returns them. Each chain has its own
address, and each accepts only the tokens the endpoint lists against it:

| Deposit chain | Accepted |
| --- | --- |
| Ethereum, Arbitrum, BSC, Polygon, Optimism, HyperEVM, Unichain | USDC, USDT |
| Base, Avalanche | USDC only |
| Solana | USDC only |
| Tron | USDT only |
| TON | USDT only |

The token you deposit is the token you receive: deposit USDC and your XAI balance
grows in USDC, deposit USDT and it grows in USDT.

{% hint style="danger" %}
**A deposit address is not your XAI wallet address, and the two are never
interchangeable.** Sending Solana USDC to your XAI address, or XAI USDC to your
Solana deposit address, is unrecoverable in either direction. Sending a token a
chain does not accept — USDT to Solana, USDC to Tron — is equally unrecoverable.

Always take the address for the exact chain you are sending from, check it
against the accepted-token list, and send a small test amount first.
{% endhint %}
