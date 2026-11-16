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
| `frontend/test/shopUi.test.tsx` | "Delivered to recipient" bubble before the Delivery Exception group (one radio group), signature pop-up launcher and preview |
| `frontend/test/monthCalendar.test.tsx` | Month grid (Sunday weeks), the single calendar: current week row, today, day counts, selected day, today's date underneath, no date picker |
| `worker/test/auth.test.ts` | Sign-in: cookie flags (HttpOnly, SameSite=Strict, Secure/__Host- on HTTPS), generic errors, lockout after 5 failures, per-device limit, deactivated accounts, hashes only, nothing secret in logs, idle and absolute expiry, sign-out, anti-forgery token, old role header ignored |
| `worker/test/roles.test.ts` | Sign-in required everywhere; only drivers confirm; employee-only views; drivers see only their own confirmations and signatures; signature served with the cookie alone; awaiting list (5 per page); employees' deliveries list and search (wildcards escaped) |
| `frontend/test/authGate.test.tsx` | Pages shown only to signed-in accounts of the right role |
| `worker/test/corrections.test.ts` | Corrections (reason required, old values kept, outcome rules, signature never changed), voids (order back to awaiting, re-confirmable, not counted), paper entries (marked paper, slip time, photo required and checked, rules, idempotent), offline copy endpoint |
| `frontend/test/outbox.test.ts` | The phone outbox: retry on no signal or server errors, keep refused items for attention, stop at an ended session, order and per-driver, no duplicates; today's copy per driver and day |
| `frontend/test/dayMarks.test.ts` | Calendar colors: exceptions count as delivered, unconfirmed orders are missed once the day is over and still to deliver before |
| `worker/test/demoSeed.test.ts` | Demo orders: forty a day for today and the next seven days, none on Sundays (old upcoming Sunday orders removed unless confirmed), rotating recipients, safe to run twice |
| `worker/test/missedBackup.test.ts` | Missed-deliveries alert (earlier days always, today only after closing, confirmed/cancelled excluded, voided counts again, one-week window, configurable closing time, employees only) and local backups (checked copy, newest kept, no overwrite) |
| `frontend/test/missedAlert.test.tsx` | The red alert (by day, paper-slip links), the green "all confirmed" line after closing, nothing before closing, 6:00 PM formatting |
| `frontend/test/callShop.test.tsx` | The shop's number as a tap-to-call link for drivers |
| `worker/test/unvoidReport.test.ts` | Undo void (only on voided records, reason required, counts again, refused after re-confirmation, employees only) and the end-of-day report (rows and totals, Missing on past days, CSV for Excel, formula escaping, date checks) |
| `frontend/test/recordActions.test.tsx` | Record buttons (Undo void only on a voided record), "Void undone" in the history, the report table |
| `frontend/test/correctionsUi.test.tsx` | Change history (old value crossed out → new, who, when, why; voids) and the blank paper slip layout |
| `worker/test/barcode.test.ts` | Code 128 table, checksum, exact round-trip of order IDs |
| `frontend/test/deliveryCard.test.tsx` | Required field order, barcode under the order ID encoding it exactly, exception inside Deliver To, Received By/Signature inside Delivery Instructions, "—"/"Not recorded", text escaping, saved/print view order |
| `frontend/test/confirmationForm.test.tsx` | Client validation: outcome, "Other" detail, Received By, drawn signature required |

Manual checks done during development: headless Edge driven over the DevTools protocol at 390×844 (phone) and
1280 px (desktop), with no horizontal overflow on the driver form, dashboard or detail page. A full touch-signature
submission with a double tap saved one record. Print media emulation and dark theme were also checked.
