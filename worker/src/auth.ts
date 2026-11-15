/**
 * Sign-in: password hashing, sessions and role checks.
 *
 * - Passwords: PBKDF2-SHA256, 100,000 iterations (the Workers runtime maximum), 16-byte random salt per account,
 *   compared in constant time. Plain passwords are never stored or logged.
 * - Sessions: a random 256-bit token in an HttpOnly, SameSite=Strict cookie (Secure and __Host- prefixed over HTTPS).
 *   Only its SHA-256 is stored. Sessions end after 2 hours idle, 12 hours in total, on sign-out, or when the account is
 *   deactivated.
 * - Changes (POST) also need the session's anti-forgery token in X-CSRF-Token, on top of the Origin check.
 * - Sign-in attempts are limited per device (IP) and per username; every failure gives the same message.
 */

import type { UserRole } from '../../shared/types.ts';
import { ApiError } from './http.ts';
import type { RequestContext } from './router.ts';

export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_IDLE_MS = 2 * 60 * 60_000;
export const SESSION_MAX_MS = 12 * 60 * 60_000;
const COOKIE = 'mf_session';
const SECURE_COOKIE = '__Host-mf_session';

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  csrfToken: string;
  sessionId: string;
}

// ---------- encoding helpers ----------

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// ---------- passwords ----------

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  const iterations = Number(iter);
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS || !salt || !hash) {
    return false;
  }
  const actual = toBase64(await pbkdf2(password, fromBase64(salt), iterations));
  return timingSafeEqual(actual, hash);
}

/** Verified when the username does not exist, so a wrong username takes as long as a wrong password. */
export const DUMMY_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// ---------- cookies ----------

function isHttps(ctx: RequestContext): boolean {
  return ctx.url.protocol === 'https:';
}

export function sessionCookie(ctx: RequestContext, token: string): string {
  const secure = isHttps(ctx);
  return `${secure ? SECURE_COOKIE : COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_MS / 1000}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(ctx: RequestContext): string {
  const secure = isHttps(ctx);
  return `${secure ? SECURE_COOKIE : COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

function readSessionToken(request: Request): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if ((name === COOKIE || name === SECURE_COOKIE) && /^[A-Za-z0-9_-]{40,64}$/.test(value)) return value;
  }
  return null;
}

// ---------- sessions ----------

export async function createSession(ctx: RequestContext, userId: number): Promise<{ token: string; csrfToken: string }> {
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const now = ctx.now.toISOString();
  const expires = new Date(ctx.now.getTime() + SESSION_MAX_MS).toISOString();
  await ctx.db.batch([
    // Housekeeping: this account's ended sessions.
    ctx.db.prepare('DELETE FROM sessions WHERE user_id = ? AND (expires_at <= ? OR last_seen_at <= ?)').bind(
      userId,
      now,
      new Date(ctx.now.getTime() - SESSION_IDLE_MS).toISOString(),
    ),
    ctx.db
      .prepare('INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, csrfToken, now, now, expires),
    ctx.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, userId),
  ]);
  return { token, csrfToken };
}

const UNAUTHENTICATED = () => new ApiError(401, 'unauthenticated', 'Please sign in.');

interface SessionRow {
  session_id: string;
  csrf_token: string;
  last_seen_at: string;
  expires_at: string;
  user_id: number;
  username: string;
  display_name: string;
  role: UserRole;
  active: number;
}

/**
 * The signed-in account, or 401. For changes (anything but GET/HEAD) the session's anti-forgery token must also be
 * sent in X-CSRF-Token, or 403.
 */
export async function requireUser(ctx: RequestContext): Promise<SessionUser> {
  if (ctx.user) return ctx.user;
  const token = readSessionToken(ctx.request);
  if (!token) throw UNAUTHENTICATED();
  const id = await sha256Hex(token);
  const row = await ctx.db
    .prepare(
      `SELECT s.id AS session_id, s.csrf_token, s.last_seen_at, s.expires_at,
              u.id AS user_id, u.username, u.display_name, u.role, u.active
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .bind(id)
    .first<SessionRow>();
  const nowMs = ctx.now.getTime();
  if (!row || row.active !== 1 || Date.parse(row.expires_at) <= nowMs || nowMs - Date.parse(row.last_seen_at) > SESSION_IDLE_MS) {
    if (row) await ctx.db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    ctx.responseHeaders.append('Set-Cookie', clearSessionCookie(ctx));
    throw UNAUTHENTICATED();
  }
  // Keep the session alive (at most once a minute; the time only moves forward).
  if (nowMs - Date.parse(row.last_seen_at) > 60_000) {
    await ctx.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?').bind(ctx.now.toISOString(), id, ctx.now.toISOString()).run();
  }
  if (!['GET', 'HEAD'].includes(ctx.request.method)) {
    const sent = ctx.request.headers.get('X-CSRF-Token') ?? '';
    if (!timingSafeEqual(sent, row.csrf_token)) {
      throw new ApiError(403, 'csrf_failed', 'This request could not be verified. Reload the page and try again.');
    }
  }
  ctx.user = {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    csrfToken: row.csrf_token,
    sessionId: row.session_id,
  };
  return ctx.user;
}

/** The signed-in account, which must have this role (403 otherwise). */
export async function requireRole(ctx: RequestContext, role: UserRole): Promise<SessionUser> {
  const user = await requireUser(ctx);
  if (user.role !== role) {
    throw new ApiError(403, 'role_required', role === 'driver' ? 'This part of the app is for drivers.' : 'This part of the app is for shop employees.');
  }
  return user;
}
