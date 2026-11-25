# API reference: crypto processing

Every request a server makes for crypto processing: reserving payment addresses for orders and customers, ending reservations, reading payment status and payment history, and checking a link. For step-by-step use, see [Links from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) and [Confirm payments](https://developers.unigox.com/tutorials/crypto-checkout-confirm).

Paths are relative to the **API address** on **Developers → Environment** (`UNIGOX_PAYMENTS_API`), except the link check, which has its own address. Payments are credited to your Unigox wallet; your server decides when to fulfil an order or credit a customer.

## Endpoints

| Request | Signed | What it does |
| --- | --- | --- |
| [`GET /config`](#get-config) | No | Networks, coins, signing limits and the server's time |
| [`POST /memo-locks/allocate`](#get-a-new-payment-address-post-memo-locksallocate) | Yes, `AllocateAndLock` | Makes a new payment address and reserves it for a reference |
| [`POST /memo-locks/lock`](#reserve-an-address-again-or-end-its-reservation) | Yes, `Lock` | Reserves an address you already have for a reference |
| [`POST /memo-locks/unlock`](#reserve-an-address-again-or-end-its-reservation) | Yes, `Unlock` | Ends a reservation |
| [`POST /memo-locks/list`](#list-an-addresss-reservations) | Yes, `ListLocks` | Lists your reservations, with network readiness |
| [`POST /transactions/history`](#wallet-transaction-history) | Yes, `History` | Your wallet's payments, filtered by reservation, address or payment status |
| [`GET /transaction/{fromChain}/{fromTx}`](#transaction-status) | No | The status of one transfer |
| [`GET {link check}/crypto-checkout/memo-locks/{lockId}`](#link-check) | No | Whether an address is reserved by a wallet for a reference |
| [`GET {link check}/crypto-checkout/memo-locks/{lockId}/solana-transfers/{signature}`](#solana-transfers-of-one-transaction) | No | The transfers of one Solana transaction to an address |

In the paths, a `memo` is the reference text, a `memo-lock` is the reservation of a payment address for it, and its number, `lockId`, is the address ID.

Every answer is `{status, code, details?, data?}`: `code` is the HTTP status, `details` names the error.

## Authentication

Signed requests are EIP-712 typed data, signed with your Unigox wallet's private key. `wallet` is your wallet: the one that owns the addresses and receives the payments, never the payer's. History returns your own wallet's payments in and out. These requests need no API key and no Unigox login.

Memo-address domain:

```json
{"name":"Unigox Bridge Memo Locks","version":"1","chainId":42161}
```

The domain's name is a fixed label of the signature format: type it exactly; it is not a product you use. In the endpoint paths, `memo-locks` means reservations of your payment addresses: a reservation (`lock`) attaches your memo to an address, releasing it (`unlock`) ends that reservation, and its number is the address ID (`lockId`).

There is no `verifyingContract`. `chainId` in the body must equal the `chainId` you signed with. It names the chain your signature is made for, not the network your customer pays on. `chainType` selects the address type.

An ordinary wallet with a private key signs directly. A deployed smart-contract wallet signs with ERC-1271, on a chain where Unigox has turned contract-wallet signatures on. Contract wallets that are not deployed yet, and Solana wallets, cannot sign these requests, even for Solana addresses (`chainType: "svm"`).

## Signing types

Each action has a distinct primary type. Field order is part of the signing schema:

```text
AllocateAndLock(string action,address wallet,string environment,string chainType,string memo,uint64 expiresAt,string callbackUrl,bytes32 nonce,uint64 deadline)
Lock(string action,address wallet,string environment,string chainType,string depositAddress,string memo,uint64 expiresAt,string callbackUrl,bytes32 nonce,uint64 deadline)
Unlock(string action,address wallet,string environment,string chainType,string depositAddress,uint256 lockId,bytes32 nonce,uint64 deadline)
ListLocks(string action,address wallet,string environment,uint64 issuedAt,uint64 expiresAt)
```

| Field | Meaning |
| --- | --- |
| `action` | `allocate_and_lock`, `lock`, `unlock` or `list`, matching the primary type |
| `wallet` | Your wallet address (EVM): it owns the addresses |
| `environment` | `production` or `staging`, as **Developers → Environment** shows. A signature for one does not work on the other |
| `chainType` | `evm`, `svm`, `tvm` or `ton` |
| `memo` | Exact reference, 1–256 UTF-8 bytes; no NUL or malformed Unicode |
| `expiresAt` for writes | Unix seconds when the reservation ends; `"0"` means no expiry |
| `callbackUrl` | `""` while payment notifications are off (they are, for now); later, your public HTTPS address for them |
| `nonce` | Fresh random 32 bytes, encoded as `0x` plus 64 hex digits; single use per wallet |
| `deadline` | Unix seconds by which the request must reach Unigox: later than the server's time, at most `memoLimits.maxWriteDeadlineSeconds` ahead |
| `issuedAt`, `expiresAt` for lists | How long the read signature is valid, at most 86,400 seconds; `issuedAt` may be at most 300 seconds ahead of the server's time |

Integer fields inside `message` or `authorization` accept decimal strings or safe JSON integers. Top-level `chainId` requires a JSON number. Additional message fields are rejected.

A write's deadline is checked when the request arrives: it must be after the server's time and at most `maxWriteDeadlineSeconds` later. It limits only when the request may be sent, not how long the address or the link lives. A read signature can be reused until it expires and cannot be withdrawn earlier.

Fetch fresh `GET /config` from the same API address before signing. Its top-level `memoLimits` object contains `serverTimeSeconds` and `maxWriteDeadlineSeconds`; it is a sibling of `data`, not a field inside the chain list. Calculate the deadline from these values rather than the wallet or browser clock. The allocation example below uses the full advertised window.

Signing and submission must finish before that deadline. Changing a deadline requires a new signature. For a new-address request already submitted, follow [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) instead of changing the original signed request.


## GET /config

No signature. Read it fresh before you sign: take the deadline and the server's time from it, not from your own clock.

| Field | Meaning |
| --- | --- |
| `data` | The networks: `chainId`, `chainType` (`EVM`, `SOLANA`, `TVM` or `TRON`, `TON`), `name`, `active`, `requiredConfirmations`, `blockTimeMs`, `processingTimeMs` and `tokens` (`symbol`, `address`, `decimals`, `native`, `active`, `groupId`) |
| `memoLimits.maxMemoBytes` | 256: the longest reference |
| `memoLimits.maxWriteDeadlineSeconds` | 600: how far ahead a signed write may be valid |
| `memoLimits.serverTimeSeconds` | The server's time, Unix seconds |
| `memoLimits.maxCallbackUrlBytes` | `0` while payment notifications are off: then sign `callbackUrl: ""` |
| `webhookKeys` | Keys for payment notifications; empty while they are off |

`UNIGOX_BALANCE_CHAIN_ID` (`660279`) is a fixed number that marks a credit to your Unigox wallet. It appears as a chain in `data`; never offer it to payers.

A 500 with `status: "not_fetched"` means the configuration could not be read: keep what you have and read again later.

## Get a new payment address (POST /memo-locks/allocate)

```http
POST /memo-locks/allocate
Content-Type: application/json
```

The example assumes a viem `walletClient` and `account` for your wallet, and `invoiceReference`, the order's reference text. Payment notifications are off for now, so it signs `callbackUrl: ""` and you confirm payments from your history. It would sign your own address only once `GET /config` reports notifications on (`memoLimits.maxCallbackUrlBytes` above 0 and at least one `webhookKeys` entry); the address in it is a placeholder.

```js
const configResponse = await fetch(`${UNIGOX_PAYMENTS_API}/config`, {cache: "no-store"});
if (!configResponse.ok) throw new Error("unigox_config_unavailable");
const {memoLimits, webhookKeys} = await configResponse.json();
// Sign a callback URL only when callbacks are available; a URL while they are not is refused with 400.
const callbacksAvailable = memoLimits.maxCallbackUrlBytes > 0 && webhookKeys?.length > 0;
const deadline = (
  BigInt(memoLimits.serverTimeSeconds) + BigInt(memoLimits.maxWriteDeadlineSeconds)
).toString();

const domain = {
  name: "Unigox Bridge Memo Locks", version: "1", chainId: 42161,
};
const types = {
  AllocateAndLock: [
    {name: "action", type: "string"},
    {name: "wallet", type: "address"},
    {name: "environment", type: "string"},
    {name: "chainType", type: "string"},
    {name: "memo", type: "string"},
    {name: "expiresAt", type: "uint64"},
    {name: "callbackUrl", type: "string"},
    {name: "nonce", type: "bytes32"},
    {name: "deadline", type: "uint64"},
  ],
};
const random = crypto.getRandomValues(new Uint8Array(32));
const message = {
  action: "allocate_and_lock",
  wallet: account.address,
  environment: "production",
  chainType: "evm",
  memo: invoiceReference,
  expiresAt: "0",
  callbackUrl: callbacksAvailable ? "https://merchant.example/webhooks/unigox" : "",
  nonce: "0x" + Array.from(random, b => b.toString(16).padStart(2, "0")).join(""),
  deadline,
};
const signature = await walletClient.signTypedData({
  account, domain, types, primaryType: "AllocateAndLock", message,
});
const response = await fetch(`${UNIGOX_PAYMENTS_API}/memo-locks/allocate`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({chainId: domain.chainId, message, signature}),
});
const result = await response.json();
if (!response.ok) throw new Error(result.details ?? "allocation_failed");
const allocation = result.data?.allocated?.[0];
if (!allocation || allocation.lock?.status !== "ACTIVE") {
  throw new Error("allocation_incomplete");
}
// For this EVM example, select a confirmed deposit network from the response.
const readyChainIds = allocation.monitoring?.chains
  ?.filter(chain => chain.confirmed).map(chain => chain.chainId) ?? [];
// HTTP 202 keeps the same allocation; signed /memo-locks/list reports subsequent readiness.
```

Response example:

```json
{
  "status": "memo_locked",
  "code": 200,
  "data": {
    "chainType": "evm",
    "allocated": [{
      "addressIndex": 1,
      "address": "0x2222222222222222222222222222222222222222",
      "monitoring": {"watched": true, "chains": [{"chainId": 1, "confirmed": true}]},
      "lock": {
        "lockId": "12",
        "wallet": "0x1111111111111111111111111111111111111111",
        "chainType": "evm",
        "address": "0x2222222222222222222222222222222222222222",
        "memo": "NW-20418 · 250.00 USD",
        "memoHash": "<keccak256 of exact memo UTF-8 bytes>",
        "callbackUrl": "https://merchant.example/webhooks/unigox",
        "lockedAt": "2026-10-12T04:00:00.000000Z",
        "expiresAt": null,
        "unlockedAt": null,
        "unlockReason": null,
        "status": "ACTIVE"
      }
    }]
  }
}
```

Each successful request makes one new address, up to your address limit. While its reservation is active, the address takes every supported coin on every network of its type, any number of times.

### Payment address formats

New payment addresses use the following formats. New-address and reserve responses use `address`; transaction status and history use `depositAddress`.

| `chainType` | Payment address format |
| --- | --- |
| `evm` | `0x`-prefixed hexadecimal address; compare by its 20-byte value, not letter case |
| `svm` | Base58 Solana address; case-sensitive |
| `tvm` | Base58Check Tron address, matching the address you got; case-sensitive |
| `ton` | Non-bounceable, URL-safe TON address; preserve the returned string |

Reuse the returned `address` for signed reserve and release requests and for the `address` filter of the reservation list. EVM, Solana and TON address text is preserved in other responses; an existing TON address can also be in raw `workchain:hex` form. When present, Tron `depositAddress` is presented in Base58Check.

Tron formatting applies to the payment address only. `fromTx` and `fromToken` are returned without address-format conversion, including any hexadecimal prefix and letter case. Use these values unchanged; do not convert them to Base58 when matching a payment or requesting transaction status.

### Network readiness

A new EVM or TRON address is set up on its networks in the background. The address and its reference are saved before
the answer. Until every network is ready, the answer is HTTP 202 `addresses_preparing`: the same address and `ACTIVE`
reservation as a finished answer, with the readiness so far (`monitoring`):

```json
{"watched":false,"chains":[{"chainId":1,"confirmed":true},{"chainId":42161,"confirmed":false}]}
```

This address takes payments on Ethereum while Arbitrum is still getting ready. Only networks with `confirmed: true`
are ready; a network that is missing, or an empty `chains` list, is not ready. `watched: true` means every network is
ready. The coins on a ready network must also pass the [checks below](#supported-payment-assets).

`POST /memo-locks/list` returns fresh readiness on each active reservation; reuse your read signature until it expires.
Checking readiness makes no new address and changes no reference, and a 202 needs no new request or signature. TON and
Solana have one network each and report it in `monitoring.watched`. Each address has its own readiness. No readiness
information means not ready.

### Supported payment assets

`GET /config` lists the networks in `data`, including coins that are off and native coins: not everything in it can be offered to a payer.

Offer a coin on a network only when all of these hold:

| Check | Required configuration |
| --- | --- |
| Payment network | Source chain `active: true`, a matching address type, and `chainId` other than `UNIGOX_BALANCE_CHAIN_ID` (`660279`, the fixed number that marks a credit to your Unigox wallet) |
| Address readiness | The address's reservation has status `ACTIVE`, and [monitoring is confirmed](#network-readiness) for the selected network |
| Coin the payer sends | A `tokens[]` entry of that network with `active: true`, `native: false` and a nonempty `address`; identify the token by network and contract or mint address, not symbol alone |
| Coin credited to your wallet | An active, non-native coin with a nonempty address on `UNIGOX_BALANCE_CHAIN_ID` (660279), matching the coin the payer sends as described below |

`GET /config` writes the address types `EVM`, `SOLANA`, `TVM` (or `TRON`) and `TON`; address requests write them `evm`, `svm`, `tvm` and `ton`.

Coins are matched by `tokens[].groupId`: a coin with a `groupId` matches the coin of the same group on `UNIGOX_BALANCE_CHAIN_ID`. An EVM, TRON or TON coin without a group matches by the same `symbol`. A Solana coin needs a matching group: no `symbol` fallback. Two coins without a group never match each other.

Offer a coin only when exactly one entry has its contract (or mint) address and exactly one coin matches it on `660279`. The amount sent and the amount credited each use their own coin's `decimals`; the transaction status names the coin and the amount actually credited.

Payments are transfers of the listed coins (ERC-20, TRC-20, jettons and SPL tokens). Native ETH, TRX, TON and SOL are not taken. On Solana, the transfer must reach the payment address's associated token account for that coin; another token account of the same address does not count. For a Solana Token-2022 coin that takes a fee on transfer, the amount after the fee is credited.

`quotingThreshold` in `/config` is not a minimum payment, and `/config` has no minimum payment amount. Converting between decimals rounds down, so a very small transfer can be credited as nothing.

A coin or network that is not supported, or not ready, is neither credited nor returned by itself. Write to support@unigox.com; recovery is not guaranteed.

### Recover a lost answer to a new-address request

Retries of a new-address request use the original signed request body: the same `chainId`, `message` and `signature`.
The wallet and nonce identify one new-address request; all signed fields must match. A new nonce makes another new address.

| State of the request | Response or recovery operation |
| --- | --- |
| Response unavailable | Repeat `POST /memo-locks/allocate` with the original signed body |
| Address and reference saved; EVM or TRON networks still getting ready | 202 `addresses_preparing`; use signed `/memo-locks/list` for readiness |
| Address made; reference not attached yet | The same request finishes it on the same address while its signature is valid; errors include `data.allocated` |
| Request completed | The same request returns the original address and address ID (`lockId`), with the reservation's current status |
| Signature expired; address made but not reserved | The retry returns the original address with `memo_lock_signature_expired`; a fresh signed `POST /memo-locks/lock` activates that address |
| Original reservation released or expired | The retry returns that closed reservation; it does not create or reactivate a reservation |
| The nonce was used by an older request whose answer Unigox did not keep | 409 `memo_lock_nonce_used`; read your reservations (`POST /memo-locks/list`) to see what that request did |

Payment readiness requires an `ACTIVE` reservation and confirmation for the selected network. A completed request remains
retrievable with its exact original signature after the write deadline; that signature cannot authorize further writes.
A Solana address is set up before the answer. HTTP 503 with `status: "addresses_not_watched"` and
`details: "deposit_address_not_watched"` means it is not finished. On `/memo-locks/allocate` this answer includes the
saved address in `data.allocated`; the [readiness error examples](#readiness-errors) show it next to `/memo-locks/lock`.

A used nonce with any other signed field (another reference, address type or callback) returns 409
`memo_lock_nonce_used`. A request that expired does not prove it made no address: read your reservations before you
sign another.


## List an address's reservations

```http
POST /memo-locks/list
Content-Type: application/json
```

```json
{
  "chainId": 42161,
  "authorization": {
    "action": "list",
    "wallet": "0x1111111111111111111111111111111111111111",
    "environment": "production",
    "issuedAt": "<current Unix seconds>",
    "expiresAt": "<Unix seconds within the read window>"
  },
  "signature": "<EIP-712 ListLocks signature>",
  "query": {"status": "ACTIVE", "limit": "50"}
}
```

```json
{"status":"memo_locks_retrieved","code":200,"data":{"locks":[],"nextBefore":null}}
```

A nonempty response contains the same reservation objects as a new-address request, with `monitoring` added to each `ACTIVE` reservation. Closed reservations do not carry readiness. Optional query fields are strings: `chainType`, `address`, `status` (`ACTIVE`, `UNLOCKED`, `EXPIRED`), `limit` (default 50, maximum 100) and `before` (an address ID, the `lockId` field). An omitted `chainType` includes all address types; an omitted `status` includes reservations in every status. Reservations are ordered by descending address ID. `nextBefore` is the address ID of the last reservation on a full page and supplies the next page's `before` value; it is null on a page shorter than `limit`. A final page that is exactly full still returns a cursor, and the request that follows returns an empty `locks` list and a null `nextBefore`. The endpoint returns reservations, not payment history.


## Reserve an address again, or end its reservation

| Route | Signed primary type | Success data |
| --- | --- | --- |
| `POST /memo-locks/lock` | `Lock` | `{ "lock": { ... }, "monitoring": { ... } }`, status `memo_locked` or `addresses_preparing` |
| `POST /memo-locks/unlock` | `Unlock` | `{ "lock": { ... } }`, status `memo_unlocked` |

Both endpoints accept `{chainId, message, signature}` with the corresponding signing schema. **Lock** contains the new-address fields plus `depositAddress`, with `action: "lock"`. **Unlock** contains `action`, `wallet`, `environment`, `chainType`, `depositAddress`, `lockId`, `nonce` and `deadline`, with `action: "unlock"`.

Only your wallet can change its reservations. An address has at most one active reservation. Ending it (`unlock`) does not stop transfers to the address, send anything back or undo earlier credits.

To put a new reference on an address, end its reservation (answer `memo_unlocked`), then reserve it (`lock`) with the new reference and a `callbackUrl`: your receiver when callbacks are available, otherwise `""`. Each request needs a fresh nonce. The new reservation is `ACTIVE` with a new address ID (`lockId`) and takes payments on a network once that network is ready. A reservation that expired can be replaced with `lock` directly.

A payment belongs to the reservation that was active at the time of its transaction on the network. A payment made while no reservation was active carries no reference. A payment reported late keeps the address ID (`memoLockId`) of the reservation it was paid under.


## Wallet transaction history

```http
POST /transactions/history
Content-Type: application/json
```

Returns your wallet's payments in and out, signed with your wallet's key. No Unigox login and no API key. Reference fields are left out unless you ask for them (`includeMemo: true`).

History uses a separate EIP-712 domain and primary type:

```json
{"name":"Unigox Bridge History","version":"1","chainId":42161}
```

```text
History(string action,address wallet,string environment,uint64 issuedAt,uint64 expiresAt,bool includeMemo)
```

`action` is `"history"`. `includeMemo` is part of the signature: `false` authorizes ordinary history; `true` also requests memo fields. An omitted request field is interpreted as `false` and must have been signed as `false`. A signature for `/memo-locks/list` does not work here.

The read window uses the same limits as listing reservations: at most 86,400 seconds, with up to 300 seconds of clock skew for `issuedAt`. The authorization can be reused for pages and refreshed results until expiry. Changing the wallet, environment, signing chain, expiry or memo permission requires a new signature.

```js
const now = Math.floor(Date.now() / 1000);
const authorization = {
  action: "history",
  wallet: account.address,
  environment: "production",
  issuedAt: String(now),
  expiresAt: String(now + 3600),
  includeMemo: true,
};
const domain = {name: "Unigox Bridge History", version: "1", chainId: 42161};
const types = {
  History: [
    {name: "action", type: "string"},
    {name: "wallet", type: "address"},
    {name: "environment", type: "string"},
    {name: "issuedAt", type: "uint64"},
    {name: "expiresAt", type: "uint64"},
    {name: "includeMemo", type: "bool"},
  ],
};
const signature = await walletClient.signTypedData({
  account, domain, types, primaryType: "History", message: authorization,
});
const response = await fetch(`${UNIGOX_PAYMENTS_API}/transactions/history`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    chainId: domain.chainId, authorization, signature,
    query: {memoLockId: "12", limit: 50},
  }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.details ?? "history_failed");
const {transactions, nextBefore} = result.data;
```

Optional `query` fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `limit` | Number | Page size, 1–100; default 50 |
| `before` | Decimal string | The next page: `nextBefore` from the page before |
| `direction` | String | `incoming` or `outgoing`; omitted includes both |
| `memoLockId` | Decimal string | An address ID: the payments made under that reservation |
| `chainType` | String | Source address type: `evm`, `svm`, `tvm` or `ton` |
| `depositAddress` | String | Payment address; requires `chainType` |

Filters narrow the signing wallet's history. They cannot select another wallet. EVM address comparison is case-insensitive; Tron accepts Base58 or hex and returns Base58. Solana and TON address filters use the exact returned address.

Response envelope:

```json
{
  "status": "history_retrieved",
  "code": 200,
  "data": {
    "transactions": [],
    "nextBefore": null
  }
}
```

Each transaction has the [transaction status fields](#transaction-status), plus `intentId` (the payment's ID in your history) and `logIndex` (or `null`), both decimal strings. `fromChain` and `toChain` are decimal strings; amounts are integer strings in token base units. `toAmount` retains the expected output, while `actualToAmount` reports the confirmed recipient amount when available. A payment appears once, also when your wallet both sent and received it. Two payments in one transaction have two `intentId`s.

With `includeMemo: false`, `memo`, `memoHash`, `memoSource` and `memoLockId` are omitted; execution details also omit their memo fields. With `includeMemo: true`, a reference is returned only to the wallet that reserved it: the payer cannot read it. The text is the reference the payment was made under, even when the address has a new reference since.

Results include pending and failed records as well as completed ones. A record is not proof of payment: check it as [Transaction status](#transaction-status) says. Responses use `Cache-Control: no-store`.


### Payment views

Payment filters read the payments credited to your wallet only, as the portal's **Payments** does. Any of these fields makes the read a payment read: incoming only, and `direction: "outgoing"` is refused.

| Field | Type | Values |
| --- | --- | --- |
| `view` | String | `all`, `progress`, `completed`, `returned`, `other`, `attention` |
| `q` | String | Search text, up to 256 bytes |
| `coin` | Array of strings | Coin symbols, for example `["USDT"]` |
| `network` | Array | Chain ids, for example `[42161]` |
| `source` | Array | `link`, `topup`, `other` |
| `status` | Array | `detected`, `crediting`, `credited`, `hold`, `failed`, `refunding`, `refunded` |
| `amountCheck` | Array | `underpaid`, `overpaid`, `late`, `too_small`, `ok` |
| `dateBasis` | String | `sent` or `credited` |
| `from`, `to` | String | The period, by `dateBasis`: RFC 3339 times with their zone, `from` before `to` |

`view`, `source` and `amountCheck` read your references, so they need `includeMemo: true` in the signed authorization; without it the answer is 403 `history_memo_access_required`. A payment read can add `payment` to each record, and `total` and `viewCounts` to `data`.

### Read a reservation's or an address's payments

History stays available after a reservation expires or is ended. No transaction hash is needed.

Use `memoLockId` for an invoice or `chainType` and `depositAddress` for a payment address. Pages are ordered by descending `intentId`; pass `nextBefore` as `before` until it is null. Count each record once by `(environment, intentId)`; the environment is that of the API address you asked.

The pages list records, not changes of status: an older pending record can be credited later and keeps its ID. So a periodic check starts again without `before` for the order or address and looks at pending records again. An empty result means nothing is recorded yet.


## Transaction status

```http
GET /transaction/{fromChain}/{fromTx}?quoteId={quoteId}
```

The response uses `{status: "found", code: 200, data: {...}}`. `data` includes:

- source: `quoteId`, `fromChain`, `fromToken`, `fromAmount`, `fromTx`, `fromTxMinedAt`, `userAddress`;
- destination: `toChain`, `toToken`, `toAmount`, `actualToAmount`, `recipientAddress`, `toTx`, `toTxSetAt`, `toTxMinedAt`, and `receiving` (`txHash`, `chainId`, `tokenAddress`, `tokenAmount`);
- state: `status`, `subStatus`, `expectedCompletionSecondsLeft`, `refund`, `refundTx`, `refundTxSetAt`, `refundTxMinedAt`;
- reference: `memo` (always `null` for a payment to a reserved address: read your history with `includeMemo: true`), `memoSource`, `memoLockId`, `memoHash`, `depositAddress`;
- `execution`, only for quotes with destination execution.

| `status` | `subStatus` values | Meaning |
| --- | --- | --- |
| `CREATED`, `PENDING`, `PROCESSING`, `DEFERRED` | `WAIT_SOURCE_CONFIRMATIONS`, `WAIT_DESTINATION_TRANSACTION`, `BRIDGE_NOT_AVAILABLE`, `CHAIN_NOT_AVAILABLE`, `REFUND_IN_PROGRESS`, `UNKNOWN_ERROR`, or empty | In progress; can still become a credit |
| `COMPLIANCE_HOLD`, `COMPLIANCE_FROZEN` | not used for the decision | Held for review; can still become a credit after a decision |
| `DONE` | `COMPLETED` | Settled. A credit only when `refund` is not set |
| `DONE` | `PARTIAL` | Settled in part, possibly in another token; not a full credit |
| `DONE` | `REFUNDED` | Sent back by Unigox support to an address the payer confirmed; not a credit |
| `FAILED` | `NOT_PROCESSABLE_REFUND_NEEDED`, `OUT_OF_GAS`, `SLIPPAGE_EXCEEDED`, `INSUFFICIENT_ALLOWANCE`, `INSUFFICIENT_BALANCE`, `UNKNOWN_ERROR`, `EXPIRED`, `REFUND_FAILED`, `REFUND_INSUFFICIENT_BALANCE`, `REFUND_CHAIN_NOT_AVAILABLE` | Not completed; not a credit |

Only `DONE` with `COMPLETED` and no `refund` confirms a payment. Treat any value not listed here as not yet a credit.

`depositAddress` follows the [payment address format rules](#payment-address-formats). Status and history return `null` when no payment address is recorded. Source transaction and token identifiers are returned unchanged.

Count a payment only when it is under this order's address ID and reference, `DONE` with `COMPLETED` and no `refund`, credited to your wallet on `660279` in a supported coin, and its amount covers the order. Count `actualToAmount`: the exact amount credited, in the destination token's smallest units, set only for a `DONE` / `COMPLETED` payment that was not refunded. Keep amounts as strings or `BigInt`: a JavaScript `Number` can lose precision.

`quoteId` (from the checkout's events or your history) picks one payment of the transaction; `?logIndex=` picks it by its position in the transaction. Without either, you get only the transaction's first payment.

`logIndex` uses the exact decimal string from the checkout or your wallet history, including for TON. Its range is `"0"` through `"9223372036854775807"`. Leading zeroes (except `"0"`), signs, fractions, exponents and larger values return HTTP 400. Preserve it as a string; converting large values to a JavaScript number can change the identifier.

```http
GET /transaction/{fromChain}/{fromTx}?logIndex=100000000000001
```

A 404 means nothing is recorded for it yet: ask again a little later. A source transaction hash is required for this lookup. When the source hash is unavailable, [wallet transaction history](#wallet-transaction-history) can retrieve the saved record by reservation or payment address.


## Link check

> **Not available yet.** This endpoint is part of the crypto processing release. Until this notice is gone it can answer 404.

`GET {link check}/crypto-checkout/memo-locks/{lockId}?wallet={wallet}&memoHash={memoHash}`

The payment page reads it before it shows an address; a payment page of your own should too. No signature. The link check address is **Developers → Environment → Technical details → Link check**, without `/crypto-checkout/memo-locks/{addressId}` at its end.

| Parameter | Value |
| --- | --- |
| `lockId` | The address ID |
| `wallet` | The wallet that reserved it, lowercase `0x` address |
| `memoHash` | `0x` and the keccak-256 of the reference's UTF-8 bytes |

| Answer | Meaning |
| --- | --- |
| 200 `memo_lock_retrieved` | `data.lock` has `lockId`, `wallet`, `chainType`, `address`, `memoHash`, `lockedAt`, `expiresAt`, `status` (`ACTIVE`, `UNLOCKED`, `EXPIRED`) and, while active, `monitoring`. `data.serverTime` is the server's time. Never the reference text. |
| 404 `memo_lock_not_found` | No reservation with this ID, wallet and fingerprint. An unknown ID gets the same answer, so IDs cannot be walked. |
| 403 `memo_lock_merchant_unverified` | The reservation was made after its wallet had received the most it may before business verification. The payment page shows the link as closed. |
| 400 `validation_memo_lock_request_invalid` | `wallet` or `memoHash` is missing, malformed or given twice |
| 429 | More than 120 checks a minute from one IP address. Wait and ask again. |
| 503 `memo_lock_unavailable`, 500 | The check is not possible right now. Show no address; ask again later. |

The check proves that the reservation matches the values you send. It does not prove who owns the wallet when those values came from a link a payer could edit: compare them with your own order record.

## Solana transfers of one transaction

> **Not available yet.** This endpoint is part of the crypto processing release. Until this notice is gone it can answer 404.

`GET {link check}/crypto-checkout/memo-locks/{lockId}/solana-transfers/{signature}?wallet={wallet}&memoHash={memoHash}`

A Solana transaction can hold several transfers to one address, and `GET /transaction` returns one. This lists them, without a signature. The transaction signature is case-sensitive.

The answer, `checkout_transfers_retrieved`, has `data.transfers`, each with `logIndex`, `token` and `amount` (in the token's smallest units), and `data.limited: true` when there are more than 200. Read each with `GET /transaction/{chainId}/{signature}?logIndex=…` and check it before you count it: the list alone proves no payment. An empty list means nothing is indexed yet. Errors are as for the link check.

## Signing test vectors

Check your signing code against these before you send anything. They are signed with the public development key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (wallet `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`), which anyone can use: never send money to that wallet or sign real requests with it. Sign each `message` with its `domain` and `primaryType` (the types under [Signing types](#signing-types) and [Wallet transaction history](#wallet-transaction-history)); your EIP-712 digest must equal `hash`, and an ordinary ECDSA signature over it must equal `signature` (both are deterministic). Integers are the decimal strings shown; sign them as `uint64`/`uint256` values.

`AllocateAndLock`

```json
{
  "domain": {
    "name": "Unigox Bridge Memo Locks",
    "version": "1",
    "chainId": 42161
  },
  "primaryType": "AllocateAndLock",
  "message": {
    "action": "allocate_and_lock",
    "wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "environment": "staging",
    "chainType": "evm",
    "memo": "NW-20418 · 250.00 USD",
    "expiresAt": "0",
    "callbackUrl": "",
    "nonce": "0x1111111111111111111111111111111111111111111111111111111111111111",
    "deadline": "1793300000"
  }
}
```

- `hash`: `0x8a0b7f12db9373e2f093bbc792c6b043fb5feddf0d579dc7af1ec7a41fc28735`
- `signature`: `0x1bc14b86a471c08226b17d85b7629228f948d0e021280933f348beab2eaa1c8700799dab8a510d2b968130ea6efb2be82945e93d7672d3b348556d0d480724d11c`

`Lock`

```json
{
  "domain": {
    "name": "Unigox Bridge Memo Locks",
    "version": "1",
    "chainId": 42161
  },
  "primaryType": "Lock",
  "message": {
    "action": "lock",
    "wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "environment": "staging",
    "chainType": "tvm",
    "depositAddress": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    "memo": "NW-20418 · 250.00 USD · v2 · no tolerance",
    "expiresAt": "0",
    "callbackUrl": "",
    "nonce": "0x1111111111111111111111111111111111111111111111111111111111111111",
    "deadline": "1793300000"
  }
}
```

- `hash`: `0x0fb01feb48a9bde5953fd01a47e6c4e9a04775e0dcc48b843d1067bf5d7792dd`
- `signature`: `0xc21df0cb96995840a269dd794caa482287970e1a38b6405988fbadd63e74192f7542b6a43219a5336a931aa99c8469a26553e7943da9225dc06a2b3b8a83b1711b`

`Unlock`

```json
{
  "domain": {
    "name": "Unigox Bridge Memo Locks",
    "version": "1",
    "chainId": 42161
  },
  "primaryType": "Unlock",
  "message": {
    "action": "unlock",
    "wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "environment": "staging",
    "chainType": "evm",
    "depositAddress": "0x2222222222222222222222222222222222222222",
    "lockId": "27",
    "nonce": "0x1111111111111111111111111111111111111111111111111111111111111111",
    "deadline": "1793300000"
  }
}
```

- `hash`: `0x5ad81ae3ad5f18b5cc852f7dbfdef4c72f6f7a16042ac94acb16d984ec82a66d`
- `signature`: `0x8049e60b8f13b085357ee33c4a7b61a6fac45b869a20b2086de5d533687fbf2b489797edbaa89662085cc890be5a239c95a1e776cfceb1ba241d522b3c10c98d1c`

`ListLocks`

```json
{
  "domain": {
    "name": "Unigox Bridge Memo Locks",
    "version": "1",
    "chainId": 42161
  },
  "primaryType": "ListLocks",
  "message": {
    "action": "list",
    "wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "environment": "staging",
    "issuedAt": "1793300000",
    "expiresAt": "1793303600"
  }
}
```

- `hash`: `0xf89cce85986cc08dfab12679bca44db1e017ab65d6944e71d97ca10e8e1617ec`
- `signature`: `0x9a28503cebc2e9894e69817369f1063e19e592a6381610e83c3aefa3ec727ced5571ad078f39a25041f3e582158e0b886f544dcc3533d3e6d1ef4ab672032be41b`

`History`

```json
{
  "domain": {
    "name": "Unigox Bridge History",
    "version": "1",
    "chainId": 42161
  },
  "primaryType": "History",
  "message": {
    "action": "history",
    "wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "environment": "staging",
    "issuedAt": "1793300000",
    "expiresAt": "1793303600",
    "includeMemo": false
  }
}
```

- `hash`: `0xd61df77083d5118dc60d3694eceebb3b244be9252e9f94107836dd17fed9cc3f`
- `signature`: `0xdce9335796dcbd6f5414a2c59de7c359ca0f651ce5a509459ec65c5b8027d01b46d40276cd211fe3d44bec589d1a7efe3f33bc59b360805ac7a228322c56a6ca1b`

The `memoHash` that transaction status returns for `NW-20418 · 250.00 USD` is keccak-256 of its UTF-8 bytes: `0xbef6c3407592a5bd6cbfac5e4a32bd1aa28720c118709f43ac7c6d044a4cfe66`.


## Errors

`code` matches the HTTP status. `status` identifies the response outcome; `details` contains the error key.
They are separate fields. In the first table, routes are under `/memo-locks/`.

| Route | HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- | --- |
| All `/memo-locks/` routes | 400 | `bad_request` | `validation_memo_lock_request_invalid` / `validation_environment_mismatch` | Malformed signed request or wrong environment |
| `allocate`, `lock`, `unlock` | 400 | `bad_request` | `validation_deadline_invalid` | Submission deadline exceeds the allowed window |
| `allocate`, `lock` | 400 | `bad_request` | `validation_memo_required` / `validation_expires_at_invalid` | Missing memo or invalid memo expiry |
| `allocate`, `lock` | 400 | `bad_request` | `validation_callback_url_invalid` | Callbacks are unavailable in this environment (`memoLimits.maxCallbackUrlBytes` is 0), or the URL is not HTTPS on port 443, carries credentials or a fragment, or is too long. Sign `callbackUrl: ""` when callbacks are unavailable |
| `allocate`, `lock` | 400 | `bad_request` | `validation_callback_url_not_public` | Callback URL does not resolve exclusively to permitted public addresses |
| `allocate`, `lock` | 400 | `bad_request` | `validation_memo_too_long` / `validation_memo_not_string` / `validation_text_not_well_formed` | Memo longer than `memoLimits.maxMemoBytes` UTF-8 bytes, not a string, or containing NUL or malformed Unicode |
| `allocate`, `lock`, `unlock` | 400 | `bad_request` | `memo_not_supported_for_chain` | Address type is unsupported or unavailable for the requested memo operation |
| `list` | 400 | `bad_request` | `validation_read_authorization_invalid` / `validation_invalid_list_query` | Invalid authorization window or list filter |
| All `/memo-locks/` routes | 401 | `memo_lock_failed` | `memo_lock_signature_invalid` | Signature does not authorize the request |
| `allocate`, `lock`, `unlock` | 401 | `memo_lock_failed` | `memo_lock_signature_expired` | Write deadline passed; retries follow [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) |
| `list` | 401 | `memo_lock_failed` | `memo_lock_read_authorization_expired` | Read authorization expired |
| `allocate`, `lock`, `unlock` | 404 | `memo_lock_failed` | `deposit_address_not_found` / `memo_lock_not_found` | Address or reservation was not found for the owner |
| `allocate`, `lock`, `unlock` | 409 | `memo_lock_failed` | `memo_lock_nonce_used` | The nonce was used: by this request with other fields, or by an older request |
| `allocate`, `lock`, `unlock` | 409 | `memo_lock_failed` | `deposit_address_already_locked` / `memo_lock_not_active` | Current reservation state prevents the operation |
| All `/memo-locks/` routes | 422 | `memo_lock_failed` | `invalid_chain_type` | Invalid address-type value in the message or list filter |
| All `/memo-locks/` routes | 429 | `memo_lock_failed` | `rate_limited` | Request rate limit exceeded |
| `allocate` | 429 | `cap_exceeded` | `deposit_addresses_cap_exceeded` | Address limit reached; `data.remaining` reports remaining capacity |
| `allocate` | 503 | `addresses_not_watched` | `deposit_address_not_watched` | The address's networks are not ready yet; the saved address is in `data.allocated` |
| `lock` | 503 | `addresses_not_watched` | `deposit_address_not_watched` | The address's networks are not ready yet; no `data` field |
| All `/memo-locks/` routes | 503 | `memo_lock_failed` | `signature_verification_unavailable` | Signature verification temporarily unavailable |
| All `/memo-locks/` routes | 413 | `bad_request` | none | Request body larger than 32 KiB |
| All `/memo-locks/` routes | 500 | `memo_lock_failed` | `internal_error` | Unexpected server error; on `allocate`, follow [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) |

For `POST /transactions/history`:

| HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- |
| 400 | `history_failed` | `validation_history_request_invalid` / `validation_environment_mismatch` / `validation_read_authorization_invalid` | Invalid request, filter, environment or authorization window |
| 401 | `history_failed` | `history_signature_invalid` / `history_authorization_expired` | Signature verification failed or the read authorization expired |
| 429 | `history_failed` | `rate_limited` | Request or signature-verification limit exceeded |
| 503 | `history_failed` | `signature_verification_unavailable` | Signature verification temporarily unavailable |
| 413 | `bad_request` | none | Request body larger than 32 KiB |
| 500 | `history_failed` | `internal_error` | Unexpected server error; repeat the request later |

The shared IP limiter can reject history requests before the history handler with HTTP 429,
`status: "memo_lock_failed"` and `details: "rate_limited"`.

For `GET /transaction/{fromChain}/{fromTx}`:

| HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- |
| 400 | `bad_request` | `validation_invalid_quote_id` | `quoteId` is not `0x` followed by 64 hexadecimal digits |
| 400 | `bad_request` | `validation_invalid_log_index` | `logIndex` is not a decimal string from `"0"` to `"9223372036854775807"` without sign, fraction or leading zero |
| 404 | `not_found` | `from_tx_not_found` | Nothing recorded for it yet, or the chain or hash is wrong. Ask again later or use history |
| 500 | `not_fetched` | `internal_error` | The record could not be read and `data` is an empty array. This says nothing about the payment: ask again later |

For `GET /config`, HTTP 500 with `status: "not_fetched"` and no `data`, `webhookKeys` or `memoLimits` means the configuration could not be read. Keep the keys and limits you already have and read again later.
These tables list common errors. Validation errors can identify other invalid fields; changing signed fields requires a new signature.

### Readiness errors

`POST /memo-locks/allocate`, HTTP 503:

```json
{
  "status": "addresses_not_watched",
  "code": 503,
  "details": "deposit_address_not_watched",
  "data": {
    "chainType": "svm",
    "allocated": [{"addressIndex": 1, "address": "<payment address>"}]
  }
}
```

The address is saved, but its reference is not attached yet. [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) reuses this address and the original signed request.

`POST /memo-locks/lock`, HTTP 503:

```json
{
  "status": "addresses_not_watched",
  "code": 503,
  "details": "deposit_address_not_watched"
}
```

`POST /transactions/history` also answers 403 `history_memo_access_required` when a payment view, source or amount check is asked without `includeMemo: true`.
