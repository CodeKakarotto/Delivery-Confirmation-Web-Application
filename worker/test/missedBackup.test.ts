import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { backup } from '../../scripts/backup-local.ts';

/** A cutoff that keeps every delivery (for tests about the copies themselves). */
const KEEP_ALL = '2000-01-01';
import { createEnv, MIGRATIONS, TestClient, validSubmission } from './helpers/app.ts';

const ROOT = new URL('../../', import.meta.url);
/** Saturday 14 November 2026 in New York: 3 PM (before closing) and 6:30 PM (after the 6 PM closing). */
const BEFORE_CLOSING = new Date('2026-11-14T20:00:00.000Z');
const AFTER_CLOSING = new Date('2026-11-14T23:30:00.000Z');

function setup(overrides = {}) {
  const { env, db } = createEnv(overrides);
  db.sqlite.exec("UPDATE deliveries SET delivery_date = CASE WHEN delivery_date = date('now', '-5 hours') THEN '2026-11-14' ELSE '2026-11-13' END");
  return { env, db, client: new TestClient(env) };
}
const missed = (client: TestClient, now: Date) => client.request('GET', '/api/dashboard/missed', undefined, { role: 'employee', now });
const orderIds = (body: { days: { date: string; orders: { orderId: string }[] }[] }) =>
  body.days.map((d) => [d.date, d.orders.map((o) => o.orderId)] as const);

describe('missed deliveries alert (employees)', () => {
  it('before closing: only earlier days count; today is still in progress', async () => {
    const { client } = setup();
    const res = await missed(client, BEFORE_CLOSING);
    assert.equal(res.status, 200);
    assert.equal(res.body.afterClosing, false);
    assert.equal(res.body.closingTime, '18:00');
    assert.deepEqual(res.body.days.map((d: { date: string }) => d.date), ['2026-11-13']);
    assert.equal(res.body.total, 2);
  });

  it('after closing: today’s unconfirmed orders are missed too, newest day first; confirmed and cancelled ones are not', async () => {
    const { client } = setup();
    await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { now: BEFORE_CLOSING });
    const res = await missed(client, AFTER_CLOSING);
    assert.equal(res.body.afterClosing, true);
    const days = orderIds(res.body);
    assert.equal(days[0]![0], '2026-11-14');
    assert.deepEqual(days[0]![1], ['MF-10483', 'MF-10484', 'FTD-2207731', 'MF-10485']);
    assert.equal(days[1]![0], '2026-11-13');
    assert.equal(res.body.total, 6);
  });

  it('a voided confirmation puts the order back on the list', async () => {
    const { client } = setup();
    const saved = await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { now: BEFORE_CLOSING });
    await client.request('POST', `/api/dashboard/confirmations/${saved.body.confirmation.id}/void`, { reason: 'Wrong order' }, { role: 'employee', now: BEFORE_CLOSING });
    const res = await missed(client, AFTER_CLOSING);
    assert.ok(res.body.days[0].orders.some((o: { orderId: string }) => o.orderId === 'MF-10482'));
  });

  it('looks back one week only', async () => {
    const { client, db } = setup();
    db.sqlite.exec("UPDATE deliveries SET delivery_date = '2026-11-07' WHERE delivery_date = '2026-11-13'");
    const res = await missed(client, BEFORE_CLOSING);
    assert.equal(res.body.lookbackDays, 7);
    assert.equal(res.body.total, 0);
  });

  it('uses the configured closing time', async () => {
    const { client } = setup({ SHOP_CLOSING_TIME: '15:00' });
    assert.equal((await missed(client, BEFORE_CLOSING)).body.afterClosing, true);
    const config = await client.request('GET', '/api/config');
    assert.equal(config.body.closingTime, '15:00');
    const bad = setup({ SHOP_CLOSING_TIME: '6pm' });
    assert.equal((await missed(bad.client, BEFORE_CLOSING)).body.closingTime, '18:00', 'an invalid value falls back to 18:00');
  });

  it('is for employees only', async () => {
    const { client } = setup();
    assert.equal((await client.request('GET', '/api/dashboard/missed', undefined, { role: 'driver' })).status, 403);
  });
});

describe('automatic local backups', () => {
  function makeDatabase(dir: string): string {
    const file = join(dir, 'live.sqlite');
    const db = new DatabaseSync(file);
    for (const f of MIGRATIONS) db.exec(readFileSync(new URL(`migrations/${f}`, ROOT), 'utf8'));
    db.exec(readFileSync(new URL('seed/demo-seed.sql', ROOT), 'utf8'));
    db.close();
    return file;
  }

  it('makes a complete, checked copy and keeps only the newest ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-backup-'));
    try {
      const source = makeDatabase(dir);
      const folder = join(dir, 'backups');
      const first = backup(source, folder, KEEP_ALL, new Date(2026, 10, 14, 18, 5), 2);
      assert.match(first.file, /delivery-confirmations-2026-11-14_1805\.sqlite$/);
      assert.ok(first.deliveries > 0);
      backup(source, folder, KEEP_ALL, new Date(2026, 10, 15, 8, 0), 2);
      const third = backup(source, folder, KEEP_ALL, new Date(2026, 10, 16, 8, 0), 2);
      assert.deepEqual(third.removed, ['delivery-confirmations-2026-11-14_1805.sqlite']);
      assert.deepEqual(readdirSync(folder).sort(), ['delivery-confirmations-2026-11-15_0800.sqlite', 'delivery-confirmations-2026-11-16_0800.sqlite']);
      const copy = new DatabaseSync(third.file, { readOnly: true });
      const n = (copy.prepare('SELECT COUNT(*) AS n FROM deliveries').get() as { n: number }).n;
      copy.close();
      assert.equal(n, third.deliveries);
      // Two backups in the same minute do not overwrite each other.
      const again = backup(source, folder, KEEP_ALL, new Date(2026, 10, 16, 8, 0), 5);
      assert.match(again.file, /_0800-2\.sqlite$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('every copy holds only the last 30 days of deliveries, older copies included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-backup-'));
    try {
      const source = makeDatabase(dir);
      const live = new DatabaseSync(source);
      live.exec("UPDATE deliveries SET delivery_date = '2026-10-01' WHERE order_id = 'MF-10482'");
      live.close();
      const folder = join(dir, 'backups');
      // An older copy made before the rule cut anything (it still has the October delivery).
      const old = backup(source, folder, KEEP_ALL, new Date(2026, 10, 1, 8, 0));
      const count = (file: string) => {
        const db = new DatabaseSync(file, { readOnly: true });
        const n = (db.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE delivery_date < '2026-10-18'").get() as { n: number }).n;
        db.close();
        return n;
      };
      assert.equal(count(old.file), 1);
      const now = backup(source, folder, '2026-10-18', new Date(2026, 10, 16, 8, 0));
      assert.equal(count(now.file), 0, 'the new copy has nothing older than 30 days');
      assert.equal(count(old.file), 0, 'the older copy was cut down too');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
