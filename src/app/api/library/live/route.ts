// src/app/api/library/live/route.ts
// Library-only Live: channels the authed user has actually watched.
// Mirrors the SQL used by src/app/(app)/live/page.tsx recent-watched lookup,
// enriched with the current Threadfin channel catalog so stale IDs get dropped.
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { listChannels } from '@/lib/threadfin/client';
import { query } from '@/lib/db/client';
import type { Channel } from '@/lib/threadfin/types';

export async function GET(_request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const [watched, allChannels] = await Promise.all([
    query<{ channel_id: string; started_at: string }>(
      `SELECT DISTINCT ON (channel_id) channel_id, started_at
         FROM iptv_watch_history
        WHERE user_id = $1 AND media_type = 'live'
        ORDER BY channel_id, started_at DESC`,
      [user.id],
    ),
    listChannels(),
  ]);

  // Map channel IDs against the current catalog, drop stale IDs.
  const channelMap = new Map<string, Channel>();
  for (const ch of allChannels) channelMap.set(ch.id, ch);

  // Sort by most-recent started_at descending, then resolve to Channel.
  const sorted = [...watched.rows].sort((a, b) =>
    a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
  );

  const channels: Channel[] = sorted
    .map((r) => channelMap.get(r.channel_id))
    .filter((ch): ch is Channel => !!ch);

  return NextResponse.json(
    { channels },
    {
      headers: {
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
      },
    },
  );
}
