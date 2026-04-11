'use client';

// src/components/multiview/MultiviewGrid.tsx
// Multiview grid — all tiles in the active preset are "active" simultaneously
// (all visible + playing). Uses WarmDeckProvider so switching layouts or
// audio focus is instant. Quality is dictated by layout; the warm pool uses
// that as the preferredQuality for each tile.
//
// Audio focus: the focused tile is unmuted (promoted); others are demoted
// (muted). promote/demote still work within the warm pool — the pool keeps
// hls.js running regardless; only mute state changes.

import { useEffect, useRef, useState, useCallback } from 'react';
import PlayerOverlay from '@/components/player/PlayerOverlay';
import { CellControls } from './CellControls';
import { LayoutPicker } from './LayoutPicker';
import { ChannelPicker } from './ChannelPicker';
import { qualityForLayout, type MultiviewLayout } from '@/lib/player/multiview-quality';
import { AddIcon } from '@/components/icons';
import { WarmDeckProvider, useWarmStream } from '@/components/decks/WarmDeckProvider';
import type { Quality } from '@/lib/stream/client';

type Layout = MultiviewLayout;

interface MultiviewGridProps {
  initialChannelIds?: string[];
  initialLayout?: string;
  embedded?: boolean;
}

const GRID_STYLES: Record<Layout, React.CSSProperties> = {
  '2x2': {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
  },
  '3x3': {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
  },
  '1+3': {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gridTemplateRows: '1fr 1fr',
  },
  '2+4': {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '2fr 1fr 1fr',
  },
};

// Map ts2hls quality strings to our warm pool quality levels
function tsQualityToWarmQuality(q: Quality): 'low' | 'medium' | 'high' {
  if (q === '480p' || q === '360p') return 'low';
  if (q === '720p') return 'medium';
  return 'high';
}

// --------------------------------------------------------------------------
// WarmMultiviewTile — one cell that pulls its video from the warm pool
// --------------------------------------------------------------------------

function WarmMultiviewTile({
  channelId,
  channelName,
  isFocused,
  preferredQuality,
  cellStyle,
  onFocus,
  onRemove,
}: {
  channelId: string;
  channelName: string;
  isFocused: boolean;
  preferredQuality: 'low' | 'medium' | 'high';
  cellStyle: React.CSSProperties;
  onFocus: () => void;
  onRemove: () => void;
}) {
  // All multiview tiles are "active" (playing); audio focus = isFocused.
  // useWarmStream with isActive=true keeps them all buffering at preferredQuality.
  // We manually unmute/mute based on isFocused inside the tile.
  const { attachSlot, handle } = useWarmStream(channelId, true, preferredQuality);
  const slotRef = useRef<HTMLDivElement | null>(null);

  const setSlotRef = useCallback(
    (el: HTMLDivElement | null) => {
      slotRef.current = el;
      attachSlot(el);
    },
    [attachSlot],
  );

  // Manage mute state: only the focused tile has audio
  useEffect(() => {
    if (!handle) return;
    handle.video.muted = !isFocused;
  }, [isFocused, handle]);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        ...cellStyle,
        backgroundColor: '#000',
        outline: isFocused ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
      }}
    >
      <div
        ref={setSlotRef}
        className="h-full w-full"
        style={{ backgroundColor: '#000' }}
      />
      <CellControls
        channelName={channelName}
        isFocused={isFocused}
        onFocus={onFocus}
        onRemove={onRemove}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// MultiviewGridInner — consumes WarmDeckProvider context
// --------------------------------------------------------------------------

