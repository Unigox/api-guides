# Changelog

Notable changes to the Unigox partner API, newest first.

## 2026-06-24

**Recipient validation moved to recipient creation.** The recipient field check that previously ran when you created an offramp order now runs earlier — when you **create the recipient** (`POST /api/v1/partner/users/{user_id}/payment-details`):

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
