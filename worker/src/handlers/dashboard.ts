/**
 * Confirmation and delivery views. Employees see everything; drivers see only the confirmations they saved. The day
 * summary, the deliveries list and order lookups are for employees only.
 */

import { correctionSchema, isValidDate, ORDER_ID_MAX, ORDER_ID_PATTERN, voidSchema } from '../../../shared/schemas.ts';
import { addDays, localDateKey, localDayRangeUtc, localTimeHHMM, monthKey, weekStartKey, weekWithinMonth } from '../../../shared/shopTime.ts';
import { OUTCOME_LABELS } from '../../../shared/types.ts';
import { SEARCH_FIELDS, searchClause } from '../db/search.ts';
import type {
  SearchField,
  MissedDeliveries,
  AwaitingDelivery,
  CalendarCounts,
  CalendarMonth,
  ConfirmationCalendar,
  ConfirmationDetailResponse,
  ConfirmationListResponse,
  ConfirmationResult,
  ConfirmationSubmitResponse,
  DailyReport,
  DailyReportRow,
  DashboardSummary,
  DeliveryCalendarResponse,
  DeliveryOutcome,
  DeliveryDayCounts,
  DeliveryListItem,
  DeliveryListResponse,
  ShopOrderResponse,
} from '../../../shared/types.ts';
import {
  findConfirmationByDelivery,
  findConfirmationByKey,
  findDeliveryByOrderId,
  findShopOrder,
  getConfirmationDetail,
  getConfirmationState,
  getSignature,
  getSlipPhoto,
  insertConfirmation,
  listCalendarRows,
  listConfirmations,
  toDriverDelivery,
  toReceipt,
} from '../db/confirmations.ts';
import { ApiError, isUniqueViolation, json, logEvent, readJson, SECURITY_HEADERS, validationError } from '../http.ts';
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
  const text = (q.get('q') ?? '').trim();
  if (text.length > 100) throw validationError([{ path: 'q', message: 'Use at most 100 characters' }]);
  const field = (q.get('in') || 'all') as SearchField;
  if (!SEARCH_FIELDS.includes(field)) throw validationError([{ path: 'in', message: `Must be one of: ${SEARCH_FIELDS.join(', ')}` }]);
  const zone = (q.get('zone') ?? '').trim();
  if (zone && !/^[A-Za-z0-9]{1,8}$/.test(zone)) throw validationError([{ path: 'zone', message: 'Use a zone letter or number' }]);
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
    search: text ? { field, text } : undefined,
    zone: zone || undefined,
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
           LEFT JOIN delivery_confirmations c ON c.delivery_id = d.id AND c.voided_at IS NULL
          WHERE d.delivery_date = ? AND d.cancelled_at IS NULL`,
      )
      .bind(date),
    ctx.db
      .prepare(
        `SELECT d.order_id, d.stop_number, d.zone, d.recipient_name, d.city,
                (SELECT v.id FROM delivery_confirmations v WHERE v.delivery_id = d.id AND v.voided_at IS NOT NULL ORDER BY v.voided_at DESC LIMIT 1) AS voided_id
           FROM deliveries d
          WHERE d.delivery_date = ? AND d.cancelled_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM delivery_confirmations c WHERE c.delivery_id = d.id AND c.voided_at IS NULL)
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
      (r): AwaitingDelivery => ({
        orderId: r.order_id,
        stopNumber: r.stop_number,
        zone: r.zone,
        recipientName: r.recipient_name,
        city: r.city,
        voidedConfirmationId: r.voided_id ?? null,
      }),
    ),
  };
  return json(body);
}

/** How many days back the missed-deliveries alert looks (today included). */
export const MISSED_LOOKBACK_DAYS = 7;

/**
 * Employees: deliveries that were never confirmed (not cancelled, no active confirmation), so nothing slips by.
 * Earlier days of the last week always count; today counts once the shop's closing time has passed.
 */
