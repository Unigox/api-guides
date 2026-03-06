# Off-Ramp Partner Playbook

This tutorial follows the full live off-ramp integration from one-time setup to operational monitoring.

When you need payload and schema details, jump into:

- [User Management](../reference/user-management.md)
- [Off-Ramp](../reference/off-ramp.md)
- [Orders](../reference/orders.md)
- [Webhooks](../reference/webhooks.md)

## Phase 1: Setup (one-time)

1. Obtain credentials:
   - `X-API-Key`
   - `webhook_secret`
2. Register your webhook URL:
   - `POST /api/v1/partner/webhooks`
3. Verify delivery:
   - `POST /api/v1/partner/webhooks/test`

## Phase 2: User onboarding (per user)

4. Create user:
   - `POST /api/v1/partner/users`
5. Submit KYC:
   - `POST /api/v1/partner/users/{id}/kyc-submissions`
6. Upload documents for `direct_data`:
   - `POST /api/v1/partner/users/{id}/kyc/documents`
7. Check verification status:
   - `GET /api/v1/partner/users/{id}/verification-status`
8. Create payment details:
   - `POST /api/v1/partner/users/{id}/payment-details`

## Phase 3: Off-ramp order lifecycle

| # | What happens | Endpoint | Result |
|---|---|---|---|
| 9 | Optional estimate | `POST /api/v1/partner/offramp/estimate` | Indicative pricing |
| 10 | Quote | `POST /api/v1/partner/offramp/quote` | Quote locked briefly |
| 11 | Initiate order | `POST /api/v1/partner/offramp/initiate` | `awaiting_crypto_transfer_authorization` |
| 12 | Authorize transfer | `POST /api/v1/partner/orders/{id}/authorize-crypto-transfer` | `crypto_received` after confirmation |
| 13 | Buyer submits proof | No partner API call | `fiat_payment_started` |
| 14 | Admin reviews proof | No partner API call | `fiat_payment_review_started` |
| 15 | Proof accepted | No partner API call | `awaiting_fiat_received_confirmation` |
| 16 | Confirm fiat received | `POST /api/v1/partner/orders/{id}/confirm-fiat-received` | `completed` |

Alternative endings:

- `cancelled` for cancellation, expiry, or repeated proof failure
- `failed` for escrow or relay errors
- `dispute_started` when a dispute is opened

## Phase 4: Monitoring

17. Poll a single order:
   - `GET /api/v1/partner/orders/{order_id}`
18. List orders for reconciliation:
   - `GET /api/v1/partner/orders?status=completed&page=1&limit=20`

Use `status`, `timeline`, and `allowed_actions` if polling is needed as a recovery or reconciliation fallback.

Webhooks should remain the primary source of truth.
