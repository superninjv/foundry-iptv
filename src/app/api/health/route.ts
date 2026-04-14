// src/app/api/health/route.ts
// Unauthenticated health check — used by Docker HEALTHCHECK and install.sh.
// Returns 200 even when degraded so the healthcheck never fails during setup.

import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { getRedis } from '@/lib/cache/redis';
import { getConfig } from '@/lib/config/db';

const VERSION = process.env.NEXT_PUBLIC_GIT_SHA || process.env.npm_package_version || 'dev';

async function checkPostgres(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2000);
    await query('SELECT 1');
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const redis = getRedis();
    if (!redis) return false;
    const result = await Promise.race<string | null>([
      redis.ping(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  }
}

async function checkTs2hls(): Promise<boolean> {
  const ts2hlsUrl = process.env.TS2HLS_URL;
  if (!ts2hlsUrl) return false;
  try {
    const res = await fetch(`${ts2hlsUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [postgres, redis, ts2hls, setupComplete] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkTs2hls(),
    getConfig('setup_complete').then((v) => v === 'true').catch(() => false),
  ]);

  const status = postgres && redis ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      postgres,
      redis,
      ts2hls,
      setup_complete: setupComplete,
      version: VERSION,
    },
    { status: 200 },
  );
}
