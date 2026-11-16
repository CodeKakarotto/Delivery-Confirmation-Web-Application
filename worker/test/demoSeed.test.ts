import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv } from './helpers/app.ts';

const ROOT = new URL('../../', import.meta.url);

describe('demo orders for today and the upcoming week', () => {
  it('adds twelve orders a day for today and the next seven days, and is safe to run again', () => {
    const { db } = createEnv({}, { seed: false });
    db.execFile(new URL('seed/demo-today.sql', ROOT));
    db.execFile(new URL('seed/demo-today.sql', ROOT));
    const days = db.sqlite
      .prepare("SELECT delivery_date AS day, COUNT(*) AS n, COUNT(DISTINCT recipient_name) AS names FROM deliveries GROUP BY delivery_date ORDER BY 1")
      .all() as { day: string; n: number; names: number }[];
    assert.equal(days.length, 8);
    for (const d of days) {
      assert.equal(d.n, 12, d.day);
      assert.equal(d.names, 12, `${d.day}: every order has a different recipient`);
    }
    const first = db.sqlite.prepare('SELECT recipient_name AS r FROM deliveries WHERE stop_number = 1 ORDER BY delivery_date').all() as { r: string }[];
    assert.ok(new Set(first.map((x) => x.r)).size > 1, 'the recipients rotate from day to day');
    const sample = db.sqlite.prepare("SELECT order_id, products, total_products FROM deliveries WHERE products IS NOT NULL LIMIT 1").get() as {
      order_id: string;
      products: string;
      total_products: number;
    };
    assert.match(sample.order_id, /^MF-\d{4}-\d{2}$/);
    const items = JSON.parse(sample.products) as { quantity: number }[];
    assert.equal(items.reduce((a, b) => a + b.quantity, 0), sample.total_products, 'total products matches the product list');
  });
});
