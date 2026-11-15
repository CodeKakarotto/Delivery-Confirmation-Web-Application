import type { CalendarDay } from '../../../shared/types.ts';
import { fullDayLabel, monthLabel, weekLabel } from '../lib/calendar.ts';
import { addMonths, monthGrid } from '../lib/monthGrid.ts';
import { addDays, weekStartKey } from '../../../shared/shopTime.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(date: string, info: CalendarDay | undefined): string {
  const parts = [fullDayLabel(date)];
  if (info?.count) parts.push(`${info.count} confirmed`);
  if (info?.needsReview) parts.push(`${info.needsReview} to review`);
  if (info?.flagged) parts.push(`${info.flagged} flagged`);
  return parts.join(', ');
}

/**
 * The shop's single calendar: one month, the current week's row highlighted, today circled, and today's date written
 * underneath. Each day shows how many deliveries were confirmed; tapping a day selects it.
 */
export function MonthCalendar({
  month,
  today,
  selected,
  days,
  onSelect,
  onMonth,
}: {
  /** 'YYYY-MM' being shown. */
  month: string;
  /** Today in the shop's time zone. */
  today: string;
  selected: string;
  /** Confirmation counts by date. */
  days: Record<string, CalendarDay>;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
}) {
  const weeks = monthGrid(month);
  const thisWeek = weekStartKey(today);
  return (
    <div className="month-cal">
      <div className="month-cal-head">
        <button type="button" className="btn btn-ghost month-cal-nav" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="month-cal-title" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <button type="button" className="btn btn-ghost month-cal-nav" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <table className="month-cal-grid">
        <thead>
          <tr className="month-cal-weekdays">
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]} className={week[0] === thisWeek ? 'month-cal-week is-current-week' : 'month-cal-week'}>
              {week.map((date) => {
                const info = days[date];
                const outside = !date.startsWith(month);
                const classes = ['month-cal-day'];
                if (outside) classes.push('is-outside');
                if (date === today) classes.push('is-today');
                if (date === selected) classes.push('is-selected');
                return (
                  <td key={date}>
                    <button
                      type="button"
                      className={classes.join(' ')}
                      aria-current={date === today ? 'date' : undefined}
                      aria-pressed={date === selected}
                      aria-label={dayLabel(date, info)}
                      onClick={() => onSelect(date)}
                    >
                      <span className="month-cal-num">{Number(date.slice(8))}</span>
                      {info?.count ? (
                        <span className={`month-cal-count${info.needsReview || info.flagged ? ' has-review' : ''}`} aria-hidden="true">
                          {info.count}
                        </span>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="month-cal-date">
        <span className="month-cal-today">{fullDayLabel(today)}</span>
        <span className="muted">Week of {weekLabel(thisWeek, addDays(thisWeek, 6))}</span>
      </p>
    </div>
  );
}
