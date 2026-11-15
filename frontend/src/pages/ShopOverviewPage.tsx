import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Notice, Spinner } from '../components/ui.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';

/** The day at a glance: scheduled vs confirmed, and the orders still waiting (each can be opened). */
export function ShopOverviewPage() {
  const [params, setParams] = useSearchParams();
  const chosen = params.get('date') || undefined;
  const summary = useApi(() => dashboardApi.summary(chosen), [chosen]);
  const s = summary.data;

  return (
    <>
      <div className="page-head dash-head">
        <h1>Overview</h1>
        <label className="date-pick">
          <span className="visually-hidden">Delivery date</span>
          <input
            type="date"
            value={s?.date ?? chosen ?? ''}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set('date', e.target.value);
              else next.delete('date');
              setParams(next, { replace: true });
            }}
          />
        </label>
      </div>
      {summary.error ? (
        <Notice tone="error" title="Could not load the day’s summary" action={<button type="button" className="btn btn-small" onClick={summary.reload}>Try again</button>}>
          {errorMessage(summary.error)}
        </Notice>
      ) : !s ? (
        <Spinner label="Loading the day’s summary" />
      ) : (
        <>
          <h2 className="day-title">{fullDayLabel(s.date)}</h2>
          <div className="figures dash-stats">
            <div className="figure">
              <span className="figure-value">{s.expected}</span>
              <span className="figure-label">Scheduled deliveries</span>
            </div>
            <div className="figure figure-ok">
              <span className="figure-value">{s.confirmed}</span>
              <span className="figure-label">Delivered to recipient</span>
            </div>
            <div className={`figure${s.needsReview ? ' figure-warn' : ''}`}>
              <span className="figure-value">{s.needsReview}</span>
              <span className="figure-label">Exceptions to review</span>
            </div>
            <div className={`figure${s.awaiting.length && s.isPast ? ' figure-error' : ''}`}>
              <span className="figure-value">{s.awaiting.length}</span>
              <span className="figure-label">{s.isPast ? 'Missing confirmations' : 'Not yet confirmed'}</span>
            </div>
            <div className={`figure${s.flagged ? ' figure-error' : ''}`}>
              <span className="figure-value">{s.flagged}</span>
              <span className="figure-label">Flagged duplicates</span>
            </div>
          </div>

          <section className="card awaiting-card" aria-labelledby="awaiting-title">
            <div className="card-head-row">
              <h3 id="awaiting-title">
                {s.isPast ? 'Missing confirmations' : 'Awaiting confirmation'}
                <span className="h1-sub">{s.awaiting.length}</span>
              </h3>
              <Link to="/shop/confirmations">All confirmations</Link>
            </div>
            {s.isPast && s.awaiting.length > 0 && (
              <p className="muted small">These orders were scheduled for this day and have no saved confirmation.</p>
            )}
            {s.awaiting.length === 0 ? (
              <p className="muted">Every scheduled order for this day has a confirmation.</p>
            ) : (
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
            )}
          </section>
        </>
      )}
    </>
  );
}
