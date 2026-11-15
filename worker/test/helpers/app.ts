/**
 * Test harness: a fresh in-memory D1 (real migrations + synthetic demo seed) and a client that calls the Worker's
 * fetch handler directly with real Request/Response objects.
 */

import { readdirSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../../src/env.ts';
import { handleRequest } from '../../src/app.ts';
import { SqliteD1 } from './d1.ts';

const ROOT = new URL('../../../', import.meta.url);

export const MIGRATIONS = readdirSync(new URL('migrations/', ROOT))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

/** The local demonstration origin (Vite dev server). */
export const ORIGIN = 'http://localhost:5173';
export const BASE = 'http://localhost:5173';

/** Test accounts (test passwords only; real accounts are created with scripts/create-user.ts). */
export const TEST_USERS = {
  driver1: { username: 'driver1', password: 'Test-Driver-One-2026!', role: 'driver', name: 'Dana Driver' },
  driver2: { username: 'driver2', password: 'Test-Driver-Two-2026!', role: 'driver', name: 'Devon Driver' },
  employee1: { username: 'employee1', password: 'Test-Employee-One-2026!', role: 'employee', name: 'Erin Employee' },
} as const;
export type TestUserKey = keyof typeof TEST_USERS;

/** Same format the Worker stores; low iteration count only to keep the test suite fast. */
export function testPasswordHash(password: string, iterations = 1000): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return ['pbkdf2-sha256', iterations, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function createEnv(overrides: Partial<Env> = {}, opts: { seed?: boolean } = {}): { env: Env; db: SqliteD1 } {
  const db = new SqliteD1();
  for (const file of MIGRATIONS) db.execFile(new URL(`migrations/${file}`, ROOT));
  if (opts.seed !== false) db.execFile(new URL('seed/demo-seed.sql', ROOT));
  const insertUser = db.sqlite.prepare(
    `INSERT INTO users (username, display_name, role, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`,
  );
  for (const u of Object.values(TEST_USERS)) insertUser.run(u.username, u.name, u.role, testPasswordHash(u.password));
  const env: Env = {
    DB: db,
    APP_ENV: 'development',
    APP_SECRET: 'test-secret-0123456789abcdef-0123456789',
    ALLOWED_ORIGINS: '',
    ...overrides,
  };
  return { env, db };
}

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
  bytes: Uint8Array;
}

/** Which test account a role name in a test means. 'shop' is the employee (older tests' name for it). */
const ROLE_ACCOUNT: Record<string, TestUserKey> = { driver: 'driver1', driver1: 'driver1', driver2: 'driver2', shop: 'employee1', employee: 'employee1', employee1: 'employee1' };

export class TestClient {
  env: Env;
  base: string;
  ip = '203.0.113.10';
  /** Signed-in sessions per test account: the cookie and the CSRF token. */
  sessions = new Map<TestUserKey, { cookie: string; csrf: string }>();

  /** Signs in through the real login endpoint. */
  async login(key: TestUserKey, now?: Date): Promise<ApiResult> {
    const u = TEST_USERS[key];
    const res = await this.request('POST', '/api/auth/login', { username: u.username, password: u.password }, { role: null, now });
    if (res.status === 200) {
      const cookie = (res.headers.get('Set-Cookie') ?? '').split(';')[0]!;
      this.sessions.set(key, { cookie, csrf: res.body.csrfToken });
    }
    return res;
  }

  constructor(env: Env, base = BASE) {
    this.env = env;
    this.base = base;
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
    opts: { origin?: string | null; contentType?: string; now?: Date; headers?: Record<string, string>; role?: string | null; csrf?: string | null } = {},
    retried = false,
  ): Promise<ApiResult<T>> {
    const headers = new Headers(opts.headers ?? {});
    headers.set('CF-Connecting-IP', this.ip);
    // By default, sign in as the account each part of the API is meant for: drivers for /api/driver, the employee for
    // /api/dashboard. `role: null` sends no session; any other name picks that account.
    const role = opts.role === undefined ? (path.startsWith('/api/driver') ? 'driver' : path.startsWith('/api/dashboard') ? 'shop' : null) : opts.role;
    const account = role ? ROLE_ACCOUNT[role] : undefined;
    if (account) {
      if (!this.sessions.has(account)) {
        const login = await this.login(account, opts.now);
        if (login.status !== 200) throw new Error(`Test login failed: ${login.status} ${JSON.stringify(login.body)}`);
      }
      const session = this.sessions.get(account)!;
      headers.append('Cookie', session.cookie);
      const csrf = opts.csrf === undefined ? session.csrf : opts.csrf;
      if (csrf && method !== 'GET') headers.set('X-CSRF-Token', csrf);
    }
    const origin = opts.origin === undefined ? new URL(this.base).origin : opts.origin;
    if (origin && method !== 'GET') headers.set('Origin', origin);
    let payload: string | undefined;
    if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      headers.set('Content-Type', opts.contentType ?? 'application/json');
    }
    const res = await handleRequest(new Request(`${this.base}${path}`, { method, headers, body: payload }), this.env, opts.now);
    if (res.status === 401 && account && !retried) {
      // A test moved the clock past the session's lifetime: sign in again at that time and retry once.
      this.sessions.delete(account);
      return this.request<T>(method, path, body, opts, true);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = res.headers.get('Content-Type') ?? '';
    const text = type.startsWith('application/json') ? new TextDecoder().decode(bytes) : '';
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers, bytes };
  }
}

// ---------- PNG fixtures ----------

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput) >>> 0);
  return out;
}

/** A real, decodable RGBA PNG with a diagonal "stroke", plus optional extra chunks (for negative tests). */
export function makePng(
  width = 600,
  height = 200,
  opts: { extraChunks?: Array<{ type: string; data: Uint8Array }>; colorType?: number; bitDepth?: number } = {},
): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = opts.bitDepth ?? 8;
  ihdr[9] = opts.colorType ?? 6;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4;
      const ink = Math.abs(x / width - y / height) < 0.02;
      raw[i] = ink ? 20 : 255;
      raw[i + 1] = ink ? 20 : 255;
      raw[i + 2] = ink ? 40 : 255;
      raw[i + 3] = 255;
    }
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(opts.extraChunks ?? []).map((c) => chunk(c.type, c.data)),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function pngDataUrl(bytes: Uint8Array = makePng()): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** A complete, valid submission for one of the seeded orders. */
export function validSubmission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId: 'MF-10482',
    receivedBy: 'Avery Demo',
    outcome: 'delivered_to_recipient',
    signaturePng: pngDataUrl(),
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/** Captures everything written to console.log/warn/error while `fn` runs. */
export async function captureLogs(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.log = grab;
  console.warn = grab;
  console.error = grab;
  try {
    await fn();
  } finally {
    Object.assign(console, orig);
  }
  return lines.join('\n');
}
