# API reference: payment addresses

Use the Unigox payments API to allocate receiving addresses, associate them with orders or customers, and read payment records. For a step-by-step integration, start with [Build your own payment page](../crypto-payments.md). Funds are credited to your Unigox wallet; your application decides when to fulfil an order or update a customer's balance.

All endpoint paths are relative to `UNIGOX_PAYMENTS_API`, shown on the portal's **Developers** page. Production payment notifications (`deposit.credited` webhooks) are not available yet. The webhook sections document the contract for environments where Unigox enables them; use payment-status reads and wallet history in production.

## Authentication

The owner signs EIP-712 typed data using an EVM wallet. For memo-address operations, `wallet` identifies the merchant receiving settlement, not the customer paying an invoice. Wallet history returns the signing wallet’s own incoming and outgoing records. No Partner API key or account JWT is required on these routes.

Memo-address domain:

```json
{"name":"Unigox Bridge Memo Locks","version":"1","chainId":42161}
```

The domain's name is a fixed label of the signature format: type it exactly; it is not a product you use. In the endpoint paths, `memo-locks` means reservations of your payment addresses: a reservation (`lock`) attaches your memo to an address, releasing it (`unlock`) ends that reservation, and its number is the address ID (`lockId`).

There is no `verifyingContract`. `chainId` in the body must equal the signed domain chain ID. It identifies the signing/verification network, not the customer's deposit network. `chainType` selects the address type.

An ordinary wallet controlled by a private key (an externally owned account, or EOA) signs directly. A deployed smart-contract wallet needs ERC-1271 signature verification enabled on its verification chain. This API does not accept signatures from undeployed contract wallets or Solana owners, even when requesting Solana deposit addresses with `chainType: "svm"`.

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
| `expiresAt` for writes | Unix seconds when the reservation ends; `"0"` means no expiry |
| `callbackUrl` | Exact public HTTPS receiver URL, or `""` for no callback |
| `nonce` | Fresh random 32 bytes, encoded as `0x` plus 64 hex digits; single use per wallet |
| `deadline` | Submission deadline in Unix seconds: later than server time, at most `memoLimits.maxWriteDeadlineSeconds` ahead |
| `issuedAt`, `expiresAt` for lists | Read authorization window, at most 86,400 seconds; `issuedAt` may be at most 300 seconds ahead of the server |

Integer fields inside `message` or `authorization` accept decimal strings or safe JSON integers. Top-level `chainId` requires a JSON number. Additional message fields are rejected.

Write deadlines are evaluated at submission and must be within `(server now, server now + maxWriteDeadlineSeconds]`. They limit request submission, not the lifetime of the deposit address or invoice. List authorizations remain reusable until expiry and cannot be revoked early.

Fetch fresh `GET /config` from the same API address before signing. Its top-level `memoLimits` object contains `serverTimeSeconds` and `maxWriteDeadlineSeconds`; it is a sibling of `data`, not a field inside the chain list. Calculate the deadline from these values rather than the wallet or browser clock. The allocation example below uses the full advertised window.

Signing and submission must finish before that deadline. Changing a deadline requires a new signature. For a new-address request already submitted, follow [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) instead of changing the original signed request.

## Get a new payment address (POST /memo-locks/allocate)

```http
POST /memo-locks/allocate
Content-Type: application/json
```

The example assumes a connected `walletClient`, merchant `account`, and `invoiceReference`. It signs a callback URL only when `GET /config` reports callbacks available (`memoLimits.maxCallbackUrlBytes` above 0 and at least one `webhookKeys` entry); otherwise it signs `""` and payments are confirmed through wallet history. The URL shown is a placeholder for your public HTTPS receiver.

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

Each successful request makes one new address, up to your address limit. An active reservation applies across supported tokens and networks of its address type and can receive multiple payments.

### Payment address formats

