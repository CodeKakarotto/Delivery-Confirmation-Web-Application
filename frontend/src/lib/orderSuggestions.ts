import type { DeliveryListItem } from '../../../shared/types.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { MAX_SUGGESTIONS, type Suggestion } from '../components/SearchSuggest.tsx';

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
    detail: [d.recipientName ?? 'No recipient name', d.city, shortDay(d.deliveryDate)].filter(Boolean).join(' · '),
    tag,
    to: record ? `/shop/confirmations/${record}` : `/shop/orders/${encodeURIComponent(d.orderId)}`,
  };
}

/** Employees: orders matching part of an order ID or recipient name, on any day. */
export async function orderSuggestions(q: string): Promise<Suggestion[]> {
  return (await dashboardApi.deliveries({ q, limit: MAX_SUGGESTIONS })).items.map(toSuggestion);
}
