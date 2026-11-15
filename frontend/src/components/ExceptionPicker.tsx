import { useId } from 'react';
import { OUTCOME_DETAIL_MAX } from '../../../shared/schemas.ts';
import { DELIVERY_OUTCOMES, OUTCOME_LABELS, type DeliveryOutcome } from '../../../shared/types.ts';

/**
 * Delivery Exception: a small subsection inside Deliver To. Large radio rows for touch. "Other" requires an
 * explanation; the other exceptions allow an optional short note.
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
  const detailId = `${name}-detail`;
  const showDetail = value !== null && value !== 'delivered_to_recipient';
  return (
    <fieldset className={`exception-picker${error ? ' field-invalid' : ''}`} disabled={disabled} aria-describedby={error ? errId : undefined}>
      <legend className="deliver-exception-title">Delivery Exception</legend>
      <div className="exception-options">
        {DELIVERY_OUTCOMES.map((o) => (
          <label key={o} className={`exception-option${value === o ? ' is-active' : ''}${o === 'delivered_to_recipient' ? '' : ' is-exception'}`}>
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
            <span>{o === 'other' ? 'Other (describe)' : OUTCOME_LABELS[o]}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className="field-error" id={errId}>
          {error}
        </p>
      )}
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
    </fieldset>
  );
}
