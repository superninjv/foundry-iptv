// src/app/api/lists/[listId]/channels/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/client';

/** Verify the list belongs to the user. Returns true if owned. */
async function verifyOwnership(listId: string, userId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM iptv_custom_lists WHERE id = $1 AND user_id = $2`,
    [listId, userId],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { listId } = await params;

  if (!(await verifyOwnership(listId, user.id))) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  let body: { channelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelId } = body;

  if (!channelId || typeof channelId !== 'string') {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  // Get the next position
  const posResult = await query<{ next_pos: string }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
     FROM iptv_custom_list_channels WHERE list_id = $1`,
    [listId],
  );
  const nextPos = Number(posResult.rows[0].next_pos);

  await query(
    `INSERT INTO iptv_custom_list_channels (list_id, channel_id, position)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [listId, channelId, nextPos],
  );

  // Touch the list's updated_at
  await query(
    `UPDATE iptv_custom_lists SET updated_at = NOW() WHERE id = $1`,
    [listId],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { listId } = await params;

  if (!(await verifyOwnership(listId, user.id))) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  let body: { channelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelId } = body;

  if (!channelId || typeof channelId !== 'string') {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  await query(
    `DELETE FROM iptv_custom_list_channels WHERE list_id = $1 AND channel_id = $2`,
    [listId, channelId],
  );

  // Touch the list's updated_at
  await query(
    `UPDATE iptv_custom_lists SET updated_at = NOW() WHERE id = $1`,
    [listId],
  );

  return new NextResponse(null, { status: 204 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { listId } = await params;

  if (!(await verifyOwnership(listId, user.id))) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  let body: { channelIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelIds } = body;

  if (!Array.isArray(channelIds)) {
    return NextResponse.json(
      { error: 'channelIds must be an array' },
      { status: 400 },
    );
  }

  const validIds = channelIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );

  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM iptv_custom_list_channels WHERE list_id = $1`,
      [listId],
    );

    for (let i = 0; i < validIds.length; i++) {
      await client.query(
        `INSERT INTO iptv_custom_list_channels (list_id, channel_id, position)
         VALUES ($1, $2, $3)`,
        [listId, validIds[i], i],
      );
    }

    await client.query(
      `UPDATE iptv_custom_lists SET updated_at = NOW() WHERE id = $1`,
      [listId],
    );
  });

  return NextResponse.json({ ok: true });
}
