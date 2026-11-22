import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { DriverDelivery } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { ConfirmationRows, Pager } from '../components/ConfirmationRows.tsx';
import { Lead } from '../components/DeliveryRows.tsx';
import { leadFromParam, SearchFieldSwitch } from '../components/SearchFilters.tsx';
import { SearchSuggest } from '../components/SearchSuggest.tsx';
import { Notice, Spinner } from '../components/ui.tsx';
import { useOffline } from '../lib/offline.tsx';
import { driverSuggestions, rankToday } from '../lib/orderSuggestions.ts';
import { PAGE_SIZE, pageOf, useLocalPage } from '../lib/paging.ts';
import { useApi } from '../lib/useApi.ts';
import { useLoadToday } from '../lib/useLoadToday.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

type Show = 'both' | 'today' | 'mine';
const ZONES = ['A', 'B', 'C'];

/**
 * Drivers: find one of today's deliveries (to confirm it) or one of their own confirmations, by order ID, recipient
 * name or address. Filters: where to look, what to show, zone. Today's deliveries come from the copy on the phone, so
 * that part works with no signal.
 */
export function DriverSearchPage() {
  const timeZone = useShopTimeZone();
  const navigate = useNavigate();
  const offline = useOffline();
  const loadToday = useLoadToday();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const field = leadFromParam(params.get('in'));
  const show = (['today', 'mine'].includes(params.get('show') ?? '') ? params.get('show') : 'both') as Show;
  const zone = ZONES.includes(params.get('zone') ?? '') ? params.get('zone')! : '';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const [today, setToday] = useState<DriverDelivery[] | null>(null);
  useEffect(() => {
    void loadToday()
      .then(setToday)
      .catch(() => setToday([]));
  }, [loadToday, offline.sentVersion]);
  const waiting = new Set(offline.items.filter((i) => i.state === 'waiting').map((i) => i.payload.orderId.toLowerCase()));
  const todayMatches = useMemo(
    () => (q ? rankToday(today ?? [], q, field) : []).filter((d) => !zone || (d.zone ?? '').toUpperCase() === zone),
    [today, q, field, zone],
  );
  const [todayPage, setTodayPage] = useLocalPage(todayMatches.length, `${q}|${field}|${zone}`);

  const mine = useApi(
    () =>
      q && show !== 'today'
        ? dashboardApi.list({ q, in: field, zone: zone || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
        : Promise.resolve(null),
    [q, field, zone, show, page, offline.sentVersion],
    { live: true },
  );

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
  const filtered = field !== 'order' || show !== 'both' || zone !== '';

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
      </div>
      <p className="muted lead">Find one of today’s deliveries or one of your confirmations by order ID, name or address.</p>
      <form className="card search-card" role="search" onSubmit={onSubmit} noValidate>
        <label htmlFor="driver-search" className="search-card-label">
          Order ID, name or address
        </label>
        <div className="search-form">
          <SearchSuggest
            value={text}
            onChange={setText}
            getSuggestions={(s) => driverSuggestions(s, loadToday, field)}
            onPick={(s) => navigate(s.to)}
            inputProps={{
              id: 'driver-search',
              type: 'search',
              className: 'input-large',
              placeholder: 'e.g. 1121-04, Avery or Sample Way',
              spellCheck: false,
              maxLength: 100,
              enterKeyHint: 'search',
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
              <span>Show</span>
              <select value={show} onChange={(e) => update({ show: e.target.value === 'both' ? null : e.target.value })}>
                <option value="both">Today’s deliveries and my confirmations</option>
                <option value="today">Today’s deliveries only</option>
                <option value="mine">My confirmations only</option>
              </select>
            </label>
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
            {filtered && (
              <button type="button" className="btn btn-small btn-ghost search-clear" onClick={() => update({ in: null, show: null, zone: null })}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </form>

      {!q ? (
        <div className="card search-help-card">
          <p className="search-help-title">What you can search for</p>
          <ul className="search-help-list">
            <li>
              <strong>Order ID</strong> from the ticket; part of it is enough.
            </li>
            <li>
              <strong>Recipient’s name</strong>, first or last.
            </li>
            <li>
              <strong>Address</strong>: street, city or ZIP code.
            </li>
          </ul>
        </div>
      ) : (
        <>
          {show !== 'mine' && (
            <section className="card awaiting-card driver-awaiting" aria-labelledby="search-today">
              <h2 id="search-today">
                Today’s deliveries
                <span className="h1-sub">{todayMatches.length}</span>
              </h2>
              {today === null ? (
                <Spinner label="Looking through today’s deliveries" />
              ) : todayMatches.length === 0 ? (
                <p className="muted">None of today’s deliveries still to deliver match.</p>
              ) : (
                <>
                  <ul className="plain-list awaiting-list">
                    {pageOf(todayMatches, todayPage).map((d) => (
                      <li key={d.orderId}>
                        <Link to={`/confirm/${encodeURIComponent(d.orderId)}`} className="awaiting-row driver-stop">
                          <span className="stop-chip" aria-label={d.stopNumber ? `Stop ${d.stopNumber}` : 'No stop number'}>
                            {d.stopNumber ?? '—'}
                          </span>
                          <span className="driver-stop-main">
                            {/* Same layout always; the searched field is the blue bold text. */}
                            <span className={`cell-strong${field === 'order' ? ' lead-text' : ''}`}>{d.orderId}</span>
                            <span className="cell-sub">
                              Zone {d.zone ?? '—'} · <Lead on={field === 'name'}>{d.recipientName ?? 'No recipient name'}</Lead>
                            </span>
                            <span className="cell-sub">
                              <Lead on={field === 'address'}>
                                {d.addressLine}, {d.city} {d.postalCode}
                              </Lead>
                            </span>
                          </span>
                          {waiting.has(d.orderId.toLowerCase()) && <span className="tag tag-warn">Saved on phone</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Pager page={todayPage} total={todayMatches.length} pageSize={PAGE_SIZE} onPage={setTodayPage} />
                </>
              )}
            </section>
          )}
          {show !== 'today' && (
            <section className="card confirmed-card" aria-labelledby="search-mine">
              <h2 id="search-mine" className="results-title">
                My confirmations
                {mine.data && <span className="h1-sub">{mine.data.total}</span>}
              </h2>
              {mine.error ? (
                <Notice tone="info" title="Your confirmations could not be searched">
                  {errorMessage(mine.error)} Today’s deliveries above still work without signal.
                </Notice>
              ) : !mine.data ? (
                <Spinner label="Searching your confirmations" />
              ) : mine.data.total === 0 ? (
                <p className="muted">None of your confirmations match.</p>
              ) : (
                <>
                  <ConfirmationRows items={mine.data.items} timeZone={timeZone} showDate linkBase="/driver/confirmations" leadWithName={field === 'name'} />
                  <Pager page={page} total={mine.data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams(new URLSearchParams({ ...Object.fromEntries(params), p: String(p) }))} />
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
