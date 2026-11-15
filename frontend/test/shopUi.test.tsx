import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExceptionPicker } from '../src/components/ExceptionPicker.tsx';
import { SignatureField } from '../src/components/SignatureField.tsx';

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
