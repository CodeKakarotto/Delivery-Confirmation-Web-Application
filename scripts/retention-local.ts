/**
 * Deletes deliveries older than 30 days from the LOCAL database, with their confirmations, signatures, slip photos and
 * history (the shop stores the last 30 days only). Start-App.bat runs it on every start, right after the backup, and
 * only if the backup worked. The backup copies follow the same rule (scripts/backup-local.ts).
 * Run by hand: npm run db:retention:local
 *
 * The number of days can be changed with a RETENTION_DAYS=... line in .dev.vars (7 to 3650).
 * Online (Cloudflare), the Worker does the same every night (worker/src/index.ts, "triggers" in wrangler.jsonc).
 */
import { retentionSql } from '../worker/src/db/retention.ts';
import { d1 } from './accounts.ts';
import { localCutoff, retentionDays } from './retention-config.ts';

const days = retentionDays();
const cutoff = localCutoff();
const old = Number(d1(`SELECT COUNT(*) AS n FROM deliveries WHERE delivery_date < '${cutoff}'`)[0]?.n ?? 0);
if (old === 0) {
  console.log(`Nothing older than ${days} days to remove.`);
} else {
  for (const sql of retentionSql(cutoff)) d1(sql);
  console.log(`Removed ${old} deliveries from before ${cutoff} (older than ${days} days), with their confirmations and signatures.`);
}
