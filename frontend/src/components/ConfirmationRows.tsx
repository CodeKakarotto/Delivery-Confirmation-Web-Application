import { Link } from 'react-router';
import { OUTCOME_LABELS, type ConfirmationListItem } from '../../../shared/types.ts';
import { shopDateTime, shopTime } from '../lib/time.ts';
import { FlagTag, ResultTag } from './ui.tsx';

/** Saved confirmations as tappable rows, each with its delivery time. */
export function ConfirmationRows({ items, timeZone, showDate = false }: { items: ConfirmationListItem[]; timeZone: string; showDate?: boolean }) {
  return (
    <ul className="conf-rows">
      {items.map((c) => (
        <li key={c.id}>
          <Link to={`/shop/confirmations/${c.id}`} className="conf-row">
            <time className="conf-time" dateTime={c.confirmedAt}>
              {showDate ? shopDateTime(c.confirmedAt, timeZone) : shopTime(c.confirmedAt, timeZone)}
            </time>
            <span className="conf-main">
              <span className="conf-order">{c.orderId}</span>
              <span className="cell-sub">
                # {c.stopNumber ?? '—'} · Zone {c.zone ?? '—'}
                {c.recipientName ? ` · For ${c.recipientName}` : ''}
              </span>
              <span className="conf-received">
                Received by <strong>{c.receivedBy}</strong> · {OUTCOME_LABELS[c.outcome]}
              </span>
            </span>
            <span className="row-tags conf-tags">
              <ResultTag result={c.result} />
              <FlagTag count={c.attemptCount} conflict={c.hasConflict} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Previous / Next paging for lists (10 per page for shop employees, 5 for drivers). */
export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="muted small" aria-live="polite">
        Page {page} of {pages} · {total} deliveries
      </span>
      <button type="button" className="btn btn-small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}
