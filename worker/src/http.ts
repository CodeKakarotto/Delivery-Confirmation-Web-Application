import type { ApiErrorBody } from '../../shared/types.ts';
import { parse, type Schema } from '../../shared/validate.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/** Contract version of the /api routes; a breaking change would move to /api/v2. */
export const API_VERSION = '1';

/** Every API response: never cached (customer data and proof of delivery), never sniffed, framed or referred. */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-API-Version': API_VERSION,
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

export function errorResponse(err: ApiError, requestId: string): Response {
  const body: ApiErrorBody = {
    error: { code: err.code, message: err.message, requestId, ...(err.details !== undefined ? { details: err.details } : {}) },
  };
  return json(body, err.status, err.headers ?? {});
}

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

export function validationError(issues: Array<{ path: string; message: string }>): ApiError {
  return new ApiError(422, 'validation_failed', 'Some fields are missing or invalid.', { issues });
}

/** Reads and validates a JSON body with a size limit and a strict content type. */
export async function readJson<T>(request: Request, schema: Schema<T>, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<T> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(type)) {
    throw new ApiError(415, 'unsupported_media_type', 'Send the request body as application/json.');
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new ApiError(413, 'payload_too_large', 'The request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new ApiError(413, 'payload_too_large', 'The request is too large.');
  }
  let raw: unknown;
  try {
    raw = text.length ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  const result = parse(schema, raw);
  if (!result.success) throw validationError(result.issues);
  return result.data;
}

/** True for D1/SQLite unique-constraint failures (optionally on a given column). */
export function isUniqueViolation(err: unknown, needle?: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/UNIQUE constraint failed/i.test(msg)) return false;
  return needle ? msg.includes(needle) : true;
}

/**
 * Structured log line. PRIVACY RULE: callers pass only event names, codes, statuses, paths and request IDs, never
 * customer names, addresses, notes, order contents or signatures. Unexpected error messages are not logged at all
 * (they may quote data from a failed SQL statement); only the error type is.
 */
export function logEvent(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
