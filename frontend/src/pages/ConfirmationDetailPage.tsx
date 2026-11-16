import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { OUTCOME_LABELS, type ConfirmationDetail } from '../../../shared/types.ts';
import { ApiRequestError, errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { BackButton } from '../components/BackButton.tsx';
import { CorrectionHistory } from '../components/CorrectionHistory.tsx';
import { CorrectionForm, UnvoidForm, VoidForm } from '../components/CorrectionForms.tsx';
import { RecordActions, type RecordEdit } from '../components/RecordActions.tsx';
import { Brand } from '../components/Layout.tsx';
import { SavedConfirmationCard } from '../components/SavedConfirmationCard.tsx';
import { FlagTag, Notice, Spinner } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { shopDateTime } from '../lib/time.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

/**
 * One saved confirmation, in the required field order, ready to print. Employees can correct it or void it (with a
 * reason); every change is listed under "Changes" with the original values.
 */
export function ConfirmationDetailPage() {
  const { id = '' } = useParams();
  const detail = useApi(() => dashboardApi.detail(id), [id]);
  const timeZone = useShopTimeZone();
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordEdit | null>(null);
  useEffect(() => {
    if (detail.data) setRetrievedAt(new Date().toISOString());
  }, [detail.data]);

  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const back = <BackButton fallback={isEmployee ? '/shop' : '/driver/confirmations'} />;
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
  const done = (updated: ConfirmationDetail) => {
    detail.mutate({ confirmation: updated });
    setEditing(null);
  };

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
          <p className="muted small confirmed-by">
            {c.paper ? `Entered from a paper slip by ${c.paper.enteredBy ?? 'an employee'}` : c.confirmedBy ? `Confirmed by ${c.confirmedBy}` : null}
          </p>
          <div className="row-tags">
            {c.voided && <span className="tag tag-status-cancelled">Voided</span>}
            {c.corrected && <span className="tag tag-warn">Corrected</span>}
            {c.paper && <span className="tag tag-demo">Entered from paper</span>}
          </div>
        </div>
        {isEmployee ? (
          <RecordActions voided={Boolean(c.voided)} editing={editing} onEdit={setEditing} onPrint={() => window.print()} />
        ) : (
          <div className="actions no-print">
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
        )}
      </div>

      {editing === 'correct' && <CorrectionForm confirmation={c} onDone={done} onCancel={() => setEditing(null)} />}
      {editing === 'void' && !c.voided && <VoidForm confirmation={c} onDone={done} onCancel={() => setEditing(null)} />}
      {editing === 'unvoid' && c.voided && <UnvoidForm confirmation={c} onDone={done} onCancel={() => setEditing(null)} />}

      {c.voided && (
        <Notice tone="error" title="This confirmation was voided">
          Voided by {c.voided.by ?? 'an employee'} on {shopDateTime(c.voided.at, timeZone)}. Reason: {c.voided.reason}. It no longer counts; the order
          can be confirmed again. If this was a mistake, use “Undo void”.
        </Notice>
      )}
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
      {c.result === 'needs_review' && !c.voided && (
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
        signatureSrc={c.signatureWidth === null ? null : dashboardApi.signatureUrl(c.id)}
        signatureWidth={c.signatureWidth ?? undefined}
        signatureHeight={c.signatureHeight ?? undefined}
        result={c.result}
        confirmedAt={c.confirmedAt}
        timeZone={timeZone}
      />

      {c.paper && (
        <section className="card paper-card" aria-labelledby="paper-title">
          <h2 id="paper-title">Paper slip</h2>
          <dl className="dc-meta paper-meta">
            <div>
              <dt>Delivery time on the slip</dt>
              <dd>{shopDateTime(c.paper.reportedDeliveredAt, timeZone)}</dd>
            </div>
            <div>
              <dt>Entered into the app</dt>
              <dd>
                {shopDateTime(c.confirmedAt, timeZone)} by {c.paper.enteredBy ?? 'an employee'}
              </dd>
            </div>
            <div>
              <dt>Signed slip filed</dt>
              <dd>{c.paper.reference}</dd>
            </div>
          </dl>
          {c.paper.hasPhoto && (
            <figure className="slip-photo">
              <img src={dashboardApi.slipPhotoUrl(c.id)} alt={`Photo of the signed paper slip for order ${c.orderId}`} />
              <figcaption className="muted small">Photo of the signed paper slip</figcaption>
            </figure>
          )}
        </section>
      )}

      {c.corrections.length > 0 && (
        <section className="card corrections-card" aria-labelledby="changes-title">
          <h2 id="changes-title">Changes</h2>
          <p className="muted small">Every change to this record, with the original values crossed out.</p>
          <CorrectionHistory items={c.corrections} timeZone={timeZone} />
        </section>
      )}
    </div>
  );
}