export async function missed(ctx: RequestContext): Promise<Response> {
  await guard(ctx, 'employee');
  const tz = ctx.settings.timeZone;
  const today = localDateKey(ctx.now, tz);
  const afterClosing = localTimeHHMM(ctx.now, tz) >= ctx.settings.closingTime;
  const from = addDays(today, -(MISSED_LOOKBACK_DAYS - 1));
  const to = afterClosing ? today : addDays(today, -1);
  const res = await ctx.db
    .prepare(
      `SELECT d.delivery_date, d.order_id, d.stop_number, d.zone, d.recipient_name, d.city,
              (SELECT v.id FROM delivery_confirmations v WHERE v.delivery_id = d.id AND v.voided_at IS NOT NULL ORDER BY v.voided_at DESC LIMIT 1) AS voided_id
         FROM deliveries d
        WHERE d.delivery_date >= ? AND d.delivery_date <= ? AND d.cancelled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM delivery_confirmations c WHERE c.delivery_id = d.id AND c.voided_at IS NULL)
        ORDER BY d.delivery_date DESC, d.stop_number IS NULL, d.stop_number, d.order_id
        LIMIT 1000`,
    )
    .bind(from, to)
    .all<AwaitingRow & { delivery_date: string }>();
  const days: MissedDeliveries['days'] = [];
  for (const r of res.results) {
    let day = days[days.length - 1];
    if (!day || day.date !== r.delivery_date) days.push((day = { date: r.delivery_date, orders: [] }));
    day.orders.push({
      orderId: r.order_id,
      stopNumber: r.stop_number,
      zone: r.zone,
      recipientName: r.recipient_name,
      city: r.city,
      voidedConfirmationId: r.voided_id ?? null,
    });
  }
  const body: MissedDeliveries = {
    today,
    closingTime: ctx.settings.closingTime,
    afterClosing,
    lookbackDays: MISSED_LOOKBACK_DAYS,
    total: res.results.length,
    days,
  };
  return json(body);
}

interface AwaitingRow {
  voided_id?: string | null;
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
  const { delivery, confirmation, voided } = found;
  const body: ShopOrderResponse = {
    status: confirmation ? 'confirmed' : delivery.cancelled_at ? 'cancelled' : 'awaiting',
    delivery: { ...toDriverDelivery(delivery), deliveryDate: delivery.delivery_date },
    confirmation: confirmation ? { id: confirmation.id, confirmedAt: confirmation.confirmed_at, result: confirmation.result } : null,
    voidedConfirmations: voided,
  };
  return json(body);
}

const STATUSES = ['all', 'awaiting', 'confirmed', 'exception', 'cancelled', 'voided'] as const;

/**
 * Employees' deliveries list: every order for a day (default today) or, with ?q=, orders whose ID, recipient name or
 * address contains the text (any day; ?in=order|name|address narrows it). Filters: status (incl. voided), zone, a
 * date or a range of days; ?sort=oldest puts the earliest days first. 10 per page by default.
 */
