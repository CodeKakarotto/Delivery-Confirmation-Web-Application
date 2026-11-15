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
}

export interface Settings {
  appEnv: 'development' | 'production';
  isProduction: boolean;
  allowedOrigins: string[];
  /** Host names (lowercase, no port) allowed to reach the data endpoints. Empty in production. */
  demoHosts: Set<string>;
  appSecret: string | null;
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
  };
}
