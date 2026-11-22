import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { localDateKey } from '../../../shared/shopTime.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Pager } from '../components/ConfirmationRows.tsx';
import { DeliveryRows } from '../components/DeliveryRows.tsx';
import { SearchSuggest } from '../components/SearchSuggest.tsx';
import { EmptyState, Notice, Spinner } from '../components/ui.tsx';
import { anyTimeRange, orderSuggestions } from '../lib/orderSuggestions.ts';
import { PAGE_SIZE } from '../lib/paging.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

/**
 * Employees: find any delivery by part of its order ID, the recipient's name or the address. Suggestions appear as
 * you type; the results (newest first, 10 per page) highlight the text that matched. No filters: typing narrows it.
 * The search lives in the URL, so Back returns to it.
 */
export function ShopSearchPage() {
  const timeZone = useShopTimeZone();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('p')) || 1);
  const [text, setText] = useState(q);
  // A search typed in the menu bar while this page is open shows up in the box too.
  useEffect(() => setText(q), [q]);

  const today = localDateKey(new Date(), timeZone);
  const mmdd = today.slice(5, 7) + today.slice(8, 10);
  const results = useApi(
    () => (q ? dashboardApi.deliveries({ q, ...anyTimeRange(), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }) : Promise.resolve(null)),
    [q, page],
    { live: true },
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
            getSuggestions={orderSuggestions}
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
      </form>

      {q && (
        <section className="card confirmed-card" aria-label="Search results">
          <h2 className="results-title">
            Results for “{q}”
            {results.data && <span className="h1-sub">{results.data.total === 1 ? '1 delivery' : `${results.data.total} deliveries`}</span>}
          </h2>
          {results.error ? (
            <Notice tone="error" title="Could not search">
              {errorMessage(results.error)}
            </Notice>
          ) : !results.data ? (
            <Spinner label="Searching" />
          ) : results.data.total === 0 ? (
            <EmptyState title="No deliveries match your search.">Try part of the order ID, the recipient’s name or the address.</EmptyState>
          ) : (
            <div className={results.loading ? 'is-loading' : undefined}>
              <DeliveryRows items={results.data.items} timeZone={timeZone} showDate query={q} />
              <Pager page={page} total={results.data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams({ q, p: String(p) })} />
            </div>
          )}
        </section>
      )}
    </>
  );
}
