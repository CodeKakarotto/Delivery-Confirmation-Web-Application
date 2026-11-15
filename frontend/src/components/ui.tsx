/** Shared UI pieces, matching the route-optimization app's components (same class names and styles). */
import { useId, type ReactNode } from 'react';
import { OUTCOME_LABELS, RESULT_LABELS, type ConfirmationResult, type DeliveryOutcome } from '../../../shared/types.ts';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-ring" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </span>
  );
}

export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: 'error' | 'warn' | 'info' | 'ok';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="notice-body">
        {title && <strong className="notice-title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg className="empty-mark" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 44V22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M24 30c-7 0-12-5-12-12 7 0 12 5 12 12Z" fill="currentColor" opacity=".35" />
        <path d="M24 24c6 0 10-4 10-10-6 0-10 4-10 10Z" fill="currentColor" opacity=".6" />
      </svg>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Saved result in words (never color alone): green for a recipient hand-off, amber for an exception to review. */
export function ResultTag({ result }: { result: ConfirmationResult }) {
  return (
    <span className={`tag ${result === 'confirmed' ? 'tag-ok' : 'tag-warn'}`}>
      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
        {result === 'confirmed' ? (
          <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6 1.5 11 10.5H1L6 1.5Zm0 3v3m0 1.4v.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        )}
      </svg>
      {RESULT_LABELS[result]}
    </span>
  );
}

export function OutcomeText({ outcome }: { outcome: DeliveryOutcome }) {
  return <>{OUTCOME_LABELS[outcome]}</>;
}

/** Refused duplicate/conflicting submissions for an already confirmed order. */
export function FlagTag({ count, conflict }: { count: number; conflict: boolean }) {
  if (count === 0) return null;
  return (
    <span className="tag tag-not-verified" title="Another submission for this order was refused. Review it.">
      {conflict ? 'Conflicting submission' : 'Duplicate submission'}
      {count > 1 ? ` ×${count}` : ''}
    </span>
  );
}
