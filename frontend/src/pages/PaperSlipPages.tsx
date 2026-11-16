import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { OUTCOME_DETAIL_MAX, ORDER_ID_MAX, ORDER_ID_PATTERN, RECEIVED_BY_MAX } from '../../../shared/schemas.ts';
import { DELIVERY_OUTCOMES, OUTCOME_LABELS, type DeliveryOutcome } from '../../../shared/types.ts';
import { errorMessage, fieldIssues } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { BackButton } from '../components/BackButton.tsx';
import { PaperSlip } from '../components/PaperSlip.tsx';
import { Notice } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { prepareSlipPhoto } from '../lib/photo.ts';

/** Two blank paper slips per page: print a stack ahead of time, for when the app cannot be used. */
export function PrintSlipsPage() {
  const { user } = useAuth();
  return (
    <div className="slips-page">
      <div className="no-print">
        <BackButton fallback={user?.role === 'employee' ? '/shop/paper' : '/driver'} />
        <div className="page-head">
          <h1>Blank paper slips</h1>
          <div className="actions">
            <a className="btn" href={SLIP_PDF} download>
              Save a copy (PDF)
            </a>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
        <PaperSteps />
      </div>
      <div className="slips">
        <PaperSlip />
        <PaperSlip />
      </div>
    </div>
  );
}

/** Where the blank slip PDF is served from (frontend/public): it opens and prints without the app. */
export const SLIP_PDF = '/michaels-flowers-paper-slip.pdf';

/** The paper backup in three plain steps (written for people who are not "tech people"). */
function PaperSteps({ onForm = false }: { onForm?: boolean }) {
  return (
    <section className="paper-steps" aria-labelledby="paper-steps-title">
      <h2 id="paper-steps-title">App not working? Use paper.</h2>
      <ol>
        <li>
          <span className="paper-step-num" aria-hidden="true">1</span>
          <span>Keep a few blank slips in every van.</span>
        </li>
        <li>
          <span className="paper-step-num" aria-hidden="true">2</span>
          <span>The driver fills in a slip, and the customer signs it.</span>
        </li>
        <li>
          <span className="paper-step-num" aria-hidden="true">3</span>
          <span>{onForm ? 'Back at the shop, type the slip in below and take a picture of it.' : 'Back at the shop, type each slip in on the Paper slips page.'}</span>
        </li>
      </ol>
    </section>
  );
}

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

