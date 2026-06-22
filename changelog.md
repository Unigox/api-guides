# Changelog

Notable changes to the Unigox partner API, newest first.

## 2026-06-22

**Offramp orders now verify the recipient before the order is created.**

For payout corridors where we verify recipients (e.g. mobile money and bank transfers in Nigeria, Ghana, and Kenya), `POST /api/v1/partner/offramp/initiate` now checks the recipient up front:

- If the destination account/phone number can't be resolved to a registered account — or the account-holder name isn't a valid first + last name — the request is rejected with **`422 RECIPIENT_UNVERIFIABLE`** (the offending fields are listed in `error.details.fields`), instead of creating an order that can't be paid out. Fix the recipient details and create a new order.
- If recipient verification is temporarily unavailable, the order is still created and the recipient is re-checked before payout — so an outage never blocks order creation.

Corridors without recipient verification are unchanged; no action required.
