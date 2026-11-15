/**
 * Creates demo sign-in accounts in the LOCAL database the first time (when it has no accounts yet), with freshly
 * generated passwords. The usernames and passwords are printed and saved to demo-accounts.local.txt, which git
 * ignores. Run again any time to see where they are; it never changes existing accounts.
 *
 *   npm run users:demo
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { d1, generatePassword, hashPassword, insertUserSql } from './accounts.ts';

const FILE = 'demo-accounts.local.txt';
const DEMO = [
  { username: 'driver1', displayName: 'Dana Driver', role: 'driver' },
  { username: 'driver2', displayName: 'Devon Driver', role: 'driver' },
  { username: 'employee1', displayName: 'Erin Employee', role: 'employee' },
  { username: 'employee2', displayName: 'Eli Employee', role: 'employee' },
] as const;

const count = Number(d1('SELECT COUNT(*) AS n FROM users')[0]?.n ?? 0);
if (count > 0) {
  console.log(`Sign-in accounts already exist (${count}).`);
  if (existsSync(FILE)) console.log(readFileSync(FILE, 'utf8'));
  else console.log('Create more with: npm run users:create -- <username> <driver|employee> "<Display Name>"');
  process.exit(0);
}

const lines = ['Michael\'s Flowers delivery confirmation: LOCAL demo accounts (do not commit, do not reuse).', ''];
for (const u of DEMO) {
  const password = generatePassword();
  d1(insertUserSql({ ...u, passwordHash: hashPassword(password) }));
  lines.push(`${u.role.padEnd(9)} username: ${u.username.padEnd(10)} password: ${password}   (${u.displayName})`);
}
const text = `${lines.join('\n')}\n`;
writeFileSync(FILE, text, { mode: 0o600 });
console.log(text);
console.log(`Saved to ${FILE} (ignored by git).`);
