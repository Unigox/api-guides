# Unigox Checkout: confirm payments on your server

> **Not available yet.** This page describes Unigox Checkout ahead of its release. Until this notice is gone, `https://www.unigox.com/checkout.js`, the help pages and the link check it names can answer 404. Once released, crypto processing is in early access, turned on per business.

> **Unigox Checkout guide:** [Quickstart](https://developers.unigox.com/tutorials/crypto-checkout) · [Embed](https://developers.unigox.com/tutorials/crypto-checkout-embed) · **Confirm payments** · [Links and deposit pages from your server](https://developers.unigox.com/tutorials/crypto-checkout-links) · [Test and go live](https://developers.unigox.com/tutorials/crypto-checkout-testing) · [Reference](https://developers.unigox.com/tutorials/crypto-checkout-reference) · [All on one page](https://www.unigox.com/checkout-integration.md)

## 4. Confirm the payment on your server

Fulfil an order only after your server verifies that the money was credited and the order is still eligible for fulfilment. There are two ways to verify the credit:

| Way | Needs | Sees |
| --- | --- | --- |
| [Confirm without the key](#confirm-without-the-key) | Nothing secret: the link's memo, its address IDs and your wallet address | The transfers your page reports, and any transfer whose hash you are given |
| [History](#fulfilinvoicememolockid), `fulfilInvoice` | Your wallet's private key | Every payment to the link's address IDs |

Unigox does not notify your server of a payment yet: run your check from your return page and from a periodic job for every open order. Also reconcile the history of your payment addresses for paid and closed orders, so you record additional or delayed credits without fulfilling an order again. You do not need to build a notification receiver. [Notifications to your server (not available yet)](https://developers.unigox.com/tutorials/crypto-checkout-reference#notifications-to-your-server-not-available-yet) says what changes once Unigox turns them on for you.

The statuses a payment goes through, with the event your page receives for each:

```
choosing ─▶ awaiting_payment ─▶ detected ─▶ confirming ─▶ paid           UNIGOX_CHECKOUT_PAID (onComplete)
  CHOOSING    AWAITING_PAYMENT    PAYMENT_DETECTED         ├─▶ overpaid   UNIGOX_CHECKOUT_OVERPAID (onComplete)
                                                           ├─▶ underpaid  UNIGOX_CHECKOUT_UNDERPAID: the rest can still come, then paid
                                                           ├─▶ on_hold    UNIGOX_CHECKOUT_ON_HOLD: under review, then paid or failed
                                                           └─▶ failed     UNIGOX_CHECKOUT_FAILED: not credited, or being returned
awaiting_payment ─▶ expired      the pay-by date passed with nothing received   UNIGOX_CHECKOUT_EXPIRED
late transfer needed to cover the amount, now credited ─▶ paid_late              UNIGOX_CHECKOUT_PAID_LATE (onComplete)
```

| Status | What it means | What your server does |
| --- | --- | --- |
| `choosing`, `awaiting_payment` | The payer is choosing, or the address and amount are shown | Nothing yet |
| `detected`, `confirming` | A transfer is on its network, not credited | Nothing yet: it can still fail |
| `paid` | Credited in full, or within the link's small-shortfall allowance; **Full amount only** allows no shortfall | Verify the credit and that the order can still be fulfilled |
| `overpaid` | Credited, more than the amount | Verify the credit and order; agree with the customer how to handle the extra |
| `underpaid` | Credited, short by more than the tolerance | Wait for the rest, or decide to fulfil anyway |
| `paid_late` | Enough has been credited, but transfers sent by the pay-by date did not cover the amount, including any allowed shortfall; a later transfer was needed | Record the money; your order policy decides whether to fulfil |
| `on_hold` | Received, under review by Unigox; not in your wallet | Wait |
| `failed` | Not credited, or being returned | Do not fulfil; see [When a payment is not exact](https://www.unigox.com/crypto-processing/help/exceptions) |
| `expired` | The pay-by date passed and nothing came | Make a new link if the order still stands |

Lateness uses the transfer's source-network timestamp, not the time the money was credited or your server checked it. A transfer recorded on its network before the deadline can be credited afterwards without being late. If that network timestamp is unavailable, the checkout does not infer lateness from the time it found the transfer. The checkout's result does not reopen an expired or cancelled order in your system.

### Confirm without the key

Every transfer has a public status: `GET /transaction/{fromChain}/{fromTx}` answers without a signature, with the address ID (`memoLockId`) and memo fingerprint (`memoHash`) the transfer was paid under, the wallet it was credited to, and whether it was credited. So your server can check each transfer your page heard about, and count only what it proved itself. This works for payment links made in the portal: keep the link's memo, its address IDs and your wallet address with your order (the portal's **Developers** page shows them for a link you paste there).

Your page posts the `payments` of a checkout event to your server (from `onStatusChange` or `onComplete`, or `payload.payments` of a message your own frame received); your server runs the code below.

- **What it does:** asks Unigox about each transfer the page reported, and keeps only the ones credited to your wallet under this link's reference text and address IDs.
- **What you keep:** the link's reference text, its address IDs and your wallet address with the order, and each transfer ID you counted.
- **What can go wrong:** a transfer that is not indexed yet, or a moment when Unigox cannot be read, is skipped this time: run the check again on the next event and from a periodic job.

An answer of `GET /transaction/{fromChain}/{fromTx}?quoteId=…` for a credited payment looks like this (the fields `verifyTransfers()` reads, and the ones around them; values shortened, and other fields can appear):

```json
{
  "status": "found",
  "code": 200,
  "data": {
    "quoteId": "<transfer ID>",
    "fromChain": "42161",
    "fromTx": "0x5f2c…9a41",
    "fromToken": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "fromAmount": "250000000",
    "toChain": "660279",
    "toToken": "<the coin's address on UNIGOX_BALANCE_CHAIN_ID, from GET /config>",
    "toAmount": "250000000",
    "actualToAmount": "250000000",
    "recipientAddress": "<your wallet address>",
    "toTx": "0x81d0…c3e7",
    "status": "DONE",
    "subStatus": "COMPLETED",
    "refund": null,
    "memo": null,
    "memoLockId": "27",
    "memoHash": "<keccak256 of the link's reference text>",
    "depositAddress": "<the link's payment address>"
  }
}
```

`memo` is `null`: the public status never returns your reference text, only its fingerprint `memoHash`. Amounts are whole numbers in the coin's smallest unit: for a coin with 6 decimals in `GET /config`, `250000000` is 250.00.

```js
// Node 18+ with viem (for keccak256). No key and no signature: every read is the public GET /transaction.
import { keccak256, toBytes } from "viem";

const UNIGOX_PAYMENTS_API = process.env.UNIGOX_PAYMENTS_API; // the API address on the Developers page
const UNIGOX_BALANCE_CHAIN_ID = 660279;                    // fixed: marks a payment credited to your Unigox wallet; copy as is

// One read of the Unigox payments API, at most 10 seconds: its JSON when the answer is ok and its status is `want`, else an error.
async function unigoxGet(path, want) {
  const response = await fetch(`${UNIGOX_PAYMENTS_API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== want) throw new Error(`Unigox ${path}: HTTP ${response.status}, ${body?.status ?? "no JSON"}`);
  return body;
}

// Credited, the way the checkout reads it: DONE and completed, nothing refunded.
const settled = (tx) => tx.status === "DONE" && (tx.subStatus === "COMPLETED" || (!tx.subStatus && tx.toTx)) && !tx.refund;

// order: your own record of the link, e.g. { wallet: "0x…", memo: "NW-20418 · 250.00 USD · v2", lockIds: ["27", "28"],
//   amount: "250.00", tolerance: "default" }. reported: the `payments` your page received; never trusted, each one is
//   read again here. Returns [{ id, micros, fromTxMinedAt }]; the timestamp comes from Unigox, never the browser.
export async function verifyTransfers(order, reported) {
  // One transaction can hold several transfers. quoteId or logIndex names one of them exactly. A hash alone reads the
  // first transfer of that transaction: it is counted only when it is this link's credit, and can miss the others.
  const hints = (Array.isArray(reported) ? reported : []).slice(0, 200);
  const memoHash = keccak256(toBytes(order.memo));
  const config = await unigoxGet("/config", "fetched");
  const settlement = config.data.find((c) => Number(c.chainId) === UNIGOX_BALANCE_CHAIN_ID)?.tokens.filter((t) => !t.native && /^USD/.test(t.symbol)) ?? [];
  const credits = new Map();
  for (const p of hints) {
    if (!Number.isSafeInteger(p?.chainId) || typeof p.txHash !== "string" || !/^[\w-]{8,128}$/.test(p.txHash)) continue;
    const pick = typeof p.quoteId === "string" && p.quoteId.length > 0 ? `?quoteId=${encodeURIComponent(p.quoteId)}`
      : typeof p.logIndex === "string" && /^\d+$/.test(p.logIndex) ? `?logIndex=${encodeURIComponent(p.logIndex)}` : "";
    let tx;
    try {
      tx = (await unigoxGet(`/transaction/${p.chainId}/${encodeURIComponent(p.txHash)}${pick}`, "found")).data;
    } catch {
      continue;                                            // not indexed yet, or Unigox cannot be read: ask again later
    }
    if (!order.lockIds.includes(String(tx.memoLockId))) continue;                    // one of this link's address IDs
    if (tx.memoHash?.toLowerCase() !== memoHash) continue;                            // under this link's memo
    if (tx.recipientAddress?.toLowerCase() !== order.wallet.toLowerCase()) continue;  // credited to your wallet
    if (Number(tx.toChain) !== UNIGOX_BALANCE_CHAIN_ID || !settled(tx)) continue;
    const token = settlement.find((t) => t.address.toLowerCase() === tx.toToken?.toLowerCase());
    if (!token) continue;
    // Amounts are integer strings in base units: to micro-USD with the token's decimals, in BigInt.
    const units = BigInt(tx.actualToAmount ?? tx.toAmount);
    const decimals = Number(token.decimals);
    const micros = decimals >= 6 ? units / 10n ** BigInt(decimals - 6) : units * 10n ** BigInt(6 - decimals);
    credits.set(tx.quoteId, { id: tx.quoteId, micros, fromTxMinedAt: tx.fromTxMinedAt ?? null });  // the same transfer reported twice counts once
  }
  return [...credits.values()];
}

// Paid as the checkout grades it: short by at most 0.5 % of the amount and never more than 1.00 USD, or nothing short
// for a link made with "full amount only" (tolerance "none").
export function isPaid(order, creditedMicros) {
  if (typeof order.amount !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(order.amount) || !/[1-9]/.test(order.amount)) throw new Error("amount: a positive decimal string, at most two decimals");
  const [whole, fraction = ""] = order.amount.split(".");
  const due = BigInt(whole + fraction.padEnd(6, "0"));
  const allowed = order.tolerance === "none" ? 0n : due / 200n < 1_000_000n ? due / 200n : 1_000_000n;
  return creditedMicros >= due - allowed;
}
```

`verifyTransfers` proves the transfers you name. Keep the `quoteId` of each payment or deposit event and pass it: it names one transfer exactly, and so does `logIndex`. A transaction hash alone works too: Unigox answers with the first transfer of that transaction, and the helper counts it only when it is a credit of this link to your wallet.

One transaction can hold several transfers: an exchange that pays many withdrawals in one transaction, or a customer who sends two parts in one. A hash alone then proves at most one of them, and none when the first transfer belongs to someone else. So a hash alone can miss a transfer, but it never counts one twice or for the wrong order. For a transfer it missed, pass that transfer's `quoteId` or `logIndex`, look the payment up in the portal's **Payments**, or read your signed history. An event that is not credited yet stays pending; it must not mark an order paid.

`fromTxMinedAt` is the source-chain timestamp supplied by Unigox. Keep the order's own `expiresAt` with its record. `isPaid` compares amounts only: for a deadline policy, classify each proven credit against that deadline using `fromTxMinedAt`; an absent or invalid timestamp needs review, not a guess from the browser clock. Record late credits too, then apply your cancellation, fulfilment or refund policy separately.

Then, in one database transaction, count each credit `id` (the transfer's `quoteId`) once per environment, add it to the order, and mark the order paid with one conditional update when `isPaid` holds, exactly as `fulfilInvoice` below does. A transfer that is not credited yet (`PENDING`, `PROCESSING`, on hold) is simply not counted: run `verifyTransfers` again on the next event, from your return page and from a periodic job while the order is open.

What it cannot see: a transfer your page never heard about. A customer who pays from another device, or closes the page before your page posted the event, or pays from a link you sent by email (the hosted page reports to no page of yours), is not seen. For those, look the payment up in the portal's **Payments**, or ask the customer for the transaction hash and pass `{ chainId, txHash }` to `verifyTransfers` (add `quoteId` or `logIndex` when you have it: a hash alone reads only the first transfer of a transaction, see above). History (below) sees every payment, and needs the key.

### `fulfilInvoice(memoLockId)`

Call it from your return page and from a periodic job that runs it every few minutes for each open order (with any of its address IDs). It reads the payment's records from your wallet's history, so it gives the same answer whichever source triggered it. When Unigox cannot be read or a payment is not in history yet, it throws or leaves the order open, and the next pass tries again: nothing is dropped. It marks each order paid once, also when the return page and the periodic job run it at the same moment.

- **What it does:** reads every payment to the order's address IDs from your signed history and marks the order paid once they cover the amount.
- **What you keep:** the order's amount, tolerance, addresses and address IDs, and each payment you counted.
- **What can go wrong:** when Unigox cannot be read, it throws and the order stays open; the next pass pays it.

```js
// Node 20+. Your server holds your wallet's key: signHistory() returns { chainId, authorization, signature }, the History
// type signed with your wallet and reused until it expires. The API reference has the signing code; its domain name is a
// fixed signature label ("Unigox Bridge History"): type it exactly.
// UNIGOX_PAYMENTS_API: the API address on the Developers page, as in "Confirm without the key".
const ENVIRONMENT = "production";                         // one ledger per environment
const WALLET = "0x…";                                      // your wallet

// One read of the Unigox payments API, at most 10 seconds: its JSON when the answer is ok and its status is `want`, else an error.
export async function unigoxCall(path, want, init = {}) {
  const response = await fetch(`${UNIGOX_PAYMENTS_API}${path}`, { cache: "no-store", ...init, signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== want) throw new Error(`Unigox ${path}: HTTP ${response.status}, ${body?.status ?? "no JSON"}`);
  return body;
}

async function readHistory(query) {
  const { data } = await unigoxCall("/transactions/history", "history_retrieved", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(await signHistory()), query }),
  });
  if (!Array.isArray(data?.transactions)) throw new Error("Unigox /transactions/history: no transactions");
  return data;
}

const UNIGOX_BALANCE_CHAIN_ID = 660279;                    // fixed: marks a payment credited to your Unigox wallet; copy as is

// Credited, the way the checkout reads it: DONE and completed, nothing refunded.
const settled = (tx) => tx.status === "DONE" && (tx.subStatus === "COMPLETED" || (!tx.subStatus && tx.toTx)) && !tx.refund;

export async function fulfilInvoice(memoLockId) {
  const order = await db.orderByLockId(memoLockId);        // your own record: amount, tolerance, addresses, address IDs, status
  if (!order) return;
  const config = await unigoxCall("/config", "fetched");   // throws when Unigox cannot be read: the next pass retries
  if (!Array.isArray(config.data)) throw new Error("Unigox /config: no chains");
  const settlement = config.data.find((c) => Number(c.chainId) === UNIGOX_BALANCE_CHAIN_ID)?.tokens.filter((t) => !t.native && /^USD/.test(t.symbol)) ?? [];

  // An order paid on several networks has one address ID per address type: read each.
  const payments = [];
  for (const lockId of order.lockIds) {
    let before;
    do {
      const { transactions, nextBefore } = await readHistory({ memoLockId: lockId, limit: 100, ...(before ? { before } : {}) });
      for (const tx of transactions) {
        const token = settlement.find((t) => t.address.toLowerCase() === tx.toToken?.toLowerCase());
        if (!settled(tx) || !token || Number(tx.toChain) !== UNIGOX_BALANCE_CHAIN_ID) continue;
        if (tx.recipientAddress?.toLowerCase() !== WALLET.toLowerCase()) continue;
        // One of this order's collection addresses (EVM in any letter case, the others exactly).
        if (!order.addresses.some((a) => a === tx.depositAddress || (a.startsWith("0x") && a.toLowerCase() === tx.depositAddress?.toLowerCase()))) continue;
        // Amounts are integer strings in base units: keep them in BigInt.
        const units = BigInt(tx.actualToAmount ?? tx.toAmount);
        const micros = token.decimals >= 6 ? units / 10n ** BigInt(token.decimals - 6) : units * 10n ** BigInt(6 - token.decimals);
        payments.push({ intentId: tx.intentId, micros });
      }
      before = nextBefore;
    } while (before);
  }

  // One database transaction: each (environment, intentId) counts once, and the order changes with it.
  await db.transaction(async (q) => {
    const current = await q.orderForUpdate(order.id); // SELECT ... FOR UPDATE; cancellation uses the same row lock
    if (!current) return;
    for (const p of payments) if (await q.claimIntentOnce(ENVIRONMENT, p.intentId, order.id)) await q.addCredited(order.id, p.micros);
    // Keep money received for cancelled, expired or already paid orders in the ledger, without shipping again.
    if (current.status !== "open") return; // "open" is your order state that still allows fulfilment
    // The checkout's tolerance: short by at most 0.5 % of the amount, never more than 1.00 USD (1_000_000 micro-USD),
    // or nothing short for a link made with "Full amount only" (tolerance "none", kept in your order record).
    const due = BigInt(order.amountMicroUsd);
    if (due <= 0n) throw new Error("Order amount must be positive");
    const allowed = order.tolerance === "none" ? 0n : (due / 200n < 1_000_000n ? due / 200n : 1_000_000n);
    // markPaid is one conditional update, UPDATE orders SET status = 'paid' WHERE id = $1 AND status = 'open', and
    // returns whether it changed the row: of passes running at the same moment, only one queues the shipment.
    if (BigInt(await q.creditedTotal(order.id)) >= due - allowed && await q.markPaid(order.id)) await q.queueShipment(order.id);
  });
}
```

- Count each `(environment, intentId)` once, in the same database transaction as the order update. One source transaction can hold several payments, each with its own `intentId`.
- Keep one ledger per order. `verifyTransfers()` counts a payment by its `quoteId` and `fulfilInvoice()` by its `intentId`: never let both add to the same order, or one payment counts twice. To use both, key both by `quoteId`, which history records carry too.
- Mark the order paid with one conditional update and ship only when that update changed the row. Checking `order.status` before the transaction is not enough: two passes that start together both see the order open.
- Payment receipt and order fulfilment are separate. Implement `orderForUpdate` as a locking read in the same transaction, and have cancellation use that lock too. Here, only your `open` state allows shipment; cancelled, expired, refunded and already paid orders still record new credits but never reopen automatically. Map this state to your own order lifecycle. Check your deadline and stock rules under the same lock before `markPaid`: the link's pay-by date does not enforce your order policy. For a late payment, keep the money recorded and decide whether to accept the order or arrange a refund.
- Reconciliation must also revisit paid and closed orders that can still receive transfers. A job that only checks open orders cannot discover an extra payment after fulfilment. Use your signed wallet history to find new credits, match their address IDs to orders and call the same function; repeat recent history reads to pick up transfers that settle later. These reads must never queue a second shipment.
- Compare with your order's amount, not with the token or anything the browser said.
- The checkout counts a payment short by at most 0.5 % of the amount, and never more than 1.00 USD, as paid: it shows Payment completed and sends `UNIGOX_CHECKOUT_PAID`. The code above applies the same rule, so your server and the payer's screen agree. Keep the link's tolerance with your order: `"none"` for a link made with **Full amount only** (in the portal) or with `tol: "none"` in its token, `"default"` otherwise. For such a link the checkout itself asks the payer for the rest of any shortfall, and the code above allows none.
- A larger shortfall leaves the order open: the customer can send the rest to the same address. More than the amount is credited as received.
- A record's `status` is `CREATED`, `PENDING`, `PROCESSING`, `DONE`, `FAILED`, `DEFERRED`, `COMPLIANCE_HOLD` or `COMPLIANCE_FROZEN`. A `DONE` record's `subStatus` is `COMPLETED`, `PARTIAL` or `REFUNDED`. Only `DONE` with `COMPLETED` and no `refund` is a credit (an older record can be `DONE` without a `subStatus`: it is a credit when it has a `toTx`, as `settled` reads it and the checkout shows it); `PENDING`, `PROCESSING`, `DEFERRED` and the two compliance states can still become one.
- Records can be pending and settle later without a new id. A periodic pass starts again without `before`.
- A payment's `quoteId` and `fromTx` also let you read one transfer with `GET /transaction/{fromChain}/{fromTx}?quoteId=`. That answer is not final either: 404 `from_tx_not_found` means the transfer is not indexed yet, `status: "not_fetched"` that Unigox could not read it, and a credit without `fromTx` cannot be looked up there at all. Leave such an order to the periodic pass; never mark the event done and forget the order.

### History for everything else

`POST /transactions/history` covers every payment, including payments after an address was reused. Filter by `memoLockId` for one payment, or by `chainType` and `depositAddress` for everything an address received, including a deposit-address customer across every address ID. With `includeMemo: true` your own memos come back, so you can group deposits by memo.

### The portal's CSV exports

The portal writes three files, with English column names in every language so that a script can read them, and times in the zone you choose (UTC unless you choose your own) with a `timezone` column:

- **Payments → Export CSV** asks which columns: **Readable**, for people (named in the [Payments help](https://www.unigox.com/crypto-processing/help/payments#export-csv)), in `crypto-payments-<from>-<to>.csv`, or **For developers**, the columns and codes below, in `crypto-payments-dev-<from>-<to>.csv`. `<from>` is `all` and `<to>` today when no period is set. The developer columns are `reference`, `status`, `amount_due_usd`, `received`, `expected`, `coin`, `source_coin`, `source_amount`, `source_network`, `source_tx`, `transfer`, `credit_tx`, `seen_at`, `credited_at`, `sender`, `address_id`, `deposit_address`, `payment_key`, `source`, `amount_check`, `link_received_usd`, `link_gap_usd`, `credited_amount`, `credited_coin`, `refund_tx`, `sent_at_recorded_by`, `timezone`, `environment`, `date_basis` and `date`. `address_id` is the receiving address's ID; `transfer` numbers the transfers of one source transaction; `payment_key` is the **Payment ID** of the readable file; `source` is `payment_link`, `deposit_address` or `other_credit`.
- **Payment links → Export CSV** writes `crypto-payment-links-<open|paid|closed|all>-<YYYY-MM-DD>.csv`, one row per link. Its developer columns are `reference`, `amount_usd`, `received_usd`, `remaining_usd`, `status`, `paid_late` (`yes` or `no`), `pay_by`, `tolerance` (`default`, `none`, or `not_recorded` for a link whose terms were not saved), `description`, `created_at`, `closed_at`, `payments` (how many), `address_ids` (the link's payment address IDs, separated by spaces), `timezone`, `coins` and `networks` (separated by `;`, or `all`), and `payment_link` (the link itself). Its `status` is one of the link statuses `awaiting`, `detected`, `hold`, `failed`, `refunding`, `paid`, `underpaid`, `overpaid` and `unknown` (its payments were not loaded), or `closed_unpaid` (closed before it was paid) or `closing_unfinished` (closing stopped part way: open the link and press **Finish closing**).
- **Deposit addresses → Export CSV** asks the same: **Readable** columns (named in the [Payments help](https://www.unigox.com/crypto-processing/help/payments#export-deposit-addresses)) in `crypto-deposit-addresses-<YYYY-MM-DD>.csv`, or **For developers** in `crypto-deposit-addresses-dev-<YYYY-MM-DD>.csv`, one row per customer and address type. The developer columns are `customer`, `reference_text`, `status`, `created_at`, `archived_at`, `address_type`, `address`, `address_id`, `address_status`, `customer_total_deposits`, `customer_total_credited_usd`, `customer_total_credited_by_coin`, `customer_total_in_progress`, `customer_total_on_hold`, `last_deposit_at`, `history_complete`, `timezone` and `address_ids`, with the codes below. `address_id` is the current reservation ID for this address type; `address_ids` contains all current and historical reservation IDs for this customer and address type, separated by `;` (current first). Keep every ID when reconciling deposits received before a restore. The `customer_total_*` columns and `last_deposit_at` are written on the customer's first row only, so a column sum counts each customer once.

| Column | Code | Meaning |
| --- | --- | --- |
| `status` (payments) | `paid` | Credited, and the payments under its reference cover the amount due, or fall short by at most 0.5 % and never more than 1.00 USD |
| | `underpaid` | Credited, but the payments under its reference are short of the amount due by more than that |
| | `overpaid` | Credited, and the payments under its reference add up to more than the amount due |
| | `credited` | Credited, with no amount to compare: a top-up, a transfer without one of your payment references, or a link whose earlier payments are older than the loaded history |
| | `detected` | Seen on its network, not credited yet |
| | `crediting` | Being credited to your wallet |
| | `hold` | Under review: Unigox is reviewing the transfer. It is not in your wallet until it is released. How long a review takes depends on the case, and Unigox support can tell you where it stands; Unigox may contact you for details about the payment. If the money is not released, Unigox support tells you what happens to it |
| | `failed` | Not credited, and not being sent back: contact Unigox support with the source transaction |
| | `refunding` | Not credited, and being returned. If the payer sent from an exchange, the return can reach the exchange's own wallet rather than the payer's account: ask the payer for an address they control and tell Unigox support |
| | `refunded` | Not credited: it was returned. A payer who sent from an exchange gives the return's transaction hash to the exchange's support |
| `status` (deposit addresses) | `active`, `archived` | The customer's deposit addresses are in use, or were archived |
| `address_type` | `evm`, `tvm`, `ton`, `svm` | The address type: Ethereum-style networks, TRON, TON, Solana |
| `address_status` | `active` | The address takes this customer's deposits |
| | `archived` | You archived the address: a transfer to it now carries no reference |
| | `ended_by_unigox` | Unigox ended the address's reservation (the portal shows **No longer in use**). Transfers to it still reach your wallet, without this customer's reference: use **Add network** on the customer to give them a new address there, and send the customer their new page |
| `history_complete` | `yes`, `no` | `no`: the customer's deposits may go back further than the history the portal loaded, so `customer_total_deposits` is a floor and `customer_total_credited_usd` is empty |
