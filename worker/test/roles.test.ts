import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv, TestClient, validSubmission } from './helpers/app.ts';

/** Saturday 14 November 2026, 3 PM in New York. */
const NOW = new Date('2026-11-14T20:00:00.000Z');

function setup() {
  const { env, db } = createEnv();
  // Pin the seed's "today"/"yesterday" orders to fixed days.
  db.sqlite.exec("UPDATE deliveries SET delivery_date = CASE WHEN delivery_date = date('now', '-5 hours') THEN '2026-11-14' ELSE '2026-11-13' END");
  return { env, db, client: new TestClient(env) };
}

describe('prototype roles (stand-in for logins)', () => {
  it('lets only drivers use the driver endpoints', async () => {
    const { client, db } = setup();
    for (const role of ['shop', null, 'admin']) {
      const lookup = await client.request('GET', '/api/driver/deliveries/MF-10482', undefined, { role });
      assert.equal(lookup.status, 403, `lookup as ${role}`);
      assert.equal(lookup.body.error.code, 'role_required');
      const list = await client.request('GET', '/api/driver/deliveries', undefined, { role, now: NOW });
      assert.equal(list.status, 403, `list as ${role}`);
      const submit = await client.request('POST', '/api/driver/confirmations', validSubmission(), { role });
      assert.equal(submit.status, 403, `submit as ${role}`);
    }
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n, 0);
  });

  it('lets only shop employees view confirmations and the shop overview', async () => {
    const { client } = setup();
    for (const path of ['/api/dashboard/summary', '/api/dashboard/calendar', '/api/dashboard/confirmations', '/api/dashboard/orders/MF-10482']) {
      for (const role of ['driver', null]) {
        const res = await client.request('GET', path, undefined, { role });
        assert.equal(res.status, 403, `${path} as ${role}`);
        assert.equal(res.body.error.code, 'role_required');
      }
      assert.equal((await client.request('GET', path, undefined, { role: 'shop' })).status, 200, path);
    }
  });

  it('still refuses everything outside the local demonstration, whatever the role', async () => {
    const { env } = createEnv({ APP_ENV: 'production' });
    const client = new TestClient(env);
    assert.equal((await client.request('GET', '/api/driver/deliveries', undefined, { role: 'driver' })).status, 503);
    assert.equal((await client.request('GET', '/api/dashboard/calendar', undefined, { role: 'shop' })).status, 503);
  });
});

describe('driver page: orders awaiting delivery today', () => {
  it("lists today's unconfirmed, uncancelled orders by stop number, with only what a driver needs to pick one", async () => {
    const { client } = setup();
    await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { now: NOW });
    const res = await client.request('GET', '/api/driver/deliveries', undefined, { now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.body.date, '2026-11-14');
    assert.deepEqual(
      res.body.items.map((i: { orderId: string }) => i.orderId),
      ['MF-10483', 'MF-10484', 'FTD-2207731', 'MF-10485'],
      'confirmed (MF-10482), cancelled (MF-10490) and other days are left out; no stop number sorts last',
    );
    assert.deepEqual(Object.keys(res.body.items[0]).sort(), ['city', 'orderId', 'recipientName', 'stopNumber', 'zone']);
    assert.ok(!JSON.stringify(res.body).includes('Placeholder Ct'), 'street addresses only appear after opening an order');
  });

  it('uses the shop’s day, not the UTC day', async () => {
    const { client } = setup();
    // 10 PM Saturday in New York is already Sunday in UTC: still Saturday's list.
    const res = await client.request('GET', '/api/driver/deliveries', undefined, { now: new Date('2026-11-15T03:00:00.000Z') });
    assert.equal(res.body.date, '2026-11-14');
    assert.equal(res.body.items.length, 5);
  });
});

describe('driver page: awaiting list, 5 per page', () => {
  it('pages the awaiting list with a total', async () => {
    const { client, db } = setup();
    const insert = db.sqlite.prepare(
      `INSERT INTO deliveries (order_id, recipient_name, address_line, city, state, postal_code, stop_number, delivery_date, created_at, updated_at)
       VALUES (?, 'Demo Person', '1 Test St', 'Lake Ridge', 'VA', '22192', ?, '2026-11-14', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
    );
    for (let i = 1; i <= 7; i++) insert.run(`PAGE-${i}`, 10 + i);
    // 5 seeded orders for the day + 7 more = 12 awaiting.
    const page1 = await client.request('GET', '/api/driver/deliveries?limit=5&offset=0', undefined, { now: NOW });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.total, 12);
    assert.deepEqual(page1.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10482', 'MF-10483', 'MF-10484', 'FTD-2207731', 'PAGE-1']);
    const page3 = await client.request('GET', '/api/driver/deliveries?limit=5&offset=10', undefined, { now: NOW });
    assert.deepEqual(page3.body.items.map((i: { orderId: string }) => i.orderId), ['PAGE-7', 'MF-10485']);
    assert.equal((await client.request('GET', '/api/driver/deliveries?limit=0', undefined, { now: NOW })).status, 422);
    assert.equal((await client.request('GET', '/api/driver/deliveries?limit=51', undefined, { now: NOW })).status, 422);
  });
});
