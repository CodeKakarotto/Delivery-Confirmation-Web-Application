import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { RecordActions } from '../src/components/RecordActions.tsx';
import { CorrectionHistory } from '../src/components/CorrectionHistory.tsx';
import { DailyReportTable } from '../src/components/DailyReportTable.tsx';

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);

describe('record actions for employees', () => {
  it('a normal record offers Correct and Void, but not Undo void', () => {
    const html = renderToStaticMarkup(<RecordActions voided={false} editing={null} onEdit={() => {}} onPrint={() => {}} />);
    assert.deepEqual(buttons(html), ['Correct', 'Void', 'Print']);
  });

  it('a voided record offers only Undo void (and Print)', () => {
    const html = renderToStaticMarkup(<RecordActions voided editing={null} onEdit={() => {}} onPrint={() => {}} />);
    assert.deepEqual(buttons(html), ['Undo void', 'Print']);
  });
});

describe('history shows an undone void', () => {
  it('labels it in plain words with its reason', () => {
    const html = renderToStaticMarkup(
      <CorrectionHistory items={[{ kind: 'unvoid', reason: 'Voided by mistake', by: 'Erin Employee', createdAt: '2026-11-14T22:00:00.000Z', changes: [] }]} />,
    );
    assert.ok(html.includes('Void undone'));
    assert.ok(html.includes('Voided by mistake'));
  });
});

describe('end-of-day report table', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
    <DailyReportTable
      timeZone="America/New_York"
      report={{
        date: '2026-11-13',
        isPast: true,
        totals: { scheduled: 2, delivered: 1, exceptions: 0, awaiting: 1, cancelled: 0 },
        rows: [
          { orderId: 'MF-1', stopNumber: 1, zone: 'A', recipientName: 'Avery', city: 'Lake Ridge', status: 'delivered', receivedBy: 'Avery', outcome: 'delivered_to_recipient', outcomeDetail: null, confirmedAt: '2026-11-13T15:30:00.000Z', source: 'paper', corrected: true, flagged: false, confirmationId: 'c1', changed: true, voidedConfirmationId: null },
          { orderId: 'MF-2', stopNumber: 2, zone: 'B', recipientName: 'Jordan', city: 'Woodbridge', status: 'missing', receivedBy: null, outcome: null, outcomeDetail: null, confirmedAt: null, source: null, corrected: false, flagged: false, confirmationId: null, changed: false, voidedConfirmationId: null },
        ],
      }}
    />
    </MemoryRouter>,
  );

  it('shows the totals and a line per order with the result in words', () => {
    assert.ok(html.includes('Friday, November 13, 2026'));
    for (const text of ['Scheduled', 'Delivered', 'Exceptions', 'Missing', 'MF-1', 'MF-2', 'Delivered to recipient', '10:30 AM', 'Paper', 'Changed']) {
      assert.ok(html.includes(text), text);
    }
  });

  it('marks orders with no confirmation as Missing on a past day', () => {
    assert.match(html, /MF-2[^]*?Missing/);
  });
});
