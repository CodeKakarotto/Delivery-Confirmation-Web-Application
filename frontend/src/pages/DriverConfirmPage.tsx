import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { NOTE_MAX, RECEIVED_BY_MAX } from '../../../shared/schemas.ts';
import { OUTCOME_LABELS, type ConfirmationReceipt, type ConfirmationSubmit, type DriverDelivery } from '../../../shared/types.ts';
import { ApiRequestError, errorMessage, fieldIssues } from '../api/client.ts';
import { driverApi } from '../api/endpoints.ts';
import { DeliveryCard } from '../components/DeliveryCard.tsx';
import { ExceptionPicker } from '../components/ExceptionPicker.tsx';
import { BackButton } from '../components/BackButton.tsx';
import { SignatureField } from '../components/SignatureField.tsx';
import { Notice, ResultTag, Spinner } from '../components/ui.tsx';
import { validateConfirmationForm, type ConfirmationFormState, type FormErrors } from '../lib/confirmationForm.ts';
import { shopDateTime } from '../lib/time.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';
import { useApi } from '../lib/useApi.ts';

/** Step 2 for the driver: check the delivery, record the hand-off and the customer's signature. */
export function DriverConfirmPage() {
  const { orderId = '' } = useParams();
  const lookup = useApi(() => driverApi.lookup(orderId), [orderId]);
  const timeZone = useShopTimeZone();

  if (lookup.loading && !lookup.data) {
    return (
      <div className="narrow">
        <BackButton fallback="/confirm" always />
        <Spinner label="Loading the delivery" />
      </div>
    );
  }
  if (lookup.error) {
    const err = lookup.error;
    const notFound = err instanceof ApiRequestError && err.code === 'order_not_found';
    return (
      <div className="narrow">
        <BackButton fallback="/confirm" always />
        <Notice
          tone={notFound ? 'warn' : 'error'}
          title={notFound ? `Order ${orderId} was not found` : 'This delivery cannot be opened'}
          action={
            err instanceof ApiRequestError && (err.status === 0 || err.status >= 500) ? (
              <button type="button" className="btn btn-small" onClick={lookup.reload}>
                Try again
              </button>
            ) : undefined
          }
        >
          {errorMessage(err)}
        </Notice>
        <Link to="/confirm" className="btn">
          Enter another order ID
        </Link>
      </div>
    );
  }
  const data = lookup.data!;
  if (data.status === 'already_confirmed') {
    return (
      <div className="narrow">
        <BackButton fallback="/confirm" always />
        <Notice tone="info" title={`Order ${data.orderId} is already confirmed`}>
          A delivery confirmation was saved on {shopDateTime(data.confirmedAt, timeZone)}. It cannot be changed from this screen. Call the shop
          if something is wrong.
        </Notice>
        <Link to="/confirm" className="btn btn-primary">
          Confirm another delivery
        </Link>
      </div>
    );
  }
  return <ConfirmForm key={data.delivery.orderId} delivery={data.delivery} timeZone={timeZone} />;
}

type Phase = 'editing' | 'submitting' | 'uncertain' | 'refused' | 'saved';

const EMPTY: ConfirmationFormState = { outcome: null, outcomeDetail: '', note: '', receivedBy: '', signature: null };

