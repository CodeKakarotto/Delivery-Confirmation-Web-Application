# Connecting to the route-optimization app

This repository was built to be merged with the route-optimization prototype later. It already shares that app's
stack, folder layout, conventions and design.

## What already matches

| Area | Shared with the route app |
| --- | --- |
| Stack | React 19 + TypeScript + Vite 7, Cloudflare Worker (`worker/src`), D1 (`migrations/`), Node test runner |
| Layout | `frontend/src/{components,pages,api,lib}`, `shared/`, `worker/src/{handlers,db}`, `docs/` |
| Design | `frontend/src/styles.css` is the route app's stylesheet unchanged, with a confirmation section appended; same logo files, favicons, theme switch, cards, buttons, notices, tags and figures |
| Code | `shared/validate.ts`, `worker/src/router.ts`, the D1 test shim and the `ApiError`/`json`/`readJson` helpers come from the route app |
| API style | `/api/...`, JSON, the same error envelope, `X-API-Version: 1`, `no-store` |
| Order IDs | same validation rule (`shared/schemas.ts`) |

## Data mapping

| This app | Route app |
| --- | --- |
| `deliveries.order_id`, `recipient_name`, address columns | same columns in `deliveries` |
| `deliveries.delivery_notes` (Delivery Instructions) | `deliveries.delivery_notes` |
| `deliveries.stop_number` | `route_stops.sequence_number` of the order's active stop on a **saved** route |
| `deliveries.cancelled_at` | `deliveries.deleted_at` with `deletion_reason = 'order_canceled'` |
| `deliveries.zone`, `total_products`, `address_notes`, `delivery_date` | not stored yet (need a source) |
| `delivery_confirmations.delivery_id` | `deliveries.id` |

## Suggested merge steps

1. Add `delivery_confirmations` and `confirmation_attempts` to the route app as a new, additive migration
   (`000N_delivery_confirmations.sql`) referencing its `deliveries(id)`; add `zone`/`total_products` there only once a
   source is approved.
2. Read the stop number from `route_stops`/`routes` (active stop, saved route) instead of a column.
3. Move `worker/src/handlers/{driver,dashboard}.ts`, `db/confirmations.ts`, `signature.ts`
   across. Replace `requireDemoAccess` with the route app's `requireUser`/`requireEmployee` (driver endpoints limited
   to the driver's own saved routes) **only once the sponsor approves using sign-in for this flow**.
4. Move the pages and components across and add nav entries to the route app's `Layout.tsx`.
5. Keep "Delivery Status Tracking" separate: this app records only the confirmation result.
