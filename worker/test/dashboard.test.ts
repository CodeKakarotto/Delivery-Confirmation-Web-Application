import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createEnv, exceptionSubmission, makePng, TestClient, validSubmission } from './helpers/app.ts';

/** Fixed "now": Saturday 14 November 2026, 3 PM in New York (the shop's time zone). */
const NOW = new Date('2026-11-14T20:00:00.000Z');

async function seeded() {
  const { env, db } = createEnv();
  // The seed schedules orders for "today" and "yesterday" relative to the real clock; pin them to fixed days.
  db.sqlite.exec("UPDATE deliveries SET delivery_date = CASE WHEN delivery_date = date('now', '-5 hours') THEN '2026-11-14' ELSE '2026-11-13' END");
  const client = new TestClient(env);
  const now = NOW;
  const a = await client.request('POST', '/api/driver/confirmations', validSubmission(), { now });
  const b = await client.request(
    'POST',
    '/api/driver/confirmations',
    exceptionSubmission({ orderId: 'MF-10484', receivedBy: 'Front Desk', outcome: 'left_with_front_desk', outcomeDetail: 'Signed by reception' }),
    { now },
  );
  // A conflicting second attempt for MF-10482.
  await client.request(
    'POST',
    '/api/driver/confirmations',
    exceptionSubmission({ receivedBy: 'Not Avery', outcome: 'left_at_door', idempotencyKey: randomUUID() }),
    { now },
  );
  return { env, db, client, first: a.body.confirmation, second: b.body.confirmation };
}

describe('employee dashboard: list and search', () => {
  it('lists saved confirmations, newest first, with the review fields', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/confirmations');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.body.total, 2);
    const item = res.body.items.find((i: { orderId: string }) => i.orderId === 'MF-10482');
    assert.deepEqual(
      Object.keys(item).sort(),
      ['attemptCount', 'changeCount', 'confirmedAt', 'corrected', 'hasConflict', 'id', 'orderId', 'outcome', 'receivedBy', 'recipientName', 'result', 'source', 'stopNumber', 'voided', 'zone'],
    );
    assert.equal(item.receivedBy, 'Avery Demo');
    assert.equal(item.result, 'confirmed');
    assert.equal(item.attemptCount, 1);
    assert.equal(item.hasConflict, true);
    const desk = res.body.items.find((i: { orderId: string }) => i.orderId === 'MF-10484');
    assert.equal(desk.result, 'needs_review');
    assert.equal(desk.attemptCount, 0);
  });

  it('finds a confirmation by the exact order ID (any letter case), and nothing for partial IDs', async () => {
    const { client } = await seeded();
    const exact = await client.request('GET', '/api/dashboard/confirmations?orderId=mf-10484');
    assert.equal(exact.body.total, 1);
    assert.equal(exact.body.items[0].orderId, 'MF-10484');
    const partial = await client.request('GET', '/api/dashboard/confirmations?orderId=MF-1048');
    assert.equal(partial.body.total, 0);
    const wildcard = await client.request('GET', `/api/dashboard/confirmations?orderId=${encodeURIComponent('MF-1048%')}`);
    assert.equal(wildcard.status, 422);
  });

  it('filters by result and by flagged records', async () => {
    const { client } = await seeded();
    const review = await client.request('GET', '/api/dashboard/confirmations?result=needs_review');
    assert.deepEqual(review.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10484']);
    const flagged = await client.request('GET', '/api/dashboard/confirmations?flagged=1');
    assert.deepEqual(flagged.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10482']);
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?result=bogus')).status, 422);
  });

  it('pages results with a bounded limit', async () => {
    const { client } = await seeded();
    const page = await client.request('GET', '/api/dashboard/confirmations?limit=1&offset=1');
    assert.equal(page.body.items.length, 1);
    assert.equal(page.body.total, 2);
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?limit=5000')).status, 422);
  });
});

describe('employee dashboard: detail and signature', () => {
  it('returns the full record, including order details, exception and refused attempts', async () => {
    const { client, first } = await seeded();
    const res = await client.request('GET', `/api/dashboard/confirmations/${first.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const c = res.body.confirmation;
    assert.equal(c.orderId, 'MF-10482');
    assert.equal(c.delivery.recipientName, 'Avery Demo');
    assert.equal(c.delivery.addressLine, '100 Sample Way');
    assert.equal(c.delivery.deliveryInstructions, 'Ring the bell twice. Keep the arrangement upright.');
    assert.equal(c.delivery.totalProducts, 3);
    assert.equal(c.signatureWidth, 600);
    assert.equal(c.signatureHeight, 200);
    assert.equal(c.attempts.length, 1);
    assert.equal(c.attempts[0].kind, 'conflict');
    assert.equal(c.attempts[0].receivedBy, 'Not Avery');
    assert.equal(c.signaturePng, undefined, 'the signature is served separately');
  });

  it('serves the saved signature as a PNG that is never cached', async () => {
    const { client, first } = await seeded();
    const res = await client.request('GET', `/api/dashboard/confirmations/${first.id}/signature`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'image/png');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(res.headers.get('Content-Security-Policy') ?? '', /sandbox/);
    assert.deepEqual(res.bytes, makePng());
  });

  it('answers 404 for unknown or malformed confirmation IDs', async () => {
    const { client } = await seeded();
    assert.equal((await client.request('GET', `/api/dashboard/confirmations/${randomUUID()}`)).status, 404);
    assert.equal((await client.request('GET', '/api/dashboard/confirmations/1')).status, 404);
    assert.equal((await client.request('GET', `/api/dashboard/confirmations/${randomUUID()}/signature`)).status, 404);
  });
});

describe('employee dashboard: daily summary', () => {
  it('compares confirmations with the orders scheduled for the day', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/summary?date=2026-11-14', undefined, { now: NOW });
    assert.equal(res.status, 200);
    const s = res.body;
    assert.equal(s.date, '2026-11-14');
    assert.equal(s.isPast, false);
    // Seed: 5 orders that day that are not cancelled (MF-10490 is cancelled and not expected).
    assert.equal(s.expected, 5);
    assert.equal(s.confirmed, 1);
    assert.equal(s.needsReview, 1);
    assert.equal(s.flagged, 1);
    assert.deepEqual(
      s.awaiting.map((a: { orderId: string }) => a.orderId),
      ['MF-10483', 'FTD-2207731', 'MF-10485'],
      'sorted by stop number, unknown stop numbers last',
    );
    assert.ok(!s.awaiting.some((a: { orderId: string }) => a.orderId === 'MF-10490'));
  });

  it('marks a past day so unconfirmed orders can be reported as missing', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/summary?date=2026-11-13', undefined, { now: NOW });
    assert.equal(res.body.isPast, true);
    assert.equal(res.body.expected, 2);
    assert.equal(res.body.awaiting.length, 2);
  });

  it('defaults to today in the shop time zone and validates the date', async () => {
    const { client } = await seeded();
    const res = await client.request('GET', '/api/dashboard/summary', undefined, { now: NOW });
    assert.equal(res.body.date, '2026-11-14');
    assert.equal((await client.request('GET', '/api/dashboard/summary?date=2026-02-30')).status, 422);
    assert.equal((await client.request('GET', '/api/dashboard/summary?date=yesterday')).status, 422);
  });
});
