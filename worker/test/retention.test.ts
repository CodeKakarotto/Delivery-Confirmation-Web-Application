import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retentionCutoff, retentionSql } from '../src/db/retention.ts';
import { runRetention } from '../src/index.ts';
import { createEnv, TestClient, validSubmission } from './helpers/app.ts';

/** Saturday 14 November 2026, 4 AM in New York (when the nightly job runs). */
const NIGHT = new Date('2026-11-14T09:00:00.000Z');
const count = (db: ReturnType<typeof createEnv>['db'], sql: string) => (db.sqlite.prepare(sql).get() as { n: number }).n;

describe('the database keeps the last 30 days of deliveries', () => {
  it('keeps today and the 29 days before it', () => {
    assert.equal(retentionCutoff('2026-11-14', 30), '2026-10-16');
    assert.throws(() => retentionSql("2026-10-16'; DROP TABLE deliveries; --"));
  });

  it('deletes older deliveries with their confirmations, signatures and history, and keeps the rest', async () => {
    const { env, db } = createEnv();
    const client = new TestClient(env);
    db.sqlite.exec("UPDATE deliveries SET delivery_date = '2026-11-14'");
    // MF-10482 is confirmed and then corrected; then its day is moved 31 days back.
    const saved = await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }));
    const id = saved.body.confirmation.id as string;
    await client.request('POST', `/api/dashboard/confirmations/${id}/corrections`, { receivedBy: 'Avery D.', reason: 'Spelling' }, { role: 'employee' });
    db.sqlite.exec("UPDATE deliveries SET delivery_date = '2026-10-15' WHERE order_id IN ('MF-10482', 'MF-10483')");
    db.sqlite.exec("UPDATE deliveries SET delivery_date = '2026-10-16' WHERE order_id = 'MF-10484'");
    const before = count(db, 'SELECT COUNT(*) AS n FROM deliveries');

    const result = await runRetention(env, NIGHT);
    assert.deepEqual(result, { cutoff: '2026-10-16', deliveries: 2, confirmations: 1 });
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM deliveries'), before - 2);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM deliveries WHERE order_id = 'MF-10484'"), 1, 'exactly 30 days old is still kept');
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM delivery_confirmations'), 0);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM confirmation_corrections'), 0);
    assert.equal((await runRetention(env, NIGHT)).deliveries, 0, 'running it again changes nothing');
  });

  it('uses RETENTION_DAYS, and falls back to 30 for a bad value', async () => {
    const { env, db } = createEnv({ RETENTION_DAYS: '7' });
    db.sqlite.exec("UPDATE deliveries SET delivery_date = '2026-11-07'");
    assert.equal((await runRetention(env, NIGHT)).cutoff, '2026-11-08');
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM deliveries'), 0);
    const bad = createEnv({ RETENTION_DAYS: '2' });
    assert.equal((await runRetention(bad.env, NIGHT)).cutoff, '2026-10-16');
    const config = await new TestClient(env).request('GET', '/api/config');
    assert.equal(config.body.retentionDays, 7);
  });
});
