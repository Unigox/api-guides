# Getting Started

Unigox lets partners build crypto-to-fiat and fiat-to-crypto experiences with a single integration surface. For most partners, the fastest path is:

1. Configure your API key and webhook endpoint.
2. Verify user onboarding and KYC.
3. Create payment details for payout.
4. Quote and initiate an off-ramp order.
5. Handle order status changes through webhooks.

## Environments

- Staging: `https://api-staging.unigox.com`
- Production: `https://api.unigox.com`

Switching environments should require only two changes:

- base URL
- partner `X-API-Key`

## Authentication

All partner endpoints require `X-API-Key`.

For a basic connectivity check, start with:

- [Health](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/health)

## Your first successful off-ramp

The standard first implementation path is:

1. Create a user in [User Management](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/user-management).
2. Submit KYC and upload documents if required.
3. Create payout details for that user.
4. Get an off-ramp quote in [Off-Ramp](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/off-ramp).
5. Initiate the order.
6. Authorize the crypto transfer.
7. Wait for webhook updates.
8. Confirm fiat received in [Orders](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/orders).

## Where to go next

- Read [Basics](basics.md) for delivery, lifecycle, and production behavior.
- Read [Off-Ramp Partner Playbook](tutorials/off-ramp-partner-playbook.md) for the full phased flow.
- Open [API Reference](https://unigox.gitbook.io/unigox-api/) when you need schemas and payload details.