New payment addresses use the following formats. New-address and reserve responses use `address`; webhooks, transaction status and history use `depositAddress`.

| `chainType` | Payment address format |
| --- | --- |
| `evm` | `0x`-prefixed hexadecimal address; compare by its 20-byte value, not letter case |
| `svm` | Base58 Solana address; case-sensitive |
| `tvm` | Base58Check Tron address, matching the address you got; case-sensitive |
| `ton` | Non-bounceable, URL-safe TON address; preserve the returned string |

Reuse the returned `address` for signed reserve and release requests and for the `address` filter of the reservation list. EVM, Solana and TON address text is preserved in other responses; an existing TON address can also be in raw `workchain:hex` form. When present, Tron `depositAddress` is presented in Base58Check.

Tron formatting applies to the payment address only. `fromTx` and `fromToken` are returned without address-format conversion, including any hexadecimal prefix and letter case. Use these values unchanged; do not convert them to Base58 when matching a payment or requesting transaction status.

### Network readiness

EVM and Tron registration runs in the background. A new address and its signed memo are saved before the
response. HTTP 202 `addresses_preparing` includes the same new address and `ACTIVE` reservation as a completed response,
with current monitoring facts:

```json
{"watched":false,"chains":[{"chainId":1,"confirmed":true},{"chainId":42161,"confirmed":false}]}
```

