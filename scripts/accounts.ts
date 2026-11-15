/**
 * Shared helpers for the account scripts: strong random passwords, PBKDF2 hashes in the Worker's format, and running
 * SQL against the LOCAL D1 database through wrangler. Passwords are printed once and never stored in plain text.
 */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Must match PBKDF2_ITERATIONS in worker/src/auth.ts. */
const ITERATIONS = 100_000;
/** No look-alike characters (0/O, 1/l/I). */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 16 random characters in 4 groups (about 93 bits), e.g. "k7Qm-x2Lp-9aRt-Vw3e". */
export function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join('-');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return ['pbkdf2-sha256', ITERATIONS, salt.toString('base64'), hash.toString('base64')].join('$');
}

export const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Runs SQL on the local D1 database and returns the result rows. */
export function d1(sql: string): Array<Record<string, unknown>> {
  // Runs wrangler's own script with this Node.js (no shell), so the SQL reaches it as one argument on every OS.
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const out = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--local', '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as Array<{ results: Array<Record<string, unknown>> }>;
  return parsed.flatMap((r) => r.results ?? []);
}

export function insertUserSql(u: { username: string; displayName: string; role: 'driver' | 'employee'; passwordHash: string }): string {
  const now = new Date().toISOString();
  return `INSERT INTO users (username, display_name, role, password_hash, created_at, updated_at) VALUES (${[
    u.username,
    u.displayName,
    u.role,
    u.passwordHash,
    now,
    now,
  ]
    .map(sqlString)
    .join(', ')})`;
}
