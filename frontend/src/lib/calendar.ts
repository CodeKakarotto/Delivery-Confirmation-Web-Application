// Calendar labels are fixed US English: the shop is a US business and dates are shown, not converted.
const noon = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const fullDayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function monthLabel(month: string): string {
  return monthFmt.format(noon(`${month}-01`));
}

/** "Nov 8 – 14", or "Oct 30 – Nov 5" across months. */
export function weekLabel(start: string, end: string): string {
  if (start === end) return shortFmt.format(noon(start));
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${shortFmt.format(noon(start))} – ${sameMonth ? Number(end.slice(8)) : shortFmt.format(noon(end))}`;
}

export function dayLabel(date: string): string {
  return dayFmt.format(noon(date));
}

export function fullDayLabel(date: string): string {
  return fullDayFmt.format(noon(date));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
