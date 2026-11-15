import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, localDateKey, localDayRangeUtc, monthKey, weekStartKey } from '../../shared/shopTime.ts';

const ET = 'America/New_York';

describe('shop time zone helpers (shared/shopTime.ts)', () => {
  it('gives the shop-local calendar day of an instant', () => {
    // 03:00 UTC on Nov 15 is still the evening of Nov 14 in New York.
    assert.equal(localDateKey(new Date('2026-11-15T03:00:00Z'), ET), '2026-11-14');
    assert.equal(localDateKey(new Date('2026-11-15T05:00:00Z'), ET), '2026-11-15');
    assert.equal(localDateKey(new Date('2026-07-01T03:30:00Z'), ET), '2026-06-30'); // EDT, UTC-4
  });

  it('turns a shop-local day into its UTC range, including daylight-saving days', () => {
    assert.deepEqual(
      Object.values(localDayRangeUtc('2026-11-14', ET)).map((d) => d.toISOString()),
      ['2026-11-14T05:00:00.000Z', '2026-11-15T05:00:00.000Z'],
    );
    // 2026-03-08: clocks spring forward, the day is 23 hours long.
    const spring = localDayRangeUtc('2026-03-08', ET);
    assert.equal(spring.start.toISOString(), '2026-03-08T05:00:00.000Z');
    assert.equal(spring.end.toISOString(), '2026-03-09T04:00:00.000Z');
    // 2026-11-01: clocks fall back, the day is 25 hours long.
    const fall = localDayRangeUtc('2026-11-01', ET);
    assert.equal(fall.start.toISOString(), '2026-11-01T04:00:00.000Z');
    assert.equal(fall.end.toISOString(), '2026-11-02T05:00:00.000Z');
  });

  it('does date arithmetic on calendar days', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  it('starts weeks on Sunday and names months', () => {
    assert.equal(weekStartKey('2026-11-14'), '2026-11-08'); // Saturday → previous Sunday
    assert.equal(weekStartKey('2026-11-15'), '2026-11-15'); // Sunday
    assert.equal(monthKey('2026-11-14'), '2026-11');
  });
});
