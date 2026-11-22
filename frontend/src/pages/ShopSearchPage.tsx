import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addDays, localDateKey } from '../../../shared/shopTime.ts';
import type { SearchLead } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Pager } from '../components/ConfirmationRows.tsx';
import { DeliveryRows } from '../components/DeliveryRows.tsx';
import { leadFromParam } from '../components/SearchFilters.tsx';
import { SearchSuggest } from '../components/SearchSuggest.tsx';
import { EmptyState, Notice, Segmented, Spinner } from '../components/ui.tsx';
import { anyTimeRange, orderSuggestions } from '../lib/orderSuggestions.ts';
import { PAGE_SIZE } from '../lib/paging.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

type When = 'any' | 'today' | 'last7' | 'upcoming' | 'custom';
type Sort = 'newest' | 'oldest';
const LEAD_LABEL: Record<SearchLead, string> = { order: 'Order ID', name: 'Name', address: 'Address' };
const WHEN_LABEL: Record<When, string> = { any: 'Any time', today: 'Today', last7: 'Last 7 days', upcoming: 'Upcoming', custom: 'Pick dates' };
const ZONES = ['A', 'B', 'C'];
const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Employees: find deliveries by order ID, recipient name or address (part of any is enough). Filters sit behind a
 * "Filters (n)" button: show first (which field is the bold one and comes first), when, zone and sort. Active filters
 * show as chips above the results (× removes one), changed filters are outlined in purple, and the count says what
 * the filters did ("19 of 41 deliveries"). Everything lives in the URL, so Back returns to the same search.
 */
