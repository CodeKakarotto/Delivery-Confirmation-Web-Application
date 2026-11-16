import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CallShop } from '../src/components/CallShop.tsx';

describe('call the shop (drivers)', () => {
  it('shows the shop number as a tap-to-call link', () => {
    for (const html of [renderToStaticMarkup(<CallShop />), renderToStaticMarkup(<CallShop compact />)]) {
      assert.ok(html.includes('href="tel:+17035903200"'));
      assert.ok(html.includes('(703) 590-3200'));
    }
  });
});
