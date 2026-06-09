# Frontend: MoMo/wallet onramp needs the buyer's number (buyer-payment-details)

## Problem

For **onramp** (user buys crypto, pays fiat) through **mobile-money / wallet corridors**
(KES M-Pesa, UGX MTN/Airtel, GHS MoMo — any `payment_request = true` offer), the
"Please complete payment" screen shows a **placeholder phone number** (e.g.
`0700000000` or a `…|COL…|…` composite). The buyer cannot pay by it and the trade
never settles.

Root cause: the trade is created with `initiator_payment_details_id = NULL` and the
frontend **never submits the buyer's own mobile-money number**. The vendor agent then
falls back to a placeholder when calling the provider (Cashwyre), so the collection
request has no real number to charge / no real phone to push the STK/USSD prompt to.

The backend mechanism to fix this **already exists** — the frontend just needs to call
one endpoint.

## Why MoMo differs from bank (NGN)

- **Bank / NGN (`payment_request = false`)**: pay-to model. The provider issues a
  virtual account; the buyer transfers to it. **No buyer number needed.** Today's UI is
  correct for this.
- **MoMo / wallet (`payment_request = true`)**: authorize model. The provider charges
  the buyer's own M-Pesa/MoMo number (STK/USSD prompt → buyer enters PIN). **The buyer's
  number is REQUIRED.**

So: only `payment_request = true` trades require the buyer's number. Detect via the
`payment_request` flag on the trade object.

## The fix — call buyer-payment-details after the trade is created

`POST /api/v1/trades/:trade_id/buyer-payment-details` (auth: the buyer / trade initiator)

Send EITHER an existing saved payment detail:
```json
{ "payment_details_id": 2228 }
```
OR create one inline (atomically):
```json
{
  "payment_details": {
    "payment_method_id": 3,
    "payment_network_id": 37,
    "details": { "full_name": "JOHN DOE", "phone_number": "254712345678" },
    "country_code": "KE"
  }
}
```
Exactly one of `payment_details_id` / `payment_details` — not both.

### Requirements / validation (will 4xx otherwise)
- Caller must be the trade **initiator** (buyer). → 403
- Trade must be **`payment_request = true`**. → 404 "not a payment_request trade"
- Trade status must be **`awaiting_escrow_funding_by_seller`**. Call it right after
  trade creation, before/while the seller funds escrow. → 409 otherwise
- One-shot: if already submitted, returns 409 "already submitted".
- The payment detail's **`payment_network_id` must equal the trade's
  `initiator_payment_network_id`** (network-only check; method is not enforced). → 400
- `fiat_currency_code` is taken from the trade (client value ignored).
- `country_code` (if sent) must be 2-letter ISO.

### Number format
Send the buyer's real mobile number in the local/international format the corridor
expects (e.g. Kenya M-Pesa `2547XXXXXXXX`, Uganda MTN `0772XXXXXX`/`2567XXXXXXXX`).
The agent normalizes per corridor before calling the provider.

## Required frontend changes

1. On the onramp flow, when the matched offer / trade has **`payment_request = true`**,
   add a **required** input for the buyer's mobile-money number (and name). Use the
   trade's `initiator_payment_method_id` / `initiator_payment_network_id` to label the
   method (M-Pesa, MTN MoMo, …) and to set `payment_network_id` in the request.
2. After the trade is created (status `awaiting_escrow_funding_by_seller`), call
   `POST /trades/:trade_id/buyer-payment-details` with that number. **Block the
   "complete payment" screen until this succeeds.**
3. For MoMo, replace the "Transfer to this number + I've sent the payment" UI with an
   **approve-on-phone** UX: after submitting the number, show "Approve the prompt on your
   phone (enter your M-Pesa/MoMo PIN)" and poll the trade status. There is no number for
   the buyer to manually pay to — the provider pushes the charge to their phone.
4. For bank / NGN (`payment_request = false`) keep the current pay-to UI unchanged.

## Make the number mandatory

For every `payment_request = true` (wallet/MoMo) corridor the buyer number must be
**required** before payment can proceed — without it the trade gets a placeholder and
cannot settle. This applies uniformly to all such networks (KES Pesalink / M-Pesa,
UGX UNISS / MTN-Airtel, GHS GHIPSS / MoMo, and any future wallet corridor). NGN
(virtual account) must NOT require it.

## Backend status (no changes needed)
- Endpoint `SubmitBuyerPaymentDetails` exists and sets `initiator_payment_details_id`.
- The vendor agent reads `initiator_payment_details` first and will send the buyer's
  real number to the provider once it is set. See [[project-cashwyre-onramp-model]].
