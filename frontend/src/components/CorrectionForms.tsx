import { useId, useState, type FormEvent } from 'react';
import { OUTCOME_DETAIL_MAX, RECEIVED_BY_MAX, REASON_MAX } from '../../../shared/schemas.ts';
import { DELIVERY_OUTCOMES, OUTCOME_LABELS, type ConfirmationDetail, type DeliveryOutcome } from '../../../shared/types.ts';
import { errorMessage, fieldIssues } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { Notice } from './ui.tsx';

function RequiredMark() {
  return (
    <>
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      <span className="visually-hidden"> (required)</span>
    </>
  );
}

/**
 * Correct a confirmation: the received-by name, the delivery outcome and the exception note. A reason is required.
 * The signature cannot be changed, so a record without one cannot be turned into "Delivered to recipient".
 */
export function CorrectionForm({
  confirmation: c,
  onDone,
  onCancel,
}: {
  confirmation: ConfirmationDetail;
  onDone: (updated: ConfirmationDetail) => void;
  onCancel: () => void;
}) {
  const [receivedBy, setReceivedBy] = useState(c.receivedBy);
  const [outcome, setOutcome] = useState<DeliveryOutcome>(c.outcome);
  const [detail, setDetail] = useState(c.outcomeDetail ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const ids = { name: useId(), outcome: useId(), detail: useId(), reason: useId() };
  const noSignature = c.signatureWidth === null && !c.paper;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!receivedBy.trim()) found.receivedBy = 'Enter who received it';
    if (outcome !== 'delivered_to_recipient' && !detail.trim()) found.outcomeDetail = 'Write the exception note';
    if (!reason.trim()) found.reason = 'Write why you are correcting this record';
    setIssues(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await dashboardApi.correct(c.id, {
        reason: reason.trim(),
        ...(receivedBy.trim() !== c.receivedBy ? { receivedBy: receivedBy.trim() } : {}),
        ...(outcome !== c.outcome ? { outcome } : {}),
        ...(outcome !== 'delivered_to_recipient' && detail.trim() !== (c.outcomeDetail ?? '') ? { outcomeDetail: detail.trim() } : {}),
      });
      onDone(res.confirmation);
    } catch (err) {
      setIssues(fieldIssues(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card edit-card no-print" onSubmit={onSubmit} noValidate aria-labelledby="correct-title">
      <h2 id="correct-title">Correct this record</h2>
      <p className="muted small">The original values stay on the record under “Changes”. The signature cannot be changed.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className={`field${issues.receivedBy ? ' field-invalid' : ''}`}>
        <label htmlFor={ids.name}>
          Received by
          <RequiredMark />
        </label>
        <input id={ids.name} value={receivedBy} maxLength={RECEIVED_BY_MAX} onChange={(e) => setReceivedBy(e.target.value)} />
        {issues.receivedBy && <p className="field-error">{issues.receivedBy}</p>}
      </div>
      <div className={`field${issues.outcome ? ' field-invalid' : ''}`}>
        <label htmlFor={ids.outcome}>Delivery</label>
        <select id={ids.outcome} value={outcome} onChange={(e) => setOutcome(e.target.value as DeliveryOutcome)}>
          {DELIVERY_OUTCOMES.map((o) => (
            <option key={o} value={o} disabled={o === 'delivered_to_recipient' && noSignature}>
              {OUTCOME_LABELS[o]}
              {o === 'delivered_to_recipient' && noSignature ? ' (needs a signature)' : ''}
            </option>
          ))}
        </select>
        {issues.outcome && <p className="field-error">{issues.outcome}</p>}
      </div>
      {outcome !== 'delivered_to_recipient' && (
        <div className={`field${issues.outcomeDetail ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.detail}>
            Exception note
            <RequiredMark />
          </label>
          <textarea id={ids.detail} rows={2} maxLength={OUTCOME_DETAIL_MAX} value={detail} onChange={(e) => setDetail(e.target.value)} />
          {issues.outcomeDetail && <p className="field-error">{issues.outcomeDetail}</p>}
        </div>
      )}
      <div className={`field${issues.reason ? ' field-invalid' : ''}`}>
        <label htmlFor={ids.reason}>
          Reason for the correction
          <RequiredMark />
        </label>
        <textarea
          id={ids.reason}
          rows={2}
          maxLength={REASON_MAX}
          value={reason}
          placeholder="e.g. The driver misspelled the name; the customer called to say it was left at the door"
          onChange={(e) => setReason(e.target.value)}
        />
        {issues.reason && <p className="field-error">{issues.reason}</p>}
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Void a confirmation (e.g. saved against the wrong order), with a required reason. */
export function VoidForm({
  confirmation: c,
  onDone,
  onCancel,
}: {
  confirmation: ConfirmationDetail;
  onDone: (updated: ConfirmationDetail) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!reason.trim()) return setError('Write why you are voiding this record.');
    setBusy(true);
    setError(null);
    try {
      onDone((await dashboardApi.voidConfirmation(c.id, reason.trim())).confirmation);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card edit-card is-danger no-print" onSubmit={onSubmit} noValidate aria-labelledby="void-title">
      <h2 id="void-title">Void this confirmation</h2>
      <p className="small">
        Use this when the confirmation is wrong as a whole, for example it was saved against the wrong order. It stays on file marked
        “Voided”, stops counting, and order <strong>{c.orderId}</strong> goes back to “Awaiting” so it can be confirmed again.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="field">
        <label htmlFor={reasonId}>
          Reason for voiding
          <RequiredMark />
        </label>
        <textarea id={reasonId} rows={2} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-danger" disabled={busy}>
          {busy ? 'Voiding…' : 'Void confirmation'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
