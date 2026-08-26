# Changelog

Notable changes to the Unigox partner API, newest first.

## 2026-08-26 (Settlement T+1 cancellation: the complete refusal contract)

- The cancel section listed five refusals and said every one of them is **409
  `INVALID_STATUS`**. Neither half was true any more. The refund path also
  refuses when the provider has already been funded, when a bridge capability
  minted for the order is unspent, and when a provider funding attempt holds a
  short lease on it — and when we cannot READ whether the crypto is already
  moving, it answers **503**, not 409.
- Every refusal now carries whether it is worth retrying, because two of them
  are and a partner treating all of them as terminal gets both wrong. A funding
  lease clears by itself and names the timestamp it expires at. An unspent
  bridge capability needs one of our operators, not a retry. The 503 is a fact
  about us and should be retried with backoff.
- `openapi/swagger.yaml` declares the `503` on the cancel operation, which it
  did not, and says which of its responses mean the cancellation did NOT happen.
  A **500** after the cancellation committed is the exception: the cancel stands
  and only the response body failed, so re-read the order rather than retrying.

## 2026-08-26 (complete Settlement T+1 OpenAPI contract)

- `openapi/swagger.yaml` now describes all eleven registered Partner API
  Settlement T+1 routes. Capacity, order conversion, exact quote acceptance,
  both re-quote decisions and cancellation were previously present in the
  implementation and long-form guide but missing from the generated reference.
- The specification now carries the complete order, capacity, quote,
  source-of-funds, funding-gate and funding-contract schemas, including nullable
  money fields, the nine-category SoF enum, the final-approval cancellation
  boundary and every documented upload status.
- Shared order documentation now includes the implementation's
  `settlement_in_progress` and `returned` statuses. It no longer advertises a
  `cancel` action while crypto-transfer authorization may already be on chain.
- New declarations remain exactly one of the nine current categories. The
  request schema also preserves the implementation's narrow compatibility path:
  an existing frozen legacy dossier may replay its unchanged retired or
  multi-source values, but cannot introduce them on a new or changed case.
- `funding-intent` is required for `crypto_assets`. A matching intent is accepted
  for another SoF category but is not a funding prerequisite; it is registered
  intent only, never wallet attribution or a Crystal result.

## 2026-08-25 (source-of-funds parity and actual-funder screening)

**The Partner API, first-party web flow and compliance console now use one
source-of-funds contract. This entry supersedes the incorrect 2026-08-24 entry
and the older SoF-specific claims about twelve/multiple categories, manual
statement fields and fund-before-convert ordering below.**

- There are exactly nine selectable categories and exactly one may be declared
  per transfer. `requiresExplanation: true` is public and applies to every one.
- A personal bank-issued PDF is required for eight categories. It covers at
  least three months and ends within 31 days; `savings` asks for 6–12 months.
  The PDF itself carries the account holder, institution, account number, dated
  period and balance. The API no longer asks the customer to retype those facts.
- `crypto_assets` is the exception: the bank statement is not required by
  default. It requires exactly two uploads — `exchange_statement` and
  `withdrawal_history` — plus address screening. A reviewer can request a bank statement later when the declared path
  actually includes the customer's bank account.
- Wallet-control signatures are not part of the policy. `funding-intent` records
  the declared address/network/chain/asset immediately before broadcast. Once
  the Safe is funded, Unigox reads the ERC-20 `Transfer` log, stores the actual
  sender and screens that address through Crystal. A declared clean address
  cannot clear a transfer that arrived from a different or unscored address.
- Scheduled settlement now opens before funding. The existing transfer
  parameter and authorization endpoints fail with **409** until quote
  acceptance, the required dossier and (for crypto) the registered funding intent
  are current. This closes the former API ordering contradiction where the
  escrow had to be funded before the order and its funding intent could exist.
- `GET /partner/settlement/orders/{order_id}` now returns the same customer-safe
  `funding_gate`, `funding_contract` and `compliance` projection used by the web
  flow. Integrations can see the frozen upload groups, current files, later
  reviewer requests and funding-intent status instead of guessing from prior
  responses.
- `one_of` is an alternative (salary and inheritance/gift); `all_of` requires
  every listed item. `payslips` requires 2–3 files. Uploads remain multipart
  `file` + `document_type`, 15 MB maximum; bank statements are PDF-only.

