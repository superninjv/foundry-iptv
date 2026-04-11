// src/app/api/lists/[listId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { listId } = await params;

  const listResult = await query<{ id: string; name: string; kind: string }>(
    `SELECT id, name, kind FROM iptv_custom_lists WHERE id = $1 AND user_id = $2`,
    [listId, user.id],
  );

  if (listResult.rows.length === 0) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  const channelsResult = await query<{ channel_id: string; position: number }>(
    `SELECT channel_id, position FROM iptv_custom_list_channels
     WHERE list_id = $1 ORDER BY position`,
    [listId],
  );

  return NextResponse.json({
    list: listResult.rows[0],
    channels: channelsResult.rows.map((r) => ({
      channelId: r.channel_id,
      position: r.position,
    })),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { listId } = await params;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const result = await query(
    `UPDATE iptv_custom_lists SET name = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3`,
    [name.trim(), listId, user.id],
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { listId } = await params;

  await query(
    `DELETE FROM iptv_custom_lists WHERE id = $1 AND user_id = $2`,
    [listId, user.id],
  );

  return new NextResponse(null, { status: 204 });
}
