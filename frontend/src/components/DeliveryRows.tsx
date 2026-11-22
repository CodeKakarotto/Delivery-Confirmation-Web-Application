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
                <span className="conf-order">{leadText(d, lead)}</span>
                <span className="cell-sub">
                  {restText(d, lead)}
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

const address = (d: DeliveryListItem) => [d.addressLine, d.city].filter(Boolean).join(', ');

/** The first line of a row: the order ID, the recipient's name or the address. */
function leadText(d: DeliveryListItem, lead: SearchLead): string {
  if (lead === 'name') return d.recipientName ?? 'No recipient name';
  if (lead === 'address') return address(d) || d.orderId;
  return d.orderId;
}

/** The line under it: everything else. */
function restText(d: DeliveryListItem, lead: SearchLead): string {
  const stop = `# ${d.stopNumber ?? '—'} · Zone ${d.zone ?? '—'}`;
  const name = d.recipientName ?? 'No recipient name';
  if (lead === 'name') return `${d.orderId} · ${stop} · ${address(d)}`;
  if (lead === 'address') return `${d.orderId} · ${stop} · ${name}`;
  return `${stop} · ${name}, ${address(d)}`;
}
