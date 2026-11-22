import { Link } from 'react-router';
import type { DeliveryListItem } from '../../../shared/types.ts';
import { fullDayLabel } from '../lib/calendar.ts';
import { shopTime } from '../lib/time.ts';
import { ResultTag } from './ui.tsx';

/** Employees' list of orders: confirmed (and voided) ones open their record, the others open the order. */
export function DeliveryRows({ items, timeZone, showDate = false }: { items: DeliveryListItem[]; timeZone: string; showDate?: boolean }) {
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
                <span className="conf-order">{d.orderId}</span>
                <span className="cell-sub">
                  # {d.stopNumber ?? '—'} · Zone {d.zone ?? '—'} · {d.recipientName ?? 'No recipient name'}, {d.addressLine ? `${d.addressLine}, ` : ''}
                  {d.city}
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
