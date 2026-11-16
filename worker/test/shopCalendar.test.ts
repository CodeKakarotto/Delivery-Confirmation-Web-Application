import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createEnv, exceptionSubmission, TestClient, validSubmission } from './helpers/app.ts';

/** "Now" for these tests: Saturday 14 November 2026, 3 PM in New York. */
const NOW = new Date('2026-11-14T20:00:00.000Z');

async function confirmAt(client: TestClient, iso: string, overrides: Record<string, unknown>) {
  const body = overrides.outcome && overrides.outcome !== 'delivered_to_recipient' ? exceptionSubmission(overrides) : validSubmission(overrides);
  const res = await client.request('POST', '/api/driver/confirmations', body, { now: new Date(iso) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.confirmation;
}

async function seeded() {
  const { env, db } = createEnv();
  const client = new TestClient(env);
  await confirmAt(client, '2026-11-14T15:30:00.000Z', { orderId: 'MF-10482' }); // Sat Nov 14, 10:30 AM ET
  await confirmAt(client, '2026-11-15T03:00:00.000Z', { orderId: 'MF-10483', receivedBy: 'Porch', outcome: 'left_at_door' }); // Sat Nov 14, 10 PM ET
  await confirmAt(client, '2026-11-02T14:00:00.000Z', { orderId: 'MF-10484', receivedBy: 'Sam Testcase' }); // Mon Nov 2
  await confirmAt(client, '2026-10-01T16:00:00.000Z', { orderId: 'FTD-2207731', receivedBy: 'Casey Sample' }); // Thu Oct 1
  await confirmAt(client, '2026-09-30T16:00:00.000Z', { orderId: 'MF-10470', receivedBy: 'Morgan Fixture' }); // Wed Sep 30
  // A conflicting second submission for MF-10482 flags it.
  await client.request('POST', '/api/driver/confirmations', validSubmission({ receivedBy: 'Someone', idempotencyKey: randomUUID() }), { now: NOW });
  return { env, db, client };
}

describe('shop confirmations calendar: month → week → day', () => {
  it('groups confirmations by shop-local month, Sunday-to-Saturday week and day, newest first', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/calendar', undefined, { now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const cal = res.body;
    assert.equal(cal.timeZone, 'America/New_York');
    assert.equal(cal.today, '2026-11-14');
    assert.equal(cal.currentWeekStart, '2026-11-08');
    assert.deepEqual(cal.months.map((m: { month: string }) => m.month), ['2026-11', '2026-10', '2026-09']);

    const nov = cal.months[0];
    assert.deepEqual({ count: nov.count, needsReview: nov.needsReview, flagged: nov.flagged }, { count: 3, needsReview: 1, flagged: 1 });
    assert.deepEqual(
      nov.weeks.map((w: { start: string; end: string; count: number }) => [w.start, w.end, w.count]),
      [
        ['2026-11-08', '2026-11-14', 2],
        ['2026-11-01', '2026-11-07', 1],
      ],
    );
    // The 10 PM ET delivery (03:00 UTC on the 15th) belongs to Saturday the 14th in the shop.
    assert.deepEqual(nov.weeks[0].days, [{ date: '2026-11-14', count: 2, needsReview: 1, flagged: 1 }]);
    assert.deepEqual(nov.weeks[1].days, [{ date: '2026-11-02', count: 1, needsReview: 0, flagged: 0 }]);
  });

  it('splits a week that crosses a month boundary between the two months', async () => {
    const { client } = await seeded();
    const cal = (await client.request('GET', '/api/dashboard/calendar', undefined, { now: NOW })).body;
    const oct = cal.months.find((m: { month: string }) => m.month === '2026-10');
    const sep = cal.months.find((m: { month: string }) => m.month === '2026-09');
    assert.deepEqual([oct.weeks[0].start, oct.weeks[0].end], ['2026-10-01', '2026-10-03']);
    assert.deepEqual([sep.weeks[0].start, sep.weeks[0].end], ['2026-09-27', '2026-09-30']);
  });

  it('always includes the current month, week and day, even with no confirmations yet', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const cal = (await client.request('GET', '/api/dashboard/calendar', undefined, { now: NOW })).body;
    assert.equal(cal.months.length, 1);
    assert.equal(cal.months[0].month, '2026-11');
    assert.deepEqual(cal.months[0].weeks, [
      { start: '2026-11-08', end: '2026-11-14', count: 0, needsReview: 0, flagged: 0, days: [{ date: '2026-11-14', count: 0, needsReview: 0, flagged: 0 }] },
    ]);
  });
});

