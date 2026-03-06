# On-Ramp

Use these endpoints to estimate an on-ramp and create a new on-ramp order.

## Endpoints in this section

### `POST /api/v1/partner/onramp/quote`

Get price estimate.

- Authentication: partner credentials required
- Request body: required
- Response codes: `200`, `400`, `401`, `500`

### `POST /api/v1/partner/onramp/initiate`

Start on-ramp order.

- Authentication: partner credentials required
- Request body: required
- Response codes: `201`, `400`, `401`, `500`
