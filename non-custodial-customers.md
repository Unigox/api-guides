# Non-custodial customers

The how-to. The endpoint-by-endpoint reference is the **Customer Wallets**
section of the API reference, plus the order endpoints you already use.

Let your customers hold their own crypto. Each customer brings their own EVM
address, deposits to it, and signs every movement of their funds with their own
key. Funds on the customer's address move only with the customer's signature;
your partner wallet does not hold or sign for them.

**What you will build.** A customer who has proved they own an EVM address,
holds deposit addresses on EVM chains, Solana, Tron and TON that credit that
address, can on-ramp, and can off-ramp and withdraw by signing in your app.

**What you need first.** A partner API key and the non-custodial mode switched
on for you. It is not self-service; ask Unigox. Until it is on, creating an
`external_wallet` customer answers `403 FEATURE_NOT_ENABLED`. Switching it off
later stops new such customers only; existing ones keep working.

**What your customer needs.** An ordinary EVM key (an externally owned account:
MetaMask, a key your app derives, a hardware wallet). Linking needs a plain
`personal_sign` signature, which a smart-contract wallet cannot produce, so
linking one fails with `400 INVALID_SIGNATURE`. The customer never needs gas:
Unigox relays every signed request and pays for it.

**Where the funds are.** On XAI (chain id 660279), the chain Unigox settles on,
at the customer's own address. Deposits on other chains are bridged there.

## Two kinds of customer, chosen once

Every customer you create has a `wallet_type`, fixed when you create them:

| `wallet_type` | Whose address holds the money | Who signs |
| --- | --- | --- |
| `partner_wallet` (default) | your partner wallet | you |
| `external_wallet` | the customer's own EVM address | the customer |

Customers you already have are `partner_wallet` and stay that way. A customer
cannot switch type. To move someone to the non-custodial flow, create a new
`external_wallet` customer for them.

## Customers, emails and KYC

Every customer created from 2026-10-12 has their own Unigox account, separate
from a Unigox app user or another partner's customer with the same email, with
its own orders and KYC status. Customers created before that date keep sharing
the Unigox app account that holds their email, if there is one.

Within your partner account one email is one account. A second `user_ref` with
an email you have already used gets its own `user_uuid` but the same account:
the same funds, orders, KYC and, for `external_wallet`, the same wallet. An
email that already belongs to your customer of the other `wallet_type` is
refused with `409 WALLET_TYPE_MISMATCH`.

The funds of an `external_wallet` customer are whatever is on their EVM
address. If the customer links the same address at two partners, both see the
same balance.

KYC runs per account, through the same template, review and limits as for any
other customer. A person already verified on another Unigox account (in the app
or at another partner) is approved by matching that verification instead of
being declined as a repeat. A verification that needs a manual decision still
goes to manual review.

KYC gates orders (on-ramp and off-ramp) for any amount. Deposits, balances and
withdrawals need no KYC: it is the customer's own money on their own address.

## End to end

1. Create the customer: `POST /users` with `wallet_type: external_wallet`.
2. Link the customer's address: `POST /users/{user_uuid}/wallet/challenge`,
   then `POST /users/{user_uuid}/wallet`.
3. Hand out deposit addresses: `POST /users/{user_uuid}/deposit-addresses/{chain_type}/allocate`.
4. Run KYC as for any customer, before or after the wallet is linked.
5. Off-ramp, on-ramp and withdraw. The customer signs where your partner wallet
   signs for a `partner_wallet` customer.

All paths below are under `/api/v1/partner`.

### 1. Create the customer

```http
POST /api/v1/partner/users
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "user_ref": "your-customer-id-42",
  "email": "customer@example.com",
  "wallet_type": "external_wallet"
}
```

The response carries `user_uuid` as for any customer, plus
`"wallet_type": "external_wallet"` and `"wallet": { "address": null, "status": "unlinked" }`.

### 2. Link the customer's address

The customer proves they control the address by signing one message.

```http
POST /api/v1/partner/users/{user_uuid}/wallet/challenge
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{ "address": "0x8ba1f109551bd432803012645ac136ddd64dba72" }
```

```json
{
  "success": true,
  "data": {
    "message": "unigox.com wants you to link your Ethereum account:\n0x8ba1…ba72\n\nLink this address to customer 550e8400-… of Acme on Unigox. …",
    "nonce": "8f3a2c9b1d4e7f60",
    "expires_at": "2026-10-12T10:10:00Z"
  }
}
```

