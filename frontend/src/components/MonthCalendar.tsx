import { marksWords, type DayMarks } from '../lib/dayMarks.ts';
import { DayBadges } from './DayBadges.tsx';
import { fullDayLabel, monthLabel } from '../lib/calendar.ts';
import { addMonths, monthGrid } from '../lib/monthGrid.ts';
import { weekStartKey } from '../../../shared/shopTime.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(date: string, m: DayMarks | undefined): string {
  return [fullDayLabel(date), ...marksWords(m)].join(', ');
}

/**
 * A single month calendar: the current week's row highlighted, today circled, and today's date written underneath. Each day shows colored numbers (green delivered, red missed, gray still to deliver); tapping a day selects it.
 */
export function MonthCalendar({
  month,
  today,
  selected,
  marks,
  onSelect,
  onMonth,
}: {
  /** 'YYYY-MM' being shown. */
  month: string;
  /** Today in the shop's time zone. */
  today: string;
  selected: string;
  /** The numbers to show, by date. */
  marks: Record<string, DayMarks>;
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
                const m = marks[date];
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
                      aria-label={dayLabel(date, m)}
                      onClick={() => onSelect(date)}
                    >
                      <span className="month-cal-num">{Number(date.slice(8))}</span>
                      <DayBadges m={m} />
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
      </p>
    </div>
  );
}
