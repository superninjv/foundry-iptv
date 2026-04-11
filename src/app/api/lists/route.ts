// src/app/api/lists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const result = await query<{
    id: string;
    name: string;
    kind: string;
    channel_count: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT l.id, l.name, l.kind, l.created_at, l.updated_at,
            COALESCE(c.cnt, 0) AS channel_count
     FROM iptv_custom_lists l
     LEFT JOIN (
       SELECT list_id, COUNT(*) AS cnt
       FROM iptv_custom_list_channels
       GROUP BY list_id
     ) c ON c.list_id = l.id
     WHERE l.user_id = $1
     ORDER BY l.updated_at DESC`,
    [user.id],
  );

  return NextResponse.json({
    lists: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      channelCount: Number(r.channel_count),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: { name?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, kind } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const listKind = kind === 'parlay' || kind === 'dashboard' ? kind : 'playlist';

  const result = await query<{
    id: string;
    name: string;
    kind: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO iptv_custom_lists (user_id, name, kind)
     VALUES ($1, $2, $3)
     RETURNING id, name, kind, created_at, updated_at`,
    [user.id, name.trim(), listKind],
  );

  const row = result.rows[0];
  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      kind: row.kind,
      channelCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    { status: 201 },
  );
}
