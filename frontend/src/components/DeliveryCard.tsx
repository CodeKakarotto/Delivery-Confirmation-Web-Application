import type { ReactNode } from 'react';
import type { DriverDelivery } from '../../../shared/types.ts';
import { Barcode } from './Barcode.tsx';

/** The required display order. Used by the driver form, the employee detail view and the printout. */
export const DELIVERY_SECTIONS = [
  { key: 'stop', label: '#' },
  { key: 'zone', label: 'Zone' },
  { key: 'order-id', label: 'Order ID' },
  { key: 'deliver-to', label: 'Deliver To' },
  { key: 'total-products', label: 'Total Products' },
  { key: 'instructions', label: 'Delivery Instructions' },
] as const;

const DASH = '—';

/**
 * One delivery, always in the same order: #, Zone, Order ID (+ barcode), Deliver To (+ Delivery Exception),
 * Total Products, Delivery Instructions (+ Received By, Customer Signature). The interactive or saved parts are
 * passed in as slots, so the form and the saved record can never drift apart. All text renders as text.
 */
export function DeliveryCard({
  delivery: d,
  exception,
  receivedBy,
  receivedByInputId,
  signature,
  signatureLabelId,
  footer,
}: {
  delivery: DriverDelivery;
  /** How it was handed over ("Delivered to recipient" or a Delivery Exception), inside Deliver To below the address. */
  exception: ReactNode;
  receivedBy: ReactNode;
  /** When set, "Received By" is a <label> for this input. */
  receivedByInputId?: string;
  signature: ReactNode;
  /** When set, "Customer Signature" carries this id so the signature pad can reference it. */
  signatureLabelId?: string;
  footer?: ReactNode;
}) {
  return (
    <article className="delivery-card card" aria-label={`Delivery ${d.orderId}`}>
      <div className="dc-top">
        <section data-section="stop" className="dc-chip">
          <h2 className="dc-label">#</h2>
          <p className="dc-chip-value">{d.stopNumber ?? DASH}</p>
        </section>
        <section data-section="zone" className="dc-chip">
          <h2 className="dc-label">Zone</h2>
          <p className="dc-chip-value">{d.zone ?? DASH}</p>
        </section>
      </div>

      <section data-section="order-id" className="dc-section">
        <h2 className="dc-label">Order ID</h2>
        <p className="dc-order-id">{d.orderId}</p>
        <Barcode value={d.orderId} />
      </section>

      <section data-section="deliver-to" className="dc-section">
        <h2 className="dc-label">Deliver To</h2>
        <address className="dc-address">
          {d.recipientName && <span className="dc-recipient">{d.recipientName}</span>}
          <span>{d.addressLine}</span>
          <span>
            {d.city}, {d.state} {d.postalCode}
          </span>
        </address>
        {d.addressNotes && <p className="dc-address-notes">{d.addressNotes}</p>}
        <div className="deliver-outcome">{exception}</div>
      </section>

      <section data-section="total-products" className="dc-section dc-inline">
        <h2 className="dc-label">Total Products</h2>
        <p className={d.totalProducts === null ? 'dc-total dc-missing' : 'dc-total'}>{d.totalProducts ?? 'Not recorded'}</p>
      </section>

      <section data-section="instructions" className="dc-section">
        <h2 className="dc-label">Delivery Instructions</h2>
        <p className={d.deliveryInstructions ? 'dc-instructions' : 'dc-instructions dc-missing'}>
          {d.deliveryInstructions ?? 'No delivery instructions on this order.'}
        </p>
        <div className="dc-subfield">
          {receivedByInputId ? (
            <label className="dc-sublabel" htmlFor={receivedByInputId}>
              Received By
            </label>
          ) : (
            <h3 className="dc-sublabel">Received By</h3>
          )}
          {receivedBy}
        </div>
        <div className="dc-subfield">
          <h3 className="dc-sublabel" id={signatureLabelId}>
            Customer Signature
          </h3>
          {signature}
        </div>
      </section>
      {footer}
    </article>
  );
}
