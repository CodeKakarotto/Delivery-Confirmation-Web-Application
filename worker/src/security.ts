/**
 * Request guards for a prototype WITHOUT a login (a project requirement).
 *
 * Because nobody signs in, the server cannot tell a driver from an employee from a stranger. These guards do not
 * pretend otherwise. They:
 *  1. keep all customer data inside a controlled local demonstration (requireDemoAccess), failing closed anywhere
 *     else until the sponsor approves a real access model (docs/SECURITY.md);
 *  2. stop other websites from submitting confirmations through a visitor's browser (checkOrigin);
 *  3. slow down automated guessing and flooding (rateLimit).
 */

import { ApiError } from './http.ts';
import type { RequestContext } from './router.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Customer data is served only when APP_ENV=development AND the request is addressed to localhost (or a host the
 * developer listed in DEV_EXTRA_HOSTS). Everything else answers 503: there is no approved way to restrict who can
 * read proof-of-delivery records without a login.
 */
export function requireDemoAccess(ctx: RequestContext): void {
  const host = ctx.url.hostname.toLowerCase();
  if (ctx.settings.isProduction || !ctx.settings.demoHosts.has(host)) {
    throw new ApiError(
      503,
      'access_model_required',
      'Delivery data is only available in the local demonstration. This prototype has no login, so it cannot be ' +
        'used with real customer data until the shop approves an access model.',
    );
  }
}

/**
 * Cross-site request forgery protection for state-changing requests. There is no session cookie to steal, but a
 * hostile page could still make a visitor's browser submit fake confirmations. Requires an Origin header that
 * matches this site (or ALLOWED_ORIGINS) and refuses requests the browser labels cross-site. Together with the
 * JSON-only bodies (which force a CORS preflight that this API never grants) this blocks forged submissions.
 */
export function checkOrigin(ctx: RequestContext): void {
  if (SAFE_METHODS.has(ctx.request.method)) return;
  const fetchSite = ctx.request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new ApiError(403, 'bad_origin', 'This request came from another website and was refused.');
  }
  const origin = ctx.request.headers.get('Origin');
  const allowed = new Set([ctx.url.origin, ...ctx.settings.allowedOrigins]);
  if (!origin || !allowed.has(origin.replace(/\/+$/, ''))) {
    throw new ApiError(403, 'bad_origin', 'This request came from another website and was refused.');
  }
}

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  lookup: { scope: 'lookup', limit: 60, windowSeconds: 60 },
  submit: { scope: 'submit', limit: 20, windowSeconds: 60 },
  dashboard: { scope: 'dashboard', limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fixed-window counter per client, stored in D1. The client is identified by an HMAC of its IP address (the raw IP is
 * never stored). Fails closed: if the counter cannot be written, the request is refused by the error handler.
 */
export async function rateLimit(ctx: RequestContext, rule: RateLimitRule): Promise<void> {
  const ip = ctx.request.headers.get('CF-Connecting-IP') ?? 'local';
  const secret = ctx.settings.appSecret ?? 'development-only-rate-limit-key';
  const bucket = `${rule.scope}:${(await hmacHex(secret, ip)).slice(0, 32)}`;
  const nowSec = Math.floor(ctx.now.getTime() / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);
  const [, counted] = await ctx.db.batch<{ hits: number }>([
    // Housekeeping: forget windows older than an hour.
    ctx.db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart - 3600),
    ctx.db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
         ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + 1
         RETURNING hits`,
      )
      .bind(bucket, windowStart),
  ]);
  const hits = counted?.results[0]?.hits ?? Number.POSITIVE_INFINITY;
  if (hits > rule.limit) {
    const retryAfter = String(windowStart + rule.windowSeconds - nowSec);
    throw new ApiError(429, 'rate_limited', 'Too many requests. Wait a minute and try again.', undefined, { 'Retry-After': retryAfter });
  }
}
