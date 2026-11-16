import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { localDateKey } from '../../../shared/shopTime.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { ConfirmationRows, Pager } from '../components/ConfirmationRows.tsx';
import { MonthCalendar } from '../components/MonthCalendar.tsx';
import { DayLegend } from '../components/DayBadges.tsx';
import { marksMap, type DayMarks } from '../lib/dayMarks.ts';
import { useOffline } from '../lib/offline.tsx';
import { Notice, Spinner } from '../components/ui.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

const PAGE_SIZE = 10;

/**
 * A single month calendar (current week highlighted, today circled, today's date underneath). Tapping a day shows
 * that day below it.
 * - employee (shop Dashboard): the day's figures, orders still awaiting (tap to open) and every confirmation.
 * - driver (Confirmations tab): only the confirmations this driver saved.
 * Confirmations show their delivery time, 10 per page. The selection lives in the URL, so Back returns to it.
 */
export function CalendarPage({ variant }: { variant: 'employee' | 'driver' }) {
  const timeZone = useShopTimeZone();
  const [params, setParams] = useSearchParams();
  const { sentVersion } = useOffline();
  const localToday = localDateKey(new Date(), timeZone);
  const selected = params.get('d') || localToday;
  const month = params.get('m') || selected.slice(0, 7);
  const page = Math.max(1, Number(params.get('p')) || 1);

  // Employees: every order by its delivery day (delivered / missed / still to deliver), like the end-of-day report.
  // Drivers: only the deliveries they confirmed themselves.
  const shopMonth = useApi(
    () => (variant === 'employee' ? dashboardApi.deliveryCalendar(month) : Promise.resolve(null)),
    [variant, month],
    { live: true },
  );
  const mine = useApi(() => (variant === 'driver' ? dashboardApi.calendar() : Promise.resolve(null)), [variant, sentVersion], { live: true });
  const calendar = variant === 'employee' ? shopMonth : mine;
  const today = shopMonth.data?.today ?? mine.data?.today ?? localToday;

  const marks = useMemo(() => {
    if (shopMonth.data) return marksMap(Object.fromEntries(shopMonth.data.days.map((d) => [d.date, d])), today);
    const map: Record<string, DayMarks> = {};
    for (const m of mine.data?.months ?? []) for (const w of m.weeks) for (const d of w.days) map[d.date] = { delivered: d.count, missed: 0, toDeliver: 0 };
    return map;
  }, [shopMonth.data, mine.data, today]);

  const update = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };

  return (
    <>
      <div className="page-head">
        <h1>{variant === 'employee' ? 'Dashboard' : 'My confirmations'}</h1>
      </div>

      {
        <div className="shop-cal-layout">
          <section className="card cal-panel" aria-label="Calendar">
            {calendar.error ? (
              <Notice tone="error" title="Could not load the calendar" action={<button type="button" className="btn btn-small" onClick={calendar.reload}>Try again</button>}>
                {errorMessage(calendar.error)}
              </Notice>
            ) : (
              <MonthCalendar
                month={month}
                today={today}
                selected={selected}
                marks={marks}
                onSelect={(date) => update({ d: date === today ? null : date, m: null, p: null }, true)}
                onMonth={(m) => update({ m }, true)}
              />
            )}
            <DayLegend deliveredOnly={variant === 'driver'} />
          </section>
          <DayPanel
            variant={variant}
            day={selected}
            today={today}
            page={page}
            timeZone={timeZone}
            onPage={(p) => update({ p: String(p) })}
            onToday={() => update({ d: null, m: null, p: null }, true)}
          />
        </div>
      }
    </>
  );
}

function DayPanel({
  variant,
  day,
  today,
  page,
  timeZone,
  onPage,
  onToday,
}: {
  variant: 'employee' | 'driver';
  day: string;
  today: string;
  page: number;
  timeZone: string;
  onPage: (p: number) => void;
  onToday: () => void;
}) {
  // The day's figures and awaiting orders are shop-wide: employees only.
  const summary = useApi(() => (variant === 'employee' ? dashboardApi.summary(day) : Promise.resolve(null)), [day, variant], { live: true });
  const { sentVersion } = useOffline();
  const list = useApi(() => dashboardApi.list({ day, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [day, page, sentVersion], { live: true });
  const s = summary.data;
  return (
    <section className="day-panel" aria-labelledby="day-title">
      <div className="day-panel-head">
        <h2 id="day-title">{fullDayLabel(day)}</h2>
        {day === today ? (
          <span className="tag tag-now">Today</span>
        ) : (
          <button type="button" className="btn btn-small" onClick={onToday}>
            Back to today
          </button>
        )}
      </div>

      {variant === 'driver' ? null : summary.error ? (
        <Notice tone="error" title="Could not load this day">{errorMessage(summary.error)}</Notice>
      ) : !s ? (
        <Spinner label="Loading the day" />
      ) : (
        <>
          <div className="figures day-figures">
            <div className="figure">
              <span className="figure-value">{s.expected}</span>
              <span className="figure-label">Scheduled</span>
            </div>
            <div className="figure figure-ok">
              <span className="figure-value">{s.confirmed}</span>
              <span className="figure-label">Delivered to recipient</span>
            </div>
            <div className={`figure${s.needsReview ? ' figure-warn' : ''}`}>
              <span className="figure-value">{s.needsReview}</span>
              <span className="figure-label">Exceptions</span>
            </div>
            <div className={`figure${s.awaiting.length && s.isPast ? ' figure-error' : ''}`}>
              <span className="figure-value">{s.awaiting.length}</span>
              <span className="figure-label">{s.isPast ? 'Missing' : 'Awaiting'}</span>
            </div>
          </div>

          {s.awaiting.length > 0 && (
            <div className="card awaiting-card">
              <h3>
                {s.isPast ? 'Missing confirmations' : 'Awaiting confirmation'}
                <span className="h1-sub">{s.awaiting.length}</span>
              </h3>
              <ul className="plain-list awaiting-list">
                {s.awaiting.map((a) => (
                  <li key={a.orderId}>
                    <Link to={`/shop/orders/${encodeURIComponent(a.orderId)}`} className="awaiting-row">
                      <span>
                        <span className="cell-strong">{a.orderId}</span>
                        <span className="cell-sub">
                          # {a.stopNumber ?? '—'} · Zone {a.zone ?? '—'} · {a.recipientName ?? 'No recipient name'}, {a.city}
                        </span>
                      </span>
                      <span className="row-tags">
                        <span className={`tag ${s.isPast ? 'tag-not-verified' : 'tag-quiet'}`}>{s.isPast ? 'Missing' : 'Awaiting'}</span>
                        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="row-chevron">
                          <path d="M7.5 5.5 12 10l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="card confirmed-card">
        <h3>
          {variant === 'driver' ? 'My confirmed deliveries' : 'Confirmed deliveries'}
          {list.data && <span className="h1-sub">{list.data.total}</span>}
        </h3>
        {list.error ? (
          <Notice tone="error" title="Could not load confirmations">{errorMessage(list.error)}</Notice>
        ) : !list.data ? (
          <Spinner label="Loading confirmations" />
        ) : list.data.total === 0 ? (
          <p className="muted">No confirmations saved on this day.</p>
        ) : (
          <>
            <ConfirmationRows
              items={list.data.items}
              timeZone={timeZone}
              linkBase={variant === 'driver' ? '/driver/confirmations' : '/shop/confirmations'}
            />
            <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={onPage} />
          </>
        )}
      </div>
    </section>
  );
}
