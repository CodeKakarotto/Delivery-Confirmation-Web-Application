import { useSearchParams } from 'react-router';
import { addDays, localDateKey } from '../../../shared/shopTime.ts';
import type { DeliveryStatus } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Pager } from '../components/ConfirmationRows.tsx';
import { DeliveryRows } from '../components/DeliveryRows.tsx';
import { EmptyState, Notice, Segmented, Spinner } from '../components/ui.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

const PAGE_SIZE = 10;
type Filter = DeliveryStatus | 'all';

/** Employees: every delivery for a day (step day by day), filtered by status, 10 per page. */
export function ShopDeliveriesPage() {
  const timeZone = useShopTimeZone();
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date(), timeZone);
  const date = params.get('date') || today;
  const status = (params.get('status') as Filter | null) ?? 'all';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const list = useApi(() => dashboardApi.deliveries({ date, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [date, status, page]);

  const update = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };
  const goDay = (d: string) => update({ date: d === today ? null : d, p: null }, true);

  return (
    <>
      <div className="page-head">
        <h1>Deliveries</h1>
      </div>
      <div className="deliveries-toolbar">
        <div className="day-stepper">
          <button type="button" className="btn btn-ghost month-cal-nav" aria-label="Previous day" onClick={() => goDay(addDays(date, -1))}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="day-stepper-label" aria-live="polite">
            {fullDayLabel(date)}
            {date === today && <span className="tag tag-now">Today</span>}
          </h2>
          <button type="button" className="btn btn-ghost month-cal-nav" aria-label="Next day" onClick={() => goDay(addDays(date, 1))}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {date !== today && (
            <button type="button" className="btn btn-small" onClick={() => goDay(today)}>
              Today
            </button>
          )}
        </div>
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
      </div>
      <section className="card confirmed-card" aria-label="Deliveries">
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
            <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => update({ p: String(p) })} />
          </div>
        )}
      </section>
    </>
  );
}
