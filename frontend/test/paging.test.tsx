import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { DailyReportRow, MissedDeliveries } from '../../shared/types.ts';
import { DailyReportTable } from '../src/components/DailyReportTable.tsx';
import { MissedAlertView } from '../src/components/MissedAlert.tsx';
import { PAGE_SIZE, pageOf } from '../src/lib/paging.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `MF-${String(i + 1).padStart(2, '0')}`);

describe('10 per page, everywhere', () => {
  it('splits a list into pages of 10', () => {
    assert.equal(PAGE_SIZE, 10);
    const list = ids(23);
    assert.deepEqual(pageOf(list, 1), list.slice(0, 10));
    assert.deepEqual(pageOf(list, 3), ['MF-21', 'MF-22', 'MF-23']);
  });

  it('end-of-day report: 10 rows on screen with Previous / Next, every row kept for printing', () => {
    const rows: DailyReportRow[] = ids(12).map((orderId, i) => ({
      orderId, stopNumber: i + 1, zone: 'A', recipientName: 'Avery', city: 'Lake Ridge', status: 'awaiting',
      receivedBy: null, outcome: null, outcomeDetail: null, confirmedAt: null, source: null, corrected: false, flagged: false, confirmationId: null,
    }));
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DailyReportTable report={{ date: '2026-11-16', isPast: false, totals: { scheduled: 12, delivered: 0, exceptions: 0, awaiting: 12, cancelled: 0 }, rows }} />
      </MemoryRouter>,
    );
    assert.equal([...html.matchAll(/<tr class="report-row-off"/g)].length, 2, 'rows 11 and 12 are on page 2');
    assert.ok(html.includes('MF-12'), 'still in the page for printing');
    assert.match(html, /Page 1 of 2/);
  });

  it('missed-deliveries alert: each day shows 10 orders, then pages', () => {
    const data: MissedDeliveries = {
      today: '2026-11-16', closingTime: '18:00', afterClosing: true, lookbackDays: 7, total: 14,
      days: [{ date: '2026-11-15', orders: ids(14).map((orderId) => ({ orderId, stopNumber: 1, zone: 'A', recipientName: 'Jordan', city: 'Lorton' })) }],
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MissedAlertView data={data} />
      </MemoryRouter>,
    );
    assert.equal([...html.matchAll(/class="missed-order"/g)].length, 10);
    assert.match(html, /Page 1 of 2/);
  });
});
