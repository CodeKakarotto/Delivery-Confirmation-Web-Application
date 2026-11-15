import type {
  AppConfig,
  ConfirmationDetailResponse,
  ConfirmationListResponse,
  ConfirmationResult,
  ConfirmationSubmit,
  ConfirmationSubmitResponse,
  DashboardSummary,
  DriverLookupResponse,
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
  result?: ConfirmationResult;
  flagged?: boolean;
  limit?: number;
  offset?: number;
}

export const dashboardApi = {
  summary: (date: string) => api<DashboardSummary>('GET', `/api/dashboard/summary?${new URLSearchParams({ date })}`),
  list: (q: ListQuery) => {
    const p = new URLSearchParams();
    if (q.orderId) p.set('orderId', q.orderId);
    if (q.result) p.set('result', q.result);
    if (q.flagged) p.set('flagged', '1');
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return api<ConfirmationListResponse>('GET', `/api/dashboard/confirmations?${p}`);
  },
  detail: (id: string) => api<ConfirmationDetailResponse>('GET', `/api/dashboard/confirmations/${encodeURIComponent(id)}`),
  signatureUrl: (id: string) => `/api/dashboard/confirmations/${encodeURIComponent(id)}/signature`,
};
