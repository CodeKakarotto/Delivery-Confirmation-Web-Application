import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Pager } from '../components/ConfirmationRows.tsx';
import { DeliveryRows } from '../components/DeliveryRows.tsx';
import { SearchSuggest, type Suggestion } from '../components/SearchSuggest.tsx';
import type { DeliveryListItem } from '../../../shared/types.ts';
import { EmptyState, Notice, Spinner } from '../components/ui.tsx';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';
import { localDateKey } from '../../../shared/shopTime.ts';
import { PAGE_SIZE } from '../lib/paging.ts';


const shortDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

/** What a suggestion shows and opens for one order (same places as the result rows). */
function toSuggestion(d: DeliveryListItem): Suggestion {
  const record = d.confirmation?.id ?? d.voidedConfirmationId;
  const tag: Suggestion['tag'] = d.voidedConfirmationId
    ? { text: 'Voided', tone: 'bad' }
    : d.status === 'confirmed'
      ? { text: 'Delivered', tone: 'ok' }
      : d.status === 'exception'
        ? { text: 'Exception', tone: 'warn' }
        : d.status === 'cancelled'
          ? { text: 'Cancelled', tone: 'quiet' }
          : { text: 'Awaiting', tone: 'quiet' };
  return {
    key: d.orderId,
    label: d.orderId,
    detail: [d.recipientName ?? 'No recipient name', d.city, shortDay(d.deliveryDate)].filter(Boolean).join(' · '),
    tag,
    to: record ? `/shop/confirmations/${record}` : `/shop/orders/${encodeURIComponent(d.orderId)}`,
  };
}

/** Employees: find deliveries on any day by order ID or recipient name (part of either is enough). */
export function ShopSearchPage() {
  const timeZone = useShopTimeZone();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const [text, setText] = useState(q);
  const navigate = useNavigate();
  // Examples built from today's date, so they match real orders (demo order IDs are MF-MMDD-NN).
  const today = localDateKey(new Date(), timeZone);
  const mmdd = today.slice(5, 7) + today.slice(8, 10);
  const todayWords = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const results = useApi(
    () => (q ? dashboardApi.deliveries({ q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }) : Promise.resolve(null)),
    [q, page],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim().slice(0, 100);
    setParams(value ? { q: value } : {});
  };

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
      </div>
      <p className="muted lead">Find any delivery (past, today or upcoming) and open its record.</p>
      <form className="card search-card" role="search" onSubmit={onSubmit} noValidate>
        <label htmlFor="shop-search" className="search-card-label">
          Order ID or recipient name
        </label>
        <div className="search-form">
          <SearchSuggest
            value={text}
            onChange={setText}
            getSuggestions={async (s) => (await dashboardApi.deliveries({ q: s, limit: 6 })).items.map(toSuggestion)}
            onPick={(s) => navigate(s.to)}
            inputProps={{
              id: 'shop-search',
              type: 'search',
              className: 'input-large',
              placeholder: `e.g. MF-${mmdd}-04 or Avery`,
              spellCheck: false,
              maxLength: 100,
            }}
          />
          <button type="submit" className="btn btn-primary btn-large">
            Search
          </button>
        </div>
        <div className="search-help">
          <p className="search-help-title">What you can search for</p>
          <ul>
            <li>
              <strong>Order ID</strong> from the ticket or FTD, e.g. <code>MF-{mmdd}-04</code>. Part of it is enough: <code>{mmdd}</code> finds every order from {todayWords}.
            </li>
            <li>
              <strong>Recipient’s name</strong>, first or last, e.g. <code>Avery</code> or <code>Demo</code>.
            </li>
          </ul>
          <p className="search-help-note">Capital letters do not matter. Use this when a customer calls to ask about an order.</p>
        </div>
      </form>
      {q && (
        <section className="card confirmed-card" aria-label="Search results">
          <h2 className="results-title">Results for “{q}”</h2>
          {results.error ? (
            <Notice tone="error" title="Could not search">{errorMessage(results.error)}</Notice>
          ) : !results.data ? (
            <Spinner label="Searching" />
          ) : results.data.total === 0 ? (
            <EmptyState title="No deliveries match.">Try part of the order ID or the recipient’s name.</EmptyState>
          ) : (
            <div className={results.loading ? 'is-loading' : undefined}>
              <DeliveryRows items={results.data.items} timeZone={timeZone} showDate />
              <Pager page={page} total={results.data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams({ q, p: String(p) })} />
            </div>
          )}
        </section>
      )}
    </>
  );
}
