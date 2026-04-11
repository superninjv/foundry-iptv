// src/middleware.ts
// Setup gate (Track E) runs BEFORE the auth checks.
// Middleware runtime choice: Node.js (Option C).
// We use `export const runtime = 'nodejs'` so we can read the DB-backed
// setup_complete flag directly via the iptv_config table. Edge runtime
// cannot reach local Postgres or ioredis, so Option C (Node middleware) is
// the cleanest solution for Next.js 16.
//
// Auth paths (Track D, unchanged):
//   1. Cookie-based (NextAuth JWT) — web clients
//   2. Bearer token (device tokens) — Rust native clients
//      Authorization: Bearer <rawToken>  →  SHA-256 hash looked up in iptv_device_tokens
// Auth checks ALSO happen at the data-access layer (see src/lib/auth/session.ts).

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/db';

const STATIC_EXTENSIONS = [
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.css', '.js', '.map', '.woff', '.woff2', '.ttf', '.eot',
];

// Paths exempt from both the setup gate and auth check.
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/health',
  '/setup',
  '/api/setup',
];

// (app)/* routes — any top-level segment the app layout owns. Checked by
// exclusion: everything that isn't public and isn't a static file is gated.
const APP_PREFIXES = [
  '/live',
  '/guide',
  '/watch',
  '/multiview',
  '/vod',
  '/series',
  '/search',
  '/lists',
  '/settings',
  '/admin',
  '/api/channels',
  '/api/epg',
  '/api/stream',
  '/api/vod',
  '/api/series',
  '/api/search',
  '/api/lists',
  '/api/admin',
  '/api/startup',
];

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;
  if (pathname.startsWith('/_next')) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return true;
  }
  return false;
}

function isAppRoute(pathname: string): boolean {
  for (const prefix of APP_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return true;
  }
  return false;
}

async function getSessionFromToken(req: NextRequest) {
  const secureCookie = process.env.NODE_ENV === 'production';
  const cookieName = secureCookie
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const token = req.cookies.get(cookieName)?.value;
  if (!token) return null;

  try {
    const hkdfFn = (await import('@panva/hkdf')).default;
    const { jwtDecrypt } = await import('jose');
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;

    const derivedKey = await hkdfFn(
      'sha256',
      secret,
      cookieName,
      'Auth.js Generated Encryption Key (' + cookieName + ')',
      64,
    );

    const { payload } = await jwtDecrypt(token, derivedKey, {
      clockTolerance: 15,
      contentEncryptionAlgorithms: ['A256CBC-HS512', 'A256GCM'],
    });

    if (!payload.sub && !payload.userId) return null;
    return {
      id: (payload.userId || payload.sub) as string,
      isAdmin: !!payload.isAdmin,
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CVE-2025-29927 mitigation — strip the subrequest bypass header.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-middleware-subrequest');

  if (isPublicRoute(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Setup gate (Track E) ───────────────────────────────────────────────────
  // Non-public routes are redirected to /setup until setup_complete='true'.
  // We read from iptv_config — safe here because runtime = 'nodejs'.
  try {
    const setupComplete = await getConfig('setup_complete');
    if (setupComplete !== 'true') {
      const setupUrl = new URL('/setup', req.url);
      return NextResponse.redirect(setupUrl);
    }
  } catch {
    // If DB is unreachable during startup, let the request through so error
    // pages can render. The app itself will fail gracefully.
  }
  // ── End setup gate ────────────────────────────────────────────────────────

  if (isAppRoute(pathname)) {
    // Bearer token path — Rust native clients send Authorization: Bearer <token>.
    // We can't do a DB lookup in Edge, so we pass the token through via a
    // request header. The actual validation happens in getApiUser() / route
    // handlers (Node.js runtime). We only skip the cookie check here.
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      // Forward the bearer token as a sanitised header the route handler can read.
      // Stripping the original authorization header prevents double-processing.
      requestHeaders.set('x-device-bearer', authHeader.slice('Bearer '.length).trim());
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      return res;
    }

    const session = await getSessionFromToken(req);
    if (!session?.id) {
      // API routes: 401 JSON. Pages: redirect to login.
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-user-id', session.id);
    return res;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
