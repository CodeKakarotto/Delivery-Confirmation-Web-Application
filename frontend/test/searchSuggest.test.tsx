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

describe('search results start with the chosen field', () => {
  const item = {
    orderId: 'MF-1121-04', stopNumber: 4, zone: 'A', recipientName: 'Avery Demo', city: 'Lake Ridge', addressLine: '100 Sample Way', postalCode: '22192',
    deliveryDate: '2026-11-21', status: 'awaiting' as const, confirmation: null, voidedConfirmationId: null, changed: false,
  };
  const first = (lead: 'order' | 'name' | 'address') => {
    const html = renderToStaticMarkup(<MemoryRouter><DeliveryRows items={[item]} timeZone="America/New_York" lead={lead} /></MemoryRouter>);
    return /class="conf-order">([^<]+)</.exec(html)?.[1];
  };
  it('order ID by default, or the name, or the address', () => {
    assert.equal(first('order'), 'MF-1121-04');
    assert.equal(first('name'), 'Avery Demo');
    assert.equal(first('address'), '100 Sample Way, Lake Ridge');
  });
  it('suggestions too', () => {
    assert.equal(toSuggestion(item).label, 'MF-1121-04');
    assert.equal(toSuggestion(item, 'name').label, 'Avery Demo');
    assert.equal(toSuggestion(item, 'address').label, '100 Sample Way, Lake Ridge');
  });
});
