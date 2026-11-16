import { OUTCOME_LABELS } from '../../../shared/types.ts';
import { Brand } from './Layout.tsx';

/**
 * A blank paper delivery slip for when the app cannot be used: the same field order as the app, with boxes to tick and
 * lines to write on. An employee types it in later ("Enter from paper slip").
 */
export function PaperSlip() {
  const line = <span className="slip-line" aria-hidden="true" />;
  return (
    <section className="paper-slip" aria-label="Blank paper delivery slip">
      <header className="slip-head">
        <Brand subtitle="Paper delivery slip (use only if the app is not working)" />
      </header>
      <div className="slip-row slip-two">
        <div className="slip-field">
          <span className="slip-label">#</span>
          {line}
        </div>
        <div className="slip-field">
          <span className="slip-label">Zone</span>
          {line}
        </div>
      </div>
      <div className="slip-field">
        <span className="slip-label">Order ID</span>
        {line}
      </div>
      <div className="slip-field">
        <span className="slip-label">Deliver To</span>
        {line}
        {line}
        <div className="slip-options">
          {(['delivered_to_recipient', 'left_at_door', 'left_with_front_desk', 'left_with_neighbor', 'other'] as const).map((o) => (
            <span key={o} className="slip-option">
              <span className="slip-box" aria-hidden="true" /> {OUTCOME_LABELS[o]}
            </span>
          ))}
        </div>
        <span className="slip-small">Exception note (required if not delivered to the recipient)</span>
        {line}
      </div>
      <div className="slip-field">
        <span className="slip-label">Total Products</span>
        {line}
      </div>
      <div className="slip-field">
        <span className="slip-label">Delivery Instructions</span>
        {line}
      </div>
      <div className="slip-field">
        <span className="slip-label">Received By</span>
        {line}
      </div>
      <div className="slip-field">
        <span className="slip-label">Customer Signature</span>
        <span className="slip-sign" aria-hidden="true" />
        <span className="slip-small">Customer signs only when delivered to the recipient.</span>
      </div>
      <div className="slip-row slip-two">
        <div className="slip-field">
          <span className="slip-label">Delivery date</span>
          {line}
        </div>
        <div className="slip-field">
          <span className="slip-label">Time</span>
          {line}
        </div>
      </div>
      <div className="slip-field">
        <span className="slip-label">Driver</span>
        {line}
      </div>
      <p className="slip-small slip-foot">Bring this slip back to the shop the same day. It will be entered into the app and filed.</p>
    </section>
  );
}
