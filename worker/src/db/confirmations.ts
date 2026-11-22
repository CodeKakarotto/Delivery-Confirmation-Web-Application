/** D1 access for deliveries and confirmations. Every query is parameterized; no SQL is built from input. */

import { searchClause } from './search.ts';
import type {
  SearchField,
  OrderProduct,
  ConfirmationAttempt,
  ConfirmationCorrection,
  ConfirmationListItem,
  ConfirmationReceipt,
  ConfirmationResult,
  DeliveryOutcome,
  DriverDelivery,
} from '../../../shared/types.ts';

export interface DeliveryRow {
  id: number;
  order_id: string;
  recipient_name: string | null;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  address_notes: string | null;
  delivery_notes: string | null;
  zone: string | null;
  total_products: number | null;
  products: string | null;
  stop_number: number | null;
  delivery_date: string | null;
  cancelled_at: string | null;
}

export interface ConfirmationRow {
  id: string;
  delivery_id: number;
  order_id: string;
  stop_number: number | null;
  zone: string | null;
  received_by: string;
  outcome: DeliveryOutcome;
  outcome_detail: string | null;
  note: string | null;
  signature_width: number | null;
  signature_height: number | null;
  result: ConfirmationResult;
  idempotency_key: string;
  request_hash: string;
  confirmed_at: string;
}

export const DELIVERY_COLUMNS = `d.id, d.order_id, d.recipient_name, d.address_line, d.city, d.state, d.postal_code, d.address_notes,
  d.delivery_notes, d.zone, d.total_products, d.products, d.stop_number, d.delivery_date, d.cancelled_at`;

/** Columns of a confirmation, never including the signature bytes. */
const CONFIRMATION_COLUMNS = `c.id, c.delivery_id, c.order_id, c.stop_number, c.zone, c.received_by, c.outcome, c.outcome_detail,
  c.note, c.signature_width, c.signature_height, c.result, c.idempotency_key, c.request_hash, c.confirmed_at`;

export function toDriverDelivery(row: DeliveryRow): DriverDelivery {
  return {
    orderId: row.order_id,
    stopNumber: row.stop_number,
    zone: row.zone,
    recipientName: row.recipient_name,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    addressNotes: row.address_notes,
    totalProducts: row.total_products,
    products: parseProducts(row.products),
    deliveryInstructions: row.delivery_notes,
  };
}

/** The products column, read defensively: anything malformed is treated as "not recorded". */
export function parseProducts(raw: string | null): OrderProduct[] | null {
  if (!raw) return null;
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0 || list.length > 50) return null;
    const out: OrderProduct[] = [];
    for (const item of list) {
      const name = (item as { name?: unknown })?.name;
      const quantity = (item as { quantity?: unknown })?.quantity;
      if (typeof name !== 'string' || !name.trim() || name.length > 100) return null;
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) return null;
      out.push({ name: name.trim(), quantity });
    }
    return out;
  } catch {
    return null;
  }
}

export function toReceipt(row: ConfirmationRow): ConfirmationReceipt {
  return {
    id: row.id,
    orderId: row.order_id,
    receivedBy: row.received_by,
    outcome: row.outcome,
    outcomeDetail: row.outcome_detail,
    note: row.note,
    result: row.result,
    confirmedAt: row.confirmed_at,
  };
}

/** Exact, case-insensitive order ID match (the column is COLLATE NOCASE). */
export async function findDeliveryByOrderId(db: D1Database, orderId: string): Promise<DeliveryRow | null> {
  return db.prepare(`SELECT ${DELIVERY_COLUMNS} FROM deliveries d WHERE d.order_id = ?`).bind(orderId).first<DeliveryRow>();
}

export async function findConfirmationByDelivery(db: D1Database, deliveryId: number): Promise<ConfirmationRow | null> {
  return db
    .prepare(`SELECT ${CONFIRMATION_COLUMNS} FROM delivery_confirmations c WHERE c.delivery_id = ? AND c.voided_at IS NULL`)
    .bind(deliveryId)
    .first<ConfirmationRow>();
}

