import type {
  AppConfig,
  AuthResponse,
  DeliveryCalendarResponse,
  DeliveryListResponse,
  DeliveryStatus,
  ConfirmationDetailResponse,
  ConfirmationCalendar,
  ConfirmationListResponse,
  ConfirmationResult,
  ConfirmationSubmit,
  ConfirmationSubmitResponse,
  CorrectionRequest,
  DailyReport,
  SearchField,
  MissedDeliveries,
  DashboardSummary,
  DriverAwaitingResponse,
  DriverOfflineResponse,
  DriverLookupResponse,
  ShopOrderResponse,
} from '../../../shared/types.ts';
import { api } from './client.ts';

export const authApi = {
  me: () => api<AuthResponse>('GET', '/api/auth/me'),
  login: (username: string, password: string) => api<AuthResponse>('POST', '/api/auth/login', { username, password }),
  logout: () => api<{ ok: true }>('POST', '/api/auth/logout', {}),
};

export const configApi = {
  get: () => api<AppConfig & { dataAvailable: boolean }>('GET', '/api/config'),
};

export const driverApi = {
  /** Today's awaiting orders with full details, kept on the phone for confirming without signal. */
  offline: () => api<DriverOfflineResponse>('GET', '/api/driver/offline'),
  /** Today's orders still awaiting confirmation (no street addresses). */
  awaiting: (page: { limit: number; offset: number }) =>
    api<DriverAwaitingResponse>('GET', `/api/driver/deliveries?${new URLSearchParams({ limit: String(page.limit), offset: String(page.offset) })}`),
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
  /** Part of the order ID, the recipient's name or the address. */
  q?: string;
  in?: SearchField;
  zone?: string;
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
    if (q.q) p.set('q', q.q);
    if (q.in && q.in !== 'all') p.set('in', q.in);
    if (q.zone) p.set('zone', q.zone);
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return api<ConfirmationListResponse>('GET', `/api/dashboard/confirmations?${p}`);
  },
  /** Employees: orders for a day, or matching ?q= (order ID, name or address), with filters; 10 per page. */
  deliveries: (q: {
    date?: string;
    from?: string;
    to?: string;
    q?: string;
    in?: SearchField;
    status?: DeliveryStatus | 'voided' | 'all';
    zone?: string;
    sort?: 'newest' | 'oldest';
    limit?: number;
    offset?: number;
  }) => {
    const p = new URLSearchParams();
    if (q.date) p.set('date', q.date);
    if (q.from && q.to) {
      p.set('from', q.from);
      p.set('to', q.to);
    }
    if (q.q) p.set('q', q.q);
    if (q.status && q.status !== 'all') p.set('status', q.status);
    if (q.in && q.in !== 'all') p.set('in', q.in);
    if (q.zone) p.set('zone', q.zone);
    if (q.sort === 'oldest') p.set('sort', 'oldest');
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return api<DeliveryListResponse>('GET', `/api/dashboard/deliveries?${p}`);
  },
  /** Employees' month view: each day's deliveries by status. */
  deliveryCalendar: (month: string) => api<DeliveryCalendarResponse>('GET', `/api/dashboard/deliveries/calendar?${new URLSearchParams({ month })}`),
  detail: (id: string) => api<ConfirmationDetailResponse>('GET', `/api/dashboard/confirmations/${encodeURIComponent(id)}`),
  slipPhotoUrl: (id: string) => `/api/dashboard/confirmations/${encodeURIComponent(id)}/slip-photo`,
  /** Employees: correct a confirmation (with a reason). */
  correct: (id: string, body: CorrectionRequest) =>
    api<ConfirmationDetailResponse>('POST', `/api/dashboard/confirmations/${encodeURIComponent(id)}/corrections`, body),
  /** Employees: void a confirmation (with a reason). */
  voidConfirmation: (id: string, reason: string) =>
    api<ConfirmationDetailResponse>('POST', `/api/dashboard/confirmations/${encodeURIComponent(id)}/void`, { reason }),
  /** Employees: undo a void (with a reason). */
  unvoidConfirmation: (id: string, reason: string) =>
    api<ConfirmationDetailResponse>('POST', `/api/dashboard/confirmations/${encodeURIComponent(id)}/unvoid`, { reason }),
  /** Employees: deliveries never confirmed (earlier days of the last week, and today after closing). */
  missed: () => api<MissedDeliveries>('GET', '/api/dashboard/missed'),
  /** Employees: the end-of-day report; reportCsvUrl downloads it as a spreadsheet. */
  report: (date?: string) => api<DailyReport>('GET', `/api/dashboard/report${date ? `?${new URLSearchParams({ date })}` : ''}`),
  reportCsvUrl: (date: string) => `/api/dashboard/report.csv?${new URLSearchParams({ date })}`,
  signatureUrl: (id: string) => `/api/dashboard/confirmations/${encodeURIComponent(id)}/signature`,
};
