import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConfirmationCorrection } from '../../shared/types.ts';
import { CorrectionHistory } from '../src/components/CorrectionHistory.tsx';

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
