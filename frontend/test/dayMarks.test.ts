import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { marksFromCounts, marksWords } from '../src/lib/dayMarks.ts';

const counts = (date: string) => ({ date, total: 7, awaiting: 3, confirmed: 2, exception: 1, cancelled: 1 });

describe('calendar day numbers', () => {
  it('counts exceptions as delivered', () => {
    assert.equal(marksFromCounts(counts('2026-11-16'), '2026-11-16').delivered, 3);
  });

  it('calls unconfirmed orders missed once the day is over', () => {
    assert.deepEqual(marksFromCounts(counts('2026-11-15'), '2026-11-16'), { delivered: 3, missed: 3, toDeliver: 0 });
  });

  it('calls them still to deliver today and on later days', () => {
    assert.deepEqual(marksFromCounts(counts('2026-11-16'), '2026-11-16'), { delivered: 3, missed: 0, toDeliver: 3 });
    assert.deepEqual(marksFromCounts(counts('2026-11-20'), '2026-11-16'), { delivered: 3, missed: 0, toDeliver: 3 });
  });

  it('says it in words', () => {
    assert.deepEqual(marksWords({ delivered: 3, missed: 2, toDeliver: 0 }), ['3 delivered', '2 missed']);
  });
});
