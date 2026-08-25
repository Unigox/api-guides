# Scheduled settlement (Settlement T+1)

Use this flow when an off-ramp is larger than a provider will settle instantly,
or when your customer wants a floor under the payout on a transfer that takes a
day.

On the instant flow the provider pays your customer's fiat first and the escrow
is released afterwards. Scheduled settlement inverts it: the escrow is released
into Unigox custody, we fund the payout provider, and the fiat follows inside
the settlement window.

That inversion moves one moment you have to get right in your own product:

> **The escrow emptying is not the payout.**

On this flow the customer's crypto leaves escrow in the **middle** of the order,
with nobody paid yet. If your UI says "complete" when the escrow empties — which
is what it means on the instant flow — you will tell a customer their money
arrived while it is still in a bridge.

Everything here is **additive**. An integration that never calls it behaves
exactly as it does today.

## The money-and-state model

A settlement order is described by **two independent fields**, and you need
both. Neither can be derived from the other.

| Field | Answers |
| --- | --- |
| `stage` | Which business step the order is in — waiting for the escrow, in compliance review, being paid out. |
| `financial_location` | Where the money physically is right now. |

The second one is the one that decides whether a refund is possible. Two orders
can sit in the same `stage` with the money in different places, and only one of
them can be given back.

### Where the money can be

`financial_location` takes exactly these nine values:

| Value | The money is | Refundable by us alone |
| --- | --- | :---: |
| `customer_wallet` | still with the customer; nothing was sent | yes |
| `escrow` | in the order's escrow Safe | yes |
| `custody` | on a Unigox custody wallet | yes |
| `bridge_in_transit` | on a chain, on its way to the provider | **no** |
| `provider_book` | on the payout provider's books | **no** |
| `fiat_payout_in_transit` | with the provider, being sent to the bank | **no** |
| `fiat_paid` | with the customer's bank — paid | **no** |
| `crypto_refunded` | back with the customer, as crypto | **no** |
| `fiat_returned` | back on the provider's book after a bank return | **no** |

The first three are the whole of the technically refundable set. `cancellable`
is narrower: it also enforces the customer's commitment boundary at final
compliance approval. An operator may still unwind a recoverable incident after
that boundary, but the customer/partner cancel endpoint will not race payout
preparation.

### The point of no return

It sits between `custody_release` and `provider_funding`.

The crypto has left the escrow in **both** of them. The difference is that in
`custody_release` it is sitting on a wallet we control and we can send it back,
and in `provider_funding` the funding transaction has left us. There is no
transition in the stage machine from `provider_funding` — or from anything after
it — back to `refund_processing`, and that absence is deliberate: recovery past
that line is a conversation with a payout provider, not a transaction we can
make. An endpoint that accepted a refund request there and quietly failed later
would be worse than the refusal, because you would stop chasing the provider.

This physical point of no return is intentionally later than the customer
cancellation boundary. `cancellable` goes `false` when final approval moves the
order into `provider_preclearance`, and never returns to `true`. The funds can
still be physically refundable there, but only an explicit operator recovery or
the dedicated decline-requote action may start that return.

### Which stages mean the customer has NOT been paid

Everything up to and including `fiat_payout`. Do not show "complete", "paid",
"sent" or "done" while `stage` is any of:

```
awaiting_escrow_funding   compliance_review   additional_information_required
provider_preclearance     requote_required    ready_for_settlement
custody_release           provider_funding    provider_credit_confirmation
fiat_payout               refund_processing   manual_recovery
```

The four in the middle are the dangerous ones — `custody_release`,
`provider_funding`, `provider_credit_confirmation`, `fiat_payout`. The escrow is
empty and `GET /partner/orders/{order_id}` says `settlement_in_progress`, which
on the instant flow would mean the customer has their money. Here it does not.

Exactly one stage means paid: `completed`. One more means paid and then sent
back by the receiving bank: `returned` — and that one is **not an ending**,
because the payout is retried from it.

### Terminal means two stages

`completed` and `refunded`. Nothing else. Two stages that look like endings are
not:

- **`returned` is not terminal.** The bank sent the payout back — usually a
  closed, mistyped or name-mismatched account. The order is payable again once
  the details are corrected, so it goes either back to `fiat_payout` or to
  `manual_recovery`. An integration that closes the order here will never see
  the `completed` that follows.
- **`manual_recovery` is not terminal either**, even though the ordinary orders
  endpoint reports it as `failed`. It is being worked by hand and can still
  finish as `completed`, `refunded` or `returned`.

## The lifecycle

```
                    you convert the order
                             |
                             v
                 [awaiting_escrow_funding]  customer_wallet / escrow
                             |
                    escrow observed funded
                             |
                             v
                   [compliance_review]  escrow  <---------+
                             |                            |
                +------------+------------+               | declaration
                |                         |               | resubmitted
                v                         v               |
   [additional_information_required]   (approved)         |
             escrow -------------------------------------+
                                          |
                                          v
                            [provider_preclearance]  escrow
                                          |
                     +--------------------+--------------------+
                     |                                         |
              rate still good                        payout below the floor
                     |                                         |
                     v                                         v
            [ready_for_settlement]  escrow          [requote_required]  escrow
                     |                                         |
                     |<------------------ accepted ------------+
                     |                                declined |
                     v                                         v
              [custody_release]  escrow -> custody      [refund_processing]
                     |                                         |
        ===== POINT OF NO RETURN =====                         v
                     |                                    [refunded]
                     v                                   crypto_refunded
            [provider_funding]  bridge_in_transit
                     |          or provider_book
                     v
      [provider_credit_confirmation]  bridge_in_transit
                     |                or provider_book
                     v
              [fiat_payout]  fiat_payout_in_transit
                     |          (provider_book on a retry)
                     |
           +---------+---------+
           |                   |
           v                   v
      [completed]         [returned]  fiat_returned
       fiat_paid               |
           |                   +--> retried: back to [fiat_payout]
           +--> a later bank return: [returned]

  [manual_recovery] is reachable from every stage above and has an edge out to
  every outcome. Nothing you can call moves an order out of it.
```

The authoritative transition table, as the server enforces it:

| From | May move to |
| --- | --- |
| `awaiting_escrow_funding` | `compliance_review`, `refund_processing`, `manual_recovery` |
| `compliance_review` | `additional_information_required`, `provider_preclearance`, `refund_processing`, `manual_recovery` |
| `additional_information_required` | `compliance_review`, `refund_processing`, `manual_recovery` |
| `provider_preclearance` | `ready_for_settlement`, `requote_required`, `refund_processing`, `manual_recovery` |
| `requote_required` | `ready_for_settlement`, `refund_processing`, `manual_recovery` |
| `ready_for_settlement` | `custody_release`, `refund_processing`, `manual_recovery` |
| `custody_release` | `provider_funding`, `refund_processing`, `manual_recovery` |
| `provider_funding` | `provider_credit_confirmation`, `manual_recovery` |
| `provider_credit_confirmation` | `fiat_payout`, `manual_recovery` |
| `fiat_payout` | `completed`, `returned`, `manual_recovery` |
| `refund_processing` | `refunded`, `manual_recovery` |
| `manual_recovery` | `custody_release`, `provider_funding`, `provider_credit_confirmation`, `fiat_payout`, `refund_processing`, `completed`, `refunded`, `returned` |
| `completed` | `returned` |
| `refunded` | — |
| `returned` | `fiat_payout`, `manual_recovery` |

A stage may also be re-written to itself, which is how a duplicate provider
callback is absorbed.

Note the two edges that surprise people. `completed → returned` exists because a
bank can return a payout after it settled, and that is not a failure of the
order — we did pay. `returned → fiat_payout` exists because the ordinary
resolution of a bank return is to correct the details and pay again.

### Who moves the order

You drive four transitions. Everything else is moved by us, which is why the
stage list is much longer than the list of calls you can make.

| Moved by | Which transitions |
| --- | --- |
| **You** | opening the order, submitting the declaration, answering a re-quote, cancelling |
| **Your customer** | funding the escrow, on chain, through the funding calls you already use |
| **A Unigox compliance reviewer** | approving or rejecting the source-of-funds case, asking for more information. A person in our console, not an endpoint you can call. Approval runs pre-clearance immediately after, which is what produces either `ready_for_settlement` or `requote_required`. |
| **Us, recording facts** | custody release, provider funding, provider credit, payout submitted, payout settled, payout returned, refund completed. Each is written after it has already happened on a chain or at a provider. |

Two consequences worth planning for:

- **The compliance step has no SLA you can poll.** An order can sit at
  `compliance_review` while a human reads documents, and
  `estimated_completion_at` deliberately does not exist yet at that point.
- **Nothing you can call moves an order out of `manual_recovery`.**
  `required_action` becomes `contact_support`.

## The fields to integrate against

| Field | What it is for | Build on it? |
| --- | --- | --- |
| `stage` | Where the order actually is. The full vocabulary, and the field that gains values over time. | **Yes — this is the one.** Render from `stage`, with a default branch for a value you have not seen. |
| `financial_location` | Where the money physically is. | **Yes**, when you reason about refundability. Never as wording shown to a customer. |
| `required_action` | The one thing your customer can do, or `null`. | **Yes**, for prompts. It is the only field that says the order is waiting on your customer rather than on us. |
| `cancellable` | Whether a cancel request would be accepted right now. | **Yes.** Do not offer the control when it is `false`. |
| `status` | The small, stable vocabulary you already know, collapsed from `stage`. | Only for compatibility with code that already switches on it. |

`required_action` takes one of four values or `null`: `fund_escrow`,
`submit_information`, `accept_requote`, `contact_support`.

`status` is derived from `stage` and cannot distinguish `refund_processing` from
`manual_recovery`, or `custody_release` from `fiat_payout`:

| `stage` | `status` |
| --- | --- |
| `awaiting_escrow_funding` | `pending_approval` |
| `compliance_review`, `additional_information_required`, `provider_preclearance`, `requote_required` | `under_review` |
| `ready_for_settlement`, `custody_release`, `provider_funding`, `provider_credit_confirmation`, `fiat_payout`, `refund_processing`, `manual_recovery` | `processing` |
| `completed` | `completed` |
| `refunded` | `cancelled` |
| `returned` | `returned` |

### Stage, location, action and cancellability together

