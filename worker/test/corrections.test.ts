import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createEnv, exceptionSubmission, jpegDataUrl, makeJpeg, TestClient, validSubmission } from './helpers/app.ts';

/** Saturday 14 November 2026, 3 PM in New York. */
const NOW = new Date('2026-11-14T20:00:00.000Z');

function setup() {
  const { env, db } = createEnv();
  db.sqlite.exec("UPDATE deliveries SET delivery_date = CASE WHEN delivery_date = date('now', '-5 hours') THEN '2026-11-14' ELSE '2026-11-13' END");
  return { env, db, client: new TestClient(env) };
}

async function confirmed(client: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await client.request('POST', '/api/driver/confirmations', validSubmission(overrides), { now: NOW });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.confirmation.id as string;
}

const correct = (client: TestClient, id: string, body: Record<string, unknown>, opts: Record<string, unknown> = {}) =>
  client.request('POST', `/api/dashboard/confirmations/${id}/corrections`, body, { role: 'employee', now: NOW, ...opts });

describe('correcting a confirmation (employees)', () => {
  it('corrects the received-by name with a reason and keeps the original in the history', async () => {
    const { client } = setup();
    const id = await confirmed(client, { receivedBy: 'Avery Dmeo' });
    const res = await correct(client, id, { receivedBy: 'Avery Demo', reason: 'Name was misspelled' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const c = res.body.confirmation;
    assert.equal(c.receivedBy, 'Avery Demo');
    assert.equal(c.corrections.length, 1);
    assert.deepEqual(
      { kind: c.corrections[0].kind, reason: c.corrections[0].reason, by: c.corrections[0].by },
      { kind: 'correction', reason: 'Name was misspelled', by: 'Erin Employee' },
    );
    assert.deepEqual(c.corrections[0].changes, [{ field: 'receivedBy', from: 'Avery Dmeo', to: 'Avery Demo' }]);
    // Lists show the corrected value and mark the record as corrected.
    const list = await client.request('GET', '/api/dashboard/confirmations', undefined, { role: 'employee' });
    assert.equal(list.body.items[0].receivedBy, 'Avery Demo');
    assert.equal(list.body.items[0].corrected, true);
  });

  it('changes a hand-off into an exception (needs an exception note) and the result follows', async () => {
    const { client } = setup();
    const id = await confirmed(client);
    const noNote = await correct(client, id, { outcome: 'left_at_door', reason: 'Customer called: it was left at the door' });
    assert.equal(noNote.status, 422);
    const ok = await correct(client, id, { outcome: 'left_at_door', outcomeDetail: 'On the porch', reason: 'Customer called: it was left at the door' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.confirmation.outcome, 'left_at_door');
    assert.equal(ok.body.confirmation.result, 'needs_review');
    assert.equal(ok.body.confirmation.signatureWidth, 600, 'the signature is never changed or removed');
  });

  it('cannot turn an exception into a hand-off without a signature', async () => {
    const { client } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', exceptionSubmission(), { now: NOW });
    const out = await correct(client, res.body.confirmation.id, { outcome: 'delivered_to_recipient', reason: 'Recipient was home after all' });
    assert.equal(out.status, 422);
    assert.equal(out.body.error.code, 'signature_required');
  });

  it('needs a reason and at least one real change', async () => {
    const { client } = setup();
    const id = await confirmed(client);
    assert.equal((await correct(client, id, { receivedBy: 'Someone' })).status, 422);
    assert.equal((await correct(client, id, { receivedBy: 'Someone', reason: '  ' })).status, 422);
    assert.equal((await correct(client, id, { reason: 'Nothing changed' })).status, 422);
    assert.equal((await correct(client, id, { receivedBy: 'Avery Demo', reason: 'Same as before' })).status, 422);
  });

  it('is for employees only, with the anti-forgery token', async () => {
    const { client } = setup();
    const id = await confirmed(client);
    assert.equal((await correct(client, id, { receivedBy: 'X', reason: 'r' }, { role: 'driver' })).status, 403);
    assert.equal((await correct(client, id, { receivedBy: 'X', reason: 'r' }, { csrf: null })).status, 403);
    assert.equal((await correct(client, randomUUID(), { receivedBy: 'X', reason: 'r' })).status, 404);
  });
});

describe('voiding a confirmation (employees)', () => {
  it('voids with a reason; the order goes back to awaiting and can be confirmed again', async () => {
    const { client } = setup();
    const id = await confirmed(client);
    const noReason = await client.request('POST', `/api/dashboard/confirmations/${id}/void`, { reason: '' }, { role: 'employee', now: NOW });
    assert.equal(noReason.status, 422);
    const res = await client.request('POST', `/api/dashboard/confirmations/${id}/void`, { reason: 'Saved against the wrong order' }, { role: 'employee', now: NOW });
    assert.equal(res.status, 200);
    assert.deepEqual(
      { reason: res.body.confirmation.voided.reason, by: res.body.confirmation.voided.by },
      { reason: 'Saved against the wrong order', by: 'Erin Employee' },
    );
    // Back to awaiting for the driver, and confirmable again.
    const awaiting = await client.request('GET', '/api/driver/deliveries', undefined, { now: NOW });
    assert.ok(awaiting.body.items.some((i: { orderId: string }) => i.orderId === 'MF-10482'));
    assert.equal((await client.request('GET', '/api/driver/deliveries/MF-10482')).body.status, 'ready');
    const again = await client.request('POST', '/api/driver/confirmations', validSubmission(), { now: NOW });
    assert.equal(again.status, 201);
    // The voided record is still there to see, marked voided, and no longer counted.
    const list = await client.request('GET', '/api/dashboard/confirmations?orderId=MF-10482', undefined, { role: 'employee' });
    assert.equal(list.body.total, 2);
    assert.deepEqual(list.body.items.map((i: { voided: boolean }) => i.voided).sort(), [false, true]);
    const summary = await client.request('GET', '/api/dashboard/summary?date=2026-11-14', undefined, { role: 'employee', now: NOW });
    assert.equal(summary.body.confirmed, 1);
    const order = await client.request('GET', '/api/dashboard/orders/MF-10482', undefined, { role: 'employee' });
    assert.equal(order.body.voidedConfirmations.length, 1);
  });

  it('cannot correct or void a voided record again', async () => {
    const { client } = setup();
    const id = await confirmed(client);
    await client.request('POST', `/api/dashboard/confirmations/${id}/void`, { reason: 'Wrong order' }, { role: 'employee', now: NOW });
    assert.equal((await correct(client, id, { receivedBy: 'X', reason: 'r' })).status, 409);
    assert.equal((await client.request('POST', `/api/dashboard/confirmations/${id}/void`, { reason: 'again' }, { role: 'employee' })).status, 409);
  });
});

describe('offline copy of today’s deliveries (drivers)', () => {
  it('gives a driver the full details of today’s awaiting orders to keep on the phone', async () => {
    const { client } = setup();
    await confirmed(client);
    const res = await client.request('GET', '/api/driver/offline', undefined, { now: NOW });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.body.date, '2026-11-14');
    assert.deepEqual(res.body.items.map((i: { orderId: string }) => i.orderId), ['MF-10483', 'MF-10484', 'FTD-2207731', 'MF-10485']);
    assert.equal(res.body.items[0].addressLine, '2200 Placeholder Ct');
    assert.equal((await client.request('GET', '/api/driver/offline', undefined, { role: 'employee' })).status, 403);
  });
});
