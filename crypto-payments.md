# Accept crypto payments on EVM, TON, Solana and Tron

Give each invoice a deposit address with a reference, and let the customer pay in a supported asset.

The invoice reference is stored as a **memo** attached to the collection address. Payments use standard token transfers without an on-chain memo or tag.

## Payment flow

1. Allocate a collection address with `POST /memo-locks/allocate`. The signed request contains the invoice reference and HTTPS callback URL. Existing addresses support reassignment as described below.
2. Display the collection address, network, asset and amount at checkout.
3. Receive the signed `deposit.credited` webhook. Its `memoLockId` identifies the invoice association; its `intentId` identifies the payment.
4. Retrieve transaction status to confirm the credited amount, asset and recipient. Payment confirmation requires webhook authentication and a completed, non-refunded settlement matching the invoice.

Signing schemas, request and response formats, and webhook authentication are defined in the [API reference](api-reference/bridge-payments.md).

## Address reuse

Collection addresses support successive invoices. Reassignment after payment consists of two signed requests:

1. End the previous memo association with `POST /memo-locks/unlock`.
2. Attach the new invoice reference and callback URL with `POST /memo-locks/lock`.

Reassignment preserves the address and creates a new `lockId`. The new association is ready when the API returns `memo_locked` with an `ACTIVE` lock. Delayed webhooks retain the lock ID associated with the original deposit.

Deposit attribution uses the memo active at the deposit's on-chain timestamp. Deposits during the new lock's window carry the new invoice reference; deposits between locks have no memo. Unlocking or expiry does not prevent transfers to the address.

## Networks and assets

| `chainType` | Collection address |
| --- | --- |
| `evm` | Shared across supported EVM deposit networks |
| `ton` | TON |
| `svm` | Solana |
| `tvm` | Tron |

`GET /config` provides chain IDs, token addresses and decimals. Deposit availability is limited to supported network and asset combinations; the `active` flag alone does not establish deposit support.

## Settlement

The merchant's EVM wallet owns the collection addresses and authorizes their creation and memo changes across all four address families.

Payments are credited to the merchant's **UNIGOX balance on the XAI chain (chain ID 660279)**. Transaction status provides the settlement chain, token, amount, recipient and transaction hash. The webhook's `fromAmount` represents the source deposit; `toAmount` in transaction status represents the destination credit.

## Payment records

An address can receive multiple payments under one memo. Invoice totals, partial payments and overpayments are managed by the merchant application. A memo association does not enforce a payment amount or initiate refunds.

Webhook delivery can repeat when an acknowledgement is not received or recorded. Retries retain the same event ID. Event deduplication uses `(environment, type, id)`; payment deduplication uses `intentId`. A transaction can contain multiple payments, each with a separate intent.

Amounts are integer strings in token base units. The source and destination token decimals determine their respective scales.
