/** Cloudflare Worker entry point. The API itself lives in app.ts. */
import { localDateKey } from '../../shared/shopTime.ts';
import { handleRequest } from './app.ts';
import { retentionCutoff, retentionSql } from './db/retention.ts';
import { loadSettings, type Env } from './env.ts';
import { logEvent } from './http.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  /** Nightly (see "triggers" in wrangler.jsonc): delete deliveries older than RETENTION_DAYS (default 30). */
  async scheduled(controller: { scheduledTime: number }, env: Env): Promise<void> {
    await runRetention(env, new Date(controller.scheduledTime));
  },
};

/** Deletes deliveries older than the retention window (with their confirmations), in one transaction. */
export async function runRetention(env: Env, now: Date) {
  const settings = loadSettings(env);
  const cutoff = retentionCutoff(localDateKey(now, settings.timeZone), settings.retentionDays);
  const results = await env.DB.batch(retentionSql(cutoff).map((sql) => env.DB.prepare(sql)));
  const result = { cutoff, confirmations: results[2]?.meta.changes ?? 0, deliveries: results[3]?.meta.changes ?? 0 };
  logEvent('info', 'retention_purge', { cutoff: result.cutoff, deliveries: result.deliveries, confirmations: result.confirmations });
  return result;
}
