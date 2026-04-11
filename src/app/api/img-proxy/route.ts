// src/app/api/img-proxy/route.ts
// Thin image proxy: fetches a remote URL, resizes via sharp, returns WebP.
// Cached in Redis with a 7-day TTL to avoid hammering provider CDNs.
//
// SSRF protection: only http/https URLs that do not resolve to localhost or
// RFC 1918 private ranges are accepted (basic check via hostname blocklist).

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getRedis } from '@/lib/cache/redis';

// Private/loopback ranges we refuse to proxy to.
const BLOCKED_HOSTNAMES = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i;
const BLOCKED_PRIVATE_PREFIXES = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname;
  if (BLOCKED_HOSTNAMES.test(host)) return false;
  if (BLOCKED_PRIVATE_PREFIXES.some((re) => re.test(host))) return false;
  return true;
}

function cacheKey(url: string, w: number | null): string {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return `img:${hash}:${w ?? 'orig'}`;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const MAX_WIDTH = 512;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawUrl = searchParams.get('u');
  const wParam = searchParams.get('w');
  const width = wParam ? Math.min(Math.max(1, parseInt(wParam, 10)), MAX_WIDTH) : null;

  if (!rawUrl) {
    return new NextResponse('Missing ?u= parameter', { status: 400 });
  }
  if (!isSafeUrl(rawUrl)) {
    return new NextResponse('Blocked URL', { status: 400 });
  }

  const key = cacheKey(rawUrl, width);
  const redis = getRedis();

  // Check Redis cache (stored as base64 to avoid binary encoding issues).
  if (redis) {
    try {
      const cached = await redis.getBuffer(key);
      if (cached) {
        return new NextResponse(new Uint8Array(cached), {
          status: 200,
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=604800, immutable',
            'X-Cache': 'HIT',
          },
        });
      }
    } catch {
      // Cache miss or Redis error — fall through to fetch.
    }
  }

  // Fetch the remote image with a 5s timeout.
  let fetchRes: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetchRes = await fetch(rawUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FoundryIPTV/1.0 img-proxy' },
    });
    clearTimeout(timer);
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 });
  }

  if (!fetchRes.ok) {
    return new NextResponse(`Upstream error ${fetchRes.status}`, { status: 502 });
  }

  const inputBuffer = Buffer.from(await fetchRes.arrayBuffer());

  // Resize + convert to WebP via sharp.
  let outputBuffer: Buffer;
  try {
    // Dynamic import so the module is only loaded server-side.
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(inputBuffer);
    if (width) {
      pipeline = pipeline.resize(width, undefined, { withoutEnlargement: true });
    }
    outputBuffer = await pipeline.webp({ quality: 80 }).toBuffer();
  } catch {
    // If sharp fails (corrupt image, unsupported format), fall back to raw bytes.
    outputBuffer = inputBuffer;
    // Store and return with a shorter TTL for failures.
    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': fetchRes.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Store processed bytes in Redis.
  if (redis) {
    try {
      await redis.setex(key, SEVEN_DAYS, outputBuffer);
    } catch {
      // Non-critical.
    }
  }

  return new NextResponse(new Uint8Array(outputBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=604800, immutable',
      'X-Cache': 'MISS',
    },
  });
}
