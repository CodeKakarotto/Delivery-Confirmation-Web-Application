import { useId } from 'react';
import { OUTCOME_DETAIL_MAX } from '../../../shared/schemas.ts';
import { OUTCOME_LABELS, type DeliveryOutcome } from '../../../shared/types.ts';

const EXCEPTIONS: DeliveryOutcome[] = ['left_at_door', 'left_with_front_desk', 'left_with_neighbor', 'other'];

/**
 * How the order was handed over, inside Deliver To: "Delivered to recipient" is its own bubble, followed by the
 * smaller Delivery Exception group with the other options. All five are one radio group (one choice). "Other"
 * requires an explanation; the other exceptions allow an optional short note.
 */
export function ExceptionPicker({
  value,
  detail,
  onChange,
  onDetailChange,
  error,
  detailError,
  disabled,
}: {
  value: DeliveryOutcome | null;
  detail: string;
  onChange: (v: DeliveryOutcome) => void;
  onDetailChange: (v: string) => void;
  error?: string;
  detailError?: string;
  disabled?: boolean;
}) {
  const name = useId();
  const errId = `${name}-err`;
  const titleId = `${name}-title`;
  const detailId = `${name}-detail`;
  const showDetail = value !== null && value !== 'delivered_to_recipient';
  const recipient = value === 'delivered_to_recipient';
  return (
    <fieldset className={`outcome-picker${error ? ' field-invalid' : ''}`} disabled={disabled} aria-describedby={error ? errId : undefined}>
      <legend className="visually-hidden">How was the order delivered?</legend>

      <label className={`recipient-bubble${recipient ? ' is-active' : ''}`}>
        <input type="radio" name={name} value="delivered_to_recipient" checked={recipient} onChange={() => onChange('delivered_to_recipient')} />
        <span className="recipient-bubble-text">{OUTCOME_LABELS.delivered_to_recipient}</span>
        {recipient && (
          <svg className="recipient-bubble-check" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M4.5 10.5 8.5 14.5 15.5 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </label>

      <div className="deliver-exception" role="group" aria-labelledby={titleId}>
        <p className="deliver-exception-title" id={titleId}>
          Delivery Exception
        </p>
        <div className="exception-options">
          {EXCEPTIONS.map((o) => (
            <label key={o} className={`exception-option is-exception${value === o ? ' is-active' : ''}`}>
              <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
              <span>{o === 'other' ? 'Other (describe)' : OUTCOME_LABELS[o]}</span>
            </label>
          ))}
        </div>
        {showDetail && (
          <div className={`field exception-detail${detailError ? ' field-invalid' : ''}`}>
            <label htmlFor={detailId}>{value === 'other' ? 'Describe where or how it was left (required)' : 'Exception note (optional)'}</label>
            <textarea
              id={detailId}
              rows={2}
              maxLength={OUTCOME_DETAIL_MAX}
              value={detail}
              required={value === 'other'}
              aria-invalid={Boolean(detailError)}
              aria-describedby={detailError ? `${detailId}-err` : undefined}
              onChange={(e) => onDetailChange(e.target.value)}
            />
            {detailError && (
              <p className="field-error" id={`${detailId}-err`}>
                {detailError}
              </p>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="field-error" id={errId}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
