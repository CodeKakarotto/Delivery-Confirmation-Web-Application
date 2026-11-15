/**
 * Calendar days in the shop's time zone (America/New_York by default), independent of where the code runs.
 * Confirmation times are stored in UTC; these helpers decide which shop-local day, week and month they belong to.
 * Day keys are 'YYYY-MM-DD'; weeks run Sunday to Saturday.
 */

export const DEFAULT_SHOP_TIME_ZONE = 'America/New_York';

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** True when the runtime knows this IANA time zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

function localFields(instant: Date, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** The shop-local calendar day of an instant. */
export function localDateKey(instant: Date, timeZone: string): string {
  const f = localFields(instant, timeZone);
  return `${pad(f.year, 4)}-${pad(f.month)}-${pad(f.day)}`;
}

/** Local time minus UTC, in milliseconds, at an instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const f = localFields(instant, timeZone);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of local midnight at the start of a shop-local day. */
function startOfDayUtc(dateKey: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d);
  // Two passes settle the offset even on daylight-saving change days.
  let guess = naive - offsetMs(new Date(naive), timeZone);
  guess = naive - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** [start, end) of a shop-local day, as UTC instants. */
export function localDayRangeUtc(dateKey: string, timeZone: string): { start: Date; end: Date } {
  return { start: startOfDayUtc(dateKey, timeZone), end: startOfDayUtc(addDays(dateKey, 1), timeZone) };
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Sunday that starts the week containing the day. */
export function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return addDays(dateKey, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** The part of a week that falls inside one month: [max(week start, 1st), min(week end, last day)]. */
export function weekWithinMonth(dateKey: string): { start: string; end: string } {
  const month = monthKey(dateKey);
  const weekStart = weekStartKey(dateKey);
  const weekEnd = addDays(weekStart, 6);
  const first = `${month}-01`;
  const last = addDays(`${monthKey(addDays(`${month}-28`, 4))}-01`, -1);
  return { start: weekStart < first ? first : weekStart, end: weekEnd > last ? last : weekEnd };
}
