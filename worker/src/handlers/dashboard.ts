/**
 * Confirmation and delivery views. Employees see everything; drivers see only the confirmations they saved. The day
 * summary, the deliveries list and order lookups are for employees only.
 */

import { isValidDate, ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { localDateKey, localDayRangeUtc, monthKey, weekStartKey, weekWithinMonth } from '../../../shared/shopTime.ts';
import type {
  AwaitingDelivery,
  CalendarCounts,
  CalendarMonth,
  ConfirmationCalendar,
  ConfirmationDetailResponse,
  ConfirmationListResponse,
  ConfirmationResult,
  DashboardSummary,
  DeliveryListItem,
  DeliveryListResponse,
  ShopOrderResponse,
} from '../../../shared/types.ts';
import { findShopOrder, getConfirmationDetail, getSignature, listCalendarRows, listConfirmations, toDriverDelivery } from '../db/confirmations.ts';
import { ApiError, json, SECURITY_HEADERS, validationError } from '../http.ts';
import type { RequestContext } from '../router.ts';
import { requireRole, requireUser } from '../auth.ts';
import { RATE_LIMITS, rateLimit, requireDemoAccess } from '../security.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => new ApiError(404, 'not_found', 'Confirmation not found.');

/**
 * 'employee': shop employees only. 'own': any signed-in account; returns the account id to limit results to for
 * drivers (their own confirmations) or undefined for employees (everything).
 */
async function guard(ctx: RequestContext, who: 'employee' | 'own'): Promise<number | undefined> {
  requireDemoAccess(ctx);
  const user = who === 'employee' ? await requireRole(ctx, 'employee') : await requireUser(ctx);
  await rateLimit(ctx, RATE_LIMITS.dashboard);
  return user.role === 'driver' ? user.id : undefined;
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
  const userId = await guard(ctx, 'own');
  const q = ctx.url.searchParams;
  const orderId = q.get('orderId')?.trim() || undefined;
  if (orderId !== undefined && (orderId.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(orderId))) {
    throw validationError([{ path: 'orderId', message: 'Enter a complete order ID' }]);
  }
  const resultRaw = q.get('result') || undefined;
  if (resultRaw !== undefined && resultRaw !== 'confirmed' && resultRaw !== 'needs_review') {
    throw validationError([{ path: 'result', message: 'Must be confirmed or needs_review' }]);
  }
  // One shop-local day (e.g. a day opened in the Confirmations tab).
  const day = q.get('day') || undefined;
  if (day !== undefined && !isValidDate(day)) throw validationError([{ path: 'day', message: 'Use YYYY-MM-DD' }]);
  const dayRange = day ? localDayRangeUtc(day, ctx.settings.timeZone) : undefined;
  const body: ConfirmationListResponse = await listConfirmations(ctx.db, {
    userId,
    orderId,
    result: resultRaw as ConfirmationResult | undefined,
    flagged: q.get('flagged') === '1',
    range: dayRange ? { from: dayRange.start.toISOString(), to: dayRange.end.toISOString() } : undefined,
    limit: intParam(ctx, 'limit', 50, 1, 200),
    offset: intParam(ctx, 'offset', 0, 0, 100_000),
  });
  return json(body);
}

export async function detail(ctx: RequestContext): Promise<Response> {
  const userId = await guard(ctx, 'own');
  const id = ctx.params.id ?? '';
  if (!UUID.test(id)) throw NOT_FOUND();
  const confirmation = await getConfirmationDetail(ctx.db, id.toLowerCase(), userId);
  if (!confirmation) throw NOT_FOUND();
  const body: ConfirmationDetailResponse = { confirmation };
  return json(body);
}

/** The saved signature image. Never cached, never sniffed, sandboxed if opened directly. */
export async function signature(ctx: RequestContext): Promise<Response> {
  const userId = await guard(ctx, 'own');
  const id = ctx.params.id ?? '';
  if (!UUID.test(id)) throw NOT_FOUND();
  const bytes = await getSignature(ctx.db, id.toLowerCase(), userId);
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
  await guard(ctx, 'employee');
  const today = localDateKey(ctx.now, ctx.settings.timeZone);
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

const zero = (): CalendarCounts => ({ count: 0, needsReview: 0, flagged: 0 });
function bump(c: CalendarCounts, result: ConfirmationResult, flagged: boolean): void {
  c.count++;
  if (result === 'needs_review') c.needsReview++;
  if (flagged) c.flagged++;
}

/**
 * Confirmations grouped by shop-local month → week (Sunday–Saturday, split at month boundaries) → day, newest first.
 * The current month, week and day are always present so the Confirmations tab can open on them.
 */
export async function calendar(ctx: RequestContext): Promise<Response> {
  const userId = await guard(ctx, 'own');
  const tz = ctx.settings.timeZone;
  const today = localDateKey(ctx.now, tz);
  type DayAcc = CalendarCounts & { date: string };
  type WeekAcc = CalendarCounts & { start: string; end: string; days: Map<string, DayAcc> };
  type MonthAcc = CalendarCounts & { month: string; weeks: Map<string, WeekAcc> };
  const months = new Map<string, MonthAcc>();

  const slot = (date: string) => {
    const m = monthKey(date);
    let month = months.get(m);
    if (!month) months.set(m, (month = { month: m, ...zero(), weeks: new Map() }));
    const span = weekWithinMonth(date);
    let week = month.weeks.get(span.start);
    if (!week) month.weeks.set(span.start, (week = { ...span, ...zero(), days: new Map() }));
    let day = week.days.get(date);
    if (!day) week.days.set(date, (day = { date, ...zero() }));
    return { month, week, day };
  };

  slot(today); // always show where "now" is
  for (const row of await listCalendarRows(ctx.db, userId)) {
    const date = localDateKey(new Date(row.confirmed_at), tz);
    const { month, week, day } = slot(date);
    for (const c of [month, week, day]) bump(c, row.result, row.flagged === 1);
  }

  const desc = <T>(entries: Iterable<[string, T]>) => [...entries].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, v]) => v);
  const body: ConfirmationCalendar = {
    timeZone: tz,
    today,
    currentWeekStart: weekStartKey(today),
    months: desc(months).map(
      (m): CalendarMonth => ({
        month: m.month,
        count: m.count,
        needsReview: m.needsReview,
        flagged: m.flagged,
        weeks: desc(m.weeks).map((w) => ({
          start: w.start,
          end: w.end,
          count: w.count,
          needsReview: w.needsReview,
          flagged: w.flagged,
          days: desc(w.days).map((d) => ({ date: d.date, count: d.count, needsReview: d.needsReview, flagged: d.flagged })),
        })),
      }),
    ),
  };
  return json(body);
}

