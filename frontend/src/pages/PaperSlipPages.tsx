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

/** Two blank paper slips per page, for when the app cannot be used. */
export function PrintSlipsPage() {
  const { user } = useAuth();
  return (
    <div className="slips-page">
      <div className="no-print">
        <BackButton fallback={user?.role === 'employee' ? '/shop/paper' : '/driver'} />
        <div className="page-head">
          <h1>Blank paper slips</h1>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
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

/** The paper backup in three steps, shown on both paper pages. */
function PaperSteps({ onForm = false }: { onForm?: boolean }) {
  return (
    <section className="paper-steps" aria-labelledby="paper-steps-title">
      <h2 id="paper-steps-title">If the app is down</h2>
      <ol>
        <li>
          <span className="paper-step-num" aria-hidden="true">1</span>
          <span>
            <strong>Print the paper slips</strong> and hand them to the driver before they leave. One slip per delivery; the customer signs it.
          </span>
        </li>
        <li>
          <span className="paper-step-num" aria-hidden="true">2</span>
          <span>
            <strong>When the driver returns</strong>, fill in {onForm ? 'the form below' : 'the form on the Paper slips page'} from each driver’s slip.
          </span>
        </li>
        <li>
          <span className="paper-step-num" aria-hidden="true">3</span>
          <span>
            <strong>Take a photo of the signed slip.</strong> It is required: it is the proof of the customer’s signature.
          </span>
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
  const [reference, setReference] = useState('Paper slip filed at the shop');
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
    if (!reference.trim()) found.paperReference = 'Say where the signed slip is filed';
    if (!photo) found.slipPhoto = 'Take or choose a photo of the signed slip';
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
      <p className="muted">Copy the slip exactly; the record is marked “Entered from paper”.</p>
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
            Received by
            <RequiredMark />
          </label>
          <input id={ids.name} value={receivedBy} maxLength={RECEIVED_BY_MAX} onChange={(e) => setReceivedBy(e.target.value)} />
          {issues.receivedBy && <p className="field-error">{issues.receivedBy}</p>}
        </div>

        <div className={`field${issues.deliveredAt ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.when}>
            Delivery date and time on the slip
            <RequiredMark />
          </label>
          <input id={ids.when} type="datetime-local" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
          {issues.deliveredAt && <p className="field-error">{issues.deliveredAt}</p>}
        </div>

        <div className={`field${issues.paperReference ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.ref}>
            Where the signed slip is filed
            <RequiredMark />
          </label>
          <input id={ids.ref} value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} />
          {issues.paperReference && <p className="field-error">{issues.paperReference}</p>}
        </div>

        <div className={`field${issues.slipPhoto ? ' field-invalid' : ''}`}>
          <label htmlFor={ids.photo}>
            Photo of the signed slip
            <RequiredMark />
          </label>
          <p className="field-hint">Lay the slip flat and make sure the signature can be read.</p>
          <input id={ids.photo} type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          {photoBusy && <p className="field-hint">Preparing the photo…</p>}
          {issues.slipPhoto && <p className="field-error">{issues.slipPhoto}</p>}
          {photo && (
            <div className="slip-photo-preview">
              <img src={photo} alt="Photo of the signed slip, ready to save" />
              <button type="button" className="btn btn-small btn-ghost-danger" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-large" disabled={busy || photoBusy}>
          {busy ? 'Saving…' : 'Save from paper slip'}
        </button>
      </form>
    </div>
  );
}
