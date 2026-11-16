import { OUTCOME_LABELS, type ConfirmationCorrection, type DeliveryOutcome } from '../../../shared/types.ts';
import { shopDateTime } from '../lib/time.ts';

const FIELD_LABEL = { receivedBy: 'Received by', outcome: 'Delivery', outcomeDetail: 'Exception note' } as const;

function show(field: keyof typeof FIELD_LABEL, value: string | null): string {
  if (value === null || value === '') return '(none)';
  return field === 'outcome' ? (OUTCOME_LABELS[value as DeliveryOutcome] ?? value) : value;
}

/** Every correction and void of a record, oldest first: the original values stay visible, crossed out. */
export function CorrectionHistory({ items, timeZone }: { items: ConfirmationCorrection[]; timeZone?: string }) {
  if (items.length === 0) return null;
  return (
    <ol className="corrections">
      {items.map((c, i) => (
        <li key={i} className={`correction is-${c.kind}`}>
          <p className="correction-head">
            <strong>{c.kind === 'void' ? 'Voided' : c.kind === 'unvoid' ? 'Void undone' : 'Corrected'}</strong> by {c.by ?? 'an employee'} ·{' '}
            <time dateTime={c.createdAt}>{shopDateTime(c.createdAt, timeZone)}</time>
          </p>
          {c.changes.length > 0 && (
            <ul className="correction-changes">
              {c.changes.map((ch) => (
                <li key={ch.field}>
                  <span className="correction-field">{FIELD_LABEL[ch.field]}:</span> <del>{show(ch.field, ch.from)}</del>{' '}
                  <span aria-hidden="true">→</span>
                  <span className="visually-hidden"> changed to </span> <ins>{show(ch.field, ch.to)}</ins>
                </li>
              ))}
            </ul>
          )}
          <p className="correction-reason">
            <span className="correction-field">Reason:</span> {c.reason}
          </p>
        </li>
      ))}
    </ol>
  );
}
