/**
 * Michael's Flowers delivery confirmation API: router and request handling.
 * All endpoints live under /api and return JSON (the signature endpoint returns a PNG). See docs/API.md.
 */

import type { AppConfig } from '../../shared/types.ts';
import { loadSettings, type Env } from './env.ts';
import * as dashboard from './handlers/dashboard.ts';
import * as driver from './handlers/driver.ts';
import { ApiError, errorResponse, json, logEvent } from './http.ts';
import { Router, type RequestContext } from './router.ts';
import { checkOrigin } from './security.ts';

export const router = new Router()
  .add('GET', '/api/health', async () => json({ ok: true }))
  .add('GET', '/api/config', async (ctx) => {
    const body: AppConfig & { dataAvailable: boolean } = {
      appEnv: ctx.settings.appEnv,
      authenticated: false,
      dataAvailable: !ctx.settings.isProduction && ctx.settings.demoHosts.has(ctx.url.hostname.toLowerCase()),
    };
    return json(body);
  })
  // Driver (no login): one order at a time by its exact ID, and submitting its confirmation. No listing.
  .add('GET', '/api/driver/deliveries/:orderId', driver.lookup)
  .add('POST', '/api/driver/confirmations', driver.submit)
  // Employee dashboard. NOT access-controlled (there is no login): local demonstration only, see docs/SECURITY.md.
  .add('GET', '/api/dashboard/summary', dashboard.summary)
  .add('GET', '/api/dashboard/confirmations', dashboard.list)
  .add('GET', '/api/dashboard/confirmations/:id', dashboard.detail)
  .add('GET', '/api/dashboard/confirmations/:id/signature', dashboard.signature);

export async function handleRequest(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  const url = new URL(request.url);
  const requestId = crypto.randomUUID();

  if (!url.pathname.startsWith('/api/')) {
    return errorResponse(new ApiError(404, 'not_found', 'Not found.'), requestId);
  }
  const match = router.match(request.method, url.pathname);
  if (match.kind === 'not_found') {
    return errorResponse(new ApiError(404, 'not_found', 'No such API endpoint.'), requestId);
  }
  if (match.kind === 'method_not_allowed') {
    // Includes CORS preflights (OPTIONS): this same-origin API never grants cross-origin access.
    return errorResponse(
      new ApiError(405, 'method_not_allowed', 'Method not allowed.', undefined, { Allow: match.allowed.join(', ') }),
      requestId,
    );
  }

  const ctx: RequestContext = {
    request,
    env,
    db: env.DB,
    settings: loadSettings(env),
    url,
    params: match.params,
    requestId,
    now,
    responseHeaders: new Headers(),
  };

  try {
    checkOrigin(ctx);
    const response = await match.handler(ctx);
    ctx.responseHeaders.forEach((value, key) => response.headers.append(key, value));
    return response;
  } catch (err) {
    if (err instanceof ApiError) {
      // access_model_required is the intended fail-closed answer outside the local demonstration, not a fault.
      if (err.status >= 500 && err.code !== 'access_model_required') {
        logEvent('error', 'api_error', { code: err.code, status: err.status, requestId });
      }
      return errorResponse(err, requestId);
    }
    // Unexpected failure: log only the error type (a message could quote customer data from a failed statement)
    // and return a generic message. The request ID lets the developer find the line.
    const type = err instanceof Error ? err.name : 'unknown';
    logEvent('error', 'unhandled_error', { type, path: routeTemplate(url.pathname), requestId });
    return errorResponse(new ApiError(500, 'internal_error', 'Something went wrong on the server. Try again.'), requestId);
  }
}

/** The path with order IDs and record IDs removed, so logs never carry them. */
function routeTemplate(pathname: string): string {
  if (pathname.startsWith('/api/driver/deliveries/')) return '/api/driver/deliveries/:orderId';
  if (/^\/api\/dashboard\/confirmations\/[^/]+/.test(pathname)) return '/api/dashboard/confirmations/:id';
  return pathname;
}
