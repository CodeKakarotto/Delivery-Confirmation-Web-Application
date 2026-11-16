/**
 * Deletes deliveries older than 30 days from the LOCAL database, with their confirmations, signatures, slip photos and
 * history (the shop's database keeps the last 30 days only). Start-App.bat runs it on every start, right after the
 * backup, and only if the backup worked. Run by hand: npm run db:retention:local
 *
 * The number of days can be changed with a RETENTION_DAYS=... line in .dev.vars (7 to 3650).
 * Online (Cloudflare), the Worker does the same every night (worker/src/index.ts, "triggers" in wrangler.jsonc).
 */
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_SHOP_TIME_ZONE, localDateKey } from '../shared/shopTime.ts';
import { DEFAULT_RETENTION_DAYS, retentionCutoff, retentionSql } from '../worker/src/db/retention.ts';
import { d1 } from './accounts.ts';

function retentionDays(): number {
  const line = existsSync('.dev.vars')
    ? readFileSync('.dev.vars', 'utf8')
        .split(/\r?\n/)
        .find((l) => /^\s*RETENTION_DAYS\s*=/.test(l))
    : undefined;
  const n = Number(line?.split('=')[1]?.trim());
  return Number.isInteger(n) && n >= 7 && n <= 3650 ? n : DEFAULT_RETENTION_DAYS;
}

const days = retentionDays();
const cutoff = retentionCutoff(localDateKey(new Date(), DEFAULT_SHOP_TIME_ZONE), days);
const old = Number(d1(`SELECT COUNT(*) AS n FROM deliveries WHERE delivery_date < '${cutoff}'`)[0]?.n ?? 0);
if (old === 0) {
  console.log(`Nothing older than ${days} days to remove.`);
} else {
  for (const sql of retentionSql(cutoff)) d1(sql);
  console.log(`Removed ${old} deliveries from before ${cutoff} (older than ${days} days), with their confirmations and signatures.`);
}
