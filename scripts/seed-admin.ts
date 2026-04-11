// scripts/seed-admin.ts
// Idempotent admin seed for foundry-iptv.
// If any user already exists in iptv_users, this is a no-op.
// Otherwise, creates jack@foundry.local as an admin with a freshly generated
// random password, prints the password ONCE, and exits.
//
// Usage (from repo root, env loaded from .env.local):
//   npm run seed:admin

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const connString = (process.env.DATABASE_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '')
  .replace(/\?$/, '');
const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
const ssl =
  sslMode === 'require' || sslMode === 'true' || sslMode === '1'
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({ connectionString: connString, ssl });

async function main(): Promise<void> {
  if (!connString) {
    console.error('[seed-admin] Fatal: DATABASE_URL is not set.');
    process.exit(1);
  }

  const existing = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM iptv_users',
  );
  const count = Number(existing.rows[0]?.count ?? '0');

  if (count > 0) {
    console.log(
      `[seed-admin] ${count} user(s) already exist. Skipping. (idempotent)`,
    );
    await pool.end();
    return;
  }

  const email = 'jack@foundry.local';
  const displayName = 'Jack';
  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO iptv_users (email, password_hash, display_name, is_admin)
     VALUES ($1, $2, $3, TRUE)`,
    [email, passwordHash, displayName],
  );

  console.log('[seed-admin] Admin user created.');
  console.log('  email:    ' + email);
  console.log('  password: ' + password);
  console.log('  NOTE: This password is only shown once. Save it now.');

  await pool.end();
}

main().catch((err) => {
  console.error('[seed-admin] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
