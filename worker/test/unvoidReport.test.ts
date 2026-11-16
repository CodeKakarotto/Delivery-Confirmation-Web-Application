import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv, exceptionSubmission, TestClient, validSubmission } from './helpers/app.ts';

/** Saturday 14 November 2026, 3 PM in New York. */
const NOW = new Date('2026-11-14T20:00:00.000Z');

function setup() {
  const { env, db } = createEnv();
  db.sqlite.exec("UPDATE deliveries SET delivery_date = CASE WHEN delivery_date = date('now', '-5 hours') THEN '2026-11-14' ELSE '2026-11-13' END");
  return { env, db, client: new TestClient(env) };
}

const post = (client: TestClient, path: string, body: unknown, opts: Record<string, unknown> = {}) =>
  client.request('POST', path, body, { role: 'employee', now: NOW, ...opts });

async function voided(client: TestClient) {
  const saved = await client.request('POST', '/api/driver/confirmations', validSubmission(), { now: NOW });
  const id = saved.body.confirmation.id as string;
  assert.equal((await post(client, `/api/dashboard/confirmations/${id}/void`, { reason: 'Wrong order' })).status, 200);
  return id;
}

describe('undo a void (employees)', () => {
  it('only works on a voided record', async () => {
    const { client } = setup();
    const saved = await client.request('POST', '/api/driver/confirmations', validSubmission(), { now: NOW });
    const res = await post(client, `/api/dashboard/confirmations/${saved.body.confirmation.id}/unvoid`, { reason: 'Oops' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'not_voided');
  });

  it('restores the record with a reason; it counts again and the history shows it', async () => {
    const { client } = setup();
    const id = await voided(client);
    assert.equal((await post(client, `/api/dashboard/confirmations/${id}/unvoid`, { reason: ' ' })).status, 422);
    const res = await post(client, `/api/dashboard/confirmations/${id}/unvoid`, { reason: 'Voided the wrong record by mistake' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const c = res.body.confirmation;
    assert.equal(c.voided, null);
    assert.deepEqual(
      c.corrections.map((k: { kind: string; reason: string }) => [k.kind, k.reason]),
      [
        ['void', 'Wrong order'],
        ['unvoid', 'Voided the wrong record by mistake'],
      ],
    );
    assert.equal((await client.request('GET', '/api/driver/deliveries/MF-10482')).body.status, 'already_confirmed');
    const summary = await client.request('GET', '/api/dashboard/summary?date=2026-11-14', undefined, { role: 'employee', now: NOW });
    assert.equal(summary.body.confirmed, 1);
  });

  it('the Deliveries list keeps a voided order reachable, and an undone void puts it back as delivered', async () => {
    const { client } = setup();
    const saved = await client.request('POST', '/api/driver/confirmations', validSubmission(), { now: NOW });
    const id = saved.body.confirmation.id as string;
    await post(client, `/api/dashboard/confirmations/${id}/corrections`, { receivedBy: 'Avery D.', reason: 'Spelling' });
    const row = async () =>
      (await client.request('GET', '/api/dashboard/deliveries?date=2026-11-14', undefined, { role: 'employee', now: NOW })).body.items.find(
        (i: { orderId: string }) => i.orderId === 'MF-10482',
      );
    await post(client, `/api/dashboard/confirmations/${id}/void`, { reason: 'Wrong order' });
    assert.deepEqual([(await row()).status, (await row()).voidedConfirmationId], ['awaiting', id], 'still listed, tagged and linked to its record');
    await post(client, `/api/dashboard/confirmations/${id}/unvoid`, { reason: 'Mistake' });
    const back = await row();
    assert.deepEqual([back.status, back.confirmation.id, back.voidedConfirmationId], ['confirmed', id, null], 'delivered again');
    const detail = await client.request('GET', `/api/dashboard/confirmations/${id}`, undefined, { role: 'employee' });
    assert.deepEqual(
      detail.body.confirmation.corrections.map((k: { kind: string }) => k.kind),
      ['correction', 'void', 'unvoid'],
      'every change stays in the history, in order',
    );
  });

  it('refuses when the order was confirmed again after the void', async () => {
    const { client, db } = setup();
    const id = await voided(client);
    assert.equal((await client.request('POST', '/api/driver/confirmations', validSubmission(), { now: NOW })).status, 201);
    const res = await post(client, `/api/dashboard/confirmations/${id}/unvoid`, { reason: 'Restore' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'order_reconfirmed');
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations WHERE voided_at IS NULL').get() as { n: number }).n, 1);
  });

  it('is for employees only', async () => {
    const { client } = setup();
    const id = await voided(client);
    assert.equal((await post(client, `/api/dashboard/confirmations/${id}/unvoid`, { reason: 'x' }, { role: 'driver' })).status, 403);
  });
});

describe('end-of-day report (employees)', () => {
  async function day() {
    const ctx = setup();
    await ctx.client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }), { now: new Date('2026-11-14T15:30:00.000Z') });
    await ctx.client.request(
      'POST',
      '/api/driver/confirmations',
      exceptionSubmission({ orderId: 'MF-10483', receivedBy: 'Neighbor #12', outcome: 'left_with_neighbor', outcomeDetail: 'Neighbor at #12' }),
      { now: new Date('2026-11-14T17:05:00.000Z') },
    );
    return ctx;
  }

  it('lists every order scheduled for the day with its result, and the day’s totals', async () => {
    const { client } = await day();
    const res = await client.request('GET', '/api/dashboard/report?date=2026-11-14', undefined, { role: 'employee', now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const r = res.body;
    assert.equal(r.date, '2026-11-14');
    assert.equal(r.isPast, false);
    assert.deepEqual(r.totals, { scheduled: 5, delivered: 1, exceptions: 1, awaiting: 3, cancelled: 1 });
    assert.deepEqual(
      r.rows.map((row: { orderId: string; status: string }) => [row.orderId, row.status]),
      [
        ['MF-10482', 'delivered'],
        ['MF-10483', 'exception'],
        ['MF-10484', 'awaiting'],
        ['FTD-2207731', 'awaiting'],
        ['MF-10485', 'awaiting'],
        ['MF-10490', 'cancelled'],
      ],
    );
    const neighbor = r.rows[1];
    assert.equal(neighbor.receivedBy, 'Neighbor #12');
    assert.equal(neighbor.outcomeDetail, 'Neighbor at #12');
    assert.equal(neighbor.confirmedAt, '2026-11-14T17:05:00.000Z');
    assert.equal(neighbor.source, 'app');
  });

  it('calls unconfirmed orders "missing" once the day is over', async () => {
    const { client } = await day();
    const res = await client.request('GET', '/api/dashboard/report?date=2026-11-13', undefined, { role: 'employee', now: NOW });
    assert.equal(res.body.isPast, true);
    assert.deepEqual(res.body.rows.map((row: { status: string }) => row.status), ['missing', 'missing']);
  });

  it('downloads as a spreadsheet file (CSV) that opens in Excel', async () => {
    const { client } = await day();
    const res = await client.request('GET', '/api/dashboard/report.csv?date=2026-11-14', undefined, { role: 'employee', now: NOW });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Type') ?? '', /^text\/csv/);
    assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="delivery-report-2026-11-14.csv"');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const text = new TextDecoder().decode(res.bytes);
    const lines = text.trim().split('\r\n');
    assert.deepEqual([...res.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'starts with the byte-order mark so Excel reads it as UTF-8');
    assert.equal(lines[0], 'Date,Stop,Zone,Order ID,Recipient,City,Result,Received by,Delivery time,Exception note,Entered from,Corrected,Flagged');
    assert.equal(lines.length, 7);
    assert.match(lines[1]!, /^2026-11-14,1,A,MF-10482,Avery Demo,Lake Ridge,Delivered to recipient,Avery Demo,10:30 AM,,App,No,No$/);
    assert.match(lines[2]!, /Left with neighbor,Neighbor #12,12:05 PM,Neighbor at #12,App/);
  });

  it('neutralises spreadsheet formulas in names and notes', async () => {
    const { client, db } = await day();
    db.sqlite.exec(`UPDATE deliveries SET recipient_name = '=HYPERLINK("http://evil.example","x")' WHERE order_id = 'MF-10484'`);
    const res = await client.request('GET', '/api/dashboard/report.csv?date=2026-11-14', undefined, { role: 'employee', now: NOW });
    const text = new TextDecoder().decode(res.bytes);
    assert.ok(text.includes(`"'=HYPERLINK(""http://evil.example"",""x"")"`), 'a leading = is escaped and the quotes are doubled');
    assert.ok(!/(^|,)=HYPERLINK/m.test(text));
  });

  it('is for employees only and validates the date', async () => {
    const { client } = await day();
    assert.equal((await client.request('GET', '/api/dashboard/report', undefined, { role: 'driver' })).status, 403);
    assert.equal((await client.request('GET', '/api/dashboard/report.csv', undefined, { role: 'driver' })).status, 403);
    assert.equal((await client.request('GET', '/api/dashboard/report?date=2026-02-30', undefined, { role: 'employee' })).status, 422);
    assert.equal((await client.request('GET', '/api/dashboard/report', undefined, { role: 'employee', now: NOW })).body.date, '2026-11-14');
  });
});
