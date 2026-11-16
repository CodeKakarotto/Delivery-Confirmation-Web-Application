import { addDays, weekStartKey } from '../../../shared/shopTime.ts';
import type { DeliveryDayCounts } from '../../../shared/types.ts';
import { fullDayLabel } from '../lib/calendar.ts';
import { monthGrid } from '../lib/monthGrid.ts';

export type CalendarView = 'month' | 'week' | 'day';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

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

/** Small status dots under a day's number (details are in the list below the calendar). */
function Dots({ c }: { c: DeliveryDayCounts | undefined }) {
  if (!c || c.total === 0) return null;
  return (
    <span className="dcal-dots" aria-hidden="true">
      <span className="dcal-total">{c.total}</span>
      {c.confirmed > 0 && <span className="dcal-dot is-ok" />}
      {c.exception > 0 && <span className="dcal-dot is-warn" />}
      {c.awaiting > 0 && <span className="dcal-dot is-wait" />}
    </span>
  );
}

function dayClasses(date: string, today: string, selected: string, outside = false): string {
  const classes = ['dcal-day'];
  if (outside) classes.push('is-outside');
  if (date === today) classes.push('is-today');
  if (date === selected) classes.push('is-selected');
  return classes.join(' ');
}

/** Month view: a compact month grid; each day shows its number of deliveries. Tap a day to list it below. */
export function DeliveriesMonth({
  month,
  today,
  selected,
  days,
  onPickDay,
}: {
  month: string;
  today: string;
  selected: string;
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
            {week.map((date) => (
              <td key={date}>
                <button
                  type="button"
                  className={dayClasses(date, today, selected, !date.startsWith(month))}
                  aria-current={date === today ? 'date' : undefined}
                  aria-pressed={date === selected}
                  aria-label={dayCountsLabel(date, days[date])}
                  onClick={() => onPickDay(date)}
                >
                  <span className="dcal-num">{Number(date.slice(8))}</span>
                  <Dots c={days[date]} />
                </button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Week view: one compact row of the seven days, Sunday to Saturday. Tap a day to list it below. */
export function DeliveriesWeek({
  start,
  today,
  selected,
  days,
  onPickDay,
}: {
  /** The Sunday that starts the week. */
  start: string;
  today: string;
  selected: string;
  days: Record<string, DeliveryDayCounts>;
  onPickDay: (date: string) => void;
}) {
  return (
    <div className="dcal-strip" role="group" aria-label="Week">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((date) => (
        <button
          key={date}
          type="button"
          className={dayClasses(date, today, selected)}
          aria-current={date === today ? 'date' : undefined}
          aria-pressed={date === selected}
          aria-label={dayCountsLabel(date, days[date])}
          onClick={() => onPickDay(date)}
        >
          <span className="week-day-title">{`${weekdayShort.format(new Date(`${date}T12:00:00Z`))} ${Number(date.slice(8))}`}</span>
          <Dots c={days[date]} />
        </button>
      ))}
    </div>
  );
}
