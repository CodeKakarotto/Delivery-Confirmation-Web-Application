# Database schema (Cloudflare D1)

Source of truth: [`migrations/0001_initial.sql`](../migrations/0001_initial.sql). Timestamps are ISO-8601 UTC text;
foreign keys are enforced. Demo data: [`seed/demo-seed.sql`](../seed/demo-seed.sql) (synthetic only).

## `deliveries`
The orders that can be confirmed. Columns shared with the route app keep the route app's names.

| Column | Notes |
| --- | --- |
| order_id | UNIQUE, case-insensitive, 1–40 chars (route app rule) |
| recipient_name, address_line, city, state, postal_code | as in the route app |
| delivery_notes | the route app's notes; shown as **Delivery Instructions** (read-only) |
| address_notes | *new*: suite/gate/building notes, shown under Deliver To |
| zone | *new*, NULL = no zone ("—"); never invented |
| total_products | *new*, 1–999, NULL = "Not recorded"; never calculated |
| stop_number | *new*: the route stop `#` (route app: `route_stops.sequence_number`), NULL = "—" |
| delivery_date | *new*: YYYY-MM-DD the order is expected; drives "not yet confirmed / missing" |
| cancelled_at | *new*: cancelled orders cannot be confirmed (route app: `deleted_at` + `order_canceled`) |

## `delivery_confirmations`
One per order (`UNIQUE delivery_id`), never updated by the API. `delivery_id → deliveries ON DELETE RESTRICT`.

`id` (random UUID), snapshots `order_id`, `stop_number`, `zone` (copied by the server), `received_by` (1–100),
`outcome` (5 values), `outcome_detail` (≤300, required for `other`), `note` (≤500), `signature_png` BLOB (≤200 KB),
`signature_width`/`height`, `result` (`confirmed`|`needs_review`, must match the outcome), `idempotency_key` (UNIQUE),
`request_hash` (SHA-256 of the content), `confirmed_at` (server UTC).

## `confirmation_attempts`
Refused submissions for an already confirmed order: `confirmation_id → delivery_confirmations`, `kind`
(`duplicate`: same content; `conflict`: different content), `received_by`, `outcome`, `created_at`. No signature kept.

## `rate_limits`
`(bucket, window_start)` → `hits`. `bucket` = scope + HMAC of the client IP. Windows older than an hour are deleted.

## Commands

```bash
npm run db:migrate:local
npm run db:seed:local
```
