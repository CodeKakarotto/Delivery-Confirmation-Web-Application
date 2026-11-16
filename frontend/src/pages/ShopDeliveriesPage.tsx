import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { addDays, localDateKey, weekStartKey } from '../../../shared/shopTime.ts';
import type { DeliveryDayCounts, DeliveryStatus } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Pager } from '../components/ConfirmationRows.tsx';
import { DeliveriesMonth, DeliveriesWeek, ViewSwitch, type CalendarView } from '../components/DeliveriesCalendar.tsx';
import { DeliveryRows } from '../components/DeliveryRows.tsx';
import { EmptyState, Notice, Segmented, Spinner } from '../components/ui.tsx';
import { fullDayLabel, monthLabel } from '../lib/calendar.ts';
import { addMonths } from '../lib/monthGrid.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

const PAGE_SIZE = 10;
type Filter = DeliveryStatus | 'all';
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const noon = (d: string) => new Date(`${d}T12:00:00Z`);

/** Each day's counts for the months a view shows (a week can cross into a second month). */
function useDayCounts(months: string[]) {
  const key = months.join(',');
  const res = useApi(() => Promise.all(months.map((m) => dashboardApi.deliveryCalendar(m))), [key]);
  const days = useMemo(() => {
    const map: Record<string, DeliveryDayCounts> = {};
    for (const r of res.data ?? []) for (const d of r.days) map[d.date] = d;
    return map;
  }, [res.data]);
  return { days, error: res.error, loading: res.loading, reload: res.reload };
}

/**
 * Employees' deliveries: a small calendar (Month or Week) where tapping a day lists that day's deliveries right
 * underneath, 10 per page. Day view shows just the list. View, shown month, selected day, filter and page live in the
 * URL, so Back returns to them.
 */
export function ShopDeliveriesPage() {
  const timeZone = useShopTimeZone();
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date(), timeZone);
  const view = (params.get('view') as CalendarView | null) ?? 'month';
  const selected = params.get('date') || today;
  const shownMonth = params.get('m') || selected.slice(0, 7);
  const status = (params.get('status') as Filter | null) ?? 'all';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const weekStart = weekStartKey(selected);

  const update = (changes: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };
  const select = (d: string) => update({ date: d === today ? null : d, m: null, p: null }, false);

  const months =
    view === 'month' ? [shownMonth] : view === 'week' ? [...new Set([weekStart.slice(0, 7), addDays(weekStart, 6).slice(0, 7)])] : [];
  const counts = useDayCounts(months);

  const title =
    view === 'month'
      ? monthLabel(shownMonth)
      : view === 'week'
        ? `${shortDate.format(noon(weekStart))} – ${shortDate.format(noon(addDays(weekStart, 6)))}, ${addDays(weekStart, 6).slice(0, 4)}`
        : fullDayLabel(selected);
  const step = (dir: 1 | -1) => {
    if (view === 'month') update({ m: addMonths(shownMonth, dir) });
    else select(addDays(selected, view === 'week' ? 7 * dir : dir));
  };
  const onToday = view === 'month' ? shownMonth === today.slice(0, 7) && selected === today : selected === today;

  return (
    <>
      <div className="page-head">
        <h1>Deliveries</h1>
        <ViewSwitch value={view} onChange={(v) => update({ view: v === 'month' ? null : v, m: null, p: null })} />
      </div>

      <div className="dcal-panel">
        <div className="day-stepper">
          <button type="button" className="btn btn-ghost month-cal-nav" aria-label={`Previous ${view}`} onClick={() => step(-1)}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="day-stepper-label" aria-live="polite">
            {title}
          </h2>
          <button type="button" className="btn btn-ghost month-cal-nav" aria-label={`Next ${view}`} onClick={() => step(1)}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {!onToday && (
            <button type="button" className="btn btn-small" onClick={() => update({ date: null, m: null, p: null }, false)}>
              Today
            </button>
          )}
        </div>

        {view !== 'day' &&
          (counts.error ? (
            <Notice tone="error" title="Could not load the calendar" action={<button type="button" className="btn btn-small" onClick={counts.reload}>Try again</button>}>
              {errorMessage(counts.error)}
            </Notice>
          ) : (
            <div className={`card dcal-card${counts.loading ? ' is-loading' : ''}`}>
              {view === 'month' ? (
                <DeliveriesMonth month={shownMonth} today={today} selected={selected} days={counts.days} onPickDay={select} />
              ) : (
                <DeliveriesWeek start={weekStart} today={today} selected={selected} days={counts.days} onPickDay={select} />
              )}
              <p className="dcal-legend muted small">
                <span className="dcal-dot is-ok" /> delivered <span className="dcal-dot is-warn" /> exception <span className="dcal-dot is-wait" /> awaiting
              </p>
            </div>
          ))}
      </div>

      <DayList date={selected} today={today} status={status} page={page} timeZone={timeZone} showHeading={view !== 'day'} onStatus={(v) => update({ status: v === 'all' ? null : v, p: null })} onPage={(p) => update({ p: String(p) }, false)} />
    </>
  );
}

/** The selected day's deliveries, underneath the calendar. */
function DayList({
  date,
  today,
  status,
  page,
  timeZone,
  showHeading,
  onStatus,
  onPage,
}: {
  date: string;
  today: string;
  status: Filter;
  page: number;
  timeZone: string;
  showHeading: boolean;
  onStatus: (v: Filter) => void;
  onPage: (p: number) => void;
}) {
  const list = useApi(() => dashboardApi.deliveries({ date, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [date, status, page]);
  return (
    <section className="card confirmed-card day-list" aria-labelledby="day-list-title">
      <div className="day-list-head">
        <h2 id="day-list-title" className={showHeading ? undefined : 'visually-hidden'}>
          {fullDayLabel(date)}
          {date === today && <span className="tag tag-now">Today</span>}
          {list.data && <span className="h1-sub">{list.data.total}</span>}
        </h2>
        <Segmented<Filter>
          label="Show"
          value={status}
          onChange={onStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'awaiting', label: 'Awaiting' },
            { value: 'confirmed', label: 'Delivered' },
            { value: 'exception', label: 'Exceptions' },
          ]}
        />
      </div>
      {list.error ? (
        <Notice tone="error" title="Could not load deliveries" action={<button type="button" className="btn btn-small" onClick={list.reload}>Try again</button>}>
          {errorMessage(list.error)}
        </Notice>
      ) : !list.data ? (
        <Spinner label="Loading deliveries" />
      ) : list.data.total === 0 ? (
        <EmptyState title="No deliveries to show for this day." />
      ) : (
        <div className={list.loading ? 'is-loading' : undefined}>
          <DeliveryRows items={list.data.items} timeZone={timeZone} />
          <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={onPage} />
        </div>
      )}
    </section>
  );
}