The crypto rule and whole-catalogue revision are now **9**; salary is **5**.

## 2026-08-24 (superseded: source of funds statement policy)

**Behaviour change, and it will make some previously-approvable crypto cases wait for one more
document.** The source-of-funds catalogue now matches the compliance policy one to one.

- **`crypto_assets` requires the personal bank statement.** It was the one category exempt from it. The
  exemption also removed the three statement checks — the account being in the client's name among them —
  so a crypto case was decided without them. Exchange evidence and proof of wallet control are still
  required, now **in addition** to the statement rather than instead of it. `requiresBankStatement` on
  that category is `true`, it carries a `statement` block of `{"minMonths": 3, "maxAgeDays": 31}`, and its
  revision moved to 4. An integration that branches on `requiresBankStatement` picks this up with no
  change; one that hardcoded the exemption must stop.
- **`family_support` asks for a gift agreement.** Money from a relative is a gift under the policy, and
  the category previously carried no document requirement of its own — the same fact needed a deed under
  `gift` and nothing under `family_support`. Revision 4.
- **`payslips` now really accepts three files.** `minFiles: 2, maxFiles: 3` shipped in the salary rule
  months ago but never reached the served catalogue, because the rule reconciler overwrites only on a
  strictly higher revision and the revision had not moved. The served copy said `multiple: true` alone,
  which clients read as a maximum of two. Salary is now revision 5.
- **The statement's own fields are documented as what they are.** `period_start`, `period_end`,
  `account_holder`, `institution` and `account_last4` are optional at upload and required to approve a
  statement; `account_last4` is exactly four characters; `bank_statement` must be a PDF. None of this
  changed in the code — the reference simply did not say it, and an integration that omitted the fields
  produced cases that could not be approved with nothing at upload time to explain why.

## 2026-08-23 (scheduled settlement: what the reference got wrong)

**No API change. Eight things the scheduled-settlement reference told you that the API does not do.**
Each was found by reading the implementation back against the page, and each is the kind of mistake you
only pay for once you are live, so we are naming them rather than quietly editing.

- **The compliance window used to fire no webhooks at all — it does now.** For a period, the page
  described events that were never sent. `fiat_payment_review_started` and `settlement_in_progress` were
  wired to the five stages between order creation and the custody release, and the code that emitted them
  could not be reached from any caller: a settlement stage only notified you when it moved the underlying
  trade's status, and none of those five do. If you built an integration that waited for
  `fiat_payment_review_started`, it was waiting for an event that was never sent.

  **This is fixed.** `fiat_payment_review_started` now arrives when the escrow is confirmed and review
  begins, and `settlement_in_progress` when the approval passes into pre-clearance and again when the
  release becomes due. The rest is unchanged: `settlement_in_progress` at `custody_release`, then
  `completed`, `returned`, `cancelled` (`refund_processing` and `refunded`) or `failed`
  (`manual_recovery`), plus a second `settlement_in_progress` if a returned payout is retried.

  **A re-quote still has no notification of its own.** It has a 30-minute window and is reachable only by
  polling `GET /partner/settlement/orders/{order_id}`. Poll it.
- **`storage_key` on a declaration's `documents` is not a pointer into your own storage.** It is the
  `document_id` returned by `POST /partner/settlement/orders/{order_id}/documents` — a file this
  evidence store already holds for this order. There is no object-store client in this service, so
  `s3://your-bucket/statement.pdf` is refused with **422**. Earlier entries on this page described the
  by-reference route as reading storage of your own; that has not been true since the upload endpoint
  shipped. Documents also cannot be attached on the create call: the compliance case they hang off does
  not exist until that call creates it.
- **Fund the escrow before you convert, not after.** Conversion is allowed from exactly one trade state
  — escrow funded, no fiat leg begun. Converting earlier is **409** `this trade's escrow does not hold
  the customer's crypto, so there is nothing to settle`. The create response nevertheless comes back at
  `stage: awaiting_escrow_funding` with `required_action: fund_escrow`; the next read of the order
  returns `compliance_review`. Do not drive a funding screen off the create response.
- **A written explanation is required for every source of funds**, not just `other` and
  `family_support`, and it must be at least 20 characters. All twelve catalogue categories require one.
  The requirements response does not tell you this — the flag that carries it is not published — so ask
  for it always.
