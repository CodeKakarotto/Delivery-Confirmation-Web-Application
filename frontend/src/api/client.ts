import type { ApiErrorBody } from '../../../shared/types.ts';
import { announceDataChanged } from '../lib/useApi.ts';

export class ApiRequestError extends Error {
  status: number;
  code: string;
  details: unknown;
  requestId: string | null;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId ?? null;
  }
}

type Method = 'GET' | 'POST';

/** Anti-forgery token of the current session, sent with every change (see lib/auth.tsx). */
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Called when the server says the session is gone (401), so the app can show the sign-in page. */
let onSignedOut: (() => void) | null = null;
export function onSessionEnded(handler: (() => void) | null): void {
  onSignedOut = handler;
}

/**
 * Same-origin JSON API call. The session cookie is HttpOnly (scripts cannot read it); no tokens or customer data are
 * stored in browser storage, and nothing is sent to analytics or error-reporting services.
 */
export async function api<T>(method: Method, path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch {
    throw new ApiRequestError(
      0,
      'network_error',
      navigator.onLine
        ? 'Could not reach the server. Check your connection and try again.'
        : 'You are offline. Reconnect to the internet and try again.',
    );
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    if (res.status === 401 && !path.startsWith('/api/auth/')) onSignedOut?.();
    throw new ApiRequestError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `The server returned an error (${res.status}). Try again.`,
      err?.details,
      err?.requestId,
    );
  }
  // A saved change (confirmation, correction, void…): every live list and calendar refreshes now.
  if (method !== 'GET' && !path.startsWith('/api/auth/')) announceDataChanged();
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Try again.';
}

/** Field-level validation issues returned with code `validation_failed` / `invalid_signature`. */
export function fieldIssues(err: unknown): Record<string, string> {
  if (!(err instanceof ApiRequestError) || err.status !== 422) return {};
  const issues = (err.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues ?? [];
  const out: Record<string, string> = {};
  for (const i of issues) if (!out[i.path]) out[i.path] = i.message;
  return out;
}
