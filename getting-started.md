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

- [Health](reference/health.md)
- [Supported Resources](reference/supported-resources.md)
- [Exchange Pairs](reference/exchange-pairs.md)
- [User Management](reference/user-management.md)
- [On-Ramp](reference/on-ramp.md)
- [Off-Ramp](reference/off-ramp.md)
- [Orders](reference/orders.md)
- [Webhooks](reference/webhooks.md)

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

- Read [Basics](basics.md) for webhook behavior, lifecycle, and production readiness.
- Read [Off-Ramp Partner Playbook](tutorials/off-ramp-partner-playbook.md) for the full phased integration flow.
- Use [API Reference](reference/README.md) when implementing requests.