The `message` is a [Sign-In with Ethereum (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)
message, valid for 10 minutes and usable once. A new challenge replaces the
previous one. Show it to the customer unchanged and have them sign it with
`personal_sign`. Then:

```http
POST /api/v1/partner/users/{user_uuid}/wallet
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "address": "0x8ba1f109551bd432803012645ac136ddd64dba72",
  "message": "<the message, unchanged>",
  "signature": "0x…"
}
```

```json
{
  "success": true,
  "data": {
    "address": "0x8ba1f109551bd432803012645ac136ddd64dba72",
    "status": "linked",
    "linked_at": "2026-10-12T10:01:12Z",
    "chain_id": "660279",
    "balances": [
      { "crypto_currency": "USDT", "token_address": "0xf86c…edca", "amount_human": "0", "decimals": 6 },
      { "crypto_currency": "USDC", "token_address": "0x37bf…af43", "amount_human": "0", "decimals": 6 }
    ]
  }
}
```

The link is permanent: deposits credit the address, orders are funded from it
and paid out to it, and it cannot be changed or unlinked. Addresses are
returned in lower case. An empty `balances` means the balance could not be read
at that moment, not that it is zero.

An address can be linked to only one of your customers (another partner may
link the same address). Addresses that belong to Unigox or to you, such as
your partner wallet, are refused. Both answer `409 WALLET_ALREADY_LINKED`.

Until the wallet is linked, order initiate, deposit-address and withdrawal
calls for this customer answer `409 WALLET_NOT_LINKED`. A price quote works.

### 3. Hand out deposit addresses

```http
POST /api/v1/partner/users/{user_uuid}/deposit-addresses/{chain_type}/allocate
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{ "count": 1 }
```

`chain_type` is `evm` (one address for every supported EVM chain), `svm`
(Solana), `tvm` (Tron) or `ton`. `count` is 1 to 50, and a customer can hold up
to 1,000 addresses per chain type. `GET /users/{user_uuid}/deposit-addresses`
lists the ones already allocated. Each address is tied to the customer's linked
address, so two of your customers depositing the same amount at the same time
are never confused. Supported tokens and chains are listed by
`GET /api/v1/supported/blockchains`.

When a deposit has been credited on XAI you receive `wallet.deposit.received`,
and the balance shows in `GET /users/{user_uuid}/wallet`. Balances and deposit
webhooks cover USDT and USDC on XAI. A transfer on XAI that did not come through
a deposit address shows in the balance but sends no webhook.

### 4. Off-ramp

Quote and initiate as for a `partner_wallet` customer
(`POST /offramp/quote`, `POST /offramp/initiate`). What changes is who signs.

**Funding the escrow.** When `next_action` is `authorize_crypto_transfer`:

1. `GET /orders/{order_id}/transfer-authorization-parameters`. `sender_address`
   is the customer's address. `forwarder_nonce` is the customer's current nonce
   at the XAI forwarder; every signed request uses it, so two requests signed
   with the same nonce cannot both execute.
2. Build the EIP-712 `ForwardRequest` from those parameters and have the
   **customer** sign it (`eth_signTypedData_v4`) in your app, where their key is.
3. `POST /orders/{order_id}/authorize-crypto-transfer` with
   `{ "forward_request": { … }, "signature": "0x…" }`.

`from` must be the customer's linked address and the request must move exactly
this order's amount to this order's escrow; otherwise `400 INVALID_REQUEST`
names the field. The forwarder checks the signature on chain: one not made by
`from`, or made with a nonce that has already been used, fails with
`502 TRANSACTOR_ERROR`. Fetch new parameters and have the customer sign again.

The money must already be on the customer's XAI address. If it is short,
`authorize-crypto-transfer` answers `422 INSUFFICIENT_BALANCE` and nothing is
relayed. Check `GET /users/{user_uuid}/wallet` before asking the customer to
sign.

**If the order does not complete** (the payment window expired, a payment proof
was declined, the bank returned the payment, a dispute went the customer's
way), the order shows `next_action: "authorize_refund"` and you receive
`order.refund.required`. `GET /orders/{order_id}/refund-authorization-parameters`
returns `signer_address` = the customer's address; the customer signs and you
submit to `POST /orders/{order_id}/authorize-refund`. The recipient is fixed to
the customer's XAI address on the server and no parameter changes it. From
there the customer can withdraw to any supported chain (step 6); a refund is
not sent back to the chain the deposit came from.

`POST /orders/{order_id}/confirm-fiat-received` works with your API key alone,
as for `partner_wallet` customers. It releases the escrow to the order's vendor
and nowhere else; it cannot move the customer's other funds.

### 5. On-ramp

Quote, initiate and pay as for a `partner_wallet` customer. When the order
completes, the crypto is released to the **customer's own address**, not to
your partner wallet.

Your partner fee is paid to your partner wallet in the same release
transaction: the customer receives the order amount net of your fee, and you
receive your fee at the same moment. The order and its webhooks report both
amounts (`crypto_amount`, `partner_fee`). An on-ramp with `partner_fee_pct`
above zero needs a partner wallet on your partner account to receive the fee;
without one, initiate answers `409 OPERATION_NOT_ALLOWED`.

The order-bound send-out (`bridge-authorization-parameters` /
`authorize-bridge`) is for `partner_wallet` customers only and answers
`422 WALLET_TYPE_MISMATCH` here. An `external_wallet` customer moves their
crypto onward with a withdrawal (step 6), which they sign.

### 6. Withdraw

A customer can send any part of their XAI balance to an address on any
supported chain, in the same token.

```http
POST /api/v1/partner/users/{user_uuid}/withdrawals/quote
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "crypto_currency": "USDC",
  "amount": "25.00",
  "destination_chain": "Arbitrum One",
  "destination_address": "0x1111111111111111111111111111111111111111"
}
```

`destination_chain` is a chain name as `GET /send-out/routes?crypto=USDC` lists
it (case-insensitive) or its `chain_id`, or `xai` to send on XAI itself with no
bridge.

```json
{
  "success": true,
  "data": {
    "withdrawal_quote_id": "0b8e6c1e-3f0a-4c2e-9d55-6a1f4c3b2e10",
    "expires_at": "2026-10-12T10:20:00Z",
    "crypto_currency": "USDC",
    "amount": "25.000000",
    "to_amount": "24.910000",
    "fee": "0.090000",
    "destination_chain": "Arbitrum One",
    "destination_address": "0x1111111111111111111111111111111111111111",
    "forward_request": {
      "from": "0x8ba1f109551bd432803012645ac136ddd64dba72",
      "to": "0x37bf70ee0dc89a408de31b79cccc3152f0c8af43",
      "value": "0", "gas": "…", "nonce": "3", "deadline": "1791807600", "data": "0xa9059cbb…"
    },
    "eip712_domain": {
      "name": "SyntheticAssetForwarder",
      "version": "1",
      "chainId": "660279",
      "verifyingContract": "0x6ffcf38bec8c733b096958fcd2a8e31a00530edc"
    }
  }
}
```

Bridging to another chain costs a fee, deducted from what arrives: `to_amount`
shows the result. A quote whose fee would exceed 2% of the amount is refused with
`422 AMOUNT_TOO_LOW`. On Solana the fee includes opening the destination's token
account when it has none, so the first withdrawal to a fresh address needs a
larger amount than later ones.

The quote is valid for 10 minutes. Have the customer sign `forward_request`
with `eip712_domain`, unchanged (`eth_signTypedData_v4`), before `expires_at`,
then:

```http
POST /api/v1/partner/users/{user_uuid}/withdrawals
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "withdrawal_quote_id": "0b8e6c1e-3f0a-4c2e-9d55-6a1f4c3b2e10",
  "forward_request": { "…": "the quote's forward_request, unchanged" },
  "signature": "0x…"
}
```

Unigox checks the request is exactly the one quoted (sender, token, calldata,
gas, nonce, deadline), recovers the signer and requires the customer's linked
address, re-checks the balance, and relays it. The answer is `202` with
`status: "submitted"`, meaning accepted for relay. Repeating the same submit is
safe and returns the same withdrawal. The withdrawal keeps the quote's id:
`withdrawal_id` equals `withdrawal_quote_id`.

**Signed requests share one nonce.** Off-ramp funding and withdrawals use the
same forwarder nonce. Once one of them executes on XAI, a withdrawal signed
with that nonce answers `409 QUOTE_EXPIRED` at submit; request a new quote.
While a withdrawal is `submitted`, another one cannot be submitted; once it is
`bridging`, the next one can.

Follow it with `GET /users/{user_uuid}/withdrawals/{withdrawal_id}` or the
`wallet.withdrawal.status.changed` webhook:

| `status` | Meaning |
| --- | --- |
| `submitted` | Accepted for relay. |
| `bridging` | Executed on XAI, on its way to the destination chain. |
| `completed` | Arrived. `destination_tx_hash` is set when the withdrawal crossed chains. |
| `failed` | Did not execute on XAI before the quote's deadline. The funds are still on the customer's address. |
| `needs_review` | Could not be settled automatically, for example the bridge failed after the funds left XAI, or the withdrawal is still open after 24 hours. Unigox reconciles it. |

## Amounts

Amounts are decimal strings. Withdrawal amounts carry the token's full
precision (`"25.000000"`); `to_amount` uses the destination token's decimals,
which differ on some chains (18 on BNB Smart Chain). Balances (`amount_human`)
and deposit webhooks (`amount`) drop trailing zeros (`"25"`, `"25.5"`).
Compare amounts as numbers, not as strings. A withdrawal `amount` with more
decimals than the token has is refused with `400 INVALID_REQUEST`.

## What stays the same

API key, recipients, payment details, quotes, order statuses, order webhooks,
your markup and Unigox fees. No new Unigox fee is introduced; a withdrawal
carries only the bridge and network cost shown in its quote's `fee`.

## Webhooks

Three events, in the same envelope and with the same signature headers as
`order.status.changed`.

| `event_type` | Fired when | `data` |
| --- | --- | --- |
| `wallet.linked` | The customer's address was linked. Sent once and not retried; read `GET /users/{user_uuid}/wallet` to confirm. | `user_uuid`, `address` (lower case), `linked_at` |
| `wallet.deposit.received` | A deposit was credited on XAI, about two minutes after the credit. Retried with backoff, up to 10 attempts. | `deposit_id`, `user_uuid`, `address`, `chain_id` (`"660279"`), `crypto_currency`, `token_address`, `amount`, `amount_atomic`, `source_chain_id`, `source_tx_hash`, `tx_hash` (XAI), `credited_at` |
| `wallet.withdrawal.status.changed` | A withdrawal changed status, once per status. Retried like order webhooks. | `user_uuid`, `withdrawal` (the object `GET /users/{user_uuid}/withdrawals/{withdrawal_id}` returns) |

`deposit_id` is an opaque string, stable across retries; deduplicate on it. If
one address is linked at two partners, both receive `wallet.deposit.received`.

## Errors

| `error.code` | Status | What it means |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | A malformed request or address, an unsupported chain or token, too many decimals, a destination the chain cannot pay (`error.details.reason` says why, e.g. `validation_solana_recipient_off_curve`), or a submitted withdrawal that differs from its quote. |
| `INVALID_SIGNATURE` | 400 | The challenge signature does not recover to the address, the message was changed, or `address` differs from the challenged one. |
| `FEATURE_NOT_ENABLED` | 403 | Creating an `external_wallet` customer while non-custodial mode is off for your partner account. |
| `CUSTOMER_NOT_FOUND` | 404 | No such customer, or not yours. |
| `WITHDRAWAL_NOT_FOUND` | 404 | No such withdrawal, or a quote that was never submitted. |
| `WALLET_NOT_LINKED` | 409 | The customer has no linked address yet. |
| `WALLET_ALREADY_LINKED` | 409 | The customer is already linked, the address is linked to another of your customers, or it belongs to Unigox or to you. |
| `WALLET_TYPE_MISMATCH` | 409 | Creating a customer whose `user_ref` or email already belongs to your customer of the other `wallet_type`. |
| `QUOTE_EXPIRED` | 409 | The withdrawal quote expired, the customer's forwarder nonce moved, or another withdrawal has not executed yet. Request a new quote. |
| `OPERATION_NOT_ALLOWED` | 409 | An on-ramp with a partner fee while your partner account has no partner wallet. |
| `CHALLENGE_EXPIRED` | 410 | No challenge was issued, it is older than 10 minutes, it was already used, or a newer one replaced it. |
| `INVALID_REQUEST` | 422 | Deposit-address allocate with an unknown `chain_type` or a `count` outside 1 to 50. |
| `WALLET_TYPE_MISMATCH` | 422 | A wallet call for a `partner_wallet` customer, or the order-bound send-out for an `external_wallet` one. |
| `INSUFFICIENT_BALANCE` | 422 | The customer's XAI balance does not cover the order or withdrawal. |
| `AMOUNT_TOO_LOW` | 422 | The amount is too small to bridge to that chain: the bridge refused it, or its fee would exceed 2% of the amount. `error.details.estimated_minimum_amount`, when present, is roughly the smallest amount that passes. |
| `KYC_NOT_CLEARED` | 422 | The customer is not KYC-cleared for an order. |
| `ADDRESS_CAP_REACHED` | 429 | Allocating would take the customer past 1,000 addresses for that chain type. |
| `INTERNAL_ERROR` | 500 | Something failed on our side. Safe to retry. |
| `TRANSACTOR_ERROR` | 502 | The forwarder refused the signed request, for example a signature not made by `from` or a used nonce. |
| `BALANCE_UNAVAILABLE` | 502 | The XAI balance could not be read. Safe to retry. |
| `DEPOSIT_ADDRESSES_UNAVAILABLE` | 502 | Deposit addresses could not be fetched or allocated. Safe to retry. |

`INVALID_REQUEST` and `WALLET_TYPE_MISMATCH` come with two statuses depending
on the call. Branch on `error.code` and the endpoint, not on the status alone.
