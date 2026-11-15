import { useEffect, useId, useRef, useState } from 'react';
import { MIN_SIGNATURE_STROKE, type CapturedSignature } from '../lib/confirmationForm.ts';
import { SignaturePad } from './SignaturePad.tsx';

/**
 * Customer Signature on the delivery card: a large "Tap to sign" button that opens a full-screen pop-up with plenty
 * of room to sign. After signing, the card shows the captured signature with Re-sign and Clear.
 */
export function SignatureField({
  value,
  onChange,
  orderId,
  recipientName,
  labelledBy,
  describedBy,
  invalid,
  disabled,
}: {
  value: CapturedSignature | null;
  onChange: (sig: CapturedSignature | null) => void;
  orderId: string;
  recipientName?: string | null;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const launchRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    // Return focus to the card so keyboard and screen-reader users keep their place.
    requestAnimationFrame(() => launchRef.current?.focus());
  };

  return (
    <>
      {value ? (
        <div className="signature-captured">
          <div className="signature-preview">
            <img src={value.dataUrl} alt="Captured customer signature" />
          </div>
          <div className="signature-actions">
            <button ref={launchRef} type="button" className="btn" onClick={() => setOpen(true)} disabled={disabled}>
              Re-sign
            </button>
            <button type="button" className="btn btn-ghost-danger" onClick={() => onChange(null)} disabled={disabled}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={launchRef}
          type="button"
          className="signature-launch"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          data-invalid={invalid ? 'true' : undefined}
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d="M3 17c3-1 4-9 7-9s-1 9 2 9 3-5 5-5 2 3 4 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 21h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="signature-launch-text">Tap to sign</span>
          <span className="signature-launch-hint">Opens a large signing area</span>
        </button>
      )}
      {open && (
        <SignatureDialog
          orderId={orderId}
          recipientName={recipientName}
          onCancel={close}
          onDone={(sig) => {
            onChange(sig);
            close();
          }}
        />
      )}
    </>
  );
}

/** Full-screen signing pop-up. Escape or Cancel closes without changing the saved signature. */
function SignatureDialog({
  orderId,
  recipientName,
  onCancel,
  onDone,
}: {
  orderId: string;
  recipientName?: string | null;
  onCancel: () => void;
  onDone: (sig: CapturedSignature) => void;
}) {
  const [draft, setDraft] = useState<CapturedSignature | null>(null);
  const titleId = useId();
  const hintId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const enough = Boolean(draft && draft.strokeLength >= MIN_SIGNATURE_STROKE);

  useEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden'; // the page behind must not scroll while signing
    ref.current?.querySelector<HTMLElement>('.sig-dialog-close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelRef.current();
      if (e.key === 'Tab' && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="sig-dialog-backdrop">
      <div className="sig-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId} ref={ref}>
        <header className="sig-dialog-head">
          <button type="button" className="btn btn-ghost sig-dialog-close" onClick={onCancel}>
            ← Back
          </button>
          <div className="sig-dialog-heading">
            <h2 id={titleId}>Customer Signature</h2>
            <p className="muted small">
              Order {orderId}
              {recipientName ? ` · ${recipientName}` : ''}
            </p>
          </div>
        </header>
        <p className="sig-dialog-hint" id={hintId}>
          Please sign inside the box with your finger or a stylus. Turn the phone sideways for more room.
        </p>
        <div className="sig-dialog-pad">
          <SignaturePad value={draft} onChange={setDraft} labelledBy={titleId} describedBy={hintId} className="signature-pad-large" />
        </div>
        <footer className="sig-dialog-foot">
          <button type="button" className="btn" onClick={() => setDraft(null)} disabled={!draft}>
            Clear
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-large sig-dialog-done" onClick={() => draft && onDone(draft)} disabled={!enough}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
