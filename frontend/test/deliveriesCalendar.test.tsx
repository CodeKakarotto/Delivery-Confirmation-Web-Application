import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
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
  const html = renderToStaticMarkup(<DeliveriesMonth month="2026-11" today="2026-11-15" selected="2026-11-14" days={days} onPickDay={() => {}} />);

  it('marks the selected day', () => {
    assert.match(html, /aria-pressed="true"[^>]*aria-label="Saturday, November 14, 2026/);
  });

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

describe('Week view: a compact strip of the seven days', () => {
  const html = renderToStaticMarkup(<DeliveriesWeek start="2026-11-08" today="2026-11-15" selected="2026-11-14" days={days} onPickDay={() => {}} />);

  it('shows Sunday to Saturday in one row, each with its number of deliveries', () => {
    const heads = [...html.matchAll(/class="week-day-title">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(heads, ['Sun 8', 'Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14']);
    assert.match(html, /aria-label="Saturday, November 14, 2026: 6 deliveries/);
  });

  it('marks the selected day', () => {
    assert.match(html, /aria-pressed="true"[^>]*aria-label="Saturday, November 14, 2026/);
  });
});
