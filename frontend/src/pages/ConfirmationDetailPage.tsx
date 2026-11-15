import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { OUTCOME_LABELS } from '../../../shared/types.ts';
import { ApiRequestError, errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { BackButton } from '../components/BackButton.tsx';
import { useAuth } from '../lib/auth.tsx';
import { Brand } from '../components/Layout.tsx';
import { SavedConfirmationCard } from '../components/SavedConfirmationCard.tsx';
import { FlagTag, Notice, Spinner } from '../components/ui.tsx';
import { shopDateTime } from '../lib/time.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

/** One saved confirmation, in the required field order, ready to print. */
export function ConfirmationDetailPage() {
  const { id = '' } = useParams();
  const detail = useApi(() => dashboardApi.detail(id), [id]);
  const timeZone = useShopTimeZone();
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null);
  useEffect(() => {
    if (detail.data) setRetrievedAt(new Date().toISOString());
  }, [detail.data]);

  const { user } = useAuth();
  const back = <BackButton fallback={user?.role === 'driver' ? '/driver/confirmations' : '/shop'} />;
  if (detail.error) {
    const notFound = detail.error instanceof ApiRequestError && detail.error.status === 404;
    return (
      <>
        {back}
        <Notice tone="error" title={notFound ? 'Confirmation not found' : 'Could not load the confirmation'}>
          {errorMessage(detail.error)}
        </Notice>
      </>
    );
  }
  if (!detail.data) return <Spinner label="Loading the confirmation" />;
  const c = detail.data.confirmation;

  return (
    <div className="detail-page">
      {back}
      {/* Paper only: logo, what this is, and that it was read back from the server. */}
      <div className="print-only print-header">
        <Brand subtitle="Delivery confirmation record" />
        <p className="print-note">
          Retrieved from the confirmation database {retrievedAt ? `on ${shopDateTime(retrievedAt, timeZone)}` : ''}. Record {c.id}.
        </p>
      </div>
      <div className="page-head">
        <div>
          <h1>
            Order {c.orderId}
            <span className="h1-sub">confirmation</span>
          </h1>
          {c.confirmedBy && <p className="muted small confirmed-by">Confirmed by {c.confirmedBy}</p>}
        </div>
        <div className="actions no-print">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {c.attemptCount > 0 && (
        <Notice tone="error" title="Flagged for review">
          <span className="row-tags">
            <FlagTag count={c.attemptCount} conflict={c.hasConflict} />
          </span>
          <p className="small">
            {c.attemptCount === 1 ? 'Another submission' : `${c.attemptCount} other submissions`} for this order {c.attemptCount === 1 ? 'was' : 'were'} refused
            because this confirmation was already saved. The saved record below was not changed.
          </p>
          <ul className="attempt-list">
            {c.attempts.map((a, i) => (
              <li key={i}>
                {shopDateTime(a.createdAt, timeZone)}: {a.kind === 'conflict' ? 'different details' : 'same details sent again'}
                {a.receivedBy ? `, received by ${a.receivedBy}` : ''}
                {a.outcome ? `, ${OUTCOME_LABELS[a.outcome]}` : ''}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      {c.result === 'needs_review' && (
        <Notice tone="warn" title="Delivery exception">
          The order was not handed to the recipient ({OUTCOME_LABELS[c.outcome].toLowerCase()}). Review it before treating the delivery as
          complete.
        </Notice>
      )}

      <SavedConfirmationCard
        delivery={c.delivery}
        outcome={c.outcome}
        outcomeDetail={c.outcomeDetail}
        note={c.note}
        receivedBy={c.receivedBy}
        signatureSrc={dashboardApi.signatureUrl(c.id)}
        signatureWidth={c.signatureWidth}
        signatureHeight={c.signatureHeight}
        result={c.result}
        confirmedAt={c.confirmedAt}
        timeZone={timeZone}
      />
    </div>
  );
}