function MultiviewGridInner({ initialChannelIds, initialLayout, embedded }: MultiviewGridProps) {
  const [channelIds, setChannelIds] = useState<string[]>(initialChannelIds ?? []);
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout>((initialLayout as Layout) || '2x2');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Current quality tier from layout
  const currentQuality = qualityForLayout(layout);
  const preferredWarmQuality = tsQualityToWarmQuality(currentQuality);

  // Fetch channel names on mount and when channelIds change
  useEffect(() => {
    if (channelIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/channels');
        if (!res.ok || cancelled) return;
        const { channels } = await res.json();
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const ch of channels) {
          if (channelIds.includes(ch.id)) map[ch.id] = ch.name;
        }
        setChannelNames(map);
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [channelIds]);

  const handleAddChannel = useCallback(
    async (channelId: string) => {
      setShowPicker(false);
      setLoading(true);
      try {
        // Fetch name for the new channel
        const res = await fetch('/api/channels');
        if (res.ok) {
          const { channels } = await res.json();
          const ch = channels.find((c: { id: string; name: string }) => c.id === channelId);
          if (ch) {
            setChannelNames((prev) => ({ ...prev, [channelId]: ch.name }));
          }
        }
        setChannelIds((prev) => [...prev, channelId]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleRemoveChannel = useCallback((index: number) => {
    setChannelIds((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setFocusedIndex((prev) => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  const maxSlots =
    layout === '3x3' ? 9 : layout === '2+4' ? 6 : layout === '1+3' ? 4 : 4;
  const canAdd = channelIds.length < maxSlots;
  const excludeIds = channelIds;

  // Empty state
  if (!loading && channelIds.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex items-center justify-between border-b px-4"
          style={{ height: '4rem', backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}
        >
          <h1 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>Multiview</h1>
          <LayoutPicker layout={layout} onLayoutChange={(l) => setLayout(l as Layout)} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-lg" style={{ color: 'var(--fg)' }}>Watch multiple channels at once</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>Add channels to start your multiview session</p>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)', minHeight: '48px' }}
          >
            <AddIcon size={20} />
            Add Channels
          </button>
        </div>
        {showPicker && (
          <ChannelPicker onSelect={handleAddChannel} onClose={() => setShowPicker(false)} excludeIds={excludeIds} />
        )}
      </div>
    );
  }

  const grid = (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div
        className="flex items-center justify-between border-b px-4"
        style={{ height: '4rem', backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>Multiview</h1>
          {loading && (
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <LayoutPicker layout={layout} onLayoutChange={(l) => setLayout(l as Layout)} />
          {canAdd && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center justify-center rounded-lg transition-colors"
              style={{ minWidth: '48px', minHeight: '48px', backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
              title="Add channel"
            >
              <AddIcon size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>
        <div
          className="h-full w-full gap-[2px]"
          style={{ ...GRID_STYLES[layout], backgroundColor: 'var(--border)' }}
        >
          {channelIds.map((channelId, i) => {
            const cellStyle: React.CSSProperties =
              layout === '1+3' && i === 0 ? { gridRow: '1 / 3' } : {};
            return (
              <WarmMultiviewTile
                key={channelId}
                channelId={channelId}
                channelName={channelNames[channelId] || channelId}
                isFocused={i === focusedIndex}
                preferredQuality={preferredWarmQuality}
                cellStyle={cellStyle}
                onFocus={() => setFocusedIndex(i)}
                onRemove={() => handleRemoveChannel(i)}
              />
            );
          })}

          {/* Empty cells */}
          {Array.from({ length: Math.max(0, maxSlots - channelIds.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg)' }}
            >
              {i === 0 && canAdd && (
                <button
                  onClick={() => setShowPicker(true)}
                  className="flex flex-col items-center gap-2 rounded-lg p-4 transition-opacity"
                  style={{ color: 'var(--fg-muted)', minHeight: '48px', minWidth: '48px' }}
                >
                  <AddIcon size={32} />
                  <span className="text-xs">Add Channel</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {showPicker && (
        <ChannelPicker onSelect={handleAddChannel} onClose={() => setShowPicker(false)} excludeIds={excludeIds} />
      )}
    </div>
  );

  if (embedded) return grid;

  return (
    <PlayerOverlay
      title="Multiview"
      subtitle={`${channelIds.length} channel${channelIds.length === 1 ? '' : 's'} · ${layout}`}
    >
      {grid}
    </PlayerOverlay>
  );
}

// --------------------------------------------------------------------------
// Public export — wraps with WarmDeckProvider
// --------------------------------------------------------------------------

export function MultiviewGrid(props: MultiviewGridProps) {
  return (
    <WarmDeckProvider>
      <MultiviewGridInner {...props} />
    </WarmDeckProvider>
  );
}