describe('shop confirmations: one day, 10 per page', () => {
  it('lists the confirmations of a shop-local day, with their times', async () => {
    const { client } = await seeded();
    const day = await client.request('GET', '/api/dashboard/confirmations?day=2026-11-14', undefined, { now: NOW });
    assert.equal(day.status, 200);
    assert.equal(day.body.total, 2);
    assert.deepEqual(day.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10483', 'MF-10482']);
    assert.equal(day.body.items[0].confirmedAt, '2026-11-15T03:00:00.000Z');
    const next = await client.request('GET', '/api/dashboard/confirmations?day=2026-11-15', undefined, { now: NOW });
    assert.equal(next.body.total, 0);
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?day=2026-13-01')).status, 422);
  });

  it('pages a busy day 10 confirmations at a time', async () => {
    const { env, db } = createEnv();
    const client = new TestClient(env);
    const insert = db.sqlite.prepare(
      `INSERT INTO deliveries (order_id, recipient_name, address_line, city, state, postal_code, delivery_date, created_at, updated_at)
       VALUES (?, 'Demo Person', '1 Test St', 'Lake Ridge', 'VA', '22192', '2026-11-14', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
    );
    for (let i = 1; i <= 12; i++) insert.run(`BUSY-${i}`);
    for (let i = 1; i <= 12; i++) {
      // 12:10, 12:20 … 14:00 UTC: BUSY-12 is the newest.
      await confirmAt(client, new Date(Date.UTC(2026, 10, 14, 12, i * 10)).toISOString(), { orderId: `BUSY-${i}` });
    }
    const page1 = await client.request('GET', '/api/dashboard/confirmations?day=2026-11-14&limit=10', undefined, { now: NOW });
    assert.equal(page1.body.total, 12);
    assert.equal(page1.body.items.length, 10);
    assert.equal(page1.body.items[0].orderId, 'BUSY-12', 'newest first');
    const page2 = await client.request('GET', '/api/dashboard/confirmations?day=2026-11-14&limit=10&offset=10', undefined, { now: NOW });
    assert.deepEqual(page2.body.items.map((i: { orderId: string }) => i.orderId), ['BUSY-2', 'BUSY-1']);
  });
});

describe('shop order view (clicking an awaiting order)', () => {
  it('shows an order that is still awaiting confirmation', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/orders/mf-10485', undefined, { now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.body.status, 'awaiting');
    assert.equal(res.body.confirmation, null);
    assert.equal(res.body.delivery.orderId, 'MF-10485');
    assert.equal(res.body.delivery.recipientName, 'Riley Mockdata');
    assert.match(res.body.delivery.deliveryDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('links a confirmed order to its saved confirmation', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/orders/MF-10482', undefined, { now: NOW });
    assert.equal(res.body.status, 'confirmed');
    assert.match(res.body.confirmation.id, /^[0-9a-f-]{36}$/);
    assert.equal(res.body.confirmation.confirmedAt, '2026-11-14T15:30:00.000Z');
    assert.equal(res.body.confirmation.result, 'confirmed');
  });

  it('marks cancelled orders and answers 404 for unknown ones', async () => {
    const { client } = await seeded();
    assert.equal((await client.request('GET', '/api/dashboard/orders/MF-10490')).body.status, 'cancelled');
    assert.equal((await client.request('GET', '/api/dashboard/orders/NOPE-1')).status, 404);
  });
});

describe('shop day summary uses the shop time zone', () => {
  it('defaults to the shop-local date, not the UTC date', async () => {
    const { client } = await seeded();
    // 10 PM Saturday in New York is already Sunday in UTC.
    const res = await client.request('GET', '/api/dashboard/summary', undefined, { now: new Date('2026-11-15T03:00:00.000Z') });
    assert.equal(res.body.date, '2026-11-14');
    assert.equal(res.body.isPast, false);
  });
});
