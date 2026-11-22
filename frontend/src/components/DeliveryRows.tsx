import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { DeliveryListItem, SearchLead } from '../../../shared/types.ts';
import { fullDayLabel } from '../lib/calendar.ts';
import { shopTime } from '../lib/time.ts';
import { ResultTag } from './ui.tsx';

/** Employees' list of orders: confirmed (and voided) ones open their record, the others open the order. */
export function DeliveryRows({
  items,
  timeZone,
  showDate = false,
  lead = 'order',
}: {
  items: DeliveryListItem[];
  timeZone: string;
  showDate?: boolean;
  /** What each row starts with (search results put the searched field first). */
  lead?: SearchLead;
}) {
  return (
    <ul className="conf-rows">
      {items.map((d) => {
        // A voided order opens its voided record, which keeps the full change history and the "Undo void" button.
        const record = d.confirmation?.id ?? d.voidedConfirmationId;
        const to = record ? `/shop/confirmations/${record}` : `/shop/orders/${encodeURIComponent(d.orderId)}`;
        return (
          <li key={d.orderId}>
            <Link to={to} className="conf-row">
              <span className="conf-time">
                {d.confirmation ? <time dateTime={d.confirmation.confirmedAt}>{shopTime(d.confirmation.confirmedAt, timeZone)}</time> : '—'}
              </span>
              <span className="conf-main">
                {/* Same layout always; the searched field (order ID unless name or address) is the blue bold text. */}
                <span className={`conf-order${lead === 'order' ? '' : ' is-plain'}`}>{d.orderId}</span>
                <span className="cell-sub">
                  # {d.stopNumber ?? '—'} · Zone {d.zone ?? '—'} ·{' '}
                  <Lead on={lead === 'name'}>{d.recipientName ?? 'No recipient name'}</Lead>,{' '}
                  <Lead on={lead === 'address'}>{[d.addressLine, d.city].filter(Boolean).join(', ')}</Lead>
                  {showDate && d.deliveryDate ? ` · ${fullDayLabel(d.deliveryDate)}` : ''}
                </span>
                {d.confirmation && (
                  <span className="conf-received">
                    Received by <strong>{d.confirmation.receivedBy}</strong>
                  </span>
                )}
              </span>
              <span className="row-tags conf-tags">
                {d.status === 'awaiting' && d.voidedConfirmationId && <span className="tag tag-not-verified">Voided</span>}
                {d.status === 'awaiting' && <span className="tag tag-quiet">Awaiting</span>}
                {d.status === 'cancelled' && <span className="tag tag-status-cancelled">Cancelled</span>}
                {d.changed && <span className="tag tag-warn">Changed</span>}
                {d.confirmation && <ResultTag result={d.confirmation.result} />}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The searched field's text, in the blue bold style (plain otherwise). */
export function Lead({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <strong className="lead-text">{children}</strong> : <>{children}</>;
}
