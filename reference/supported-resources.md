# Supported Resources

Use these endpoints to discover what assets, rails, and institutions are currently available for partner flows.

## Endpoints in this section

### `GET /api/v1/supported/crypto-currencies`

Cryptocurrencies.

- Authentication: not required
- Request body: none
- Query parameters: none
- Response codes: `200`

### `GET /api/v1/supported/blockchains`

Blockchains.

- Authentication: not required
- Request body: none
- Query parameters: none
- Response codes: `200`

### `GET /api/v1/supported/fiat-currencies`

Fiat currencies.

- Authentication: not required
- Request body: none
- Query parameters: none
- Response codes: `200`, `500`

### `GET /api/v1/supported/payment-rails`

Payment rails.

- Authentication: not required
- Request body: none
- Query parameters:
  - `direction` required, string
  - `country` optional, string
  - `currency` optional, string
- Response codes: `200`, `400`, `500`

### `GET /api/v1/supported/institutions`

Institutions (banks) for a payment rail.

- Authentication: not required
- Request body: none
- Query parameters:
  - `rail` required, string
  - `institution_id` optional, string
  - `country` optional, string
  - `currency` optional, string
  - `search` optional, string
  - `code` optional, string
  - `limit` optional, integer
  - `offset` optional, integer
- Response codes: `200`, `400`, `500`
