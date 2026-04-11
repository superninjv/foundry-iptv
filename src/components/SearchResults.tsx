// src/components/SearchResults.tsx
// Server component — renders channel and program search results.

import Link from 'next/link';
import type { Channel } from '@/lib/threadfin/types';
import type { EpgSearchResult, VodSearchResult } from '@/lib/search/text';
import { formatTime } from '@/lib/format/time';
import AddToDeckButton from '@/components/decks/AddToDeckButton';

function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <div style={{ position: 'relative' }}>
    <Link
      href={`/watch/${encodeURIComponent(channel.id)}`}
      className="flex items-center gap-4 rounded-lg border p-4 pr-14 transition-colors"
      style={{
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
        minHeight: '64px',
      }}
    >
      {channel.logo ? (
        <img
          src={channel.logo}
          alt=""
          className="h-10 w-10 shrink-0 rounded object-contain"
          style={{ backgroundColor: 'var(--bg)' }}
        />
      ) : (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-sm font-bold"
          style={{ backgroundColor: 'var(--bg)', color: 'var(--accent)' }}
        >
          {channel.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" style={{ color: 'var(--fg)' }}>
          {channel.name}
        </p>
        {channel.group && (
          <p className="truncate text-sm" style={{ color: 'var(--fg-muted)' }}>
            {channel.group}
          </p>
        )}
      </div>
    </Link>
    <div style={{ position: 'absolute', top: 12, right: 12 }}>
      <AddToDeckButton channelId={channel.id} channelName={channel.name} variant="icon" />
    </div>
    </div>
  );
}

function ProgramCard({ program }: { program: EpgSearchResult }) {
  const isLive =
    program.startAt.getTime() <= Date.now() &&
    program.endAt.getTime() > Date.now();

  return (
    <div style={{ position: 'relative' }}>
    <Link
      href={`/watch/${encodeURIComponent(program.channelId)}`}
      className="flex gap-3 rounded-lg border p-4 pr-14 transition-colors"
      style={{
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
        minHeight: '64px',
      }}
    >
      {program.channelLogo ? (
        <img
          src={program.channelLogo}
          alt=""
          className="h-12 w-12 shrink-0 rounded object-contain"
          style={{ backgroundColor: 'var(--bg)' }}
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded text-sm font-bold"
          style={{ backgroundColor: 'var(--bg)', color: 'var(--accent)' }}
        >
          {program.channelName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--fg)' }}>
            {program.channelName}
          </p>
          {isLive && (
            <span
              className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: 'var(--error)', color: '#fff' }}
            >
              LIVE
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate font-medium" style={{ color: 'var(--fg)' }}>
          {program.title}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
          {formatTime(program.startAt)} &ndash; {formatTime(program.endAt)}
          {program.channelGroup ? ` · ${program.channelGroup}` : ''}
        </p>
        {program.description && (
          <p
            className="mt-1 line-clamp-2 text-sm"
            style={{ color: 'var(--fg-muted)' }}
          >
            {program.description}
          </p>
        )}
      </div>
    </Link>
    <div style={{ position: 'absolute', top: 12, right: 12 }}>
      <AddToDeckButton
        channelId={program.channelId}
        channelName={program.channelName}
        variant="icon"
      />
    </div>
    </div>
  );
}

function VodCard({ item }: { item: VodSearchResult }) {
  const href = item.mediaType === 'movie'
    ? `/vod/${item.streamId}`
    : `/series/${item.streamId}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg border p-4"
      style={{
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
        minHeight: '64px',
      }}
    >
      {item.cover ? (
        <img
          src={item.cover}
          alt=""
          className="h-16 w-12 shrink-0 rounded object-cover"
          style={{ backgroundColor: 'var(--bg)' }}
        />
      ) : (
        <div
          className="flex h-16 w-12 shrink-0 items-center justify-center rounded text-sm font-bold"
          style={{ backgroundColor: 'var(--bg)', color: 'var(--accent)' }}
        >
          {item.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" style={{ color: 'var(--fg)' }}>
          {item.name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs"
            style={{
              backgroundColor: item.mediaType === 'movie'
                ? 'rgba(255, 149, 72, 0.15)'
                : 'rgba(52, 211, 153, 0.15)',
              color: item.mediaType === 'movie' ? 'var(--accent)' : 'var(--success)',
            }}
          >
            {item.mediaType === 'movie' ? 'Movie' : 'Series'}
          </span>
          {item.genre && (
            <span className="truncate text-xs" style={{ color: 'var(--fg-muted)' }}>
              {item.genre}
            </span>
          )}
        </div>
        {item.plot && (
          <p className="mt-1 line-clamp-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
            {item.plot}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function SearchResults({
  channels,
  programs,
  vod = [],
}: {
  channels: Channel[];
  programs: EpgSearchResult[];
  vod?: VodSearchResult[];
}) {
  return (
    <div className="mt-6 space-y-8">
      {channels.length > 0 && (
        <section>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            Channels ({channels.length})
          </h2>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            }}
          >
            {channels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
          </div>
        </section>
      )}

      {programs.length > 0 && (
        <section>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            Programs ({programs.length})
          </h2>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            }}
          >
            {programs.map((prog) => (
              <ProgramCard
                key={`${prog.channelId}-${prog.startAt}`}
                program={prog}
              />
            ))}
          </div>
        </section>
      )}

      {vod.length > 0 && (
        <section>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            Movies &amp; Series ({vod.length})
          </h2>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}
          >
            {vod.map((item) => (
              <VodCard key={`${item.mediaType}-${item.streamId}`} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
