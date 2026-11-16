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
| GET | `/api/config` | `{ appEnv, timeZone, closingTime, retentionDays, authenticated, dataAvailable }` |

## Sign-in

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ username, password }` → `{ user: { username, displayName, role }, csrfToken }` and the session cookie. `401 invalid_credentials` (same for every failure), `429 too_many_attempts` |
| GET | `/api/auth/me` | The signed-in account and its `csrfToken`, or `401` |
| POST | `/api/auth/logout` | Signs out fully: ends **every** session of the account, clears the cookie and sends `Clear-Site-Data: "cache", "cookies", "storage"` |

All data endpoints need the session cookie (`401 unauthenticated`); POSTs also need `X-CSRF-Token`
(`403 csrf_failed`). Driver endpoints need a driver account and employee-only endpoints an employee account
(`403 role_required`).

## Driver

### `GET /api/driver/deliveries?limit=5&offset=0`
Today's (shop time zone) orders that are not cancelled and not confirmed, by stop number, one page at a time
(`limit` 1–50, default 5): `{ date, total, items: [{ orderId, stopNumber, zone, recipientName, city }] }`. No street addresses. Rate limited (60/min).

### `GET /api/driver/deliveries/:orderId`
Exact, case-insensitive order ID. Rate limited (60/min).

- `200 { status: "ready", delivery: DriverDelivery }`: `orderId, stopNumber|null, zone|null, recipientName|null,
  addressLine, city, state, postalCode, addressNotes|null, totalProducts|null, products: [{ name, quantity }]|null,
  deliveryInstructions|null`
- `200 { status: "already_confirmed", orderId, confirmedAt }`: no customer details
- `404 order_not_found`, `409 order_cancelled`, `429 rate_limited`

### `POST /api/driver/confirmations`
Rate limited (20/min). Body (unknown fields are rejected):

```json
{
  "orderId": "MF-10482",
  "receivedBy": "Avery Demo",
  "outcome": "delivered_to_recipient | left_at_door | left_with_front_desk | left_with_neighbor | other",
  "outcomeDetail": "exception note: required for every exception, not used for delivered_to_recipient (≤300)",
  "note": "optional (≤500)",
  "signaturePng": "data:image/png;base64,… (only for delivered_to_recipient; refused for exceptions)",
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

## Offline, corrections and paper slips

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/driver/offline` | Drivers. Today's awaiting orders with full details, kept on the phone for confirming without signal |
| POST | `/api/dashboard/confirmations/:id/corrections` | Employees. `{ receivedBy?, outcome?, outcomeDetail?, reason }`: at least one change and a reason. The signature is never changed; a record without one cannot become `delivered_to_recipient` (`422 signature_required`). Voided records: `409 voided` |
| POST | `/api/dashboard/confirmations/:id/unvoid` | Employees. `{ reason }`. Only on a voided record (`409 not_voided`); refused if the order was confirmed again after the void (`409 order_reconfirmed`). Added to the history as `unvoid` |
| GET | `/api/dashboard/report?date=YYYY-MM-DD` | Employees. End-of-day report: `{ date, isPast, totals{scheduled,delivered,exceptions,awaiting,cancelled}, rows[] }`; a row is `delivered`, `exception`, `awaiting` (`missing` once the day is over) or `cancelled`. Default date: today in the shop time zone |
| GET | `/api/dashboard/missed` | Employees. Orders never confirmed (not cancelled, no active confirmation) in the last 7 days; today is included only after `SHOP_CLOSING_TIME` (default 18:00). `{ today, closingTime, afterClosing, lookbackDays, total, days: [{ date, orders[] }] }`, newest day first |
| GET | `/api/dashboard/report.csv?date=YYYY-MM-DD` | Employees. The same report as a CSV download for Excel (UTF-8 with BOM, CRLF, formula-like cells prefixed with `'`) |
| POST | `/api/dashboard/confirmations/:id/void` | Employees. `{ reason }`. The record stays visible (`voided`), stops counting, and the order can be confirmed again |
| POST | `/api/dashboard/paper-confirmations` | Employees. `{ orderId, receivedBy, outcome, outcomeDetail?, deliveredAt (ISO, the time on the slip), paperReference, slipPhoto (required: JPEG data URL ≤600 KB, the proof of the signature; missing → `422` on `slipPhoto`), idempotencyKey }`. Saved as `source: 'paper'` |
| GET | `/api/dashboard/confirmations/:id/slip-photo` | The photo of the signed slip (`image/jpeg`, `no-store`) |

Records now include `source`, `corrected`, `voided`, and (detail) `corrections[]` with old and new values, `voided` and `paper`.

## Confirmations and shop views

Calendar, confirmations list, record and signature: employees see all, drivers only their own (others answer 404).
Day summary, deliveries list and orders: employees only.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/dashboard/summary?date=YYYY-MM-DD` | Default today in the shop time zone. `{ date, isPast, expected, confirmed, needsReview, flagged, awaiting[] }` |
| GET | `/api/dashboard/calendar` | Confirmations by shop-local month → week (Sun–Sat, split at month ends) → day, newest first, with `count`, `needsReview`, `flagged` at each level. Always includes today. `{ timeZone, today, currentWeekStart, months[] }` |
| GET | `/api/dashboard/confirmations` | `?orderId=` (exact), `?day=YYYY-MM-DD` (shop-local day), `?result=confirmed\|needs_review`, `?flagged=1`, `?limit=1..200` (50; the UI uses 10), `?offset=`. `{ items, total }`, newest first |
| GET | `/api/dashboard/deliveries/calendar?month=YYYY-MM` | Employees. Month view: `{ month, today, days: [{ date, total, awaiting, confirmed, exception, cancelled }] }` (days with deliveries only) |
| GET | `/api/dashboard/deliveries` | Employees. `?date=` (default today, shop time zone), `?from=&to=` (a range of up to 42 days, for the week view) or `?q=` (part of an order ID or recipient name, any day), `?status=all\|awaiting\|confirmed\|exception\|cancelled`, `?limit=` (10), `?offset=`. `{ items: [{ orderId, stopNumber, zone, recipientName, city, deliveryDate, status, confirmation }], total }` |
| GET | `/api/dashboard/orders/:orderId` | One order for the shop: `{ status: awaiting\|confirmed\|cancelled, delivery, confirmation: { id, confirmedAt, result } \| null }` |
| GET | `/api/dashboard/confirmations/:id` | `{ confirmation }` with `delivery`, `outcomeDetail`, `note`, signature size and `attempts[]` |
| GET | `/api/dashboard/confirmations/:id/signature` | `image/png`, `no-store`, sandboxed |

List items: `id, orderId, stopNumber, zone, recipientName, receivedBy, outcome, result, confirmedAt, attemptCount,
hasConflict`.
