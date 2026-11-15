import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { errorMessage } from '../api/client.ts';
import { driverApi } from '../api/endpoints.ts';
import { BackButton } from '../components/BackButton.tsx';
import { Field, Notice, Spinner } from '../components/ui.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { useApi } from '../lib/useApi.ts';

/**
 * Driver home: today's deliveries still awaiting confirmation (tap one to confirm it), and an order-ID box for an
 * order that is not on the list. The list shows no street addresses; those appear after opening an order.
 */
export function DriverStartPage() {
  const navigate = useNavigate();
  const awaiting = useApi(() => driverApi.awaiting(), []);
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
    <div className="narrow">
      <BackButton fallback="/" always label="Back to home" />
      <div className="page-head">
        <h1>Confirm a delivery</h1>
      </div>

      <section className="card awaiting-card driver-awaiting" aria-labelledby="awaiting-title">
        <div className="card-head-row">
          <h2 id="awaiting-title">
            Awaiting delivery
            {awaiting.data && <span className="h1-sub">{awaiting.data.items.length}</span>}
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
        ) : awaiting.data.items.length === 0 ? (
          <p className="muted">Every delivery scheduled for today is confirmed.</p>
        ) : (
          <ul className="plain-list awaiting-list">
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
      </section>

      <form className="card start-card" onSubmit={onSubmit} noValidate>
        <Field label="Not on the list? Enter the order ID" error={error} hint="Type the order or ticket number exactly as printed, e.g. MF-10482.">
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
  );
}
