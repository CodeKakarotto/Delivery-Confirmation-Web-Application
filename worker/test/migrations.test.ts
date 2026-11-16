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

describe('migration 0004 keeps existing data', () => {
  it('copies every confirmation and refused attempt, and allows a new confirmation once one is voided', () => {
    const db = new SqliteD1();
    for (const file of MIGRATIONS.filter((f) => f < '0004')) db.execFile(new URL(`migrations/${file}`, ROOT));
    db.execFile(new URL('seed/demo-seed.sql', ROOT));
    const sig = new Uint8Array(100).fill(9);
    db.sqlite
      .prepare(
        `INSERT INTO delivery_confirmations (id, delivery_id, order_id, received_by, outcome, signature_png, signature_width,
           signature_height, result, idempotency_key, request_hash, confirmed_at)
         SELECT '55555555-5555-4555-8555-555555555555', id, order_id, 'Avery Demo', 'delivered_to_recipient', ?, 600, 200,
           'confirmed', '66666666-6666-4666-8666-666666666666', ?, '2026-11-14T15:30:00.000Z' FROM deliveries WHERE order_id = 'MF-10482'`,
      )
      .run(sig, 'c'.repeat(64));
    db.sqlite.exec(`INSERT INTO confirmation_attempts (confirmation_id, kind, received_by, outcome, created_at)
                    VALUES ('55555555-5555-4555-8555-555555555555', 'duplicate', 'Avery Demo', 'delivered_to_recipient', '2026-11-14T16:00:00.000Z')`);

    db.execFile(new URL('migrations/0004_corrections_paper.sql', ROOT));

    const c = db.sqlite.prepare('SELECT * FROM delivery_confirmations').get() as Record<string, unknown>;
    assert.equal(c.received_by, 'Avery Demo');
    assert.equal(c.source, 'app');
    assert.equal(c.voided_at, null);
    assert.deepEqual(new Uint8Array(c.signature_png as Uint8Array), sig);
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM confirmation_attempts').get() as { n: number }).n, 1);

    // Still one ACTIVE confirmation per order...
    const second = () =>
      db.sqlite
        .prepare(
          `INSERT INTO delivery_confirmations (id, delivery_id, order_id, received_by, outcome, signature_png, signature_width,
             signature_height, result, idempotency_key, request_hash, confirmed_at)
           SELECT '77777777-7777-4777-8777-777777777777', id, order_id, 'Avery', 'delivered_to_recipient', ?, 600, 200,
             'confirmed', '88888888-8888-4888-8888-888888888888', ?, '2026-11-14T17:00:00.000Z' FROM deliveries WHERE order_id = 'MF-10482'`,
        )
        .run(sig, 'd'.repeat(64));
    assert.throws(second, /UNIQUE constraint failed: delivery_confirmations\.delivery_id/);
    // ...but after voiding the first, the order can be confirmed again.
    db.sqlite.exec(`UPDATE delivery_confirmations SET voided_at = '2026-11-14T16:30:00.000Z', void_reason = 'Wrong order'`);
    second();
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n, 2);
  });
});

describe('migration 0005 keeps the change history', () => {
  it('copies every correction and void, and allows "unvoid"', () => {
    const db = new SqliteD1();
    for (const file of MIGRATIONS.filter((f) => f < '0005')) db.execFile(new URL(`migrations/${file}`, ROOT));
    db.execFile(new URL('seed/demo-seed.sql', ROOT));
    db.sqlite
      .prepare(
        `INSERT INTO delivery_confirmations (id, delivery_id, order_id, received_by, outcome, outcome_detail, result, idempotency_key, request_hash, confirmed_at)
         SELECT '99999999-9999-4999-8999-999999999999', id, order_id, 'Porch', 'left_at_door', 'Porch', 'needs_review',
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?, '2026-11-14T15:30:00.000Z' FROM deliveries WHERE order_id = 'MF-10482'`,
      )
      .run('e'.repeat(64));
    db.sqlite.exec(`INSERT INTO confirmation_corrections (confirmation_id, kind, reason, old_received_by, new_received_by, created_at)
                    VALUES ('99999999-9999-4999-8999-999999999999', 'correction', 'Typo', 'Prch', 'Porch', '2026-11-14T16:00:00.000Z')`);

    db.execFile(new URL('migrations/0005_unvoid.sql', ROOT));

    const row = db.sqlite.prepare('SELECT * FROM confirmation_corrections').get() as Record<string, unknown>;
    assert.deepEqual([row.kind, row.reason, row.old_received_by, row.new_received_by], ['correction', 'Typo', 'Prch', 'Porch']);
    db.sqlite.exec(`INSERT INTO confirmation_corrections (confirmation_id, kind, reason, created_at)
                    VALUES ('99999999-9999-4999-8999-999999999999', 'unvoid', 'Restored', '2026-11-14T17:00:00.000Z')`);
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM confirmation_corrections').get() as { n: number }).n, 2);
  });
});
