import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { MissedDeliveries } from '../../shared/types.ts';
import { clockLabel, MissedAlertView } from '../src/components/MissedAlert.tsx';

const base: MissedDeliveries = { today: '2026-11-14', closingTime: '18:00', afterClosing: true, lookbackDays: 7, total: 0, days: [] };
const render = (data: MissedDeliveries) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <MissedAlertView data={data} />
    </MemoryRouter>,
  );

describe('missed deliveries alert', () => {
  it('lists the missed orders by day, each linking to its order', () => {
    const html = render({
      ...base,
      total: 3,
      days: [
        { date: '2026-11-14', orders: [{ orderId: 'MF-1', stopNumber: 1, zone: 'A', recipientName: 'Avery', city: 'Lake Ridge', voidedConfirmationId: null }] },
        {
          date: '2026-11-13',
          orders: [
            { orderId: 'MF-2', stopNumber: 2, zone: 'B', recipientName: 'Jordan', city: 'Woodbridge', voidedConfirmationId: null },
            { orderId: 'MF-3', stopNumber: null, zone: null, recipientName: null, city: 'Lorton', voidedConfirmationId: null },
          ],
        },
      ],
    });
    assert.ok(html.includes('3 deliveries were not confirmed'));
    assert.ok(html.includes('The shop closed at 6:00 PM and 1 of today’s delivery is still not confirmed'));
    assert.ok(html.includes('Today, Saturday, November 14, 2026'));
    assert.ok(html.includes('2 missed'));
    assert.ok(!html.includes('/shop/paper'), 'no paper-slip links');
    assert.ok(html.includes('href="/shop/orders/MF-3"'));
  });

  it('says all is well after closing when nothing was missed, and shows nothing before closing', () => {
    assert.ok(render(base).includes('All deliveries are confirmed'));
    assert.equal(render({ ...base, afterClosing: false }), '');
  });

  it('writes the closing time the American way', () => {
    assert.equal(clockLabel('18:00'), '6:00 PM');
    assert.equal(clockLabel('12:00'), '12:00 PM');
    assert.equal(clockLabel('00:30'), '12:30 AM');
  });
});
