import type {
  AppConfig,
  ConfirmationDetailResponse,
  ConfirmationCalendar,
  ConfirmationListResponse,
  ConfirmationResult,
  ConfirmationSubmit,
  ConfirmationSubmitResponse,
  DashboardSummary,
  DriverLookupResponse,
  ShopOrderResponse,
} from '../../../shared/types.ts';
import { api } from './client.ts';

export const configApi = {
  get: () => api<AppConfig & { dataAvailable: boolean }>('GET', '/api/config'),
};

export const driverApi = {
  /** One order by its exact ID. The ID goes in the path (it is not customer data); nothing else does. */
  lookup: (orderId: string, signal?: AbortSignal) =>
    api<DriverLookupResponse>('GET', `/api/driver/deliveries/${encodeURIComponent(orderId)}`, undefined, { signal }),
  submit: (body: ConfirmationSubmit) => api<ConfirmationSubmitResponse>('POST', '/api/driver/confirmations', body),
};

export interface ListQuery {
  orderId?: string;
  /** One shop-local day, YYYY-MM-DD. */
  day?: string;
  result?: ConfirmationResult;
  flagged?: boolean;
  limit?: number;
  offset?: number;
}

export const dashboardApi = {
  /** The day's expected vs confirmed orders; no date = today in the shop's time zone. */
  summary: (date?: string) => api<DashboardSummary>('GET', `/api/dashboard/summary${date ? `?${new URLSearchParams({ date })}` : ''}`),
  calendar: () => api<ConfirmationCalendar>('GET', '/api/dashboard/calendar'),
  order: (orderId: string) => api<ShopOrderResponse>('GET', `/api/dashboard/orders/${encodeURIComponent(orderId)}`),
  list: (q: ListQuery) => {
    const p = new URLSearchParams();
    if (q.orderId) p.set('orderId', q.orderId);
    if (q.day) p.set('day', q.day);
    if (q.result) p.set('result', q.result);
    if (q.flagged) p.set('flagged', '1');
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return api<ConfirmationListResponse>('GET', `/api/dashboard/confirmations?${p}`);
  },
  detail: (id: string) => api<ConfirmationDetailResponse>('GET', `/api/dashboard/confirmations/${encodeURIComponent(id)}`),
  signatureUrl: (id: string) => `/api/dashboard/confirmations/${encodeURIComponent(id)}/signature`,
};
