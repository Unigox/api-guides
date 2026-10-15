# Bridge payment addresses and credited webhooks

API reference for [crypto payments on EVM, TON, Solana and Tron](../crypto-payments.md). Endpoint paths are relative to `BRIDGE_BASE_URL`.

## Authentication

The owner signs EIP-712 typed data using an EVM wallet. For memo-address operations, `wallet` identifies the merchant receiving settlement, not the customer paying an invoice. Wallet history returns the signing wallet’s own incoming and outgoing records. No Partner API key or account JWT is required on these routes.

Memo-address domain:

```json
{"name":"Unigox Bridge Memo Locks","version":"1","chainId":42161}
```

There is no `verifyingContract`. `chainId` in the body must equal the signed domain chain ID. It identifies the signing/verification network, not the customer's deposit network. `chainType` selects the deposit-address family.

EOAs sign directly. Deployed contract wallets require ERC-1271 support enabled for their verification chain. Undeployed contract-wallet signatures are not supported by this memo API. Solana owner signatures are not supported, even for `chainType: "svm"`.

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
| `wallet` | Owning EVM wallet address |
| `environment` | Server's `production` or `staging` environment; signatures cannot cross environments |
| `chainType` | `evm`, `svm`, `tvm` or `ton` |
| `memo` | Exact reference, 1–256 UTF-8 bytes; no NUL or malformed Unicode |
| `expiresAt` for writes | Unix seconds when the memo association ends; `"0"` means no expiry |
| `callbackUrl` | Exact public HTTPS receiver URL, or `""` for no callback |
| `nonce` | Fresh random 32 bytes, encoded as `0x` plus 64 hex digits; single use per wallet |
| `deadline` | Submission deadline in Unix seconds: later than the server's current time, at most 600 seconds ahead |
| `issuedAt`, `expiresAt` for lists | Read authorization window, at most 86,400 seconds; `issuedAt` may be at most 300 seconds ahead of the server |

Integer fields inside `message` or `authorization` accept decimal strings or safe JSON integers. Top-level `chainId` requires a JSON number. Additional message fields are rejected.

Write deadlines are evaluated against server time and must be within `(now, now + 600 seconds]`. They limit request submission, not the lifetime of the deposit address or invoice. List authorizations remain reusable until expiry and cannot be revoked early.

## Allocate a collection address

```http
POST /memo-locks/allocate
Content-Type: application/json
```

The example assumes a connected `walletClient`, merchant `account`, `invoiceReference`, and a valid `deadline` in Unix seconds. The callback URL is a placeholder; requests require a reachable public HTTPS receiver.

