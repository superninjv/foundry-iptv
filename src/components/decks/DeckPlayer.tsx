'use client';

// src/components/decks/DeckPlayer.tsx
// Playback core for a superplayer deck. Minimal client island: single-mode
// VideoPlayer or multi-mode MultiviewGrid, D-pad cycling, server state sync.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import VideoPlayer from '@/components/player/VideoPlayer';
import { MultiviewGrid } from '@/components/multiview/MultiviewGrid';
import PlayerOverlay from '@/components/player/PlayerOverlay';
import PlayerControls from '@/components/player/PlayerControls';
import SkipCommercialsToggle from '@/components/decks/SkipCommercialsToggle';
import { ChannelPicker } from '@/components/multiview/ChannelPicker';
import type { Deck, DeckViewMode, DeckLayout, DeckEntry } from '@/lib/decks/db';

interface DeckPlayerProps {
  initialDeck: Deck;
  channelNames?: Record<string, string>;
  onToggleEditor?: () => void;
}

function EditDeckButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      tabIndex={0}
      title="Edit deck"
      className="overlay-focus inline-flex items-center justify-center rounded-full"
      style={{
        width: '40px',
        height: '40px',
        backgroundColor: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        color: 'var(--fg)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  );
}

function AddChannelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      tabIndex={0}
      title="Add channel to deck"
      className="overlay-focus inline-flex items-center justify-center rounded-full"
      style={{
        width: '40px',
        height: '40px',
        backgroundColor: 'var(--accent)',
        color: 'var(--bg)',
        border: 'none',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}

interface SynthPreset {
  layout: DeckLayout;
  channelIds: string[];
}

function SingleChannelPlayer({
  channelId,
  videoRef,
}: {
  channelId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sidRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/stream/${channelId}`, { method: 'POST' });
        if (!res.ok) {
          if (!cancelled) setError('Failed to start stream');
          return;
        }
        const data = await res.json();
        if (cancelled) {
          if (data.sid) {
            fetch(`/api/stream/${channelId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sid: data.sid }),
              keepalive: true,
            }).catch(() => {});
          }
          return;
        }
        sidRef.current = data.sid;
        setHlsUrl(data.hlsUrl);
      } catch {
        if (!cancelled) setError('Network error');
      }
    })();

    return () => {
      cancelled = true;
      const sid = sidRef.current;
      if (sid) {
        fetch(`/api/stream/${channelId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid }),
          keepalive: true,
        }).catch(() => {});
      }
      sidRef.current = null;
    };
  }, [channelId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: 'var(--error, #f87171)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ backgroundColor: '#000', minHeight: '60vh' }}>
      {hlsUrl ? (
        <VideoPlayer ref={videoRef} hlsUrl={hlsUrl} onError={setError} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      )}
    </div>
  );
}

export default function DeckPlayer({ initialDeck, channelNames = {}, onToggleEditor }: DeckPlayerProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<DeckViewMode>(initialDeck.viewMode);
  const [cursorIndex, setCursorIndex] = useState<number>(initialDeck.cursorIndex);
  const [savingPreset, setSavingPreset] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const singleVideoRef = useRef<HTMLVideoElement>(null);

  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSingleFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const { entries, presets, skipCommercials, id: deckId, name: deckName } = initialDeck;

  const handleAddChannel = useCallback(
    async (channelId: string) => {
      setShowPicker(false);
      if (addBusy) return;
      setAddBusy(true);
      try {
        const res = await fetch(`/api/decks/${deckId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, ttl: '24h' }),
        });
        if (res.ok) router.refresh();
      } finally {
        setAddBusy(false);
      }
    },
    [deckId, router, addBusy],
  );

  useEffect(() => {
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    patchTimerRef.current = setTimeout(() => {
      fetch(`/api/decks/${deckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewMode, cursorIndex }),
      }).catch((err) => console.error('[deck] patch failed', err));
    }, 500);
    return () => {
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    };
  }, [viewMode, cursorIndex, deckId]);

  const synthPreset = useMemo<SynthPreset | null>(() => {
    if (presets.length > 0) return null;
    if (entries.length === 0) return null;
    return {
      layout: '2x2',
      channelIds: entries.slice(0, 4).map((e) => e.channelId),
    };
  }, [presets.length, entries]);

  const advance = useCallback(
    (direction: 1 | -1) => {
      if (viewMode === 'single') {
        const len = entries.length;
        if (len === 0) return;
        const allInCommercial = entries.every((e) => e.inCommercial);
        let next = cursorIndex;
        for (let i = 0; i < len; i++) {
          next = (next + direction + len) % len;
          if (!skipCommercials || allInCommercial || !entries[next]?.inCommercial) {
            break;
          }
        }
        setCursorIndex(next);
      } else {
        const totalPresets = presets.length || (synthPreset ? 1 : 0);
        if (totalPresets === 0) return;
        const next = (cursorIndex + direction + totalPresets) % totalPresets;
        setCursorIndex(next);
      }
    },
    [viewMode, entries, presets, synthPreset, cursorIndex, skipCommercials],
  );

  // D-pad: fires only when focus is on the player container itself, so the
  // overlay action-row arrow nav (which captures at a focused child) wins.
  useEffect(() => {
    function handler(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement | null;
      if (target && target !== containerRef.current && containerRef.current?.contains(target)) {
        // Focus is on an overlay element — let its handler take over.
        return;
      }
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        setViewMode((m) => (m === 'single' ? 'multi' : 'single'));
        setCursorIndex(0);
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        advance(-1);
      } else if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        advance(1);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      containerRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleSavePreset = useCallback(async () => {
    if (!synthPreset || savingPreset) return;
    setSavingPreset(true);
    try {
      await fetch(`/api/decks/${deckId}/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelIds: synthPreset.channelIds,
          layout: synthPreset.layout,
        }),
      });
      window.location.reload();
    } catch (err) {
      console.error('[deck] save preset failed', err);
      setSavingPreset(false);
    }
  }, [synthPreset, savingPreset, deckId]);

  const handleBack = useCallback(() => {
    router.push('/decks');
  }, [router]);

  const handleJump = useCallback((i: number) => {
    setCursorIndex(i);
  }, []);

  if (entries.length === 0) {
    return (
      <div
        ref={containerRef}
        tabIndex={-1}
        className="relative h-full w-full outline-none"
        style={{ minHeight: '60vh', backgroundColor: '#000' }}
      >
        <div className="flex h-full flex-col items-center justify-center gap-6" style={{ minHeight: '60vh' }}>
          <div className="text-center">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
              {deckName}
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
              Empty deck — add channels to begin playback.
            </p>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            tabIndex={0}
            className="flex items-center gap-2 rounded-lg px-6 py-3 font-medium"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
              minHeight: '48px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add channel
          </button>
          <button
            onClick={handleBack}
            className="rounded px-3 py-1 text-xs"
            style={{ color: 'var(--fg-muted)', border: '1px solid var(--border)' }}
          >
            Back to decks
          </button>
        </div>
        {showPicker && (
          <ChannelPicker
            onSelect={handleAddChannel}
            onClose={() => setShowPicker(false)}
            excludeIds={[]}
          />
        )}
      </div>
    );
  }

  if (viewMode === 'single') {
    const safeIndex = Math.min(cursorIndex, entries.length - 1);
    const entry = entries[safeIndex];

    return (
      <div
        ref={containerRef}
        tabIndex={-1}
        className="relative h-full w-full outline-none"
        style={{ minHeight: '60vh' }}
      >
        <PlayerOverlay
          title={channelNames[entry.channelId] || entry.channelId}
          subtitle={`${deckName} · ${safeIndex + 1} of ${entries.length}`}
          onBack={handleBack}
          metaLeft={<EntryPillStrip entries={entries} activeIndex={safeIndex} onJump={handleJump} channelNames={channelNames} />}
          controls={
            <PlayerControls
              videoRef={singleVideoRef}
              isLive
              onFullscreen={handleSingleFullscreen}
            />
          }
          actionsRight={
            <>
              <SkipCommercialsToggle deckId={initialDeck.id} initialValue={skipCommercials} variant="icon" />
              <AddChannelButton onClick={() => setShowPicker(true)} />
              {onToggleEditor && <EditDeckButton onClick={onToggleEditor} />}
            </>
          }
        >
          <SingleChannelPlayer key={entry.channelId} channelId={entry.channelId} videoRef={singleVideoRef} />
        </PlayerOverlay>
        {showPicker && (
          <ChannelPicker
            onSelect={handleAddChannel}
            onClose={() => setShowPicker(false)}
            excludeIds={entries.map((e) => e.channelId)}
          />
        )}
      </div>
    );
  }

  // multi mode
  const activePreset: SynthPreset | null =
    presets.length > 0
      ? {
          layout: presets[cursorIndex % presets.length].layout,
          channelIds: presets[cursorIndex % presets.length].channelIds,
        }
      : synthPreset;

  if (!activePreset) {
    return (
      <div className="flex h-full items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: 'var(--fg-muted)' }}>No presets available.</p>
      </div>
    );
  }

  const totalPresets = presets.length || (synthPreset ? 1 : 0);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative h-full w-full outline-none"
      style={{ minHeight: '60vh' }}
    >
      <PlayerOverlay
        title={`Multiview · ${activePreset.layout}`}
        subtitle={totalPresets > 1 ? `Preset ${(cursorIndex % totalPresets) + 1} of ${totalPresets}` : undefined}
        onBack={handleBack}
        metaLeft={
          totalPresets > 1 ? (
            <div className="flex gap-2">
              {Array.from({ length: totalPresets }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCursorIndex(i)}
                  tabIndex={0}
                  className="overlay-focus rounded-full px-3 py-1 text-xs"
                  style={{
                    backgroundColor: i === cursorIndex % totalPresets ? 'var(--accent)' : 'var(--bg-raised)',
                    color: i === cursorIndex % totalPresets ? 'var(--bg)' : 'var(--fg)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          ) : null
        }
        actionsRight={
          <>
            <SkipCommercialsToggle deckId={initialDeck.id} initialValue={skipCommercials} variant="icon" />
            <AddChannelButton onClick={() => setShowPicker(true)} />
            {onToggleEditor && <EditDeckButton onClick={onToggleEditor} />}
          </>
        }
      >
        <MultiviewGrid
          key={`${activePreset.layout}-${activePreset.channelIds.join(',')}`}
          initialChannelIds={activePreset.channelIds}
          initialLayout={activePreset.layout}
          embedded
        />
        {presets.length === 0 && synthPreset && (
          <button
            onClick={handleSavePreset}
            disabled={savingPreset}
            className="absolute right-4 top-20 z-50 rounded-lg px-4 py-2 font-medium"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
              minHeight: '44px',
            }}
          >
            {savingPreset ? 'Saving...' : 'Save preset'}
          </button>
        )}
      </PlayerOverlay>
      {showPicker && (
        <ChannelPicker
          onSelect={handleAddChannel}
          onClose={() => setShowPicker(false)}
          excludeIds={entries.map((e) => e.channelId)}
        />
      )}
    </div>
  );
}

function EntryPillStrip({
  entries,
  activeIndex,
  onJump,
  channelNames,
}: {
  entries: DeckEntry[];
  activeIndex: number;
  onJump: (i: number) => void;
  channelNames: Record<string, string>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
      {entries.map((e, i) => {
        const active = i === activeIndex;
        const label = channelNames[e.channelId] || e.channelId;
        return (
          <button
            key={e.id}
            onClick={() => onJump(i)}
            tabIndex={0}
            className="overlay-focus flex items-center gap-1.5 rounded-full px-3 py-1 text-xs whitespace-nowrap"
            style={{
              backgroundColor: active ? 'var(--accent)' : 'var(--bg-raised)',
              color: active ? 'var(--bg)' : 'var(--fg)',
              border: '1px solid var(--border)',
            }}
          >
            <span>{label}</span>
            {e.inCommercial && (
              <span
                className="rounded px-1 text-[10px] font-bold"
                style={{ backgroundColor: '#dc2626', color: '#fff' }}
              >
                AD
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
