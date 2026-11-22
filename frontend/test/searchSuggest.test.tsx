import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { highlightParts, matchesQuery, SearchSuggest } from '../src/components/SearchSuggest.tsx';
import { DeliveryRows } from '../src/components/DeliveryRows.tsx';
import { toSuggestion } from '../src/lib/orderSuggestions.ts';

describe('search suggestions', () => {
  it('matches part of an order ID or a name, ignoring capitals', () => {
    assert.ok(matchesQuery('MF-1121-04', '1121'));
    assert.ok(matchesQuery('Avery Demo', 'avery'));
    assert.ok(!matchesQuery('Avery Demo', 'jordan'));
    assert.ok(!matchesQuery(null, 'a'));
    assert.ok(!matchesQuery('MF-1', '  '));
  });

  it('highlights the typed letters', () => {
    assert.deepEqual(highlightParts('MF-1121-04', '1121'), { before: 'MF-', match: '1121', after: '-04' });
    assert.deepEqual(highlightParts('Avery Demo', 'DEMO'), { before: 'Avery ', match: 'Demo', after: '' });
    assert.deepEqual(highlightParts('Avery', 'zz'), { before: 'Avery', match: '', after: '' });
  });

  it('is an accessible combobox that starts closed', () => {
    const html = renderToStaticMarkup(
      <SearchSuggest value="" onChange={() => {}} getSuggestions={() => []} onPick={() => {}} inputProps={{ id: 'q', className: 'input-large' }} />,
    );
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-autocomplete="list"/);
    assert.match(html, /aria-expanded="false"/);
    assert.ok(!html.includes('role="listbox"'));
  });
});

describe('search results: same layout, the searched field is the blue bold text', () => {
  const item = {
    orderId: 'MF-1121-04', stopNumber: 4, zone: 'A', recipientName: 'Avery Demo', city: 'Lake Ridge', addressLine: '100 Sample Way', postalCode: '22192',
    deliveryDate: '2026-11-21', status: 'awaiting' as const, confirmation: null, voidedConfirmationId: null, changed: false,
  };
  const row = (lead: 'order' | 'name' | 'address') =>
    renderToStaticMarkup(<MemoryRouter><DeliveryRows items={[item]} timeZone="America/New_York" lead={lead} /></MemoryRouter>);
  const bold = (html: string) => [...html.matchAll(/class="lead-text">([^<]+)</g)].map((m) => m[1]);

  it('order ID is the blue bold text by default', () => {
    const html = row('order');
    assert.match(html, /class="conf-order">MF-1121-04</);
    assert.deepEqual(bold(html), []);
  });
  it('filtering by name or address moves the bold to it; the layout stays the same', () => {
    const byName = row('name');
    assert.match(byName, /class="conf-order is-plain">MF-1121-04</, 'the order ID stays first, now plain');
    assert.deepEqual(bold(byName), ['Avery Demo']);
    assert.deepEqual(bold(row('address')), ['100 Sample Way, Lake Ridge']);
    const order = (h: string) => ['MF-1121-04', 'Avery Demo', '100 Sample Way'].map((t) => h.indexOf(t));
    assert.deepEqual(order(byName), [...order(byName)].sort((x, y) => x - y), 'same order of the parts');
  });
  it('suggestions keep the order ID first and bold the searched part', () => {
    assert.equal(toSuggestion(item, 'name').label, 'MF-1121-04');
    assert.equal(toSuggestion(item, 'name').emphasis, 'Avery Demo');
    assert.equal(toSuggestion(item, 'address').emphasis, '100 Sample Way, Lake Ridge');
    assert.equal(toSuggestion(item).emphasis, undefined);
  });
});
