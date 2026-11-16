/** Sign in, sign out and "who am I". */

import { loginSchema } from '../../../shared/schemas.ts';
import type { AuthResponse, UserRole } from '../../../shared/types.ts';
import { clearSessionCookie, createSession, DUMMY_HASH, requireUser, sessionCookie, sha256Hex, verifyPassword } from '../auth.ts';
import { ApiError, json, logEvent, readJson } from '../http.ts';
import type { RequestContext } from '../router.ts';
import { RATE_LIMITS, rateLimit, requireDemoAccess } from '../security.ts';

const INVALID = () => new ApiError(401, 'invalid_credentials', 'The username or password is incorrect.');

/** Failed sign-ins allowed per username in a 15-minute window before it is locked until the window ends. */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;

async function failureBucket(ctx: RequestContext, username: string): Promise<{ bucket: string; windowStart: number }> {
  const secret = ctx.settings.appSecret ?? 'development-only-rate-limit-key';
  const nowSec = Math.floor(ctx.now.getTime() / 1000);
  return {
    // The username is hashed with the server secret: the database never lists attempted usernames.
    bucket: `login-fail:${(await sha256Hex(`${secret}:${username.toLowerCase()}`)).slice(0, 32)}`,
    windowStart: nowSec - (nowSec % FAILURE_WINDOW_SECONDS),
  };
}

export async function login(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  await rateLimit(ctx, RATE_LIMITS.login); // per device
  const input = await readJson(ctx.request, loginSchema, 2048);

  // Per-username lock: same for existing and unknown usernames, so it reveals nothing.
  const { bucket, windowStart } = await failureBucket(ctx, input.username);
  const failures = await ctx.db
    .prepare('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?')
    .bind(bucket, windowStart)
    .first<number>('hits');
  if ((failures ?? 0) >= MAX_FAILURES) {
    const retryAfter = String(windowStart + FAILURE_WINDOW_SECONDS - Math.floor(ctx.now.getTime() / 1000));
    logEvent('warn', 'login_locked', { requestId: ctx.requestId });
    throw new ApiError(429, 'too_many_attempts', 'Too many sign-in attempts. Wait 15 minutes and try again.', undefined, { 'Retry-After': retryAfter });
  }

  const user = await ctx.db
    .prepare('SELECT id, username, display_name, role, password_hash, active FROM users WHERE username = ?')
    .bind(input.username)
    .first<{ id: number; username: string; display_name: string; role: UserRole; password_hash: string; active: number }>();
  // Always run the password check, so an unknown username takes as long as a wrong password.
  const passwordOk = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || user.active !== 1 || !passwordOk) {
    await ctx.db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
         ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + 1`,
      )
      .bind(bucket, windowStart)
      .run();
    logEvent('warn', 'login_failed', { requestId: ctx.requestId });
    throw INVALID();
  }

  await ctx.db.prepare('DELETE FROM rate_limits WHERE bucket = ?').bind(bucket).run();
  const { token, csrfToken } = await createSession(ctx, user.id);
  logEvent('info', 'login_succeeded', { userId: user.id, requestId: ctx.requestId });
  const body: AuthResponse = { user: { username: user.username, displayName: user.display_name, role: user.role }, csrfToken };
  return json(body, 200, { 'Set-Cookie': sessionCookie(ctx, token) });
}

export async function me(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  const user = await requireUser(ctx);
  const body: AuthResponse = { user: { username: user.username, displayName: user.displayName, role: user.role }, csrfToken: user.csrfToken };
  return json(body);
}

/**
 * Signs out fully: ends EVERY session of this account (all devices and tabs), clears the cookie, and tells the browser
 * to wipe this site's cookies, cache and storage (Clear-Site-Data), so nothing from the session can be restored.
 */
export async function logout(ctx: RequestContext): Promise<Response> {
  requireDemoAccess(ctx);
  const user = await requireUser(ctx);
  await ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  logEvent('info', 'logout', { userId: user.id, requestId: ctx.requestId });
  return json({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookie(ctx),
    'Clear-Site-Data': '"cache", "cookies", "storage"',
  });
}
