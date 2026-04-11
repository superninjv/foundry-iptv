import { requireAuth } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { listChannels } from '@/lib/threadfin/client';
import type { Channel } from '@/lib/threadfin/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ListActions from './ListActions';

export const metadata = { title: 'List Detail' };

interface ListRow {
  id: string;
  name: string;
  kind: string;
}

interface ChannelRow {
  channel_id: string;
  position: number;
}

const kindColors: Record<string, string> = {
  playlist: 'var(--accent)',
  parlay: 'var(--success)',
  dashboard: '#a78bfa',
};

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const user = await requireAuth();
  const { listId } = await params;

  // Fetch list metadata
  const listResult = await query<ListRow>(
    `SELECT id, name, kind FROM iptv_custom_lists WHERE id = $1 AND user_id = $2`,
    [listId, user.id],
  );

  if (listResult.rows.length === 0) notFound();

  const list = listResult.rows[0];

  // Fetch channels in this list
  const channelsResult = await query<ChannelRow>(
    `SELECT channel_id, position FROM iptv_custom_list_channels
     WHERE list_id = $1 ORDER BY position`,
    [listId],
  );

  // Resolve channel IDs to full Channel objects
  const allChannels = await listChannels();
  const channelMap = new Map<string, Channel>();
  for (const ch of allChannels) channelMap.set(ch.id, ch);

  const listChannelIds = channelsResult.rows.map((r) => r.channel_id);
  const resolvedChannels = channelsResult.rows
    .map((r) => channelMap.get(r.channel_id))
    .filter((ch): ch is Channel => !!ch);

  // Build multiview URL
  const multiviewUrl =
    resolvedChannels.length > 0
      ? `/multiview?channels=${listChannelIds.join(',')}`
      : null;

  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      {/* Back link */}
      <Link
        href="/lists"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: 'var(--fg-muted)', minHeight: '48px' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Lists
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
          {list.name}
        </h1>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: `${kindColors[list.kind] || 'var(--fg-muted)'}20`,
            color: kindColors[list.kind] || 'var(--fg-muted)',
          }}
        >
          {list.kind}
        </span>
      </div>

      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        {multiviewUrl && (
          <Link
            href={multiviewUrl}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#07090c',
              minHeight: '48px',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Watch All
          </Link>
        )}
      </div>

      {/* Client component for interactive actions (add/remove/delete/reorder) */}
      <ListActions
        listId={list.id}
        listName={list.name}
        channels={resolvedChannels}
        channelIds={listChannelIds}
        allChannels={allChannels}
      />
    </div>
  );
}
