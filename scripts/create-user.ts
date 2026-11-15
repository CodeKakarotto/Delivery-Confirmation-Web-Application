/**
 * Creates a sign-in account in the LOCAL database and prints its one-time password.
 *
 *   npm run users:create -- <username> <driver|employee> "<Display Name>"
 *
 * The password is generated (16 random characters) and shown once; only its hash is stored.
 */
import { d1, generatePassword, hashPassword, insertUserSql, USERNAME } from './accounts.ts';

const [username, role, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(' ').trim();

if (!username || !USERNAME.test(username) || (role !== 'driver' && role !== 'employee') || !displayName || displayName.length > 80) {
  console.error('Usage: npm run users:create -- <username> <driver|employee> "<Display Name>"');
  console.error('Username: 3-40 characters, lowercase letters, numbers, dot, dash or underscore.');
  process.exit(1);
}

const existing = d1(`SELECT COUNT(*) AS n FROM users WHERE username = '${username}'`);
if (Number(existing[0]?.n ?? 0) > 0) {
  console.error(`An account named "${username}" already exists.`);
  process.exit(1);
}

const password = generatePassword();
d1(insertUserSql({ username, displayName, role, passwordHash: hashPassword(password) }));
console.log(`Created ${role} account "${username}" (${displayName}).`);
console.log(`Password (shown once, share it privately): ${password}`);
