# API (v1)

Same conventions as the route-optimization app: JSON under `/api`, `X-API-Version: 1`, errors as
`{ "error": { "code", "message", "requestId", "details?" } }`, and validation failures as `422 validation_failed`
with `details.issues: [{ path, message }]`. Every response is `Cache-Control: no-store`.

Data endpoints answer `503 access_model_required` outside the local demonstration ([SECURITY.md](SECURITY.md)).
POST requests need a same-origin `Origin` header and a JSON body.

## Open endpoints

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/health` | `{ "ok": true }` |
| GET | `/api/config` | `{ appEnv, authenticated: false, dataAvailable }` |

## Driver

### `GET /api/driver/deliveries/:orderId`
Exact, case-insensitive order ID. Rate limited (60/min).

- `200 { status: "ready", delivery: DriverDelivery }`: `orderId, stopNumber|null, zone|null, recipientName|null,
  addressLine, city, state, postalCode, addressNotes|null, totalProducts|null, deliveryInstructions|null`
- `200 { status: "already_confirmed", orderId, confirmedAt }`: no customer details
- `404 order_not_found`, `409 order_cancelled`, `429 rate_limited`

### `POST /api/driver/confirmations`
Rate limited (20/min). Body (unknown fields are rejected):

```json
{
  "orderId": "MF-10482",
  "receivedBy": "Avery Demo",
  "outcome": "delivered_to_recipient | left_at_door | left_with_front_desk | left_with_neighbor | other",
  "outcomeDetail": "required for other, optional otherwise (≤300)",
  "note": "optional (≤500)",
  "signaturePng": "data:image/png;base64,…",
  "idempotencyKey": "uuid generated once per form"
}
```

| Status | Meaning |
| --- | --- |
| `201 { confirmation, replayed: false }` | Saved. `confirmation` = `id, orderId, receivedBy, outcome, outcomeDetail, note, result, confirmedAt` (no signature) |
| `200 { confirmation, replayed: true }` | A retry of an already saved submission (same key, same content): the original record |
| `404 order_not_found` / `409 order_cancelled` | Nothing saved |
| `409 already_confirmed` | The order already has a confirmation. Nothing changed; the attempt is recorded for review |
| `422 validation_failed` / `invalid_signature` | Nothing saved |
| `422 idempotency_key_reused` | The key was used for different content |
| `413 payload_too_large`, `415 unsupported_media_type`, `403 bad_origin`, `429 rate_limited` | Nothing saved |

`result` is decided by the server: `confirmed` for `delivered_to_recipient`, otherwise `needs_review`.

## Dashboard (not access-controlled: local demonstration only)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/dashboard/summary?date=YYYY-MM-DD` | Default today (UTC). `{ date, isPast, expected, confirmed, needsReview, flagged, awaiting[] }` |
| GET | `/api/dashboard/confirmations` | `?orderId=` (exact), `?result=confirmed\|needs_review`, `?flagged=1`, `?date=`, `?limit=1..200` (50), `?offset=`. `{ items, total }`, newest first |
| GET | `/api/dashboard/confirmations/:id` | `{ confirmation }` with `delivery`, `outcomeDetail`, `note`, signature size and `attempts[]` |
| GET | `/api/dashboard/confirmations/:id/signature` | `image/png`, `no-store`, sandboxed |

List items: `id, orderId, stopNumber, zone, recipientName, receivedBy, outcome, result, confirmedAt, attemptCount,
hasConflict`.