- **`crypto_assets` needs an EVM address and a supported network.** `source_wallet_address` must parse
  as an EVM address, and `source_wallet_network` must be `ethereum`, `xai`, `bsc`, `arbitrum` or
  `polygon`. Anything else is refused rather than producing an order that becomes unfundable later.
- **Omitting `minimum_fiat_amount` no longer means "no floor".** One is derived for you at 75% of the
  quote. A floor you send that is more than 25% below the quote is refused with **422**: that is not a
  slippage tolerance, it is a waiver, and it would switch off both the re-quote gate and the completion
  check.
- **`additional_sources` is replaced on every declaration.** Omitting it, or sending `[]`, **removes**
  the secondary categories — unlike the text fields, which keep their previous value when omitted.
  Always send the complete list.
- **`estimated_completion_at` now uses the window your customer was promised.** It is written once, when
  pre-clearance passes, as that moment plus `promised_settlement_sla_hours` — the figure frozen on the
  order at acceptance. It previously used the corridor's *current* SLA hours, falling back to a literal
  24, and an accepted re-quote hard-coded 24 regardless: so a corridor retuned from 12 to 72 hours while
  a case sat in review silently moved the deadline of an order whose customer had agreed to 12. Orders
  opened before the promise was recorded still fall back to the corridor, which is the best answer
  available for them.

Two smaller notes on the same page. The capacity response carries **`revision`** — that is the value you
send back as `capacity_revision`, and the earlier example did not show it. And the source-of-funds
catalogue is now at **revision 4**: `salary` and `inheritance` are at 4, the other ten at 3, and the
top-level `revision` is the highest among the categories in the response you asked for.

One behaviour worth planning around rather than a correction: **a single settlement transition can
enqueue the same `order.status.changed` twice**, within a second, with two distinct `event_id`s.
Deduplicate on `(order_id, status)`; `event_id` alone will not catch it.

The reference has been rewritten around the two axes the feature actually turns on — `stage` and
`financial_location` — with the point of no return, the full transition table, and a worked integration.
See [Scheduled settlement](./api-reference/settlement-t1.md).

## 2026-08-22 (immutable settlement contract)

**Breaking: scheduled-settlement creation now binds the corridor and full terms provenance.** Send
`capacity_id`, `capacity_revision` and `promised_settlement_sla_hours` from the capacity response, plus
`terms_locale`, `terms_content_revision: 3` and the exact localized `terms_content` with
`terms_version: "t1-2026-08-22-v3"`. A corridor edit after consent returns 409 instead of silently
changing the customer's promised window.

**New mandatory pre-funding step:** show the exact quote returned by order creation and call
`POST /partner/settlement/orders/{order_id}/quote-acceptance`, echoing its id, version, amount, floor,
capacity row ID, revision and promised SLA. Funding remains closed and its short countdown remains dormant
until that atomic acceptance/audit write succeeds.

## 2026-08-21 (corrections to what we told you)

**No API change. Four things the scheduled-settlement reference said that the
API does not do.** Each one is the kind of mistake you only find by writing the
integration, so we are naming them rather than quietly editing the page.

- **A repeated `POST /partner/settlement/orders` returns 201, not 200.** The
  behaviour is right — the existing order comes back and no second capacity hold
  is taken — but the status code does not distinguish it from a first create.
  If you branched on 200-versus-201 to decide whether you had just created
  something, that branch has always been wrong. Compare `created_at`.
- **Submitting the declaration does not move `stage`.** The reference said the
  response comes back at `compliance_review`. On the partner flow the order is
  usually still at `awaiting_escrow_funding` when you declare, and it stays
  there — the declaration updates the compliance case, not the order. The
  response is identical to the read before the call, `updated_at` included. The
  200 is the confirmation.
- **The re-quote amounts are not cleared when a re-quote is declined.**
  `requote_fiat_amount` and `requote_expires_at` stay populated on the refunding
  order. Detect a pending re-quote with `stage == "requote_required"` or
  `required_action == "accept_requote"`, never with the presence of those
  fields.
- **`expected_document_types` is a union, not a checklist.** It flattens every
  key the declared categories mention, including all members of a `one_of`
  group. A customer declaring salary and crypto assets needs four documents and
  the list names six. Use it to check a key; use
  `GET /settlement/requirements` to decide what to ask for.

