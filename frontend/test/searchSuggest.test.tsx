import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { highlightParts, matchesQuery, SearchSuggest } from '../src/components/SearchSuggest.tsx';

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
