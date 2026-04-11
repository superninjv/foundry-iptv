'use client';

import Link from 'next/link';
import type { Channel } from '@/lib/threadfin/types';
import type { VirtualItem } from '@tanstack/react-virtual';
import AddToDeckButton from '@/components/decks/AddToDeckButton';

interface ChannelColumnProps {
  channels: Channel[];
  rowHeight: number;
  virtualRows: VirtualItem[];
  totalHeight: number;
}

export default function ChannelColumn({
  channels,
  rowHeight,
  virtualRows,
  totalHeight,
}: ChannelColumnProps) {
  return (
    <div className="relative" style={{ height: totalHeight }}>
      {virtualRows.map((virtualRow) => {
        const channel = channels[virtualRow.index];
        if (!channel) return null;

        return (
          <div
            key={virtualRow.key}
            className="absolute left-0 right-0 flex items-center gap-2 border-b px-3"
            style={{
              height: rowHeight,
              top: virtualRow.start,
              borderColor: 'var(--border)',
            }}
          >
            <Link
              href={`/watch/${channel.id}`}
              prefetch={false}
              className="overlay-focus flex min-w-0 flex-1 items-center gap-2 rounded"
              style={{ color: 'var(--fg)', textDecoration: 'none' }}
              title={`Watch ${channel.name}`}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded"
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
                  <span className="text-xs font-bold" style={{ color: 'var(--fg-muted)' }}>
                    {channel.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="truncate text-xs font-medium">{channel.name}</span>
            </Link>
            <AddToDeckButton
              channelId={channel.id}
              channelName={channel.name}
              variant="icon"
            />
          </div>
        );
      })}
    </div>
  );
}
