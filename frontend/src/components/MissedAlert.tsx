import { Link } from 'react-router';
import type { MissedDeliveries } from '../../../shared/types.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';

/** "18:00" → "6:00 PM". */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Employees' dashboard: a red alert listing deliveries that were never confirmed (earlier days of the last week,
 * and today once the shop has closed), so nothing slips to the next day. It updates by itself and disappears when
 * every order is confirmed. After closing with nothing missed, a short green "all confirmed" line shows instead.
 */
export function MissedAlert() {
  const res = useApi(() => dashboardApi.missed(), [], { live: true });
  if (!res.data) return null;
  return <MissedAlertView data={res.data} />;
}

export function MissedAlertView({ data }: { data: MissedDeliveries }) {
  const closing = clockLabel(data.closingTime);
  if (data.total === 0) {
    if (!data.afterClosing) return null;
    return (
      <p className="missed-ok" role="status">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All deliveries are confirmed. Nothing was missed today or in the last {data.lookbackDays - 1} days.
      </p>
    );
  }
  const todayMissed = data.days.find((d) => d.date === data.today)?.orders.length ?? 0;
  return (
    <section className="missed-alert" aria-labelledby="missed-title">
      <div className="missed-alert-head">
        <span className="missed-alert-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="20" height="20">
            <path d="M10 3.2 17.5 16.5h-15z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M10 8v3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="10" cy="14.2" r="1" fill="currentColor" />
          </svg>
        </span>
        <div>
          <h2 id="missed-title">
            {data.total === 1 ? '1 delivery was not confirmed' : `${data.total} deliveries were not confirmed`}
          </h2>
          <p>
            {todayMissed > 0 ? `The shop closed at ${closing} and ${todayMissed} of today’s ${todayMissed === 1 ? 'delivery is' : 'deliveries are'} still not confirmed. ` : ''}
            Tap a day to see its orders. Check with the driver. If it was delivered on paper, enter it from the paper slip; then it disappears from this list.
          </p>
        </div>
      </div>
      {data.days.map((day, i) => (
        <details key={day.date} className="missed-day" open={i === 0 && data.total <= 5}>
          <summary>
            <svg className="missed-chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M7.5 5.5 12 10l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="missed-day-label">{day.date === data.today ? `Today, ${fullDayLabel(day.date)}` : fullDayLabel(day.date)}</span>
            <span className="missed-count">{day.orders.length} missed</span>
          </summary>
          <ul className="plain-list missed-list">
            {day.orders.map((o) => (
              <li key={o.orderId}>
                <Link to={`/shop/orders/${encodeURIComponent(o.orderId)}`} className="missed-order">
                  <span className="cell-strong">{o.orderId}</span>
                  <span className="cell-sub">
                    # {o.stopNumber ?? '—'} · Zone {o.zone ?? '—'} · {o.recipientName ?? 'No recipient name'}, {o.city}
                  </span>
                </Link>
                <Link to={`/shop/paper?order=${encodeURIComponent(o.orderId)}`} className="btn btn-small">
                  Enter from paper slip
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
