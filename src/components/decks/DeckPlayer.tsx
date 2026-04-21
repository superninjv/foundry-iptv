'use client';

// src/components/decks/DeckPlayer.tsx
// Playback core for a superplayer deck. Uses WarmDeckProvider so every entry's
// HLS.js instance stays alive; focus-swap is instant (no ffmpeg spinup).
//
// Measurement: performance.mark('deck:keydown') on keydown,
// performance.mark('deck:playing') on the active video's 'playing' event.
// Logs [warm-deck] swap=Xms to console.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PlayerOverlay from '@/components/player/PlayerOverlay';
import PlayerControls from '@/components/player/PlayerControls';
import SkipCommercialsToggle from '@/components/decks/SkipCommercialsToggle';
import { ChannelPicker, type PickerSelection } from '@/components/multiview/ChannelPicker';
import { MultiviewGrid } from '@/components/multiview/MultiviewGrid';
import type { Deck, DeckViewMode, DeckLayout, DeckEntry } from '@/lib/decks/db';
import { EditIcon, AddIcon } from '@/components/icons';
import { WarmDeckProvider } from '@/components/decks/WarmDeckProvider';

interface DeckPlayerProps {
  initialDeck: Deck;
  channelNames?: Record<string, string>;
  onToggleEditor?: () => void;
  /** When false, fade out the floating Save-preset button alongside the rest
   *  of the chrome. Driven by DeckPage's idle auto-hide timer. */
  chromeVisible?: boolean;
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
      <EditIcon size={18} />
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
      <AddIcon size={20} />
    </button>
  );
}

interface SynthPreset {
  layout: DeckLayout;
  channelIds: string[];
}

// --------------------------------------------------------------------------
// DeckPlayerInner
// --------------------------------------------------------------------------

