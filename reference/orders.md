# Orders

Use these endpoints to fetch orders, confirm settlement, cancel orders, and list partner order history.

## Endpoints in this section

### `GET /api/v1/partner/orders/{order_id}`

Order details.

- Authentication: partner credentials required
- Path parameters:
  - `order_id` required, string
- Request body: none
- Response codes: `200`, `401`, `404`, `500`

### `POST /api/v1/partner/orders/{order_id}/confirm-fiat-received`

Confirm fiat received.

- Authentication: partner credentials required
- Path parameters:
  - `order_id` required, string
- Request body: none
- Response codes: `200`, `400`, `401`, `404`

### `POST /api/v1/partner/orders/{order_id}/cancel`

Cancel order.

- Authentication: partner credentials required
- Path parameters:
  - `order_id` required, string
- Request body: none
- Response codes: `200`, `400`, `401`, `404`

### `GET /api/v1/partner/orders`

List orders.

- Authentication: partner credentials required
- Query parameters:
  - `status` optional, string
  - `page` optional, integer
  - `limit` optional, integer
- Request body: none
- Response codes: `200`, `401`
