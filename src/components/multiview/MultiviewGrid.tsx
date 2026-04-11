'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import VideoPlayer from '@/components/player/VideoPlayer';
import PlayerOverlay from '@/components/player/PlayerOverlay';
import { CellControls } from './CellControls';
import { LayoutPicker } from './LayoutPicker';
import { ChannelPicker } from './ChannelPicker';
import { qualityForLayout, type MultiviewLayout } from '@/lib/player/multiview-quality';
import type { Quality } from '@/lib/stream/client';

type Layout = MultiviewLayout;

interface Session {
  channelId: string;
  channelName: string;
  sid: string;
  hlsUrl: string;
}

interface MultiviewGridProps {
  initialChannelIds?: string[];
  initialLayout?: string;
  embedded?: boolean;
}

// Lookup table: channelId -> name from /api/channels
async function fetchChannelNames(
  channelIds: string[],
): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/channels');
    if (!res.ok) return {};
    const { channels } = await res.json();
    const map: Record<string, string> = {};
    for (const ch of channels) {
      if (channelIds.includes(ch.id)) {
        map[ch.id] = ch.name;
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function createMultiviewSessions(
  channelIds: string[],
  quality: Quality,
): Promise<{ sessions: { channelId: string; sid: string; hlsUrl: string }[]; errors: { channelId: string; error: string }[] }> {
  const res = await fetch('/api/multiview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelIds, quality }),
  });
  if (!res.ok) throw new Error('Failed to create sessions');
  return res.json();
}

async function destroyMultiviewSessions(sids: string[]) {
  try {
    // Try sendBeacon first (works during unload)
    const sent = navigator.sendBeacon(
      '/api/multiview',
      new Blob(
        [JSON.stringify({ sids })],
        { type: 'application/json' },
      ),
    );
    // sendBeacon can't do DELETE, so fall back to fetch with keepalive
    if (!sent) {
      await fetch('/api/multiview', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sids }),
        keepalive: true,
      });
    }
  } catch {
    // Best-effort cleanup
  }
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

