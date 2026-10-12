# Bridge payment addresses and credited webhooks

API reference for [crypto payments on EVM, TON, Solana and Tron](../crypto-payments.md). Endpoint paths are relative to `BRIDGE_BASE_URL`.

## Authentication

The owner signs EIP-712 typed data using an EVM wallet. The `wallet` field identifies the merchant receiving settlement, not the customer paying an invoice. No Partner API key or account JWT is required on these routes.

Domain:

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
if (result.status !== "memo_locked" || allocation?.lock?.status !== "ACTIVE") {
  throw new Error("address_not_ready");
}
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

### Allocation recovery

An error response can include `data.allocated` even when allocation has not completed. A 503 `addresses_not_watched` indicates incomplete monitoring registration. Payment readiness requires a `memo_locked` response containing an `ACTIVE` lock.

| Allocation state | Recovery operation |
| --- | --- |
| Address returned without an active lock | `POST /memo-locks/lock` for the returned address with a new nonce after monitoring registration becomes available |
| Response unavailable | `POST /memo-locks/list` to identify a completed lock |
| No allocation identifiable from the response or lock list | Allocation remains unresolved; reconciliation with Unigox is required before another allocation for that invoice |

Reusing a consumed nonce returns 409 `memo_lock_nonce_used`; the API does not replay the original response. A new allocation request creates another address rather than repairing an existing allocation.

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

A nonempty response contains the same lock objects as allocation. Optional query fields are strings: `chainType`, `address`, `status` (`ACTIVE`, `UNLOCKED`, `EXPIRED`), `limit` (default 50, maximum 100) and `before` (a lock ID). An omitted `chainType` includes all families. `nextBefore` supplies the next page's `before` value; null indicates the final page. The endpoint returns memo associations, not payment history.

## Lock or unlock an existing address

| Route | Signed primary type | Success data |
| --- | --- | --- |
| `POST /memo-locks/lock` | `Lock` | `{ "lock": { ... } }`, status `memo_locked` |
| `POST /memo-locks/unlock` | `Unlock` | `{ "lock": { ... } }`, status `memo_unlocked` |

Both endpoints accept `{chainId, message, signature}` with the corresponding signing schema. **Lock** contains the allocation fields plus `depositAddress`, with `action: "lock"`. **Unlock** contains `action`, `wallet`, `environment`, `chainType`, `depositAddress`, `lockId`, `nonce` and `deadline`, with `action: "unlock"`.

Only the owner can change an association. Each address supports one active lock. Unlocking does not reject incoming transfers, initiate refunds or cancel earlier credits.

Address reassignment requires a successful `memo_unlocked` response followed by a lock request containing the new invoice reference and callback URL. Each request requires a fresh nonce. Reassignment is complete when the API returns `memo_locked` with an `ACTIVE` lock and a new `lockId`. An expired association can be replaced directly with a lock request.

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
    "logIndex": 3,
    "fromToken": "<source token contract>",
    "fromAmount": "1500000",
    "status": "DONE",
    "memo": "invoice_c974bae6",
    "memoHash": "<keccak256 of exact memo UTF-8 bytes>",
    "callbackUrlHash": "<keccak256 of exact callback URL UTF-8 bytes>"
  }
}
```

`fromAmount` contains source-token base units. `wallet` identifies the collection-address owner. `fromTx` and `logIndex` are nullable. Destination token, amount and transaction hash are available through transaction status.

### Authentication and acknowledgement

1. Preserve the raw HTTP body bytes for signature verification. JSON reserialization changes the signed input.
2. Read `X-Unigox-Timestamp` (Unix seconds), `X-Unigox-Key-Id` and `X-Unigox-Signature` (base64).
3. Resolve the key ID through `GET /config` on the configured bridge endpoint. Keys contain `algorithm: "ed25519"`, a base64-encoded 32-byte `publicKey`, and `status: "active"` or `"retiring"`. Unknown IDs require a key refresh from that endpoint. Keys supplied in callback payloads are not trusted.
4. Verify Ed25519 over `UTF8(timestamp + ".") || rawBody`. Signature validation requires a valid signature and a timestamp within the five-minute replay window. Future timestamps are limited by the receiver's permitted clock skew.
5. Validate `type: "deposit.credited"`, `apiVersion: "1"` and `data.status: "DONE"`.
6. Validate `callbackUrlHash` against keccak256 of the exact registered URL. The `wallet`, `memoLockId`, address family and deposit address must match the invoice association. Signature validation alone does not establish the intended recipient.
7. Store the authenticated event under a unique `(environment, type, id)` before returning 2xx. Valid duplicate deliveries also receive 2xx.
8. Apply each `intentId` once. Payment deduplication and the invoice update must be atomic; multiple transfers within one transaction remain separate payments.

Retries retain the event ID and use fresh delivery timestamps and signatures. Non-2xx responses, redirects and transport errors trigger retries within the configured retry schedule and attempt limit. A 2xx response acknowledges durable receipt; invoice processing may complete asynchronously.

Webhook memo text is delivered only to the callback URL signed for that lock. Authorized allocation, lock and list responses also contain it. Public transaction status returns `memo: null`, `memoSource: "deposit_address"`, `memoHash` and `memoLockId`. `memoHash` is a public, deterministic hash; it does not provide confidentiality for predictable memo values.

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

A 404 indicates that no matching indexed record is available; the deposit may still be awaiting indexing. A source transaction hash is required for this lookup. Events without one remain unresolved until their source transaction is identified.

## Common errors

| HTTP | Detail/status | Meaning |
| --- | --- | --- |
| 400 | Invalid fields, environment, memo or deadline | Request validation failed; corrected signed fields require a new signature |
| 401 | `memo_lock_signature_invalid` / `memo_lock_signature_expired` | Signature verification failed or the authorization expired |
| 404 | `deposit_address_not_found` / `memo_lock_not_found` | Address or memo association was not found for the owner |
| 409 | `memo_lock_nonce_used` | Nonce already consumed; the original response is not replayed |
| 409 | `deposit_address_already_locked` / `memo_lock_not_active` | The current association state prevents the operation |
| 429 | `rate_limited` / `deposit_addresses_cap_exceeded` | Request rate or address allocation limit exceeded |
| 503 | `addresses_not_watched` with allocated address data | Address allocated but monitoring registration incomplete; allocation recovery applies |
| 503 | `signature_verification_unavailable` | Signature verification temporarily unavailable; an uncertain earlier write still requires reconciliation |

An error response does not guarantee that no address was allocated. Recovery states are defined under [Allocation recovery](#allocation-recovery).
