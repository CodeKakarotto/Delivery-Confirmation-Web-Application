/**
 * Automatic backup of the LOCAL database. Start-App.bat runs it on every start; run it by hand any time:
 *
 *   npm run db:backup:local
 *
 * The shop stores only the deliveries of the last 30 days, and that includes the backups: every copy is cut down to
 * the last 30 days, and the older copies are cut down again each time this runs. Only the 7 newest copies are kept
 * (a week of restore points); older copies are deleted.
 *
 * Each copy is named delivery-confirmations-YYYY-MM-DD_HHMM.sqlite, made with SQLite's own "VACUUM INTO" (consistent
 * even while the app is running) and checked before it is trusted.
 *
 * Where: the backups/ folder of this project, or the folder named on a BACKUP_DIR=... line in .dev.vars (for example a
 * OneDrive or USB folder, so a copy also exists outside this computer). The copies contain customer names, addresses
 * and signatures: keep that folder private.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { retentionSql } from '../worker/src/db/retention.ts';
import { localCutoff } from './retention-config.ts';

/** How many backup copies (restore points) are kept. */
export const KEEP = 7;
export const PREFIX = 'delivery-confirmations-';
const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

/** The local D1 database file (wrangler keeps it under a hashed name next to metadata.sqlite). */
export function findLocalDatabase(dir = D1_DIR): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).size - statSync(a).size);
  return files[0] ?? null;
}

/** BACKUP_DIR from .dev.vars, or ./backups. */
export function backupFolder(devVars = '.dev.vars'): string {
  if (existsSync(devVars)) {
    const line = readFileSync(devVars, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*BACKUP_DIR\s*=/.test(l));
    const value = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (value) return resolve(value);
  }
  return resolve('backups');
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Deletes deliveries scheduled before `cutoff` from a backup file, and shrinks it so the data is really gone. */
export function trimBackup(file: string, cutoff: string): void {
  const db = new DatabaseSync(file);
  try {
    for (const sql of retentionSql(cutoff)) db.exec(sql);
    db.exec('VACUUM');
  } finally {
    db.close();
  }
}

export interface BackupResult {
  file: string;
  confirmations: number;
  deliveries: number;
  removed: string[];
}

/**
 * Copies `source` into `folder`, keeps only deliveries from `cutoff` on (in the new copy and in every older copy),
 * checks the copy, and keeps the newest `keep` copies.
 */
export function backup(source: string, folder: string, cutoff: string, now = new Date(), keep = KEEP): BackupResult {
  mkdirSync(folder, { recursive: true });
  let file = join(folder, `${PREFIX}${stamp(now)}.sqlite`);
  for (let i = 2; existsSync(file); i++) file = join(folder, `${PREFIX}${stamp(now)}-${i}.sqlite`);

  const src = new DatabaseSync(source, { readOnly: true });
  try {
    src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  } finally {
    src.close();
  }

  let confirmations = 0;
  let deliveries = 0;
  try {
    trimBackup(file, cutoff);
    // Check the copy before trusting it.
    const copy = new DatabaseSync(file, { readOnly: true });
    try {
      const ok = (copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
      if (ok !== 'ok') throw new Error(`The backup copy failed its check: ${ok}`);
      confirmations = Number((copy.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n);
      deliveries = Number((copy.prepare('SELECT COUNT(*) AS n FROM deliveries').get() as { n: number }).n);
    } finally {
      copy.close();
    }
  } catch (err) {
    rmSync(file, { force: true });
    throw err;
  }

  const all = readdirSync(folder)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.sqlite'))
    .sort()
    .reverse();
  const removed = all.slice(keep);
  for (const f of removed) rmSync(join(folder, f), { force: true });
  // The copies that stay follow the 30-day rule too.
  for (const f of all.slice(1, keep)) trimBackup(join(folder, f), cutoff);
  return { file, confirmations, deliveries, removed };
}

// Run from the command line (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const source = findLocalDatabase();
  if (!source) {
    console.log('No local database yet, nothing to back up.');
    process.exit(0);
  }
  try {
    const cutoff = localCutoff();
    const r = backup(source, backupFolder(), cutoff);
    console.log(`Backup saved: ${r.file}`);
    console.log(`  ${r.deliveries} orders and ${r.confirmations} confirmations from ${cutoff} on (the last 30 days), checked OK.`);
    console.log(`  Keeping the newest ${KEEP} copies; every copy holds only the last 30 days of deliveries.`);
    if (r.removed.length) console.log(`  Removed ${r.removed.length} older copy(ies).`);
  } catch (err) {
    console.error(`BACKUP FAILED: ${(err as Error).message}`);
    process.exit(1);
  }
}
