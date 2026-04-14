// src/app/api/admin/users/route.ts
// GET: list users. POST: create. DELETE: remove. Admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const res = await query<{
    id: string;
    email: string;
    display_name: string | null;
    is_admin: boolean;
    created_at: string;
  }>(
    'SELECT id, email, display_name, is_admin, created_at FROM iptv_users ORDER BY created_at ASC',
  );

  return NextResponse.json({ users: res.rows });
}

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const { hashPassword } = await import('@/lib/auth/passwords');
  const hash = await hashPassword(body.password);

  await query(
    `INSERT INTO iptv_users (id, email, display_name, password_hash, is_admin, can_manage_sessions)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      (body.email as string).toLowerCase().trim(),
      body.name ?? null,
      hash,
      !!body.isAdmin,
      !!body.isAdmin,
    ],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const { id } = await req.json().catch(() => ({ id: null })) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await query('DELETE FROM iptv_users WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