/** "YYYY-MM-DDTHH:MM" in this computer's time, for the date-time field's default (now). */
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Employees: type in a delivery from a paper slip. It is saved marked "Entered from paper". */
export function PaperEntryPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState(params.get('order') ?? '');
  const [outcome, setOutcome] = useState<DeliveryOutcome | null>(null);
  const [detail, setDetail] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveredAt, setDeliveredAt] = useState(nowLocalInput());
  // Where the signed paper slip is kept; the shop does not need to type it.
  const reference = 'Paper slip filed at the shop';
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const keyRef = useRef(crypto.randomUUID());
  const ids = { order: useId(), detail: useId(), name: useId(), when: useId(), ref: useId(), photo: useId(), outcome: useId() };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setIssues((i) => ({ ...i, slipPhoto: '' }));
    try {
      setPhoto(await prepareSlipPhoto(file));
    } catch (err) {
      setIssues((i) => ({ ...i, slipPhoto: errorMessage(err) }));
    } finally {
      setPhotoBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    const id = orderId.trim();
    if (!id || id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id)) found.orderId = 'Enter the order ID from the slip';
    if (!outcome) found.outcome = 'Tick how it was delivered, as on the slip';
    if (outcome && outcome !== 'delivered_to_recipient' && !detail.trim()) found.outcomeDetail = 'Write the exception note from the slip';
    if (!receivedBy.trim()) found.receivedBy = 'Enter who received it';
    const when = new Date(deliveredAt);
    if (!deliveredAt || Number.isNaN(when.getTime())) found.deliveredAt = 'Enter the date and time from the slip';
    else if (when.getTime() > Date.now() + 5 * 60_000) found.deliveredAt = 'The time on the slip cannot be in the future';
    if (!photo) found.slipPhoto = 'Take a picture of the signed slip';
    setIssues(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await dashboardApi.paperConfirm({
        orderId: id,
        receivedBy: receivedBy.trim(),
        outcome: outcome!,
        ...(outcome !== 'delivered_to_recipient' ? { outcomeDetail: detail.trim() } : {}),
        deliveredAt: when.toISOString(),
        paperReference: reference.trim(),
        slipPhoto: photo!,
        idempotencyKey: keyRef.current,
      });
      navigate(`/shop/confirmations/${res.confirmation.id}`, { replace: true });
    } catch (err) {
      setIssues(fieldIssues(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow-wide">
      <BackButton fallback="/shop" />
      <div className="page-head">
        <h1>Paper slips</h1>
        <Link to="/shop/paper/print" className="btn btn-primary">
          Print blank slips
        </Link>
      </div>
      <PaperSteps onForm />
      {error && <Notice tone="error">{error}</Notice>}
      <form className="card paper-form" onSubmit={onSubmit} noValidate>
        <div className={`field${issues.orderId ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.order}>
            Order ID
            <RequiredMark />
          </label>
          <input id={ids.order} className="input-large" value={orderId} maxLength={ORDER_ID_MAX} autoComplete="off" onChange={(e) => setOrderId(e.target.value)} />
          {issues.orderId && <p className="field-error">{issues.orderId}</p>}
        </div>

        <fieldset className={`field paper-outcomes${issues.outcome ? ' field-invalid' : ''}`}>
          <legend id={ids.outcome}>
            How was it delivered?
            <RequiredMark />
          </legend>
          {DELIVERY_OUTCOMES.map((o) => (
            <label key={o} className={`exception-option${outcome === o ? ' is-active' : ''}${o === 'delivered_to_recipient' ? '' : ' is-exception'}`}>
              <input type="radio" name="paper-outcome" checked={outcome === o} onChange={() => setOutcome(o)} />
              <span>{OUTCOME_LABELS[o]}</span>
            </label>
          ))}
          {issues.outcome && <p className="field-error">{issues.outcome}</p>}
        </fieldset>

        {outcome && outcome !== 'delivered_to_recipient' && (
          <div className={`field${issues.outcomeDetail ? ' field-invalid' : ''}`}>
            <label htmlFor={ids.detail}>
              Exception note
              <RequiredMark />
            </label>
            <textarea id={ids.detail} rows={2} maxLength={OUTCOME_DETAIL_MAX} value={detail} onChange={(e) => setDetail(e.target.value)} />
            {issues.outcomeDetail && <p className="field-error">{issues.outcomeDetail}</p>}
          </div>
        )}

        <div className={`field${issues.receivedBy ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.name}>
            Who received it?
            <RequiredMark />
          </label>
          <input id={ids.name} value={receivedBy} maxLength={RECEIVED_BY_MAX} onChange={(e) => setReceivedBy(e.target.value)} />
          {issues.receivedBy && <p className="field-error">{issues.receivedBy}</p>}
        </div>

        <div className={`field${issues.deliveredAt ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.when}>
            When was it delivered?
            <RequiredMark />
          </label>
          <input id={ids.when} type="datetime-local" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
          {issues.deliveredAt && <p className="field-error">{issues.deliveredAt}</p>}
        </div>

        <div className={`field${issues.slipPhoto ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.photo}>
            Picture of the signed slip
            <RequiredMark />
          </label>
          <p className="field-hint">Make sure the signature shows clearly.</p>
          <input
            id={ids.photo}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
          {!photo && (
            <label htmlFor={ids.photo} className="btn btn-large photo-btn">
              Take a picture
            </label>
          )}
          {photoBusy && <p className="field-hint">Getting the picture ready…</p>}
          {issues.slipPhoto && <p className="field-error">{issues.slipPhoto}</p>}
          {photo && (
            <div className="slip-photo-preview">
              <img src={photo} alt="Photo of the signed slip, ready to save" />
              <button type="button" className="btn btn-small btn-ghost-danger" onClick={() => setPhoto(null)}>
                Take it again
              </button>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-large" disabled={busy || photoBusy}>
          {busy ? 'Saving…' : 'Save slip'}
        </button>
      </form>
    </div>
  );
}
