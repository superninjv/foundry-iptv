import 'dotenv/config';
// src/lib/db/migrate.ts
// Tiny migration runner for foundry-iptv.
// Reads migrations/*.sql in lexicographic order and applies any not yet in
// iptv_migrations. Each migration runs inside a single transaction together
// with its tracking INSERT, so partial application is impossible.
//
// Usage:
//   npx tsx src/lib/db/migrate.ts --up
//   npx tsx src/lib/db/migrate.ts --status

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const connString = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '');
const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
const ssl =
  sslMode === 'require' || sslMode === 'true' || sslMode === '1'
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({ connectionString: connString, ssl });

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iptv_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getApplied(): Promise<string[]> {
  const res = await pool.query<{ filename: string }>(
    'SELECT filename FROM iptv_migrations ORDER BY id ASC',
  );
  return res.rows.map((r) => r.filename);
}

function getFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
}

async function migrateUp(): Promise<void> {
  const applied = await getApplied();
  const files = getFiles();
  const pending = files.filter((f) => !applied.includes(f));

  if (pending.length === 0) {
    console.log('[migrate] All migrations are up to date.');
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s) to apply.\n`);

  for (const filename of pending) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf-8');

    console.log(`[migrate] Applying ${filename} ...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO iptv_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      console.log(`[migrate] ok ${filename}`);
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => {});
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[migrate] fail ${filename} — ${msg}`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`\n[migrate] Done. Applied ${pending.length} migration(s).`);
}

async function showStatus(): Promise<void> {
  const applied = await getApplied();
  const files = getFiles();

  console.log('[migrate] Migration status:\n');
  for (const filename of files) {
    const isApplied = applied.includes(filename);
    const marker = isApplied ? 'x' : '.';
    console.log(`  [${marker}] ${filename}`);
  }
  const pending = files.filter((f) => !applied.includes(f));
  console.log(`\n  Applied: ${applied.length}  Pending: ${pending.length}`);
}

async function migrateDown(): Promise<void> {
  const applied = await getApplied();
  if (applied.length === 0) {
    console.log('[migrate] Nothing to roll back.');
    return;
  }
  const last = applied[applied.length - 1];
  const downFile = path.join(MIGRATIONS_DIR, last.replace('.sql', '.down.sql'));
  if (!fs.existsSync(downFile)) {
    console.error(`[migrate] No .down.sql file for ${last} — roll back manually.`);
    process.exit(1);
  }
  const sql = fs.readFileSync(downFile, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM iptv_migrations WHERE filename = $1', [last]);
    await client.query('COMMIT');
    console.log(`[migrate] rolled back ${last}`);
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[migrate] rollback failed — ${msg}`);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  try {
    await ensureMigrationsTable();
    switch (arg) {
      case '--up':
        await migrateUp();
        break;
      case '--down':
        await migrateDown();
        break;
      case '--status':
        await showStatus();
        break;
      default:
        console.log('Usage: tsx src/lib/db/migrate.ts [--up | --down | --status]');
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[migrate] Fatal:', msg);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
