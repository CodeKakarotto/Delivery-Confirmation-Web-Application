import { crossFieldIssues, NOTE_MAX, OUTCOME_DETAIL_MAX, RECEIVED_BY_MAX } from '../../../shared/schemas.ts';
import type { DeliveryOutcome } from '../../../shared/types.ts';

/** Minimum total ink length (CSS pixels) for a drawing to count as a signature rather than a stray tap. */
export const MIN_SIGNATURE_STROKE = 60;

export interface CapturedSignature {
  /** data:image/png;base64,… */
  dataUrl: string;
  /** Total length of all strokes, in CSS pixels. */
  strokeLength: number;
}

export interface ConfirmationFormState {
  outcome: DeliveryOutcome | null;
  outcomeDetail: string;
  note: string;
  receivedBy: string;
  signature: CapturedSignature | null;
}

export type FormErrors = Partial<Record<'outcome' | 'outcomeDetail' | 'note' | 'receivedBy' | 'signature', string>>;

/** Immediate feedback for the driver. The Worker repeats every check; this is for usability only. */
export function validateConfirmationForm(f: ConfirmationFormState): FormErrors {
  const errors: FormErrors = {};
  if (!f.outcome) errors.outcome = 'Choose how the delivery was handed over';
  else {
    const cross = crossFieldIssues({ outcome: f.outcome, outcomeDetail: f.outcomeDetail });
    if (cross.outcomeDetail) errors.outcomeDetail = cross.outcomeDetail;
  }
  if (f.outcomeDetail.trim().length > OUTCOME_DETAIL_MAX) errors.outcomeDetail = `Use at most ${OUTCOME_DETAIL_MAX} characters`;
  const name = f.receivedBy.trim();
  if (!name) errors.receivedBy = 'Enter the name of the person who received the delivery';
  else if (name.length > RECEIVED_BY_MAX) errors.receivedBy = `Use at most ${RECEIVED_BY_MAX} characters`;
  // A typed name is never a signature: the customer must draw one.
  if (!f.signature || f.signature.strokeLength < MIN_SIGNATURE_STROKE) {
    errors.signature = 'Ask the customer to sign in the box';
  }
  if (f.note.trim().length > NOTE_MAX) errors.note = `Use at most ${NOTE_MAX} characters`;
  return errors;
}
