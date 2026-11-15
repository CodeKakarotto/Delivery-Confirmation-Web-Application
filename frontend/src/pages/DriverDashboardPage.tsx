import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi, driverApi } from '../api/endpoints.ts';
import { ConfirmationRows, Pager } from '../components/ConfirmationRows.tsx';
import { Field, Notice, Spinner } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

const PAGE_SIZE = 5;
const RECENT = 5;

/**
 * Driver dashboard: today's awaiting deliveries on the left (5 per page; tap one to confirm it), "Can't find the
 * order?" on the right, and the driver's most recent confirmations below. The list shows no street addresses; those
 * appear after opening an order. The page number lives in the URL, so Back returns to it.
 */
export function DriverDashboardPage() {
  const { user } = useAuth();
  const timeZone = useShopTimeZone();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('p')) || 1);
  const awaiting = useApi(() => driverApi.awaiting({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [page]);
  const recent = useApi(() => dashboardApi.list({ limit: RECENT }), []);
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | undefined>();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = orderId.trim();
    if (!id) return setError('Enter the order ID from the ticket');
    if (id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id)) return setError('Order IDs use letters, numbers and . _ # / -');
    navigate(`/confirm/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <div className="page-head">
        <h1>
          Dashboard
          {user && <span className="h1-sub">{user.displayName}</span>}
        </h1>
      </div>

      <div className="driver-grid">
        <section className="card awaiting-card driver-awaiting" aria-labelledby="awaiting-title">
          <div className="card-head-row">
            <h2 id="awaiting-title">
              Awaiting delivery
              {awaiting.data && <span className="h1-sub">{awaiting.data.total}</span>}
            </h2>
            <button type="button" className="btn btn-small btn-ghost" onClick={awaiting.reload} disabled={awaiting.loading}>
              Refresh
            </button>
          </div>
          {awaiting.data && <p className="muted small">{fullDayLabel(awaiting.data.date)}. Tap an order to confirm it.</p>}
          {awaiting.error ? (
            <Notice tone="error" title="Could not load today’s deliveries" action={<button type="button" className="btn btn-small" onClick={awaiting.reload}>Try again</button>}>
              {errorMessage(awaiting.error)}
            </Notice>
          ) : !awaiting.data ? (
            <Spinner label="Loading today’s deliveries" />
          ) : awaiting.data.total === 0 ? (
            <p className="muted">Every delivery scheduled for today is confirmed.</p>
          ) : awaiting.data.items.length === 0 ? (
            <p className="muted">
              No deliveries on this page.{' '}
              <button type="button" className="link-button" onClick={() => setParams({}, { replace: true })}>
                Go to page 1
              </button>
            </p>
          ) : (
            <ul className={`plain-list awaiting-list${awaiting.loading ? ' is-loading' : ''}`} aria-busy={awaiting.loading}>
              {awaiting.data.items.map((a) => (
                <li key={a.orderId}>
                  <Link to={`/confirm/${encodeURIComponent(a.orderId)}`} className="awaiting-row driver-stop">
                    <span className="stop-chip" aria-label={a.stopNumber ? `Stop ${a.stopNumber}` : 'No stop number'}>
                      {a.stopNumber ?? '—'}
                    </span>
                    <span className="driver-stop-main">
                      <span className="cell-strong">{a.orderId}</span>
                      <span className="cell-sub">
                        Zone {a.zone ?? '—'} · {a.recipientName ?? 'No recipient name'}, {a.city}
                      </span>
                    </span>
                    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className="row-chevron">
                      <path d="M7.5 5.5 12 10l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {awaiting.data && (
            <Pager page={page} total={awaiting.data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams(p > 1 ? { p: String(p) } : {})} />
          )}
        </section>

        <form className="card start-card driver-find" onSubmit={onSubmit} noValidate>
          <h2>Can’t find the order?</h2>
          <Field label="Enter the order ID" error={error} hint="Type the order or ticket number exactly as printed, e.g. MF-10482.">
            {(p) => (
              <input
                {...p}
                className="input-large"
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  setError(undefined);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={ORDER_ID_MAX}
              />
            )}
          </Field>
          <button type="submit" className="btn btn-primary btn-block btn-large">
            Open delivery
          </button>
        </form>
      </div>

      <section className="card confirmed-card" aria-labelledby="recent-title">
        <div className="card-head-row">
          <h2 id="recent-title">Recently confirmed</h2>
          <Link to="/driver/confirmations">All my confirmations</Link>
        </div>
        {recent.error ? (
          <Notice tone="error" title="Could not load your confirmations">{errorMessage(recent.error)}</Notice>
        ) : !recent.data ? (
          <Spinner label="Loading your confirmations" />
        ) : recent.data.items.length === 0 ? (
          <p className="muted">You have not confirmed any deliveries yet.</p>
        ) : (
          <ConfirmationRows items={recent.data.items} timeZone={timeZone} showDate linkBase="/driver/confirmations" />
        )}
      </section>
    </>
  );
}
