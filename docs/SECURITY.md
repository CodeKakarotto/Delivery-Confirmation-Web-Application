# Security and privacy

## Sign-in (added at the team's request)

The original instruction file asked for no login. The team has since asked for sign-in accounts for drivers and shop
employees (no two-factor), so the app now requires a signed-in account for all delivery data.

| Who | Can do |
| --- | --- |
| Driver | Dashboard (today's awaiting orders, find an order, recently confirmed), confirm deliveries, Confirmations tab (calendar of **their own** confirmations, with signatures) |
| Shop employee | Dashboard (calendar of all deliveries), Deliveries list, Search, every confirmation record. **View only**: cannot confirm |

The Worker enforces this on every request (`requireRole` / `requireUser` in `worker/src/auth.ts`); the screens only
mirror it. A driver asking for another driver's record or signature gets 404.

**Measures**
- **Passwords**: PBKDF2-SHA256, 100,000 iterations (the Workers maximum), random 16-byte salt per account,
  constant-time comparison. Only the hash is stored; passwords are never logged. Generated passwords are 16 random
  characters.
- **Sessions**: random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` and `__Host-` prefixed over
  HTTPS); scripts cannot read it. Only the token's SHA-256 is stored. A new session on every sign-in. Sessions end
  after **2 hours idle** or **12 hours** in total, or when the account is deactivated. **Sign out** is full: it ends
  every session of the account (all devices and tabs), the browser is told to wipe this site's cookies, cache and
  storage (`Clear-Site-Data`), the app reloads to a clean sign-in page, and pages restored by Back are reloaded, so
  nothing from the session can be shown again.
- **Forgery protection**: every change needs the session's anti-forgery token (`X-CSRF-Token`) and a same-site
  `Origin`; JSON-only bodies; no CORS.
- **Guessing**: 5 wrong passwords lock a username for up to 15 minutes (also for usernames that do not exist, so the
  lock reveals nothing); at most 20 sign-in attempts per device per 15 minutes. Every failure says "The username or
  password is incorrect", and unknown usernames take as long to check as wrong passwords.
- **Responses**: `Cache-Control: no-store` everywhere; generic errors with a request ID; logs carry account IDs and
  event names only, never passwords, tokens, customer details or signatures.
- **Accounts** are created by an administrator with `npm run users:create` (no self-registration). Demo accounts come
  from `npm run users:demo`; their passwords are saved to `demo-accounts.local.txt`, which git ignores.

Not included (by request or scope): two-factor sign-in, self-service password reset, a password change screen.

## Local demonstration only

The app still serves delivery data only in the local demonstration, and still uses **synthetic data only**:

| Where | Delivery data served? |
| --- | --- |
| `APP_ENV=development`, request to `localhost` / `127.0.0.1` / `::1` | Yes (local demonstration) |
| `APP_ENV=development`, request to a host listed in `DEV_EXTRA_HOSTS` | Yes (e.g. a phone on the same Wi-Fi) |
| Anything else, including any deployed URL | No: `503 access_model_required` |

Deploying it needs HTTPS, real accounts and a review of the decisions below.

## Data kept on the driver's phone (offline mode)

To work without signal, the driver's phone keeps (in the browser's IndexedDB, for this site only):
- confirmations not sent yet, **including the customer signature**, until they are sent;
- today's awaiting orders with names and addresses, replaced each day.

Sent confirmations are deleted at once; yesterday's copy is deleted when the day changes; signing out wipes everything
(Clear-Site-Data) and warns first if anything has not been sent. Refused confirmations are never deleted silently: they
stay marked "needs attention" until the driver removes them. **The sponsor should approve this, and drivers' phones need a
screen lock.**

## Decisions needed before real use

These were not decided by the developer, on purpose:

1. **Accounts in the combined system.** These local accounts work for the prototype. When the prototypes are merged,
   decide whether to keep them or use the route app's Cloudflare Access + Auth0 sign-in.
2. **Delivery exception list.** The five options (delivered to recipient, left at door, front desk / reception,
   neighbor, other) are the instruction file's suggestions and still need sponsor review.
3. **Which exceptions count as a completed delivery.** Currently only "Delivered to recipient" is saved as
   `confirmed`; every other outcome is saved as `needs_review`.
4. **Zone source.** Neither app stores zones yet. Zones show as "—" unless an order has one.
5. **Total products source.** The route app has no product count. Totals show as "Not recorded" unless set.
6. **Signature retention and deletion.** Decided: the database keeps the last 30 days of deliveries (`RETENTION_DAYS`); older ones, signatures and slip photos included, are deleted automatically (nightly online, on every start locally after a successful backup). Backups keep older copies for as long as they are kept (newest 30): include them in any retention promise.
7. **Photos.** None are collected any more (the paper-slip section was removed). Records entered from paper earlier keep their slip photo, shown only to employees with `no-store`, and are deleted with the record after 30 days.

## Controls in place

**Validation (Worker, authoritative).** Strict JSON schemas (unknown fields rejected, so no client timestamps, results,
zones or stop numbers), field lengths, allowed values, `Content-Type: application/json` only, a body size limit (300 KB
for a submission, 16 KB otherwise). "Other" requires an explanation.

**Signature.** The PNG is decoded and checked structurally: signature bytes, IHDR first, every chunk length and CRC,
allowed chunk types only (text/metadata chunks refused), IDAT present, IEND last, 100–2400 × 50–1200 px, at most
200 KB. Stored as a BLOB in D1 and served only by
`GET /api/dashboard/confirmations/:uuid/signature` with `Cache-Control: no-store`, `nosniff` and a sandboxing CSP. The
record ID is a random UUID, but that is not relied on as protection.

**Data integrity.** Parameterized SQL everywhere. `UNIQUE(delivery_id)` (one confirmation per order),
`UNIQUE(idempotency_key)` (one save per form), foreign keys, CHECK constraints (including "Other needs a detail" and
"result matches outcome"). The insert copies the order ID, stop and zone from the order itself, and only if the order
is not cancelled at that instant. The server sets `confirmed_at` (UTC). Saved confirmations are never updated: later
submissions are refused (409) and recorded as `duplicate` or `conflict` attempts for review.

**Cross-site requests.** State-changing requests need an `Origin` matching the site (or `ALLOWED_ORIGINS`) and are
refused if `Sec-Fetch-Site` says cross-site. JSON-only bodies force a CORS preflight, which is never granted. No CORS
headers are sent.

**Abuse.** D1-backed fixed-window rate limits per client: 60 order lookups/min, 20 submissions/min, 300 dashboard
requests/min. Clients are keyed by an HMAC of the IP (`APP_SECRET`); raw IPs are never stored. Not-found lookups
count too, so order IDs cannot be guessed quickly.

**Exposure.** No endpoint lists orders. The driver lookup returns only the fields needed for one delivery, and nothing
but the time for an order that is already confirmed. Dashboard data uses separate endpoints.

**Responses and logs.** Every API response has `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`. Unexpected errors return a generic message with a request
ID. Logs hold only event names, result codes, route templates and request IDs: no names, addresses, notes, order IDs or
signature data (tested).

**Browser.** The CSP and headers follow the route app (`frontend/public/_headers`). No `dangerouslySetInnerHTML`; all
customer text renders as text. No analytics or third-party scripts. Nothing about deliveries is stored in local/session
storage (only the light/dark theme choice). Customer data never goes in URLs; only the order ID does.

**Secrets.** None in the repository. `APP_SECRET` lives in `.dev.vars` (git-ignored) or Cloudflare secrets.

## Known gaps

- No access control beyond "local demonstration only" (see above).
- Rate limits are per IP. Clients behind one shared address (e.g. the shop's Wi-Fi) share a limit.
- No retention or deletion of signatures has been implemented (pending decision 6).

## Backups

`scripts/backup-local.ts` copies the local database (with SQLite `VACUUM INTO`, checked with `PRAGMA integrity_check`)
on every start of `Start-App.bat`; the newest 30 are kept. Backups hold the same personal data as the database
(names, addresses, signatures, slip photos): the `backups/` folder is git-ignored and must stay private. A
`BACKUP_DIR` outside the computer (OneDrive, USB) protects against losing the machine. Restoring
(`scripts/restore-local.ts`) refuses while the app is running and backs up the current data first.
