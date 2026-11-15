import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { captureLogs, createEnv, TEST_USERS, TestClient, validSubmission } from './helpers/app.ts';

const NOW = new Date('2026-11-14T20:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

function setup() {
  const { env, db } = createEnv();
  return { env, db, client: new TestClient(env) };
}

/** A login request with nothing else attached. */
function login(client: TestClient, username: string, password: string, now = NOW) {
  return client.request('POST', '/api/auth/login', { username, password }, { role: null, now });
}

/** Calls an endpoint with exactly this cookie (no automatic sign-in). */
function withCookie(client: TestClient, method: string, path: string, cookie: string, now = NOW, csrf?: string) {
  const headers: Record<string, string> = { Cookie: cookie };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return client.request(method, path, method === 'POST' ? {} : undefined, { role: null, now, headers });
}

describe('sign in', () => {
  it('signs in with the right username and password and sets a protected session cookie', async () => {
    const { client } = setup();
    const res = await login(client, 'driver1', TEST_USERS.driver1.password);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, { username: 'driver1', displayName: 'Dana Driver', role: 'driver' });
    assert.match(res.body.csrfToken, /^[A-Za-z0-9_-]{32,}$/);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    assert.match(cookie, /^mf_session=[A-Za-z0-9_-]{40,};/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=43200/);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.ok(!JSON.stringify(res.body).includes('password'), 'no password data in the response');
  });

  it('accepts the username in any letter case', async () => {
    const { client } = setup();
    assert.equal((await login(client, 'DRIVER1', TEST_USERS.driver1.password)).status, 200);
  });

  it('marks the cookie Secure and uses the __Host- prefix over HTTPS', async () => {
    const { env } = createEnv({ DEV_EXTRA_HOSTS: 'confirm.test' });
    const client = new TestClient(env, 'https://confirm.test');
    const res = await client.request('POST', '/api/auth/login', { username: 'driver1', password: TEST_USERS.driver1.password }, {
      role: null,
      origin: 'https://confirm.test',
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Set-Cookie') ?? '', /^__Host-mf_session=.*; Secure/);
  });

  it('gives the same answer for a wrong password and an unknown username', async () => {
    const { client } = setup();
    const wrong = await login(client, 'driver1', 'not-the-password');
    const unknown = await login(client, 'nobody', 'whatever-password');
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.code, 'invalid_credentials');
    assert.equal(unknown.body.error.code, 'invalid_credentials');
    assert.equal(wrong.body.error.message, unknown.body.error.message);
    assert.equal(wrong.headers.get('Set-Cookie'), null);
  });

  it('rejects malformed sign-in requests', async () => {
    const { client } = setup();
    assert.equal((await client.request('POST', '/api/auth/login', { username: 'driver1' }, { role: null })).status, 422);
    assert.equal((await client.request('POST', '/api/auth/login', { username: 'driver1', password: 'x'.repeat(300) }, { role: null })).status, 422);
    assert.equal((await client.request('POST', '/api/auth/login', { username: 'driver1', password: 'p', extra: 1 }, { role: null })).status, 422);
    const crossSite = await client.request('POST', '/api/auth/login', { username: 'driver1', password: TEST_USERS.driver1.password }, {
      role: null,
      origin: 'https://evil.example',
    });
    assert.equal(crossSite.status, 403);
  });

  it('locks an account for 15 minutes after 5 wrong passwords, even for the right password', async () => {
    const { client } = setup();
    for (let i = 0; i < 5; i++) assert.equal((await login(client, 'driver1', `wrong-${i}`, minutes(i))).status, 401);
    const locked = await login(client, 'driver1', TEST_USERS.driver1.password, minutes(5));
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'too_many_attempts');
    // Another account is not affected.
    assert.equal((await login(client, 'driver2', TEST_USERS.driver2.password, minutes(5))).status, 200);
    // After the lock ends the right password works, and the failure count starts over.
    assert.equal((await login(client, 'driver1', TEST_USERS.driver1.password, minutes(21))).status, 200);
  });

  it('limits sign-in attempts from one device across many usernames', async () => {
    const { client } = setup();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await login(client, `guess${i}`, 'password-guess', minutes(0))).status;
    assert.equal(last, 429);
  });

  it('refuses deactivated accounts with the generic message', async () => {
    const { client, db } = setup();
    db.sqlite.exec("UPDATE users SET active = 0 WHERE username = 'driver2'");
    const res = await login(client, 'driver2', TEST_USERS.driver2.password);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'invalid_credentials');
  });

  it('stores only salted PBKDF2 hashes, never the password', async () => {
    const { db } = setup();
    const rows = db.sqlite.prepare('SELECT password_hash FROM users').all() as Array<{ password_hash: string }>;
    for (const r of rows) {
      assert.match(r.password_hash, /^pbkdf2-sha256\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
      for (const u of Object.values(TEST_USERS)) assert.ok(!r.password_hash.includes(u.password));
    }
  });

  it('never logs passwords or session tokens', async () => {
    const { client } = setup();
    let cookie = '';
    const logs = await captureLogs(async () => {
      await login(client, 'driver1', 'wrong-secret-password');
      const ok = await login(client, 'driver1', TEST_USERS.driver1.password);
      cookie = (ok.headers.get('Set-Cookie') ?? '').split(';')[0]!.split('=')[1]!;
    });
    assert.ok(!logs.includes('wrong-secret-password'));
    assert.ok(!logs.includes(TEST_USERS.driver1.password));
    assert.ok(!logs.includes(cookie));
  });
});

