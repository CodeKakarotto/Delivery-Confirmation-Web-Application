# Architecture

```
Browser (React SPA)  ──/api──▶  Cloudflare Worker (worker/src)  ──▶  D1 (SQLite)
   frontend/src                 app.ts → security.ts guards → handlers → db
          └──────── shared/ (types, schemas, validation, barcode) ────────┘
```

One origin serves both the built app (`frontend/dist`, static assets) and the API (`run_worker_first: /api/*`), as in
the route app. In development Vite (5173) proxies `/api` to `wrangler dev` (8787).

## Request flow (Worker)

1. `app.ts`: route match (404/405, with no CORS grants), build the context, `checkOrigin` for POST.
2. Handler: `requireDemoAccess` (local demonstration only), then `rateLimit`, `readJson` + schema, then business rules.
3. `db/confirmations.ts`: parameterized queries; guarded insert; unique constraints settle races.
4. Errors become the standard envelope; unexpected ones are logged by type and request ID only.

## Submission safety

- The form makes one random `idempotencyKey` when it opens and reuses it for every retry of the same payload.
- The server stores a SHA-256 `request_hash` of the content. Same key + same hash = return the saved record
  (`replayed`). Same key + different hash = 422. Different key for a confirmed order = 409 plus an attempt record.
- After a network or server error the form locks and offers **Retry submission**, which resends the identical payload.
  The order is shown as confirmed only after a 200/201.

## Frontend

| Path | Page |
| --- | --- |
| `/` | Home: driver or employee |
| `/confirm`, `/confirm/:orderId` | Driver: open an order, then the confirmation form |
| `/shop` | Shop employees: one month calendar (current week highlighted, today circled, today's date underneath). The selected day (`d`), shown month (`m`) and page (`p`) are in the URL, so Back returns to them. Below/beside it: the day's figures, awaiting orders (open an order view) and confirmed deliveries with times, 10 per page |
| `/shop/confirmations/:id` | Saved record and printout |
| `/shop/orders/:orderId` | One order opened from the awaiting list |

`DeliveryCard` renders the required field order once; the driver form (`DriverConfirmPage`) and the saved record
(`SavedConfirmationCard`) fill its slots, so they cannot drift apart. `Barcode` draws Code 128-B from
`shared/barcode.ts` as SVG. `SignatureField` opens a full-screen pop-up with `SignaturePad`, which keeps strokes in
memory and exports a white PNG in the pad's shape (fitted into 1500×900).

## Shop time zone

Days, weeks (Sunday–Saturday) and months are counted in `SHOP_TIME_ZONE` (default America/New_York) by
`shared/shopTime.ts`, including daylight-saving days. Times are stored in UTC and shown in the shop time zone with its
abbreviation (e.g. "3:30 PM EST").
