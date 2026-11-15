import { DELIVERY_OUTCOMES } from './types.ts';
import { s } from './validate.ts';

/** Same rule as the route-optimization app's order IDs. */
export const ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._#/-]*$/;
export const ORDER_ID_MAX = 40;

export const orderId = s.string({
  min: 1,
  max: ORDER_ID_MAX,
  pattern: ORDER_ID_PATTERN,
  patternMessage: 'Use letters, numbers and . _ # / - (start with a letter or number)',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RECEIVED_BY_MAX = 100;
export const OUTCOME_DETAIL_MAX = 300;
export const NOTE_MAX = 500;
/** Largest accepted signature image, in bytes after base64 decoding. */
export const SIGNATURE_MAX_BYTES = 200 * 1024;
/** Largest accepted request body for a confirmation (base64 adds a third, plus the other fields). */
export const SUBMIT_MAX_BODY_BYTES = 300 * 1024;

/** Optional free text. The Worker stores blank text as "not provided" (NULL). */
function optionalText(max: number) {
  return s.string({ max, multiline: true }).optional();
}

export const confirmationSubmitSchema = s.object({
  orderId,
  receivedBy: s.string({ min: 1, max: RECEIVED_BY_MAX }),
  outcome: s.enumOf(DELIVERY_OUTCOMES),
  outcomeDetail: optionalText(OUTCOME_DETAIL_MAX),
  note: optionalText(NOTE_MAX),
  // Structure only here; the image bytes are checked in worker/src/signature.ts.
  signaturePng: s.string({
    min: 30,
    max: Math.ceil((SIGNATURE_MAX_BYTES * 4) / 3) + 30,
    trim: false,
    pattern: /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/,
    patternMessage: 'Capture the customer signature',
  }),
  idempotencyKey: s.string({ min: 36, max: 36, pattern: UUID, patternMessage: 'Invalid request key' }),
});

/**
 * Rules that involve more than one field. Returns field → message (empty when valid). Used by the Worker (the
 * authority) and by the form (for immediate feedback only).
 */
export function crossFieldIssues(input: { outcome: string; outcomeDetail?: string | null }): Record<string, string> {
  const issues: Record<string, string> = {};
  if (input.outcome === 'other' && !input.outcomeDetail?.trim()) {
    issues.outcomeDetail = 'Describe where or how the delivery was left';
  }
  return issues;
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
