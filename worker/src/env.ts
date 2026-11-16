import { DEFAULT_RETENTION_DAYS } from './db/retention.ts';
import { DEFAULT_CLOSING_TIME, DEFAULT_SHOP_TIME_ZONE, isValidClockTime, isValidTimeZone } from '../../shared/shopTime.ts';

/** Bindings and variables available to the Worker (see wrangler.jsonc and .dev.vars.example). */
export interface Env {
  DB: D1Database;
  /** "development" enables the local demonstration. Anything else is production, where data endpoints fail closed. */
  APP_ENV?: string;
  /** Extra browser origins allowed to send state-changing requests (same-origin is always allowed). */
  ALLOWED_ORIGINS?: string;
  /** Development only: extra host names (besides localhost) that may reach the data endpoints. */
  DEV_EXTRA_HOSTS?: string;
  /** Secret used to hash client IP addresses for rate limiting. */
  APP_SECRET?: string;
  /** IANA time zone the shop's days, weeks and months are counted in (default America/New_York). */
  SHOP_TIME_ZONE?: string;
  /** The shop's closing time, 24-hour "HH:MM" (default 18:00). After it, today's unconfirmed deliveries are missed. */
  SHOP_CLOSING_TIME?: string;
  /** How many days of deliveries the database keeps (default 30). Older ones are deleted automatically. */
  RETENTION_DAYS?: string;
}

export interface Settings {
  appEnv: 'development' | 'production';
  isProduction: boolean;
  allowedOrigins: string[];
  /** Host names (lowercase, no port) allowed to reach the data endpoints. Empty in production. */
  demoHosts: Set<string>;
  appSecret: string | null;
  /** The shop's IANA time zone (validated; falls back to America/New_York). */
  timeZone: string;
  /** Closing time, "HH:MM" (validated; falls back to 18:00). */
  closingTime: string;
  /** Days of deliveries kept (validated 7–3650; falls back to 30). */
  retentionDays: number;
}

function parseRetentionDays(value: string | undefined): number {
  const n = Number(value?.trim());
  return Number.isInteger(n) && n >= 7 && n <= 3650 ? n : DEFAULT_RETENTION_DAYS;
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** Reads configuration defensively: anything other than APP_ENV=development is production. */
export function loadSettings(env: Env): Settings {
  const appEnv: Settings['appEnv'] = env.APP_ENV?.trim() === 'development' ? 'development' : 'production';
  const isProduction = appEnv === 'production';
  const extra = (env.DEV_EXTRA_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]{1,253}$/.test(h));
  return {
    appEnv,
    isProduction,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    demoHosts: isProduction ? new Set() : new Set([...LOOPBACK_HOSTS, ...extra]),
    appSecret: env.APP_SECRET && env.APP_SECRET.length >= 16 ? env.APP_SECRET : null,
    timeZone: env.SHOP_TIME_ZONE?.trim() && isValidTimeZone(env.SHOP_TIME_ZONE.trim()) ? env.SHOP_TIME_ZONE.trim() : DEFAULT_SHOP_TIME_ZONE,
    retentionDays: parseRetentionDays(env.RETENTION_DAYS),
    closingTime: env.SHOP_CLOSING_TIME?.trim() && isValidClockTime(env.SHOP_CLOSING_TIME.trim()) ? env.SHOP_CLOSING_TIME.trim() : DEFAULT_CLOSING_TIME,
  };
}