export async function findConfirmationByKey(db: D1Database, key: string): Promise<ConfirmationRow | null> {
  return db.prepare(`SELECT ${CONFIRMATION_COLUMNS} FROM delivery_confirmations c WHERE c.idempotency_key = ?`).bind(key).first<ConfirmationRow>();
}

export interface NewConfirmation {
  id: string;
  deliveryId: number;
  receivedBy: string;
  outcome: DeliveryOutcome;
  outcomeDetail: string | null;
  note: string | null;
  /** null for delivery exceptions (no signature is taken). */
  signature: Uint8Array | null;
  signatureWidth: number | null;
  signatureHeight: number | null;
  result: ConfirmationResult;
  idempotencyKey: string;
  requestHash: string;
  confirmedAt: string;
  /** The signed-in driver account (null for paper entries, which an employee types in). */
  confirmedByUserId: number | null;
  /** Paper entries only. */
  paper?: { enteredByUserId: number; reportedDeliveredAt: string; reference: string; photo: Uint8Array | null };
}

/**
 * Inserts the confirmation in one statement that copies the order ID, stop number and zone from the order itself,
 * and only if the order exists and is not cancelled at that instant. UNIQUE(delivery_id) and UNIQUE(idempotency_key)
 * make a second save impossible even under simultaneous requests. Returns false when the order was not eligible.
 */
