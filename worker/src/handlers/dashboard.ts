/**
 * Employee confirmation dashboard endpoints.
 *
 * IMPORTANT: there is no login, so these endpoints cannot check that the caller is an employee. They are served only
 * inside the local demonstration (requireDemoAccess) and must not be exposed publicly until an access model is
 * approved (docs/SECURITY.md).
 */

import { isValidDate, ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import type { AwaitingDelivery, ConfirmationDetailResponse, ConfirmationListResponse, ConfirmationResult, DashboardSummary } from '../../../shared/types.ts';
import { getConfirmationDetail, getSignature, listConfirmations } from '../db/confirmations.ts';
import { ApiError, json, SECURITY_HEADERS, validationError } from '../http.ts';
import type { RequestContext } from '../router.ts';
import { RATE_LIMITS, rateLimit, requireDemoAccess } from '../security.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => new ApiError(404, 'not_found', 'Confirmation not found.');

async function guard(ctx: RequestContext): Promise<void> {
  requireDemoAccess(ctx);
  await rateLimit(ctx, RATE_LIMITS.dashboard);
}

function intParam(ctx: RequestContext, name: string, fallback: number, min: number, max: number): number {
  const raw = ctx.url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw validationError([{ path: name, message: `Must be a whole number from ${min} to ${max}` }]);
  }
  return Number(raw);
}

export async function list(ctx: RequestContext): Promise<Response> {
  await guard(ctx);
  const q = ctx.url.searchParams;
  const orderId = q.get('orderId')?.trim() || undefined;
  if (orderId !== undefined && (orderId.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(orderId))) {
    throw validationError([{ path: 'orderId', message: 'Enter a complete order ID' }]);
  }
  const resultRaw = q.get('result') || undefined;
  if (resultRaw !== undefined && resultRaw !== 'confirmed' && resultRaw !== 'needs_review') {
    throw validationError([{ path: 'result', message: 'Must be confirmed or needs_review' }]);
  }
  const date = q.get('date') || undefined;
  if (date !== undefined && !isValidDate(date)) throw validationError([{ path: 'date', message: 'Use YYYY-MM-DD' }]);
  const body: ConfirmationListResponse = await listConfirmations(ctx.db, {
    orderId,
    result: resultRaw as ConfirmationResult | undefined,
    flagged: q.get('flagged') === '1',
    date,
    limit: intParam(ctx, 'limit', 50, 1, 200),
    offset: intParam(ctx, 'offset', 0, 0, 100_000),
  });
  return json(body);
}

export async function detail(ctx: RequestContext): Promise<Response> {
  await guard(ctx);
  const id = ctx.params.id ?? '';
  if (!UUID.test(id)) throw NOT_FOUND();
  const confirmation = await getConfirmationDetail(ctx.db, id.toLowerCase());
  if (!confirmation) throw NOT_FOUND();
  const body: ConfirmationDetailResponse = { confirmation };
  return json(body);
}

/** The saved signature image. Never cached, never sniffed, sandboxed if opened directly. */
export async function signature(ctx: RequestContext): Promise<Response> {
  await guard(ctx);
  const id = ctx.params.id ?? '';
  if (!UUID.test(id)) throw NOT_FOUND();
  const bytes = await getSignature(ctx.db, id.toLowerCase());
  if (!bytes) throw NOT_FOUND();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="signature.png"',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

/**
 * Per-day overview. The only reliable list of expected deliveries is the orders scheduled for that day
 * (deliveries.delivery_date) that are not cancelled; nothing is reported as missing without it.
 */
export async function summary(ctx: RequestContext): Promise<Response> {
  await guard(ctx);
  const today = ctx.now.toISOString().slice(0, 10);
  const date = ctx.url.searchParams.get('date') || today;
  if (!isValidDate(date)) throw validationError([{ path: 'date', message: 'Use YYYY-MM-DD' }]);

  const [counts, awaiting] = await ctx.db.batch<Record<string, number> | AwaitingRow>([
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS expected,
                COALESCE(SUM(CASE WHEN c.result = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed,
                COALESCE(SUM(CASE WHEN c.result = 'needs_review' THEN 1 ELSE 0 END), 0) AS needs_review,
                COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM confirmation_attempts a WHERE a.confirmation_id = c.id) THEN 1 ELSE 0 END), 0) AS flagged
           FROM deliveries d
           LEFT JOIN delivery_confirmations c ON c.delivery_id = d.id
          WHERE d.delivery_date = ? AND d.cancelled_at IS NULL`,
      )
      .bind(date),
    ctx.db
      .prepare(
        `SELECT d.order_id, d.stop_number, d.zone, d.recipient_name, d.city
           FROM deliveries d
          WHERE d.delivery_date = ? AND d.cancelled_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM delivery_confirmations c WHERE c.delivery_id = d.id)
          ORDER BY d.stop_number IS NULL, d.stop_number, d.order_id
          LIMIT 500`,
      )
      .bind(date),
  ]);
  const c = counts!.results[0] as Record<string, number>;
  const body: DashboardSummary = {
    date,
    isPast: date < today,
    expected: c.expected ?? 0,
    confirmed: c.confirmed ?? 0,
    needsReview: c.needs_review ?? 0,
    flagged: c.flagged ?? 0,
    awaiting: (awaiting!.results as AwaitingRow[]).map(
      (r): AwaitingDelivery => ({ orderId: r.order_id, stopNumber: r.stop_number, zone: r.zone, recipientName: r.recipient_name, city: r.city }),
    ),
  };
  return json(body);
}

interface AwaitingRow {
  order_id: string;
  stop_number: number | null;
  zone: string | null;
  recipient_name: string | null;
  city: string;
}