| Stage | `financial_location` | `required_action` | `cancellable` |
| --- | --- | --- | :---: |
| `awaiting_escrow_funding` | `customer_wallet` or `escrow` | `fund_escrow` | true |
| `compliance_review` | `escrow` | `submit_information`, then `null` | true |
| `additional_information_required` | `escrow` | `submit_information` | true |
| `provider_preclearance` | `escrow` | `null` | false |
| `requote_required` | `escrow` | `accept_requote` | false — use the explicit decline action |
| `ready_for_settlement` | `escrow` | `null` | false |
| `custody_release` | `escrow` or `custody` | `null` | false |
| `provider_funding` | `bridge_in_transit` or `provider_book` | `null` | false |
| `provider_credit_confirmation` | `bridge_in_transit` or `provider_book` | `null` | false |
| `fiat_payout` | `provider_book` or `fiat_payout_in_transit` | `null` | false |
| `refund_processing` | `customer_wallet`, `escrow` or `custody` | `null` | false |
| `manual_recovery` | any of the nine | `contact_support` | false |
| `completed` | `fiat_paid` | `null` | false |
| `refunded` | `crypto_refunded` | `null` | false |
| `returned` | `fiat_returned` | `null` | false |

`provider_funding` and `provider_credit_confirmation` carry two possible
locations because corridors are funded two different ways. On a **bridge**
corridor the crypto physically leaves custody and `bridge_in_transit` is
literally true. On a **float** corridor the provider is prefunded, nothing moves
on any chain, and the value is on their book from the moment we draw it down —
so the location is `provider_book`. Neither is refundable, which is the part
that matters to you.

`refund_processing` reports `customer_wallet` when the order was cancelled
before the customer ever sent anything. That is a cancellation rather than a
refund, and there is nothing to return.

## What changed on the endpoints you already use

### Two new order-status values

New values in an enum you already read, on `GET /partner/orders/{order_id}`,
`GET /partner/orders` and the order webhooks:

| Value | Meaning |
| --- | --- |
| `settlement_in_progress` | The customer's crypto has left escrow into Unigox custody and no fiat has been paid yet. |
| `returned` | The payout was made and the receiving bank sent it back. The order is **still live**. |

Neither can appear on an order with no settlement order, so nothing you have
today starts returning them by surprise. `returned` is deliberately not mapped
to `cancelled` or `failed`: it records that we paid, which is the fact you need
when reconciling.

Both also work as filter inputs — `GET /partner/orders?status=settlement_in_progress`
and `?status=returned` return the orders that report them.

### The two surfaces do not always agree

The same order is visible in two places and they answer different questions.
`GET /partner/orders/{order_id}` reports the **trade**;
`GET /partner/settlement/orders/{order_id}` reports the **settlement plane**.
Four stages disagree, and each difference is deliberate:

| `stage` | settlement `status` | `GET /partner/orders` status |
| --- | --- | --- |
| `custody_release` … `fiat_payout` | `processing` | `settlement_in_progress` |
| `refund_processing` | `processing` | `cancelled` |
| `refunded` | `cancelled` | `cancelled` |
| `manual_recovery` | `processing` | `failed` |

- **`cancelled` on the ordinary endpoint does not mean the crypto is back.** It
  covers a refund that has started and a refund that has landed. Only `stage`
  tells them apart — `refund_processing` versus `refunded`.
- **`failed` on the ordinary endpoint does not mean the order is over.**
- If you show one status to a customer, take it from the settlement endpoint.

### Two partner endpoints now refuse a converted order

Once an order has a settlement plane, two calls you already use stop working on
it and name where to go instead. Both answer **409**:

| Call | What it says |
| --- | --- |
| `POST /partner/orders/{order_id}/cancel` | `this order settles crypto-first: cancel it with POST /partner/settlement/orders/{order_id}/cancel, which also releases the corridor hold and refuses when the funds are no longer ours to return` |
| `POST /partner/orders/{order_id}/confirm-fiat-received` | `this order settles crypto-first: its lifecycle is driven by /partner/settlement/orders/{order_id}, and the escrow is not released by confirming fiat` |

The refusals are not tidiness. The ordinary cancel used to cancel the **trade**
and report success while the settlement plane went on reporting
`awaiting_escrow_funding` with the capacity hold still standing. And on this
flow `confirm-fiat-received` would empty the escrow to the vendor with
compliance skipped, which is irreversible.

> **These two 409s carry `error.code: INVALID_REQUEST`, not `INVALID_STATUS`.**
> Every other 409 in this document carries `INVALID_STATUS`. If you switch on
> the code, special-case these two.

If either endpoint cannot determine an order's settlement class — a read failure
on our side — it answers **503** with `INTERNAL_ERROR` and
`this order's settlement class could not be determined; retry shortly`, rather
than falling back to the old behaviour. Retry: it costs a round trip and cannot
cost anyone their money.

Everything else on the ordinary order — reading it, funding the escrow through
`transfer-authorization-parameters` and `authorize-crypto-transfer` — is
unchanged.

## End-to-end flow

1. Create the off-ramp order exactly as you do today (quote → initiate).
2. Wait for the order to reach `awaiting_escrow_funding`, but **do not fund it
   yet**.
3. Read `GET /partner/settlement/capacity` for the corridor you intend to use
   and keep `capacity_id`, `revision` and `settlement_sla_hours`.
4. Show your customer the terms, then convert the order:
   `POST /api/v1/partner/settlement/orders`, with `terms_accepted`, the terms
   provenance, the capacity tuple, and — ideally — the whole `declaration` in
   the same call. This takes a capacity hold and opens the compliance case.
5. Show the exact quote the create returned and echo it back with
   `POST .../quote-acceptance`. Nothing settles until that succeeds.
6. Upload the source-of-funds documents with `POST .../documents`, one call per
   file. If you did not send the declaration inline, submit it with
   `POST .../declaration` too. Both need the order to exist, so they come after
   step 4.
7. For `crypto_assets`, register the declared funding address, network, chain
   and asset with `.../funding-intent`. No wallet signature or proof-of-control
   upload is requested.
8. Only when the opening dossier and funding intent are complete, fund the
   escrow through `transfer-authorization-parameters` →
   `authorize-crypto-transfer`. Both existing transfer endpoints enforce this
   gate for a scheduled-settlement order.
