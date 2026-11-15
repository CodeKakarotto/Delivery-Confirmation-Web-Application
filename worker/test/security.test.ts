import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEnv, TestClient, validSubmission } from './helpers/app.ts';

const DATA_ENDPOINTS: Array<[string, string]> = [
  ['GET', '/api/driver/deliveries/MF-10482'],
  ['POST', '/api/driver/confirmations'],
  ['GET', '/api/dashboard/confirmations'],
  ['GET', '/api/dashboard/summary'],
  ['GET', '/api/dashboard/calendar'],
  ['GET', '/api/dashboard/orders/MF-10482'],
];

describe('no-login access limits (fail closed)', () => {
  it('refuses every data endpoint outside development, because no access model is approved', async () => {
    for (const appEnv of ['production', 'staging', '', undefined]) {
      const { env } = createEnv({ APP_ENV: appEnv });
      const client = new TestClient(env);
      for (const [method, path] of DATA_ENDPOINTS) {
        const res = await client.request(method, path, method === 'POST' ? validSubmission() : undefined, { role: null });
        assert.equal(res.status, 503, `${appEnv} ${method} ${path}`);
        assert.equal(res.body.error.code, 'access_model_required');
      }
    }
  });

  it('refuses requests addressed to a public host name even in development', async () => {
    const { env } = createEnv();
    const client = new TestClient(env, 'https://confirm.example.com');
    for (const [method, path] of DATA_ENDPOINTS) {
      const res = await client.request(method, path, method === 'POST' ? validSubmission() : undefined, {
        origin: 'https://confirm.example.com',
        role: null,
      });
      assert.equal(res.status, 503, `${method} ${path}`);
    }
  });

  it('allows extra development hosts only when listed (e.g. a phone on the same Wi-Fi)', async () => {
    const { env } = createEnv({ DEV_EXTRA_HOSTS: '192.168.1.20' });
    const ok = new TestClient(env, 'http://192.168.1.20:5173');
    assert.equal((await ok.request('GET', '/api/driver/deliveries/MF-10482')).status, 200);
    const other = new TestClient(env, 'http://192.168.1.21:5173');
    assert.equal((await other.request('GET', '/api/driver/deliveries/MF-10482', undefined, { role: null })).status, 503);
  });

  it('ignores DEV_EXTRA_HOSTS outside development', async () => {
    const { env } = createEnv({ APP_ENV: 'production', DEV_EXTRA_HOSTS: '192.168.1.20' });
    const client = new TestClient(env, 'http://192.168.1.20:5173');
    assert.equal((await client.request('GET', '/api/driver/deliveries/MF-10482', undefined, { role: null })).status, 503);
  });

  it('keeps health and configuration endpoints available and free of customer data', async () => {
    const { env } = createEnv({ APP_ENV: 'production' });
    const client = new TestClient(env);
    assert.equal((await client.request('GET', '/api/health')).status, 200);
    const config = await client.request('GET', '/api/config');
    assert.equal(config.status, 200);
    assert.deepEqual(config.body, { appEnv: 'production', timeZone: 'America/New_York', authenticated: true, dataAvailable: false });
  });
});

describe('cross-site request protection', () => {
  it('refuses a state-changing request from another origin', async () => {
    const { env, db } = createEnv();
    const client = new TestClient(env);
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission(), { origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'bad_origin');
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n, 0);
  });

  it('refuses a state-changing request without an Origin header', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission(), { origin: null });
    assert.equal(res.status, 403);
  });

  it('refuses a request the browser marks as cross-site', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission(), {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    assert.equal(res.status, 403);
  });

  it('only accepts JSON bodies (form posts cannot be forged as JSON without a preflight)', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const res = await client.request('POST', '/api/driver/confirmations', 'orderId=MF-10482', {
      contentType: 'application/x-www-form-urlencoded',
    });
    assert.equal(res.status, 415);
  });

  it('answers CORS preflights without granting access', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const res = await client.request('OPTIONS', '/api/driver/confirmations', undefined, {
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('sends the standard security headers on API responses', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const res = await client.request('GET', '/api/driver/deliveries/MF-10482');
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  });
});

describe('rate limits', () => {
  it('limits order lookups per client', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const now = new Date('2026-11-14T15:00:10.000Z');
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await client.request('GET', '/api/driver/deliveries/MF-10482', undefined, { now })).status;
    assert.equal(last, 429);
    // Another client is unaffected.
    client.ip = '198.51.100.7';
    assert.equal((await client.request('GET', '/api/driver/deliveries/MF-10482', undefined, { now })).status, 200);
  });

  it('counts not-found lookups too, so order IDs cannot be guessed quickly', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const now = new Date('2026-11-14T15:00:10.000Z');
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await client.request('GET', `/api/driver/deliveries/GUESS-${i}`, undefined, { now })).status);
    assert.equal(statuses[0], 404);
    assert.equal(statuses[60], 429);
  });

  it('limits confirmation submissions per client and resets in the next window', async () => {
    const { env } = createEnv();
    const client = new TestClient(env);
    const now = new Date('2026-11-14T15:00:10.000Z');
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-99999' }), { now })).status;
    }
    assert.equal(last, 429);
    const later = new Date('2026-11-14T15:01:10.000Z');
    assert.equal((await client.request('POST', '/api/driver/confirmations', validSubmission(), { now: later })).status, 201);
  });

  it('never stores the client IP address', async () => {
    const { env, db } = createEnv();
    const client = new TestClient(env);
    await client.request('GET', '/api/driver/deliveries/MF-10482');
    const rows = db.sqlite.prepare('SELECT bucket FROM rate_limits').all() as Array<{ bucket: string }>;
    assert.ok(rows.length > 0);
    for (const r of rows) assert.ok(!r.bucket.includes('203.0.113.10'));
  });
});