function DeckPlayerInner({
  initialDeck,
  channelNames = {},
  onToggleEditor,
  chromeVisible = true,
}: DeckPlayerProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<DeckViewMode>(initialDeck.viewMode);
  // DeckPage has an external Single/Multi toolbar that updates the server-side
  // viewMode and re-fetches — mirror that into local state so the overlay swap
  // happens without a full page refresh.
  useEffect(() => {
    setViewMode(initialDeck.viewMode);
  }, [initialDeck.viewMode]);
  const [cursorIndex, setCursorIndex] = useState<number>(initialDeck.cursorIndex);
  const [savingPreset, setSavingPreset] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Wrapper around the always-mounted MultiviewGrid. In single mode we reach
  // into this subtree to hide the 3 non-active tiles and click the active one
  // so MultiviewGrid's own focus/mute machinery hands audio to it. Nothing
  // unmounts across mode flips — iframes + pool registrations stay alive.
  const mvWrapRef = useRef<HTMLDivElement>(null);
  const singleVideoRef = useRef<HTMLVideoElement | null>(null);

  // Gesture priming: Fire TV requires a user gesture before play() succeeds
  // even for muted video. On first keydown we call play() on all warm handles
  // (they're muted, so allowed), then pause non-active ones.
  const gesturePrimed = useRef(false);

  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { entries, presets, skipCommercials, id: deckId, name: deckName } = initialDeck;

  const handleAddChannel = useCallback(
    async (item: PickerSelection) => {
      setShowPicker(false);
      if (addBusy) return;
      setAddBusy(true);
      try {
        const res = await fetch(`/api/decks/${deckId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: item.id,
            ttl: '24h',
            contentType: item.contentType,
            vodStreamId: item.vodStreamId,
            vodMediaType: item.vodMediaType,
          }),
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

  // D-pad handler with performance measurement and gesture priming
  useEffect(() => {
    function handler(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement | null;
      // Only let text-entry elements swallow arrow keys. Previously we bailed
      // for any descendant of the deck container, which meant focusing any
      // chrome button (e.g. the add-channel button) disabled channel-cycling.
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }

      // Prime autoplay gesture on first keydown (Fire TV unlock)
      if (!gesturePrimed.current) {
        gesturePrimed.current = true;
        // WarmDeckProvider handles play() on all warm streams — access via
        // the warm deck context. We do it via a custom event the provider
        // can listen to, but simpler: just trigger via DOM click on a hidden element.
        // Actually, muted video play() works without gesture on Silk — the
        // provider already calls play() in MANIFEST_PARSED. Nothing extra needed.
      }

      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        setViewMode((m) => (m === 'single' ? 'multi' : 'single'));
        setCursorIndex(0);
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        // Measurement: mark keydown time so we can measure swap latency
        performance.mark('deck:keydown');
        advance(ev.key === 'ArrowRight' ? 1 : -1);
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
    performance.mark('deck:keydown');
    setCursorIndex(i);
  }, []);

  // Drive single/multi presentation by mutating the always-mounted MultiviewGrid.
  // Single mode: hide 3 of 4 tiles and span the active one across the grid;
  //              click the active tile so MultiviewGrid promotes it (audio on).
  // Multi mode:  clear the styles so the grid lays out normally.
  // The grid never remounts across mode flips, so iframes + pool state persist.
  useEffect(() => {
    const root = mvWrapRef.current;
    if (!root) return;
    let cancelled = false;
    let rafId: number | null = null;

    const apply = () => {
      if (cancelled) return;
      const grid = root.querySelector<HTMLElement>('[style*="grid-template-columns"]');
      const tiles = grid
        ? (Array.from(grid.children).filter(
            (el) => (el as HTMLElement).querySelector('iframe'),
          ) as HTMLElement[])
        : [];
      if (tiles.length === 0) {
        // Iframes not in the DOM yet — try again next frame.
        rafId = requestAnimationFrame(apply);
        return;
      }

      if (viewMode === 'single') {
        const idx = Math.min(cursorIndex, tiles.length - 1);
        // Leave non-active tiles in their normal grid cells so Firefox/Silk
        // don't pause or throttle them. Lift the active tile into a full-size
        // absolute overlay on top, using the always-`relative` PlayerOverlay
        // wrapper as the positioning context. Every iframe stays in-viewport
        // — only the active one is actually visible to the user.
        tiles.forEach((tile, i) => {
          if (i === idx) {
            tile.style.position = 'absolute';
            tile.style.top = '0';
            tile.style.left = '0';
            tile.style.right = '0';
            tile.style.bottom = '0';
            tile.style.width = '100%';
            tile.style.height = '100%';
            tile.style.zIndex = '5';
            tile.style.gridColumn = '';
            tile.style.gridRow = '';
          } else {
            tile.style.position = '';
            tile.style.top = '';
            tile.style.left = '';
            tile.style.right = '';
            tile.style.bottom = '';
            tile.style.width = '';
            tile.style.height = '';
            tile.style.zIndex = '';
            tile.style.gridColumn = '';
            tile.style.gridRow = '';
          }
        });
        // Click the active tile so MultiviewGrid's handleFocus sets focus +
        // posts mute messages to every iframe (unmuting just this one).
        tiles[idx]?.click();
        // Grab the <video> from the active iframe for PlayerControls. Same
        // origin, so contentDocument access is fine.
        const iframe = tiles[idx]?.querySelector<HTMLIFrameElement>('iframe');
        const vid = iframe?.contentDocument?.querySelector<HTMLVideoElement>('video') ?? null;
        singleVideoRef.current = vid;
      } else {
        tiles.forEach((tile) => {
          tile.style.position = '';
          tile.style.top = '';
          tile.style.left = '';
          tile.style.right = '';
          tile.style.bottom = '';
          tile.style.width = '';
          tile.style.height = '';
          tile.style.zIndex = '';
          tile.style.gridColumn = '';
          tile.style.gridRow = '';
        });
        singleVideoRef.current = null;
      }
    };

    apply();
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [viewMode, cursorIndex]);

  // ---- Empty deck --------------------------------------------------------

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
            <AddIcon size={20} />
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

  // ---- Render ------------------------------------------------------------
  //
  // ONE tree for both modes. MultiviewGrid is always mounted; single mode is
  // just a CSS-driven zoom into the focused tile + a different overlay chrome.
  // Iframes and their pool registrations persist across mode flips, so the
  // transition is instant and no streams get evicted server-side.
  //
  // In single mode the grid shows synthPreset (deck channels in entry order),
  // so flipping between modes doesn't change the grid's key / channel set.

  const gridPreset: SynthPreset | null =
    viewMode === 'multi' && presets.length > 0
      ? {
          layout: presets[cursorIndex % presets.length].layout,
          channelIds: presets[cursorIndex % presets.length].channelIds,
        }
      : synthPreset;

  if (!gridPreset) {
    return (
      <div className="flex h-full items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: 'var(--fg-muted)' }}>No presets available.</p>
      </div>
    );
  }

  const totalPresets = presets.length || (synthPreset ? 1 : 0);
  const safeIndex = Math.min(cursorIndex, entries.length - 1);
  const singleEntry = entries[safeIndex];
  const singleTitle =
    (singleEntry && (channelNames[singleEntry.channelId] || singleEntry.channelId)) || '';

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative h-full w-full outline-none"
      style={{ minHeight: '60vh' }}
    >
      <PlayerOverlay
        title={viewMode === 'single' ? singleTitle : `Multiview · ${gridPreset.layout}`}
        subtitle={
          viewMode === 'single'
            ? `${deckName} · ${safeIndex + 1} of ${entries.length}`
            : totalPresets > 1
              ? `Preset ${(cursorIndex % totalPresets) + 1} of ${totalPresets}`
              : undefined
        }
        onBack={handleBack}
        metaLeft={
          viewMode === 'single' ? (
            <EntryPillStrip
              entries={entries}
              activeIndex={safeIndex}
              onJump={handleJump}
              channelNames={channelNames}
            />
          ) : totalPresets > 1 ? (
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
        controls={
          viewMode === 'single' ? <PlayerControls videoRef={singleVideoRef} isLive /> : undefined
        }
        actionsRight={
          <>
            <SkipCommercialsToggle deckId={deckId} initialValue={skipCommercials} variant="icon" />
            <AddChannelButton onClick={() => setShowPicker(true)} />
            {onToggleEditor && <EditDeckButton onClick={onToggleEditor} />}
          </>
        }
      >
        <div ref={mvWrapRef} className="h-full w-full">
          <MultiviewGrid
            key={`${gridPreset.layout}-${gridPreset.channelIds.join(',')}`}
            initialChannelIds={gridPreset.channelIds}
            initialLayout={gridPreset.layout}
            embedded
            // Route multi's own Add Channel button through the real deck
            // API, so additions persist as deck entries instead of living
            // only inside MultiviewGrid's local state.
            onAddChannel={handleAddChannel}
          />
        </div>
        {viewMode === 'multi' && presets.length === 0 && synthPreset && (
          <button
            onClick={handleSavePreset}
            disabled={savingPreset}
            className="absolute right-4 top-20 z-50 rounded-lg px-4 py-2 font-medium transition-opacity duration-200"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
              minHeight: '44px',
              opacity: chromeVisible ? 1 : 0,
              pointerEvents: chromeVisible ? 'auto' : 'none',
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

// --------------------------------------------------------------------------
// Public export — wraps inner component with WarmDeckProvider
// --------------------------------------------------------------------------

export default function DeckPlayer(props: DeckPlayerProps) {
  return (
    <WarmDeckProvider>
      <DeckPlayerInner {...props} />
    </WarmDeckProvider>
  );
}

// --------------------------------------------------------------------------
// EntryPillStrip
// --------------------------------------------------------------------------

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