export async function deliveries(ctx: RequestContext): Promise<Response> {
  await guard(ctx, 'employee');
  const q = ctx.url.searchParams;
  const text = (q.get('q') ?? '').trim();
  if (text.length > 100) throw validationError([{ path: 'q', message: 'Use at most 100 characters' }]);
  const field = (q.get('in') || 'all') as SearchField;
  if (!SEARCH_FIELDS.includes(field)) throw validationError([{ path: 'in', message: `Must be one of: ${SEARCH_FIELDS.join(', ')}` }]);
  const zone = (q.get('zone') ?? '').trim();
  if (zone && !/^[A-Za-z0-9]{1,8}$/.test(zone)) throw validationError([{ path: 'zone', message: 'Use a zone letter or number' }]);
  const oldestFirst = q.get('sort') === 'oldest';
  const status = (q.get('status') || 'all') as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) throw validationError([{ path: 'status', message: `Must be one of: ${STATUSES.join(', ')}` }]);
  const dateRaw = q.get('date') || undefined;
  if (dateRaw !== undefined && !isValidDate(dateRaw)) throw validationError([{ path: 'date', message: 'Use YYYY-MM-DD' }]);
  // A range of days (the week view): both ends, in order, at most 42 days.
  const rangeFrom = q.get('from') || undefined;
  const rangeTo = q.get('to') || undefined;
  if ((rangeFrom === undefined) !== (rangeTo === undefined)) throw validationError([{ path: rangeFrom ? 'to' : 'from', message: 'Give both from and to' }]);
  if (rangeFrom !== undefined && rangeTo !== undefined) {
    if (!isValidDate(rangeFrom) || !isValidDate(rangeTo)) throw validationError([{ path: 'from', message: 'Use YYYY-MM-DD' }]);
    const span = (Date.parse(`${rangeTo}T00:00:00Z`) - Date.parse(`${rangeFrom}T00:00:00Z`)) / 86_400_000;
    if (span < 0 || span > 400) throw validationError([{ path: 'to', message: 'Use a range of days with "from" before "to"' }]);
  }
  const range = rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo } : undefined;
  const date = range ? undefined : (dateRaw ?? (text ? undefined : localDateKey(ctx.now, ctx.settings.timeZone)));

  // Fixed clauses with placeholders only; user text is always bound, with LIKE wildcards escaped.
  const where: string[] = [];
  const binds: unknown[] = [];
  if (date) {
    where.push('d.delivery_date = ?');
    binds.push(date);
  }
  if (range) {
    where.push('d.delivery_date BETWEEN ? AND ?');
    binds.push(range.from, range.to);
  }
  if (text) {
    const s = searchClause(field, text);
    where.push(s.sql);
    binds.push(...s.binds);
  }
  if (zone) {
    where.push('d.zone = ? COLLATE NOCASE');
    binds.push(zone);
  }
  if (status === 'awaiting') where.push('d.cancelled_at IS NULL AND c.id IS NULL');
  if (status === 'confirmed') where.push(`c.result = 'confirmed'`);
  if (status === 'exception') where.push(`c.result = 'needs_review'`);
  if (status === 'cancelled') where.push('d.cancelled_at IS NOT NULL AND c.id IS NULL');
  if (status === 'voided') {
    where.push('c.id IS NULL AND EXISTS (SELECT 1 FROM delivery_confirmations v WHERE v.delivery_id = d.id AND v.voided_at IS NOT NULL)');
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM deliveries d LEFT JOIN delivery_confirmations c ON c.delivery_id = d.id AND c.voided_at IS NULL';
  const limit = intParam(ctx, 'limit', 10, 1, 200);
  const offset = intParam(ctx, 'offset', 0, 0, 100_000);

  type Row = {
    order_id: string;
    stop_number: number | null;
    zone: string | null;
    recipient_name: string | null;
    city: string;
    address_line: string;
    postal_code: string;
    delivery_date: string | null;
    cancelled_at: string | null;
    c_id: string | null;
    confirmed_at: string | null;
    result: ConfirmationResult | null;
    received_by: string | null;
    voided_id: string | null;
    change_count: number | null;
  };
  const [rows, count] = await ctx.db.batch<Row | { n: number }>([
    ctx.db
      .prepare(
        `SELECT d.order_id, d.stop_number, d.zone, d.recipient_name, d.city, d.address_line, d.postal_code, d.delivery_date, d.cancelled_at,
                c.id AS c_id, c.confirmed_at, c.result, c.received_by,
                (SELECT v.id FROM delivery_confirmations v WHERE v.delivery_id = d.id AND v.voided_at IS NOT NULL
                  ORDER BY v.voided_at DESC LIMIT 1) AS voided_id,
                (SELECT COUNT(*) FROM confirmation_corrections k WHERE k.confirmation_id = c.id) AS change_count
           ${from}${clause}
          ORDER BY d.delivery_date ${oldestFirst ? 'ASC' : 'DESC'}, d.stop_number IS NULL, d.stop_number, d.order_id
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
        voidedConfirmationId: r.c_id ? null : r.voided_id,
        changed: Boolean(r.c_id && r.change_count),
        addressLine: r.address_line,
        postalCode: r.postal_code,
      }),
    ),
  };
  return json(body);
}

/** Employees' month view: how many deliveries each day has, by status (days without deliveries are left out). */
export async function deliveryCalendar(ctx: RequestContext): Promise<Response> {
  await guard(ctx, 'employee');
  const today = localDateKey(ctx.now, ctx.settings.timeZone);
  const month = ctx.url.searchParams.get('month') || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || !isValidDate(`${month}-01`)) throw validationError([{ path: 'month', message: 'Use YYYY-MM' }]);
  const res = await ctx.db
    .prepare(
      `SELECT d.delivery_date AS date,
              COUNT(*) AS total,
              SUM(CASE WHEN c.id IS NULL AND d.cancelled_at IS NULL THEN 1 ELSE 0 END) AS awaiting,
              SUM(CASE WHEN c.result = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
              SUM(CASE WHEN c.result = 'needs_review' THEN 1 ELSE 0 END) AS exception,
              SUM(CASE WHEN c.id IS NULL AND d.cancelled_at IS NOT NULL THEN 1 ELSE 0 END) AS cancelled
         FROM deliveries d
         LEFT JOIN delivery_confirmations c ON c.delivery_id = d.id AND c.voided_at IS NULL
        WHERE d.delivery_date >= ? AND d.delivery_date <= ?
        GROUP BY d.delivery_date
        ORDER BY d.delivery_date`,
    )
    .bind(`${month}-01`, `${month}-31`)
    .all<DeliveryDayCounts>();
  const body: DeliveryCalendarResponse = { month, today, days: res.results };
  return json(body);
}

// ---------- Corrections, voids and paper entries (employees) ----------

const CONFIRMATION_NOT_FOUND = () => new ApiError(404, 'not_found', 'Confirmation not found.');
const VOIDED = () => new ApiError(409, 'voided', 'This confirmation was voided and can no longer be changed.');

async function detailResponse(ctx: RequestContext, id: string): Promise<Response> {
  const confirmation = await getConfirmationDetail(ctx.db, id);
  if (!confirmation) throw CONFIRMATION_NOT_FOUND();
  const body: ConfirmationDetailResponse = { confirmation };
  return json(body);
}

/**
 * Corrects the received-by name, the outcome or the exception note, with a required reason. The old and new values
 * are kept in the history; the signature is never changed. Voided records cannot be changed.
 */
export async function correct(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  const user = await requireRole(ctx, 'employee');
  await rateLimit(ctx, RATE_LIMITS.submit);
  const id = (ctx.params.id ?? '').toLowerCase();
  if (!UUID.test(id)) throw CONFIRMATION_NOT_FOUND();
  const input = await readJson(ctx.request, correctionSchema);
  const reason = input.reason.trim();
  if (!reason) throw validationError([{ path: 'reason', message: 'Write why the record is being corrected' }]);
  const current = await getConfirmationState(ctx.db, id);
  if (!current) throw CONFIRMATION_NOT_FOUND();
  if (current.voided_at) throw VOIDED();

  const receivedBy = input.receivedBy?.trim() || current.received_by;
  const outcome = input.outcome ?? current.outcome;
  let outcomeDetail = input.outcomeDetail !== undefined ? input.outcomeDetail.trim() || null : current.outcome_detail;
  if (outcome === 'delivered_to_recipient') outcomeDetail = null; // the exception note belongs to exceptions only
  if (outcome !== 'delivered_to_recipient' && !outcomeDetail) {
    throw validationError([{ path: 'outcomeDetail', message: 'Write an exception note: where or how the delivery was left' }]);
  }
  if (outcome === 'delivered_to_recipient' && current.has_signature !== 1 && current.source !== 'paper') {
    throw new ApiError(422, 'signature_required', 'A hand-off to the recipient needs the customer signature, and this record has none.', {
      issues: [{ path: 'outcome', message: 'This record has no customer signature' }],
    });
  }
  if (receivedBy === current.received_by && outcome === current.outcome && outcomeDetail === current.outcome_detail) {
    throw validationError([{ path: 'reason', message: 'Change at least one detail' }]);
  }

  const now = ctx.now.toISOString();
  await ctx.db.batch([
    ctx.db
      .prepare(
        `INSERT INTO confirmation_corrections (confirmation_id, kind, reason, old_received_by, new_received_by, old_outcome,
           new_outcome, old_outcome_detail, new_outcome_detail, by_user_id, created_at)
         SELECT ?, 'correction', ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM delivery_confirmations WHERE id = ? AND voided_at IS NULL)`,
      )
      .bind(id, reason, current.received_by, receivedBy, current.outcome, outcome, current.outcome_detail, outcomeDetail, user.id, now, id),
    ctx.db
      .prepare('UPDATE delivery_confirmations SET received_by = ?, outcome = ?, outcome_detail = ?, result = ? WHERE id = ? AND voided_at IS NULL')
      .bind(receivedBy, outcome, outcomeDetail, outcome === 'delivered_to_recipient' ? 'confirmed' : 'needs_review', id),
  ]);
  logEvent('info', 'confirmation_corrected', { userId: user.id, requestId: ctx.requestId });
  return detailResponse(ctx, id);
}

/** Voids a confirmation (e.g. saved against the wrong order). It stays visible, stops counting, and the order can be confirmed again. */
export async function voidConfirmation(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  const user = await requireRole(ctx, 'employee');
  await rateLimit(ctx, RATE_LIMITS.submit);
  const id = (ctx.params.id ?? '').toLowerCase();
  if (!UUID.test(id)) throw CONFIRMATION_NOT_FOUND();
  const input = await readJson(ctx.request, voidSchema);
  const reason = input.reason.trim();
  if (!reason) throw validationError([{ path: 'reason', message: 'Write why the record is being voided' }]);
  const current = await getConfirmationState(ctx.db, id);
  if (!current) throw CONFIRMATION_NOT_FOUND();
  if (current.voided_at) throw VOIDED();
  const now = ctx.now.toISOString();
  await ctx.db.batch([
    ctx.db
      .prepare(
        `INSERT INTO confirmation_corrections (confirmation_id, kind, reason, old_received_by, old_outcome, old_outcome_detail, by_user_id, created_at)
         SELECT ?, 'void', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM delivery_confirmations WHERE id = ? AND voided_at IS NULL)`,
      )
      .bind(id, reason, current.received_by, current.outcome, current.outcome_detail, user.id, now, id),
    ctx.db
      .prepare('UPDATE delivery_confirmations SET voided_at = ?, voided_by_user_id = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL')
      .bind(now, user.id, reason, id),
  ]);
  logEvent('info', 'confirmation_voided', { userId: user.id, requestId: ctx.requestId });
  return detailResponse(ctx, id);
}

/** The photo of a signed paper slip. Never cached, never sniffed, sandboxed if opened directly. */
export async function slipPhoto(ctx: RequestContext): Promise<Response> {
  const userId = await guard(ctx, 'own');
  const id = ctx.params.id ?? '';
  if (!UUID.test(id)) throw NOT_FOUND();
  const bytes = await getSlipPhoto(ctx.db, id.toLowerCase(), userId);
  if (!bytes) throw NOT_FOUND();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline; filename="paper-slip.jpg"',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Undo void and the end-of-day report (employees) ----------

/** Undoes a void (with a reason): the record counts again. Refused if the order has been confirmed again since. */
export async function unvoidConfirmation(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  const user = await requireRole(ctx, 'employee');
  await rateLimit(ctx, RATE_LIMITS.submit);
  const id = (ctx.params.id ?? '').toLowerCase();
  if (!UUID.test(id)) throw CONFIRMATION_NOT_FOUND();
  const input = await readJson(ctx.request, voidSchema);
  const reason = input.reason.trim();
  if (!reason) throw validationError([{ path: 'reason', message: 'Write why the void is being undone' }]);
  const current = await getConfirmationState(ctx.db, id);
  if (!current) throw CONFIRMATION_NOT_FOUND();
  if (!current.voided_at) throw new ApiError(409, 'not_voided', 'This confirmation is not voided.');
  const now = ctx.now.toISOString();
  try {
    await ctx.db.batch([
      ctx.db
        .prepare(
          `INSERT INTO confirmation_corrections (confirmation_id, kind, reason, by_user_id, created_at)
           SELECT ?, 'unvoid', ?, ?, ? WHERE EXISTS (SELECT 1 FROM delivery_confirmations WHERE id = ? AND voided_at IS NOT NULL)`,
        )
        .bind(id, reason, user.id, now, id),
      ctx.db
        .prepare('UPDATE delivery_confirmations SET voided_at = NULL, voided_by_user_id = NULL, void_reason = NULL WHERE id = ? AND voided_at IS NOT NULL')
        .bind(id),
    ]);
  } catch (err) {
    // Only one active confirmation per order: the order was confirmed again after this one was voided.
    if (isUniqueViolation(err, 'delivery_id')) {
      throw new ApiError(
        409,
        'order_reconfirmed',
        'This order has been confirmed again since this record was voided, so the void cannot be undone. Void the newer confirmation first if this one is the right one.',
      );
    }
    throw err;
  }
  logEvent('info', 'confirmation_unvoided', { userId: user.id, requestId: ctx.requestId });
  return detailResponse(ctx, id);
}

interface ReportRowDb {
  order_id: string;
  stop_number: number | null;
  zone: string | null;
  recipient_name: string | null;
  city: string;
  cancelled_at: string | null;
  c_id: string | null;
  received_by: string | null;
  outcome: DeliveryOutcome | null;
  outcome_detail: string | null;
  result: ConfirmationResult | null;
  confirmed_at: string | null;
  source: 'app' | 'paper' | null;
  corrected: number;
  flagged: number;
  change_count: number | null;
  voided_id: string | null;
}

async function buildReport(ctx: RequestContext): Promise<DailyReport> {
  await guard(ctx, 'employee');
  const today = localDateKey(ctx.now, ctx.settings.timeZone);
  const date = ctx.url.searchParams.get('date') || today;
  if (!isValidDate(date)) throw validationError([{ path: 'date', message: 'Use YYYY-MM-DD' }]);
  const isPast = date < today;
  const res = await ctx.db
    .prepare(
      `SELECT d.order_id, d.stop_number, d.zone, d.recipient_name, d.city, d.cancelled_at,
              c.id AS c_id, c.received_by, c.outcome, c.outcome_detail, c.result, c.confirmed_at, c.source,
              EXISTS (SELECT 1 FROM confirmation_corrections k WHERE k.confirmation_id = c.id AND k.kind = 'correction') AS corrected,
              EXISTS (SELECT 1 FROM confirmation_attempts a WHERE a.confirmation_id = c.id) AS flagged,
              (SELECT COUNT(*) FROM confirmation_corrections k WHERE k.confirmation_id = c.id) AS change_count,
              (SELECT v.id FROM delivery_confirmations v WHERE v.delivery_id = d.id AND v.voided_at IS NOT NULL ORDER BY v.voided_at DESC LIMIT 1) AS voided_id
         FROM deliveries d
         LEFT JOIN delivery_confirmations c ON c.delivery_id = d.id AND c.voided_at IS NULL
        WHERE d.delivery_date = ?
        ORDER BY d.stop_number IS NULL, d.stop_number, d.order_id
        LIMIT 1000`,
    )
    .bind(date)
    .all<ReportRowDb>();
  const totals = { scheduled: 0, delivered: 0, exceptions: 0, awaiting: 0, cancelled: 0 };
  const rows = res.results.map((r): DailyReportRow => {
    const status: DailyReportRow['status'] = r.c_id
      ? r.result === 'confirmed'
        ? 'delivered'
        : 'exception'
      : r.cancelled_at
        ? 'cancelled'
        : isPast
          ? 'missing'
          : 'awaiting';
    if (status === 'cancelled') totals.cancelled++;
    else {
      totals.scheduled++;
      if (status === 'delivered') totals.delivered++;
      else if (status === 'exception') totals.exceptions++;
      else totals.awaiting++;
    }
    return {
      orderId: r.order_id,
      stopNumber: r.stop_number,
      zone: r.zone,
      recipientName: r.recipient_name,
      city: r.city,
      status,
      receivedBy: r.received_by,
      outcome: r.outcome,
      outcomeDetail: r.outcome_detail,
      confirmedAt: r.confirmed_at,
      source: r.source,
      corrected: r.corrected === 1,
      changed: Boolean(r.c_id && r.change_count),
      flagged: r.flagged === 1,
      confirmationId: r.c_id,
      voidedConfirmationId: r.c_id ? null : r.voided_id,
    };
  });
  return { date, isPast, totals, rows };
}

/** The end-of-day report: every order scheduled for a day (default today) with its result, and the day's totals. */
export async function report(ctx: RequestContext): Promise<Response> {
  return json(await buildReport(ctx));
}

const STATUS_WORDS: Record<DailyReportRow['status'], string> = {
  delivered: 'Delivered to recipient',
  exception: 'Exception',
  awaiting: 'Awaiting',
  missing: 'Missing',
  cancelled: 'Cancelled',
};

/** One spreadsheet cell: formulas neutralised (a leading = + - @ gets an apostrophe), quoted when needed. */
function csvCell(value: string | number | null): string {
  let s = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The same report as a CSV file that opens in Excel (UTF-8 with a byte-order mark, Windows line endings). */
export async function reportCsv(ctx: RequestContext): Promise<Response> {
  const r = await buildReport(ctx);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ctx.settings.timeZone });
  const header = ['Date', 'Stop', 'Zone', 'Order ID', 'Recipient', 'City', 'Result', 'Received by', 'Delivery time', 'Exception note', 'Entered from', 'Changed', 'Flagged'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of r.rows) {
    // A voided order says so, next to its current status (Awaiting / Missing).
    const result =
      (row.status === 'exception' && row.outcome ? OUTCOME_LABELS[row.outcome] : STATUS_WORDS[row.status]) +
      (row.voidedConfirmationId ? ' (confirmation voided)' : '');
    lines.push(
      [
        r.date,
        row.stopNumber,
        row.zone,
        row.orderId,
        row.recipientName,
        row.city,
        result,
        row.receivedBy,
        row.confirmedAt ? time.format(new Date(row.confirmedAt)) : null,
        row.outcomeDetail,
        row.source === 'paper' ? 'Paper slip' : row.source === 'app' ? 'App' : null,
        row.confirmationId || row.voidedConfirmationId ? (row.changed || row.voidedConfirmationId ? 'Yes' : 'No') : null,
        row.confirmationId ? (row.flagged ? 'Yes' : 'No') : null,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="delivery-report-${r.date}.csv"`,
    },
  });
}