function ConfirmForm({ delivery, timeZone }: { delivery: DriverDelivery; timeZone: string }) {
  const [form, setForm] = useState<ConfirmationFormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>('editing');
  const [failure, setFailure] = useState<unknown>(null);
  const [receipt, setReceipt] = useState<ConfirmationReceipt | null>(null);
  // One key per form: every retry of the same submission reuses it, so the server can never save it twice.
  const keyRef = useRef<string>(crypto.randomUUID());
  // The exact payload last sent, resent unchanged by "Retry".
  const sentRef = useRef<ConfirmationSubmit | null>(null);
  const inFlight = useRef(false);
  const ids = { receivedBy: useId(), signatureLabel: useId(), signatureHint: useId(), note: useId() };
  const navigate = useNavigate();
  const summaryRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phase === 'saved') savedRef.current?.focus();
  }, [phase]);

  const locked = phase === 'submitting' || phase === 'uncertain' || phase === 'refused';
  const update = <K extends keyof ConfirmationFormState>(key: K, value: ConfirmationFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const send = async (payload: ConfirmationSubmit) => {
    if (inFlight.current) return; // a double tap never sends twice
    inFlight.current = true;
    sentRef.current = payload;
    setPhase('submitting');
    setFailure(null);
    try {
      const res = await driverApi.submit(payload);
      setReceipt(res.confirmation);
      setPhase('saved');
    } catch (err) {
      setFailure(err);
      const e = err instanceof ApiRequestError ? err : null;
      if (!e || e.status === 0 || e.status >= 500 || e.status === 429) {
        // The save may or may not have happened. Keep everything and offer a safe retry of the same submission.
        setPhase('uncertain');
      } else if (e.status === 422 && (e.code === 'validation_failed' || e.code === 'invalid_signature')) {
        // Nothing was saved: let the driver fix the fields.
        const issues = fieldIssues(e);
        setErrors({
          outcome: issues.outcome,
          outcomeDetail: issues.outcomeDetail,
          receivedBy: issues.receivedBy,
          note: issues.note,
          signature: issues.signaturePng,
        });
        setPhase('editing');
      } else {
        setPhase('refused');
      }
    } finally {
      inFlight.current = false;
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (phase !== 'editing') return;
    const found = validateConfirmationForm(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      summaryRef.current?.focus();
      return;
    }
    void send({
      orderId: delivery.orderId,
      receivedBy: form.receivedBy.trim(),
      outcome: form.outcome!,
      ...(form.outcomeDetail.trim() && form.outcome !== 'delivered_to_recipient' ? { outcomeDetail: form.outcomeDetail.trim() } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      signaturePng: form.signature!.dataUrl,
      idempotencyKey: keyRef.current,
    });
  };

  if (phase === 'saved' && receipt) {
    return (
      <div className="narrow">
        <BackButton fallback="/confirm" label="Back to order entry" always />
        <section className="card saved-card" aria-labelledby="saved-title">
          <div className="saved-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 id="saved-title" ref={savedRef} tabIndex={-1}>
            Confirmation saved
          </h1>
          <p className="muted">The shop’s server saved this record. You can hand the device back to yourself now.</p>
          <dl className="receipt">
            <div>
              <dt>Order ID</dt>
              <dd className="receipt-strong">{receipt.orderId}</dd>
            </div>
            <div>
              <dt>Delivery exception</dt>
              <dd>
                {OUTCOME_LABELS[receipt.outcome]}
                {receipt.outcomeDetail ? `: ${receipt.outcomeDetail}` : ''}
              </dd>
            </div>
            <div>
              <dt>Received by</dt>
              <dd>{receipt.receivedBy}</dd>
            </div>
            <div>
              <dt>Delivery time</dt>
              <dd>
                <time dateTime={receipt.confirmedAt}>{shopDateTime(receipt.confirmedAt, timeZone)}</time>
              </dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd>
                <ResultTag result={receipt.result} />
              </dd>
            </div>
          </dl>
          <Link to="/confirm" className="btn btn-primary btn-block btn-large">
            Confirm another delivery
          </Link>
        </section>
      </div>
    );
  }

  const errorList = Object.entries(errors).filter(([, v]) => Boolean(v));

  return (
    <form className="confirm-form" onSubmit={onSubmit} noValidate aria-busy={phase === 'submitting'}>
      <div className="page-head page-head-back">
        <button
          type="button"
          className="btn btn-ghost back-btn"
          onClick={() => {
            // Leaving loses the entries and signature on this form, so check first once anything was entered.
            const dirty = form.outcome || form.receivedBy.trim() || form.signature || form.note.trim() || form.outcomeDetail.trim();
            if (dirty && phase !== 'saved' && !window.confirm('Leave this delivery? What you entered will be lost.')) return;
            navigate('/confirm');
          }}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <h1>Confirm delivery</h1>
      </div>
      <p className="muted lead">Check the order details with the recipient, choose how it was handed over, and ask the customer to sign.</p>

      <div ref={summaryRef} tabIndex={-1} className="form-summary">
        {errorList.length > 0 && phase === 'editing' && (
          <Notice tone="error" title={errorList.length === 1 ? '1 item needs attention' : `${errorList.length} items need attention`}>
            <ul className="error-list">
              {errorList.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>

      <fieldset className="form-lock" disabled={locked}>
        <DeliveryCard
          delivery={delivery}
          exception={
            <ExceptionPicker
              value={form.outcome}
              detail={form.outcomeDetail}
              onChange={(v) => update('outcome', v)}
              onDetailChange={(v) => update('outcomeDetail', v)}
              error={errors.outcome}
              detailError={errors.outcomeDetail}
            />
          }
          receivedByInputId={ids.receivedBy}
          receivedBy={
            <div className={`field${errors.receivedBy ? ' field-invalid' : ''}`}>
              <input
                id={ids.receivedBy}
                className="input-large"
                value={form.receivedBy}
                onChange={(e) => update('receivedBy', e.target.value)}
                maxLength={RECEIVED_BY_MAX}
                autoComplete="off"
                autoCapitalize="words"
                placeholder="Name of the person who received it"
                aria-invalid={Boolean(errors.receivedBy)}
                aria-describedby={errors.receivedBy ? `${ids.receivedBy}-err` : undefined}
              />
              {errors.receivedBy && (
                <p className="field-error" id={`${ids.receivedBy}-err`}>
                  {errors.receivedBy}
                </p>
              )}
            </div>
          }
          signatureLabelId={ids.signatureLabel}
          signature={
            <div className={`field${errors.signature ? ' field-invalid' : ''}`}>
              <SignatureField
                value={form.signature}
                onChange={(sig) => update('signature', sig)}
                orderId={delivery.orderId}
                recipientName={delivery.recipientName}
                labelledBy={ids.signatureLabel}
                describedBy={ids.signatureHint}
                invalid={Boolean(errors.signature)}
                disabled={locked}
              />
              <p className={errors.signature ? 'field-error' : 'field-hint'} id={ids.signatureHint}>
                {errors.signature ?? 'The customer signs with a finger, stylus or mouse. A typed name is not a signature.'}
              </p>
            </div>
          }
          footer={
            <div className={`field dc-note${errors.note ? ' field-invalid' : ''}`}>
              <label htmlFor={ids.note}>Driver note (optional)</label>
              <textarea id={ids.note} rows={2} maxLength={NOTE_MAX} value={form.note} onChange={(e) => update('note', e.target.value)} />
              {errors.note && <p className="field-error">{errors.note}</p>}
            </div>
          }
        />
      </fieldset>

      {phase === 'uncertain' && (
        <Notice
          tone="error"
          title="The confirmation may not have been saved"
          action={
            <button type="button" className="btn btn-primary" onClick={() => sentRef.current && void send(sentRef.current)}>
              Retry submission
            </button>
          }
        >
          {errorMessage(failure)} Your entries and the signature are kept. Retrying sends exactly the same confirmation, so it can
          never be saved twice.
        </Notice>
      )}
      {phase === 'refused' && (
        <Notice tone="error" title="This confirmation was not saved">
          {errorMessage(failure)}
          <div className="notice-links">
            <Link to="/confirm">Enter another order ID</Link>
          </div>
        </Notice>
      )}

      <div className="submit-bar">
        <button type="submit" className="btn btn-primary btn-block btn-large" disabled={phase !== 'editing'}>
          {phase === 'submitting' ? 'Saving…' : 'Submit delivery confirmation'}
        </button>
      </div>
    </form>
  );
}