The reference now also documents what the order webhooks actually cover, which
is less than the stage machine: `fiat_payment_review_started` fires for
compliance review, for an information request **and** for a re-quote, so fetch
the settlement order and read `required_action` on every one. Three stage
changes between the escrow emptying and the payout fire nothing at all. See
[What to poll for](./api-reference/settlement-t1.md#8-what-to-poll-for-and-what-actually-fires).

## 2026-08-21 (opening an order)

**Breaking, on one endpoint: `POST /partner/settlement/orders` now requires `terms_accepted`.**

Creating a scheduled-settlement order commits your customer to waiting until the next day for their
money. Send `"terms_accepted": true` and `"terms_version"` naming the wording you showed them; we store
both, with the fact that it was **you** who asserted it rather than the customer themselves. Without it
the call returns **422**. There is no default: a record of consent that we invented is not a record.

**You can now open the order and submit the declaration in one call.** Pass the whole declaration —
including `documents` by reference — as `declaration` on the create body:

```json
{
  "order_id": "3022332b-…",
  "minimum_fiat_amount": "330000.00",
  "terms_accepted": true,
  "terms_version": "t1-2026-08",
  "declaration": {
    "source_of_funds": "salary",
    "explanation": "…",
    "funds_flow_description": "…",
    "catalogue_revision": 2
  }
}
```

The order is created, the capacity hold taken and the compliance case opened **already answered** — one
round trip instead of three, and your customer is asked once. The separate
`POST .../declaration` endpoint still works exactly as before, for the case where the answers arrive
later or need correcting.

If the declaration is rejected the order is still created: you get the validation error, the hold
stands, and the case waits for answers. That pair of facts is the honest one — losing the hold because
a free-text field was too short would cost your customer their place in the corridor.

## 2026-08-21 (validation)

**`minimum_fiat_amount` is now checked.** It is the floor that bounds a day-long settlement, and it
was taken on trust: `"-999"` was accepted and stored, which is a floor that can never be crossed — the
protection silently switched off, and the order would have settled at whatever the rate became. A value
that is not a number, is zero or below, or is **above** the quoted amount now returns **422** with the
reason. If you have been sending a placeholder, this is the release where it starts failing loudly.

**Documents sent by reference are validated like uploaded ones.** The `documents` array on the
declaration accepted anything: a `text/html` "statement", a negative `size_bytes`, and an empty object
that stored an untitled, unlocated file. Each entry now needs a `document_type` and a `storage_key`,
a `size_bytes` within 0–15 MB, and — when you declare one — a `content_type` from the same list the
upload route accepts. All refusals are **422**, except an unacceptable content type which is **415**.

**Two more doors now refuse a scheduled-settlement order**, for the same reason the cancel door did:
they acted on the trade while the settlement plane carried on describing money that had moved.
`POST /api/v1/trade/{id}/cancel` and `POST /api/v1/trade/{id}/resolve-escrow` answer **409** and name
the settlement lifecycle. If your customer-facing app calls either on a converted order, switch it to
`POST /partner/settlement/orders/{order_id}/cancel`.

**An order cannot be recorded as paid unless the crypto actually left escrow**, and a refund cannot be
recorded unless one was started. These were reachable through the operator resolution path and produced
a finished, paid-looking order — reported to you as `completed` — with the customer's crypto untouched.

## 2026-08-21 (refusals)

**Four refusals that were wrong, on scheduled settlement.**

- `POST .../requote/decline` used to answer **200** and start a refund even when no re-quote had ever
  been issued — on an order still waiting for its escrow, or mid-compliance. Its sibling
  `requote/accept` refused the same request. Decline now returns **409** unless a re-quote is
  genuinely pending. An EXPIRED re-quote can still be declined: the offer lapsing does not un-ask the
  question.
- `POST /partner/orders/{order_id}/cancel` — the ordinary off-ramp cancel — used to cancel the TRADE
  of a scheduled-settlement order while the settlement plane went on reporting `awaiting_escrow_funding`
  with the capacity hold still standing. It now returns **409** and names
  `POST /partner/settlement/orders/{order_id}/cancel`, which releases the hold and refuses when the
  funds are no longer ours to return.
- A malformed `order_id` returned **500** on order creation. It is a **404**, like every other endpoint.
- `error.code` on the settlement endpoints was `INVALID_REQUEST` for every refusal, whatever the
  status. It now carries `UNAUTHORIZED`, `ORDER_NOT_FOUND`, `INVALID_STATUS` or `INVALID_REQUEST` as
  appropriate — so "not found" and "already decided" are distinguishable without parsing English.

**One field is no longer returned.** `GET /settlement/requirements` no longer includes
`reviewChecks` on a category. It was our compliance team's internal list of what to test each document
against, written for a reviewer; published it reads as a guide to passing the check. Everything a
partner renders — `baseDocuments`, `groups`, `statement`, labels, `revision` — is unchanged.

## 2026-08-21 (documents)

**You can now send us the document itself.**
`POST /api/v1/partner/settlement/orders/{order_id}/documents` takes a multipart
`file` plus a `document_type`, up to 15 MB, in PDF, JPEG, PNG, HEIC, HEIF, WebP
or TIFF. Until now the declaration accepted documents only **by reference** — a
`storage_key` pointing at storage of your own — which assumed every integrator
had a bucket we could read. Most have a browser upload and nowhere to put it.

The response answers the question you actually have: `satisfies_requirement`
tells you whether the type you named is one the declared sources need, and when
it is not, `expected_document_types` lists what the case is waiting for. An
unrecognised type is still stored — evidence is not discarded over a label — so
this is a signal, not a refusal. The field is absent rather than `false` before
anything has been declared.

`superseded_count` says how many earlier documents of the same type this upload
retired, so a re-upload cannot be mistaken for a second copy.

Refusals are specific: 409 when the case is already decided, 413 over the size
limit, 415 for a file that is not a document (with `details.allowed`), 422 for a
missing field or an empty file. Another partner's order is a 404, exactly like an
order that does not exist.

## 2026-08-21 (later the same day)

**Three corrections to scheduled settlement, each of which replaces a silent
outcome with a stated one.**

- **Inheritance asks for ONE document, not two.** A certificate of the right to
  inherit and a grant of probate are the same fact under two legal traditions,
  and most jurisdictions issue one and have no concept of the other. `GET
  /partner/settlement/requirements` now returns them as a `one_of` group at
  `revision: 3`. Nothing changes if you render requirement groups by their
  `mode`; if you flattened them into a list of mandatory uploads, this is the
  category that could not be satisfied.
- **`cancellable` is `false` while a refund is already running.** It stayed
  `true` at `refund_processing`, and the cancel it invited answered
  `{"success": true}` and did nothing. That call now returns **409** with the
  reason, as does a cancel on a finished order. `manual_recovery` also reports
  `false`: what happens there happens by hand.
- **`required_action` is `submit_information` from the moment the escrow is
  funded**, instead of `null` until a reviewer asks for something. The
  declaration was always what compliance was waiting for; the field said nothing
  was needed. If you gate your customer's "where did this money come from" screen
  on `required_action`, it now appears when it should.

## 2026-08-21

**Scheduled settlement: a customer may now declare several sources of funds.** Put the main one in
`source_of_funds` and the rest in `additional_sources` (at most three in total). Requirements combine as
the strictest reading — the union of the documents, the longest statement window and the shortest
allowed age — so a customer declaring salary alongside savings is asked for savings' six months rather
than salary's three.

Three further changes to the same endpoint, all of which make a previously silent outcome explicit:

- The requirements response now carries `baseDocuments`, so every `document_type` key you need — the
  bank statement in particular — is obtainable from the catalogue rather than assumed.
- The declaration refuses, with the reason, an unknown category, `other`/`family_support` without a
  written explanation, `crypto_assets` without the funding wallet address, and more than three sources.
  All are **409**; a **500** from this endpoint now always means something on our side.
- Re-uploading a document of a type you have already sent RETIRES the earlier one instead of adding a
  second copy.

## 2026-08-20

**Scheduled settlement (Settlement T+1) is available for large off-ramps.** An
off-ramp order can now be converted to a settlement class where the escrow is
released into Unigox custody first and the fiat payout follows inside a
published window — which is how a corridor takes a ticket larger than any
provider will settle instantly. See
[Scheduled settlement](./api-reference/settlement-t1.md).

- Convert an existing order with `POST /api/v1/partner/settlement/orders`. It
  takes a capacity hold and opens the source-of-funds compliance case.
- Read what a corridor will accept right now with
  `GET /api/v1/partner/settlement/capacity`, and what documents each source of
  funds needs with `GET /api/v1/partner/settlement/requirements`.
- Submit the declaration and documents (by storage reference) with
  `POST /api/v1/partner/settlement/orders/{order_id}/declaration`.
- Poll `GET /api/v1/partner/settlement/orders/{order_id}` for `stage`,
  `required_action`, `financial_location` and `cancellable`.
- Answer a rate movement with `requote/accept` or `requote/decline`, and cancel
  while the funds are still refundable with `cancel`.

**Two additive values in the order status enum**, on
`GET /partner/orders/{order_id}` and the order webhooks. They can only appear on
an order that has a settlement order, so nothing you have today starts returning
them by surprise:

- `settlement_in_progress` — the customer's crypto has left escrow into Unigox
  custody and **no fiat has been paid yet**. Do not present it as complete.
- `returned` — the payout was made and the receiving bank sent it back. It is
  deliberately not `cancelled` or `failed`: it records that we paid.

Both also work as filter inputs on the orders list.

## 2026-07-29

**Third-party recipients are now first-class Partner API resources.** A KYC-verified sender can pay a separately registered recipient without representing that recipient as one of the sender's own payment methods.

- Register and manage recipients under `/api/v1/partner/recipients`, including a versioned payout destination.
- Bind `sender_recipient_relationship` and `purpose_of_payment` for each payment.
- Quote an off-ramp with `sender_id`, `recipient_id`, and `recipient_destination_id`; omit `payment_details_id` for this ownership mode.
- Quote and order responses expose the immutable `recipient_context`. Initiation creates a durable `compliance` case visible in the same Unigox Compliance queue used for portal-created payouts.
- Sensitive identity and account values are write-only or masked on reads. Vendor-specific beneficiary terminology is not exposed by the Partner API.

The KYC user identified by `sender_id` must be the real party funding the payout. Partners must not route multiple real customers through a shared shell sender.

## 2026-07-22

**New KYC status `UNDER_REVIEW` for customers under manual compliance review.** When a customer's screening needs human compliance review (rather than a quick automated check), their KYC status is now surfaced as `UNDER_REVIEW` instead of `IN_PROGRESS`. It appears wherever a KYC status is reported: `GET /partner/users/{user_uuid}/verification-status`, `GET /partner/users/{user_uuid}` (`kyc.status`), the KYC submit response (`kyc_status`), and the `user.kyc.updated` webhook. A manual review can take **up to 24 hours**, unlike an automated check of a couple of minutes — so you can now tell the two apart and set the right expectation with your customer.

`UNDER_REVIEW` is **not cleared**: treat it exactly like `IN_PROGRESS` for gating — keep polling and do not unlock onramp/offramp until the customer reaches `VERIFIED`. This is an additive status value; if you already wait for `VERIFIED` before transacting, no action is needed.

## 2026-07-21

**On-ramp and off-ramp price estimates are public.** `POST /api/v1/partner/onramp/estimate` and `POST /api/v1/partner/offramp/estimate` no longer require an API key — same as `GET /api/v1/partner/liquidity`. They return indicative pricing only (no liquidity reservation, no quote or order). Executable pricing and order creation still need a key: `POST /partner/onramp/quote`, `/onramp/initiate`, `/offramp/quote`, and `/offramp/initiate`.

No code changes required if you already call estimate with a key; the key is simply optional for these two endpoints.

## 2026-07-13

**You can now charge your end users a per-order markup.** Pass an optional `partner_fee_pct` on the quote and estimate requests for both ramps (`POST /onramp/estimate`, `/onramp/quote`, `/offramp/estimate`, `/offramp/quote`) — `1` means 1%. The markup is declared per order (no stored config), computed in crypto on the same base as the platform fee. For off-ramp, the markup is settled on-chain to your partner wallet when the order releases successfully; cancelled or failed orders refund the full amount, markup included. For on-ramp there's no separate transfer leg: the full buyer amount lands in your partner wallet at release, and the markup is captured by withholding it when the crypto bridges out at send-out (a crypto-anchored order is sized up beforehand so the requested amount still arrives net of the withheld fee).

- Quote, estimate, initiate, and GET/LIST order responses report the real figures in `fee_breakdown.partner_fee` and `fee_breakdown.partner_fee_pct`, and webhook event `data` carries `partner_fee` / `partner_fee_pct` too. The compact action responses (`confirm-payment-sent`, `confirm-fiat-received`, `cancel`, `authorize-crypto-transfer`) don't carry `fee_breakdown` — re-fetch `GET /orders/{order_id}` for the fee figures after those calls.
- `crypto_amount` stays partner-fee-exclusive in composition, with two exceptions to what it's exclusive of: a crypto-anchored onramp order (request declares `crypto_amount`) is sized up so the delivered amount stays exact after the markup is withheld, so `crypto_amount` there includes the markup; a crypto-anchored offramp order (request declares `crypto_amount`) carves both fees out of the pinned deposit, so `crypto_amount` and `platform_fee` both move relative to a no-markup request even though the markup itself stays out of `crypto_amount`. Every other case is unaffected — the markup shows only in `fee_breakdown` (and in the offramp funding amount from transfer authorization, which is `crypto_amount + partner_fee`). Apply your fee on the **same side** the platform does, or your receipts won't reconcile with our orders.
- Fiat-anchored offramp orders have no cap — the deposit grows to cover the markup. Every other case hits a formula domain bound, not a business cap: onramp rejects `partner_fee_pct >= 100` (the withheld or grossed-up fee would consume the entire buyer amount, leaving nothing delivered); crypto-anchored offramp rejects it when the fee would consume the entire pinned deposit.

Pricing is unchanged if you don't charge a markup: omit `partner_fee_pct` (or send `0`) and every amount is what it was — only `partner_fee` and `partner_fee_pct` read zero. The platform fee still applies, so `platform_fee` and `total_fee` keep reporting it (with `total_fee` equal to `platform_fee`).

One formatting change does reach every partner, including those not charging a markup: in REST responses, `fee_breakdown.partner_fee` previously always returned the literal `"0.00"` and now carries the token's own decimals, like the other fee fields — a zero-fee USDT order reports `"0.000000"`. The value is unchanged; parse it as a decimal rather than comparing strings. This does not apply to the webhook's `data.partner_fee` field, which always used (and still uses) the shortest round-tripping representation — `"1"`, not `"1.00"`; `"0"` for no fee.

## 2026-06-27

**Customers must be KYC-cleared before onramping or offramping.** Quote and initiate calls (`POST /onramp/quote`, `/onramp/initiate`, `/offramp/quote`, `/offramp/initiate`) return `422 KYC_NOT_CLEARED` if the customer is not cleared; `error.details.kyc_status` carries their current status. Poll `GET /partner/users/{user_uuid}/verification-status` until the customer reaches `VERIFIED`.

No action needed if you already wait for `VERIFIED` before transacting.

## 2026-06-24

**Recipient validation moved to recipient creation.** The recipient field check that previously ran when you created an offramp order now runs earlier — when you **create the recipient** (`POST /api/v1/partner/users/{user_uuid}/payment-details`):

- If a required recipient field is missing or malformed for the payout corridor, the create is rejected with **`422 Unprocessable Entity`** and the offending fields are named in the `error` message — so you fix the recipient once, up front, before it can be used in any order.
- `POST /api/v1/partner/offramp/initiate` **no longer returns `RECIPIENT_UNVERIFIABLE`**: a recipient you successfully created has already passed field validation. Quote and funds checks at initiate are unchanged.
- This is now the single point of recipient validation — there is no second check at order time. It confirms the recipient details are complete and well-formed for the corridor; it does not by itself guarantee the destination account exists. If the validation service is temporarily unavailable the recipient is still created (creation is never blocked by an outage), so create recipients before you need them.

No action needed if you already create recipients before ordering. Corridors without recipient requirements are unchanged.

## 2026-06-22

**Offramp orders now validate the recipient details before the order is created.**

For payout corridors with recipient requirements (e.g. mobile money and bank transfers in Nigeria, Ghana, and Kenya), `POST /api/v1/partner/offramp/initiate` now checks the recipient up front:

- If a required recipient field is missing or malformed, the request is rejected with **`422 RECIPIENT_UNVERIFIABLE`** and the offending fields are listed in `error.details.fields` — so you can fix the details and create a new order, instead of creating one that can't be paid out.
- Name requirements are corridor-specific: bank transfers expect the account-holder name, while mobile money pays to the number and accepts a placeholder name.
- This confirms the recipient details are complete and well-formed; it does not by itself guarantee the destination account exists. If the up-front check can't be completed, the order is still created and the recipient is re-checked before payout — so an outage never blocks order creation.

Corridors without recipient requirements are unchanged; no action required.
