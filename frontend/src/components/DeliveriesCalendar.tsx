import { Link } from 'react-router';
import { addDays, weekStartKey } from '../../../shared/shopTime.ts';
import type { DeliveryDayCounts, DeliveryListItem } from '../../../shared/types.ts';
import { fullDayLabel } from '../lib/calendar.ts';
import { monthGrid } from '../lib/monthGrid.ts';
import { shopTime } from '../lib/time.ts';

export type CalendarView = 'month' | 'week' | 'day';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Month / Week / Day buttons. */
export function ViewSwitch({ value, onChange }: { value: CalendarView; onChange: (v: CalendarView) => void }) {
  return (
    <div className="segmented view-switch" role="group" aria-label="Calendar view">
      {(['month', 'week', 'day'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={value === v} className={value === v ? 'is-active' : ''} onClick={() => onChange(v)}>
          {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Day'}
        </button>
      ))}
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dayCountsLabel(date: string, c: DeliveryDayCounts | undefined): string {
  if (!c || c.total === 0) return `${fullDayLabel(date)}: no deliveries`;
  const parts = [plural(c.total, 'delivery', 'deliveries')];
  if (c.confirmed) parts.push(`${c.confirmed} delivered`);
  if (c.exception) parts.push(plural(c.exception, 'exception', 'exceptions'));
  if (c.awaiting) parts.push(`${c.awaiting} awaiting`);
  if (c.cancelled) parts.push(`${c.cancelled} cancelled`);
  return `${fullDayLabel(date)}: ${parts.join(', ')}`;
}

/** Month view: every day of the month with its number of deliveries by status. Tap a day to open it. */
export function DeliveriesMonth({
  month,
  today,
  days,
  onPickDay,
}: {
  month: string;
  today: string;
  days: Record<string, DeliveryDayCounts>;
  onPickDay: (date: string) => void;
}) {
  const thisWeek = weekStartKey(today);
  return (
    <table className="dcal-month">
      <thead>
        <tr>
          {WEEKDAYS.map((d) => (
            <th key={d} scope="col">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthGrid(month).map((week) => (
          <tr key={week[0]} className={week[0] === thisWeek ? 'dcal-week is-current-week' : 'dcal-week'}>
            {week.map((date) => {
              const c = days[date];
              const classes = ['dcal-day'];
              if (!date.startsWith(month)) classes.push('is-outside');
              if (date === today) classes.push('is-today');
              return (
                <td key={date}>
                  <button
                    type="button"
                    className={classes.join(' ')}
                    aria-current={date === today ? 'date' : undefined}
                    aria-label={dayCountsLabel(date, c)}
                    onClick={() => onPickDay(date)}
                  >
                    <span className="dcal-num">{Number(date.slice(8))}</span>
                    {c && c.total > 0 && (
                      <span className="dcal-counts" aria-hidden="true">
                        <span className="dcal-total">{c.total}</span>
                        <span className="dcal-pills">
                          {c.confirmed > 0 && <span className="dcal-pill is-ok">✓{c.confirmed}</span>}
                          {c.exception > 0 && <span className="dcal-pill is-warn">!{c.exception}</span>}
                          {c.awaiting > 0 && <span className="dcal-pill is-wait">•{c.awaiting}</span>}
                        </span>
                      </span>
                    )}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function itemLink(d: DeliveryListItem): string {
  return d.confirmation ? `/shop/confirmations/${d.confirmation.id}` : `/shop/orders/${encodeURIComponent(d.orderId)}`;
}

/** Week view: the seven days Sunday to Saturday together (stacked on phones), each with its deliveries. */
export function DeliveriesWeek({
  start,
  today,
  timeZone,
  items,
  onPickDay,
}: {
  /** The Sunday that starts the week. */
  start: string;
  today: string;
  timeZone: string;
  items: DeliveryListItem[];
  onPickDay: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <ol className="dcal-weekdays">
      {days.map((date) => {
        const list = items.filter((i) => i.deliveryDate === date);
        return (
          <li key={date} className={`dcal-weekday${date === today ? ' is-today' : ''}`}>
            <button
              type="button"
              className="week-day-head"
              onClick={() => onPickDay(date)}
              aria-current={date === today ? 'date' : undefined}
              aria-label={`${date === today ? 'Today, ' : ''}${fullDayLabel(date)}, ${plural(list.length, 'delivery', 'deliveries')}. Open the day`}
            >
              <span className="week-day-title">{shortDay.format(new Date(`${date}T12:00:00Z`))}</span>
              <span className="week-day-count">{list.length}</span>
            </button>
            {list.length === 0 ? (
              <p className="muted small week-empty">No deliveries</p>
            ) : (
              <ul className="week-items">
                {list.map((d) => (
                  <li key={d.orderId}>
                    <Link to={itemLink(d)} className={`week-item is-${d.status}`}>
                      <span className="week-item-time">
                        {d.confirmation ? shopTime(d.confirmation.confirmedAt, timeZone) : d.status === 'cancelled' ? 'Cancelled' : 'Awaiting'}
                      </span>
                      <span className="week-item-order">{d.orderId}</span>
                      <span className="week-item-sub">{d.recipientName ?? 'No recipient name'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
