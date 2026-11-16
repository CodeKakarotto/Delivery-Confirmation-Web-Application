import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv } from './helpers/app.ts';

const ROOT = new URL('../../', import.meta.url);

/** The days the script covers: today and the next seven (shop day = UTC-5), except Sundays. */
function expectedDays(): string[] {
  const out: string[] = [];
  const start = Date.now() - 5 * 3600_000;
  for (let i = 0; i < 8; i++) {
    const d = new Date(start + i * 86_400_000);
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe('demo orders for today and the upcoming week', () => {
  it('adds forty orders a day, Monday to Saturday (closed Sundays), and is safe to run again', () => {
    const { db } = createEnv({}, { seed: false });
    db.execFile(new URL('seed/demo-today.sql', ROOT));
    db.execFile(new URL('seed/demo-today.sql', ROOT));
    const days = db.sqlite
      .prepare('SELECT delivery_date AS day, COUNT(*) AS n, COUNT(DISTINCT recipient_name) AS names FROM deliveries GROUP BY delivery_date ORDER BY 1')
      .all() as { day: string; n: number; names: number }[];
    assert.deepEqual(
      days.map((d) => d.day),
      expectedDays(),
    );
    for (const d of days) {
      assert.equal(d.n, 40, d.day);
      assert.equal(d.names, 40, `${d.day}: every order has a different recipient`);
    }
    const first = db.sqlite.prepare('SELECT recipient_name AS r FROM deliveries WHERE stop_number = 1 ORDER BY delivery_date').all() as { r: string }[];
    assert.ok(new Set(first.map((x) => x.r)).size > 1, 'the recipients rotate from day to day');
    const incomplete = db.sqlite.prepare('SELECT COUNT(*) AS n FROM deliveries WHERE zone IS NULL').get() as { n: number };
    assert.equal(incomplete.n, days.length, 'one order a day with missing data (stop 12)');
    for (const row of db.sqlite.prepare('SELECT products, total_products FROM deliveries WHERE products IS NOT NULL').all() as {
      products: string;
      total_products: number;
    }[]) {
      const items = JSON.parse(row.products) as { quantity: number }[];
      assert.equal(items.reduce((a, b) => a + b.quantity, 0), row.total_products, 'total products matches the product list');
    }
  });

  it('removes upcoming Sunday demo orders left by older versions, but never confirmed ones', () => {
    const { db } = createEnv({}, { seed: false });
    const start = Date.now() - 5 * 3600_000;
    let sunday = '';
    for (let i = 1; i <= 7 && !sunday; i++) {
      const d = new Date(start + i * 86_400_000);
      if (d.getUTCDay() === 0) sunday = d.toISOString().slice(0, 10);
    }
    const id = `MF-${sunday.slice(5, 7)}${sunday.slice(8, 10)}`;
    const insert = db.sqlite.prepare(
      `INSERT INTO deliveries (order_id, recipient_name, address_line, city, state, postal_code, delivery_date, created_at, updated_at)
       VALUES (?, 'Old Demo', '1 Old St', 'Lorton', 'VA', '22079', ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
    );
    insert.run(`${id}-01`, sunday);
    insert.run(`${id}-02`, sunday);
    db.sqlite.exec(`INSERT INTO delivery_confirmations (id, delivery_id, order_id, received_by, outcome, outcome_detail, result, idempotency_key, request_hash, confirmed_at)
      SELECT '22222222-2222-4222-8222-222222222222', id, order_id, 'X', 'left_at_door', 'Porch', 'needs_review', '33333333-3333-4333-8333-333333333333', '${'a'.repeat(64)}', '2026-11-01T00:00:00Z'
        FROM deliveries WHERE order_id = '${id}-02'`);
    db.execFile(new URL('seed/demo-today.sql', ROOT));
    const left = db.sqlite.prepare('SELECT order_id FROM deliveries WHERE delivery_date = ?').all(sunday) as { order_id: string }[];
    assert.deepEqual(left.map((r) => r.order_id), [`${id}-02`]);
  });
});
