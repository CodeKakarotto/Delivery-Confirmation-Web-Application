import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { localDateKey } from '../../../shared/shopTime.ts';
import type { CalendarDay } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { ConfirmationRows, Pager } from '../components/ConfirmationRows.tsx';
import { MonthCalendar } from '../components/MonthCalendar.tsx';
import { EmptyState, Notice, Spinner } from '../components/ui.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

const PAGE_SIZE = 10;

/**
 * The shop employees' page (view only): a single month calendar that shows the month, the current week and today,
 * with today's date underneath. Tapping a day shows that day's deliveries: those still awaiting confirmation (tap to
 * open) and those confirmed, each with its delivery time, 10 per page. The selection lives in the URL, so Back
 * returns to it.
 */
export function ShopCalendarPage() {
  const timeZone = useShopTimeZone();
  const [params, setParams] = useSearchParams();
  const calendar = useApi(() => dashboardApi.calendar(), []);
  const today = calendar.data?.today ?? localDateKey(new Date(), timeZone);
  const selected = params.get('d') || today;
  const month = params.get('m') || selected.slice(0, 7);
  const page = Math.max(1, Number(params.get('p')) || 1);
  const orderId = params.get('orderId') ?? '';
  const [search, setSearch] = useState(orderId);
  const [searchError, setSearchError] = useState<string | null>(null);

  const days = useMemo(() => {
    const map: Record<string, CalendarDay> = {};
    for (const m of calendar.data?.months ?? []) for (const w of m.weeks) for (const d of w.days) map[d.date] = d;
    return map;
  }, [calendar.data]);

  const update = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const id = search.trim();
    if (id && (id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id))) {
      setSearchError('Enter a complete order ID, e.g. MF-10482');
      return;
    }
    setSearchError(null);
    update({ orderId: id || null, p: null });
  };

  return (
    <>
      <div className="page-head dash-head">
        <h1>Deliveries</h1>
        <form className="search-form" role="search" onSubmit={onSearch} noValidate>
          <label htmlFor="order-search" className="visually-hidden">
            Find a confirmation by exact order ID
          </label>
          <input
            id="order-search"
            type="search"
            placeholder="Find by order ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={ORDER_ID_MAX}
            aria-invalid={Boolean(searchError)}
            aria-describedby={searchError ? 'order-search-err' : undefined}
          />
          <button type="submit" className="btn btn-primary">
            Find
          </button>
          {orderId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearch('');
                update({ orderId: null, p: null });
              }}
            >
              Clear
            </button>
          )}
          {searchError && (
            <p className="field-error search-error" id="order-search-err">
              {searchError}
            </p>
          )}
        </form>
      </div>

      {orderId ? (
        <SearchResults orderId={orderId} page={page} timeZone={timeZone} onPage={(p) => update({ p: String(p) })} />
      ) : (
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
                days={days}
                onSelect={(date) => update({ d: date === today ? null : date, m: null, p: null }, true)}
                onMonth={(m) => update({ m }, true)}
              />
            )}
          </section>
          <DayPanel day={selected} today={today} page={page} timeZone={timeZone} onPage={(p) => update({ p: String(p) })} onToday={() => update({ d: null, m: null, p: null }, true)} />
        </div>
      )}
    </>
  );
}

function DayPanel({
  day,
  today,
  page,
  timeZone,
  onPage,
  onToday,
}: {
  day: string;
  today: string;
  page: number;
  timeZone: string;
  onPage: (p: number) => void;
  onToday: () => void;
}) {
  const summary = useApi(() => dashboardApi.summary(day), [day]);
  const list = useApi(() => dashboardApi.list({ day, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [day, page]);
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

      {summary.error ? (
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
          Confirmed deliveries
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
            <ConfirmationRows items={list.data.items} timeZone={timeZone} />
            <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={onPage} />
          </>
        )}
      </div>
    </section>
  );
}

function SearchResults({ orderId, page, timeZone, onPage }: { orderId: string; page: number; timeZone: string; onPage: (p: number) => void }) {
  const list = useApi(() => dashboardApi.list({ orderId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [orderId, page]);
  return (
    <section className="card confirmed-card" aria-label="Search results">
      {list.error ? (
        <Notice tone="error" title="Could not search">{errorMessage(list.error)}</Notice>
      ) : !list.data ? (
        <Spinner label="Searching" />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={`No saved confirmation for order ${orderId}.`}>Search needs the complete order ID; letter case does not matter.</EmptyState>
      ) : (
        <>
          <ConfirmationRows items={list.data.items} timeZone={timeZone} showDate />
          <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={onPage} />
        </>
      )}
    </section>
  );
}
