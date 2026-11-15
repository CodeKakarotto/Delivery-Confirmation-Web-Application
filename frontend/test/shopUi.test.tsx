import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConfirmationCalendar } from '../../shared/types.ts';
import { CalendarTree } from '../src/components/CalendarTree.tsx';
import { ExceptionPicker } from '../src/components/ExceptionPicker.tsx';
import { SignatureField } from '../src/components/SignatureField.tsx';
import { defaultOpenPath } from '../src/lib/calendar.ts';

function at(html: string, marker: string): number {
  const i = html.indexOf(marker);
  assert.ok(i >= 0, `missing ${marker}`);
  return i;
}

describe('ExceptionPicker: "Delivered to recipient" is its own bubble, then Delivery Exception', () => {
  const html = renderToStaticMarkup(<ExceptionPicker value={null} detail="" onChange={() => {}} onDetailChange={() => {}} />);

  it('shows the recipient bubble first, then the Delivery Exception group with the four other options', () => {
    const bubble = at(html, 'class="recipient-bubble');
    const title = at(html, '>Delivery Exception<');
    assert.ok(bubble < title);
    const options = ['Left at door', 'Left with front desk / reception', 'Left with neighbor', 'Other (describe)'].map((t) => at(html, t));
    assert.ok(options.every((o) => o > title));
    assert.ok(at(html, 'Delivered to recipient') < title);
  });

  it('keeps every choice in one radio group, so only one can be selected', () => {
    const names = [...html.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(names.length, 5);
    assert.equal(new Set(names).size, 1);
  });
});

describe('SignatureField: the signature is captured in a pop-up', () => {
  it('shows a large "Tap to sign" button before signing, and no pad on the page itself', () => {
    const html = renderToStaticMarkup(<SignatureField value={null} onChange={() => {}} orderId="MF-10482" />);
    assert.match(html, /<button[^>]*class="signature-launch"/);
    assert.ok(html.includes('Tap to sign'));
    assert.ok(!html.includes('<canvas'), 'the drawing pad only appears in the pop-up');
    assert.ok(!html.includes('role="dialog"'));
  });

  it('shows the captured signature with Re-sign and Clear after signing', () => {
    const html = renderToStaticMarkup(
      <SignatureField value={{ dataUrl: 'data:image/png;base64,AAAA', strokeLength: 300 }} onChange={() => {}} orderId="MF-10482" />,
    );
    assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
    assert.ok(html.includes('Re-sign'));
    assert.ok(html.includes('Clear'));
  });
});

const calendar: ConfirmationCalendar = {
  timeZone: 'America/New_York',
  today: '2026-11-14',
  currentWeekStart: '2026-11-08',
  months: [
    {
      month: '2026-11',
      count: 3,
      needsReview: 1,
      flagged: 1,
      weeks: [
        { start: '2026-11-08', end: '2026-11-14', count: 2, needsReview: 1, flagged: 1, days: [{ date: '2026-11-14', count: 2, needsReview: 1, flagged: 1 }] },
        { start: '2026-11-01', end: '2026-11-07', count: 1, needsReview: 0, flagged: 0, days: [{ date: '2026-11-02', count: 1, needsReview: 0, flagged: 0 }] },
      ],
    },
    {
      month: '2026-10',
      count: 1,
      needsReview: 0,
      flagged: 0,
      weeks: [{ start: '2026-10-01', end: '2026-10-03', count: 1, needsReview: 0, flagged: 0, days: [{ date: '2026-10-01', count: 1, needsReview: 0, flagged: 0 }] }],
    },
  ],
};

describe('Confirmations tab: month → week → day → deliveries', () => {
  it('opens on the current month, week and day', () => {
    assert.deepEqual(defaultOpenPath(calendar), { month: '2026-11', week: '2026-11-08', day: '2026-11-14' });
  });

  it('nests months, weeks and days, marking this week and today, with the day’s deliveries innermost', () => {
    const html = renderToStaticMarkup(
      <CalendarTree calendar={calendar} open={defaultOpenPath(calendar)} onToggle={() => {}} renderDay={(d) => <p>DAY-{d}</p>} />,
    );
    const order = [
      at(html, 'November 2026'),
      at(html, 'Nov 8 – 14'),
      at(html, 'This week'),
      at(html, 'Saturday, November 14'),
      at(html, 'Today'),
      at(html, 'DAY-2026-11-14'),
      at(html, 'Nov 1 – 7'),
      at(html, 'October 2026'),
    ];
    for (let i = 1; i < order.length; i++) assert.ok(order[i]! > order[i - 1]!, `item ${i} out of order`);
    assert.ok(!html.includes('Monday, November 2'), 'closed weeks do not render their days');
    assert.ok(!html.includes('Oct 1 – 3'), 'closed months do not render their weeks');
    assert.match(html, /aria-expanded="true"[^>]*>[^]*?November 2026/);
    assert.ok(html.includes('3 deliveries') && html.includes('1 to review') && html.includes('1 flagged'));
  });
});
