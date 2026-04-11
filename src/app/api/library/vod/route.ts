// src/app/api/library/vod/route.ts
// Library-only VOD: movies the authed user has actually watched.
// Mirrors the SQL used by src/app/(app)/vod/page.tsx verbatim.
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET(_request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  try {
    const result = await query<{
      stream_id: number;
      name: string;
      cover: string | null;
      rating: string | null;
    }>(
      `SELECT v.stream_id, v.name, v.cover, v.rating
         FROM iptv_vod_cache v
         INNER JOIN (
           SELECT DISTINCT vod_stream_id
             FROM iptv_watch_history
            WHERE user_id = $1
              AND media_type = 'vod'
              AND vod_stream_id IS NOT NULL
         ) h ON h.vod_stream_id = v.stream_id
        WHERE v.media_type = 'movie'
        ORDER BY v.name`,
      [user.id],
    );

    const vod = result.rows.map((r) => ({
      stream_id: r.stream_id,
      name: r.name,
      stream_icon: r.cover,
      rating: r.rating,
      category_id: null,
      container_extension: null,
    }));

    return NextResponse.json(
      { vod },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    console.error('[api/library/vod]', err);
    return NextResponse.json({ error: 'Failed to load library vod' }, { status: 500 });
  }
}