export function ShopSearchPage() {
  const timeZone = useShopTimeZone();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const field = leadFromParam(params.get('in'));
  const zone = ZONES.includes(params.get('zone') ?? '') ? params.get('zone')! : '';
  const when = ((Object.keys(WHEN_LABEL) as When[]).includes(params.get('when') as When) ? params.get('when') : 'any') as When;
  const customFrom = params.get('from');
  const customTo = params.get('to');
  const sort: Sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const [text, setText] = useState(q);
  // A search typed in the menu bar while this page is open shows up in the box too.
  useEffect(() => setText(q), [q]);

  const today = localDateKey(new Date(), timeZone);
  const mmdd = today.slice(5, 7) + today.slice(8, 10);
  const customOk = isDate(customFrom) && isDate(customTo) && customFrom <= customTo;
  const days =
    when === 'today'
      ? { date: today }
      : when === 'last7'
        ? { from: addDays(today, -6), to: today }
        : when === 'upcoming'
          ? { from: addDays(today, 1), to: addDays(today, 30) }
          : when === 'custom' && customOk
            ? { from: customFrom, to: customTo }
            : anyTimeRange();
  const customIncomplete = when === 'custom' && !customOk;
  /** Filters that narrow the results (Show first and Sort only reorder them). */
  const narrowing = zone !== '' || when !== 'any';
  const active = Boolean(q) || narrowing;
  const filterCount = [field !== 'order', zone !== '', when !== 'any', sort !== 'newest'].filter(Boolean).length;
  const [panelOpen, setPanelOpen] = useState(false);

  const results = useApi(
    () =>
      active && !customIncomplete
        ? dashboardApi.deliveries({ q: q || undefined, in: field, zone: zone || undefined, sort, ...days, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
        : Promise.resolve(null),
    [q, field, zone, when, customFrom, customTo, sort, page],
    { live: true },
  );
  // Without the narrowing filters: how many there would be, for "19 of 41 deliveries".
  const unfiltered = useApi(
    () => (q && narrowing && !customIncomplete ? dashboardApi.deliveries({ q, in: field, ...anyTimeRange(), limit: 1 }) : Promise.resolve(null)),
    [q, field, narrowing, customIncomplete],
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
  const clearAll = () => update({ in: null, zone: null, when: null, from: null, to: null, sort: null });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: text.trim().slice(0, 100) });
  };

  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (field !== 'order') chips.push({ key: 'in', label: `${LEAD_LABEL[field]} first`, remove: () => update({ in: null }) });
  if (when !== 'any')
    chips.push({
      key: 'when',
      label: when === 'custom' ? (customOk ? `${shortDate(customFrom)} – ${shortDate(customTo)}` : 'Pick dates') : WHEN_LABEL[when],
      remove: () => update({ when: null, from: null, to: null }),
    });
  if (zone) chips.push({ key: 'zone', label: `Zone ${zone}`, remove: () => update({ zone: null }) });
  if (sort !== 'newest') chips.push({ key: 'sort', label: 'Oldest first', remove: () => update({ sort: null }) });

  const total = results.data?.total;
  const countText =
    total === undefined
      ? null
      : narrowing && unfiltered.data && unfiltered.data.total !== total
        ? `${total} of ${unfiltered.data.total} ${unfiltered.data.total === 1 ? 'delivery' : 'deliveries'} (filtered)`
        : `${total} ${total === 1 ? 'delivery' : 'deliveries'}`;

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
      </div>
      <p className="muted lead search-lead">
        Find any delivery, past, today’s or upcoming, by its <strong>order ID</strong> (part of it is enough: <code>{mmdd}</code> finds every
        order from that day), the <strong>recipient’s name</strong> (first or last) or the <strong>address</strong> (street, city or ZIP code).
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

        {/* The filter button, and the active filters as chips (× removes one). */}
        <div className="filter-bar">
          <button
            type="button"
            className={`btn btn-small filter-toggle${filterCount ? ' is-set' : ''}`}
            aria-expanded={panelOpen}
            aria-controls="search-filter-panel"
            onClick={() => setPanelOpen((o) => !o)}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M3 5h14M6 10h8M8.5 15h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Filters{filterCount ? ` (${filterCount})` : ''}
            <svg className={`filter-chevron${panelOpen ? ' is-open' : ''}`} viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <path d="m5.5 7.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {chips.length > 0 && (
            <ul className="filter-chips" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.key}>
                  <button type="button" className="filter-chip" onClick={c.remove} aria-label={`Remove filter: ${c.label}`}>
                    {c.label}
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
              {chips.length > 1 && (
                <li>
                  <button type="button" className="link-button filter-clear" onClick={clearAll}>
                    Clear all
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {panelOpen && (
          <div id="search-filter-panel" className="search-filters filter-panel" aria-label="Search options">
            <FilterGroup label="Show first" set={field !== 'order'}>
              <Segmented<SearchLead>
                label="Show first"
                value={field}
                onChange={(v) => update({ in: v === 'order' ? null : v })}
                options={(['order', 'name', 'address'] as SearchLead[]).map((v) => ({ value: v, label: LEAD_LABEL[v] }))}
              />
            </FilterGroup>
            <FilterGroup label="When" set={when !== 'any'}>
              <Segmented<When>
                label="When"
                value={when}
                onChange={(v) => update({ when: v === 'any' ? null : v, from: null, to: null })}
                options={(Object.keys(WHEN_LABEL) as When[]).map((v) => ({ value: v, label: WHEN_LABEL[v] }))}
              />
            </FilterGroup>
            {when === 'custom' && (
              <div className="filter-dates">
                <label className="search-filter">
                  <span>From</span>
                  <input type="date" value={customFrom ?? ''} onChange={(e) => update({ from: e.target.value })} />
                </label>
                <label className="search-filter">
                  <span>To</span>
                  <input type="date" value={customTo ?? ''} onChange={(e) => update({ to: e.target.value })} />
                </label>
              </div>
            )}
            <FilterGroup label="Zone" set={zone !== ''}>
              <Segmented<string>
                label="Zone"
                value={zone}
                onChange={(v) => update({ zone: v || null })}
                options={[{ value: '', label: 'All' }, ...ZONES.map((z) => ({ value: z, label: z }))]}
              />
            </FilterGroup>
            <FilterGroup label="Sort" set={sort !== 'newest'}>
              <Segmented<Sort>
                label="Sort"
                value={sort}
                onChange={(v) => update({ sort: v === 'newest' ? null : v })}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                ]}
              />
            </FilterGroup>
            {filterCount > 0 && (
              <button type="button" className="btn btn-small btn-ghost search-clear" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </form>

      {customIncomplete && active && <Notice tone="info">Pick a start date and an end date to search between them.</Notice>}

      {active && !customIncomplete && (
        <section className="card confirmed-card" aria-label="Search results">
          <h2 className="results-title">
            {q ? <>Results for “{q}”</> : 'Matching deliveries'}
            {countText && <span className={`h1-sub${narrowing ? ' is-filtered' : ''}`}>{countText}</span>}
          </h2>
          {results.error ? (
            <Notice tone="error" title="Could not search">
              {errorMessage(results.error)}
            </Notice>
          ) : !results.data ? (
            <Spinner label="Searching" />
          ) : results.data.total === 0 ? (
            <EmptyState title="No deliveries match your search.">Try part of the order ID, the name or the address, or clear the filters.</EmptyState>
          ) : (
            <div className={results.loading ? 'is-loading' : undefined}>
              <DeliveryRows items={results.data.items} timeZone={timeZone} showDate lead={field} query={q} />
              <Pager page={page} total={results.data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams(new URLSearchParams({ ...Object.fromEntries(params), p: String(p) }))} />
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** One filter in the panel; outlined in purple when it is not on its default. */
function FilterGroup({ label, set, children }: { label: string; set: boolean; children: ReactNode }) {
  return (
    <div className={`filter-group${set ? ' is-set' : ''}`}>
      <span className="filter-group-label">{label}</span>
      {children}
    </div>
  );
}
