import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addDays, localDateKey } from '../../../shared/shopTime.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Pager } from '../components/ConfirmationRows.tsx';
import { DeliveryRows } from '../components/DeliveryRows.tsx';
import { SearchSuggest } from '../components/SearchSuggest.tsx';
import { leadFromParam, SearchFieldSwitch } from '../components/SearchFilters.tsx';
import { EmptyState, Notice, Spinner } from '../components/ui.tsx';
import { anyTimeRange, orderSuggestions } from '../lib/orderSuggestions.ts';
import { PAGE_SIZE } from '../lib/paging.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

type When = 'any' | 'today' | 'last7' | 'upcoming' | 'custom';
const WHEN_OPTIONS: Array<{ value: When; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'custom', label: 'Pick dates…' },
];
const ZONES = ['A', 'B', 'C'];
const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/**
 * Employees: find deliveries by order ID, recipient name or address (part of any is enough), with filters for zone,
 * dates and order. Everything lives in the URL, so Back returns to the same search.
 */
export function ShopSearchPage() {
  const timeZone = useShopTimeZone();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const field = leadFromParam(params.get('in'));
  const zone = ZONES.includes(params.get('zone') ?? '') ? params.get('zone')! : '';
  const when = (WHEN_OPTIONS.some((o) => o.value === params.get('when')) ? params.get('when') : 'any') as When;
  const customFrom = params.get('from');
  const customTo = params.get('to');
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const [text, setText] = useState(q);
  // A search typed in the menu bar while this page is open shows up in the box too.
  useEffect(() => setText(q), [q]);

  const today = localDateKey(new Date(), timeZone);
  const mmdd = today.slice(5, 7) + today.slice(8, 10);
  const days =
    when === 'today'
      ? { date: today }
      : when === 'last7'
        ? { from: addDays(today, -6), to: today }
        : when === 'upcoming'
          ? { from: addDays(today, 1), to: addDays(today, 30) }
          : when === 'custom' && isDate(customFrom) && isDate(customTo) && customFrom <= customTo
            ? { from: customFrom, to: customTo }
            : anyTimeRange();
  const customIncomplete = when === 'custom' && !(isDate(customFrom) && isDate(customTo) && customFrom <= customTo);
  const filtered = field !== 'order' || zone !== '' || when !== 'any' || sort !== 'newest';
  const active = Boolean(q) || zone !== '' || when !== 'any';

  const results = useApi(
    () =>
      active && !customIncomplete
        ? dashboardApi.deliveries({ q: q || undefined, in: field, zone: zone || undefined, sort, ...days, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
        : Promise.resolve(null),
    [q, field, zone, when, customFrom, customTo, sort, page],
    { live: true },
  );

  /** Changes some search settings and goes back to page 1. */
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('p');
    setParams(next, { replace: true });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: text.trim().slice(0, 100) });
  };

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
      </div>
      <p className="muted lead search-lead">
        Find any delivery (past, today or upcoming) by <strong>order ID</strong> (part is enough: <code>{mmdd}</code> finds every order from that
        day), <strong>recipient’s name</strong> (first or last) or <strong>address</strong> (street, city or ZIP code).
      </p>
      <form className="card search-card" role="search" onSubmit={onSubmit} noValidate>
        <label htmlFor="shop-search" className="search-card-label">
          Order ID, name or address
        </label>
        <div className="search-form">
          <SearchSuggest
            value={text}
            onChange={setText}
            getSuggestions={(s) => orderSuggestions(s, field)}
            onPick={(s) => navigate(s.to)}
            inputProps={{
              id: 'shop-search',
              type: 'search',
              className: 'input-large',
              placeholder: `e.g. MF-${mmdd}-04, Avery or Sample Way`,
              spellCheck: false,
              maxLength: 100,
            }}
          />
          <button type="submit" className="btn btn-primary btn-large">
            Search
          </button>
        </div>

        <div className="search-filters" aria-label="Search options">
          <SearchFieldSwitch value={field} onChange={(v) => update({ in: v === 'order' ? null : v })} />
          <div className="search-filter-row">
            <label className="search-filter">
              <span>Zone</span>
              <select value={zone} onChange={(e) => update({ zone: e.target.value || null })}>
                <option value="">Any zone</option>
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    Zone {z}
                  </option>
                ))}
              </select>
            </label>
            <label className="search-filter">
              <span>When</span>
              <select value={when} onChange={(e) => update({ when: e.target.value === 'any' ? null : e.target.value, from: null, to: null })}>
                {WHEN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {when === 'custom' && (
              <>
                <label className="search-filter">
                  <span>From</span>
                  <input type="date" value={customFrom ?? ''} onChange={(e) => update({ from: e.target.value })} />
                </label>
                <label className="search-filter">
                  <span>To</span>
                  <input type="date" value={customTo ?? ''} onChange={(e) => update({ to: e.target.value })} />
                </label>
              </>
            )}
            <label className="search-filter">
              <span>Sort</span>
              <select value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value })}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            {filtered && (
              <button type="button" className="btn btn-small btn-ghost search-clear" onClick={() => update({ in: null, zone: null, when: null, from: null, to: null, sort: null })}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </form>

      {customIncomplete && active && <Notice tone="info">Pick a start and an end date to search between them.</Notice>}

      {active && !customIncomplete && (
          <section className="card confirmed-card" aria-label="Search results">
            <h2 className="results-title">
              {q ? <>Results for “{q}”</> : 'Matching deliveries'}
              {results.data && <span className="h1-sub">{results.data.total === 1 ? '1 delivery' : `${results.data.total} deliveries`}</span>}
            </h2>
            {results.error ? (
              <Notice tone="error" title="Could not search">
                {errorMessage(results.error)}
              </Notice>
            ) : !results.data ? (
              <Spinner label="Searching" />
            ) : results.data.total === 0 ? (
              <EmptyState title="No deliveries match.">Try part of the order ID, name or address, or clear the filters.</EmptyState>
            ) : (
              <div className={results.loading ? 'is-loading' : undefined}>
                <DeliveryRows items={results.data.items} timeZone={timeZone} showDate lead={field} />
                <Pager page={page} total={results.data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams(new URLSearchParams({ ...Object.fromEntries(params), p: String(p) }))} />
              </div>
            )}
          </section>
      )}
    </>
  );
}
