# Basics

This section explains the runtime behavior around the API, especially the parts partners rely on operationally: webhooks, order progression, and production readiness.

## How the Unigox flow works

For off-ramp, the integration has four broad stages:

1. One-time setup.
2. Per-user onboarding.
3. Per-order execution.
4. Monitoring and reconciliation.

The API reference pages provide payload definitions. This page explains how those pieces behave together.

## Webhook Delivery

Webhooks are the primary source of order state updates.

Delivery model:

- event type: `order.status.changed`
- transport: HTTPS `POST`
- success condition: any `2xx` response
- signature headers:
  - `X-Unigox-Signature`
  - `X-Unigox-Timestamp`
- user agent: `unigox-webhooks/1.0`

Signature model:

- HMAC-SHA256 over `"<timestamp>.<raw_body>"`
- header format: `sha256=<hex>`
- secret source: your partner `webhook_secret`

Operational behavior from the live dispatcher:

- maximum attempts: `10`
- retry schedule: `1 min`, `5 min`, `15 min`, `1 h`, `6 h`, `12 h`, `24 h`
- once the schedule is exhausted, remaining retries continue at the final `24 h` interval until max attempts is reached
- stale `in_progress` deliveries are recovered back to `pending` after `5 minutes`

Delivery safeguards:

- HTTPS only
- redirects are not followed
- connect/TLS timeout: `3 seconds`
- total request timeout: `10 seconds`
- SSRF protection rejects loopback, private, link-local, and unspecified IPs

Partner guidance:

- de-duplicate by `event_id`
- keep webhook handlers idempotent
- acknowledge quickly, then process asynchronously
- use polling only for recovery and reconciliation

For full webhook request, test, and payload details, see [Webhooks](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/webhooks).

## Order Lifecycle

The normal off-ramp lifecycle is:

1. Quote
2. Initiate
3. Authorize crypto transfer
4. Wait for payment proof and review
5. Confirm fiat received
6. Completed

Important status checkpoints:

- `awaiting_crypto_transfer_authorization`
- `crypto_received`
- `fiat_payment_started`
- `fiat_payment_review_started`
- `awaiting_fiat_received_confirmation`
- `completed`

Alternative terminal paths can include:

- `cancelled`
- `failed`
- `dispute_started`

For the actual order actions and state fields, see [Orders](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/orders).

## Moving to production

Before switching to production:

1. Verify webhook signatures end-to-end.
2. Confirm retries and idempotency behave correctly.
3. Run the happy path and at least one failure or cancellation path.
4. Make sure your reconciliation logic can fall back to polling when needed.

Production endpoints:

- API base URL: `https://api.unigox.com`
- staging base URL: `https://api-staging.unigox.com`
