import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConfirmationCorrection } from '../../shared/types.ts';
import { CorrectionHistory } from '../src/components/CorrectionHistory.tsx';
import { PaperSlip } from '../src/components/PaperSlip.tsx';

const history: ConfirmationCorrection[] = [
  {
    kind: 'correction',
    reason: 'Name was misspelled',
    by: 'Erin Employee',
    createdAt: '2026-11-14T21:00:00.000Z',
    changes: [
      { field: 'receivedBy', from: 'Avery Dmeo', to: 'Avery Demo' },
      { field: 'outcome', from: 'delivered_to_recipient', to: 'left_at_door' },
    ],
  },
  { kind: 'void', reason: 'Saved against the wrong order', by: 'Eli Employee', createdAt: '2026-11-14T22:00:00.000Z', changes: [] },
];

describe('CorrectionHistory: the original values stay visible', () => {
  const html = renderToStaticMarkup(<CorrectionHistory items={history} timeZone="America/New_York" />);

  it('shows each change from the old value to the new one, in plain words', () => {
    assert.ok(html.includes('Received by'));
    assert.ok(html.includes('Avery Dmeo'));
    assert.ok(html.includes('Avery Demo'));
    assert.ok(html.indexOf('Avery Dmeo') < html.indexOf('Avery Demo'), 'old value first');
    assert.ok(html.includes('Delivered to recipient') && html.includes('Left at door'), 'outcomes in words, not codes');
    assert.match(html, /<del[^>]*>Avery Dmeo<\/del>/);
  });

  it('shows who, when and why', () => {
    assert.ok(html.includes('Erin Employee'));
    assert.ok(html.includes('Name was misspelled'));
    assert.ok(html.includes('Nov 14, 2026'));
  });

  it('shows a void with its reason', () => {
    assert.ok(html.includes('Voided'));
    assert.ok(html.includes('Saved against the wrong order'));
  });
});

describe('PaperSlip: the blank paper backup in the same order as the app', () => {
  const html = renderToStaticMarkup(<PaperSlip />);

  it('has the required fields in order, with room to write', () => {
    const labels = ['#', 'Zone', 'Order ID', 'Deliver To', 'Total Products', 'Delivery Instructions', 'Received By', 'Customer Signature', 'Delivery date', 'Driver'];
    let last = -1;
    for (const label of labels) {
      const at = html.indexOf(`>${label}<`);
      assert.ok(at > last, `${label} is missing or out of order`);
      last = at;
    }
  });

  it('lists every delivery option as a box to tick, with a line for the exception note', () => {
    for (const option of ['Delivered to recipient', 'Left at door', 'Left with front desk / reception', 'Left with neighbor', 'Other']) {
      assert.ok(html.includes(option), option);
    }
    assert.ok(html.includes('Exception note'));
    assert.ok(html.includes('Customer signs only when delivered to the recipient'));
  });
});
