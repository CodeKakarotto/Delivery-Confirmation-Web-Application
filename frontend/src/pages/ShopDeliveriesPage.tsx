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

/**
 * Employees' deliveries as a calendar with Month, Week and Day views. Month: each day's deliveries by status (tap a
 * day to open it). Week: all seven days together, each with its deliveries. Day: the day's list, 10 per page. The view,
 * date, filter and page live in the URL, so Back returns to them.
 */
export function ShopDeliveriesPage() {
  const timeZone = useShopTimeZone();
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date(), timeZone);
  const view = (params.get('view') as CalendarView | null) ?? 'month';
  const date = params.get('date') || today;
  const status = (params.get('status') as Filter | null) ?? 'all';
  const page = Math.max(1, Number(params.get('p')) || 1);

  const update = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };
  const openDay = (d: string) => update({ view: 'day', date: d === today ? null : d, p: null });
  const setDate = (d: string) => update({ date: d === today ? null : d, p: null }, true);

  const weekStart = weekStartKey(date);
  const title =
    view === 'month'
      ? monthLabel(date.slice(0, 7))
      : view === 'week'
        ? `${shortDate.format(noon(weekStart))} – ${shortDate.format(noon(addDays(weekStart, 6)))}, ${weekStart.slice(0, 4)}`
        : fullDayLabel(date);
  const step = (dir: 1 | -1) =>
    setDate(view === 'month' ? `${addMonths(date.slice(0, 7), dir)}-01` : view === 'week' ? addDays(weekStart, 7 * dir) : addDays(date, dir));
  const showsToday = view === 'month' ? today.startsWith(date.slice(0, 7)) : view === 'week' ? weekStartKey(today) === weekStart : date === today;

  return (
    <>
      <div className="page-head">
        <h1>Deliveries</h1>
        <ViewSwitch value={view} onChange={(v) => update({ view: v === 'month' ? null : v, p: null }, true)} />
      </div>

      <div className="deliveries-toolbar">
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
          {!showsToday && (
            <button type="button" className="btn btn-small" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>
        {view !== 'month' && (
          <Segmented<Filter>
            label="Show"
            value={status}
            onChange={(v) => update({ status: v === 'all' ? null : v, p: null }, true)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'awaiting', label: 'Awaiting' },
              { value: 'confirmed', label: 'Delivered' },
              { value: 'exception', label: 'Exceptions' },
            ]}
          />
        )}
      </div>

      {view === 'month' && <MonthView month={date.slice(0, 7)} today={today} onPickDay={openDay} />}
      {view === 'week' && <WeekView start={weekStart} today={today} status={status} timeZone={timeZone} onPickDay={openDay} />}
      {view === 'day' && <DayView date={date} status={status} page={page} timeZone={timeZone} onPage={(p) => update({ p: String(p) })} />}
    </>
  );
}

function MonthView({ month, today, onPickDay }: { month: string; today: string; onPickDay: (d: string) => void }) {
  const cal = useApi(() => dashboardApi.deliveryCalendar(month), [month]);
  const days = useMemo(() => {
    const map: Record<string, DeliveryDayCounts> = {};
    for (const d of cal.data?.days ?? []) map[d.date] = d;
    return map;
  }, [cal.data]);
  return (
    <section className="card dcal-card" aria-label="Month">
      {cal.error ? (
        <Notice tone="error" title="Could not load the month" action={<button type="button" className="btn btn-small" onClick={cal.reload}>Try again</button>}>
          {errorMessage(cal.error)}
        </Notice>
      ) : (
        <div className={cal.loading ? 'is-loading' : undefined}>
          <DeliveriesMonth month={month} today={today} days={days} onPickDay={onPickDay} />
          <p className="dcal-legend muted small">
            <span className="dcal-pill is-ok">✓</span> delivered <span className="dcal-pill is-warn">!</span> exceptions{' '}
            <span className="dcal-pill is-wait">•</span> awaiting. Tap a day to see its deliveries.
          </p>
        </div>
      )}
    </section>
  );
}

function WeekView({
  start,
  today,
  status,
  timeZone,
  onPickDay,
}: {
  start: string;
  today: string;
  status: Filter;
  timeZone: string;
  onPickDay: (d: string) => void;
}) {
  const list = useApi(() => dashboardApi.deliveries({ from: start, to: addDays(start, 6), status, limit: 200 }), [start, status]);
  if (list.error) return <Notice tone="error" title="Could not load the week">{errorMessage(list.error)}</Notice>;
  if (!list.data) return <Spinner label="Loading the week" />;
  return (
    <section aria-label="Week" className={list.loading ? 'is-loading' : undefined}>
      <DeliveriesWeek start={start} today={today} timeZone={timeZone} items={list.data.items} onPickDay={onPickDay} />
      {list.data.total > list.data.items.length && (
        <p className="muted small">Showing the first {list.data.items.length} of {list.data.total} deliveries. Open a day to see all of them.</p>
      )}
    </section>
  );
}

function DayView({ date, status, page, timeZone, onPage }: { date: string; status: Filter; page: number; timeZone: string; onPage: (p: number) => void }) {
  const list = useApi(() => dashboardApi.deliveries({ date, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [date, status, page]);
  return (
    <section className="card confirmed-card" aria-label="Day">
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
