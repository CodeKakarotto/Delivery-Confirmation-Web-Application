import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { OUTCOME_LABELS } from '../../../shared/types.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { EmptyState, FlagTag, Notice, ResultTag, Segmented, Spinner } from '../components/ui.tsx';
import { localDateTime } from '../lib/time.ts';
import { useApi } from '../lib/useApi.ts';

type View = 'all' | 'needs_review' | 'flagged';
const PAGE = 25;

/** Today's date (UTC, the date the server uses for "expected" deliveries). */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Employee confirmation dashboard: the day's expected deliveries compared with saved confirmations, an exact order-ID
 * search, and the list of confirmation records with review flags.
 */
export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayKey();
  const orderId = params.get('orderId') ?? '';
  const view = (params.get('view') as View | null) ?? 'all';
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const [search, setSearch] = useState(orderId);
  const [searchError, setSearchError] = useState<string | null>(null);

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const summary = useApi(() => dashboardApi.summary(date), [date]);
  const list = useApi(
    () =>
      dashboardApi.list({
        orderId: orderId || undefined,
        result: view === 'needs_review' ? 'needs_review' : undefined,
        flagged: view === 'flagged',
        limit: PAGE,
        offset,
      }),
    [orderId, view, offset],
  );

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const id = search.trim();
    if (id && (id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id))) {
      setSearchError('Enter a complete order ID, e.g. MF-10482');
      return;
    }
    setSearchError(null);
    setParam({ orderId: id || null, offset: null });
  };

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
                setParam({ orderId: null, offset: null });
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

      <Notice tone="warn" title="Not protected by a sign-in">
        This dashboard cannot check who is viewing it, because the prototype has no login. It only runs in the local demonstration with
        synthetic data. Do not use it with real customer information until the shop approves an access model.
      </Notice>

      <section className="dash-day" aria-labelledby="day-title">
        <div className="card-head-row">
          <h2 id="day-title">Deliveries for the day</h2>
          <label className="date-pick">
            <span className="visually-hidden">Delivery date</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setParam({ date: e.target.value })} />
          </label>
        </div>
        {summary.error ? (
          <Notice tone="error" title="Could not load the day’s summary" action={<button type="button" className="btn btn-small" onClick={summary.reload}>Try again</button>}>
            {errorMessage(summary.error)}
          </Notice>
        ) : !summary.data ? (
          <Spinner label="Loading the day’s summary" />
        ) : (
          <>
            <div className="figures dash-stats">
              <div className="figure">
                <span className="figure-value">{summary.data.expected}</span>
                <span className="figure-label">Scheduled deliveries</span>
              </div>
              <div className="figure figure-ok">
                <span className="figure-value">{summary.data.confirmed}</span>
                <span className="figure-label">Delivered to recipient</span>
              </div>
              <div className={`figure${summary.data.needsReview ? ' figure-warn' : ''}`}>
                <span className="figure-value">{summary.data.needsReview}</span>
                <span className="figure-label">Exceptions to review</span>
              </div>
              <div className={`figure${summary.data.awaiting.length && summary.data.isPast ? ' figure-error' : ''}`}>
                <span className="figure-value">{summary.data.awaiting.length}</span>
                <span className="figure-label">{summary.data.isPast ? 'Missing confirmations' : 'Not yet confirmed'}</span>
              </div>
              <div className={`figure${summary.data.flagged ? ' figure-error' : ''}`}>
                <span className="figure-value">{summary.data.flagged}</span>
                <span className="figure-label">Flagged duplicates</span>
              </div>
            </div>
            {summary.data.awaiting.length > 0 && (
              <section className="card awaiting-card" aria-labelledby="awaiting-title">
                <h3 id="awaiting-title">
                  {summary.data.isPast ? 'Missing confirmations' : 'Not yet confirmed'}
                  <span className="h1-sub">{summary.data.awaiting.length}</span>
                </h3>
                {summary.data.isPast && (
                  <p className="muted small">These orders were scheduled for this day and have no saved confirmation.</p>
                )}
                <ul className="plain-list">
                  {summary.data.awaiting.map((a) => (
                    <li key={a.orderId} className="plain-row">
                      <div>
                        <span className="cell-strong">{a.orderId}</span>
                        <span className="cell-sub">
                          # {a.stopNumber ?? '—'} · Zone {a.zone ?? '—'} · {a.recipientName ?? 'No recipient name'}, {a.city}
                        </span>
                      </div>
                      <span className={`tag ${summary.data!.isPast ? 'tag-not-verified' : 'tag-quiet'}`}>
                        {summary.data!.isPast ? 'Missing' : 'Awaiting'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>

      <section className="card table-card" aria-labelledby="records-title">
        <div className="card-head-row records-head">
          <h2 id="records-title">{orderId ? `Order ${orderId}` : 'Saved confirmations'}</h2>
          {!orderId && (
            <Segmented<View>
              label="Show"
              value={view}
              onChange={(v) => setParam({ view: v === 'all' ? null : v, offset: null })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'needs_review', label: 'Needs review' },
                { value: 'flagged', label: 'Flagged' },
              ]}
            />
          )}
        </div>
        {list.error ? (
          <Notice tone="error" title="Could not load confirmations" action={<button type="button" className="btn btn-small" onClick={list.reload}>Try again</button>}>
            {errorMessage(list.error)}
          </Notice>
        ) : !list.data ? (
          <Spinner label="Loading confirmations" />
        ) : list.data.items.length === 0 ? (
          <EmptyState title={orderId ? `No saved confirmation for order ${orderId}.` : 'No confirmations to show.'}>
            {orderId ? 'Check the order ID. Search needs the complete ID; letter case does not matter.' : null}
          </EmptyState>
        ) : (
          <>
            <table className="table table-rows-link">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col" className="num">#</th>
                  <th scope="col">Zone</th>
                  <th scope="col">Received by</th>
                  <th scope="col">Delivery exception</th>
                  <th scope="col">Result</th>
                  <th scope="col">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Order">
                      <Link to={`/dashboard/confirmations/${c.id}`} className="cell-strong">
                        {c.orderId}
                      </Link>
                      {c.recipientName && <span className="cell-sub">For {c.recipientName}</span>}
                    </td>
                    <td data-label="#" className="num">{c.stopNumber ?? '—'}</td>
                    <td data-label="Zone">{c.zone ?? '—'}</td>
                    <td data-label="Received by">{c.receivedBy}</td>
                    <td data-label="Delivery exception">{OUTCOME_LABELS[c.outcome]}</td>
                    <td data-label="Result">
                      <span className="row-tags">
                        <ResultTag result={c.result} />
                        <FlagTag count={c.attemptCount} conflict={c.hasConflict} />
                      </span>
                    </td>
                    <td data-label="Confirmed">
                      <time dateTime={c.confirmedAt}>{localDateTime(c.confirmedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data.total > PAGE && (
              <div className="pager">
                <button type="button" className="btn btn-small" disabled={offset === 0} onClick={() => setParam({ offset: String(Math.max(0, offset - PAGE)) || null })}>
                  Previous
                </button>
                <span className="muted small">
                  {offset + 1}–{Math.min(offset + PAGE, list.data.total)} of {list.data.total}
                </span>
                <button type="button" className="btn btn-small" disabled={offset + PAGE >= list.data.total} onClick={() => setParam({ offset: String(offset + PAGE) })}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
