import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CODE128_PATTERNS, decodeCode128B, encodeCode128B } from '../../shared/barcode.ts';

describe('Code 128 barcode (shared/barcode.ts)', () => {
  it('has the 107 standard symbols: 11 modules each (stop: 13), all different', () => {
    assert.equal(CODE128_PATTERNS.length, 107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((n, c) => n + Number(c), 0);
      assert.equal(sum, i === 106 ? 13 : 11, `symbol ${i}`);
    });
    assert.equal(new Set(CODE128_PATTERNS).size, 107);
  });

  it('matches known reference symbols', () => {
    assert.equal(CODE128_PATTERNS[0], '212222'); // space in subset B
    assert.equal(CODE128_PATTERNS[33], '111323'); // "A"
    assert.equal(CODE128_PATTERNS[104], '211214'); // Start B
    assert.equal(CODE128_PATTERNS[106], '2331112'); // Stop
  });

  it('encodes the exact order ID, with start, checksum and stop symbols', () => {
    const code = encodeCode128B('MF-10482');
    assert.equal(code.values[0], 104);
    assert.equal(code.values.at(-1), 106);
    // checksum = (104 + Σ position × value) mod 103
    const data = [...'MF-10482'].map((c) => c.charCodeAt(0) - 32);
    const expected = (104 + data.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103;
    assert.equal(code.values.at(-2), expected);
    assert.equal(code.modules, 11 * (data.length + 2) + 13);
  });

  it('round-trips every seeded and edge-case order ID exactly', () => {
    for (const id of ['MF-10482', 'FTD-2207731', 'mf-10482', 'A', 'X'.repeat(40), 'MF/2026#07_a.b-c']) {
      assert.equal(decodeCode128B(encodeCode128B(id).bars), id);
    }
  });

  it('starts and ends with a bar, alternating bars and spaces', () => {
    const { bars } = encodeCode128B('MF-10482');
    assert.equal(bars.length % 2, 1);
    assert.ok(bars.every((w) => w >= 1 && w <= 4));
  });

  it('refuses text that Code 128 subset B cannot carry', () => {
    assert.throws(() => encodeCode128B(''));
    assert.throws(() => encodeCode128B('MF–10482')); // en dash
    assert.throws(() => encodeCode128B('MF\n1'));
  });
});