export async function insertConfirmation(db: D1Database, c: NewConfirmation): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO delivery_confirmations
         (id, delivery_id, order_id, stop_number, zone, received_by, outcome, outcome_detail, note, signature_png,
          signature_width, signature_height, result, idempotency_key, request_hash, confirmed_at, confirmed_by_user_id,
          source, entered_by_user_id, reported_delivered_at, paper_reference, slip_photo)
       SELECT ?, d.id, d.order_id, d.stop_number, d.zone, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM deliveries d
        WHERE d.id = ? AND d.cancelled_at IS NULL`,
    )
    .bind(
      c.id,
      c.receivedBy,
      c.outcome,
      c.outcomeDetail,
      c.note,
      c.signature,
      c.signatureWidth,
      c.signatureHeight,
      c.result,
      c.idempotencyKey,
      c.requestHash,
      c.confirmedAt,
      c.confirmedByUserId,
      c.paper ? 'paper' : 'app',
      c.paper?.enteredByUserId ?? null,
      c.paper?.reportedDeliveredAt ?? null,
      c.paper?.reference ?? null,
      c.paper?.photo ?? null,
      c.deliveryId,
    )
    .run();
  return res.meta.changes === 1;
}

export async function recordAttempt(
  db: D1Database,
  a: { confirmationId: string; kind: 'duplicate' | 'conflict'; receivedBy: string; outcome: DeliveryOutcome; createdAt: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO confirmation_attempts (confirmation_id, kind, received_by, outcome, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(a.confirmationId, a.kind, a.receivedBy, a.outcome, a.createdAt)
    .run();
}

// ---------- Dashboard queries ----------

interface ListRow {
  id: string;
  order_id: string;
  stop_number: number | null;
  zone: string | null;
  recipient_name: string | null;
  received_by: string;
  outcome: DeliveryOutcome;
  result: ConfirmationResult;
  confirmed_at: string;
  attempt_count: number;
  conflict_count: number;
  source: 'app' | 'paper';
  corrected: number;
  change_count: number;
  voided: number;
}

const LIST_SELECT = `
  SELECT c.id, c.order_id, c.stop_number, c.zone, d.recipient_name, c.received_by, c.outcome, c.result, c.confirmed_at,
         (SELECT COUNT(*) FROM confirmation_attempts a WHERE a.confirmation_id = c.id) AS attempt_count,
         (SELECT COUNT(*) FROM confirmation_attempts a WHERE a.confirmation_id = c.id AND a.kind = 'conflict') AS conflict_count,
         c.source,
         EXISTS (SELECT 1 FROM confirmation_corrections k WHERE k.confirmation_id = c.id AND k.kind = 'correction') AS corrected,
         (SELECT COUNT(*) FROM confirmation_corrections k WHERE k.confirmation_id = c.id) AS change_count,
         c.voided_at IS NOT NULL AS voided
    FROM delivery_confirmations c
    JOIN deliveries d ON d.id = c.delivery_id`;

function toListItem(r: ListRow): ConfirmationListItem {
  return {
    id: r.id,
    orderId: r.order_id,
    stopNumber: r.stop_number,
    zone: r.zone,
    recipientName: r.recipient_name,
    receivedBy: r.received_by,
    outcome: r.outcome,
    result: r.result,
    confirmedAt: r.confirmed_at,
    attemptCount: r.attempt_count,
    hasConflict: r.conflict_count > 0,
    source: r.source,
    corrected: r.corrected === 1,
    changeCount: r.change_count ?? 0,
    voided: r.voided === 1,
  };
}

export interface ListFilter {
  /** Only confirmations saved by this account (drivers see their own). */
  userId?: number;
  orderId?: string;
  result?: ConfirmationResult;
  flagged?: boolean;
  /** Part of the order ID, the recipient's name or the address. */
  search?: { field: SearchField; text: string };
  /** One zone, e.g. "A". */
  zone?: string;
  /** Only confirmations in [from, to): the UTC range of one shop-local day. */
  range?: { from: string; to: string };
  limit: number;
  offset: number;
}

export async function listConfirmations(db: D1Database, f: ListFilter): Promise<{ items: ConfirmationListItem[]; total: number }> {
  // Fixed clauses with placeholders only; user input is always bound, never concatenated.
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.userId !== undefined) {
    where.push('c.confirmed_by_user_id = ?');
    binds.push(f.userId);
  }
  if (f.orderId !== undefined) {
    where.push('c.order_id = ?');
    binds.push(f.orderId);
  }
  if (f.result !== undefined) {
    where.push('c.result = ?');
    binds.push(f.result);
  }
  if (f.flagged) where.push('EXISTS (SELECT 1 FROM confirmation_attempts a WHERE a.confirmation_id = c.id)');
  if (f.zone) {
    where.push('c.zone = ? COLLATE NOCASE');
    binds.push(f.zone);
  }
  if (f.search) {
    const s = searchClause(f.search.field, f.search.text, 'c.order_id');
    where.push(s.sql);
    binds.push(...s.binds);
  }
  if (f.range !== undefined) {
    // ISO-8601 UTC strings of one fixed format compare correctly as text.
    where.push('c.confirmed_at >= ? AND c.confirmed_at < ?');
    binds.push(f.range.from, f.range.to);
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await db.batch<ListRow | { n: number }>([
    db.prepare(`${LIST_SELECT}${clause} ORDER BY c.confirmed_at DESC, c.id LIMIT ? OFFSET ?`).bind(...binds, f.limit, f.offset),
    db.prepare(`SELECT COUNT(*) AS n FROM delivery_confirmations c JOIN deliveries d ON d.id = c.delivery_id${clause}`).bind(...binds),
  ]);
  return {
    items: (rows!.results as ListRow[]).map(toListItem),
    total: (count!.results[0] as { n: number }).n,
  };
}

interface DetailRow extends ListRow {
  outcome_detail: string | null;
  note: string | null;
  signature_width: number | null;
  signature_height: number | null;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  address_notes: string | null;
  delivery_notes: string | null;
  total_products: number | null;
  products: string | null;
  delivery_date: string | null;
  confirmed_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string | null;
  reported_delivered_at: string | null;
  paper_reference: string | null;
  entered_by: string | null;
  has_photo: number;
}

export async function getConfirmationDetail(db: D1Database, id: string, userId?: number) {
  const row = await db
    .prepare(
      `SELECT c.id, c.order_id, c.stop_number, c.zone, d.recipient_name, c.received_by, c.outcome, c.result, c.confirmed_at,
              (SELECT COUNT(*) FROM confirmation_attempts a WHERE a.confirmation_id = c.id) AS attempt_count,
              (SELECT COUNT(*) FROM confirmation_attempts a WHERE a.confirmation_id = c.id AND a.kind = 'conflict') AS conflict_count,
              c.source,
              EXISTS (SELECT 1 FROM confirmation_corrections k WHERE k.confirmation_id = c.id AND k.kind = 'correction') AS corrected,
              (SELECT COUNT(*) FROM confirmation_corrections k WHERE k.confirmation_id = c.id) AS change_count,
              c.voided_at IS NOT NULL AS voided, c.voided_at, c.void_reason,
              (SELECT u.display_name FROM users u WHERE u.id = c.voided_by_user_id) AS voided_by,
              c.reported_delivered_at, c.paper_reference, c.slip_photo IS NOT NULL AS has_photo,
              (SELECT u.display_name FROM users u WHERE u.id = c.entered_by_user_id) AS entered_by,
              c.outcome_detail, c.note, c.signature_width, c.signature_height,
              d.address_line, d.city, d.state, d.postal_code, d.address_notes, d.delivery_notes, d.total_products, d.products, d.delivery_date,
              (SELECT u.display_name FROM users u WHERE u.id = c.confirmed_by_user_id) AS confirmed_by
         FROM delivery_confirmations c
         JOIN deliveries d ON d.id = c.delivery_id
        WHERE c.id = ? AND (? IS NULL OR c.confirmed_by_user_id = ?)`,
    )
    .bind(id, userId ?? null, userId ?? null)
    .first<DetailRow>();
  if (!row) return null;
  const attempts = await db
    .prepare('SELECT kind, received_by, outcome, created_at FROM confirmation_attempts WHERE confirmation_id = ? ORDER BY created_at, id')
    .bind(id)
    .all<{ kind: 'duplicate' | 'conflict'; received_by: string | null; outcome: DeliveryOutcome | null; created_at: string }>();
  return {
    ...toListItem(row),
    // # and zone as recorded at confirmation time; everything else from the order.
    delivery: {
      orderId: row.order_id,
      stopNumber: row.stop_number,
      zone: row.zone,
      recipientName: row.recipient_name,
      addressLine: row.address_line,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      addressNotes: row.address_notes,
      totalProducts: row.total_products,
      products: parseProducts(row.products),
      deliveryInstructions: row.delivery_notes,
      deliveryDate: row.delivery_date,
    },
    outcomeDetail: row.outcome_detail,
    note: row.note,
    signatureWidth: row.signature_width,
    signatureHeight: row.signature_height,
    confirmedBy: row.confirmed_by,
    corrections: await listCorrections(db, id),
    voided: row.voided_at ? { at: row.voided_at, by: row.voided_by, reason: row.void_reason ?? '' } : null,
    paper:
      row.source === 'paper'
        ? { reportedDeliveredAt: row.reported_delivered_at ?? '', reference: row.paper_reference ?? '', enteredBy: row.entered_by, hasPhoto: row.has_photo === 1 }
        : null,
    attempts: attempts.results.map(
      (a): ConfirmationAttempt => ({ kind: a.kind, receivedBy: a.received_by, outcome: a.outcome, createdAt: a.created_at }),
    ),
  };
}

export async function getSignature(db: D1Database, id: string, userId?: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const row = await db
    .prepare('SELECT signature_png FROM delivery_confirmations WHERE id = ? AND signature_png IS NOT NULL AND (? IS NULL OR confirmed_by_user_id = ?)')
    .bind(id, userId ?? null, userId ?? null)
    .first<{ signature_png: ArrayBuffer | Uint8Array | number[] }>();
  if (!row) return null;
  const v = row.signature_png;
  // D1 returns BLOBs as an ArrayBuffer or a number array depending on the runtime; copy into a fresh buffer.
  return v instanceof Uint8Array ? new Uint8Array(v) : new Uint8Array(v as ArrayBuffer | number[]);
}

/** Every confirmation's time, result and flag: the input for the month → week → day calendar. */
export async function listCalendarRows(db: D1Database, userId?: number): Promise<Array<{ confirmed_at: string; result: ConfirmationResult; flagged: number }>> {
  const res = await db
    .prepare(
      `SELECT c.confirmed_at, c.result,
              EXISTS (SELECT 1 FROM confirmation_attempts a WHERE a.confirmation_id = c.id) AS flagged
         FROM delivery_confirmations c
        WHERE c.voided_at IS NULL AND (? IS NULL OR c.confirmed_by_user_id = ?)`,
    )
    .bind(userId ?? null, userId ?? null)
    .all<{ confirmed_at: string; result: ConfirmationResult; flagged: number }>();
  return res.results;
}

export async function findShopOrder(db: D1Database, orderId: string) {
  const delivery = await findDeliveryByOrderId(db, orderId);
  if (!delivery) return null;
  const confirmation = await findConfirmationByDelivery(db, delivery.id);
  const voided = await db
    .prepare(
      `SELECT id, confirmed_at, voided_at, void_reason FROM delivery_confirmations
        WHERE delivery_id = ? AND voided_at IS NOT NULL ORDER BY voided_at DESC`,
    )
    .bind(delivery.id)
    .all<{ id: string; confirmed_at: string; voided_at: string; void_reason: string }>();
  return {
    delivery,
    confirmation,
    voided: voided.results.map((v) => ({ id: v.id, confirmedAt: v.confirmed_at, voidedAt: v.voided_at, reason: v.void_reason })),
  };
}

/** Corrections and voids of one confirmation, oldest first, with what changed. */
export async function listCorrections(db: D1Database, confirmationId: string): Promise<ConfirmationCorrection[]> {
  const res = await db
    .prepare(
      `SELECT k.kind, k.reason, k.created_at, k.old_received_by, k.new_received_by, k.old_outcome, k.new_outcome,
              k.old_outcome_detail, k.new_outcome_detail, (SELECT u.display_name FROM users u WHERE u.id = k.by_user_id) AS by_name,
              k.confirmation_id <> ? AS other_record
         FROM confirmation_corrections k
        WHERE k.confirmation_id IN (
                SELECT o.id FROM delivery_confirmations o
                 WHERE o.delivery_id = (SELECT delivery_id FROM delivery_confirmations WHERE id = ?))
        ORDER BY k.created_at, k.id`,
    )
    .bind(confirmationId, confirmationId)
    .all<Record<string, string | null>>();
  return res.results.map((k) => {
    const changes: ConfirmationCorrection['changes'] = [];
    if (k.kind === 'correction') {
      if (k.old_received_by !== k.new_received_by) changes.push({ field: 'receivedBy', from: k.old_received_by, to: k.new_received_by });
      if (k.old_outcome !== k.new_outcome) changes.push({ field: 'outcome', from: k.old_outcome, to: k.new_outcome });
      if (k.old_outcome_detail !== k.new_outcome_detail) changes.push({ field: 'outcomeDetail', from: k.old_outcome_detail, to: k.new_outcome_detail });
    }
    return {
      kind: k.kind as ConfirmationCorrection['kind'],
      reason: k.reason ?? '',
      by: k.by_name,
      createdAt: k.created_at ?? '',
      changes,
      ...(Number(k.other_record) === 1 ? { otherRecord: true } : {}),
    };
  });
}

/** The current state of a confirmation, for corrections and voids. */
export async function getConfirmationState(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT id, received_by, outcome, outcome_detail, source, voided_at, signature_png IS NOT NULL AS has_signature
         FROM delivery_confirmations WHERE id = ?`,
    )
    .bind(id)
    .first<{ id: string; received_by: string; outcome: DeliveryOutcome; outcome_detail: string | null; source: 'app' | 'paper'; voided_at: string | null; has_signature: number }>();
}

export async function getSlipPhoto(db: D1Database, id: string, userId?: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const row = await db
    .prepare('SELECT slip_photo FROM delivery_confirmations WHERE id = ? AND slip_photo IS NOT NULL AND (? IS NULL OR confirmed_by_user_id = ?)')
    .bind(id, userId ?? null, userId ?? null)
    .first<{ slip_photo: ArrayBuffer | Uint8Array | number[] }>();
  if (!row) return null;
  const v = row.slip_photo;
  return v instanceof Uint8Array ? new Uint8Array(v) : new Uint8Array(v as ArrayBuffer | number[]);
}
