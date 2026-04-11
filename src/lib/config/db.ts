// src/lib/config/db.ts
// Typed KV helper over iptv_config with optional Redis cache (60s TTL).
//
// Keys used so far:
//   m3u_url, xmltv_url, setup_complete, timezone, default_language,
//   firetv_optimizations, last_epg_ingest_at, provider_changed_at

import { query } from '@/lib/db/client';
import { getRedis } from '@/lib/cache/redis';

const CACHE_TTL_SEC = 60;
const CACHE_PREFIX = 'config:';

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Read a config value from the DB (with Redis cache).
 * Returns null if the key doesn't exist.
 */
export async function getConfig(key: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey(key));
      if (cached !== null) return cached === '__null__' ? null : cached;
    } catch {
      // fall through to DB
    }
  }

  try {
    const res = await query<{ value: string }>(
      'SELECT value FROM iptv_config WHERE key = $1',
      [key],
    );
    const value = res.rows[0]?.value ?? null;

    if (redis) {
      try {
        // Cache the null sentinel too so we don't hammer the DB for missing keys
        await redis.setex(cacheKey(key), CACHE_TTL_SEC, value ?? '__null__');
      } catch {
        // non-critical
      }
    }

    return value;
  } catch {
    return null;
  }
}

/**
 * Write a config value to the DB, invalidate Redis cache.
 * updatedBy is optional — only used for audit trail if provided.
 */
export async function setConfig(
  key: string,
  value: string,
  _updatedBy?: string,
): Promise<void> {
  await query(
    `INSERT INTO iptv_config (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = EXCLUDED.updated_at`,
    [key, value],
  );

  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(cacheKey(key));
    } catch {
      // non-critical
    }
  }
}

/**
 * Return the DB value for key, falling back to the given environment variable.
 * Useful for smooth migration from pure-env config → DB-backed config.
 */
export async function getConfigOrEnv(
  key: string,
  envVar: string,
): Promise<string | null> {
  const dbValue = await getConfig(key);
  if (dbValue !== null && dbValue !== '') return dbValue;
  return process.env[envVar] ?? null;
}
