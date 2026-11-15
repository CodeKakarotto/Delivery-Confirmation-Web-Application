# Security, privacy and the no-login limitation

## The limitation

This prototype has **no login**: a project requirement. Without one, the server cannot know who is using it. Hiding a
button or page does not change that. In particular:

- A submitted signature does **not** authenticate the driver, and nothing identifies a driver or employee.
- The dashboard cannot be restricted to employees.
- Anyone who can reach the API could read proof-of-delivery records (names, addresses, signatures).

So the prototype **fails closed**:

| Where | Delivery data served? |
| --- | --- |
| `APP_ENV=development`, request to `localhost` / `127.0.0.1` / `::1` | Yes (local demonstration) |
| `APP_ENV=development`, request to a host listed in `DEV_EXTRA_HOSTS` | Yes (e.g. a phone on the same Wi-Fi) |
| Anything else, including any deployed URL | No: `503 access_model_required` |

`/api/health` and `/api/config` stay available and contain no customer data. **Use synthetic data only.**

## Decisions needed before real use

These were not decided by the developer, on purpose:

1. **Access model.** How should drivers and employees be restricted? Options to discuss with the sponsor: reuse the
   route app's Cloudflare Access + Auth0 sign-in for the dashboard only; delivery-specific signed links issued by the
   route app to the assigned driver; or keep the app on the shop's private network. None is implemented.
2. **Delivery exception list.** The five options (delivered to recipient, left at door, front desk / reception,
   neighbor, other) are the instruction file's suggestions and still need sponsor review.
3. **Which exceptions count as a completed delivery.** Currently only "Delivered to recipient" is saved as
   `confirmed`; every other outcome is saved as `needs_review`.
4. **Zone source.** Neither app stores zones yet. Zones show as "—" unless an order has one.
5. **Total products source.** The route app has no product count. Totals show as "Not recorded" unless set.
6. **Signature retention and deletion.** How long signatures are kept and who may delete them.
7. **Photos.** Not implemented. Needs storage, access, retention and cost review first.

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
- "Today" on the dashboard is the UTC date, which differs from Eastern time in the evening.
- No retention or deletion of signatures has been implemented (pending decision 6).
