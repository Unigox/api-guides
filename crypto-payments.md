# Accept crypto payments on EVM, TON, Solana and Tron

Give each invoice a deposit address with a reference, and let the customer pay in a supported asset.

The invoice reference is stored as a **memo** attached to the collection address. Payments use standard token transfers without an on-chain memo or tag.

## Payment flow

1. Allocate a collection address with `POST /memo-locks/allocate`. The signed request contains the invoice reference and HTTPS callback URL. Existing addresses support reassignment as described below.
2. Wait for the selected network to be ready, then display the collection address, network, asset and amount at checkout.
3. Receive the signed `deposit.credited` webhook. Its `memoLockId` identifies the invoice association; its `intentId` identifies the payment.
4. Retrieve transaction status or wallet-signed history to confirm the credited amount, asset and recipient. Payment confirmation requires a completed, non-refunded settlement matching the invoice. Any webhook used must also pass signature verification.

Signing schemas, request and response formats, and webhook authentication are defined in the [API reference](api-reference/bridge-payments.md).

## Address reuse

Collection addresses support successive invoices. Reassignment after payment consists of two signed requests:

1. End the previous memo association with `POST /memo-locks/unlock`.
2. Attach the new invoice reference and callback URL with `POST /memo-locks/lock`.

Reassignment preserves the address and creates a new `lockId`. The new association has an `ACTIVE` lock. [Network readiness](api-reference/bridge-payments.md#network-readiness) is reported separately in `monitoring`. Delayed webhooks retain the lock ID associated with the original deposit.

Deposit attribution uses the memo active at the deposit's on-chain timestamp. Deposits during the new lock's window carry the new invoice reference; deposits between locks have no memo. Unlocking or expiry does not prevent transfers to the address.

## Networks and assets

| `chainType` | Collection address |
| --- | --- |
| `evm` | Shared across supported EVM deposit networks |
| `ton` | TON |
| `svm` | Solana |
| `tvm` | Tron |

Collection supports configured ERC-20 tokens on EVM networks, TRC-20 tokens on Tron, jettons on TON and SPL tokens on Solana. Native coins such as ETH, TRX, TON and SOL are not supported by this collection flow. XAI (chain ID `660279`) is the settlement chain, not a collection network.

`GET /config` includes inactive and native assets as well as collection assets. Checkout options require an active source chain, an active non-native token with a compatible XAI settlement token, and a ready collection address on that network. The [supported payment assets](api-reference/bridge-payments.md#supported-payment-assets) section defines the fields and matching rules.

Payments on an unsupported network or in an unsupported asset are not automatically credited or refunded. Recovery requires a support assessment and is not guaranteed.

## Settlement

The merchant's EVM wallet owns the collection addresses and authorizes their creation and memo changes across all four address families.

Payments are credited to the merchant's **UNIGOX balance on the XAI chain (chain ID 660279)**. Transaction status provides the settlement chain, token, amount, recipient and transaction hash. The webhook's `fromAmount` represents the source deposit. In status and history, `toAmount` is the expected destination amount; `actualToAmount`, when present, is the confirmed amount received. Use the confirmed amount for reconciliation, falling back to `toAmount` on older completed records that lack it.

See [quoted amounts and confirmed receipts](api-reference/bridge-payments.md#quoted-amounts-and-confirmed-receipts) for the response fields.

## Payment records

An address can receive multiple payments under one memo. Invoice totals, partial payments and overpayments are managed by the merchant application. A memo association does not enforce a payment amount or initiate refunds.

Webhook delivery can repeat when an acknowledgement is not received or recorded. Retries retain the same event ID. Event deduplication uses `(environment, type, id)`; payment deduplication uses `(environment, intentId)`. A transaction can contain multiple payments, each with a separate intent.

The webhook body does not include `environment`. It comes from the receiver configuration: a separate callback URL for each environment, or distinct environment-specific verification keys for a shared URL. See [environment and event identity](api-reference/bridge-payments.md#environment-and-event-identity).

`POST /transactions/history` returns incoming and outgoing Bridge records with a wallet signature and no UNIGOX account. Memo fields are omitted by default; signed `includeMemo: true` includes the owner's invoice references. Filters support the original memo association and collection address.

History covers payments whose callbacks were missed or exhausted their retries. It retains the original invoice reference after address reassignment. See [wallet transaction history](api-reference/bridge-payments.md#wallet-transaction-history) for signing, pagination and reconciliation.

Amounts are integer strings in token base units. The source and destination token decimals determine their respective scales.