```js
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
  callbackUrl: "https://merchant.example/webhooks/unigox",
  nonce: "0x" + Array.from(random, b => b.toString(16).padStart(2, "0")).join(""),
  deadline,
};
const signature = await walletClient.signTypedData({
  account, domain, types, primaryType: "AllocateAndLock", message,
});
const response = await fetch(`${BRIDGE_BASE_URL}/memo-locks/allocate`, {
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
        "memo": "invoice_c974bae6",
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

Each successful request allocates one address, subject to allocation limits. An active lock applies across supported tokens and networks of its address family and can receive multiple payments.

### Network readiness

EVM and Tron registration runs in the background. An allocated address and its signed memo are saved before the
response. HTTP 202 `addresses_preparing` includes the same allocation and `ACTIVE` lock as a completed response,
with current monitoring facts:

```json
{"watched":false,"chains":[{"chainId":1,"confirmed":true},{"chainId":42161,"confirmed":false}]}
```

This address accepts payments on Ethereum while Arbitrum is preparing. Only networks with `confirmed: true` are
ready; a missing network or empty EVM/Tron `chains` array is not confirmation. `watched: true` means all required
networks are ready. The supported assets on each ready network come from `GET /config`.

`POST /memo-locks/list` returns fresh `monitoring` on each active lock. The existing read authorization can be reused
until it expires. Checking readiness does not create another address or change the memo. A 202 response requires no
new write or signature. TON and Solana use `monitoring.watched` for their single-network readiness.

### Allocation recovery

Allocation retries use the original signed request body: the same `chainId`, `message` and `signature`.
The wallet and nonce identify one allocation; all signed fields must match. A new nonce creates a new allocation.

| Allocation state | Response or recovery operation |
| --- | --- |
| Response unavailable | Repeat `POST /memo-locks/allocate` with the original signed body |
| Address and memo saved; EVM/Tron registration pending | 202 `addresses_preparing`; use signed `/memo-locks/list` for readiness |
| Address committed; memo attachment incomplete | The same request resumes the original address while its signature is valid; errors include `data.allocated` |
| Allocation completed | The same request returns the original address and lock ID, with the lock's current status |
| Signature expired; address committed but no lock | The retry returns the original address with `memo_lock_signature_expired`; a fresh signed `POST /memo-locks/lock` activates that address |
| Original lock unlocked or expired | The retry returns that closed lock; it does not create or reactivate a memo association |
| Legacy consumed nonce without a saved allocation receipt | 409 `memo_lock_nonce_used`; the earlier allocation requires reconciliation |

Payment readiness requires an `ACTIVE` lock and confirmation for the selected network. A completed allocation remains
retrievable with its exact original signature after the write deadline; that signature cannot authorize further writes.
Solana retains its synchronous registration response: 503 `addresses_not_watched` means attachment has not completed.

A different memo, family, callback or other signed field with an already recorded nonce returns 409
`memo_lock_nonce_used`. An expired request with no identifiable allocation remains unresolved; expiry alone is not
proof that an earlier request created no address.

## List memo associations

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

A nonempty response contains the same lock objects as allocation, with `monitoring` added to each `ACTIVE` lock. Closed locks do not carry readiness. Optional query fields are strings: `chainType`, `address`, `status` (`ACTIVE`, `UNLOCKED`, `EXPIRED`), `limit` (default 50, maximum 100) and `before` (a lock ID). An omitted `chainType` includes all families. `nextBefore` supplies the next page's `before` value; null indicates the final page. The endpoint returns memo associations, not payment history.

## Wallet transaction history

```http
POST /transactions/history
Content-Type: application/json
```

Returns the signing wallet's incoming and outgoing Bridge records. No UNIGOX account, account JWT or Partner API key is required. History is available with or without a memo; memo fields are omitted by default.

History uses a separate EIP-712 domain and primary type:

```json
{"name":"Unigox Bridge History","version":"1","chainId":42161}
```

```text
History(string action,address wallet,string environment,uint64 issuedAt,uint64 expiresAt,bool includeMemo)
```

`action` is `"history"`. `includeMemo` is part of the signature: `false` authorizes ordinary history; `true` also requests memo fields. An omitted request field is interpreted as `false` and must have been signed as `false`. A memo-list signature does not authorize history.

The read window uses the same limits as listing associations: at most 86,400 seconds, with up to 300 seconds of clock skew for `issuedAt`. The authorization can be reused for pages and refreshed results until expiry. Changing the wallet, environment, signing chain, expiry or memo permission requires a new signature.

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
const response = await fetch(`${BRIDGE_BASE_URL}/transactions/history`, {
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
| `before` | Decimal string | Exclusive intent ID cursor from `nextBefore` |
| `direction` | String | `incoming` or `outgoing`; omitted includes both |
| `memoLockId` | Decimal string | Original invoice association |
| `chainType` | String | Source address family: `evm`, `svm`, `tvm` or `ton` |
| `depositAddress` | String | Collection address; requires `chainType` |

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

Each transaction contains the [transaction-status fields](#transaction-status), plus `intentId` and nullable `logIndex` as decimal strings. `fromChain` and `toChain` are decimal strings; amounts are integer strings in token base units. An intent appears once, including when the wallet is both sender and recipient. Separate deposits in the same source transaction retain separate intent IDs.

With `includeMemo: false`, `memo`, `memoHash`, `memoSource` and `memoLockId` are omitted; execution details also omit their memo fields. With `includeMemo: true`, a collection-address memo is returned only to the wallet that owned its original association. The payer cannot read the merchant's private memo. Returned memo text is the payment's saved reference, unaffected by later address reassignment.

Results include pending and failed records as well as completed ones. The presence of a record does not confirm payment; settlement checks below still apply. Responses use `Cache-Control: no-store`.

### Missed payment notifications

Payment history remains available after webhook retries are exhausted, without a callback URL, and after the original memo association expires or is unlocked. A source transaction hash is not required.

Use `memoLockId` for an invoice or `chainType` and `depositAddress` for a collection address. Pages are ordered by descending `intentId`; pass `nextBefore` as `before` until it is null. Match records by `intentId`, including records already received by webhook.

The cursor paginates records; it is not a stream of status changes. An older pending record can settle later without receiving a new ID. A reconciliation pass starts again without `before` for the invoice or address and reevaluates pending records. An empty result means no matching indexed record is available yet.

## Lock or unlock an existing address

| Route | Signed primary type | Success data |
| --- | --- | --- |
| `POST /memo-locks/lock` | `Lock` | `{ "lock": { ... }, "monitoring": { ... } }`, status `memo_locked` or `addresses_preparing` |
| `POST /memo-locks/unlock` | `Unlock` | `{ "lock": { ... } }`, status `memo_unlocked` |

Both endpoints accept `{chainId, message, signature}` with the corresponding signing schema. **Lock** contains the allocation fields plus `depositAddress`, with `action: "lock"`. **Unlock** contains `action`, `wallet`, `environment`, `chainType`, `depositAddress`, `lockId`, `nonce` and `deadline`, with `action: "unlock"`.

Only the owner can change an association. Each address supports one active lock. Unlocking does not reject incoming transfers, initiate refunds or cancel earlier credits.

Address reassignment requires a successful `memo_unlocked` response followed by a lock request containing the new invoice reference and callback URL. Each request requires a fresh nonce. Reassignment saves an `ACTIVE` lock with a new `lockId`; payments on a selected network require its monitoring confirmation. An expired association can be replaced directly with a lock request.

Deposit attribution uses the on-chain timestamp. Deposits between locks have no memo; deposits within a lock's window carry that lock's reference. Delayed events retain the lock ID associated with the deposit.

## Credited-payment webhook

Events are delivered to the `callbackUrl` signed during allocation or locking. No separate webhook registration is required. The URL must use HTTPS on port 443, resolve to public IP addresses, and contain no credentials or fragment. `GET /config` supplies `memoLimits.maxCallbackUrlBytes`; zero means callbacks are unavailable. Verification keys are returned in the top-level `webhookKeys` field.

Event example:

```json
{
  "id": "5",
  "type": "deposit.credited",
  "apiVersion": "1",
  "createdAt": "2026-10-12T04:02:00Z",
  "data": {
    "memoLockId": "12",
    "wallet": "0x1111111111111111111111111111111111111111",
    "chainType": "evm",
    "depositAddress": "0x2222222222222222222222222222222222222222",
    "intentId": "77",
    "quoteId": "<quote ID>",
    "fromChain": "42161",
    "fromTx": "<source transaction hash>",
    "logIndex": "3",
    "fromToken": "<source token contract>",
    "fromAmount": "1500000",
    "status": "DONE",
    "memo": "invoice_c974bae6",
    "memoHash": "<keccak256 of exact memo UTF-8 bytes>",
    "callbackUrlHash": "<keccak256 of exact callback URL UTF-8 bytes>"
  }
}
```

`fromAmount` contains source-token base units. `wallet` identifies the collection-address owner. `logIndex` is a decimal string identifying the source event; on TON it contains the transfer's logical time. `fromTx` and `logIndex` are nullable. Destination token, amount and transaction hash are available through transaction status.

### Authentication and acknowledgement

1. Preserve the raw HTTP body bytes for signature verification. JSON reserialization changes the signed input.
2. Read `X-Unigox-Timestamp` (Unix seconds), `X-Unigox-Key-Id` and `X-Unigox-Signature` (base64).
3. Resolve the key ID through `GET /config` on the configured bridge endpoint. Keys contain `algorithm: "ed25519"`, a base64-encoded 32-byte `publicKey`, and `status: "active"` or `"retiring"`. Unknown IDs require a key refresh from that endpoint. Keys supplied in callback payloads are not trusted.
4. Verify Ed25519 over `UTF8(timestamp + ".") || rawBody`. Signature validation requires a valid signature and a timestamp within the five-minute replay window. Future timestamps are limited by the receiver's permitted clock skew.
5. Validate `type: "deposit.credited"`, `apiVersion: "1"` and `data.status: "DONE"`.
6. Validate `callbackUrlHash` against keccak256 of the exact registered URL. The `wallet`, `memoLockId`, address family and deposit address must match the invoice association. Compare valid EVM wallet and deposit addresses by their 20-byte value; hexadecimal letter case may differ ([ERC-55](https://eips.ethereum.org/EIPS/eip-55)). Preserve the case of non-EVM deposit addresses. Signature validation alone does not establish the intended recipient.
7. Store the authenticated event under a unique `(environment, type, id)` before returning 2xx. Valid duplicate deliveries also receive 2xx.
8. Apply each `intentId` once. Payment deduplication and the invoice update must be atomic; multiple transfers within one transaction remain separate payments.

Retries retain the event ID and use fresh delivery timestamps and signatures. Non-2xx responses, redirects and transport errors trigger retries within the configured retry schedule and attempt limit. A 2xx response acknowledges durable receipt; invoice processing may complete asynchronously.

Webhook memo text is delivered only to the callback URL signed for that lock. Authorized allocation, lock and list responses also contain it, as does wallet history with signed memo permission for the original owner. Public transaction status returns `memo: null`, `memoSource: "deposit_address"`, `memoHash` and `memoLockId`. `memoHash` is a public, deterministic hash; it does not provide confidentiality for predictable memo values.

## Transaction status

```http
GET /transaction/{fromChain}/{fromTx}?quoteId={quoteId}
```

The response uses `{status: "found", code: 200, data: {...}}`. `data` includes:

- `quoteId`, `fromChain`, `fromToken`, `fromAmount`, `fromTx`;
- `toChain`, `toToken`, `toAmount`, `recipientAddress`, `toTx`, `toTxMinedAt`;
- `status`, `subStatus`, `refund`, `refundTx`;
- `memoSource`, `memoLockId`, `memoHash`, `depositAddress`.

Payment confirmation requires a matching source identity and lock, a completed non-refunded settlement, the expected destination wallet, chain and token, and the amount required by the invoice. Refund status and destination details are supplied by this endpoint rather than the webhook.

The event's `quoteId` selects the corresponding payment. `?logIndex={logIndex}` is an alternative selector for deposits with a known source log index. Without either selector, the endpoint returns only the lowest intent ID for the transaction.

`logIndex` uses the exact decimal string from the webhook or wallet history, including for TON. Its range is `"0"` through `"9223372036854775807"`. Leading zeroes (except `"0"`), signs, fractions, exponents and larger values return HTTP 400. Preserve it as a string; converting large values to a JavaScript number can change the identifier.

```http
GET /transaction/{fromChain}/{fromTx}?logIndex=100000000000001
```

A 404 indicates that no matching indexed record is available; the deposit may still be awaiting indexing. A source transaction hash is required for this lookup. When the source hash is unavailable, [wallet transaction history](#wallet-transaction-history) can retrieve the saved record by memo association or collection address.

## Common errors

| HTTP | Detail/status | Meaning |
| --- | --- | --- |
| 400 | Invalid fields, environment, memo or deadline | Request validation failed; corrected signed fields require a new signature |
| 401 | `memo_lock_signature_invalid` / `memo_lock_signature_expired` / `history_signature_invalid` / `history_authorization_expired` | Signature verification failed or the authorization expired |
| 404 | `deposit_address_not_found` / `memo_lock_not_found` | Address or memo association was not found for the owner |
| 409 | `memo_lock_nonce_used` | Lock/unlock nonce already consumed, allocation terms conflict, or a legacy allocation has no saved receipt |
| 409 | `deposit_address_already_locked` / `memo_lock_not_active` | The current association state prevents the operation |
| 429 | `rate_limited` / `deposit_addresses_cap_exceeded` | Request rate or address allocation limit exceeded |
| 503 | `addresses_not_watched` with allocated address data | Solana address allocated but monitoring confirmation incomplete; allocation recovery applies |
| 503 | `signature_verification_unavailable` | Signature verification temporarily unavailable; an uncertain earlier write still requires reconciliation |

On allocation routes, an error response does not guarantee that no address was allocated. Recovery states are defined under [Allocation recovery](#allocation-recovery).
