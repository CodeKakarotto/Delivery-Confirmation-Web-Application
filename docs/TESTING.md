# Testing

```bash
npm test          # all tests
npm run typecheck
npm run build:web
```

Tests use Node's built-in runner, as in the route app. Worker tests run the real migrations and synthetic seed on an
in-memory SQLite D1 shim (`worker/test/helpers/d1.ts`) and call the Worker's `handleRequest` with real
`Request`/`Response` objects. React components are rendered to HTML with `react-dom/server`; `.tsx` files are compiled
for the test runner by `frontend/test/register-tsx.mjs` (esbuild).

| File | Covers |
| --- | --- |
| `worker/test/driverConfirmation.test.ts` | Minimal lookup fields, exact ID match, unknown/cancelled orders, no listing endpoint, saving linked to the right order, server timestamp, rejected extra fields, required fields, "Other" explanation, needs-review result, signature validation, retries/double clicks/duplicates/conflicts, key reuse, no customer data in logs |
| `worker/test/security.test.ts` | Fail-closed outside the local demonstration, `DEV_EXTRA_HOSTS`, origin/CSRF checks, JSON-only, preflight, security headers, rate limits, no stored IPs |
| `worker/test/dashboard.test.ts` | List, exact search, filters, paging, detail, signature serving (no-store), daily summary and missing confirmations |
| `worker/test/shopCalendar.test.ts` | Month → week → day grouping in the shop time zone, weeks split at month ends, today always present, day filter, 10-per-page paging, order view (awaiting/confirmed/cancelled), summary default date |
| `worker/test/shopTime.test.ts` | Shop-local days, daylight-saving day ranges, Sunday weeks |
| `frontend/test/shopUi.test.tsx` | "Delivered to recipient" bubble before the Delivery Exception group (one radio group), signature pop-up launcher and preview, calendar tree opening on this month/week/day |
| `worker/test/roles.test.ts` | Driver endpoints only for the driver role, dashboard only for the shop role, the driver's awaiting list (today, unconfirmed, no addresses, shop day) |
| `frontend/test/roleGate.test.tsx` | Each section shown only to its role; role chooser prompt |
| `worker/test/barcode.test.ts` | Code 128 table, checksum, exact round-trip of order IDs |
| `frontend/test/deliveryCard.test.tsx` | Required field order, barcode under the order ID encoding it exactly, exception inside Deliver To, Received By/Signature inside Delivery Instructions, "—"/"Not recorded", text escaping, saved/print view order |
| `frontend/test/confirmationForm.test.tsx` | Client validation: outcome, "Other" detail, Received By, drawn signature required |

Manual checks done during development: headless Edge driven over the DevTools protocol at 390×844 (phone) and
1280 px (desktop), with no horizontal overflow on the driver form, dashboard or detail page. A full touch-signature
submission with a double tap saved one record. Print media emulation and dark theme were also checked.