export function MultiviewGrid({ initialChannelIds, initialLayout, embedded }: MultiviewGridProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [layout, setLayout] = useState<Layout>(
    (initialLayout as Layout) || '2x2',
  );
  const [currentQuality, setCurrentQuality] = useState<Quality>(
    qualityForLayout((initialLayout as Layout) || '2x2'),
  );
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const sessionsRef = useRef<Session[]>([]);

  // Keep ref in sync for cleanup
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Layout-change → quality rebuild. When the user switches layouts and the
  // new layout wants a different quality, spin up fresh sessions at the new
  // quality, then tear down the old ones (create-before-destroy to hide the
  // ffmpeg spinup gap). Same-quality layout swaps just restyle the grid.
  useEffect(() => {
    const newQuality = qualityForLayout(layout);
    if (newQuality === currentQuality) return;

    const existing = sessionsRef.current;
    if (existing.length === 0) {
      setCurrentQuality(newQuality);
      return;
    }

    const channelIds = existing.map((s) => s.channelId);
    const oldSids = existing.map((s) => s.sid);
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [result, names] = await Promise.all([
          createMultiviewSessions(channelIds, newQuality),
          fetchChannelNames(channelIds),
        ]);
        if (cancelled) {
          destroyMultiviewSessions(result.sessions.map((s) => s.sid));
          return;
        }
        const newSessions: Session[] = result.sessions.map((s) => ({
          ...s,
          channelName: names[s.channelId] || s.channelId,
        }));
        setSessions(newSessions);
        setCurrentQuality(newQuality);
        destroyMultiviewSessions(oldSids);
      } catch (err) {
        console.error('[multiview] Quality rebuild failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [layout, currentQuality]);

  // Load initial channels
  useEffect(() => {
    if (!initialChannelIds || initialChannelIds.length === 0) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const [result, names] = await Promise.all([
          createMultiviewSessions(initialChannelIds!, qualityForLayout(layout)),
          fetchChannelNames(initialChannelIds!),
        ]);

        if (cancelled) return;

        const newSessions: Session[] = result.sessions.map((s) => ({
          ...s,
          channelName: names[s.channelId] || s.channelId,
        }));

        setSessions(newSessions);
      } catch (err) {
        console.error('[multiview] Init failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const sids = sessionsRef.current.map((s) => s.sid);
      if (sids.length > 0) {
        // Use fetch with keepalive for unmount cleanup
        fetch('/api/multiview', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sids }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  const handleAddChannel = useCallback(
    async (channelId: string) => {
      setShowPicker(false);
      setLoading(true);
      try {
        const [result, names] = await Promise.all([
          createMultiviewSessions([channelId], currentQuality),
          fetchChannelNames([channelId]),
        ]);

        if (result.sessions.length > 0) {
          const s = result.sessions[0];
          setSessions((prev) => [
            ...prev,
            {
              ...s,
              channelName: names[s.channelId] || s.channelId,
            },
          ]);
        }
      } catch (err) {
        console.error('[multiview] Add channel failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [currentQuality],
  );

  const handleRemoveChannel = useCallback(
    async (index: number) => {
      const session = sessions[index];
      if (!session) return;

      // Destroy session in background
      destroyMultiviewSessions([session.sid]);

      setSessions((prev) => prev.filter((_, i) => i !== index));

      // Adjust focused index
      setFocusedIndex((prev) => {
        if (prev === index) return 0;
        if (prev > index) return prev - 1;
        return prev;
      });
    },
    [sessions],
  );

  const maxSlots =
    layout === '3x3' ? 9 : layout === '2+4' ? 6 : layout === '1+3' ? 4 : 4;
  const canAdd = sessions.length < maxSlots;
  const excludeIds = sessions.map((s) => s.channelId);

  // Empty state: no sessions and no initial channels
  if (!loading && sessions.length === 0 && !initialChannelIds?.length) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex items-center justify-between border-b px-4"
          style={{
            height: '4rem',
            backgroundColor: 'var(--bg-raised)',
            borderColor: 'var(--border)',
          }}
        >
          <h1 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
            Multiview
          </h1>
          <LayoutPicker layout={layout} onLayoutChange={(l) => setLayout(l as Layout)} />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-lg" style={{ color: 'var(--fg)' }}>
              Watch multiple channels at once
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
              Add channels to start your multiview session
            </p>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
              minHeight: '48px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
            </svg>
            Add Channels
          </button>
        </div>

        {showPicker && (
          <ChannelPicker
            onSelect={handleAddChannel}
            onClose={() => setShowPicker(false)}
            excludeIds={excludeIds}
          />
        )}
      </div>
    );
  }

  const grid = (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div
        className="flex items-center justify-between border-b px-4"
        style={{
          height: '4rem',
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
            Multiview
          </h1>
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
              style={{
                minWidth: '48px',
                minHeight: '48px',
                backgroundColor: 'var(--accent)',
                color: 'var(--bg)',
              }}
              title="Add channel"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>
        <div
          className="h-full w-full gap-[2px]"
          style={{
            ...GRID_STYLES[layout],
            backgroundColor: 'var(--border)',
          }}
        >
          {sessions.map((session, i) => {
            const isFocused = i === focusedIndex;
            // For 1+3 layout, first cell spans 2 rows
            const cellStyle: React.CSSProperties =
              layout === '1+3' && i === 0
                ? { gridRow: '1 / 3' }
                : {};

            return (
              <div
                key={session.sid}
                className="relative overflow-hidden"
                style={{
                  ...cellStyle,
                  backgroundColor: '#000',
                  outline: isFocused ? '2px solid var(--accent)' : 'none',
                  outlineOffset: '-2px',
                }}
              >
                <VideoPlayer
                  hlsUrl={session.hlsUrl}
                  muted={i !== focusedIndex}
                />
                <CellControls
                  channelName={session.channelName}
                  isFocused={isFocused}
                  onFocus={() => setFocusedIndex(i)}
                  onRemove={() => handleRemoveChannel(i)}
                />
              </div>
            );
          })}

          {/* Empty cells to fill grid */}
          {Array.from({ length: Math.max(0, maxSlots - sessions.length) }).map((_, i) => (
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
                  <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
                  </svg>
                  <span className="text-xs">Add Channel</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Channel picker modal */}
      {showPicker && (
        <ChannelPicker
          onSelect={handleAddChannel}
          onClose={() => setShowPicker(false)}
          excludeIds={excludeIds}
        />
      )}
    </div>
  );

  if (embedded) return grid;

  return (
    <PlayerOverlay
      title="Multiview"
      subtitle={`${sessions.length} channel${sessions.length === 1 ? '' : 's'} · ${layout}`}
    >
      {grid}
    </PlayerOverlay>
  );
}
