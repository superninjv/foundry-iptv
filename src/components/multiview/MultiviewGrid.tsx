'use client';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Foundry IPTV Contributors
// This file is part of Foundry IPTV, licensed under AGPL-3.0.
// See LICENSE file in the project root.

// src/components/multiview/MultiviewGrid.tsx
// Multiview grid backed by the global singleton pool. Each tile is an iframe
// loading the standard watch page in embed mode. The pool manages the single
// provider connection; tiles are completely unaware of pool internals.
// Heartbeat every 10s keeps channels alive.

import { useEffect, useRef, useState, useCallback, forwardRef } from 'react';
import { CellControls } from './CellControls';
import { LayoutPicker } from './LayoutPicker';
import { ChannelPicker, type PickerSelection } from './ChannelPicker';
import { type MultiviewLayout } from '@/lib/player/multiview-quality';
import { AddIcon } from '@/components/icons';

type Layout = MultiviewLayout;

interface MultiviewGridProps {
  initialChannelIds?: string[];
  initialLayout?: string;
  embedded?: boolean;
  /**
   * Called when the user picks a channel from the grid's own Add Channel
   * button. When provided, the grid delegates the add to the parent (e.g.
   * DeckPlayer persists it as a deck entry) instead of appending to its own
   * local channelIds state. The parent is expected to update the grid's
   * `initialChannelIds` after persisting (triggering a remount via key).
   */
  onAddChannel?: (item: PickerSelection) => void;
}

const GRID_STYLES: Record<Layout, React.CSSProperties> = {
  '2x2': {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
  },
  '1+3': {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gridTemplateRows: '1fr 1fr',
  },
};

// --------------------------------------------------------------------------
// Tile -- iframe per channel for MSE isolation
// --------------------------------------------------------------------------

const Tile = forwardRef<HTMLIFrameElement, {
  channelId: string;
  channelName: string;
  isFocused: boolean;
  cellStyle: React.CSSProperties;
  onFocus: () => void;
  onRemove: () => void;
}>(function Tile({ channelId, channelName, isFocused, cellStyle, onFocus, onRemove }, ref) {
  const [ready, setReady] = useState(false);

  // Each iframe loads the standard watch page in embed mode.
  // The watch page registers interest with the global pool on its own.
  const embedUrl = `/watch/${channelId}?embed=1&muted=1`;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'foundry:ready' && e.data?.channelId === channelId) {
        setReady(true);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [channelId]);

  return (
    <div
      className="relative overflow-hidden cursor-pointer"
      style={{
        ...cellStyle,
        backgroundColor: '#000',
        outline: isFocused ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
      }}
      onClick={onFocus}
    >
      <iframe
        ref={ref}
        src={embedUrl}
        className="h-full w-full border-0"
        allow="autoplay"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      )}
      <CellControls
        channelName={channelName}
        isFocused={isFocused}
        onFocus={onFocus}
        onRemove={onRemove}
      />
    </div>
  );
});

// --------------------------------------------------------------------------
// MultiviewGridInner
// --------------------------------------------------------------------------

function MultiviewGridInner({ initialChannelIds, initialLayout, onAddChannel }: MultiviewGridProps) {
  const [channelIds, setChannelIds] = useState<string[]>(initialChannelIds ?? []);
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout>((initialLayout as Layout) || '2x2');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  // Iframe refs for sending mute/unmute postMessages
  const iframeRefs = useRef<Map<string, HTMLIFrameElement | null>>(new Map());

  // Heartbeat: keep all active channels alive in the global pool
  const channelIdsRef = useRef(channelIds);
  channelIdsRef.current = channelIds;

  useEffect(() => {
    if (channelIds.length === 0) return;
    const interval = setInterval(() => {
      fetch('/api/stream/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: channelIdsRef.current }),
      }).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [channelIds.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch channel names
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

  // Focus change: tell the pool which channel has audio + mute/unmute iframes
  const handleFocus = useCallback((index: number) => {
    const prevChannelId = channelIds[focusedIndex];
    const newChannelId = channelIds[index];
    setFocusedIndex(index);

    // Clear old focus, set new focus in the pool
    if (prevChannelId && prevChannelId !== newChannelId) {
      fetch(`/api/stream/${prevChannelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: false }),
      }).catch(() => {});
    }
    if (newChannelId) {
      fetch(`/api/stream/${newChannelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: true }),
      }).catch(() => {});
    }

    // Mute all iframes except the focused one
    for (const [chId, iframe] of iframeRefs.current) {
      if (!iframe?.contentWindow) continue;
      iframe.contentWindow.postMessage(
        { type: 'foundry:mute', muted: chId !== newChannelId },
        '*',
      );
    }
  }, [channelIds, focusedIndex]);

  const handleAddChannel = useCallback(
    (item: PickerSelection) => {
      setShowPicker(false);
      if (onAddChannel) {
        onAddChannel(item);
        return;
      }
      setChannelIds((prev) => [...prev, item.id]);
    },
    [onAddChannel],
  );

  const handleRemoveChannel = useCallback((index: number) => {
    setChannelIds((prev) => prev.filter((_, i) => i !== index));
    setFocusedIndex((prev) => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  // Auto-hide top bar after 3s of no mouse activity
  const [barVisible, setBarVisible] = useState(true);
  const barTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (channelIds.length === 0) return;
    function resetBar() {
      setBarVisible(true);
      if (barTimerRef.current) clearTimeout(barTimerRef.current);
      barTimerRef.current = setTimeout(() => setBarVisible(false), 3000);
    }
    resetBar();
    document.addEventListener('mousemove', resetBar);
    document.addEventListener('keydown', resetBar);
    return () => {
      if (barTimerRef.current) clearTimeout(barTimerRef.current);
      document.removeEventListener('mousemove', resetBar);
      document.removeEventListener('keydown', resetBar);
    };
  }, [channelIds.length]);

  const maxSlots = 4; // both '2x2' and '1+3' hold 4 tiles
  const canAdd = channelIds.length < maxSlots;
  const excludeIds = channelIds;

  // Empty state
  if (channelIds.length === 0) {
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

  return (
    <div className="flex h-full flex-col">
      {/* Top bar -- auto-hides after 3s */}
      <div
        className="flex items-center justify-between border-b px-4 transition-all duration-200"
        style={{
          height: barVisible ? '4rem' : '0',
          overflow: 'hidden',
          opacity: barVisible ? 1 : 0,
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>Multiview</h1>
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
      <div className="flex-1 overflow-hidden">
        <div
          className="h-full w-full gap-[2px]"
          style={{ ...GRID_STYLES[layout], backgroundColor: 'var(--border)' }}
        >
          {channelIds.map((channelId, i) => {
            const cellStyle: React.CSSProperties =
              layout === '1+3' && i === 0 ? { gridRow: '1 / 3' } : {};
            return (
              <Tile
                key={channelId}
                ref={(el) => {
                  if (el) iframeRefs.current.set(channelId, el);
                  else iframeRefs.current.delete(channelId);
                }}
                channelId={channelId}
                channelName={channelNames[channelId] || channelId}
                isFocused={i === focusedIndex}
                cellStyle={cellStyle}
                onFocus={() => handleFocus(i)}
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
}

// --------------------------------------------------------------------------
// Public export
// --------------------------------------------------------------------------

export function MultiviewGrid(props: MultiviewGridProps) {
  return <MultiviewGridInner {...props} />;
}
