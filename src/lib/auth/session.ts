// src/lib/auth/session.ts
// Server-side session helpers for Route Handlers and Server Components.
// Defense-in-depth — middleware gates (app)/* routes, but auth checks should
// also happen at data-access sites.
//
// Two auth strategies:
//   1. NextAuth JWT cookie — web clients
//   2. x-device-bearer header (SHA-256 of raw token in iptv_device_tokens) — Rust clients

import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

/** Validate a device bearer token from the x-device-bearer header. */
async function getUserFromBearerToken(rawToken: string): Promise<SessionUser | null> {
  try {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const { query } = await import('@/lib/db/client');
    const res = await query<{
      user_id: string;
      id: string;
    }>(
      `SELECT t.user_id, t.id
       FROM iptv_device_tokens t
       WHERE t.token_hash = $1
         AND t.revoked_at IS NULL
         AND (t.expires_at IS NULL OR t.expires_at > NOW())`,
      [tokenHash],
    );
    if (res.rows.length === 0) return null;

    const { user_id: userId, id: tokenId } = res.rows[0];

    // Update last_used_at (fire-and-forget)
    query(
      'UPDATE iptv_device_tokens SET last_used_at = NOW() WHERE id = $1',
      [tokenId],
    ).catch(() => {});

    const userRes = await query<{
      id: string;
      email: string;
      display_name: string | null;
      is_admin: boolean;
    }>(
      'SELECT id, email, display_name, is_admin FROM iptv_users WHERE id = $1',
      [userId],
    );
    if (userRes.rows.length === 0) return null;

    const u = userRes.rows[0];
    return {
      id: u.id,
      email: u.email,
      name: u.display_name ?? u.email,
      isAdmin: u.is_admin,
    };
  } catch {
    return null;
  }
}

/** Get the current authenticated user or null (does not redirect). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isAdmin: session.user.isAdmin,
  };
}

/** Require auth; redirect to /login if unauthenticated. Use in Server Components. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Require admin; redirect unauthorized to /live. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (!user.isAdmin) redirect('/live');
  return user;
}

/** For API routes: checks cookie session first, then device bearer token. */
export async function getApiUser(): Promise<SessionUser | null> {
  // Try cookie-based session first (web clients)
  const cookieUser = await getCurrentUser();
  if (cookieUser) return cookieUser;

  // Try device bearer token (Rust native clients)
  // The middleware sets x-device-bearer from the Authorization: Bearer header
  try {
    const headersList = await headers();
    const rawToken = headersList.get('x-device-bearer');
    if (rawToken) {
      return getUserFromBearerToken(rawToken);
    }
  } catch {
    // headers() not available outside route handlers — ignore
  }

  return null;
}

export function unauthorized(message = 'Authentication required') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Insufficient permissions') {
  return NextResponse.json({ error: message }, { status: 403 });
}
