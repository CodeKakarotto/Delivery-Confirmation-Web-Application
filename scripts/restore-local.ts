/**
 * Puts a backup back in place of the LOCAL database.
 *
 *   npm run db:restore:local                      lists the backups, newest first
 *   npm run db:restore:local -- <backup file>     restores that one
 *
 * Close the two app windows first (the script refuses while the app is running). Before restoring, the current
 * database is itself backed up, so a restore can always be undone.
 */
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backup, backupFolder, findLocalDatabase, PREFIX } from './backup-local.ts';

const folder = backupFolder();
const arg = process.argv[2];

if (!arg) {
  const list = existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.startsWith(PREFIX) && f.endsWith('.sqlite'))
        .sort()
        .reverse()
    : [];
  if (!list.length) {
    console.log(`No backups in ${folder} yet.`);
  } else {
    console.log(`Backups in ${folder} (newest first):`);
    for (const f of list) console.log(`  ${f}`);
    console.log('\nTo restore one: npm run db:restore:local -- <file name>');
  }
  process.exit(0);
}

const running = await fetch('http://localhost:8787/api/health')
  .then(() => true)
  .catch(() => false);
if (running) {
  console.error('The app is running. Close the two app windows first, then run this again.');
  process.exit(1);
}

const chosen = existsSync(arg) ? resolve(arg) : join(folder, basename(arg));
if (!existsSync(chosen)) {
  console.error(`Backup not found: ${arg}`);
  process.exit(1);
}
const check = new DatabaseSync(chosen, { readOnly: true });
const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
const n = Number((check.prepare('SELECT COUNT(*) AS n FROM delivery_confirmations').get() as { n: number }).n);
check.close();
if (ok !== 'ok') {
  console.error(`That backup is damaged (${ok}). Pick another one.`);
  process.exit(1);
}

const target = findLocalDatabase();
if (!target) {
  console.error('No local database found. Run Start-App.bat once first, close it, then restore.');
  process.exit(1);
}
const safety = backup(target, folder);
console.log(`Current data saved first: ${safety.file}`);
for (const extra of ['-wal', '-shm']) rmSync(target + extra, { force: true });
copyFileSync(chosen, target);
console.log(`Restored ${basename(chosen)} (${n} confirmations). Start the app again with Start-App.bat.`);
