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

A signed request is EIP-712 typed data, signed with the private key of your Unigox wallet. `wallet` is always your wallet: the one that owns the addresses and receives the payments, never the payer's. History returns the payments into and out of your own wallet. These requests need no API key and no Unigox login.

The signing domain for address requests:

```json
{"name":"Unigox Bridge Memo Locks","version":"1","chainId":42161}
```

The domain's name is a fixed label of the signature format: type it exactly. It is not a product that you use. In the paths, `memo-locks` are the reservations of your payment addresses: `lock` reserves an address for your reference (`memo`), `unlock` ends that reservation, and `lockId` is the address ID.

There is no `verifyingContract`. The `chainId` in the request body must be the `chainId` you signed with. It says which chain the signature is made for, not which network your customer pays on. `chainType` selects the address type.

An ordinary wallet with a private key signs directly. A deployed smart-contract wallet signs with ERC-1271, on a chain where Unigox has turned contract-wallet signatures on. Contract wallets that are not deployed yet, and Solana wallets, cannot sign these requests, even for Solana addresses (`chainType: "svm"`).

## Signing types

Each action has its own primary type. The order of the fields is part of what you sign:

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
| `memo` | The reference, exactly: 1–256 UTF-8 bytes, no NUL and no malformed Unicode |
| `expiresAt` for writes | Unix seconds when the reservation ends; `"0"` means no expiry |
| `callbackUrl` | `""` while payment notifications are off (they are, for now); later, your public HTTPS address for them |
| `nonce` | 32 new random bytes, written as `0x` and 64 hex digits. A wallet can use a nonce once |
| `deadline` | Unix seconds by which the request must reach Unigox: later than the server's time, at most `memoLimits.maxWriteDeadlineSeconds` ahead |
| `issuedAt`, `expiresAt` for lists | How long the read signature is valid, at most 86,400 seconds; `issuedAt` may be at most 300 seconds ahead of the server's time |

Send the integer fields inside `message` and `authorization` as decimal strings, or as JSON integers small enough to stay exact. Send the top-level `chainId` as a JSON number. A message with any other field is rejected.

Unigox checks a write's deadline when the request arrives: the deadline must be later than the server's time, and at most `maxWriteDeadlineSeconds` later. The deadline limits only when the request can be sent. It does not limit how long the address or the link lives. A read signature can be used again until it expires; you cannot cancel it earlier.

Before you sign, read `GET /config` from the same API address. Its `memoLimits` object has `serverTimeSeconds` and `maxWriteDeadlineSeconds`. `memoLimits` is at the top level of the answer, next to `data`, not inside the list of networks. Work out the deadline from these two values, not from your own clock. The example below uses the longest deadline allowed.

