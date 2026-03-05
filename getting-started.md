# Getting Started

Welcome to the Unigox API. This guide helps you move from access setup to your first successful off-ramp transaction in the shortest reliable path.

Use the left navigation to move between onboarding guides and the API reference.

## Environments

Unigox provides two environments:

- Staging: `https://api-staging.unigox.com`
- Production: `https://api.unigox.com`

Use staging for integration testing and production only after your partner configuration, webhook handling, and operational processes are verified.

## Authentication

All authenticated requests require the credentials and headers issued for your partner account. Keep staging and production credentials separate.

Before sending live traffic:

1. Confirm your base URL.
2. Confirm your API credentials.
3. Confirm your webhook endpoint is reachable and verified.
4. Confirm your system can handle retries and out-of-order delivery safely.

For schema-level request and response details, use:

- [Health](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/health)
- [Supported Resources](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/supported-resources)
- [Exchange Pairs](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/exchange-pairs)
- [User Management](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/user-management)
- [On-Ramp](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/on-ramp)
- [Off-Ramp](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/off-ramp)
- [Orders](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/orders)
- [Webhooks](https://unigox.gitbook.io/unigox-api/api-documentation/api-reference/webhooks)

## Your first successful off-ramp

Recommended sequence:

1. Check API health.
2. Fetch supported resources and exchange pairs.
3. Create or identify the user.
4. Collect off-ramp quote and payment details.
5. Initiate the order.
6. Authorize the crypto transfer.
7. Wait for webhook updates.
8. Confirm fiat received in your operational flow.

## Where to go next

- Read [Basics](https://unigox.gitbook.io/unigox-api/basics) for webhook behavior, lifecycle, and production readiness.
- Read [Off-Ramp Partner Playbook](https://unigox.gitbook.io/unigox-api/tutorials/off-ramp-partner-playbook) for the full phased integration flow.
- Use [API Reference](https://unigox.gitbook.io/unigox-api/reference) when implementing requests.
