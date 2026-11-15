/**
 * Driver endpoints (prototype: role chosen on screen, no login). The driver sees today's awaiting orders (no street
 * addresses), opens ONE order by its order ID and submits its confirmation. An order that is already confirmed returns
 * no customer details.
 */

import { confirmationSubmitSchema, crossFieldIssues, ORDER_ID_MAX, ORDER_ID_PATTERN, SUBMIT_MAX_BODY_BYTES } from '../../../shared/schemas.ts';
import type { ConfirmationReceipt, ConfirmationResult, ConfirmationSubmitResponse, DeliveryOutcome, DriverLookupResponse } from '../../../shared/types.ts';
import {
  findConfirmationByDelivery,
  findConfirmationByKey,
  findDeliveryByOrderId,
  insertConfirmation,
  recordAttempt,
  toDriverDelivery,
  toReceipt,
  type ConfirmationRow,
} from '../db/confirmations.ts';
import { ApiError, isUniqueViolation, json, logEvent, readJson, validationError } from '../http.ts';
import type { RequestContext } from '../router.ts';
import { localDateKey } from '../../../shared/shopTime.ts';
import type { DriverAwaitingResponse } from '../../../shared/types.ts';
import { RATE_LIMITS, rateLimit, requireDemoAccess, requireRole } from '../security.ts';
import { validateSignature } from '../signature.ts';

const ORDER_NOT_FOUND = () =>
  new ApiError(404, 'order_not_found', 'No order with this order ID was found. Check the ID on the ticket and try again.');
const ORDER_CANCELLED = () => new ApiError(409, 'order_cancelled', 'This order was cancelled and cannot be confirmed. Call the shop.');
const ALREADY_CONFIRMED = () =>
  new ApiError(
    409,
    'already_confirmed',
    'This order already has a saved delivery confirmation. The new submission was not saved and the shop has been flagged to review it.',
  );

/** Only a hand-off to the recipient counts as a normal delivery; every exception is saved for review. */
export function resultFor(outcome: DeliveryOutcome): ConfirmationResult {
  return outcome === 'delivered_to_recipient' ? 'confirmed' : 'needs_review';
}

