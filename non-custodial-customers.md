# Non-custodial customers

The how-to. The endpoint-by-endpoint reference is the **Customer Wallets**
section of the API reference, plus the order endpoints you already use.

Let your customers hold their own crypto. Each customer brings their own EVM
address, deposits to it, and signs every movement of their funds with their
own key. Your partner wallet is never in the path, and neither Unigox nor you
can move a customer's money without the customer's signature.

**What you will build.** A customer who proved they own an EVM address, has
deposit addresses on EVM chains, Solana, Tron and TON that credit that address,
and can off-ramp, on-ramp and withdraw by signing in your app. Your markup
applies to their orders exactly as it does today.

**What you need first.** A partner API key and the non-custodial mode switched
on for you. It is not self-service; ask Unigox. Until it is on, the calls below
answer `403 FEATURE_NOT_ENABLED`.

**What your customer needs.** An ordinary EVM key (an externally owned account:
MetaMask, a key your app derives, a hardware wallet). Smart-contract wallets
cannot sign the requests below and are refused when linked. The customer never
needs gas: Unigox relays every signed request and pays for it.

## Two kinds of customer, chosen once

Every customer you create has a `wallet_type`, fixed when you create them:

| `wallet_type` | Whose address holds the money | Who signs |
|---|---|---|
| `partner_wallet` (default, today's behaviour) | your partner wallet | you |
| `external_wallet` | the customer's own EVM address | the customer |

Nothing changes for customers you already have: they are `partner_wallet` and
stay that way. A customer cannot switch type. To move someone to the
non-custodial flow, create a new `external_wallet` customer for them.

Customers belong to your partner account only. The same email can be a
customer of yours and of another partner, or a Unigox app user, and each is a
separate account with separate funds, orders and KYC status.

## 1. Create the customer

```
POST /api/v1/partner/users
{
  "user_ref": "your-customer-id-42",
  "email": "customer@example.com",
  "wallet_type": "external_wallet"
}
```

The response carries `user_uuid` as today, `wallet_type: "external_wallet"`
and `wallet.status: "unlinked"`. KYC works exactly as for any other customer
(`POST /api/v1/partner/users/{user_uuid}/kyc-submissions` with `direct_data`),
and can run before or after the wallet is linked.

## 2. Link the customer's address

The customer proves they control the address by signing one message.

```
POST /api/v1/partner/users/{user_uuid}/wallet/challenge
{ "address": "0xCustomerAddress…" }
```

returns a [Sign-In with Ethereum (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)
`message`, valid for 10 minutes and usable once. Show it to the customer
unchanged and have them sign it with `personal_sign`. Then:

```
POST /api/v1/partner/users/{user_uuid}/wallet
{ "address": "0xCustomerAddress…", "message": "<the message, unchanged>", "signature": "0x…" }
```

On success `wallet.status` becomes `linked`. The address is now the
customer's address at Unigox for good: deposits credit it, orders are funded
from it and paid out to it. It cannot be changed or unlinked.

An address can be linked to only one of your customers (`409 WALLET_ALREADY_LINKED`).
Addresses that belong to Unigox or to you, such as your partner wallet, are refused.

Until the wallet is linked, quote, initiate, deposit-address and withdrawal
calls for this customer answer `409 WALLET_NOT_LINKED`.

## 3. Give the customer deposit addresses

Funds are held on the XAI chain, at the customer's own address. Deposits sent
on any supported chain are bridged there automatically.

```
GET  /api/v1/partner/users/{user_uuid}/deposit-addresses
POST /api/v1/partner/users/{user_uuid}/deposit-addresses/{chain_type}/allocate   { "count": 1 }
```

`chain_type` is `evm` (one address for every supported EVM chain), `svm`
(Solana), `tvm` (Tron) or `ton`. Every address returned is attributed to this
customer alone, so two customers depositing the same amount at the same time
are never confused. Supported tokens and chains are listed by
`GET /api/v1/supported/blockchains`.

When a deposit has been credited on XAI you receive a `wallet.deposit.received`
webhook, and the balance shows in:

```
GET /api/v1/partner/users/{user_uuid}/wallet
```

## 4. Off-ramp

Quote and initiate exactly as today (`POST /offramp/quote`, `POST /offramp/initiate`).
What changes is who signs.

**Funding the escrow.** When `next_action` is `authorize_crypto_transfer`:

1. `GET /api/v1/partner/orders/{order_id}/transfer-authorization-parameters`.
   `sender_address` is the customer's address and `forwarder_nonce` is the
   customer's nonce.
2. Build the EIP-712 `ForwardRequest` from those parameters and have the
   **customer** sign it in your app. The SDK helpers build the typed data
   (`build_forward_request` / `buildForwardRequest`); the signing must happen
   where the customer's key is.
3. `POST /api/v1/partner/orders/{order_id}/authorize-crypto-transfer` with
   `{ forward_request, signature }`.

Unigox recovers the signer and refuses the request unless it was signed by the
customer's linked address and moves exactly this order's amount to this
order's escrow. A request built for another order, another amount or another
recipient is refused with `400 INVALID_REQUEST` naming the field.

The money must already be on the customer's XAI address. If the balance is
short, the parameters call says so before anything is signed.

**If the order does not complete.** The payment window expired, a payment
proof was declined, the bank returned the payment, a dispute went the
customer's way: the crypto in escrow goes back to the **customer's own
address**. As today, the order shows `next_action: "authorize_refund"` and you
receive `order.refund.required`. `GET /refund-authorization-parameters` returns
`signer_address` = the customer's address; the customer signs, you submit to
`POST /authorize-refund`. The recipient is fixed to the customer's address on
the server and no parameter changes it.

Refunds go to the customer's XAI address. From there the customer can withdraw
to any supported chain (step 6). Automatic refunds back to the address the
deposit came from are planned and not part of this release.

## 5. On-ramp

Quote, initiate and pay exactly as today. When the order completes, the crypto
is released to the **customer's own address**, not to your partner wallet.

Your partner fee on an on-ramp order is paid to your partner wallet in the same
release transaction, so the customer receives the order amount net of your
fee and you receive your fee at the same moment. The order and its webhooks
report both amounts as today (`crypto_amount`, `partner_fee`).

The order-bound send-out (`bridge-authorization-parameters` / `authorize-bridge`)
is for `partner_wallet` customers only. An `external_wallet` customer moves
their crypto onward with a withdrawal (step 6), which they sign.

## 6. Withdraw

A customer can send any part of their XAI balance to an address on any
supported chain.

```
POST /api/v1/partner/users/{user_uuid}/withdrawals/quote
{ "crypto_currency": "USDC", "amount": "25.00",
  "destination_chain": "base", "destination_address": "0xDestination…" }
```

returns a `withdrawal_quote_id`, the amount that will arrive, the fee, the
expiry, and a `forward_request` with its EIP-712 domain, ready to sign. Have the
customer sign it unchanged, then:

```
POST /api/v1/partner/users/{user_uuid}/withdrawals
{ "withdrawal_quote_id": "…", "forward_request": { … }, "signature": "0x…" }
```

Unigox checks the request is the one quoted, signed by the customer, and relays
it. Follow it with `GET /api/v1/partner/users/{user_uuid}/withdrawals/{withdrawal_id}`
or the `wallet.withdrawal.status.changed` webhook until it is `completed` or
`failed`. A failed withdrawal leaves the funds on the customer's XAI address.

## What stays the same

API key, recipients, payment details, KYC, quotes, order statuses, webhooks
for orders, your markup and Unigox fees. No new fee is introduced for
non-custodial customers.

## Errors you will meet only here

| Code | When |
|---|---|
| `403 FEATURE_NOT_ENABLED` | non-custodial mode is not switched on for your partner account |
| `409 WALLET_NOT_LINKED` | the customer has no linked address yet |
| `409 WALLET_ALREADY_LINKED` | the customer is already linked, or the address is linked to another of your customers |
| `422 WALLET_TYPE_MISMATCH` | a wallet call for a `partner_wallet` customer, or `authorize-bridge` for an `external_wallet` one |
| `400 INVALID_SIGNATURE` | the challenge signature does not recover to the address, or the message was changed |
| `410 CHALLENGE_EXPIRED` | the challenge is older than 10 minutes or was already used |
| `422 INSUFFICIENT_BALANCE` | the customer's XAI balance does not cover the order or withdrawal |
