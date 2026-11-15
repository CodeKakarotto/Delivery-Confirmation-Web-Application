import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv, makePng, TestClient, validSubmission } from './helpers/app.ts';

/** Saturday 14 November 2026, 3 PM in New York. */
const NOW = new Date('2026-11-14T20:00:00.000Z');

function setup() {
  const { env, db } = createEnv();
  // Pin the seed's "today"/"yesterday" orders to fixed days.
  db.sqlite.exec("UPDATE deliveries SET delivery_date = CASE WHEN delivery_date = date('now', '-5 hours') THEN '2026-11-14' ELSE '2026-11-13' END");
  return { env, db, client: new TestClient(env) };
}

describe('who may do what (signed-in accounts)', () => {
  it('requires a signed-in account for every data endpoint', async () => {
    const { client } = setup();
    for (const [method, path] of [
      ['GET', '/api/driver/deliveries'],
      ['GET', '/api/driver/deliveries/MF-10482'],
      ['POST', '/api/driver/confirmations'],
      ['GET', '/api/dashboard/summary'],
      ['GET', '/api/dashboard/calendar'],
      ['GET', '/api/dashboard/confirmations'],
      ['GET', '/api/dashboard/deliveries'],
      ['GET', '/api/dashboard/orders/MF-10482'],
    ] as const) {
      const res = await client.request(method, path, method === 'POST' ? validSubmission() : undefined, { role: null });
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.equal(res.body.error.code, 'unauthenticated');
    }
  });

  it('lets only drivers see awaiting orders and confirm deliveries', async () => {
    const { client, db } = setup();
    assert.equal((await client.request('GET', '/api/driver/deliveries', undefined, { role: 'employee', now: NOW })).status, 403);
    assert.equal((await client.request('GET', '/api/driver/deliveries/MF-10482', undefined, { role: 'employee' })).status, 403);
    const submit = await client.request('POST', '/api/driver/confirmations', validSubmission(), { role: 'employee' });
    assert.equal(submit.status, 403);
    assert.equal(submit.body.error.code, 'role_required');
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n, 0);
  });

  it('keeps the shop-wide views for employees', async () => {
    const { client } = setup();
    for (const path of ['/api/dashboard/summary', '/api/dashboard/deliveries', '/api/dashboard/orders/MF-10482']) {
      assert.equal((await client.request('GET', path, undefined, { role: 'driver' })).status, 403, path);
      assert.equal((await client.request('GET', path, undefined, { role: 'employee' })).status, 200, path);
    }
  });

  it('records which driver confirmed each delivery', async () => {
    const { client, db } = setup();
    await client.request('POST', '/api/driver/confirmations', validSubmission(), { role: 'driver2', now: NOW });
    const row = db.sqlite
      .prepare('SELECT u.username FROM delivery_confirmations c JOIN users u ON u.id = c.confirmed_by_user_id')
      .get() as { username: string };
    assert.equal(row.username, 'driver2');
  });
});

