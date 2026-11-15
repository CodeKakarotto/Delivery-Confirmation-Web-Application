import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { weekWithinMonth } from '../../../shared/shopTime.ts';
import type { ConfirmationCalendar } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { CalendarTree, type CalendarLevel } from '../components/CalendarTree.tsx';
import { ConfirmationRows, Pager } from '../components/ConfirmationRows.tsx';
import { EmptyState, Notice, Segmented, Spinner } from '../components/ui.tsx';
import { defaultOpenPath, type OpenPath } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';

type View = 'all' | 'needs_review' | 'flagged';
const PAGE_SIZE = 10;
const CLOSED = '-';

/** Reads the open month/week/day from the URL (so Back returns to the same place); defaults to today. */
function readOpen(params: URLSearchParams, cal: ConfirmationCalendar): OpenPath {
  const d = defaultOpenPath(cal);
  const read = (key: string, fallback: string | null) => (params.has(key) ? (params.get(key) === CLOSED ? null : params.get(key)) : fallback);
  return { month: read('m', d.month), week: read('w', d.week), day: read('d', d.day) };
}

/**
 * Confirmations tab: month → week → day → each delivery with its time, opening on the current week and day.
 * A search by order ID or a filter switches to a flat list. Lists show 10 deliveries per page.
 */
export function ShopConfirmationsPage() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const view = (params.get('view') as View | null) ?? 'all';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const [search, setSearch] = useState(orderId);
  const [searchError, setSearchError] = useState<string | null>(null);
  const calendar = useApi(() => dashboardApi.calendar(), []);
  const timeZone = calendar.data?.timeZone ?? 'America/New_York';

  const update = (changes: Record<string, string | null>, replace = true) => {
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
    update({ orderId: id || null, p: null }, false);
  };

  const flat = Boolean(orderId) || view !== 'all';

  return (
    <>
      <div className="page-head dash-head">
        <h1>Confirmations</h1>
        <form className="search-form" role="search" onSubmit={onSearch} noValidate>
          <label htmlFor="order-search" className="visually-hidden">
            Find a confirmation by exact order ID
          </label>
          <input
            id="order-search"
            type="search"
            placeholder="Exact order ID"
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

      {!orderId && (
        <div className="records-filter">
          <Segmented<View>
            label="Show"
            value={view}
            onChange={(v) => update({ view: v === 'all' ? null : v, p: null })}
            options={[
              { value: 'all', label: 'By date' },
              { value: 'needs_review', label: 'Needs review' },
              { value: 'flagged', label: 'Flagged' },
            ]}
          />
        </div>
      )}

      {flat ? (
        <FlatResults orderId={orderId} view={view} page={page} timeZone={timeZone} onPage={(p) => update({ p: String(p) }, false)} />
      ) : calendar.error ? (
        <Notice tone="error" title="Could not load confirmations" action={<button type="button" className="btn btn-small" onClick={calendar.reload}>Try again</button>}>
          {errorMessage(calendar.error)}
        </Notice>
      ) : !calendar.data ? (
        <Spinner label="Loading confirmations" />
      ) : (
        <section className="card cal-card" aria-label="Confirmations by date">
          <CalendarTree
            calendar={calendar.data}
            open={readOpen(params, calendar.data)}
            onToggle={(level, key) => update(toggle(readOpen(params, calendar.data!), level, key, calendar.data!.today))}
            renderDay={(day) => <DayConfirmations day={day} page={page} timeZone={timeZone} onPage={(p) => update({ p: String(p) }, false)} />}
          />
        </section>
      )}
    </>
  );
}

/** Opening a level closes the levels below it, except that "today" opens by itself when its month or week opens. */
function toggle(open: OpenPath, level: CalendarLevel, key: string, today: string): Record<string, string | null> {
  const enc = (v: string | null) => v ?? CLOSED;
  const todayWeek = weekWithinMonth(today).start;
  if (level === 'month') {
    if (open.month === key) return { m: CLOSED, w: CLOSED, d: CLOSED, p: null };
    const isCurrent = today.startsWith(key);
    return { m: key, w: enc(isCurrent ? todayWeek : null), d: enc(isCurrent ? today : null), p: null };
  }
  if (level === 'week') {
    if (open.week === key) return { m: enc(open.month), w: CLOSED, d: CLOSED, p: null };
    return { m: enc(open.month), w: key, d: enc(key === todayWeek ? today : null), p: null };
  }
  if (open.day === key) return { m: enc(open.month), w: enc(open.week), d: CLOSED, p: null };
  return { m: enc(open.month), w: enc(open.week), d: key, p: null };
}

function DayConfirmations({ day, page, timeZone, onPage }: { day: string; page: number; timeZone: string; onPage: (p: number) => void }) {
  const list = useApi(() => dashboardApi.list({ day, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [day, page]);
  if (list.error) return <Notice tone="error" title="Could not load this day">{errorMessage(list.error)}</Notice>;
  if (!list.data) return <Spinner label="Loading the day’s deliveries" />;
  if (list.data.total === 0) return <p className="muted cal-empty">No confirmations saved on this day yet.</p>;
  return (
    <>
      <ConfirmationRows items={list.data.items} timeZone={timeZone} />
      <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={onPage} />
    </>
  );
}

function FlatResults({ orderId, view, page, timeZone, onPage }: { orderId: string; view: View; page: number; timeZone: string; onPage: (p: number) => void }) {
  const list = useApi(
    () =>
      dashboardApi.list({
        orderId: orderId || undefined,
        result: !orderId && view === 'needs_review' ? 'needs_review' : undefined,
        flagged: !orderId && view === 'flagged',
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    [orderId, view, page],
  );
  return (
    <section className="card cal-card" aria-label="Results">
      {list.error ? (
        <Notice tone="error" title="Could not load confirmations">{errorMessage(list.error)}</Notice>
      ) : !list.data ? (
        <Spinner label="Loading confirmations" />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={orderId ? `No saved confirmation for order ${orderId}.` : 'No confirmations to show.'}>
          {orderId ? 'Search needs the complete order ID; letter case does not matter.' : null}
        </EmptyState>
      ) : (
        <>
          <ConfirmationRows items={list.data.items} timeZone={timeZone} showDate />
          <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={onPage} />
        </>
      )}
    </section>
  );
}
