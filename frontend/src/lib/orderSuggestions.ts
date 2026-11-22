import type { ConfirmationListItem, DeliveryListItem, DriverDelivery, SearchField, SearchLead } from '../../../shared/types.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { MAX_SUGGESTIONS, matchesQuery, type Suggestion } from '../components/SearchSuggest.tsx';

const shortDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

/** What a suggestion shows and opens for one order (the same places as the result rows). */
export function toSuggestion(d: DeliveryListItem, lead: SearchLead = 'order'): Suggestion {
  const record = d.confirmation?.id ?? d.voidedConfirmationId;
  const tag: Suggestion['tag'] = d.voidedConfirmationId
    ? { text: 'Voided', tone: 'bad' }
    : d.status === 'confirmed'
      ? { text: 'Delivered', tone: 'ok' }
      : d.status === 'exception'
        ? { text: 'Delivered (exception)', tone: 'ok' }
        : d.status === 'cancelled'
          ? { text: 'Cancelled', tone: 'quiet' }
          : { text: 'Awaiting', tone: 'quiet' };
  const name = d.recipientName ?? 'No recipient name';
  const addr = [d.addressLine, d.city].filter(Boolean).join(', ');
  return {
    key: d.orderId,
    label: d.orderId,
    detail: [name, addr, shortDay(d.deliveryDate)].filter(Boolean).join(' · '),
    emphasis: lead === 'name' ? name : lead === 'address' && addr ? addr : undefined,
    tag,
    to: record ? `/shop/confirmations/${record}` : `/shop/orders/${encodeURIComponent(d.orderId)}`,
  };
}

/** Employees: orders matching part of an order ID, a name or an address, on any day of the last month and the coming one. */
export async function orderSuggestions(q: string, lead: SearchLead = 'order'): Promise<Suggestion[]> {
  return (await dashboardApi.deliveries({ q, in: lead, limit: MAX_SUGGESTIONS, ...anyTimeRange() })).items.map((d) => toSuggestion(d, lead));
}

/** "Any time" for searches: the 30 days the shop keeps and the upcoming month. */
export function anyTimeRange(now = new Date()): { from: string; to: string } {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(-31), to: day(31) };
}

/** Whether one of today's deliveries matches the text in the chosen field (drivers search on the phone's copy). */
export function deliveryMatches(d: Pick<DriverDelivery, 'orderId' | 'recipientName' | 'addressLine' | 'city' | 'postalCode'>, field: SearchField, q: string): boolean {
  const order = matchesQuery(d.orderId, q);
  const name = matchesQuery(d.recipientName, q);
  const address = matchesQuery(d.addressLine, q) || matchesQuery(d.city, q) || matchesQuery(d.postalCode, q);
  return field === 'order' ? order : field === 'name' ? name : field === 'address' ? address : order || name || address;
}

/** A driver's suggestion for one of today's deliveries still to deliver. */
export function todaySuggestion(d: DriverDelivery, savedOnPhone = false, lead: SearchLead = 'order'): Suggestion {
  const name = d.recipientName ?? 'No recipient name';
  const addr = `${d.addressLine}, ${d.city}`;
  return {
    key: `today-${d.orderId}`,
    label: d.orderId,
    detail: `Stop ${d.stopNumber ?? '—'} · ${name} · ${addr}`,
    emphasis: lead === 'name' ? name : lead === 'address' ? addr : undefined,
    tag: savedOnPhone ? { text: 'Saved on phone', tone: 'warn' } : { text: 'To deliver', tone: 'quiet' },
    to: `/confirm/${encodeURIComponent(d.orderId)}`,
  };
}

/** A driver's suggestion for one of their own confirmations. */
export function mineSuggestion(c: ConfirmationListItem, lead: SearchLead = 'order'): Suggestion {
  const name = c.recipientName ?? 'No recipient name';
  return {
    key: `mine-${c.id}`,
    label: c.orderId,
    detail: `${name} · received by ${c.receivedBy}`,
    emphasis: lead === 'name' ? name : undefined,
    tag: c.voided
      ? { text: 'Voided', tone: 'bad' }
      : c.result === 'confirmed'
        ? { text: 'Delivered', tone: 'ok' }
        : { text: 'Delivered (exception)', tone: 'ok' },
    to: `/driver/confirmations/${c.id}`,
  };
}

/**
 * Drivers: today's deliveries still to deliver (from the copy on the phone, so it works with no signal), then their own
 * confirmations (any day; skipped quietly when there is no signal).
 */
export async function driverSuggestions(q: string, loadToday: () => Promise<DriverDelivery[]>, lead: SearchLead = 'order'): Promise<Suggestion[]> {
  const today = rankToday(await loadToday().catch(() => [] as DriverDelivery[]), q, lead).map((d) => todaySuggestion(d, false, lead));
  if (today.length >= MAX_SUGGESTIONS) return today;
  const mine = await dashboardApi
    .list({ q, in: lead, limit: MAX_SUGGESTIONS })
    .then((r) => r.items.map((c) => mineSuggestion(c, lead)))
    .catch(() => [] as Suggestion[]);
  return [...today, ...mine];
}

/** Today's deliveries matching the text anywhere, those matching it in the chosen field first (in stop order). */
export function rankToday(list: DriverDelivery[], q: string, lead: SearchLead): DriverDelivery[] {
  const matches = list.filter((d) => deliveryMatches(d, 'all', q));
  const first = matches.filter((d) => deliveryMatches(d, lead, q));
  return [...first, ...matches.filter((d) => !first.includes(d))];
}
