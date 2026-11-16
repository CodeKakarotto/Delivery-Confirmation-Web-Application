# Database schema (Cloudflare D1)

Source of truth: [`migrations/0001_initial.sql`](../migrations/0001_initial.sql) and
[`migrations/0002_accounts.sql`](../migrations/0002_accounts.sql) (accounts and sessions; additive) and
[`migrations/0003_exceptions_products.sql`](../migrations/0003_exceptions_products.sql) (`deliveries.products`; the
signature becomes optional for delivery exceptions: the confirmations table is rebuilt and every row and refused
attempt copied, tested in `worker/test/migrations.test.ts`). Timestamps are ISO-8601 UTC text;
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
| products | *0003*: JSON array of `{ "name", "quantity" }` shown under Total Products; NULL = not recorded |
| stop_number | *new*: the route stop `#` (route app: `route_stops.sequence_number`), NULL = "—" |
| delivery_date | *new*: YYYY-MM-DD the order is expected; drives "not yet confirmed / missing" |
| cancelled_at | *new*: cancelled orders cannot be confirmed (route app: `deleted_at` + `order_canceled`) |

## `delivery_confirmations`
One per order (`UNIQUE delivery_id`), never updated by the API. `delivery_id → deliveries ON DELETE RESTRICT`.

`id` (random UUID), snapshots `order_id`, `stop_number`, `zone` (copied by the server), `received_by` (1–100),
`outcome` (5 values), `outcome_detail` (≤300, required for `other`), `note` (≤500), `signature_png` BLOB (≤200 KB; required for `delivered_to_recipient`, NULL for exceptions since 0003),
`signature_width`/`height`, `result` (`confirmed`|`needs_review`, must match the outcome), `idempotency_key` (UNIQUE),
`request_hash` (SHA-256 of the content), `confirmed_at` (server UTC).

## `confirmation_attempts`
Refused submissions for an already confirmed order: `confirmation_id → delivery_confirmations`, `kind`
(`duplicate`: same content; `conflict`: different content), `received_by`, `outcome`, `created_at`. No signature kept.

## `users` (0002)
`username` (unique, case-insensitive), `display_name`, `role` (`driver` | `employee`), `password_hash`
(`pbkdf2-sha256$<iterations>$<salt>$<hash>`; never the password), `active`, `last_login_at`, timestamps.

## `sessions` (0002)
`id` = SHA-256 of the cookie token (the token itself is never stored), `user_id` → users (cascade), `csrf_token`,
`created_at`, `last_seen_at`, `expires_at`.

`delivery_confirmations.confirmed_by_user_id` (0002) → users: the driver account that saved it.

## Migration 0004: corrections, voids, paper entries
`delivery_confirmations` gains `source` (`app`|`paper`), `entered_by_user_id`, `reported_delivered_at` (time on the slip),
`paper_reference` (where the slip is filed), `slip_photo` (JPEG ≤600 KB), `voided_at`, `voided_by_user_id`, `void_reason`.
"One confirmation per order" becomes **one active (not voided) confirmation per order** (partial unique index
`ux_confirmations_active_delivery`). The table is rebuilt and every row and refused attempt copied (tested).

## `confirmation_corrections` (0004)
Every correction and void: `kind`, `reason` (required), old and new `received_by` / `outcome` / `outcome_detail`, `by_user_id`,
`created_at`. Never updated or deleted, so the original values stay visible.

## `rate_limits`
`(bucket, window_start)` → `hits`. `bucket` = scope + HMAC of the client IP. Windows older than an hour are deleted.

## Commands

```bash
npm run db:migrate:local
npm run db:seed:local
```
