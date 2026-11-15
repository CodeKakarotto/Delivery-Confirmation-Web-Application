import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MonthCalendar } from '../src/components/MonthCalendar.tsx';
import { monthGrid } from '../src/lib/monthGrid.ts';

describe('monthGrid', () => {
  it('lays a month out in Sunday-to-Saturday weeks, padded with neighbouring days', () => {
    const nov = monthGrid('2026-11'); // Nov 1, 2026 is a Sunday; 30 days.
    assert.equal(nov.length, 5);
    assert.deepEqual(nov[0], ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    assert.equal(nov[4]![6], '2026-12-05');
    const oct = monthGrid('2026-10'); // Oct 1, 2026 is a Thursday.
    assert.deepEqual(oct[0]!.slice(0, 4), ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']);
    assert.equal(oct[0]![4], '2026-10-01');
  });
});

function render(selected = '2026-11-15') {
  return renderToStaticMarkup(
    <MonthCalendar
      month="2026-11"
      today="2026-11-15"
      selected={selected}
      days={{ '2026-11-14': { date: '2026-11-14', count: 2, needsReview: 1, flagged: 0 } }}
      onSelect={() => {}}
      onMonth={() => {}}
    />,
  );
}

describe('MonthCalendar: one calendar showing the month, week and day', () => {
  it('shows the month name and a Sunday-first week header', () => {
    const html = render();
    assert.ok(html.includes('November 2026'));
    const heads = [...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(heads, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('highlights the current week row and marks today', () => {
    const html = render();
    const rows = [...html.matchAll(/<tr class="([^"]*)"/g)].map((m) => m[1]);
    assert.equal(rows.filter((c) => c!.includes('is-current-week')).length, 1);
    assert.match(html, /<tr class="[^"]*is-current-week[^"]*">(?:(?!<\/tr>).)*Sunday, November 15, 2026/);
    assert.match(html, /aria-current="date"[^>]*aria-label="Sunday, November 15, 2026/);
  });

  it('shows how many deliveries were confirmed on a day', () => {
    assert.match(render(), /aria-label="Saturday, November 14, 2026, 2 confirmed, 1 to review"/);
  });

  it('marks the selected day', () => {
    assert.match(render('2026-11-14'), /aria-pressed="true"[^>]*aria-label="Saturday, November 14, 2026/);
  });

  it('writes today’s date underneath the calendar, and has no separate date picker', () => {
    const html = render();
    const grid = html.indexOf('</table>');
    const under = html.indexOf('class="month-cal-date"');
    assert.ok(grid > 0 && under > grid, 'the date comes after the calendar grid');
    assert.match(html.slice(under), /Sunday, November 15, 2026/);
    assert.ok(!html.includes('type="date"'));
  });
});