Sign and send the request before its deadline. To change a deadline you sign again. If you already sent a new-address request, do not change it: follow [Recover a lost answer to a new-address request](#recover-a-lost-answer-to-a-new-address-request).


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

The example assumes a viem `walletClient` and `account` for your wallet, and `invoiceReference`, the order's reference text. Payment notifications are off for now, so the example signs `callbackUrl: ""`, and you confirm payments from your history. It signs a notification address only when `GET /config` reports notifications on: `memoLimits.maxCallbackUrlBytes` above 0 and at least one `webhookKeys` entry. The address in the example is a placeholder.

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

Each successful request makes one new address, until you reach your address limit. While the reservation is active, the address takes every supported coin, on every network of its address type, any number of times.

### Payment address formats

A payment address has one of these formats. The answers to new-address and reserve requests call it `address`; transaction status and history call it `depositAddress`.

| `chainType` | Payment address format |
| --- | --- |
| `evm` | `0x`-prefixed hexadecimal address; compare by its 20-byte value, not letter case |
| `svm` | Base58 Solana address; case-sensitive |
| `tvm` | Base58Check Tron address, matching the address you got; case-sensitive |
| `ton` | Non-bounceable, URL-safe TON address; preserve the returned string |

Use the `address` exactly as it was returned: in signed reserve and unlock requests, and in the `address` filter of the reservation list. Other answers return EVM, Solana and TON addresses in the same text. An older TON address can also come in the raw `workchain:hex` form. A TRON `depositAddress` is always in Base58Check.

That TRON format applies to the payment address only. `fromTx` and `fromToken` come back exactly as the network gave them, with their hexadecimal prefix and letter case. Use them unchanged: do not convert them to Base58 to match a payment or to ask for a transaction's status.

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

If you get no answer to a new-address request, send the same signed body again: the same `chainId`, `message` and
`signature`. Unigox recognises the request by its wallet and nonce, and every signed field must be the same. A request
with a new nonce makes another address.

| What happened to the request | What you get, and what to do |
| --- | --- |
| You got no answer | Send `POST /memo-locks/allocate` again with the same signed body |
| The address and its reference are saved; EVM or TRON networks are still getting ready | 202 `addresses_preparing`. Read the readiness with a signed `/memo-locks/list` |
| The address was made; its reference is not reserved yet | The same request finishes the reservation on the same address while its signature is valid. An error answer has the address in `data.allocated` |
| The request was completed | The same request returns the same address and address ID (`lockId`), with the reservation's status as it is now |
| The signature expired; the address was made but not reserved | The same request returns that address with `memo_lock_signature_expired`. Reserve the address with a newly signed `POST /memo-locks/lock` |
| The reservation it made has ended or expired | The same request returns that closed reservation. It makes no new reservation and does not reopen the old one |
| The nonce was used by an older request whose answer Unigox did not keep | 409 `memo_lock_nonce_used`. Read your reservations (`POST /memo-locks/list`) to see what that request did |

An address can take a payment on a network when its reservation is `ACTIVE` and that network is confirmed. After the
deadline, the original signed request still returns what it made, but it cannot make anything new.
A Solana address is set up before the answer is sent. HTTP 503 with `status: "addresses_not_watched"` and
`details: "deposit_address_not_watched"` means the setup is not finished. On `/memo-locks/allocate` this answer has the
saved address in `data.allocated`; the [readiness error examples](#readiness-errors) show it next to `/memo-locks/lock`.

A nonce that was already used, sent with any other signed field (another reference, address type or callback), gets 409
`memo_lock_nonce_used`. An expired request may still have made an address: read your reservations before you sign
another one.


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

The answer lists reservations, not payments. Each reservation has the same fields as in the answer to a new-address request. An `ACTIVE` reservation also has `monitoring`; a closed one has no readiness.

The `query` fields are optional, and all are strings:

- `chainType`: one address type. An omitted `chainType` includes all address types.
- `address`: one payment address.
- `status`: `ACTIVE`, `UNLOCKED` or `EXPIRED`; an omitted `status` includes reservations in every status.
- `limit`: the page size, default 50, maximum 100.
- `before` (an address ID, the `lockId` field): the next page.

Reservations come newest first, by descending address ID. On a full page, `nextBefore` is the address ID of the last reservation: pass it as `before` to get the next page. On a page shorter than `limit` it is null. A final page that is exactly full still returns a cursor, and the request that follows returns an empty `locks` list and a null `nextBefore`.


## Reserve an address again, or end its reservation

| Route | Signed primary type | Success data |
| --- | --- | --- |
| `POST /memo-locks/lock` | `Lock` | `{ "lock": { ... }, "monitoring": { ... } }`, status `memo_locked` or `addresses_preparing` |
| `POST /memo-locks/unlock` | `Unlock` | `{ "lock": { ... } }`, status `memo_unlocked` |

Both requests take `{chainId, message, signature}`, signed with their own type. A **Lock** message has the fields of a new-address message plus `depositAddress`, with `action: "lock"`. An **Unlock** message has `action: "unlock"`, `wallet`, `environment`, `chainType`, `depositAddress`, `lockId`, `nonce` and `deadline`.

Only your wallet can change its reservations. An address has at most one active reservation. Ending a reservation (`unlock`) does not stop transfers to the address, does not send anything back and does not undo earlier credits.

To put a new reference on an address, end its reservation (the answer is `memo_unlocked`), then reserve the address (`lock`) with the new reference and a `callbackUrl`: your receiver when callbacks are available, otherwise `""`. Each request needs a fresh nonce. The new reservation is `ACTIVE`, has a new address ID (`lockId`), and takes payments on a network once that network is ready. A reservation that has expired can be replaced with `lock` directly, without `unlock`.

A payment belongs to the reservation that was active when its transaction happened on the network. A payment made while no reservation was active has no reference. A payment that Unigox learns about late keeps the address ID (`memoLockId`) of the reservation it was paid under.


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

`action` is `"history"`. `includeMemo` is part of what you sign: `false` gives the history without references, `true` also returns the reference fields. If you leave `includeMemo` out of the request, it counts as `false`, and you must have signed it as `false`. A signature made for `/memo-locks/list` does not work here.

A history signature is valid for the same time as a list signature: at most 86,400 seconds, and `issuedAt` can be at most 300 seconds ahead of the server's time. Use one signature for every page and every repeat of the read until it expires. To change the wallet, the environment, the signing chain, the expiry or `includeMemo`, sign again.

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

The filters narrow the history of the wallet that signed. They cannot read another wallet. An EVM address matches in any letter case. A TRON address can be sent in Base58 or hex and comes back in Base58. A Solana or TON address must be exactly as Unigox returned it.

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

Each transaction has the [transaction status fields](#transaction-status), plus `intentId` (the payment's ID in your history) and `logIndex` (or `null`), both decimal strings. `fromChain` and `toChain` are decimal strings. Amounts are integer strings in the coin's smallest units. `toAmount` is the amount that was expected; `actualToAmount` is the amount actually credited, once it is known. A payment appears once, also when your wallet both sent and received it. Two payments in one transaction have two `intentId`s.

With `includeMemo: false`, the answer has no `memo`, `memoHash`, `memoSource` or `memoLockId`, and the execution details have no memo fields either. With `includeMemo: true`, a reference is returned only to the wallet that reserved it: the payer cannot read it. It is the reference the payment was made under, also when the address has a newer reference now.

The list has pending and failed records too, not only completed ones. A record in the list is not proof of payment: check it as [Transaction status](#transaction-status) says. The answers are sent with `Cache-Control: no-store`.


### Payment views

The payment filters read only the payments into your wallet, as the portal's **Payments** does. A request with any of these fields returns incoming payments only, and `direction: "outgoing"` gets an error.

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

You can read the history of a reservation after it has expired or ended. You need no transaction hash.

Filter by `memoLockId` to read one order's payments, or by `chainType` and `depositAddress` to read one payment address. The pages come newest first, by descending `intentId`: pass `nextBefore` as `before` until it is null. Count each record once, by `(environment, intentId)`; the environment is the one of the API address you called.

The pages list records, not status changes: a record that is pending today can be credited later, under the same ID. So a job that checks an order starts each time without `before` and looks at its pending records again. An empty result means nothing is recorded yet.


## Transaction status

```http
GET /transaction/{fromChain}/{fromTx}?quoteId={quoteId}
```

The answer is `{status: "found", code: 200, data: {...}}`. `data` has:

- source: `quoteId`, `fromChain`, `fromToken`, `fromAmount`, `fromTx`, `fromTxMinedAt`, `userAddress`;
- destination: `toChain`, `toToken`, `toAmount`, `actualToAmount`, `recipientAddress`, `toTx`, `toTxSetAt`, `toTxMinedAt`, and `receiving` (`txHash`, `chainId`, `tokenAddress`, `tokenAmount`);
- state: `status`, `subStatus`, `expectedCompletionSecondsLeft`, `refund`, `refundTx`, `refundTxSetAt`, `refundTxMinedAt`;
- reference: `memo` (always `null` for a payment to a reserved address: read your history with `includeMemo: true`), `memoSource`, `memoLockId`, `memoHash`, `depositAddress`;
- `execution`, only on a transfer that also runs a contract call at its destination.

| `status` | `subStatus` values | Meaning |
| --- | --- | --- |
| `CREATED`, `PENDING`, `PROCESSING`, `DEFERRED` | `WAIT_SOURCE_CONFIRMATIONS`, `WAIT_DESTINATION_TRANSACTION`, `BRIDGE_NOT_AVAILABLE`, `CHAIN_NOT_AVAILABLE`, `REFUND_IN_PROGRESS`, `UNKNOWN_ERROR`, or empty | In progress; can still become a credit |
| `COMPLIANCE_HOLD`, `COMPLIANCE_FROZEN` | any: ignore it | Held for review; can still become a credit after a decision |
| `DONE` | `COMPLETED` | Settled. A credit only when `refund` is not set |
| `DONE` | `PARTIAL` | Settled in part, possibly in another token; not a full credit |
| `DONE` | `REFUNDED` | Sent back by Unigox support to an address the payer confirmed; not a credit |
| `FAILED` | `NOT_PROCESSABLE_REFUND_NEEDED`, `OUT_OF_GAS`, `SLIPPAGE_EXCEEDED`, `INSUFFICIENT_ALLOWANCE`, `INSUFFICIENT_BALANCE`, `UNKNOWN_ERROR`, `EXPIRED`, `REFUND_FAILED`, `REFUND_INSUFFICIENT_BALANCE`, `REFUND_CHAIN_NOT_AVAILABLE` | Not completed; not a credit |

Only `DONE` with `COMPLETED` and no `refund` confirms a payment. Treat any value not listed here as not yet a credit.

`depositAddress` follows the [payment address formats](#payment-address-formats). It is `null` when no payment address is recorded. `fromTx` and `fromToken` come back exactly as the network gave them.

Count a payment only when all of this is true:

- it is under this order's address ID and reference;
- it is `DONE` with `COMPLETED`, and has no `refund`;
- it was credited to your wallet on `660279`, in a supported coin;
- its amount covers the order.

Count `actualToAmount`: the exact amount credited, in the credited coin's smallest units. It is set only on a `DONE` / `COMPLETED` payment that was not refunded. Keep amounts as strings or `BigInt`: a JavaScript `Number` can lose precision.

`quoteId` (from the checkout's events or from your history) picks one payment of the transaction. `?logIndex=` picks one by its position in the transaction. With neither, you get only the first payment of the transaction.

Send `logIndex` as the exact decimal string that the checkout or your history gave you, also for TON. It can be from `"0"` to `"9223372036854775807"`. A value with a leading zero (other than `"0"`), a sign, a fraction or an exponent, or a larger value, gets HTTP 400. Keep it as a string: a large value turned into a JavaScript number can become a different number.

```http
GET /transaction/{fromChain}/{fromTx}?logIndex=100000000000001
```

A 404 means that nothing is recorded for the transaction yet: ask again a little later. This request needs the transaction hash. When you do not have it, read the payment from your [wallet transaction history](#wallet-transaction-history), by its reservation or its payment address.


## Link check

> **Not available yet.** This endpoint is part of the crypto processing release. Until this notice is gone it can answer 404.

`GET {link check}/crypto-checkout/memo-locks/{lockId}?wallet={wallet}&memoHash={memoHash}`

The payment page reads it before it shows an address; a payment page of your own should too. No signature. **Developers → Environment → Technical details → Link check** shows an address that ends in `/crypto-checkout/memo-locks/{addressId}`: `{link check}` is the part before that ending.

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

Check your signing code against these before you send anything. They are signed with the public development key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (wallet `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`), which anyone can use: never send money to that wallet or sign real requests with it. Sign each `message` with its `domain` and `primaryType`. The types are under [Signing types](#signing-types) and [Wallet transaction history](#wallet-transaction-history). Your EIP-712 digest must equal `hash`, and an ordinary ECDSA signature over it must equal `signature`: both are deterministic. Integers are the decimal strings shown; sign them as `uint64` or `uint256` values.

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

`code` is the HTTP status. `status` says how the request ended, and `details` has the error key: they are two
separate fields. In the first table, the routes are under `/memo-locks/`.

| Route | HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- | --- |
| All `/memo-locks/` routes | 400 | `bad_request` | `validation_memo_lock_request_invalid` / `validation_environment_mismatch` | The signed request is malformed, or it was signed for the other environment |
| `allocate`, `lock`, `unlock` | 400 | `bad_request` | `validation_deadline_invalid` | The deadline is further ahead than `maxWriteDeadlineSeconds` allows |
| `allocate`, `lock` | 400 | `bad_request` | `validation_memo_required` / `validation_expires_at_invalid` | The reference is missing, or `expiresAt` is not valid |
| `allocate`, `lock` | 400 | `bad_request` | `validation_callback_url_invalid` | Payment notifications are off in this environment (`memoLimits.maxCallbackUrlBytes` is 0): sign `callbackUrl: ""`. Or the URL is not HTTPS on port 443, has a user name, a password or a fragment, or is too long |
| `allocate`, `lock` | 400 | `bad_request` | `validation_callback_url_not_public` | The notification URL's host has an address that is not public |
| `allocate`, `lock` | 400 | `bad_request` | `validation_memo_too_long` / `validation_memo_not_string` / `validation_text_not_well_formed` | The reference is longer than `memoLimits.maxMemoBytes` UTF-8 bytes, is not a string, or has NUL or malformed Unicode |
| `allocate`, `lock`, `unlock` | 400 | `bad_request` | `memo_not_supported_for_chain` | This address type cannot be reserved: it is not supported, or it is off for now |
| `list` | 400 | `bad_request` | `validation_read_authorization_invalid` / `validation_invalid_list_query` | `issuedAt` or `expiresAt` is outside what is allowed, or a filter is not valid |
| All `/memo-locks/` routes | 401 | `memo_lock_failed` | `memo_lock_signature_invalid` | The signature does not match the request: another wallet, type, domain or field |
| `allocate`, `lock`, `unlock` | 401 | `memo_lock_failed` | `memo_lock_signature_expired` | The deadline has passed. For `allocate`, see [Recover a lost answer to a new-address request](#recover-a-lost-answer-to-a-new-address-request) |
| `list` | 401 | `memo_lock_failed` | `memo_lock_read_authorization_expired` | The read signature has expired: sign a new one |
| `allocate`, `lock`, `unlock` | 404 | `memo_lock_failed` | `deposit_address_not_found` / `memo_lock_not_found` | Your wallet has no such address, or no such reservation |
| `allocate`, `lock`, `unlock` | 409 | `memo_lock_failed` | `memo_lock_nonce_used` | The nonce was used: by this request with other fields, or by an older request |
| `allocate`, `lock`, `unlock` | 409 | `memo_lock_failed` | `deposit_address_already_locked` / `memo_lock_not_active` | The address already has an active reservation, or the reservation you want to end is not active |
| All `/memo-locks/` routes | 422 | `memo_lock_failed` | `invalid_chain_type` | `chainType`, in the message or in the list filter, is not one of the four address types |
| All `/memo-locks/` routes | 429 | `memo_lock_failed` | `rate_limited` | Too many requests: wait and send again |
| `allocate` | 429 | `cap_exceeded` | `deposit_addresses_cap_exceeded` | You reached the address limit; `data.remaining` says how many addresses are left |
| `allocate` | 503 | `addresses_not_watched` | `deposit_address_not_watched` | The address's networks are not ready yet; the saved address is in `data.allocated` |
| `lock` | 503 | `addresses_not_watched` | `deposit_address_not_watched` | The address's networks are not ready yet; no `data` field |
| All `/memo-locks/` routes | 503 | `memo_lock_failed` | `signature_verification_unavailable` | Unigox cannot check signatures right now: send the same request again later |
| All `/memo-locks/` routes | 413 | `bad_request` | none | The request body is larger than 32 KiB |
| All `/memo-locks/` routes | 500 | `memo_lock_failed` | `internal_error` | An error on Unigox's side. On `allocate`, see [Recover a lost answer to a new-address request](#recover-a-lost-answer-to-a-new-address-request) |

For `POST /transactions/history`:

| HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- |
| 400 | `history_failed` | `validation_history_request_invalid` / `validation_environment_mismatch` / `validation_read_authorization_invalid` | The request or a filter is not valid, it was signed for the other environment, or `issuedAt` or `expiresAt` is outside what is allowed |
| 401 | `history_failed` | `history_signature_invalid` / `history_authorization_expired` | The signature does not match the request, or it has expired |
| 429 | `history_failed` | `rate_limited` | Too many requests: wait and send again |
| 503 | `history_failed` | `signature_verification_unavailable` | Unigox cannot check signatures right now: send the same request again later |
| 413 | `bad_request` | none | The request body is larger than 32 KiB |
| 500 | `history_failed` | `internal_error` | An error on Unigox's side: send the request again later |

A history request from an IP address that sends too many requests can also get HTTP 429 with
`status: "memo_lock_failed"` and `details: "rate_limited"`.

For `GET /transaction/{fromChain}/{fromTx}`:

| HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- |
| 400 | `bad_request` | `validation_invalid_quote_id` | `quoteId` is not `0x` followed by 64 hexadecimal digits |
| 400 | `bad_request` | `validation_invalid_log_index` | `logIndex` is not a decimal string from `"0"` to `"9223372036854775807"` without sign, fraction or leading zero |
| 404 | `not_found` | `from_tx_not_found` | Nothing recorded for it yet, or the chain or hash is wrong. Ask again later or use history |
| 500 | `not_fetched` | `internal_error` | The record could not be read and `data` is an empty array. This says nothing about the payment: ask again later |

For `GET /config`, HTTP 500 with `status: "not_fetched"` and no `data`, `webhookKeys` or `memoLimits` means the configuration could not be read. Keep the keys and limits you already have and read again later.

These tables list the common errors. A validation error can name another field that is not valid. To change a signed field, sign the request again.

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

The address is saved, but its reference is not reserved yet. Send the same signed request again: it finishes the reservation on this address ([Recover a lost answer to a new-address request](#recover-a-lost-answer-to-a-new-address-request)).

`POST /memo-locks/lock`, HTTP 503:

```json
{
  "status": "addresses_not_watched",
  "code": 503,
  "details": "deposit_address_not_watched"
}
```

`POST /transactions/history` also answers 403 `history_memo_access_required` when a payment view, source or amount check is asked without `includeMemo: true`.
