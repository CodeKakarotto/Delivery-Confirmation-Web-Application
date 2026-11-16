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
import { needsSignature, validateConfirmationForm, type ConfirmationFormState, type FormErrors } from '../lib/confirmationForm.ts';
import { shopDateTime } from '../lib/time.ts';
import { useOffline } from '../lib/offline.tsx';
import { useShopTimeZone } from '../lib/useShopConfig.ts';
import { useApi } from '../lib/useApi.ts';

/** No signal (or the server could not be reached), as opposed to the server answering "no". */
function isConnectionProblem(err: unknown): boolean {
  return !(err instanceof ApiRequestError) || err.status === 0 || err.status >= 500;
}

/** Step 2 for the driver: check the delivery, record the hand-off and the customer's signature. */
export function DriverConfirmPage() {
  const { orderId = '' } = useParams();
  const lookup = useApi(() => driverApi.lookup(orderId), [orderId]);
  const timeZone = useShopTimeZone();
  const offline = useOffline();
  // Without signal: the copy of today's deliveries kept on this phone (undefined = still looking).
  const [cached, setCached] = useState<DriverDelivery | null | undefined>(undefined);
  const noSignal = Boolean(lookup.error) && isConnectionProblem(lookup.error);
  useEffect(() => {
    if (!noSignal) return;
    let current = true;
    void offline.findToday(orderId).then((d) => current && setCached(d));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSignal, orderId]);

  const queued = offline.items.find((i) => i.payload.orderId.toLowerCase() === orderId.toLowerCase() && i.state === 'waiting');
  if (queued) {
    return (
      <div className="narrow">
        <BackButton fallback="/driver" label="Back to my dashboard" always />
        <section className="card saved-card" aria-labelledby="queued-title">
          <div className="saved-mark is-queued" aria-hidden="true">
            ⇪
          </div>
          <h1 id="queued-title" tabIndex={-1}>
            Saved on this phone
          </h1>
          <p>
            Your confirmation for order <strong>{queued.payload.orderId}</strong> was saved on this phone. It will submit automatically when
            you regain connection. You can carry on with your next delivery.
          </p>
          <p className="muted small">Do not sign out until it has been sent.</p>
          <Link to="/driver" className="btn btn-primary btn-block btn-large">
            Next delivery
          </Link>
        </section>
      </div>
    );
  }
  if (noSignal && cached === undefined) return <Spinner label="No signal: looking for the copy saved on this phone" />;
  if (noSignal && cached) return <ConfirmForm key={cached.orderId} delivery={cached} timeZone={timeZone} offlineCopy />;

  if (lookup.loading && !lookup.data) {
    return (
      <div className="narrow">
        <BackButton fallback="/driver" always />
        <Spinner label="Loading the delivery" />
      </div>
    );
  }
  if (lookup.error) {
    const err = lookup.error;
    const notFound = err instanceof ApiRequestError && err.code === 'order_not_found';
    return (
      <div className="narrow">
        <BackButton fallback="/driver" always />
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
        <Link to="/driver" className="btn">
          Back to my dashboard
        </Link>
      </div>
    );
  }
  const data = lookup.data!;
  if (data.status === 'already_confirmed') {
    return (
      <div className="narrow">
        <BackButton fallback="/driver" always />
        <Notice tone="info" title={`Order ${data.orderId} is already confirmed`}>
          A delivery confirmation was saved on {shopDateTime(data.confirmedAt, timeZone)}. It cannot be changed from this screen. Call the shop
          if something is wrong.
        </Notice>
        <Link to="/driver" className="btn btn-primary">
          Confirm another delivery
        </Link>
      </div>
    );
  }
  return <ConfirmForm key={data.delivery.orderId} delivery={data.delivery} timeZone={timeZone} />;
}

type Phase = 'editing' | 'submitting' | 'uncertain' | 'refused' | 'saved' | 'queued';

const EMPTY: ConfirmationFormState = { outcome: null, outcomeDetail: '', note: '', receivedBy: '', signature: null };

function ConfirmForm({ delivery, timeZone, offlineCopy = false }: { delivery: DriverDelivery; timeZone: string; offlineCopy?: boolean }) {
  const offline = useOffline();
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
    if (phase === 'saved' || phase === 'queued') savedRef.current?.focus();
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
      void offline.forgetToday(payload.orderId);
    } catch (err) {
      setFailure(err);
      const e = err instanceof ApiRequestError ? err : null;
      if (!e || e.status === 0 || e.status >= 500 || e.status === 429) {
        // No signal or a server problem: keep it on the phone and send it automatically later. The same request key
        // is kept, so it can never be saved twice. If the phone cannot store it, fall back to a manual retry.
        try {
          await offline.queue(payload);
          setPhase('queued');
        } catch {
          setPhase('uncertain');
        }
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
    // A hand-off to the recipient: the signature and an optional driver note. A delivery exception: neither.
    const signing = needsSignature(form.outcome);
    void send({
      orderId: delivery.orderId,
      receivedBy: form.receivedBy.trim(),
      outcome: form.outcome!,
      ...(form.outcomeDetail.trim() && form.outcome !== 'delivered_to_recipient' ? { outcomeDetail: form.outcomeDetail.trim() } : {}),
      ...(signing && form.note.trim() ? { note: form.note.trim() } : {}),
      ...(signing ? { signaturePng: form.signature!.dataUrl } : {}),
      idempotencyKey: keyRef.current,
    });
  };

  if (phase === 'queued') {
    return (
      <div className="narrow">
        <BackButton fallback="/driver" label="Back to my dashboard" always />
        <section className="card saved-card" aria-labelledby="queued-title">
          <div className="saved-mark is-queued" aria-hidden="true">
            ⇪
          </div>
          <h1 id="queued-title" ref={savedRef} tabIndex={-1}>
            Saved on this phone
          </h1>
          <p>
            Your confirmation for order <strong>{delivery.orderId}</strong> was saved on this phone. It will submit automatically when you
            regain connection. You can carry on with your next delivery.
          </p>
          <p className="muted small">Do not sign out until it has been sent.</p>
          <Link to="/driver" className="btn btn-primary btn-block btn-large">
            Next delivery
          </Link>
        </section>
      </div>
    );
  }

  if (phase === 'saved' && receipt) {
    return (
      <div className="narrow">
        <BackButton fallback="/driver" label="Back to my dashboard" always />
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
          <Link to="/driver" className="btn btn-primary btn-block btn-large">
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
            // Back to the list the driver came from (same page), or the driver home if opened directly.
            const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
            if (idx > 0) navigate(-1);
            else navigate('/driver');
          }}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <h1>Confirm delivery</h1>
      </div>
      <p className="muted lead">Check the order details, then choose how it was handed over: delivered to the recipient (the customer signs) or a delivery exception (write an exception note).</p>
      {offlineCopy && (
        <Notice tone="info" title="No signal">
          Showing the copy of this order saved on your phone. When you submit, it will be saved on this phone and will submit automatically
          when you regain connection.
        </Notice>
      )}

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
            !needsSignature(form.outcome) ? null : (
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
            )
          }
          footer={
            !needsSignature(form.outcome) ? undefined : (
            <div className={`field dc-note${errors.note ? ' field-invalid' : ''}`}>
              <label htmlFor={ids.note}>Driver note (optional)</label>
              <textarea id={ids.note} rows={2} maxLength={NOTE_MAX} value={form.note} onChange={(e) => update('note', e.target.value)} />
              {errors.note && <p className="field-error">{errors.note}</p>}
            </div>
            )
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
            <Link to="/driver">Back to my dashboard</Link>
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