describe('drivers see only their own confirmations; employees see all', () => {
  async function twoDrivers() {
    const ctx = setup();
    const a = await ctx.client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { role: 'driver1', now: NOW });
    const b = await ctx.client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10483', receivedBy: 'Jordan' }), {
      role: 'driver2',
      now: NOW,
    });
    return { ...ctx, mine: a.body.confirmation.id as string, theirs: b.body.confirmation.id as string };
  }

  it('scopes the calendar and the list', async () => {
    const { client } = await twoDrivers();
    const cal1 = await client.request('GET', '/api/dashboard/calendar', undefined, { role: 'driver1', now: NOW });
    assert.equal(cal1.body.months[0].count, 1);
    const calE = await client.request('GET', '/api/dashboard/calendar', undefined, { role: 'employee', now: NOW });
    assert.equal(calE.body.months[0].count, 2);
    const list1 = await client.request('GET', '/api/dashboard/confirmations?day=2026-11-14', undefined, { role: 'driver1', now: NOW });
    assert.deepEqual(list1.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10482']);
    const listE = await client.request('GET', '/api/dashboard/confirmations?day=2026-11-14', undefined, { role: 'employee', now: NOW });
    assert.equal(listE.body.total, 2);
  });

  it('lets a driver open their own record and signature, but not another driver’s', async () => {
    const { client, mine, theirs } = await twoDrivers();
    assert.equal((await client.request('GET', `/api/dashboard/confirmations/${mine}`, undefined, { role: 'driver1' })).status, 200);
    assert.equal((await client.request('GET', `/api/dashboard/confirmations/${theirs}`, undefined, { role: 'driver1' })).status, 404);
    assert.equal((await client.request('GET', `/api/dashboard/confirmations/${theirs}/signature`, undefined, { role: 'driver1' })).status, 404);
    assert.equal((await client.request('GET', `/api/dashboard/confirmations/${theirs}`, undefined, { role: 'employee' })).status, 200);
  });

  it('serves the signature picture with just the session cookie (as an <img> loads it)', async () => {
    const { client, mine } = await twoDrivers();
    await client.request('GET', '/api/auth/me', undefined, { role: 'employee' });
    const { cookie } = client.sessions.get('employee1')!;
    const res = await client.request('GET', `/api/dashboard/confirmations/${mine}/signature`, undefined, { role: null, headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(res.bytes, makePng());
  });

  it('shows a driver their most recent confirmations first', async () => {
    const { client } = await twoDrivers();
    const recent = await client.request('GET', '/api/dashboard/confirmations?limit=5', undefined, { role: 'driver2', now: NOW });
    assert.deepEqual(recent.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10483']);
  });
});

describe('driver dashboard: awaiting orders, 5 per page', () => {
  it("lists today's unconfirmed, uncancelled orders by stop number, without street addresses", async () => {
    const { client } = setup();
    await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { now: NOW });
    const res = await client.request('GET', '/api/driver/deliveries', undefined, { now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.body.date, '2026-11-14');
    assert.deepEqual(res.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10483', 'MF-10484', 'FTD-2207731', 'MF-10485']);
    assert.deepEqual(Object.keys(res.body.items[0]).sort(), ['city', 'orderId', 'recipientName', 'stopNumber', 'zone']);
    assert.ok(!JSON.stringify(res.body).includes('Placeholder Ct'));
  });

  it('uses the shop’s day, not the UTC day', async () => {
    const { client } = setup();
    const res = await client.request('GET', '/api/driver/deliveries', undefined, { now: new Date('2026-11-15T03:00:00.000Z') });
    assert.equal(res.body.date, '2026-11-14');
    assert.equal(res.body.items.length, 5);
  });

  it('pages the list with a total', async () => {
    const { client, db } = setup();
    const insert = db.sqlite.prepare(
      `INSERT INTO deliveries (order_id, recipient_name, address_line, city, state, postal_code, stop_number, delivery_date, created_at, updated_at)
       VALUES (?, 'Demo Person', '1 Test St', 'Lake Ridge', 'VA', '22192', ?, '2026-11-14', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
    );
    for (let i = 1; i <= 7; i++) insert.run(`PAGE-${i}`, 10 + i);
    const page1 = await client.request('GET', '/api/driver/deliveries?limit=5&offset=0', undefined, { now: NOW });
    assert.equal(page1.body.total, 12);
    assert.deepEqual(page1.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10482', 'MF-10483', 'MF-10484', 'FTD-2207731', 'PAGE-1']);
    const page3 = await client.request('GET', '/api/driver/deliveries?limit=5&offset=10', undefined, { now: NOW });
    assert.deepEqual(page3.body.items.map((i: { orderId: string }) => i.orderId), ['PAGE-7', 'MF-10485']);
    assert.equal((await client.request('GET', '/api/driver/deliveries?limit=0', undefined, { now: NOW })).status, 422);
    assert.equal((await client.request('GET', '/api/driver/deliveries?limit=51', undefined, { now: NOW })).status, 422);
  });
});

describe('employee deliveries list and search', () => {
  it('lists a day’s deliveries with their status and confirmation time, 10 per page', async () => {
    const { client } = setup();
    await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { now: NOW });
    const res = await client.request('GET', '/api/dashboard/deliveries?date=2026-11-14&limit=10', undefined, { now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 6, 'every order that day, including the cancelled one');
    const byId = Object.fromEntries(res.body.items.map((i: { orderId: string }) => [i.orderId, i]));
    assert.equal(byId['MF-10482'].status, 'confirmed');
    assert.equal(byId['MF-10482'].confirmation.receivedBy, 'Avery Demo');
    assert.equal(byId['MF-10482'].confirmation.confirmedAt, NOW.toISOString());
    assert.equal(byId['MF-10483'].status, 'awaiting');
    assert.equal(byId['MF-10490'].status, 'cancelled');
    const awaiting = await client.request('GET', '/api/dashboard/deliveries?date=2026-11-14&status=awaiting', undefined, { now: NOW });
    assert.equal(awaiting.body.total, 4);
  });

  it('searches by order ID or recipient name, safely', async () => {
    const { client } = setup();
    const byName = await client.request('GET', `/api/dashboard/deliveries?q=${encodeURIComponent('jordan')}`);
    assert.deepEqual(byName.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10483']);
    const byId = await client.request('GET', '/api/dashboard/deliveries?q=FTD-22');
    assert.deepEqual(byId.body.items.map((i: { orderId: string }) => i.orderId), ['FTD-2207731']);
    const wildcard = await client.request('GET', `/api/dashboard/deliveries?q=${encodeURIComponent('%')}`);
    assert.equal(wildcard.body.total, 0, 'SQL wildcards are matched literally');
    assert.equal((await client.request('GET', `/api/dashboard/deliveries?q=${'x'.repeat(101)}`)).status, 422);
    assert.equal((await client.request('GET', '/api/dashboard/deliveries?status=bogus')).status, 422);
  });
});
