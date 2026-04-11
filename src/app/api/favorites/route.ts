// src/app/api/favorites/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const result = await query<{ channel_id: string }>(
    'SELECT channel_id FROM iptv_favorites WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id],
  );

  return NextResponse.json({
    favorites: result.rows.map((r) => r.channel_id),
  });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { channelId } = await request.json();
  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
  }

  await query(
    'INSERT INTO iptv_favorites (user_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [user.id, channelId],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { channelId } = await request.json();
  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
  }

  await query(
    'DELETE FROM iptv_favorites WHERE user_id = $1 AND channel_id = $2',
    [user.id, channelId],
  );

  return new NextResponse(null, { status: 204 });
}
