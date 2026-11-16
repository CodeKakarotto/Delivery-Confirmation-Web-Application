import type { DeliveryDayCounts } from '../../../shared/types.ts';

/**
 * What a calendar day shows, in colored numbers:
 * - delivered (green): confirmed deliveries, including delivery exceptions (an exception was still delivered);
 * - missed (red): orders of a day that is over and that were never confirmed;
 * - toDeliver (gray): orders of today or a later day that are still waiting.
 */
export interface DayMarks {
  delivered: number;
  missed: number;
  toDeliver: number;
}

export function marksFromCounts(c: DeliveryDayCounts, today: string): DayMarks {
  const past = c.date < today;
  return { delivered: c.confirmed + c.exception, missed: past ? c.awaiting : 0, toDeliver: past ? 0 : c.awaiting };
}

export function marksMap(days: Record<string, DeliveryDayCounts>, today: string): Record<string, DayMarks> {
  const map: Record<string, DayMarks> = {};
  for (const [date, c] of Object.entries(days)) map[date] = marksFromCounts(c, today);
  return map;
}

/** The same numbers in words, for screen readers. */
export function marksWords(m: DayMarks | undefined): string[] {
  if (!m) return [];
  const words: string[] = [];
  if (m.delivered) words.push(`${m.delivered} delivered`);
  if (m.missed) words.push(`${m.missed} missed`);
  if (m.toDeliver) words.push(`${m.toDeliver} still to deliver`);
  return words;
}
