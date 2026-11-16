import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MIGRATIONS } from './helpers/app.ts';
import { SqliteD1 } from './helpers/d1.ts';

const ROOT = new URL('../../', import.meta.url);

describe('migration 0003 keeps existing data', () => {
  it('rebuilds the confirmations table without losing confirmations, signatures or flagged attempts', () => {
    const db = new SqliteD1();
    for (const file of MIGRATIONS.filter((f) => f < '0003')) db.execFile(new URL(`migrations/${file}`, ROOT));
    // One order as it existed before 0003 (the current demo seed already uses the 0003 products column).
    db.sqlite.exec(`INSERT INTO deliveries (order_id, recipient_name, address_line, city, state, postal_code, delivery_date, created_at, updated_at)
                    VALUES ('MF-10482', 'Avery Demo', '100 Sample Way', 'Lake Ridge', 'VA', '22192', '2026-11-14', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`);
    const sig = new Uint8Array(100).fill(7);
    db.sqlite
      .prepare(
        `INSERT INTO delivery_confirmations (id, delivery_id, order_id, received_by, outcome, signature_png, signature_width,
           signature_height, result, idempotency_key, request_hash, confirmed_at)
         SELECT '11111111-1111-4111-8111-111111111111', id, order_id, 'Avery Demo', 'delivered_to_recipient', ?, 600, 200,
           'confirmed', '22222222-2222-4222-8222-222222222222', ?, '2026-11-14T15:30:00.000Z' FROM deliveries WHERE order_id = 'MF-10482'`,
      )
      .run(sig, 'a'.repeat(64));
    db.sqlite
      .prepare(`INSERT INTO confirmation_attempts (confirmation_id, kind, received_by, outcome, created_at)
                VALUES ('11111111-1111-4111-8111-111111111111', 'conflict', 'Someone', 'left_at_door', '2026-11-14T16:00:00.000Z')`)
      .run();

    db.execFile(new URL('migrations/0003_exceptions_products.sql', ROOT));

    const c = db.sqlite.prepare('SELECT * FROM delivery_confirmations').get() as Record<string, unknown>;
    assert.equal(c.received_by, 'Avery Demo');
    assert.deepEqual(new Uint8Array(c.signature_png as Uint8Array), sig);
    assert.equal(c.signature_width, 600);
    const a = db.sqlite.prepare('SELECT * FROM confirmation_attempts').get() as Record<string, unknown>;
    assert.equal(a.confirmation_id, '11111111-1111-4111-8111-111111111111');
    assert.equal(a.kind, 'conflict');
    // The restored attempts still point at the rebuilt table (deleting the confirmation cascades).
    db.sqlite.exec("DELETE FROM delivery_confirmations WHERE id = '11111111-1111-4111-8111-111111111111'");
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM confirmation_attempts').get() as { n: number }).n, 0);
  });

  it('still refuses a hand-off to the recipient without a signature, in the database itself', () => {
    const db = new SqliteD1();
    for (const file of MIGRATIONS) db.execFile(new URL(`migrations/${file}`, ROOT));
    db.execFile(new URL('seed/demo-seed.sql', ROOT));
    assert.throws(() =>
      db.sqlite
        .prepare(
          `INSERT INTO delivery_confirmations (id, delivery_id, order_id, received_by, outcome, result, idempotency_key, request_hash, confirmed_at)
           SELECT '33333333-3333-4333-8333-333333333333', id, order_id, 'Avery', 'delivered_to_recipient', 'confirmed',
             '44444444-4444-4444-8444-444444444444', ?, '2026-11-14T15:30:00.000Z' FROM deliveries WHERE order_id = 'MF-10482'`,
        )
        .run('b'.repeat(64)),
    );
  });
});
