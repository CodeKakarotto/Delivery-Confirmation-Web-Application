/**
 * The 30-day rule for the local scripts: the shop stores only the deliveries of the last 30 days, in the database AND
 * in every backup copy. The number of days can be changed with a RETENTION_DAYS=... line in .dev.vars (7 to 3650).
 */
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_SHOP_TIME_ZONE, localDateKey } from '../shared/shopTime.ts';
import { DEFAULT_RETENTION_DAYS, retentionCutoff } from '../worker/src/db/retention.ts';

export function retentionDays(devVars = '.dev.vars'): number {
  const line = existsSync(devVars)
    ? readFileSync(devVars, 'utf8')
        .split(/\r?\n/)
        .find((l) => /^\s*RETENTION_DAYS\s*=/.test(l))
    : undefined;
  const n = Number(line?.split('=')[1]?.trim());
  return Number.isInteger(n) && n >= 7 && n <= 3650 ? n : DEFAULT_RETENTION_DAYS;
}

/** The oldest delivery day kept today (shop time): anything scheduled before it is deleted. */
export function localCutoff(now = new Date()): string {
  return retentionCutoff(localDateKey(now, DEFAULT_SHOP_TIME_ZONE), retentionDays());
}
