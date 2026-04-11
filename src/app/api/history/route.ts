// src/app/api/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

type MediaType = 'live' | 'vod' | 'series';

function isMediaType(value: unknown): value is MediaType {
  return value === 'live' || value === 'vod' || value === 'series';
}

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const mediaTypeParam = request.nextUrl.searchParams.get('mediaType');
  const mediaType = isMediaType(mediaTypeParam) ? mediaTypeParam : null;

  if (mediaType) {
    const result = await query<{
      channel_id: string;
      started_at: Date;
      media_type: MediaType;
      vod_stream_id: string | null;
    }>(
      `SELECT channel_id, started_at, media_type, vod_stream_id
         FROM iptv_watch_history
        WHERE user_id = $1 AND media_type = $2
        ORDER BY started_at DESC
        LIMIT 20`,
      [user.id, mediaType],
    );
    return NextResponse.json({
      history: result.rows.map((r) => ({
        channelId: r.channel_id,
        startedAt: r.started_at.toISOString(),
        mediaType: r.media_type,
        vodStreamId: r.vod_stream_id !== null ? Number(r.vod_stream_id) : null,
      })),
    });
  }

  const result = await query<{ channel_id: string; started_at: Date }>(
    'SELECT channel_id, started_at FROM iptv_watch_history WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20',
    [user.id],
  );

  return NextResponse.json({
    history: result.rows.map((r) => ({
      channelId: r.channel_id,
      startedAt: r.started_at.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { channelId, mediaType: rawMediaType, vodStreamId: rawVodStreamId } = body ?? {};

  const mediaType: MediaType = isMediaType(rawMediaType) ? rawMediaType : 'live';

  if (mediaType === 'live') {
    if (!channelId || typeof channelId !== 'string') {
      return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
    }
    await query(
      'INSERT INTO iptv_watch_history (user_id, channel_id, media_type) VALUES ($1, $2, $3)',
      [user.id, channelId, 'live'],
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // vod or series — require vodStreamId
  const vodStreamId =
    typeof rawVodStreamId === 'number'
      ? rawVodStreamId
      : typeof rawVodStreamId === 'string' && /^\d+$/.test(rawVodStreamId)
        ? parseInt(rawVodStreamId, 10)
        : null;

  if (vodStreamId === null || !Number.isFinite(vodStreamId)) {
    return NextResponse.json(
      { error: 'Missing or invalid vodStreamId' },
      { status: 400 },
    );
  }

  // channel_id is NOT NULL on the table; store the vod stream id as a string
  // so the legacy column stays populated without coupling to live channel IDs.
  const channelKey = `${mediaType}:${vodStreamId}`;

  await query(
    `INSERT INTO iptv_watch_history (user_id, channel_id, media_type, vod_stream_id)
     VALUES ($1, $2, $3, $4)`,
    [user.id, channelKey, mediaType, vodStreamId],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