export async function lookup(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  requireRole(ctx, 'driver');
  // Counted before anything else, so guessing order IDs is slowed down whether or not they exist.
  await rateLimit(ctx, RATE_LIMITS.lookup);
  const orderId = (ctx.params.orderId ?? '').trim();
  if (!orderId || orderId.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(orderId)) throw ORDER_NOT_FOUND();

  const delivery = await findDeliveryByOrderId(ctx.db, orderId);
  if (!delivery) throw ORDER_NOT_FOUND();
  if (delivery.cancelled_at) throw ORDER_CANCELLED();
  const existing = await findConfirmationByDelivery(ctx.db, delivery.id);
  const body: DriverLookupResponse = existing
    ? { status: 'already_confirmed', orderId: delivery.order_id, confirmedAt: existing.confirmed_at }
    : { status: 'ready', delivery: toDriverDelivery(delivery) };
  return json(body);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function blankToNull(text: string | undefined): string | null {
  const t = text?.trim();
  return t ? t : null;
}

export async function submit(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  requireRole(ctx, 'driver');
  await rateLimit(ctx, RATE_LIMITS.submit);
  const input = await readJson(ctx.request, confirmationSubmitSchema, SUBMIT_MAX_BODY_BYTES);
  const cross = crossFieldIssues(input);
  if (Object.keys(cross).length) throw validationError(Object.entries(cross).map(([path, message]) => ({ path, message })));

  const outcomeDetail = blankToNull(input.outcomeDetail);
  const note = blankToNull(input.note);
  const signature = validateSignature(input.signaturePng);
  // Fingerprint of the content (not the key): tells a true retry from a different submission.
  const requestHash = await sha256Hex(
    new TextEncoder().encode(
      JSON.stringify([input.orderId.toLowerCase(), input.receivedBy, input.outcome, outcomeDetail, note, await sha256Hex(signature.bytes)]),
    ),
  );

  // 1. A retry of a submission that was already saved (e.g. the response was lost): answer with the saved record.
  const replay = await replayFor(ctx, input.idempotencyKey, requestHash);
  if (replay) return replay;

  // 2. The order must exist, not be cancelled and not be confirmed already.
  const delivery = await findDeliveryByOrderId(ctx.db, input.orderId);
  if (!delivery) throw ORDER_NOT_FOUND();
  if (delivery.cancelled_at) throw ORDER_CANCELLED();
  const existing = await findConfirmationByDelivery(ctx.db, delivery.id);
  if (existing) return refuseSecond(ctx, existing, requestHash, input.receivedBy, input.outcome);

  // 3. Save. The server decides the result and the time.
  const confirmedAt = ctx.now.toISOString();
  const id = crypto.randomUUID();
  const result = resultFor(input.outcome);
  let saved: boolean;
  try {
    saved = await insertConfirmation(ctx.db, {
      id,
      deliveryId: delivery.id,
      receivedBy: input.receivedBy,
      outcome: input.outcome,
      outcomeDetail,
      note,
      signature: signature.bytes,
      signatureWidth: signature.width,
      signatureHeight: signature.height,
      result,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      confirmedAt,
    });
  } catch (err) {
    // Lost a race with a simultaneous request: the same retry (same key) or another submission for this order.
    if (isUniqueViolation(err, 'idempotency_key')) {
      const again = await replayFor(ctx, input.idempotencyKey, requestHash);
      if (again) return again;
    }
    if (isUniqueViolation(err, 'delivery_id')) {
      const winner = await findConfirmationByDelivery(ctx.db, delivery.id);
      if (winner) return refuseSecond(ctx, winner, requestHash, input.receivedBy, input.outcome);
    }
    throw err;
  }
  if (!saved) throw ORDER_CANCELLED(); // cancelled between the check and the insert

  logEvent('info', 'confirmation_saved', { result, requestId: ctx.requestId });
  const confirmation: ConfirmationReceipt = {
    id,
    orderId: delivery.order_id, // the stored spelling, not what the driver typed
    receivedBy: input.receivedBy,
    outcome: input.outcome,
    outcomeDetail,
    note,
    result,
    confirmedAt,
  };
  const body: ConfirmationSubmitResponse = { confirmation, replayed: false };
  return json(body, 201);
}

async function replayFor(ctx: RequestContext, key: string, requestHash: string): Promise<Response | null> {
  const byKey = await findConfirmationByKey(ctx.db, key);
  if (!byKey) return null;
  if (byKey.request_hash !== requestHash) {
    throw new ApiError(
      422,
      'idempotency_key_reused',
      'This form was already used for a different submission. Reload the page and start again.',
    );
  }
  const body: ConfirmationSubmitResponse = { confirmation: toReceipt(byKey), replayed: true };
  return json(body, 200);
}

async function refuseSecond(
  ctx: RequestContext,
  existing: ConfirmationRow,
  requestHash: string,
  receivedBy: string,
  outcome: DeliveryOutcome,
): Promise<Response> {
  const kind = existing.request_hash === requestHash ? 'duplicate' : 'conflict';
  await recordAttempt(ctx.db, { confirmationId: existing.id, kind, receivedBy, outcome, createdAt: ctx.now.toISOString() });
  logEvent('warn', 'confirmation_refused', { kind, requestId: ctx.requestId });
  throw ALREADY_CONFIRMED();
}

/** Today's (shop-local) orders that still need a confirmation, by stop number, a page at a time. No street addresses. */
export async function awaiting(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  requireRole(ctx, 'driver');
  await rateLimit(ctx, RATE_LIMITS.lookup);
  const limit = pageParam(ctx, 'limit', 5, 1, 50);
  const offset = pageParam(ctx, 'offset', 0, 0, 10_000);
  const date = localDateKey(ctx.now, ctx.settings.timeZone);
  const awaitingWhere = `d.delivery_date = ? AND d.cancelled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM delivery_confirmations c WHERE c.delivery_id = d.id)`;
  const [rows, count] = await ctx.db.batch<AwaitingRow | { n: number }>([
    ctx.db
      .prepare(
        `SELECT d.order_id, d.stop_number, d.zone, d.recipient_name, d.city
           FROM deliveries d
          WHERE ${awaitingWhere}
          ORDER BY d.stop_number IS NULL, d.stop_number, d.order_id
          LIMIT ? OFFSET ?`,
      )
      .bind(date, limit, offset),
    ctx.db.prepare(`SELECT COUNT(*) AS n FROM deliveries d WHERE ${awaitingWhere}`).bind(date),
  ]);
  const body: DriverAwaitingResponse = {
    date,
    total: (count!.results[0] as { n: number }).n,
    items: (rows!.results as AwaitingRow[]).map((r) => ({ orderId: r.order_id, stopNumber: r.stop_number, zone: r.zone, recipientName: r.recipient_name, city: r.city })),
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

function pageParam(ctx: RequestContext, name: string, fallback: number, min: number, max: number): number {
  const raw = ctx.url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw validationError([{ path: name, message: `Must be a whole number from ${min} to ${max}` }]);
  }
  return Number(raw);
}
