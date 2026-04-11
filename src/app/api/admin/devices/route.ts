// src/app/api/admin/devices/route.ts
// GET: list device tokens. DELETE: revoke by id. Admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const res = await query<{
    id: string;
    label: string;
    platform: string;
    user_email: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    `SELECT t.id, t.label, t.platform, u.email AS user_email,
            t.created_at, t.last_used_at, t.expires_at, t.revoked_at
     FROM iptv_device_tokens t
     JOIN iptv_users u ON u.id = t.user_id
     ORDER BY t.created_at DESC`,
  );

  return NextResponse.json({ tokens: res.rows });
}

export async function DELETE(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const { id } = await req.json().catch(() => ({ id: null })) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await query(
    'UPDATE iptv_device_tokens SET revoked_at = NOW() WHERE id = $1',
    [id],
  );

  return NextResponse.json({ ok: true });
}
