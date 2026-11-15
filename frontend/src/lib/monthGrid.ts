import { addDays, weekStartKey } from '../../../shared/shopTime.ts';

/** A month as Sunday-to-Saturday weeks of 'YYYY-MM-DD' keys, padded with the neighbouring months' days. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const lastOfMonth = addDays(`${addMonths(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let start = weekStartKey(first); start <= lastOfMonth; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** 'YYYY-MM' plus or minus whole months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