9. **Poll** `GET /partner/settlement/orders/{order_id}` and surface `stage` and
   `required_action`. Nothing is notified between here and the escrow emptying —
   see [what actually fires](#what-to-poll-for-and-what-actually-fires).
10. If `required_action` becomes `accept_requote`, ask your customer and answer
   with `requote/accept` or `requote/decline`.
11. The order finishes at `stage: completed` or `refunded`. Those two are the
   only endings.

> **The settlement plane comes before funding and that ordering is enforced.**
> It is what lets us freeze the document contract and record the declared funding
> source before any irreversible transfer. After funding, the actual ERC-20 sender
> is captured from the Transfer log and screened through Crystal. The historical
> funded-but-untouched conversion remains accepted, but an order whose
> counterparty has already started paying answers
> **409** `this trade's counterparty has already begun paying the fiat leg, so
> it cannot be moved to scheduled settlement — it would be paid twice`.

## Authentication

Every endpoint below takes the same partner credential as the rest of the
Partner API:

```http
X-API-Key: <your key>
```

Responses share the Partner API envelope — `{"success": true, "data": …}` on
success and `{"success": false, "error": {"code", "message", "details"}}` on a
refusal.

## 1. Check corridor capacity

```http
GET /api/v1/partner/settlement/capacity?fiat_currency=CNY&rail=CNAPS
X-API-Key: <your key>
```

```json
{
  "success": true,
  "data": {
    "corridors": [
      {
        "capacity_id": 41,
        "provider": "lightnet",
        "fiat_currency": "CNY",
        "rail": "",
        "revision": 7,
        "max_ticket_usd": "50000.00",
        "min_ticket_fiat": "25.00",
        "settlement_sla_hours": 24,
        "reservation_ttl_seconds": 3600,
        "reservable_usd": "250000.00",
        "available_usd": "250.00"
      }
    ]
  }
}
```

`fiat_currency` is required — without it the call is **400**,
`fiat_currency is required`.

**It is case-sensitive.** `fiat_currency=cny` returns an empty `corridors`
array, which is indistinguishable from "we do not offer this currency". Send the
same upper-case code you send everywhere else.

`rail` filters to the corridors that can serve that rail: rows pinned to it,
**plus** every row whose `rail` is `""`, which covers all rails of that
currency. Omitting `rail` returns every corridor for the currency, rail-specific
ones included — so a corridor you cannot use may appear in an unfiltered list.

`provider` restricts to one provider. Omitted, you get every enabled corridor,
and order creation picks the default for the currency.

**`capacity_id`, `revision` and `settlement_sla_hours` are the three values you
must carry into order creation**, where they are named `capacity_id`,
`capacity_revision` and `promised_settlement_sla_hours`. They are what freezes
the delivery window you showed your customer, so an operator editing the
corridor afterwards cannot rewrite their promise.

`max_ticket_usd` is a hard per-order ceiling. An order above it is refused at
creation with the same message as an exhausted corridor, so compare your order
size against it first if you want to tell your customer which of the two
happened.

`min_ticket_fiat` is the smallest payout the provider can deliver in the
corridor's own fiat currency. It is `null` only when the corridor has no payout
floor. Do not offer T+1 below it: the create endpoint checks the same value
authoritatively and refuses the order before any capacity is held.

`reservable_usd: null` is a real answer, not a missing field: the provider has
configured no separate commercial in-flight ceiling. With a commercial ceiling,
`available_usd` is the remaining scheduled headroom after active, unexpired
holds. A fresh provider balance is required as integration-liveness evidence
when the corridor says so, but its amount does not cap a new T+1 promise: a
fresh balance of 1,000 USD may legitimately advertise a 200,000 USD scheduled
ticket when commercial headroom covers it. Actual cash is checked again before
escrow release. Without a commercial ceiling, the fresh live balance is the
conservative availability fallback. Completed payouts do not occupy commercial
room and are already reflected in the provider's current balance.

When this corridor requires a live balance and that reading is missing or
stale, `available_usd` is `"0.00"` and new orders fail closed. It is `null` only
when neither a commercial ceiling nor a live-balance ceiling is configured.
Treating `null` as zero will make you refuse business the corridor deliberately
left unconstrained.

An empty `corridors` array means scheduled settlement is not available for that
currency at all.

A **503** means something different: this host is not ready to make the T+1
promise because at least one automatic custody-release, custody-refund or
provider-funding path did not start. Do not treat it as an empty currency and do
not create an order from a cached capacity response; retry with backoff. The
create endpoint repeats the same readiness gate before taking a capacity hold.

## 2. Read the source-of-funds requirements

```http
GET /api/v1/partner/settlement/requirements?source_of_funds=salary
X-API-Key: <your key>
```

```json
{
  "success": true,
  "data": {
    "revision": 5,
    "categories": [
      {
        "code": "salary",
        "label": "Salary or wages",
        "description": "Regular income from an employer.",
        "requiresExplanation": true,
        "requiresBankStatement": true,
        "baseDocuments": [
          { "key": "bank_statement", "label": "Personal account statement" }
        ],
        "statement": { "minMonths": 3, "maxAgeDays": 31 },
        "groups": [
          {
            "mode": "one_of",
            "documents": [
              { "key": "employment_contract", "label": "Employment contract" },
              { "key": "payslips", "label": "2-3 recent payslips",
                "multiple": true, "minFiles": 2, "maxFiles": 3 },
              { "key": "employer_letter", "label": "Letter from your employer" }
            ]
          }
        ],
        "revision": 5
      }
    ]
  }
}
```

The category fields are **camelCase**. This is the catalogue's own JSON, served
verbatim, and the same document our widget and our reviewers' checklists read.
Code written against snake_case reads `undefined` for `requiresBankStatement`
and silently stops asking for the statement.

Omit `source_of_funds` to get the whole catalogue — exactly nine selectable
categories: `salary`, `business_income`, `sale_of_property`, `investment`,
`crypto_assets`, `inheritance_gift`, `loan`, `dividends`, `savings`. An unknown code is **404** with
`unknown source_of_funds "…"`. (The
`error.code` on that 404 is `ORDER_NOT_FOUND`, which is the generic code for the
status; no order is involved.)

The whole-catalogue response is fail-closed: it is **500**, not a partial 200, if
any of the nine definitions is missing, disabled, duplicated, malformed or has a
revision mismatch. A client must likewise reject a malformed/partial 200 rather
than fill the missing category from bundled UI copy; otherwise web, API and the
reviewer's frozen dossier no longer describe the same evidence contract.

**`mode` is the field that carries the meaning.** `all_of` means every document
in the group; `one_of` means any single one of them. Rendering a `one_of` group
as three mandatory uploads asks a salaried customer for three documents where
one would do.

`multiple`, `minFiles` and `maxFiles` appear on a document that expects more
than one file — `payslips` is the one today. They matter beyond the form: a
document type that accepts many files **accumulates** on re-upload instead of
superseding.

The personal bank statement is required for eight categories. `crypto_assets`
is the deliberate exception: an exchange → wallet path may never touch a bank,
so its two uploads are `exchange_statement` **and** `withdrawal_history`. A
reviewer may request a bank statement later only when the customer's explanation
says the crypto proceeds moved through their bank account.

The complete upload contract is:

| `source_of_funds` | Bank PDF | Additional requirement |
| --- | :---: | --- |
| `salary` | required, ≥3 months | **one of:** employment contract; 2–3 payslips; employer letter |
| `business_income` | required, ≥3 months | business registration **and** latest tax return |
| `sale_of_property` | required, ≥3 months | sale agreement **and** registration confirmation |
| `investment` | required, ≥3 months | broker statement **and** withdrawal confirmation |
| `crypto_assets` | **not required by default** | exchange statement **and** withdrawal history; address screening |
| `inheritance_gift` | required, ≥3 months | inheritance certificate **or** gift agreement |
| `loan` | required, ≥3 months | loan agreement |
| `dividends` | required, ≥3 months | profit-distribution decision |
| `savings` | required, 6–12 months | no additional file |

Every row also requires the customer's explanation in their own words. There
are no optional uploads hidden behind the table: members of a `one_of` group are
alternatives, not several required files. A reviewer can make a later,
case-specific request; that request appears on the order separately.

`crypto_assets` also carries:

```json
{
  "requiresAddressScreening": true
}
```

There is no wallet-control signature and no wallet screenshot. After funding,
Unigox derives the actual sender from the token contract's `Transfer` log and
runs Crystal against that address before compliance can approve the case.

`savings` has an empty `groups` array because its 6–12 month bank statement is
the whole documentary requirement. The longer window exists to show gradual
accumulation rather than one large credit immediately before the transfer.

`requiresExplanation` is served and is `true` for every category. The declaration
endpoint refuses an explanation under 20 characters.

Fields the endpoint deliberately does not return: `reviewChecks` (the compliance
team's own list of what to test a document against) and
`reviewerMayRequestStatement`. Only `code`, `label`, `description`,
`baseDocuments`, `groups`, `statement`, `requiresExplanation`,
`requiresBankStatement`, `requiresAddressScreening` and
`revision` are published.

### `revision`, and which number to send

Every category carries its own `revision`. The top-level `revision` is the
**highest among the categories in that response**, so it depends on what you
asked for. Today the whole catalogue answers `9` because `crypto_assets` is at
revision 9; salary is at 5 and the remaining categories carry their own values.

Send back the number that came with the category the customer actually picked,
as `catalogue_revision` on the declaration — not the top-level one, unless you
rendered a single-category response.

`catalogue_revision` is **recorded against the submission, not validated**. Its
purpose is that a rule edited after your customer answered does not
retroactively make their complete file incomplete, so an honest number is worth
sending and a wrong one is not caught for you.

## 3. Convert an order to scheduled settlement

```http
POST /api/v1/partner/settlement/orders
X-API-Key: <your key>
Content-Type: application/json
```

```json
{
  "order_id": "9939dad4-5bb8-4a0a-b110-c577aaf3bbba",
  "provider": "lightnet",
  "rail": "CNAPS",
  "minimum_fiat_amount": "64500.00",
  "capacity_id": 41,
  "capacity_revision": 7,
  "promised_settlement_sla_hours": 24,
  "terms_accepted": true,
  "terms_version": "t1-2026-08-22-v3",
  "terms_locale": "en",
  "terms_content_revision": 3,
  "terms_content": "<the complete localized wording you showed the customer>",
  "idempotency_key": "acme-order-88-attempt-1"
}
```

```json
{
  "success": true,
  "data": {
    "order_id": "9939dad4-5bb8-4a0a-b110-c577aaf3bbba",
    "trade_id": 2337,
    "status": "pending_approval",
    "stage": "awaiting_escrow_funding",
    "required_action": "fund_escrow",
    "settlement_class": "crypto_first",
    "fiat_currency": "CNY",
    "rail": "CNAPS",
    "provider": "lightnet",
    "financial_location": "customer_wallet",
    "cancellable": true,
    "contract_status": "pending_acceptance",
    "quote_id": "sq_8e02c1f4…",
    "quote_version": "settlement-quote-v1",
    "quoted_fiat_amount": "68000.00000000",
    "minimum_fiat_amount": "64500.00000000",
    "capacity_id": 41,
    "capacity_revision": 7,
    "promised_settlement_sla_hours": 24,
    "terms_version": "t1-2026-08-22-v3",
    "terms_locale": "en",
    "terms_content_revision": 3,
    "terms_content_hash": "9f2c…",
    "terms_content_snapshot": "<the wording, as we stored it>",
    "terms_accepted_at": "2026-08-23T14:31:06Z",
    "created_at": "2026-08-23T14:31:06Z",
    "updated_at": "2026-08-23T14:31:06Z"
  }
}
```

`order_id` is the partner order id you already hold — it is the only required
field in the JSON schema sense, and everything else is validated after it.

`provider` and `rail` are optional; omitting `provider` uses the corridor
default for the currency.

### `minimum_fiat_amount`, the customer's floor

This is the amount below which settlement stops and asks rather than paying. It
is validated, and the validation is stricter than "a positive number":

| Value | Result |
| --- | --- |
| not a decimal number | **422** `minimum_fiat_amount must be a decimal number, for example "170.00"` |
| zero or negative | **422** `minimum_fiat_amount must be greater than zero — a floor at or below zero can never be crossed, which turns the protection off` |
| above `quoted_fiat_amount` | **422** `minimum_fiat_amount (…) is above the quoted amount (…), so the order would stop for a re-quote immediately` |
| more than **25%** below the quote | **422** naming both numbers and the percentage |
| **omitted** | a floor is derived for you, at 75% of the quote |

The 25% bound exists to refuse values that cannot have been meant. A floor of
0.01 against a quote of 33.61 is not a slippage tolerance, it is a waiver: the
re-quote gate could never fire and a near-zero payout would be accepted as a
completed settlement.

Note the last row. **Omitting the floor is not the same as having no floor** —
it used to be, and that is exactly why omission now derives one.

### The corridor tuple

`capacity_id`, `capacity_revision` and `promised_settlement_sla_hours` are
required, and must come from the corridor row you read in step 1
(`capacity_id`, `revision`, `settlement_sla_hours`). Send any of them as zero or
absent and creation is **422**:

```
capacity_id, capacity_revision and promised_settlement_sla_hours are required
```

The reservation locks that exact revision. If an operator edits the corridor
between your read and this write, creation returns **409** `the corridor promise
changed after it was shown; fetch capacity and obtain acceptance again`.
Existing orders keep their stored SLA; later capacity edits never rewrite it.

### Consent, and why it is required

Creating this order commits somebody to waiting a day for their money, so the
call has to carry the record that they agreed, and the record has to name what
they were shown.

| Field | Required value |
| --- | --- |
| `terms_accepted` | `true`. Anything else is **422** `terms_accepted must be true: this order commits your customer to a next-day payout, and we record that they agreed` |
| `terms_version` | exactly `t1-2026-08-22-v3` today |
| `terms_content_revision` | exactly `3` today |
| `terms_locale` | one of `en`, `es`, `fr`, `pt` |
| `terms_content` | the complete localized wording, between 20 and 8192 characters |

A wrong `terms_version` or `terms_content_revision` is **422** `these
scheduled-settlement terms are no longer current; reload and review them again`.
A locale outside the four is **422** `terms_locale must be one of en, es, fr or
pt`. Content that is too short or too long is **422** `terms_content must
contain the complete localized wording shown to the customer`.

We store the locale, the content revision, the exact snapshot and its SHA-256
hash, alongside the version, the timestamp and **who asserted it** —
`partner:<your id>` when you send it, `customer:<id>` when the person ticked the
box on our own widget. Those are different weights of evidence and a dispute
will turn on which it was. All of it comes back on every read of the order.
Editing your own copy later cannot change an accepted order.

### Opening and declaring in one call

Send `declaration` on the create body — the same object `POST .../declaration`
takes — and the case opens already answered. One round trip instead of two.

> **Leave `documents` out of it on a first create.** The array attaches files we
> already hold on this order's compliance case, and that case does not exist
> until this call creates it, so there is nothing to reference yet and every
> entry would be refused. Upload the files after the order exists, and the
> upload alone records them — a second declaration is not needed.

**The two halves are reported independently, and this catches people out.** If
the declaration fails validation you get the declaration's error, with no
`data`, and the order is **still created**, with the capacity hold standing and
the case open and waiting. Losing a place in the corridor because an explanation
was a sentence too short would be the worse outcome.

So a failed create-with-declaration is not "nothing happened". Recover either
by repeating the whole create call with the declaration corrected — the order
half is idempotent and returns the existing order — or by fixing it with
`POST .../declaration` alone. Do not create a second order.

### When we ask for a source of funds at all

At **more than 10,000 USD**. At or below that the compliance case still exists —
it is the record of the decision not to ask, and a reviewer can still request
documents on it — but `required_action` is empty and your customer is asked for
nothing.

Do not build a flow that assumes every scheduled settlement has a
source-of-funds step. Read `required_action`.

Above **50,000 USD** the case additionally requires two named reviewers. That is
invisible to you except as a longer review.

### Status codes and errors

**201** returns the settlement order.

> **A repeated call for an order that already has a settlement plane returns
> 201 again, not 200.** The behaviour is right — the existing order comes back
> and no second capacity hold is taken — but the status code does not
> distinguish it from a first create. Compare `created_at`, or read the order
> first.

| Error | Code | Meaning |
| --- | --- | --- |
| **400** `order_id is required` | `INVALID_REQUEST` | no `order_id`, or an unparseable body |
| **404** `order not found` | `ORDER_NOT_FOUND` | the order id is not yours, does not exist, or is malformed — all three answer the same way |
| **422** | `INVALID_REQUEST` | `terms_accepted` not true; a BUY order; terms provenance; the corridor tuple; `minimum_fiat_amount` |
| **422** `this payout would be X CNY and lightnet cannot settle less than Y CNY` | `INVALID_REQUEST` | the payout is under the corridor's own minimum. The message names the floor, so your customer can send more |
| **409** `provider capacity is exhausted for this corridor and size` | `INVALID_STATUS` | no reservable inventory left for this size — **or** the ticket is above `max_ticket_usd`. The response does not distinguish them |
| **409** `provider capacity is unavailable for this corridor right now` | `INVALID_STATUS` | the corridor requires a live provider balance and does not have a fresh one. Retryable; it clears on our side |
| **409** `this corridor is not configured for crypto-first settlement` | `INVALID_STATUS` | no enabled corridor covers this currency and class, or you named a provider that has none. Not temporary |
| **409** `the corridor promise changed after it was shown; …` | `INVALID_STATUS` | the capacity row moved under you |
| **409** `this idempotency key already belongs to a different settlement order` | `INVALID_STATUS` | see [replays](#idempotency-replays-and-what-a-changed-payload-does) |
| **409** `this trade is not waiting for settlement funding, …` | `INVALID_STATUS` | the ordinary order is not at the pre-funding or untouched-funded conversion point |
| **409** `this trade's counterparty has already begun paying the fiat leg, …` | `INVALID_STATUS` | too late: converting would pay your customer twice |
| **503** `this order could not be priced in USD, so no settlement order was created; please retry shortly` | `INTERNAL_ERROR` | we hold no fresh rate for the asset. **Nothing was created and no capacity was held.** Retry |

The three capacity 409s are deliberately different sentences. Exhaustion passes
on its own, an unconfigured corridor does not, and an unavailable one clears
when a reporting agent comes back.

The 503 refuses rather than guessing a size because the USD figure is what the
source-of-funds and dual-approval thresholds are measured against.

## 4. Accept the exact quote

Creation returns the immutable quote tuple. Show it to your customer, then echo
it back unchanged. **Until this succeeds the order cannot settle**, and on our
own widget the funding controls stay closed and the funding clock stays dormant.

```http
POST /api/v1/partner/settlement/orders/{order_id}/quote-acceptance
X-API-Key: <your key>
Content-Type: application/json
```

```json
{
  "accept": true,
  "quote_id": "sq_8e02c1f4…",
  "quote_version": "settlement-quote-v1",
  "quoted_fiat_amount": "68000.00000000",
  "minimum_fiat_amount": "64500.00000000",
  "capacity_id": 41,
  "capacity_revision": 7,
  "promised_settlement_sla_hours": 24
}
```

**200** returns the settlement order, now with `contract_status: "accepted"` and
`quote_accepted_at` set.

This is a compare-and-set and an audit event in one transaction. Every displayed
value participates in the comparison, so accepting a stale response cannot
authorise a newer amount, floor, SLA or corridor revision. Amounts are compared
as decimals, so `"64500.00"` and `"64500.00000000"` are the same value.

| Error | Code | When |
| --- | --- | --- |
| **404** `order not found` | `ORDER_NOT_FOUND` | not your order |
| **422** `the exact scheduled-settlement quote must be accepted` | `INVALID_REQUEST` | unparseable body, or `accept` is not `true` |
| **409** `the quote or settlement window changed; fetch the order and obtain acceptance again` | `INVALID_STATUS` | any field does not match, or the order is not in a state where acceptance means anything |

Acceptance is only possible while the order is at `awaiting_escrow_funding` with
the money in `customer_wallet`, or at `compliance_review` /
`additional_information_required` with the money in `escrow`. Anywhere else is
the same 409.

## 5. Submit the declaration

```http
POST /api/v1/partner/settlement/orders/{order_id}/declaration
X-API-Key: <your key>
Content-Type: application/json
```

```json
{
  "source_of_funds": "crypto_assets",
  "explanation": "Sold BTC held since 2019 on a regulated exchange.",
  "source_wallet_address": "0x1111111111111111111111111111111111111111",
  "source_wallet_network": "ethereum",
  "catalogue_revision": 9,
  "documents": [
    {
      "document_type": "exchange_statement",
      "file_name": "kraken-2026-06.pdf",
      "storage_key": "978ad42e-8313-4fc3-91a9-b8bee0ed80cb",
      "content_type": "application/pdf",
      "size_bytes": 148213
    }
  ]
}
```

Exactly one `source_of_funds` is accepted on a new dossier. Historical frozen
multi-source cases remain readable, but an integration must not present or send
`additional_sources` for a new transfer.

**Copy the field names exactly.** The wallet fields are
`source_wallet_address` and `source_wallet_network` — not `wallet_address`.

| Field | Notes |
| --- | --- |
| `source_of_funds` | a `code` from the requirements catalogue |
| `explanation` | **required, at least 20 characters**, for every category |
| `source_wallet_address` | **required for `crypto_assets`**, and must be an EVM address |
| `source_wallet_network` | **required for `crypto_assets`**: `ethereum`, `xai`, `bsc`, `arbitrum` or `polygon` |
| `catalogue_revision` | recorded, not validated |
| `documents` | documents we already hold, attached by id — see below |
| `custody_authorization_signature` `custody_authorization_data` | optional; the customer authorising the eventual release into custody, signed with their wallet |

The two custody-authorization fields are accepted here and forwarded to the
escrow service, which holds signatures against the trade until there are enough
to execute. They are optional at the API level: without them the order and the
case work exactly as described, and the release simply cannot execute until an
authorization arrives. A failure to store one does not fail the declaration —
the answers are recorded either way.

**200** returns the settlement order.

> **It will usually look identical to the read you did before the call.** The
> declaration updates the compliance case, not the order: on a partner order at
> `compliance_review` neither `stage` nor `required_action` nor `updated_at`
> necessarily changes. The 200 is the confirmation. The only stage this call can
> move is `additional_information_required` → `compliance_review`, and it does
> that only once the whole dossier is complete.

Calling it again while the case is open **replaces** the answers and re-opens
the review. That is how you satisfy an information request: same endpoint, same
shape.

Resubmission has a consequence worth knowing. If a declared **fact** changes —
the categories, the wallet, the network — the wallet screening verdict and any
first approval are cleared. A crypto case will still be decided only after the
actual on-chain sender is captured and Crystal-screened; non-crypto case-level
screening and both approvals restart exactly as on a first submission. A cosmetic edit (a longer
explanation, a corrected typo) clears the first approval only, so that four eyes
still means two people who read the same file.

Text fields keep their previous value when an open dossier is resubmitted with
that field empty or omitted. A category change is material: it clears earlier
review work and freezes the newly selected category's contract.

### When it stops being accepted

A declaration is accepted while the order is at `awaiting_escrow_funding`,
`compliance_review` or `additional_information_required` — and not afterwards.
Past that, the answers cannot be read by anyone: the decision is taken, or the
money has moved. The refusal is **409** naming the stage.

This is separate from the case being decided. The two can disagree — an order
that reached `returned` through the payout path leaves its case undecided — and
both are refused.

### What this endpoint refuses

| Refusal | Status | Message |
| --- | --- | --- |
| no `source_of_funds`, or an unparseable body | **400** | `source_of_funds is required` |
| an unknown category | **409** | `"…" is not a source of funds this platform recognises` |
| an explanation under 20 characters | **409** | `tell us where the money came from in your own words — at least a sentence` |
| `crypto_assets` without a valid EVM address | **409** | `a crypto source of funds needs the EVM address of the wallet funding this transfer` |
| `crypto_assets` with an unsupported network | **409** | `the funding wallet network must be ethereum, xai, bsc, arbitrum or polygon` |
| `additional_sources` on a new or changed dossier | **409** | `exactly one source of funds can be declared on a transfer` |
| no compliance case on this order | **409** | `no compliance case for trade <n>` |
| the case is decided | **409** | `compliance case for trade <n> is already decided` |
| the order has moved past compliance | **409** | `trade <n> is in stage <stage>: a source-of-funds declaration can only be submitted while the order is still in compliance` |
| the case or the order moved while you were writing | **409** | `the dossier changed while it was being reviewed: nothing was recorded, review the new version` |
| the case is no longer collecting, or the order has no settlement plane | **409** | `the compliance dossier is no longer accepting customer information` |

All of these are states you can see, change and retry against. Every 409 here
carries `INVALID_STATUS`, including the ones that are really about the content
of your request — the message is what names the field. A **500** always means
something on our side, and re-sending the same body will not help.

**A decided case is closed for good.** Nothing you can send re-opens it; a new
order is needed.

### Attaching documents by reference

`documents[]` attaches files **this evidence store already holds for this
order**. `storage_key` is the `document_id` returned by
`POST /partner/settlement/orders/{order_id}/documents`.

> **It is not a pointer into storage of your own.** There is no object-store
> client in this service. `storage_key` must resolve to a document id on this
> same compliance case; `s3://your-bucket/statement.pdf` is refused. The
> tolerance that does exist is cosmetic: a leading store prefix is stripped, so
> `trades-db/<id>` and a bare `<id>` are the same reference.

Each entry needs a `document_type` and a `storage_key`. `content_type` and
`size_bytes` are still accepted so an existing integration keeps compiling, but
they are **advisory** — what gets recorded is read from the bytes we hold.

Because the upload endpoint needs the order's compliance case to exist, the
array is only usable **after** the order has been created. Uploading is
sufficient on its own: a file sent to `POST .../documents` is already on the
case, and re-declaring to reference it adds nothing. The array earns its place
when you are re-submitting a declaration and want the reviewer to see which
files the new answers rest on.

| Refusal | Status | Message |
| --- | --- | --- |
| blank `document_type` | **422** | `each document needs a document_type: a key from GET /partner/settlement/requirements` |
| blank `storage_key` | **422** | `each document needs a storage_key naming a document we already hold for this order — …` |
| `size_bytes` negative or over 15 MB | **422** | `size_bytes must be between 0 and 15 MB` |
| a `content_type` we do not accept | **415** | `"…" is not a document we can accept as evidence`, with `details.allowed` |
| the reference names nothing we hold for this case | **422** | `storage_key names no document we hold for this order: send the bytes to POST /partner/settlement/orders/{order_id}/documents first and reference the document_id it returns` |
| a `bank_statement` that is not a PDF | **415** | `a personal bank statement must be the bank-issued PDF, not a photograph or screenshot` |
| the case moved while evidence was attaching | **409** | `the compliance case moved while evidence was being attached; reload the order before trying again` |
| no compliance case | **404** | `no compliance case for this order` |

One answer covers "no such object", "somebody else's object" and "an object with
nothing in it" on purpose: a caller who could tell those apart could enumerate
another customer's evidence one reference at a time.

Re-attaching a reference to bytes already recorded on this case is treated as an
acknowledgement of the first write, not as new evidence. It does not reset
review work.

## 6. Upload a document

```http
POST /api/v1/partner/settlement/orders/{order_id}/documents
X-API-Key: <your key>
Content-Type: multipart/form-data
```

| Form field | |
| --- | --- |
| `file` | required — the document itself |
| `document_type` | required — a `key` from the requirements response |

Accepted formats: **PDF, JPEG, PNG, HEIC, HEIF, WebP, TIFF**, up to **15 MB**.
HEIC and HEIF are there because that is what an iPhone produces by default.
**`bank_statement` is the exception: it must be a PDF.** A photograph or a
screenshot of a statement is refused with **415**, and a non-PDF statement that
somehow reaches the case never counts as evidence.

There are no duplicate statement metadata fields. The API intentionally matches
the web form: send the bank-issued PDF and `document_type=bank_statement`. The
PDF itself must show the customer's name, bank, account number, dates including
the year, balance, and the required period. A compliance reviewer verifies those
facts from the PDF; the customer does not retype them into `period_start`,
`account_holder`, or similar fields.

```json
{
  "success": true,
  "data": {
    "document_id": "978ad42e-8313-4fc3-91a9-b8bee0ed80cb",
    "document_type": "bank_statement",
    "file_name": "statement-june.pdf",
    "size_bytes": 214113,
    "content_type": "application/pdf",
    "satisfies_requirement": true,
    "superseded_count": 1
  }
}
```

**201** on success. Three fields are worth reading rather than ignoring.

**`satisfies_requirement`** — whether the type you named is one the declared
sources actually need. An unrecognised `document_type` is still stored: the file
is evidence, and discarding evidence over a label is the worse failure. But you
get `false` plus an `expected_document_types` list, which is how you catch a
typo before your customer is asked twice.

> **The field is absent, not `false`, when nothing has been declared yet.**
> There is no requirement to match against, and a `false` would read as a
> rejection of a perfectly good file. Test for presence, not truth:
> `data.satisfies_requirement === false` and `!data.satisfies_requirement` are
> different questions and only the first is the one you mean.

**`expected_document_types`** appears only alongside `satisfies_requirement:
false`. It is the flat list of keys the selected category mentions — base
documents and every member of every group, sorted.

> **It is not a to-do list.** For `salary` it names all three alternatives even
> though only one branch of the `one_of` group is required. Use it to check a
> key; use `GET /partner/settlement/requirements` to
> decide what to ask for.

**`superseded_count`** — how many earlier documents of the same type this one
retired. A non-zero value means you replaced something rather than adding to it.
It is `0` for a document type that accepts multiple files (`payslips`), where
uploads accumulate.

Refusals:

| Status | Code | When |
| --- | --- | --- |
| **404** | `ORDER_NOT_FOUND` | no such order; another partner's order answers identically; an order that was never converted answers `no compliance case for this order` |
| **409** | `INVALID_STATUS` | `this case has already been decided and cannot take further documents`, or `this compliance case moved while the document was uploading; reload the order before trying again` |
| **413** | `INVALID_REQUEST` | `the file is larger than 15 MB` |
| **415** | `INVALID_REQUEST` | `"application/zip" is not a document we can accept as evidence`, with `details.allowed`; also a file whose own bytes contradict its declared type, and a `bank_statement` that is not a PDF |
| **422** | `INVALID_REQUEST` | `document_type is required: …`, `a file is required`, `the file is empty`, or a file under 512 bytes |

Two behaviours behind those refusals are worth knowing:

- **The bytes are inspected, not just the header.** A file renamed to `.pdf`
  is refused by its own contents, and the `content_type` we record is the one
  the bytes say — not the one you declared.
- **A missing `Content-Type` falls back to the file extension; a refused one
  does not.** Declaring `application/zip` on a file named `.pdf` is refused
  rather than silently reclassified.

### Crypto only: register the funding source

For `crypto_assets`, immediately before broadcasting the funding transaction,
register the same source address, network, chain and asset that were declared:

```http
POST /api/v1/partner/settlement/orders/{order_id}/funding-intent
X-API-Key: <your key>
Content-Type: application/json
```

```json
{
  "source_address": "0x1111111111111111111111111111111111111111",
  "source_network": "ethereum",
  "source_chain_id": 1,
  "asset": "USDT"
}
```

The backend requires these fields to match the current declaration and escrow
refund contract. A valid response includes
`funding_contract.source_constraint.intent_registered: true`. No signature or
wallet-control proof is accepted, and a declared address is not treated as a
screening subject. After the funds arrive, the actual token sender is captured
from the ERC-20 log and screened separately.

| Refusal | Status |
| --- | --- |
| missing or malformed source fields | **422** |
| source address/network/chain/asset does not match the contract | **409** |
| the persisted declaration/funding contract cannot be constructed | **500** `INTERNAL_ERROR` |
| order is no longer waiting for funding | **409** |

The intent is mandatory only when
`funding_contract.source_constraint.required` is `true` — currently the
`crypto_assets` category. For another source-of-funds category a matching
refund-wallet intent is accepted, but the transfer endpoints do not require it.
Use the returned flag rather than hardcoding that distinction.

For a scheduled order, both
`GET /partner/orders/{order_id}/transfer-authorization-parameters` and
`POST /partner/orders/{order_id}/authorize-crypto-transfer` repeat the server
gate. They answer **409** until quote acceptance, required uploads and the
funding intent are current. Calling the old transfer endpoint is not a
way around SoF.

`authorize-crypto-transfer` is single-flight per order. After one request owns
the submission, a concurrent call or replay cannot broadcast another
ForwardRequest. It returns **200** with
`status: "crypto_transfer_authorization_pending"`; `tx_hash` is omitted while
the first result is unresolved and is present once the accepted transactor id
has been stored. This replay guarantee is evaluated before the ordinary
pre-funding lifecycle gate: if the first call succeeded and on-chain processing
already advanced the order beyond `awaiting_crypto_transfer_authorization`, the
same request still returns **200** with the original pending state/hash rather
than a misleading **409**. It never submits a second ForwardRequest.

This distinction matters after a timeout. A timeout, connection loss, 5xx or a
malformed success response does **not** prove that the transactor rejected the
signed request. The server therefore keeps the order locked and reports
`crypto_transfer_authorization_pending` instead of returning a failure that
would invite a second broadcast. Poll the settlement order. Do not sign a new
nonce for the same order. Only a definitive pre-broadcast refusal (local
request validation or a transactor 4xx) releases the lock for a corrected
retry.

## 7. Read the order

```http
GET /api/v1/partner/settlement/orders/{order_id}
X-API-Key: <your key>
```

The read now carries the same SoF/funding projection the first-party web flow
uses:

- `funding_gate` is the server verdict. Use `can_fund`; when false,
  `blocked_reason` explains whether the hold, quote or opening evidence is
  missing.
- `funding_contract.source_constraint` shows the declared address/network and
  `intent_registered`. Its `screening_status` is always `not_required`: this
  object is registered intent, not an AML result. The authoritative Crystal
  result belongs to the actual post-funding sender and is visible only on the
  compliance admin plane.
- `compliance.requirements_snapshot` is the exact frozen `all_of`/`one_of`
  upload contract for this case, including `requires_explanation`.
- `compliance.documents_provided` lists current (not superseded) files;
  `documents_requested` lists later reviewer requests. This is how an API UI
  shows what is already done and what is newly required without reconstructing
  the dossier from upload history.

This projection is customer-safe. It never contains reviewer checks, internal
notes, reviewer identities or decision rationale.

```json
{
  "success": true,
  "data": {
    "order_id": "9939dad4-5bb8-4a0a-b110-c577aaf3bbba",
    "trade_id": 2337,
    "status": "completed",
    "stage": "completed",
    "required_action": null,
    "settlement_class": "crypto_first",
    "fiat_currency": "CNY",
    "rail": "CNAPS",
    "provider": "lightnet",
    "financial_location": "fiat_paid",
    "cancellable": false,
    "contract_status": "accepted",
    "quote_id": "sq_8e02c1f4…",
    "quote_version": "settlement-quote-v1",
    "quote_accepted_at": "2026-08-23T14:33:10Z",
    "quoted_fiat_amount": "68000.00000000",
    "minimum_fiat_amount": "64500.00000000",
    "final_fiat_amount": "67840.00000000",
    "capacity_id": 41,
    "capacity_revision": 7,
    "promised_settlement_sla_hours": 24,
    "estimated_completion_at": "2026-08-24T09:12:44Z",
    "payout_reference": "PAYOUT-REF-4471",
    "funding_gate": {
      "evaluated_at": "2026-08-24T08:57:31Z",
      "reservation_status": "consumed",
      "opening_evidence_status": "not_applicable",
      "opening_evidence_complete": false,
      "can_fund": false,
      "blocked_reason": "not_applicable"
    },
    "funding_contract": {
      "asset": "USDT",
      "amount": "10000",
      "decimals": 6,
      "token_address": "0x2222222222222222222222222222222222222222",
      "network": "ethereum",
      "chain_id": 1,
      "escrow_address": "0x3333333333333333333333333333333333333333",
      "refund_destination": "0x1111111111111111111111111111111111111111",
      "source_constraint": {
        "required": true,
        "address": "0x1111111111111111111111111111111111111111",
        "network": "ethereum",
        "chain_id": 1,
        "screening_status": "not_required",
        "intent_registered": true,
        "attribution": "registered_intent_only"
      }
    },
    "compliance": {
      "status": "approved",
      "declaration": {
        "source_of_funds": "crypto_assets",
        "explanation": "Sold BTC held since 2019 on a regulated exchange.",
        "wallet_address": "0x1111111111111111111111111111111111111111",
        "wallet_network": "ethereum"
      },
      "requirements_snapshot": {
        "catalogue_revisions": { "crypto_assets": 9 },
        "sources": ["crypto_assets"],
        "documents": [
          {
            "source_code": "crypto_assets",
            "mode": "all_of",
            "documents": ["exchange_statement", "withdrawal_history"]
          }
        ],
        "requires_statement": false,
        "statement_months": 0,
        "statement_max_months": 0,
        "statement_max_age_days": 0,
        "requires_explanation": true,
        "frozen_at": "2026-08-23T14:31:06Z"
      },
      "documents_provided": [
        { "document_type": "exchange_statement", "file_name": "exchange.pdf", "uploaded_at": "2026-08-23T14:35:00Z" },
        { "document_type": "withdrawal_history", "file_name": "withdrawals.pdf", "uploaded_at": "2026-08-23T14:36:00Z" }
      ]
    },
    "created_at": "2026-08-23T14:31:06Z",
    "updated_at": "2026-08-24T08:57:31Z"
  }
}
```

| Field | Present | Notes |
| --- | --- | --- |
| `order_id` | always | the id you sent — your partner order id |
| `trade_id` | always | our internal number for the same order. It is what our error messages and support tickets name |
| `status` `stage` `required_action` `financial_location` `cancellable` | always | see [the fields to integrate against](#the-fields-to-integrate-against) |
| `settlement_class` | always | `crypto_first` on this endpoint |
| `fiat_currency` | always | so you can render an amount **with its unit** |
| `provider` | always | the corridor's provider |
| `rail` | when set | the order's payout rail |
| `contract_status` | always | `pending_acceptance`, `accepted` or `legacy_missing` |
| `quote_id` `quote_version` | when set | identity of the exact opening quote |
| `quote_accepted_at` | after acceptance | absent means the order has not been authorised to settle |
| `quoted_fiat_amount` | after creation | what the customer was quoted |
| `minimum_fiat_amount` | after creation | the floor. Moves up to the accepted amount when a re-quote is accepted |
| `final_fiat_amount` | at `completed` / `returned` | what the provider reports was actually paid |
| `requote_fiat_amount` `requote_expires_at` | see §8 | **not cleared when a re-quote is declined** |
| `capacity_id` `capacity_revision` `promised_settlement_sla_hours` | after creation | the immutable corridor basis |
| `terms_version` `terms_locale` `terms_content_revision` `terms_content_hash` `terms_content_snapshot` `terms_accepted_at` | after creation | the immutable terms provenance |
| `estimated_completion_at` | from `ready_for_settlement` on | |
| `payout_reference` | from the payout on | the provider's payout id, for reconciling against a bank statement |
| `funding_gate` | always on GET | authoritative pre-funding verdict; it remains present and false after the order has moved on |
| `funding_contract` | always on GET | exact asset, amount, chain, escrow/refund addresses and registered-intent constraint |
| `compliance` | when the order has a case | customer-safe declaration, frozen requirements, current files and outstanding document requests |
| `reconciliation_pending_until` | see §9 | only on a cancellation taken before anything was sent |
| `created_at` `updated_at` | always | RFC 3339, UTC |

`contract_status` is rollout truth, not a workflow state. `legacy_missing` means
the order predates the terms-and-quote snapshot and no acceptance was invented
for it; such orders are moved to `manual_recovery` with
`required_action: contact_support` rather than being backfilled.

**Amounts are decimal strings and the scale is not the one you sent.** Fiat
amounts on the order are stored as `NUMERIC(30,8)`, so `"64500.00"` reads back
as `"64500.00000000"`. Parse them as decimals; never compare them as strings.

`estimated_completion_at` appears only once every gate has passed and the clock
has actually started — not at creation, and not while a reviewer is reading
documents. It is written once and never rewritten afterwards.

> **It is derived from `promised_settlement_sla_hours`.** When pre-clearance
> passes, the deadline is the moment of passing plus the window frozen on the
> order at acceptance — the number your customer consented to. An accepted
> re-quote changes the amount, never the window. Show your customer the date.
>
> This was not always true. It previously used the corridor's **current**
> `settlement_sla_hours`, falling back to a literal 24, and an accepted re-quote
> hard-coded 24 outright — so a corridor retuned from 12 hours to 72 while a
> case sat in review silently moved the deadline of an order sold at 12. Orders
> opened before the promise was recorded still fall back to the corridor.

**404** answers three different things the same way: no such order, another
partner's order, and — with the message `this order is not a crypto-first
settlement order` — an order of yours that was never converted.

Reading the order is also what reconciles it against the chain: this endpoint
advances an order past funding when the escrow has filled since anyone last
looked, so it never shows "send us your funds" to a customer who already has.

## 8. The re-quote gate

Twenty-four hours is long enough for a rate to move. Immediately after
compliance approves, pre-clearance re-reads the corridor and the rate. If the
projected payout would land **below** `minimum_fiat_amount`, the order stops at
`stage: requote_required` with `required_action: accept_requote` and carries the
new numbers:

```json
{
  "stage": "requote_required",
  "required_action": "accept_requote",
  "quoted_fiat_amount": "68000.00000000",
  "minimum_fiat_amount": "64500.00000000",
  "requote_fiat_amount": "63120.00000000",
  "requote_expires_at": "2026-08-24T09:38:05Z"
}
```

The offer is valid for **30 minutes**.

```http
POST /api/v1/partner/settlement/orders/{order_id}/requote/accept
POST /api/v1/partner/settlement/orders/{order_id}/requote/decline
X-API-Key: <your key>
```

Neither takes a body.

**Accepting** returns the order at `stage: provider_preclearance` with
`required_action: null`, the re-quote fields cleared, and the new amount as
**both** the quote and the new floor — so the same gate does not fire again
immediately.

It goes back through pre-clearance rather than straight to settlement, and the
reason is the window you just used: you have up to 30 minutes to answer a
re-quote, and the provider's ability to settle is precisely what can change in
that time — it is why the re-quote exists at all. Pre-clearance runs
immediately, so on a healthy corridor the next poll already shows
`ready_for_settlement` with `estimated_completion_at` set. If the corridor is
briefly short the order waits at `provider_preclearance` and is retried; your
crypto stays in escrow. Generic cancellation is already closed because final
compliance approval is the commitment boundary.

An older version of this page said accepting returned `ready_for_settlement`
directly. It did, and that skipped the one gate that asks whether the provider
can still pay.

**Declining** starts the refund and returns the order at `refund_processing`
with `cancellable: false`. The funds are still in escrow at that point, so it
always succeeds.

> **Do not detect a pending re-quote by the presence of `requote_fiat_amount`.**
> Declining leaves `requote_fiat_amount` and `requote_expires_at` populated on
> the refunding order. The fields that answer "is a re-quote pending" are
> `stage == "requote_required"` and `required_action == "accept_requote"`.

| Situation | Answer |
| --- | --- |
| no re-quote pending, either endpoint | **409** `trade <n> has no re-quote to accept` / `…to decline` |
| accepting an expired re-quote | **409** `the re-quote for trade <n> has expired`. The order stays at `requote_required` and is never silently settled at the worse number |
| **declining** an expired re-quote | **200**, and the refund starts |
| accepting the same re-quote twice | **409** — after the first accept there is no longer one pending |

The asymmetry on an expired offer is deliberate: the offer lapsing does not
un-ask the question, and a customer who comes back after the timer to say no
should get their refund rather than a lecture about timing.

### If the payout lands under the floor anyway

`minimum_fiat_amount` is checked twice: at pre-clearance, before the money
moves, which is what triggers the re-quote; and again against what the provider
actually paid.

If the second check fails **the order still completes**. The fiat has left, and
a system that denied a payout which happened would be worse than one that
records it. You will see `stage: completed` with a `final_fiat_amount` below the
minimum you sent, and an alert is raised on our side. That is a commercial
matter for us to make good, not a state your integration has to handle — but if
you reconcile amounts, this is the case where they differ.

## 9. Cancelling

```http
POST /api/v1/partner/settlement/orders/{order_id}/cancel
X-API-Key: <your key>
```

No body. Works while `cancellable` is `true` — only before final compliance
approval — and returns **200** with the order at `stage: refund_processing`. It
also releases the corridor hold, which is why it is not a synonym for the
ordinary off-ramp cancel.

What a cancellation does depends on where the money is:

| `financial_location` at cancel | What happens |
| --- | --- |
| `customer_wallet` | Nothing was sent, so nothing is refunded. This is a cancellation: the trade is marked cancelled and the order sits at `refund_processing` / `customer_wallet` |
| `escrow` | The escrow is refunded to the customer. The order reaches `refunded` / `crypto_refunded` |
| `custody` | **409** for a customer/partner cancel: final approval already committed the order. An operator recovery can still return technically refundable custody funds. |
| anything else | **409**, and nothing is queued |

The `customer_wallet` case has a tail you must handle. A cancellation can commit
while a funding transaction the customer already broadcast is still pending, and
that transaction can mine afterwards. When it does, the order stays at
`refund_processing` but its location becomes `escrow` so the ordinary refund
path can return the money. While that is still possible the order carries
`reconciliation_pending_until`, a server-owned deadline 30 minutes after the
cancellation. **Keep polling until it passes**: treating the cancellation as
final before then can leave you telling a customer their order was cancelled
while their crypto is sitting in a Safe.

Every refusal is **409** with `INVALID_STATUS`:

| Message | When |
| --- | --- |
| `trade <n> cannot be refunded automatically: the funds are in bridge_in_transit` | past the point of no return. The location in the message is the current `financial_location` |
| `trade <n> is already being refunded` | a refund is already running |
| `trade <n> has finished as completed and cannot be refunded` | the order is terminal (`completed` or `refunded`) |
| `trade <n> is not a crypto-first settlement order` | the order was never converted |
| `this transfer can no longer be cancelled` | final compliance approval already committed the transfer to payout preparation |

A `returned` order is refused by the first row, not the third: it is not
terminal, but its funds are in `fiat_returned`, which is not refundable by us.

> **`cancellable: false` means the endpoint refuses too.** The endpoint applies
> the same stage boundary as the response field before it asks whether the money
> is technically refundable. That prevents customer cancellation from racing
> provider pre-clearance, a re-quote decision, custody release or an operator
> working a recovery.
>
> It now returns **409** and names which of the two applies: a refund already
> under way, or an order our team is handling. If you need an order in manual
> recovery unwound, talk to us — there is usually a reason a person is already
> looking at it.

The refusal is the honest answer and it **queues nothing**. Recovery past the
point of no return is a conversation with the provider, and a refund request we
accepted and could never execute would stop you having it.

## Error catalogue

Every refusal on these endpoints uses the Partner API error object:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "trade 2337 cannot be refunded automatically: the funds are in bridge_in_transit"
  }
}
```

`error.code` is what your retry logic should switch on; `message` is written for
a human reading a log, and names the field or the state. `error.details` is
present only on a document refusal, carrying `allowed` — the list of formats.

There are five codes, and they are assigned **from the HTTP status**:

| Code | Statuses | Means | What to do |
| --- | --- | --- | --- |
| `UNAUTHORIZED` | 401, 403 | no credentials, or credentials that are not this partner's | fix the key; do not retry |
| `ORDER_NOT_FOUND` | 404 | no such order — including another partner's order and a malformed id. Also an unknown `source_of_funds`, and an order with no compliance case | read the order first |
| `INVALID_STATUS` | 409 | the order, the case or the corridor is in a state where this call means nothing. **Also carries the declaration's content refusals** | read the order and change what you send; an unchanged retry will not help |
| `INVALID_REQUEST` | 400, 413, 415, 422 | something about the request itself | the message names it |
| `INTERNAL_ERROR` | 500, 503 | ours | retry with backoff |

Two places where the code is less specific than the status:

- **The 409 / `INVALID_STATUS` pair also carries content refusals from the
  declaration** — an explanation that is too short, a category we do not know, a
  missing wallet address. Those are facts about your request, not about the
  order's state, and the code does not distinguish them. The message always
  names the problem.
- **The two guards on the ordinary off-ramp endpoints answer 409 with
  `INVALID_REQUEST`**, not `INVALID_STATUS` — see
  [above](#two-partner-endpoints-now-refuse-a-converted-order).

A **500** from any of these endpoints always means something on our side, and
re-sending the same body unchanged will not help. That case and a 409 used to be
conflated on the declaration endpoint, which put retry logic in a loop that
could never end; they are now distinct, and the distinction is the one to build
on.

## Idempotency, replays, and what a changed payload does

`idempotency_key` on order creation is optional. It is scoped to the order
server-side before it is stored, so the same key on a different order is a
different hold — a partner whose retry logic sends `"order-1"` for everything
cannot have the second order handed the first order's reservation.

What a repeat does:

| Repeat | Result |
| --- | --- |
| identical payload, order already has a settlement plane | **201** with the existing order. No second capacity hold. Compare `created_at` to tell it from a first create |
| identical payload, key already used on this order | the original reservation is returned; no new hold |
| **changed** payload on an order that already has a plane | **409** `this idempotency key already belongs to a different settlement order` |
| same key, capacity tuple now different from the hold | **409** `the corridor promise changed after it was shown; …` |

The 409 on a changed payload fires when any of the facts that opened the order
would be different: the provider, the fiat currency, the rail, the quoted
amount, the floor, the accepted rate, the terms acceptance (version, locale,
revision, content or who asserted it) or the promised corridor tuple. The
message names an idempotency key, but the comparison is against the **order**,
so it fires whether or not you sent a key.

A retry is also a repair, not just a rubber stamp. Opening an order writes three
things — the capacity hold, the order and the compliance case — and they are
three commits. A retry that finds an order with no compliance case creates the
case, and a retry that finds an order with no live capacity hold re-takes one.
That is why a retry has to carry the same values as the original: they are what
the missing rows need.

`POST .../documents` is not idempotent in the HTTP sense, but re-uploading the
same bytes under the same `document_type` is recognised as the same evidence
rather than stored twice.

## When the provider is short at pre-clearance

Pre-clearance is the last cheap moment. Between order creation and this point
sits the whole compliance review — hours, sometimes days — and a provider's
balance moves in that time.

The capacity hold does not answer whether the provider can still settle. A hold
is a claim on a ledger we keep; the provider's balance is a fact about their
money, and the two diverge exactly when it matters.

So pre-clearance re-checks, and if the provider cannot settle, the order **does
not advance**. It stays at `provider_preclearance` with the crypto still in
escrow and still technically refundable by operations. Refusing there is cheap;
releasing the crypto into custody for a payout that cannot be made is not.

There is no error for you to catch: the order simply sits. Read `stage`.

Pre-clearance is retried automatically while the order remains at
`provider_preclearance`. A short or stale provider balance therefore does not
require an operator to re-approve the dossier. The crypto remains in escrow,
but `cancellable` stays `false`: final approval was the customer's commitment
boundary. If operations determines the provider cannot fulfil the transfer,
the operator refund path remains available while the location is refundable.

If the capacity hold itself lapsed during the review, pre-clearance takes a
fresh one at the order's re-priced USD value rather than settling against
inventory nobody is holding.

## What to poll for, and what actually fires

Webhook coverage on this flow is **much coarser than the stage machine**, and
this section is the one to read before you decide how to drive your UI. Every
notification arrives as the `order.status.changed` event you already handle,
carrying `data.status` from the ordinary order enum. There is no
settlement-specific event and **no `stage` in the payload**.

A settlement stage only produces a webhook when it moves the underlying
**trade's** status. Most of them do not.

| Stage reached | `data.status` |
| --- | --- |
| `awaiting_escrow_funding` (order created) | *(nothing)* |
| `compliance_review` | *(nothing)* |
| `additional_information_required` | *(nothing)* |
| `provider_preclearance` | *(nothing)* |
| `requote_required` | *(nothing)* |
| `ready_for_settlement` | *(nothing)* |
| `custody_release` | `settlement_in_progress` |
| `provider_funding` | *(nothing — same trade status as the stage before)* |
| `provider_credit_confirmation` | *(nothing)* |
| `fiat_payout` | *(nothing)* |
| `completed` | `completed` |
| `returned` | `returned` |
| `fiat_payout` again, retried out of `returned` | `settlement_in_progress` |
| `refund_processing` | `cancelled` |
| `refunded` | `cancelled` |
| `manual_recovery` | `failed` |

Read three things off that table:

- **The compliance window notifies you at three points, and only three.**
  `fiat_payment_review_started` when the escrow is confirmed and review begins,
  then `settlement_in_progress` when the approval passes into pre-clearance and
  again when the release becomes due. Everything else in that window —
  an information request, a re-quote, and anything your customer must act on,
  including `accept_requote` and `submit_information` — is visible **only by
  polling** the settlement order. Build the poller first; treat webhooks as an
  accelerator, never as the thing your integration waits on.

  For a period these three fired for nobody: the notifier was wired to the
  stages and unreachable from every call site. If you built against an older
  copy of this page, verify you are receiving them before relying on them.
- **`settlement_in_progress` means the escrow is empty.** It fires once, at
  `custody_release`. On this flow that is the most misreadable moment in the
  whole lifecycle: the escrow has emptied and nobody has been paid.
- **Nothing fires between `custody_release` and the payout outcome.** Three
  stage changes pass silently. If you show progress through that window, poll.

Two properties of the delivery:

- **A single settlement transition can enqueue the same `order.status.changed`
  twice**, within a second, with two distinct `event_id`s — the trade-status
  write and the settlement plane each enqueue one. Deduplicate on
  `(order_id, status)` and make your handler idempotent; deduplicating on
  `event_id` alone will not catch it.
- A webhook that cannot be delivered is retried, and a lost notification is
  recovered by your polling. We will never delay a settlement because we could
  not notify you.

**A reasonable policy**: poll `GET /partner/settlement/orders/{order_id}` every
minute or two while `stage` is not `completed` or `refunded`, and immediately on
any `order.status.changed` for that order. Polling is not an optimisation on
this flow — for the whole compliance window it is the only signal there is.

All settlement-plane `GET` responses are live financial-state reads and carry
`Cache-Control: no-store, private, max-age=0` (plus the legacy `Pragma` and
`Expires` no-cache headers). Clients should still request them without a local
HTTP cache. Do not cache an `awaiting_escrow_funding` response: the escrow may
already have filled and the next read may legitimately report
`compliance_review`.

### The retry after a bank return, in detail

`stage` goes to `returned` with `financial_location: fiat_returned` and you get
`data.status: returned`. When operations re-send the payout, `stage` becomes
`fiat_payout` again with `financial_location: provider_book`, and you get
`data.status: settlement_in_progress` — the one place in this flow where that
value arrives **after** a `returned`, and the signal that the retry started.
Then `completed`. If the retry cannot be made, `stage` goes to
`manual_recovery` and you get `data.status: failed`.

Note the asymmetry with the ordinary path: reaching `fiat_payout` the first time
fires nothing, because the trade status is already `settlement_in_progress` and
does not change. Reaching it again out of `returned` does, because it does.

`final_fiat_amount` is populated at `returned` as well as at `completed`, and it
survives the retry.

## One source per transfer

The customer chooses the closest single category. New declarations with a
non-empty `additional_sources` are refused. If the explanation reveals a
materially different or mixed path, the reviewer requests clarification or a
new transfer rather than turning the customer form into several simultaneous
document packs.

Historical dossiers created under the earlier multi-source contract remain
readable and reviewable against their frozen snapshots. That backward
compatibility is not permission to send multi-source declarations now.

## Re-submitting a document

Uploading a document whose `document_type` you have sent before **retires** the
earlier ones rather than adding a second copy: the reviewer sees which file you
meant, and a requirement cannot stay satisfied by a document you replaced. The
old records are kept and marked, never deleted — evidence in a compliance file
is dated, not removed. `superseded_count` tells you it happened.

The exception is a document type that expects several files — `payslips`, with
`minFiles: 2` — where uploads accumulate instead.

Replacing a document after a reviewer has given the first of two approvals
clears that approval, so the second reviewer is deciding on the file that
actually exists. Screening is not cleared: it is about the person and the
wallet, and a new payslip tells it nothing new.

## A worked integration

A CNY off-ramp of 10,000 USDT for a customer whose funds came from selling
crypto.

**1 — Create the off-ramp, but do not fund it yet.** Quote and initiate as you
do today and wait for `next_action: authorize_crypto_transfer`. The settlement
plane and dossier must exist before that action is used.

**2 — Read the corridor.**

```http
GET /api/v1/partner/settlement/capacity?fiat_currency=CNY&rail=CNAPS
```

You keep `capacity_id: 41`, `revision: 7`, `settlement_sla_hours: 24`, and you
show your customer "your CNY arrives within 24 hours".

**3 — Read the requirements** for the category they picked.

```http
GET /api/v1/partner/settlement/requirements?source_of_funds=crypto_assets
```

`crypto_assets` at `revision: 9`: no bank statement, `requiresAddressScreening:
  true`, and an `all_of` group of two —
`exchange_statement` and `withdrawal_history`.

**4 — Convert, accept the terms, and declare, in one call.** The documents come
afterwards: there is no compliance case to upload against until this call has
created one.

```json
{
  "order_id": "9939dad4-5bb8-4a0a-b110-c577aaf3bbba",
  "provider": "lightnet",
  "rail": "CNAPS",
  "minimum_fiat_amount": "64500.00",
  "capacity_id": 41,
  "capacity_revision": 7,
  "promised_settlement_sla_hours": 24,
  "terms_accepted": true,
  "terms_version": "t1-2026-08-22-v3",
  "terms_locale": "en",
  "terms_content_revision": 3,
  "terms_content": "<the wording you showed them>",
  "idempotency_key": "acme-order-88-attempt-1",
  "declaration": {
    "source_of_funds": "crypto_assets",
    "explanation": "Sold BTC held since 2019 on a regulated exchange.",
    "source_wallet_address": "0x1111111111111111111111111111111111111111",
    "source_wallet_network": "ethereum",
    "catalogue_revision": 9
  }
}
```

**201**, with `quote_id`, `quoted_fiat_amount: "68000.00000000"` and
`contract_status: "pending_acceptance"`. The response says
`stage: awaiting_escrow_funding`, which is exactly where it remains until the
server-approved funding step below.

**5 — Accept the quote.** Show the amount, the floor and the 24-hour window,
then echo the tuple to `POST .../quote-acceptance`. **200**, and
`contract_status` becomes `accepted`.

**6 — Upload the two files**, one call each:

```http
POST /api/v1/partner/settlement/orders/{order_id}/documents
X-API-Key: <your key>
Content-Type: multipart/form-data
```

with the parts `file` and `document_type=exchange_statement`, then
`withdrawal_history`. Each returns **201** with `satisfies_requirement: true`,
because the declaration is already on file. Do not upload a wallet screenshot.

**7 — Register the funding source.** Send the declared `source_address`,
`source_network`, `source_chain_id` and `asset` to `.../funding-intent`
immediately before broadcast. Wait for `intent_registered: true`. There is no
signature challenge.

**8 — Fund the escrow.** Now request
`transfer-authorization-parameters`, sign, and call
`authorize-crypto-transfer`. The endpoint repeats the dossier and funding-intent
gate immediately before submitting the transaction. Treat
`crypto_transfer_authorization_pending` as an accepted asynchronous state even
when `tx_hash` is absent: another request may already be resolving or the
transactor response may have been lost. Poll the order and never create a
second signed nonce for that order. A replay remains **200 pending** even if the
first accepted submission has already moved the order into its next lifecycle
stage.

**9 — Read the order.** Once the chain funding is observed it reports
`stage: compliance_review`, `financial_location: escrow`, and
`required_action: null` — the dossier is complete, so nothing is being asked of
your customer. Internally Unigox stores the incoming ERC-20 `Transfer` sender,
compares it with the declaration and requires a completed Crystal result for
every actual sender before compliance can approve.

**10 — Wait, and poll.** No webhook arrives during the review. Your poller sees
`compliance_review` for some hours, then `provider_preclearance`, then
`ready_for_settlement` with `estimated_completion_at` set. You show your
customer that date. Nothing so far has notified you of anything.

**11 — Watch the physical point of no return.** Your first webhook of the whole
order arrives: `settlement_in_progress`. The order reads `custody_release` /
`custody`; `cancellable` has already been `false` since final approval. Lightnet
is a prefunded-float corridor, so on the next poll it is `provider_funding` /
`provider_book`. (A separately configured bridge corridor would report
`bridge_in_transit`.) Your UI still says "in progress", not "complete".

**12 — Nothing fires for a while.** Three stage changes pass silently; your
poller walks the order through `provider_credit_confirmation` and `fiat_payout`.

**13 — Done.** A `completed` webhook. The order reads `stage: completed`,
`financial_location: fiat_paid`, `final_fiat_amount: "67840.00000000"`,
`payout_reference: "PAYOUT-REF-4471"`. That reference is what reconciles against
your customer's bank statement.

**If it had gone the other way** at step 10 — the rate moving 8% against the
customer — your poll would have found the order at `requote_required` with
`required_action: accept_requote` and a `requote_fiat_amount` valid for 30
minutes, with **no webhook to tell you**. That 30-minute window is the reason
the poll interval matters. Your customer says no; you
`POST .../requote/decline`; the order goes to `refund_processing` with the
crypto still in escrow, and reaches `refunded` / `crypto_refunded`.

## The customer-authenticated plane

Unigox's own widget and app drive the same orders through a parallel surface
under `/api/v1/settlement/…`, authenticated with the **end customer's** session
token rather than a partner API key. It is listed here so the two are not
mistaken for one another — a partner API key cannot call it, and it uses the
platform's `{"success", "data", "error"}` envelope rather than the Partner API
error object.

| Method and path | What it does |
| --- | --- |
| `GET /api/v1/settlement/capacity` | the same corridor answer as the partner endpoint, field for field |
| `GET /api/v1/settlement/requirements` | the same source-of-funds catalogue |
| `POST /api/v1/settlement/orders` | opens an order from an existing `trade_id` **or** from a `ticket` when no liquidity matched and there is no trade yet |
| `GET /api/v1/settlement/orders` | the customer's own settlement orders, as a small summary |
| `GET /api/v1/settlement/orders/{trade_id}` | the order plus `funding_gate`, `funding_contract`, `custody_authorization` and the `compliance` case |
| `POST /api/v1/settlement/orders/{trade_id}/quote-acceptance` | the same compare-and-set as the partner endpoint |
| `POST /api/v1/settlement/orders/{trade_id}/funding-intent` | registers the exact wallet, network, chain and asset immediately before the customer's wallet broadcasts |
| `POST /api/v1/settlement/orders/{trade_id}/declaration` | identical body and effect to the partner declaration |
| `POST /api/v1/settlement/orders/{trade_id}/documents` | identical multipart upload |
| `POST /api/v1/settlement/orders/{trade_id}/requote` | one endpoint with `{"accept": true\|false}` rather than two paths |
| `POST /api/v1/settlement/orders/{trade_id}/cancel` | the same cancellation, with the same refusals |
| `POST /api/v1/settlement/orders/{trade_id}/escrow-refund-signature` | the settlement counterparty's second Safe signature, which is what makes an escrow-stage refund automatic |

Orders are addressed by `trade_id` here, which is the same `trade_id` the
partner order reports. Ownership is checked against the trade's initiator, and
an order that is not the caller's answers **404** rather than 403 — a 403 would
confirm that somebody else's order exists.

## What we ask of you

- Do not show "complete" while `stage` is `custody_release`, `provider_funding`,
  `provider_credit_confirmation` or `fiat_payout`. The customer has not been
  paid.
- Do not offer cancel when `cancellable` is `false`.
- Do surface `required_action` — it is the only field that says the order is
  waiting on your customer rather than on us.
- Send `minimum_fiat_amount`. It is what turns a day-long settlement from a bet
  into a bounded one.
- Build your customer-facing wording on `stage`, not on `status`, and keep a
  default branch for a stage you have not seen. The stage list grows; the status
  list is deliberately frozen.
