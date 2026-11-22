import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import type { DriverDelivery } from '../../../shared/types.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { useOffline } from '../lib/offline.tsx';
import { rankToday } from '../lib/orderSuggestions.ts';
import { useApi, useDebounced } from '../lib/useApi.ts';
import { useLoadToday } from '../lib/useLoadToday.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';
import { ConfirmationRows } from './ConfirmationRows.tsx';
import { Match } from './Match.tsx';
import { Field, Spinner } from './ui.tsx';

/** How many matches each list shows; typing more narrows them down. */
const SHOWN = 5;

const more = (shown: number, total: number) =>
  total > shown ? <p className="muted small find-more">{`Showing ${shown} of ${total}. Type more to narrow it down.`}</p> : null;

/**
 * Drivers' "Can't find the order?": type part of an order ID, a recipient's name or an address and the matches appear
 * right underneath (today's deliveries, from the copy on the phone so it works with no signal, then the driver's own
 * confirmations), with the matching text highlighted. "Open delivery" opens any order by its exact ID.
 */
export function DriverFind() {
  const navigate = useNavigate();
  const offline = useOffline();
  const loadToday = useLoadToday();
  const timeZone = useShopTimeZone();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const q = useDebounced(text.trim().slice(0, 100), 200);

  const [today, setToday] = useState<DriverDelivery[] | null>(null);
  useEffect(() => {
    void loadToday()
      .then(setToday)
      .catch(() => setToday([]));
  }, [loadToday, offline.sentVersion]);
  const waiting = new Set(offline.items.filter((i) => i.state === 'waiting').map((i) => i.payload.orderId.toLowerCase()));
  const todayMatches = useMemo(() => (q ? rankToday(today ?? [], q, 'order') : []), [today, q]);
  const mine = useApi(() => (q ? dashboardApi.list({ q, limit: SHOWN }) : Promise.resolve(null)), [q, offline.sentVersion], { live: true });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = text.trim();
    if (!id) return setError('Enter the order ID from the ticket.');
    if (id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id)) return setError('Order IDs use only letters, numbers and . _ # / -');
    navigate(`/confirm/${encodeURIComponent(id)}`);
  };

  return (
    <form className="card start-card driver-find" onSubmit={onSubmit} noValidate>
      <h2>Can’t find the order?</h2>
      <Field label="Order ID, name or address" error={error} hint="Matches appear below as you type. Tap one to open it.">
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

      {q && (
        <div className="driver-find-results" aria-live="polite">
          <section aria-labelledby="find-today">
            <h3 id="find-today">Today’s deliveries</h3>
            {today === null ? (
              <Spinner label="Searching today’s deliveries" />
            ) : todayMatches.length === 0 ? (
              <p className="muted small">No deliveries left today match your search.</p>
            ) : (
              <>
                <ul className="plain-list awaiting-list">
                  {todayMatches.slice(0, SHOWN).map((d) => (
                    <li key={d.orderId}>
                      <Link to={`/confirm/${encodeURIComponent(d.orderId)}`} className="awaiting-row driver-stop">
                        <span className="stop-chip" aria-label={d.stopNumber ? `Stop ${d.stopNumber}` : 'No stop number'}>
                          {d.stopNumber ?? '—'}
                        </span>
                        <span className="driver-stop-main">
                          <span className="cell-strong">
                            <Match text={d.orderId} q={q} />
                          </span>
                          <span className="cell-sub">
                            Zone {d.zone ?? '—'} · <Match text={d.recipientName ?? 'No recipient name'} q={q} />
                          </span>
                          <span className="cell-sub">
                            <Match text={`${d.addressLine}, ${d.city} ${d.postalCode}`} q={q} />
                          </span>
                        </span>
                        {waiting.has(d.orderId.toLowerCase()) && <span className="tag tag-warn">Saved on phone</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
                {more(SHOWN, todayMatches.length)}
              </>
            )}
          </section>
          <section aria-labelledby="find-mine">
            <h3 id="find-mine">My confirmations</h3>
            {mine.error ? (
              <p className="muted small">Your confirmations can’t be searched right now. Today’s deliveries above can still be searched without signal.</p>
            ) : !mine.data ? (
              <Spinner label="Searching your confirmations" />
            ) : mine.data.total === 0 ? (
              <p className="muted small">None of your confirmations match your search.</p>
            ) : (
              <>
                <ConfirmationRows items={mine.data.items} timeZone={timeZone} showDate linkBase="/driver/confirmations" query={q} />
                {more(mine.data.items.length, mine.data.total)}
              </>
            )}
          </section>
        </div>
      )}
    </form>
  );
}
