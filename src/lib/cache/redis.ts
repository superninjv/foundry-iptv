// src/lib/cache/redis.ts
// Redis client for channel/EPG caching. Graceful fallback if REDIS_URL is unset
// or unreachable — every call path must work without Redis.

import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisDisabled = false;
let redisErrorLogged = false;

export function getRedis(): Redis | null {
  if (redisDisabled) return null;

  if (!redisClient) {
    const url = process.env.REDIS_URL;
    if (!url) {
      if (!redisErrorLogged) {
        console.info('[redis] No REDIS_URL — Redis disabled, using fallbacks');
        redisErrorLogged = true;
      }
      redisDisabled = true;
      return null;
    }

    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          if (!redisErrorLogged) {
            console.warn('[redis] Connection failed — disabling Redis');
            redisErrorLogged = true;
          }
          redisDisabled = true;
          redisClient = null;
          return null;
        }
        return Math.min(times * 500, 2000);
      },
      lazyConnect: true,
    });
    redisClient.on('error', (err) => {
      if (!redisErrorLogged) {
        console.warn('[redis] Connection error:', err.message, '— disabling Redis');
        redisErrorLogged = true;
      }
      redisDisabled = true;
      redisClient?.disconnect();
      redisClient = null;
    });
  }
  return redisClient;
}

/**
 * Get a cached value or compute and cache it. Never throws on Redis errors.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (redis) {
    try {
      const existing = await redis.get(key);
      if (existing) return JSON.parse(existing) as T;
    } catch {
      // fall through to compute
    }
  }

  const value = await compute();

  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // non-critical
    }
  }

  return value;
}

export async function invalidate(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // non-critical
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // non-critical
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  redisDisabled = false;
  redisErrorLogged = false;
}
