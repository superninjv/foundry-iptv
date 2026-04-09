// src/lib/auth/session.ts
// Server-side session helpers for Route Handlers and Server Components.
// Defense-in-depth — middleware gates (app)/* routes, but auth checks should
// also happen at data-access sites.

import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
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

/** For API routes: returns 401 JSON if unauthenticated. */
export async function getApiUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}

export function unauthorized(message = 'Authentication required') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Insufficient permissions') {
  return NextResponse.json({ error: message }, { status: 403 });
}
