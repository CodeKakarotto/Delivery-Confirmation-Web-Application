import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import type { DriverDelivery, SearchLead } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { useOffline } from '../lib/offline.tsx';
import { rankToday } from '../lib/orderSuggestions.ts';
import { PAGE_SIZE, pageOf, useLocalPage } from '../lib/paging.ts';
import { useApi, useDebounced } from '../lib/useApi.ts';
import { useLoadToday } from '../lib/useLoadToday.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';
import { ConfirmationRows, Pager } from './ConfirmationRows.tsx';
import { Lead } from './DeliveryRows.tsx';
import { SearchFieldSwitch } from './SearchFilters.tsx';
import { Field, Notice, Spinner } from './ui.tsx';

type Show = 'both' | 'today' | 'mine';
const ZONES = ['A', 'B', 'C'];

/**
 * Drivers' "Can't find the order?": type an order ID, a recipient's name or an address and the matches appear right
 * underneath (today's deliveries, from the copy on the phone so it works with no signal, and the driver's own
 * confirmations). Filters: show first (order ID, name or address), show (today, mine or both), zone. "Open delivery"
 * still opens any order by its exact ID.
 */
export function DriverFind() {
  const navigate = useNavigate();
  const offline = useOffline();
  const loadToday = useLoadToday();
  const timeZone = useShopTimeZone();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [lead, setLead] = useState<SearchLead>('order');
  const [show, setShow] = useState<Show>('both');
  const [zone, setZone] = useState('');
  const q = useDebounced(text.trim().slice(0, 100), 200);

  const [today, setToday] = useState<DriverDelivery[] | null>(null);
  useEffect(() => {
    void loadToday()
      .then(setToday)
      .catch(() => setToday([]));
  }, [loadToday, offline.sentVersion]);
  const waiting = new Set(offline.items.filter((i) => i.state === 'waiting').map((i) => i.payload.orderId.toLowerCase()));
  const todayMatches = useMemo(
    () => (q ? rankToday(today ?? [], q, lead) : []).filter((d) => !zone || (d.zone ?? '').toUpperCase() === zone),
    [today, q, lead, zone],
  );
  const searchKey = `${q}|${lead}|${zone}|${show}`;
  const [todayPage, setTodayPage] = useLocalPage(todayMatches.length, searchKey);
  const [minePage, setMinePage] = useState(1);
  useEffect(() => setMinePage(1), [searchKey]);
  const mine = useApi(
    () =>
      q && show !== 'today'
        ? dashboardApi.list({ q, in: lead, zone: zone || undefined, limit: PAGE_SIZE, offset: (minePage - 1) * PAGE_SIZE })
        : Promise.resolve(null),
    [q, lead, zone, show, minePage, offline.sentVersion],
    { live: true },
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = text.trim();
    if (!id) return setError('Enter the order ID from the ticket');
    if (id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id)) return setError('Order IDs use letters, numbers and . _ # / -');
    navigate(`/confirm/${encodeURIComponent(id)}`);
  };
  const filtered = lead !== 'order' || show !== 'both' || zone !== '';

  return (
    <form className="card start-card driver-find" onSubmit={onSubmit} noValidate>
      <h2>Can’t find the order?</h2>
      <Field label="Order ID, name or address" error={error} hint="Matches show up below as you type. Tap one to open it.">
        {(p) => (
          <input
            {...p}
            type="search"
            className="input-large"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(undefined);
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={100}
          />
        )}
      </Field>
      <button type="submit" className="btn btn-primary btn-block btn-large">
        Open delivery
      </button>

      <div className="search-filters" aria-label="Search options">
        <SearchFieldSwitch value={lead} onChange={setLead} />
        <div className="search-filter-row">
          <label className="search-filter">
            <span>Show</span>
            <select value={show} onChange={(e) => setShow(e.target.value as Show)}>
              <option value="both">Today + mine</option>
              <option value="today">Today only</option>
              <option value="mine">Mine only</option>
            </select>
          </label>
          <label className="search-filter">
            <span>Zone</span>
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">Any zone</option>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  Zone {z}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              className="btn btn-small btn-ghost search-clear"
              onClick={() => {
                setLead('order');
                setShow('both');
                setZone('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {q && (
        <div className="driver-find-results" aria-live="polite">
          {show !== 'mine' && (
            <section aria-labelledby="find-today">
              <h3 id="find-today">
                Today’s deliveries <span className="h1-sub">{todayMatches.length}</span>
              </h3>
              {today === null ? (
                <Spinner label="Looking through today’s deliveries" />
              ) : todayMatches.length === 0 ? (
                <p className="muted small">None of today’s deliveries still to deliver match.</p>
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
                            <span className={`cell-strong${lead === 'order' ? ' lead-text' : ''}`}>{d.orderId}</span>
                            <span className="cell-sub">
                              Zone {d.zone ?? '—'} · <Lead on={lead === 'name'}>{d.recipientName ?? 'No recipient name'}</Lead>
                            </span>
                            <span className="cell-sub">
                              <Lead on={lead === 'address'}>
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
            <section aria-labelledby="find-mine">
              <h3 id="find-mine">
                My confirmations {mine.data && <span className="h1-sub">{mine.data.total}</span>}
              </h3>
              {mine.error ? (
                <Notice tone="info">{errorMessage(mine.error)} Today’s deliveries above still work without signal.</Notice>
              ) : !mine.data ? (
                <Spinner label="Searching your confirmations" />
              ) : mine.data.total === 0 ? (
                <p className="muted small">None of your confirmations match.</p>
              ) : (
                <>
                  <ConfirmationRows items={mine.data.items} timeZone={timeZone} showDate linkBase="/driver/confirmations" leadWithName={lead === 'name'} />
                  <Pager page={minePage} total={mine.data.total} pageSize={PAGE_SIZE} onPage={setMinePage} />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </form>
  );
}
