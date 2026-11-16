import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { DeliveryListItem } from '../../shared/types.ts';
import { DeliveriesMonth, DeliveriesWeek, ViewSwitch } from '../src/components/DeliveriesCalendar.tsx';

const days = {
  '2026-11-14': { date: '2026-11-14', total: 6, awaiting: 3, confirmed: 1, exception: 1, cancelled: 1 },
  '2026-11-13': { date: '2026-11-13', total: 2, awaiting: 2, confirmed: 0, exception: 0, cancelled: 0 },
};

describe('Deliveries calendar: Month / Week / Day switch', () => {
  it('offers the three views and marks the current one', () => {
    const html = renderToStaticMarkup(<ViewSwitch value="week" onChange={() => {}} />);
    const labels = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    assert.deepEqual(labels, ['Month', 'Week', 'Day']);
    assert.match(html, /aria-pressed="true"[^>]*>Week</);
  });
});

describe('Month view', () => {
  const html = renderToStaticMarkup(<DeliveriesMonth month="2026-11" today="2026-11-15" days={days} onPickDay={() => {}} />);

  it('is a full month grid with Sunday-first weeks, the current week and today marked', () => {
    assert.ok(html.includes('<table'));
    assert.equal([...html.matchAll(/<th[ >]/g)].length, 7);
    assert.match(html, /<tr class="[^"]*is-current-week/);
    assert.match(html, /aria-current="date"[^>]*aria-label="Sunday, November 15, 2026/);
  });

  it('shows each day’s deliveries by status, in words for screen readers', () => {
    assert.match(html, /aria-label="Saturday, November 14, 2026: 6 deliveries, 1 delivered, 1 exception, 3 awaiting, 1 cancelled"/);
    assert.match(html, /aria-label="Friday, November 13, 2026: 2 deliveries, 2 awaiting"/);
    assert.match(html, /aria-label="Monday, November 2, 2026: no deliveries"/);
  });
});

describe('Week view', () => {
  const item = (orderId: string, date: string, status: DeliveryListItem['status']): DeliveryListItem => ({
    orderId,
    stopNumber: 1,
    zone: 'A',
    recipientName: 'Demo',
    city: 'Lake Ridge',
    deliveryDate: date,
    status,
    confirmation: status === 'confirmed' ? { id: 'c1', confirmedAt: '2026-11-14T15:30:00.000Z', result: 'confirmed', receivedBy: 'Demo' } : null,
  });
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <DeliveriesWeek
        start="2026-11-08"
        today="2026-11-15"
        timeZone="America/New_York"
        items={[item('MF-1', '2026-11-14', 'confirmed'), item('MF-2', '2026-11-14', 'awaiting'), item('MF-3', '2026-11-13', 'awaiting')]}
        onPickDay={() => {}}
      />
    </MemoryRouter>,
  );

  it('shows all seven days of the week, Sunday to Saturday, together', () => {
    const heads = [...html.matchAll(/class="week-day-title">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(heads, ['Sun, Nov 8', 'Mon, Nov 9', 'Tue, Nov 10', 'Wed, Nov 11', 'Thu, Nov 12', 'Fri, Nov 13', 'Sat, Nov 14']);
  });

  it('lists each day’s deliveries under that day, with the delivery time when confirmed', () => {
    const sat = html.indexOf('Sat, Nov 14');
    const fri = html.indexOf('Fri, Nov 13');
    assert.ok(html.indexOf('MF-3') > fri && html.indexOf('MF-3') < sat);
    assert.ok(html.indexOf('MF-1') > sat && html.indexOf('MF-2') > sat);
    assert.ok(html.includes('10:30'));
    assert.ok(html.includes('No deliveries'));
  });
});