This address accepts payments on Ethereum while Arbitrum is preparing. Only networks with `confirmed: true` are
ready; a missing network or empty EVM/Tron `chains` array is not confirmation. `watched: true` means all required
networks are ready. Assets on each ready network must also pass the [supported payment asset checks](#supported-payment-assets).

`POST /memo-locks/list` returns fresh `monitoring` on each active reservation. The existing read authorization can be reused
until it expires. Checking readiness does not create another address or change the memo. A 202 response requires no
new write or signature. TON and Solana use `monitoring.watched` for their single-network readiness. Readiness belongs to each address: a pending address in the same response does not make another confirmed address pending. Missing monitoring information does not establish readiness.

### Supported payment assets

`GET /config` returns chain objects in `data`. It includes inactive and native tokens; the full response is not a list of payable checkout options.

An eligible checkout option must meet all of these conditions:

| Check | Required configuration |
| --- | --- |
| Payment network | Source chain `active: true`, a matching address type, and `chainId` other than `UNIGOX_BALANCE_CHAIN_ID` (`660279`, the fixed number that marks a credit to your Unigox wallet) |
| Address readiness | The address's reservation has status `ACTIVE`, and [monitoring is confirmed](#network-readiness) for the selected network |
| Collection token | Source `tokens[]` entry with `active: true`, `native: false` and a nonempty `address`; identify the token by network and contract or mint address, not symbol alone |
| Settlement token | An active, non-native token with a nonempty address on `UNIGOX_BALANCE_CHAIN_ID` (660279), matching the source token as described below |

Configuration uses `chainType` values `EVM`, `SOLANA`, `TVM` (or `TRON`) and `TON`; memo requests use `evm`, `svm`, `tvm` and `ton`, respectively.

Token matching uses `tokens[].groupId`. A source token with a non-null `groupId` matches tokens of that same group on `UNIGOX_BALANCE_CHAIN_ID`. For EVM, Tron and TON source tokens without a group, matching uses the same `symbol`. Solana requires a non-null matching group and has no symbol fallback. Missing groups must not be matched to one another.

Include an option only when there is exactly one eligible source token for its contract or mint and exactly one eligible match on that network. Missing or ambiguous matches are not checkout options. Source and settlement amounts use their respective token `decimals`; transaction status identifies the token and amount actually credited.

Collection accepts configured ERC-20, TRC-20, jetton and SPL token transfers. Native ETH, TRX, TON and SOL transfers are outside this flow. On Solana, token payments must reach the collection wallet's canonical associated token account; an arbitrary token account with the same owner is not sufficient. For Solana Token-2022 transfers with a fee, credit is based on the net amount received.

`quotingThreshold` is quote configuration, not a collection-payment minimum. `/config` does not expose a universal minimum collection amount. Token decimal conversion can round down; supported assets do not imply that every nonzero source amount produces a nonzero credit.

Payments in an unsupported asset or on an unconfirmed or unsupported network are not guaranteed automatic credit or refund. Support can assess recovery; recovery is not guaranteed.

### Recover a lost answer to a new-address request

Retries of a new-address request use the original signed request body: the same `chainId`, `message` and `signature`.
The wallet and nonce identify one new-address request; all signed fields must match. A new nonce makes another new address.

| State of the request | Response or recovery operation |
| --- | --- |
| Response unavailable | Repeat `POST /memo-locks/allocate` with the original signed body |
| Address and memo saved; EVM/Tron registration pending | 202 `addresses_preparing`; use signed `/memo-locks/list` for readiness |
| Address committed; memo attachment incomplete | The same request resumes the original address while its signature is valid; errors include `data.allocated` |
| Request completed | The same request returns the original address and address ID (`lockId`), with the reservation's current status |
| Signature expired; address committed but not reserved | The retry returns the original address with `memo_lock_signature_expired`; a fresh signed `POST /memo-locks/lock` activates that address |
| Original reservation released or expired | The retry returns that closed reservation; it does not create or reactivate a reservation |
| Legacy consumed nonce without a saved receipt | 409 `memo_lock_nonce_used`; the earlier request requires reconciliation |

Payment readiness requires an `ACTIVE` reservation and confirmation for the selected network. A completed request remains
retrievable with its exact original signature after the write deadline; that signature cannot authorize further writes.
Solana retains its synchronous registration response: HTTP 503 with `status: "addresses_not_watched"` and
`details: "deposit_address_not_watched"` means attachment has not completed. On `/memo-locks/allocate`, this response
includes the saved address in `data.allocated`; [monitoring error examples](#monitoring-errors) distinguish it from `/memo-locks/lock`.

A different memo, address type, callback or other signed field with an already recorded nonce returns 409
`memo_lock_nonce_used`. An expired request with no identifiable request remains unresolved; expiry alone is not
proof that an earlier request created no address.

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

## Wallet transaction history

```http
POST /transactions/history
Content-Type: application/json
```

Returns the signing wallet's incoming and outgoing payment records. No Unigox account, account JWT or Partner API key is required. History is available with or without a memo; memo fields are omitted by default.

History uses a separate EIP-712 domain and primary type:

```json
{"name":"Unigox Bridge History","version":"1","chainId":42161}
```

```text
History(string action,address wallet,string environment,uint64 issuedAt,uint64 expiresAt,bool includeMemo)
```

`action` is `"history"`. `includeMemo` is part of the signature: `false` authorizes ordinary history; `true` also requests memo fields. An omitted request field is interpreted as `false` and must have been signed as `false`. A memo-list signature does not authorize history.

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
| `before` | Decimal string | Exclusive intent ID cursor from `nextBefore` |
| `direction` | String | `incoming` or `outgoing`; omitted includes both |
| `memoLockId` | Decimal string | Original invoice association |
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

Each transaction contains the [transaction-status fields](#transaction-status), plus `intentId` and nullable `logIndex` as decimal strings. `fromChain` and `toChain` are decimal strings; amounts are integer strings in token base units. `toAmount` retains the expected output, while `actualToAmount` reports the confirmed recipient amount when available. An intent appears once, including when the wallet is both sender and recipient. Separate deposits in the same source transaction retain separate intent IDs.

With `includeMemo: false`, `memo`, `memoHash`, `memoSource` and `memoLockId` are omitted; execution details also omit their memo fields. With `includeMemo: true`, a collection-address memo is returned only to the wallet that owned its original association. The payer cannot read the merchant's private memo. Returned memo text is the payment's saved reference, unaffected by later address reassignment.

Results include pending and failed records as well as completed ones. The presence of a record does not confirm payment; settlement checks below still apply. Responses use `Cache-Control: no-store`.

### Missed payment notifications

Payment history remains available after webhook retries are exhausted, without a callback URL, and after the original reservation expires or is released. A source transaction hash is not required.

Use `memoLockId` for an invoice or `chainType` and `depositAddress` for a payment address. Pages are ordered by descending `intentId`; pass `nextBefore` as `before` until it is null. Match records by `(environment, intentId)`, including records already received by webhook. For history responses, `environment` comes from the configured API address used for the request.

The cursor paginates records; it is not a stream of status changes. An older pending record can settle later without receiving a new ID. A reconciliation pass starts again without `before` for the invoice or address and reevaluates pending records. An empty result means no matching indexed record is available yet.

## Reserve an address again, or end its reservation

| Route | Signed primary type | Success data |
| --- | --- | --- |
| `POST /memo-locks/lock` | `Lock` | `{ "lock": { ... }, "monitoring": { ... } }`, status `memo_locked` or `addresses_preparing` |
| `POST /memo-locks/unlock` | `Unlock` | `{ "lock": { ... } }`, status `memo_unlocked` |

Both endpoints accept `{chainId, message, signature}` with the corresponding signing schema. **Lock** contains the new-address fields plus `depositAddress`, with `action: "lock"`. **Unlock** contains `action`, `wallet`, `environment`, `chainType`, `depositAddress`, `lockId`, `nonce` and `deadline`, with `action: "unlock"`.

Only the owner can change a reservation. Each address supports one active reservation. Releasing it (`unlock`) does not reject incoming transfers, initiate refunds or cancel earlier credits.

Address reassignment requires a successful `memo_unlocked` response followed by a reserve request (`lock`) containing the new invoice reference and a `callbackUrl`: your receiver when callbacks are available, otherwise `""`. Each request requires a fresh nonce. Reassignment saves an `ACTIVE` reservation with a new address ID (`lockId`); payments on a selected network require its monitoring confirmation. An expired association can be replaced directly with a reserve request.

Deposit attribution uses the on-chain timestamp. Deposits between reservations have no memo; deposits within a reservation carry its reference. Delayed events keep the address ID (`memoLockId`) of the reservation the deposit was paid under.

## Credited-payment webhook

Events are delivered to the `callbackUrl` signed when the address was made or reserved. No separate webhook registration is required. The URL must use HTTPS on port 443, resolve to public IP addresses, and contain no credentials or fragment. `GET /config` supplies `memoLimits.maxCallbackUrlBytes`; zero means callbacks are unavailable. Verification keys are returned in the top-level `webhookKeys` field.

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
    "memo": "NW-20418 · 250.00 USD",
    "memoHash": "<keccak256 of exact memo UTF-8 bytes>",
    "callbackUrlHash": "<keccak256 of exact callback URL UTF-8 bytes>"
  }
}
```

`fromAmount` contains source-token base units. `wallet` identifies the payment address owner. `logIndex` is a decimal string identifying the source event; on TON it contains the transfer's logical time. `fromTx` and `logIndex` are nullable. Destination token, amount and transaction hash are available through transaction status. See [payment address formats](#payment-address-formats) for `depositAddress`.

### Environment and event identity

Webhook bodies do not contain `environment`. Event IDs and intent IDs are unique only within one environment (production or staging) and can repeat between the two.

Use a separate callback URL for each environment, such as `/webhooks/unigox/production` and `/webhooks/unigox/staging`. Each receiver route maps to a fixed environment, API address and verification-key set. The environment used for deduplication comes from that receiver configuration.

A shared callback URL requires distinct verification keys for each environment. In that case, derive the environment from the configured association of the key that successfully verifies the signature. The `X-Unigox-Key-Id` header alone does not establish the environment.

Event deduplication uses `(environment, type, id)`. Payment deduplication uses `(environment, intentId)` across webhook deliveries and history results. Both keys use the configured environment, not a field from the webhook body.

### Authentication and acknowledgement

1. Preserve the raw HTTP body bytes for signature verification. JSON reserialization changes the signed input.
2. Read `X-Unigox-Timestamp` (Unix seconds), `X-Unigox-Key-Id` and `X-Unigox-Signature` (base64).
3. Resolve the key ID through `GET /config` at the configured API address. Keys contain `algorithm: "ed25519"`, a base64-encoded 32-byte `publicKey`, and `status: "active"` or `"retiring"`. Unknown IDs require a key refresh from that endpoint. Keys supplied in callback payloads are not trusted.
4. Verify Ed25519 over `UTF8(timestamp + ".") || rawBody`. Signature validation requires a valid signature and a timestamp within the five-minute replay window. Future timestamps are limited by the receiver's permitted clock skew.
5. Validate `type: "deposit.credited"`, `apiVersion: "1"` and `data.status: "DONE"`.
6. Validate `callbackUrlHash` against keccak256 of the exact registered URL. The `wallet`, `memoLockId`, address type and deposit address must match the invoice's reservation. Compare valid EVM wallet and deposit addresses by their 20-byte value; hexadecimal letter case may differ ([ERC-55](https://eips.ethereum.org/EIPS/eip-55)). Preserve the case of non-EVM deposit addresses. Signature validation alone does not establish the intended recipient.
7. Store the authenticated event under a unique `(environment, type, id)` before returning 2xx. Valid duplicate deliveries also receive 2xx.
8. Apply each `(environment, intentId)` once. Payment deduplication and the invoice update must be atomic; multiple transfers within one transaction remain separate payments.

Retries retain the event ID and use fresh delivery timestamps and signatures. Non-2xx responses, redirects and transport errors trigger retries within the configured retry schedule and attempt limit. A 2xx response acknowledges durable receipt; invoice processing may complete asynchronously.

Webhook memo text is delivered only to the callback URL signed for that reservation. Authorized new-address, reserve and list responses also contain it, as does wallet history with signed memo permission for the original owner. Public transaction status returns `memo: null`, `memoSource: "deposit_address"`, `memoHash` and `memoLockId`. `memoHash` is a public, deterministic hash; it does not provide confidentiality for predictable memo values.

## Quoted amounts and confirmed receipts

`GET /quote` and `POST /quote` return `toAmount` as the expected destination output and `toAmountMin` as the accepted minimum, both in destination-token base units.

An eligible ordinary EVM quote includes `snapshot.payoutCostPolicy: {"version": 1, "minimumOutputAmount": "..."}`. `minimumOutputAmount` equals the public `toAmountMin` exactly. Execution costs may use the accepted slippage allowance while preserving the service fee and any rebalance deductions already included in the quote. The recipient's payout must remain at or above that minimum. The original `toAmount` is retained for comparison with the confirmed receipt.

This policy excludes destinations on `UNIGOX_BALANCE_CHAIN_ID`, sponsored withdrawals, non-EVM payouts and `destinationExecution` quotes. An older quote without the policy grants no execution-cost allowance.

| Field | Surface | Meaning |
| --- | --- | --- |
| `toAmount` | Quote, transaction status and signed history | Original expected output; a completed payout can differ within its accepted terms |
| `toAmountMin` | Quote | Minimum accepted recipient output |
| `actualToAmount` | Transaction status and signed history | Exact confirmed recipient output for a `DONE` / `COMPLETED`, non-refunded payment; otherwise `null` or absent |
| `receiving.tokenAmount` | Transaction status and signed history | Confirmed `actualToAmount` when available; otherwise the original `toAmount` |
| `actual_to_amount` | Wallet payment records | The corresponding confirmed recipient output; unavailable on older records without a saved actual amount |

All these amounts are decimal integer strings in destination-token base units. Keep them as strings or use integer arithmetic such as `BigInt`; JavaScript `Number` can lose precision. Apply the destination token's decimals only for display. Reconciliation uses `actualToAmount` when present, with the original amount as a compatibility fallback on older completed records. Completion, recipient, chain, token and refund checks still apply; an amount field alone does not confirm payment.

A direct quote is refused with HTTP 402, `status: "not_quoted"`, `details: "amount_too_low"` when known execution costs leave insufficient value for the accepted minimum and service fee. Public expected and minimum amounts are not silently reduced to make the quote fit. After funding, an ordinary payout waits when current prices or costs cannot meet the accepted terms. Quote age alone does not refuse that funded payout; use the existing payment identity to follow its status.

## Transaction status

```http
GET /transaction/{fromChain}/{fromTx}?quoteId={quoteId}
```

The response uses `{status: "found", code: 200, data: {...}}`. `data` includes:

- source: `quoteId`, `fromChain`, `fromToken`, `fromAmount`, `fromTx`, `fromTxMinedAt`, `userAddress`;
- destination: `toChain`, `toToken`, `toAmount`, `actualToAmount`, `recipientAddress`, `toTx`, `toTxSetAt`, `toTxMinedAt`, and `receiving` (`txHash`, `chainId`, `tokenAddress`, `tokenAmount`);
- state: `status`, `subStatus`, `expectedCompletionSecondsLeft`, `refund`, `refundTx`, `refundTxSetAt`, `refundTxMinedAt`;
- memo: `memo` (always `null` for a collection-address deposit), `memoSource`, `memoLockId`, `memoHash`, `depositAddress`;
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

Payment confirmation requires a matching source identity and reservation, a completed non-refunded settlement, the expected destination wallet, chain and token, and the amount required by the invoice. Use the [confirmed recipient amount](#quoted-amounts-and-confirmed-receipts) when available. Refund status and destination details are supplied by this endpoint rather than the webhook.

The event's `quoteId` selects the corresponding payment. `?logIndex={logIndex}` is an alternative selector for deposits with a known source log index. Without either selector, the endpoint returns only the lowest intent ID for the transaction.

`logIndex` uses the exact decimal string from the webhook or wallet history, including for TON. Its range is `"0"` through `"9223372036854775807"`. Leading zeroes (except `"0"`), signs, fractions, exponents and larger values return HTTP 400. Preserve it as a string; converting large values to a JavaScript number can change the identifier.

```http
GET /transaction/{fromChain}/{fromTx}?logIndex=100000000000001
```

A 404 indicates that no matching indexed record is available; the deposit may still be awaiting indexing. A source transaction hash is required for this lookup. When the source hash is unavailable, [wallet transaction history](#wallet-transaction-history) can retrieve the saved record by reservation or payment address.

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

## Common errors

`code` matches the HTTP status. `status` identifies the response outcome; `details` contains the error key.
They are separate fields. In the memo table, route names are relative to `/memo-locks/`.

| Route | HTTP | `status` | `details` | Meaning |
| --- | --- | --- | --- | --- |
| All memo routes | 400 | `bad_request` | `validation_memo_lock_request_invalid` / `validation_environment_mismatch` | Malformed signed request or wrong environment |
| `allocate`, `lock`, `unlock` | 400 | `bad_request` | `validation_deadline_invalid` | Submission deadline exceeds the allowed window |
| `allocate`, `lock` | 400 | `bad_request` | `validation_memo_required` / `validation_expires_at_invalid` | Missing memo or invalid memo expiry |
| `allocate`, `lock` | 400 | `bad_request` | `validation_callback_url_invalid` | Callbacks are unavailable in this environment (`memoLimits.maxCallbackUrlBytes` is 0), or the URL is not HTTPS on port 443, carries credentials or a fragment, or is too long. Sign `callbackUrl: ""` when callbacks are unavailable |
| `allocate`, `lock` | 400 | `bad_request` | `validation_callback_url_not_public` | Callback URL does not resolve exclusively to permitted public addresses |
| `allocate`, `lock` | 400 | `bad_request` | `validation_memo_too_long` / `validation_memo_not_string` / `validation_text_not_well_formed` | Memo longer than `memoLimits.maxMemoBytes` UTF-8 bytes, not a string, or containing NUL or malformed Unicode |
| Memo writes | 400 | `bad_request` | `memo_not_supported_for_chain` | Address type is unsupported or unavailable for the requested memo operation |
| `list` | 400 | `bad_request` | `validation_read_authorization_invalid` / `validation_invalid_list_query` | Invalid authorization window or list filter |
| All memo routes | 401 | `memo_lock_failed` | `memo_lock_signature_invalid` | Signature does not authorize the request |
| `allocate`, `lock`, `unlock` | 401 | `memo_lock_failed` | `memo_lock_signature_expired` | Write deadline passed; retries follow [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) |
| `list` | 401 | `memo_lock_failed` | `memo_lock_read_authorization_expired` | Read authorization expired |
| Memo writes | 404 | `memo_lock_failed` | `deposit_address_not_found` / `memo_lock_not_found` | Address or reservation was not found for the owner |
| Memo writes | 409 | `memo_lock_failed` | `memo_lock_nonce_used` | Nonce already consumed, request terms conflict, or a legacy request has no saved receipt |
| Memo writes | 409 | `memo_lock_failed` | `deposit_address_already_locked` / `memo_lock_not_active` | Current reservation state prevents the operation |
| All memo routes | 422 | `memo_lock_failed` | `invalid_chain_type` | Invalid address-type value in the message or list filter |
| All memo routes | 429 | `memo_lock_failed` | `rate_limited` | Request rate limit exceeded |
| `allocate` | 429 | `cap_exceeded` | `deposit_addresses_cap_exceeded` | Address limit reached; `data.remaining` reports remaining capacity |
| `allocate` | 503 | `addresses_not_watched` | `deposit_address_not_watched` | Monitoring confirmation incomplete; the saved address is in `data.allocated` |
| `lock` | 503 | `addresses_not_watched` | `deposit_address_not_watched` | Monitoring confirmation incomplete for the existing address; no `data` field |
| All memo routes | 503 | `memo_lock_failed` | `signature_verification_unavailable` | Signature verification temporarily unavailable |
| All memo routes | 413 | `bad_request` | none | Request body larger than 32 KiB |
| All memo routes | 500 | `memo_lock_failed` | `internal_error` | Unexpected server error; on `allocate`, follow [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) |

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
| 404 | `not_found` | `from_tx_not_found` | No matching indexed record yet: the deposit may still be awaiting indexing, or the chain or hash is wrong. Ask again later or use history |
| 500 | `not_fetched` | `internal_error` | The record could not be read and `data` is an empty array. This says nothing about the payment: ask again later |

For `GET /config`, HTTP 500 with `status: "not_fetched"` and no `data`, `webhookKeys` or `memoLimits` means the configuration could not be read. Keep the keys and limits you already have and read again later.
These tables list common errors. Validation errors can identify other invalid fields; changing signed fields requires a new signature.

### Monitoring errors

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

The address is saved, but the memo attachment has not completed. [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request) reuses this address and the original signed request.

`POST /memo-locks/lock`, HTTP 503:

```json
{
  "status": "addresses_not_watched",
  "code": 503,
  "details": "deposit_address_not_watched"
}
```

This request operates on the existing signed `depositAddress`. No new address is made and no new reservation is written by this failed request.

On the new-address route, an error response does not guarantee that no address was made. Recovery states are defined under [Allocation recovery](#recover-a-lost-answer-to-a-new-address-request).
