// src/app/api/settings/sessions/route.ts
// Session management: list sessions, logout others.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { auth } from '@/lib/auth/config';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const session = await auth();
  const currentSessionId = session?.sessionId;

  const res = await query<{
    id: string;
    created_at: string;
    expires_at: string;
    ip_address: string | null;
    user_agent: string | null;
  }>(
    `SELECT id, created_at, expires_at, ip_address, user_agent
     FROM iptv_sessions
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [user.id],
  );

  const sessions = res.rows.map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    ipAddress: s.ip_address,
    userAgent: s.user_agent,
    isCurrent: s.id === currentSessionId,
  }));

  return NextResponse.json({ sessions });
}

export async function DELETE(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body.action !== 'logout_others') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const session = await auth();
  const currentSessionId = session?.sessionId;

  if (!currentSessionId) {
    return NextResponse.json({ error: 'No current session' }, { status: 400 });
  }

  const result = await query(
    `DELETE FROM iptv_sessions WHERE user_id = $1 AND id != $2`,
    [user.id, currentSessionId],
  );

  return NextResponse.json({
    ok: true,
    deletedCount: result.rowCount ?? 0,
  });
}
