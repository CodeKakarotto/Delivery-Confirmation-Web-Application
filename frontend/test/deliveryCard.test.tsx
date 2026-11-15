import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { decodeCode128B } from '../../shared/barcode.ts';
import type { DriverDelivery } from '../../shared/types.ts';
import { DeliveryCard, DELIVERY_SECTIONS } from '../src/components/DeliveryCard.tsx';
import { SavedConfirmationCard } from '../src/components/SavedConfirmationCard.tsx';

const delivery: DriverDelivery = {
  orderId: 'MF-10482',
  stopNumber: 1,
  zone: 'A',
  recipientName: 'Avery Demo',
  addressLine: '100 Sample Way',
  city: 'Lake Ridge',
  state: 'VA',
  postalCode: '22192',
  addressNotes: 'Blue door, side entrance',
  totalProducts: 3,
  deliveryInstructions: 'Ring the bell twice.',
};

function render(d: DriverDelivery = delivery): string {
  return renderToStaticMarkup(
    <DeliveryCard
      delivery={d}
      exception={<fieldset data-testid="exception">Delivery exception options</fieldset>}
      receivedBy={<input data-testid="received-by" />}
      signature={<canvas data-testid="signature" />}
    />,
  );
}

/** Positions of each marker in the markup; asserts they all exist. */
function positions(html: string, markers: string[]): number[] {
  return markers.map((m) => {
    const at = html.indexOf(m);
    assert.ok(at >= 0, `missing ${m}`);
    return at;
  });
}

function assertIncreasing(nums: number[], what: string) {
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i]! > nums[i - 1]!, `${what}: item ${i} is out of order`);
}

describe('DeliveryCard: required field order', () => {
  it('declares the six sections in the required order', () => {
    assert.deepEqual(
      DELIVERY_SECTIONS.map((s) => s.label),
      ['#', 'Zone', 'Order ID', 'Deliver To', 'Total Products', 'Delivery Instructions'],
    );
  });

  it('renders #, Zone, Order ID, Deliver To, Total Products and Delivery Instructions in that order', () => {
    const html = render();
    const order = positions(
      html,
      DELIVERY_SECTIONS.map((s) => `data-section="${s.key}"`),
    );
    assertIncreasing(order, 'sections');
  });

  it('renders each value in its section', () => {
    const html = render();
    for (const text of ['1', 'A', 'MF-10482', 'Avery Demo', '100 Sample Way', 'Lake Ridge, VA 22192', 'Blue door, side entrance', '3', 'Ring the bell twice.']) {
      assert.ok(html.includes(text), text);
    }
  });

  it('places a barcode encoding the exact order ID directly under the readable order ID', () => {
    const html = render();
    const [idText, barcode, deliverTo] = positions(html, ['>MF-10482<', '<svg', 'data-section="deliver-to"']);
    assert.ok(idText! < barcode! && barcode! < deliverTo!);
    const value = /data-barcode-value="([^"]+)"/.exec(html)?.[1];
    assert.equal(value, 'MF-10482');
    // The drawn bars decode back to the same order ID.
    const widths = /data-bars="([0-9,]+)"/.exec(html)?.[1]?.split(',').map(Number) ?? [];
    assert.equal(decodeCode128B(widths), 'MF-10482');
    assert.match(html, /role="img" aria-label="Barcode for order MF-10482"/);
  });

  it('puts the delivery exception inside Deliver To, after the address and before Total Products', () => {
    const html = render();
    const [deliverTo, address, exception, total] = positions(html, [
      'data-section="deliver-to"',
      '100 Sample Way',
      'data-testid="exception"',
      'data-section="total-products"',
    ]);
    assertIncreasing([deliverTo!, address!, exception!, total!], 'deliver to');
    assert.match(html, /class="deliver-outcome"/);
  });

  it('puts Received By and Customer Signature inside Delivery Instructions, after the instructions', () => {
    const html = render();
    const [instructions, text, receivedBy, signature] = positions(html, [
      'data-section="instructions"',
      'Ring the bell twice.',
      'Received By',
      'Customer Signature',
    ]);
    assertIncreasing([instructions!, text!, receivedBy!, signature!], 'instructions');
    assert.ok(html.indexOf('data-testid="received-by"') > receivedBy!);
    assert.ok(html.indexOf('data-testid="signature"') > signature!);
  });

  it('shows an em dash for a missing stop number or zone and "Not recorded" for a missing product total', () => {
    const html = render({ ...delivery, stopNumber: null, zone: null, totalProducts: null, deliveryInstructions: null, recipientName: null });
    assert.match(html, /data-section="stop"[^]*?—/);
    assert.match(html, /data-section="zone"[^]*?—/);
    assert.match(html, /data-section="total-products"[^]*?Not recorded/);
    assert.match(html, /data-section="instructions"[^]*?No delivery instructions/);
    assert.ok(!html.includes('undefined') && !html.includes('null'));
  });

  it('renders customer-entered text as text, never as markup', () => {
    const html = render({ ...delivery, recipientName: '<img src=x onerror=alert(1)>', deliveryInstructions: '<b>hi</b>' });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });
});

describe('SavedConfirmationCard: the employee/print view uses the same order', () => {
  it('shows the saved exception under Deliver To and the saved name and signature under Delivery Instructions', () => {
    const html = renderToStaticMarkup(
      <SavedConfirmationCard
        delivery={delivery}
        outcome="left_with_front_desk"
        outcomeDetail={null}
        note="Signed by reception"
        receivedBy="Front Desk"
        signatureSrc="/api/dashboard/confirmations/x/signature"
        result="needs_review"
        confirmedAt="2026-11-14T15:30:00.000Z"
      />,
    );
    const [deliverTo, exception, total, instructions, received, signature] = positions(html, [
      'data-section="deliver-to"',
      'Left with front desk / reception',
      'data-section="total-products"',
      'data-section="instructions"',
      'Front Desk',
      'src="/api/dashboard/confirmations/x/signature"',
    ]);
    assertIncreasing([deliverTo!, exception!, total!, instructions!, received!, signature!], 'saved card');
    assert.ok(html.includes('Signed by reception'));
    assert.ok(html.includes('Exception: needs review'), 'an exception is labelled in words, not only by color');
  });
});
