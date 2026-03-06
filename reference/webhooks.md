# Webhooks

Use these endpoints to register, inspect, test, and remove webhook configuration.

## Endpoints in this section

### `POST /api/v1/partner/webhooks`

Register webhook URL.

- Authentication: partner credentials required
- Request body: required
- Response codes: `200`, `400`, `401`

### `GET /api/v1/partner/webhooks`

Get webhook config.

- Authentication: partner credentials required
- Request body: none
- Response codes: `200`, `401`

### `DELETE /api/v1/partner/webhooks/{id}`

Delete webhook.

- Authentication: partner credentials required
- Path parameters:
  - `id` required, string
- Request body: none
- Response codes: `200`, `401`

### `POST /api/v1/partner/webhooks/test`

Test webhook.

- Authentication: partner credentials required
- Request body: required
- Response codes: `200`, `400`, `401`, `502`
