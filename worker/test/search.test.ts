import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv, TestClient, validSubmission } from './helpers/app.ts';

const ids = (body: { items: Array<{ orderId: string }> }) => body.items.map((i) => i.orderId).sort();
const RANGE = 'from=2000-01-01&to=2000-12-31';

function setup() {
  const { env, db } = createEnv();
  return { db, client: new TestClient(env) };
}
const find = (client: TestClient, query: string) => client.request('GET', `/api/dashboard/deliveries?${query}`, undefined, { role: 'employee' });

describe('search by order ID, name or address (employees)', () => {
  it('finds orders by street, city or ZIP code as well as by ID and name', async () => {
    const { client } = setup();
    assert.deepEqual(ids((await find(client, 'q=Sample%20Way')).body), ['MF-10482'], 'street');
    assert.deepEqual(ids((await find(client, 'q=lorton')).body), ['FTD-2207731'], 'city');
    assert.ok(ids((await find(client, 'q=22191')).body).includes('MF-10483'), 'ZIP');
    assert.deepEqual(ids((await find(client, 'q=avery')).body), ['MF-10482'], 'name');
    assert.deepEqual(ids((await find(client, 'q=10484')).body), ['MF-10484'], 'part of the ID');
    const row = (await find(client, 'q=Sample%20Way')).body.items[0];
    assert.deepEqual([row.addressLine, row.postalCode], ['100 Sample Way', '22192'], 'results carry the address');
  });

  it('the chosen field comes first, then the other matches', async () => {
    const { client } = setup();
    const order = async (query: string) => (await find(client, query)).body.items.map((i: { orderId: string }) => i.orderId);
    // "sample" is in MF-10482's street (100 Sample Way) and in FTD-2207731's name (Casey Sample).
    assert.deepEqual(await order('q=sample&in=address'), ['MF-10482', 'FTD-2207731'], 'address match first');
    assert.deepEqual(await order('q=sample&in=name'), ['FTD-2207731', 'MF-10482'], 'name match first');
    assert.deepEqual((await order('q=sample&in=order')).sort(), ['FTD-2207731', 'MF-10482'], 'order ID first: nothing lost');
    assert.equal((await find(client, 'q=x&in=everything')).status, 422);
  });

  it('filters by zone, by voided status, and sorts oldest first', async () => {
    const { client, db } = setup();
    db.sqlite.exec("UPDATE deliveries SET delivery_date = '2000-06-01', zone = 'A'");
    db.sqlite.exec("UPDATE deliveries SET zone = 'B', delivery_date = '2000-06-03' WHERE order_id = 'MF-10483'");
    assert.deepEqual(ids((await find(client, `${RANGE}&zone=b`)).body), ['MF-10483']);
    const sorted = (await find(client, `${RANGE}&sort=oldest`)).body.items.map((i: { deliveryDate: string }) => i.deliveryDate);
    assert.deepEqual(sorted, [...sorted].sort(), 'oldest first');
    assert.equal(sorted.at(-1), '2000-06-03');
    db.sqlite.exec("UPDATE deliveries SET delivery_date = date('now', '-5 hours')");
    const saved = await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }));
    await client.request('POST', `/api/dashboard/confirmations/${saved.body.confirmation.id}/void`, { reason: 'Wrong order' }, { role: 'employee' });
    assert.deepEqual(ids((await find(client, 'status=voided')).body), ['MF-10482']);
    assert.equal((await find(client, 'zone=%27%3B')).status, 422);
  });
});

describe('searching confirmations (drivers see only their own)', () => {
  it('matches order ID, name or address, and never another driver’s', async () => {
    const { client } = setup();
    await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10482' }));
    const mine = await client.request('GET', '/api/dashboard/confirmations?q=sample%20way', undefined, { role: 'driver' });
    assert.deepEqual([mine.body.total, mine.body.items[0]?.orderId], [1, 'MF-10482']);
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?q=avery&in=name', undefined, { role: 'driver' })).body.total, 1);
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?q=avery&in=order', undefined, { role: 'driver' })).body.total, 1, 'still found, the field only sets the order');
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?q=sample', undefined, { role: 'driver2' })).body.total, 0, 'another driver');
    assert.equal((await client.request('GET', '/api/dashboard/confirmations?q=sample', undefined, { role: 'employee' })).body.total, 1, 'employees see all');
  });
});
