// src/app/api/library/series/route.ts
// Library-only Series: series the authed user has actually watched.
// Mirrors the SQL used by src/app/(app)/series/page.tsx verbatim.
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
              AND media_type = 'series'
              AND vod_stream_id IS NOT NULL
         ) h ON h.vod_stream_id = v.stream_id
        WHERE v.media_type = 'series'
        ORDER BY v.name`,
      [user.id],
    );

    const series = result.rows.map((r) => ({
      // Web's series table keys off vod_cache.stream_id, but the Rust
      // SeriesItem model expects series_id — alias it here so clients can
      // reuse the same RawSeries deserialization path as /api/series.
      series_id: r.stream_id,
      name: r.name,
      cover: r.cover,
      plot: null,
      genre: null,
      rating: r.rating,
      category_id: null,
    }));

    return NextResponse.json(
      { series },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    console.error('[api/library/series]', err);
    return NextResponse.json({ error: 'Failed to load library series' }, { status: 500 });
  }
}
