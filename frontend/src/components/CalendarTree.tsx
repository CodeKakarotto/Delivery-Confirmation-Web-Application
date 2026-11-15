import type { ReactNode } from 'react';
import type { CalendarCounts, ConfirmationCalendar } from '../../../shared/types.ts';
import { dayLabel, monthLabel, plural, weekLabel, type OpenPath } from '../lib/calendar.ts';

export type CalendarLevel = 'month' | 'week' | 'day';

function Counts({ c }: { c: CalendarCounts }) {
  return (
    <span className="cal-counts">
      <span className="cal-count">{plural(c.count, 'delivery', 'deliveries')}</span>
      {c.needsReview > 0 && <span className="tag tag-warn">{c.needsReview} to review</span>}
      {c.flagged > 0 && <span className="tag tag-not-verified">{c.flagged} flagged</span>}
    </span>
  );
}

function Chevron() {
  return (
    <svg className="cal-chevron" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M7.5 5.5 12 10l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Confirmations by month → week → day; the open day shows its deliveries (renderDay). One path is open at a time, so
 * the current position fits in the URL and the Back button returns to it.
 */
export function CalendarTree({
  calendar,
  open,
  onToggle,
  renderDay,
}: {
  calendar: ConfirmationCalendar;
  open: OpenPath;
  onToggle: (level: CalendarLevel, key: string) => void;
  renderDay: (date: string) => ReactNode;
}) {
  const { today } = calendar;
  return (
    <ul className="cal-months">
      {calendar.months.map((m) => {
        const mOpen = open.month === m.month;
        const isThisMonth = today.startsWith(m.month);
        return (
          <li key={m.month} className={`cal-month${mOpen ? ' is-open' : ''}`}>
            <button type="button" className="cal-row cal-row-month" aria-expanded={mOpen} onClick={() => onToggle('month', m.month)}>
              <Chevron />
              <span className="cal-title">{monthLabel(m.month)}</span>
              {isThisMonth && <span className="tag tag-now">This month</span>}
              <Counts c={m} />
            </button>
            {mOpen && (
              <ul className="cal-weeks">
                {m.weeks.map((w) => {
                  const wOpen = open.week === w.start;
                  const isThisWeek = w.start <= today && today <= w.end;
                  return (
                    <li key={w.start} className={`cal-week${wOpen ? ' is-open' : ''}${isThisWeek ? ' is-now' : ''}`}>
                      <button type="button" className="cal-row cal-row-week" aria-expanded={wOpen} onClick={() => onToggle('week', w.start)}>
                        <Chevron />
                        <span className="cal-title">{weekLabel(w.start, w.end)}</span>
                        {isThisWeek && <span className="tag tag-now">This week</span>}
                        <Counts c={w} />
                      </button>
                      {wOpen && (
                        <ul className="cal-days">
                          {w.days.map((d) => {
                            const dOpen = open.day === d.date;
                            const isToday = d.date === today;
                            return (
                              <li key={d.date} className={`cal-day${dOpen ? ' is-open' : ''}${isToday ? ' is-now' : ''}`}>
                                <button type="button" className="cal-row cal-row-day" aria-expanded={dOpen} onClick={() => onToggle('day', d.date)}>
                                  <Chevron />
                                  <span className="cal-title">{dayLabel(d.date)}</span>
                                  {isToday && <span className="tag tag-now">Today</span>}
                                  <Counts c={d} />
                                </button>
                                {dOpen && <div className="cal-day-body">{renderDay(d.date)}</div>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
