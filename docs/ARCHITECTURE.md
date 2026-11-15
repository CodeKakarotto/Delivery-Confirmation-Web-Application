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
| `/dashboard` | Employee dashboard |
| `/dashboard/confirmations/:id` | Saved record and printout |

`DeliveryCard` renders the required field order once; the driver form (`DriverConfirmPage`) and the saved record
(`SavedConfirmationCard`) fill its slots, so they cannot drift apart. `Barcode` draws Code 128-B from
`shared/barcode.ts` as SVG. `SignaturePad` keeps strokes in memory and exports a 900×300 white PNG.
