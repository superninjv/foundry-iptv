// src/app/api/admin/sessions/route.ts
// GET: list active sessions. DELETE: revoke by id. Admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const res = await query<{
    id: string;
    user_id: string;
    email: string;
    display_name: string | null;
    created_at: string;
    expires_at: string;
    ip_address: string | null;
  }>(
    `SELECT s.id, s.user_id, u.email, u.display_name,
            s.created_at, s.expires_at, s.ip_address
     FROM iptv_sessions s
     JOIN iptv_users u ON u.id = s.user_id
     WHERE s.expires_at > NOW()
     ORDER BY s.created_at DESC`,
  );

  return NextResponse.json({ sessions: res.rows });
}

export async function DELETE(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const { id } = await req.json().catch(() => ({ id: null })) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await query('DELETE FROM iptv_sessions WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