/** One order as the shop sees it: details plus whether (and when) it was confirmed. */
export async function order(ctx: RequestContext): Promise<Response> {
  await guard(ctx, 'employee');
  const orderId = (ctx.params.orderId ?? '').trim();
  if (!orderId || orderId.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(orderId)) throw new ApiError(404, 'order_not_found', 'Order not found.');
  const found = await findShopOrder(ctx.db, orderId);
  if (!found) throw new ApiError(404, 'order_not_found', 'Order not found.');
  const { delivery, confirmation } = found;
  const body: ShopOrderResponse = {
    status: confirmation ? 'confirmed' : delivery.cancelled_at ? 'cancelled' : 'awaiting',
    delivery: { ...toDriverDelivery(delivery), deliveryDate: delivery.delivery_date },
    confirmation: confirmation ? { id: confirmation.id, confirmedAt: confirmation.confirmed_at, result: confirmation.result } : null,
  };
  return json(body);
}

const STATUSES = ['all', 'awaiting', 'confirmed', 'exception', 'cancelled'] as const;

/**
 * Employees' deliveries list: every order for a day (default today) or, with ?q=, orders whose ID or recipient name
 * contains the text (any day). Filter by status; 10 per page by default.
 */
export async function deliveries(ctx: RequestContext): Promise<Response> {
  await guard(ctx, 'employee');
  const q = ctx.url.searchParams;
  const text = (q.get('q') ?? '').trim();
  if (text.length > 100) throw validationError([{ path: 'q', message: 'Use at most 100 characters' }]);
  const status = (q.get('status') || 'all') as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) throw validationError([{ path: 'status', message: `Must be one of: ${STATUSES.join(', ')}` }]);
  const dateRaw = q.get('date') || undefined;
  if (dateRaw !== undefined && !isValidDate(dateRaw)) throw validationError([{ path: 'date', message: 'Use YYYY-MM-DD' }]);
  const date = dateRaw ?? (text ? undefined : localDateKey(ctx.now, ctx.settings.timeZone));

  // Fixed clauses with placeholders only; user text is always bound, with LIKE wildcards escaped.
  const where: string[] = [];
  const binds: unknown[] = [];
  if (date) {
    where.push('d.delivery_date = ?');
    binds.push(date);
  }
  if (text) {
    where.push(`(d.order_id LIKE ? ESCAPE '!' OR d.recipient_name LIKE ? ESCAPE '!')`);
    const like = `%${text.replace(/[!%_]/g, (c) => `!${c}`)}%`;
    binds.push(like, like);
  }
  if (status === 'awaiting') where.push('d.cancelled_at IS NULL AND c.id IS NULL');
  if (status === 'confirmed') where.push(`c.result = 'confirmed'`);
  if (status === 'exception') where.push(`c.result = 'needs_review'`);
  if (status === 'cancelled') where.push('d.cancelled_at IS NOT NULL AND c.id IS NULL');
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM deliveries d LEFT JOIN delivery_confirmations c ON c.delivery_id = d.id';
  const limit = intParam(ctx, 'limit', 10, 1, 100);
  const offset = intParam(ctx, 'offset', 0, 0, 100_000);

  type Row = {
    order_id: string;
    stop_number: number | null;
    zone: string | null;
    recipient_name: string | null;
    city: string;
    delivery_date: string | null;
    cancelled_at: string | null;
    c_id: string | null;
    confirmed_at: string | null;
    result: ConfirmationResult | null;
    received_by: string | null;
  };
  const [rows, count] = await ctx.db.batch<Row | { n: number }>([
    ctx.db
      .prepare(
        `SELECT d.order_id, d.stop_number, d.zone, d.recipient_name, d.city, d.delivery_date, d.cancelled_at,
                c.id AS c_id, c.confirmed_at, c.result, c.received_by
           ${from}${clause}
          ORDER BY d.delivery_date DESC, d.stop_number IS NULL, d.stop_number, d.order_id
          LIMIT ? OFFSET ?`,
      )
      .bind(...binds, limit, offset),
    ctx.db.prepare(`SELECT COUNT(*) AS n ${from}${clause}`).bind(...binds),
  ]);
  const body: DeliveryListResponse = {
    total: (count!.results[0] as { n: number }).n,
    items: (rows!.results as Row[]).map(
      (r): DeliveryListItem => ({
        orderId: r.order_id,
        stopNumber: r.stop_number,
        zone: r.zone,
        recipientName: r.recipient_name,
        city: r.city,
        deliveryDate: r.delivery_date,
        status: r.c_id ? (r.result === 'confirmed' ? 'confirmed' : 'exception') : r.cancelled_at ? 'cancelled' : 'awaiting',
        confirmation: r.c_id ? { id: r.c_id, confirmedAt: r.confirmed_at!, result: r.result!, receivedBy: r.received_by! } : null,
      }),
    ),
  };
  return json(body);
}
