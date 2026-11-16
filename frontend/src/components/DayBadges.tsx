import type { DayMarks } from '../lib/dayMarks.ts';

/** The colored numbers under a calendar day: green delivered, red missed, gray still to deliver. */
export function DayBadges({ m }: { m: DayMarks | undefined }) {
  if (!m || (!m.delivered && !m.missed && !m.toDeliver)) return null;
  return (
    <span className="day-badges" aria-hidden="true">
      {m.delivered > 0 && <span className="day-badge is-delivered">{m.delivered}</span>}
      {m.missed > 0 && <span className="day-badge is-missed">{m.missed}</span>}
      {m.toDeliver > 0 && <span className="day-badge is-todo">{m.toDeliver}</span>}
    </span>
  );
}

/** What the colors mean. Drivers only see "delivered" (their own confirmations). */
export function DayLegend({ deliveredOnly = false }: { deliveredOnly?: boolean }) {
  return (
    <p className="day-legend">
      <span>
        <span className="day-badge is-delivered" aria-hidden="true">3</span>
        {deliveredOnly ? 'Delivered by me' : 'Delivered (incl. exceptions)'}
      </span>
      {!deliveredOnly && (
        <>
          <span>
            <span className="day-badge is-missed" aria-hidden="true">2</span>
            Missed
          </span>
          <span>
            <span className="day-badge is-todo" aria-hidden="true">4</span>
            Still to deliver
          </span>
        </>
      )}
    </p>
  );
}
