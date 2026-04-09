// src/lib/db/client.ts
// Postgres pool for foundry-iptv. Single-tenant, LAN-local foundry-01.
// No RLS, no tenant context — this is a home app.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// foundry-01 Postgres is on the loopback — SSL is off by default.
// If DATABASE_SSL=require is set, enable plain SSL without cert pinning.
function getSSLConfig(): false | { rejectUnauthorized: boolean } {
  const mode = (process.env.DATABASE_SSL || '').toLowerCase();
  if (mode === 'require' || mode === 'true' || mode === '1') {
    return { rejectUnauthorized: false };
  }
  return false;
}

// Strip any sslmode from the URL — pg 9+ would otherwise force verify-full.
const connectionString = (process.env.DATABASE_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '')
  .replace(/\?$/, '');

const pool = new Pool({
  connectionString,
  min: 2,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: getSSLConfig(),
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/** Run a single query against the pool. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Get a raw client from the pool. Caller MUST call client.release(). */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Run a callback inside a BEGIN/COMMIT transaction. Rolls back on throw.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Quick connectivity check for health endpoints. */
export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
