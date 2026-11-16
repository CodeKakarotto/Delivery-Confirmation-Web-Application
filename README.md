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

- **Sign-in** for drivers and shop employees (username and password; details in docs/SECURITY.md).
  - **Drivers**: Dashboard and Confirmations tabs. Only drivers can confirm deliveries, and they see only their own
    confirmations.
  - **Shop employees**: Dashboard (calendar), Deliveries and Search tabs. View only.
- **Driver dashboard** (`/driver`): today's awaiting deliveries on the left, **5 per page** (tap one to confirm it);
  "Can't find the order? Enter the order ID" on the right; **Recently confirmed** below. **Confirmations** tab: a month
  calendar of the driver's own confirmations with times and signatures.

- **Driver screen** (`/confirm`): open one order by its exact ID. The card shows, in this order:
  `#` → Zone → Order ID + Code 128 barcode → Deliver To (a **Delivered to recipient** bubble, then the Delivery
  Exception options) → Total Products → Delivery Instructions (with Received By and Customer Signature).
- **Delivered to recipient**: Received By and the customer signature ("Tap to sign" opens a full-screen signing area).
  **Delivery exception**: no signature; an **Exception note \*** (required) and Received By. Total Products lists the
  order's products.
- **Back buttons** on every driver screen and shop page.
- Server-side validation of every field, including a structural check of the signature PNG.
- Safe submission: a double tap or a retry after a lost response never saves twice (idempotency key); entries are kept
  after a recoverable failure; success is shown only after the server confirms the save.
- **Shop employees** Dashboard (`/shop`, view only): a **single month calendar**. The current week's row is highlighted,
  today is circled, and today's date is written underneath (shop time zone, America/New_York). Each day shows how many
  deliveries were confirmed. Tapping a day shows its figures, the orders still awaiting (tap to open) and the confirmed
  deliveries with their **delivery time**, 10 per page. **Deliveries** tab: a small calendar (**Month** or **Week**) where tapping
  a day lists that day's deliveries underneath (10 per page, filter by status), plus a **Day** view. **Search** tab: part of an order ID or recipient name.
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

Open http://localhost:5173 and sign in. The first start creates demo accounts (`npm run users:demo`) and saves their
usernames and passwords to `demo-accounts.local.txt` (ignored by git). Add an account with
`npm run users:create -- <username> <driver|employee> "<Display Name>"` (prints a one-time password). Every start (and `npm run db:demo-today:local`) adds twelve demo orders for today
(`MF-MMDD-01` … `-12`) if they are not there yet. Other demo order IDs: `MF-10482`, `MF-10483`, `MF-10484`, `MF-10485` (no zone, stop or product
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
