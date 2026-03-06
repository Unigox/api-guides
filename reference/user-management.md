# User Management

Use these endpoints to verify partner authentication, create partner users, submit KYC information, and manage payment details.

## Endpoints in this section

### `GET /api/v1/partner/verify-auth`

Verify API key authentication.

- Authentication: partner credentials required
- Request body: none
- Query parameters: none
- Response codes: `200`, `401`

### `POST /api/v1/partner/users`

Create or get partner user.

- Authentication: partner credentials required
- Request body: required
- Response codes: `201`, `200`, `400`, `401`, `500`

### `GET /api/v1/partner/users/{id}`

Partner user by ID.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Request body: none
- Response codes: `200`, `401`, `404`

### `POST /api/v1/partner/users/{id}/kyc-submissions`

Submit KYC data for a partner user.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Request body: required
- Response codes: `200`, `400`, `401`, `404`, `500`

### `POST /api/v1/partner/users/{id}/kyc/documents`

Upload KYC document for a partner user.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Request body: required
- Response codes: `200`, `400`, `401`, `404`, `500`

### `GET /api/v1/partner/users/{id}/verification-status`

Verification status for a partner user.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Query parameters:
  - `verification_id` optional, string
- Request body: none
- Response codes: `200`, `401`, `404`, `500`

### `POST /api/v1/partner/users/{id}/payment-details`

Create payment details for a partner user.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Request body: required
- Response codes: `201`, `400`, `401`, `404`, `500`

### `GET /api/v1/partner/users/{id}/payment-details`

Payment details for a partner user.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Request body: none
- Response codes: `200`, `401`, `404`, `500`

### `DELETE /api/v1/partner/users/{id}/payment-details`

Delete payment details for a partner user.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
  - `payment_details_id` required, string
- Request body: none
- Response codes: `200`, `401`, `404`, `409`, `500`