describe('sessions', () => {
  it('tells the app who is signed in', async () => {
    const { client } = setup();
    const res = await login(client, 'employee1', TEST_USERS.employee1.password);
    const cookie = (res.headers.get('Set-Cookie') ?? '').split(';')[0]!;
    const me = await withCookie(client, 'GET', '/api/auth/me', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'employee');
    assert.equal(me.body.csrfToken, res.body.csrfToken);
  });

  it('answers 401 without a session or with a made-up one', async () => {
    const { client } = setup();
    assert.equal((await client.request('GET', '/api/auth/me', undefined, { role: null })).status, 401);
    assert.equal((await withCookie(client, 'GET', '/api/auth/me', 'mf_session=forged-token-value-forged-token-value-1234')).status, 401);
  });

  it('ends a session after 2 hours without activity, and after 12 hours in any case', async () => {
    const { client } = setup();
    const res = await login(client, 'driver1', TEST_USERS.driver1.password);
    const cookie = (res.headers.get('Set-Cookie') ?? '').split(';')[0]!;
    assert.equal((await withCookie(client, 'GET', '/api/auth/me', cookie, minutes(110))).status, 200);
    assert.equal((await withCookie(client, 'GET', '/api/auth/me', cookie, minutes(110 + 121))).status, 401, 'idle for over 2 hours');

    const again = await login(client, 'driver1', TEST_USERS.driver1.password);
    const c2 = (again.headers.get('Set-Cookie') ?? '').split(';')[0]!;
    for (let m = 100; m < 12 * 60; m += 100) assert.equal((await withCookie(client, 'GET', '/api/auth/me', c2, minutes(m))).status, 200);
    assert.equal((await withCookie(client, 'GET', '/api/auth/me', c2, minutes(12 * 60 + 1))).status, 401, 'older than 12 hours');
  });

  it('signs out on the server: the old cookie stops working', async () => {
    const { client } = setup();
    const res = await login(client, 'driver1', TEST_USERS.driver1.password);
    const cookie = (res.headers.get('Set-Cookie') ?? '').split(';')[0]!;
    const out = await withCookie(client, 'POST', '/api/auth/logout', cookie, NOW, res.body.csrfToken);
    assert.equal(out.status, 200);
    assert.match(out.headers.get('Set-Cookie') ?? '', /Max-Age=0/);
    assert.equal((await withCookie(client, 'GET', '/api/auth/me', cookie)).status, 401);
  });

  it('requires the session’s anti-forgery token on every change', async () => {
    const { client, db } = setup();
    const missing = await client.request('POST', '/api/driver/confirmations', validSubmission(), { csrf: null });
    assert.equal(missing.status, 403);
    assert.equal(missing.body.error.code, 'csrf_failed');
    const wrong = await client.request('POST', '/api/driver/confirmations', validSubmission(), { csrf: 'x'.repeat(43) });
    assert.equal(wrong.status, 403);
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n, 0);
  });

  it('gives each sign-in a new session', async () => {
    const { client } = setup();
    const a = await login(client, 'driver1', TEST_USERS.driver1.password);
    const b = await login(client, 'driver1', TEST_USERS.driver1.password);
    assert.notEqual(a.headers.get('Set-Cookie'), b.headers.get('Set-Cookie'));
    assert.notEqual(a.body.csrfToken, b.body.csrfToken);
  });

  it('ignores the old prototype role header', async () => {
    const { client } = setup();
    const res = await client.request('GET', '/api/dashboard/calendar', undefined, { role: null, headers: { 'X-Demo-Role': 'shop' } });
    assert.equal(res.status, 401);
  });
});
