/** Types shared by the Worker API and the React frontend. See docs/API.md. */

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/**
 * Delivery exceptions / outcomes. PROVISIONAL list from the instruction file: the sponsor must review it before it
 * is treated as a final business rule (docs/SECURITY.md, "Decisions needed").
 */
export const DELIVERY_OUTCOMES = [
  'delivered_to_recipient',
  'left_at_door',
  'left_with_front_desk',
  'left_with_neighbor',
  'other',
] as const;
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  delivered_to_recipient: 'Delivered to recipient',
  left_at_door: 'Left at door',
  left_with_front_desk: 'Left with front desk / reception',
  left_with_neighbor: 'Left with neighbor',
  other: 'Other',
};

/**
 * Saved result, decided by the server: only a hand-off to the recipient is "confirmed". Every other outcome is
 * saved and shown as "needs review" until the shop defines which exceptions count as a completed delivery.
 */
export type ConfirmationResult = 'confirmed' | 'needs_review';

export const RESULT_LABELS: Record<ConfirmationResult, string> = {
  confirmed: 'Delivered to recipient',
  needs_review: 'Exception: needs review',
};

/** The minimum a driver needs to complete one delivery (GET /api/driver/deliveries/:orderId). */
export interface DriverDelivery {
  orderId: string;
  /** Stop number on the route, or null (shown as "—"). */
  stopNumber: number | null;
  /** Zone, or null when the shop has not assigned one (shown as "—"). */
  zone: string | null;
  recipientName: string | null;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  addressNotes: string | null;
  /** From the order itself; null = not recorded. Never calculated. */
  totalProducts: number | null;
  /** Read-only delivery instructions (the route app's delivery notes). */
  deliveryInstructions: string | null;
}

/** Today's orders still awaiting confirmation, as listed on the driver page (no street addresses). */
export interface DriverAwaitingResponse {
  date: string;
  /** All awaiting orders for the day; `items` is one page of them. */
  total: number;
  items: AwaitingDelivery[];
}

export type DriverLookupResponse =
  | { status: 'ready'; delivery: DriverDelivery }
  /** Already confirmed: no customer details are returned. */
  | { status: 'already_confirmed'; orderId: string; confirmedAt: string };

export interface ConfirmationSubmit {
  orderId: string;
  receivedBy: string;
  outcome: DeliveryOutcome;
  outcomeDetail?: string;
  note?: string;
  /** data:image/png;base64,… from the signature pad. */
  signaturePng: string;
  /** Random UUID generated once per form, reused for every retry of the same submission. */
  idempotencyKey: string;
}

/** What the driver sees after a save. No signature, no customer address. */
export interface ConfirmationReceipt {
  id: string;
  orderId: string;
  receivedBy: string;
  outcome: DeliveryOutcome;
  outcomeDetail: string | null;
  note: string | null;
  result: ConfirmationResult;
  /** Server time, UTC ISO-8601. */
  confirmedAt: string;
}

export interface ConfirmationSubmitResponse {
  confirmation: ConfirmationReceipt;
  /** True when this answers a retry of a submission that was already saved. */
  replayed: boolean;
}

export interface ConfirmationListItem {
  id: string;
  orderId: string;
  stopNumber: number | null;
  zone: string | null;
  recipientName: string | null;
  receivedBy: string;
  outcome: DeliveryOutcome;
  result: ConfirmationResult;
  confirmedAt: string;
  /** Number of refused duplicate/conflicting submissions for the same order. */
  attemptCount: number;
  hasConflict: boolean;
}

export interface ConfirmationListResponse {
  items: ConfirmationListItem[];
  total: number;
}

export interface ConfirmationAttempt {
  kind: 'duplicate' | 'conflict';
  receivedBy: string | null;
  outcome: DeliveryOutcome | null;
  createdAt: string;
}

export interface ConfirmationDetail extends ConfirmationListItem {
  delivery: DriverDelivery & { deliveryDate: string | null };
  outcomeDetail: string | null;
  note: string | null;
  signatureWidth: number;
  signatureHeight: number;
  attempts: ConfirmationAttempt[];
  /** Display name of the driver account that saved it (null for records from before accounts). */
  confirmedBy: string | null;
}

export interface ConfirmationDetailResponse {
  confirmation: ConfirmationDetail;
}

export interface AwaitingDelivery {
  orderId: string;
  stopNumber: number | null;
  zone: string | null;
  recipientName: string | null;
  city: string;
}

/** Per-day overview. "Expected" = orders scheduled for that day and not cancelled (the only reliable source). */
export interface DashboardSummary {
  date: string;
  /** True when the date is before today in the shop's time zone: unconfirmed orders are then reported as missing. */
  isPast: boolean;
  expected: number;
  confirmed: number;
  needsReview: number;
  flagged: number;
  awaiting: AwaitingDelivery[];
}

export interface AppConfig {
  appEnv: 'development' | 'production';
  /** The shop's IANA time zone; days, weeks and months are counted in it. */
  timeZone: string;
  /** Sign-in is required for all delivery data. */
  authenticated: true;
}

// ---------- Accounts ----------

export type UserRole = 'driver' | 'employee';

export interface PublicUser {
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AuthResponse {
  user: PublicUser;
  /** Send back in X-CSRF-Token with every change. */
  csrfToken: string;
}

export type DeliveryStatus = 'awaiting' | 'confirmed' | 'exception' | 'cancelled';

/** One order in the employees' deliveries list. */
export interface DeliveryListItem {
  orderId: string;
  stopNumber: number | null;
  zone: string | null;
  recipientName: string | null;
  city: string;
  deliveryDate: string | null;
  status: DeliveryStatus;
  confirmation: { id: string; confirmedAt: string; result: ConfirmationResult; receivedBy: string } | null;
}

export interface DeliveryListResponse {
  items: DeliveryListItem[];
  total: number;
}

/** One day in the employees' month view. */
export interface DeliveryDayCounts {
  date: string;
  total: number;
  awaiting: number;
  confirmed: number;
  exception: number;
  cancelled: number;
}

export interface DeliveryCalendarResponse {
  /** YYYY-MM */
  month: string;
  /** Today in the shop's time zone. */
  today: string;
  days: DeliveryDayCounts[];
}

// ---------- Shop employees section ----------

export interface CalendarCounts {
  count: number;
  needsReview: number;
  flagged: number;
}

export interface CalendarDay extends CalendarCounts {
  /** Shop-local day, YYYY-MM-DD. */
  date: string;
}

export interface CalendarWeek extends CalendarCounts {
  /** First and last day of the Sunday–Saturday week that fall inside this month. */
  start: string;
  end: string;
  days: CalendarDay[];
}

export interface CalendarMonth extends CalendarCounts {
  /** YYYY-MM */
  month: string;
  weeks: CalendarWeek[];
}

/** Confirmations grouped by shop-local month → week → day, newest first. Always includes today. */
export interface ConfirmationCalendar {
  timeZone: string;
  today: string;
  /** Sunday of the current week. */
  currentWeekStart: string;
  months: CalendarMonth[];
}

export type ShopOrderStatus = 'awaiting' | 'confirmed' | 'cancelled';

/** One order as the shop sees it (opened from the awaiting list). */
export interface ShopOrderResponse {
  status: ShopOrderStatus;
  delivery: DriverDelivery & { deliveryDate: string | null };
  confirmation: { id: string; confirmedAt: string; result: ConfirmationResult } | null;
}
