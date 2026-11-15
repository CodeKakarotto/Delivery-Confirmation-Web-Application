# Michael's Flowers — Mobile Delivery Confirmation

Prototype 3 of the Michael's Flowers capstone: a mobile-friendly web app that replaces paper delivery confirmation
sheets. Drivers open an order, record how it was handed over, who received it and the customer's signature. Employees
review the saved proof of delivery on a dashboard, find it by order ID and print it.

It uses the same stack and visual design as the route-optimization prototype (React + TypeScript + Vite, Cloudflare
Workers, Cloudflare D1, the sponsor's logo and color tokens), so the two can be merged later
([docs/INTEGRATION.md](docs/INTEGRATION.md)).

> **No login, local demonstration only.** The prototype has no sign-in, as the project requires. That means it cannot
> tell a driver from an employee from a stranger, so the Worker serves delivery data **only** with `APP_ENV=development`
> on `localhost`. Use synthetic data only. Read [docs/SECURITY.md](docs/SECURITY.md) before connecting anything real.

## Features

- **Driver screen** (`/confirm`): open one order by its exact ID. The card shows, in this order:
  `#` → Zone → Order ID + Code 128 barcode → Deliver To (a **Delivered to recipient** bubble, then the Delivery
  Exception options) → Total Products → Delivery Instructions (with Received By and Customer Signature).
- **Signature pop-up**: "Tap to sign" opens a full-screen signing area (Clear, Cancel, Done); the card then shows the
  signature with Re-sign and Clear. A typed name never counts as a signature.
- **Back buttons** on every driver screen and shop page.
- Server-side validation of every field, including a structural check of the signature PNG.
- Safe submission: a double tap or a retry after a lost response never saves twice (idempotency key); entries are kept
  after a recoverable failure; success is shown only after the server confirms the save.
- **Shop employees section** (`/shop`), kept apart from the driver screens (but not sign-in protected; see below).
  The header always shows today's date and the current week (shop time zone, America/New_York).
  - **Overview**: the day's scheduled orders vs saved confirmations; awaiting/missing orders open an order view.
  - **Confirmations**: month → week (Sunday–Saturday) → day → each delivery with its **delivery time**, opening on this
    month, this week and today. 10 deliveries per page. Exact order-ID search and Needs review / Flagged filters.
  - **Record and print** (`/shop/confirmations/:id`): the saved record in the same field order, with logo, barcode,
    signature and delivery time, and refused duplicate/conflicting attempts.

## Getting started

**Windows, one click:** double-click `Start-App.bat`. The first time, it installs packages, creates `.dev.vars` and
the demo database. It then starts the API and the website in two windows and opens http://localhost:5173. Close
those two windows to stop the app.

Manual steps (any OS). Requires Node.js 22.18+ (see `.nvmrc`).

```bash
npm install
cp .dev.vars.example .dev.vars        # then set APP_SECRET to a long random string
npm run db:setup:local                # local D1: migrations + synthetic demo orders
npm run dev:api                       # Worker API on http://127.0.0.1:8787
npm run dev:web                       # app on http://localhost:5173 (proxies /api to the Worker)
```

Open http://localhost:5173. Demo order IDs: `MF-10482`, `MF-10483`, `MF-10484`, `MF-10485` (no zone, stop or product
total, to show missing values), `FTD-2207731`, `MF-10490` (cancelled).

To try the driver screen on a phone on the same Wi-Fi, add this computer's LAN address to `DEV_EXTRA_HOSTS` in
`.dev.vars` and run Vite with `--host`. Still synthetic data only.

## Checks

```bash
npm test            # Worker API, barcode and React component tests (Node's built-in test runner)
npm run typecheck   # Worker, frontend and tests
npm run build:web   # production build
npm run check       # all three
```

## Documentation

| File | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit, request flow, design reuse |
| [docs/API.md](docs/API.md) | Endpoints, requests, responses and error codes |
| [docs/SCHEMA.md](docs/SCHEMA.md) | D1 tables and constraints |
| [docs/SECURITY.md](docs/SECURITY.md) | No-login limitations, controls, **decisions needed before production** |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | How to connect this to the route-optimization app |
| [docs/TESTING.md](docs/TESTING.md) | Test layout and what is covered |
