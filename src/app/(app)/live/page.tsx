import { listChannels, getCategories, getBulkNowPlaying } from '@/lib/threadfin/client';
import { query } from '@/lib/db/client';
import { requireAuth } from '@/lib/auth/session';
import ChannelGrid from '@/components/ChannelGrid';
import type { Channel } from '@/lib/threadfin/types';

export const metadata = { title: 'Live TV' };
export const revalidate = 300; // ISR: regenerate every 5 min

const CHANNELS_PER_PAGE = 60;
const MAX_FAVORITES = 20;
const MAX_RECENT = 10;

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; q?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  const selectedCategory = params.category || 'All';
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const nameQuery = (params.q || '').trim();
  const nameQueryLower = nameQuery.toLowerCase();

  const [allChannels, categories] = await Promise.all([
    listChannels(),
    getCategories(),
  ]);

  // Build channel lookup map
  const channelMap = new Map<string, Channel>();
  for (const ch of allChannels) channelMap.set(ch.id, ch);

  // Filter by category, then by name substring
  let filteredChannels =
    selectedCategory === 'All'
      ? allChannels
      : allChannels.filter((ch) => ch.group === selectedCategory);

  if (nameQueryLower) {
    filteredChannels = filteredChannels.filter((ch) =>
      ch.name.toLowerCase().includes(nameQueryLower),
    );
  }

  const totalFiltered = filteredChannels.length;

  // Paginate
  const start = (page - 1) * CHANNELS_PER_PAGE;
  const paginatedChannels = filteredChannels.slice(start, start + CHANNELS_PER_PAGE);

  // Fetch favorites and history from DB
  const [favResult, histResult] = await Promise.all([
    query<{ channel_id: string }>(
      'SELECT channel_id FROM iptv_favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [user.id, MAX_FAVORITES],
    ),
    query<{ channel_id: string }>(
      'SELECT DISTINCT ON (channel_id) channel_id FROM iptv_watch_history WHERE user_id = $1 ORDER BY channel_id, started_at DESC LIMIT $2',
      [user.id, MAX_RECENT],
    ),
  ]);

  // Resolve IDs to Channel objects
  const favoriteChannels = favResult.rows
    .map((r) => channelMap.get(r.channel_id))
    .filter((ch): ch is Channel => !!ch);

  const recentChannels = histResult.rows
    .map((r) => channelMap.get(r.channel_id))
    .filter((ch): ch is Channel => !!ch);

  // Only fetch now-playing for channels we actually render
  const renderedIds = new Set<string>();
  for (const ch of paginatedChannels) renderedIds.add(ch.id);
  for (const ch of favoriteChannels) renderedIds.add(ch.id);
  for (const ch of recentChannels) renderedIds.add(ch.id);

  const nowPlaying = await getBulkNowPlaying([...renderedIds]);

  if (allChannels.length === 0) {
    return (
      <div className="p-4 pb-20 md:p-6 md:pb-6">
        <h1 className="mb-4 text-2xl font-bold">Live TV</h1>
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-center text-lg" style={{ color: 'var(--fg-muted)' }}>
            No channels loaded. Check Threadfin configuration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      <h1 className="mb-4 text-2xl font-bold">Live TV</h1>
      <ChannelGrid
        channels={paginatedChannels}
        categories={categories}
        favoriteChannels={favoriteChannels}
        recentChannels={recentChannels}
        nowPlaying={nowPlaying}
        selectedCategory={selectedCategory}
        nameQuery={nameQuery}
        page={page}
        totalFiltered={totalFiltered}
        totalChannels={allChannels.length}
      />
    </div>
  );
}
