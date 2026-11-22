import type { ConfirmationListItem, DeliveryListItem, DriverDelivery, SearchField } from '../../../shared/types.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { MAX_SUGGESTIONS, matchesQuery, type Suggestion } from '../components/SearchSuggest.tsx';

const shortDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

/** What a suggestion shows and opens for one order (the same places as the result rows). */
export function toSuggestion(d: DeliveryListItem): Suggestion {
  const record = d.confirmation?.id ?? d.voidedConfirmationId;
  const tag: Suggestion['tag'] = d.voidedConfirmationId
    ? { text: 'Voided', tone: 'bad' }
    : d.status === 'confirmed'
      ? { text: 'Delivered', tone: 'ok' }
      : d.status === 'exception'
        ? { text: 'Exception', tone: 'warn' }
        : d.status === 'cancelled'
          ? { text: 'Cancelled', tone: 'quiet' }
          : { text: 'Awaiting', tone: 'quiet' };
  return {
    key: d.orderId,
    label: d.orderId,
    detail: [d.recipientName ?? 'No recipient name', d.addressLine, d.city, shortDay(d.deliveryDate)].filter(Boolean).join(' · '),
    tag,
    to: record ? `/shop/confirmations/${record}` : `/shop/orders/${encodeURIComponent(d.orderId)}`,
  };
}

/** Employees: orders matching part of an order ID, a name or an address, on any day of the last month and the coming one. */
export async function orderSuggestions(q: string): Promise<Suggestion[]> {
  return (await dashboardApi.deliveries({ q, limit: MAX_SUGGESTIONS, ...anyTimeRange() })).items.map(toSuggestion);
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
export function todaySuggestion(d: DriverDelivery, savedOnPhone = false): Suggestion {
  return {
    key: `today-${d.orderId}`,
    label: d.orderId,
    detail: `Stop ${d.stopNumber ?? '—'} · ${d.recipientName ?? 'No recipient name'} · ${d.addressLine}, ${d.city}`,
    tag: savedOnPhone ? { text: 'Saved on phone', tone: 'warn' } : { text: 'To deliver', tone: 'quiet' },
    to: `/confirm/${encodeURIComponent(d.orderId)}`,
  };
}

/** A driver's suggestion for one of their own confirmations. */
export function mineSuggestion(c: ConfirmationListItem): Suggestion {
  return {
    key: `mine-${c.id}`,
    label: c.orderId,
    detail: `${c.recipientName ?? 'No recipient name'} · received by ${c.receivedBy}`,
    tag: c.voided
      ? { text: 'Voided', tone: 'bad' }
      : c.result === 'confirmed'
        ? { text: 'Delivered', tone: 'ok' }
        : { text: 'Exception', tone: 'warn' },
    to: `/driver/confirmations/${c.id}`,
  };
}

/**
 * Drivers: today's deliveries still to deliver (from the copy on the phone, so it works with no signal), then their own
 * confirmations (any day; skipped quietly when there is no signal).
 */
export async function driverSuggestions(q: string, loadToday: () => Promise<DriverDelivery[]>): Promise<Suggestion[]> {
  const today = (await loadToday().catch(() => [] as DriverDelivery[])).filter((d) => deliveryMatches(d, 'all', q)).map((d) => todaySuggestion(d));
  if (today.length >= MAX_SUGGESTIONS) return today;
  const mine = await dashboardApi
    .list({ q, limit: MAX_SUGGESTIONS })
    .then((r) => r.items.map(mineSuggestion))
    .catch(() => [] as Suggestion[]);
  return [...today, ...mine];
}
