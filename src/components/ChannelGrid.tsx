import Link from 'next/link';
import type { Channel } from '@/lib/threadfin/types';
import LiveSearchInput from './LiveSearchInput';

const CHANNELS_PER_PAGE = 60;

interface ChannelGridProps {
  channels: Channel[];
  categories: string[];
  favoriteChannels: Channel[];
  recentChannels: Channel[];
  nowPlaying: Record<string, string>;
  selectedCategory: string;
  nameQuery: string;
  page: number;
  totalFiltered: number;
  totalChannels: number;
}

function ChannelCard({
  channel,
  nowTitle,
}: {
  channel: Channel;
  nowTitle?: string;
}) {
  return (
    <Link
      href={`/watch/${channel.id}`}
      className="flex items-center gap-3 rounded-lg border p-3"
      style={{
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
        minHeight: '48px',
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <span className="text-lg font-bold" style={{ color: 'var(--fg-muted)' }}>
            {channel.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--fg)' }}>
          {channel.name}
        </p>
        {nowTitle && (
          <p className="truncate text-xs" style={{ color: 'var(--fg-muted)' }}>
            {nowTitle}
          </p>
        )}
      </div>
    </Link>
  );
}

function HorizontalRow({
  title,
  channels,
  nowPlaying,
}: {
  title: string;
  channels: Channel[];
  nowPlaying: Record<string, string>;
}) {
  if (channels.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-base font-semibold" style={{ color: 'var(--fg)' }}>
        {title}
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {channels.map((ch) => (
          <div key={ch.id} className="w-44 shrink-0">
            <ChannelCard channel={ch} nowTitle={nowPlaying[ch.id]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryPills({
  categories,
  selected,
  nameQuery,
}: {
  categories: string[];
  selected: string;
  nameQuery: string;
}) {
  // Preserve the name query when switching categories so a search doesn't
  // get blown away by clicking a pill.
  const qSuffix = nameQuery ? `&q=${encodeURIComponent(nameQuery)}` : '';
  const allHref = nameQuery ? `/live?q=${encodeURIComponent(nameQuery)}` : '/live';
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
      <Link
        href={allHref}
        className="shrink-0 rounded-full px-4 py-2 text-sm font-medium"
        style={{
          backgroundColor: selected === 'All' ? 'var(--accent)' : 'var(--bg-raised)',
          color: selected === 'All' ? 'var(--bg)' : 'var(--fg-muted)',
          border: '1px solid',
          borderColor: selected === 'All' ? 'var(--accent)' : 'var(--border)',
          minHeight: '48px',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        All
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat}
          href={`/live?category=${encodeURIComponent(cat)}${qSuffix}`}
          className="shrink-0 rounded-full px-4 py-2 text-sm font-medium"
          style={{
            backgroundColor: selected === cat ? 'var(--accent)' : 'var(--bg-raised)',
            color: selected === cat ? 'var(--bg)' : 'var(--fg-muted)',
            border: '1px solid',
            borderColor: selected === cat ? 'var(--accent)' : 'var(--border)',
            minHeight: '48px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {cat}
        </Link>
      ))}
    </div>
  );
}

export default function ChannelGrid({
  channels,
  categories,
  favoriteChannels,
  recentChannels,
  nowPlaying,
  selectedCategory,
  nameQuery,
  page,
  totalFiltered,
  totalChannels,
}: ChannelGridProps) {
  const totalPages = Math.ceil(totalFiltered / CHANNELS_PER_PAGE);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const params: string[] = [];
  if (selectedCategory !== 'All')
    params.push(`category=${encodeURIComponent(selectedCategory)}`);
  if (nameQuery) params.push(`q=${encodeURIComponent(nameQuery)}`);
  const baseQs = params.join('&');

  function pageUrl(p: number) {
    const all = baseQs ? [baseQs] : [];
    if (p > 1) all.push(`page=${p}`);
    return `/live${all.length > 0 ? '?' + all.join('&') : ''}`;
  }

  return (
    <div>
      <LiveSearchInput
        initialQuery={nameQuery}
        selectedCategory={selectedCategory}
        totalChannels={totalChannels}
        totalFiltered={totalFiltered}
      />

      <HorizontalRow
        title="Favorites"
        channels={favoriteChannels}
        nowPlaying={nowPlaying}
      />

      <HorizontalRow
        title="Recently Watched"
        channels={recentChannels}
        nowPlaying={nowPlaying}
      />

      <CategoryPills
        categories={categories}
        selected={selectedCategory}
        nameQuery={nameQuery}
      />

      {channels.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-center text-lg" style={{ color: 'var(--fg-muted)' }}>
            {nameQuery
              ? `No channels match "${nameQuery}".`
              : 'No channels in this category.'}
          </p>
        </div>
      ) : (
        // Auto-fill grid — viewport-independent so TV browsers with custom
        // root font size still get reasonable card widths.
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          }}
        >
          {channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} nowTitle={nowPlaying[ch.id]} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          {hasPrevPage && (
            <Link
              href={pageUrl(page - 1)}
              className="rounded-lg px-4 py-3 text-sm font-medium"
              style={{
                backgroundColor: 'var(--bg-raised)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                minHeight: '48px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Previous
            </Link>
          )}

          <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            Page {page} of {totalPages}
          </span>

          {hasNextPage && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-lg px-4 py-3 text-sm font-medium"
              style={{
                backgroundColor: 'var(--bg-raised)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                minHeight: '48px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
