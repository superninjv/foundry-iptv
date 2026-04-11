import { listChannels, getEpg } from '@/lib/threadfin/client';
import { requireAuth } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import TimelineGrid from '@/components/guide/TimelineGrid';
import SearchInput from '@/components/SearchInput';
import type { EpgProgram } from '@/lib/threadfin/types';

export const metadata = { title: 'Guide' };
export const revalidate = 0;

export default async function GuidePage() {
  const user = await requireAuth();

  const watchedResult = await query<{ channel_id: string }>(
    `SELECT DISTINCT channel_id
       FROM iptv_watch_history
      WHERE user_id = $1 AND media_type = 'live'`,
    [user.id],
  );
  const watchedSet = new Set(watchedResult.rows.map((r) => r.channel_id));

  if (watchedSet.size === 0) {
    return (
      <div className="p-4 pb-20 md:p-6 md:pb-6">
        <h1 className="mb-4 text-2xl font-bold">Program Guide</h1>
        <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-6 text-center">
          <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
            Nothing watched yet — search to discover.
          </p>
          <div className="w-full">
            <SearchInput initialQuery="" />
          </div>
        </div>
      </div>
    );
  }

  const allChannels = await listChannels();
  const channels = allChannels.filter((ch) => watchedSet.has(ch.id));

  const programsByChannel: Record<string, EpgProgram[]> = {};

  const batchSize = 50;
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (ch) => {
        const programs = await getEpg(ch.id);
        return { id: ch.id, programs };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        programsByChannel[result.value.id] = result.value.programs;
      }
    }
  }

  const serverNow = Date.now();
  const timeZone = process.env.APP_TIMEZONE || 'America/New_York';

  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      <h1 className="mb-4 text-2xl font-bold">Program Guide</h1>
      <TimelineGrid
        channels={channels}
        programsByChannel={programsByChannel}
        serverNow={serverNow}
        timeZone={timeZone}
      />
    </div>
  );
}
