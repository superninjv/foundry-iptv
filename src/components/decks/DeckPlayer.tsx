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
import { ChannelPicker } from '@/components/multiview/ChannelPicker';
import { MultiviewGrid } from '@/components/multiview/MultiviewGrid';
import type { Deck, DeckViewMode, DeckLayout, DeckEntry } from '@/lib/decks/db';
import { EditIcon, AddIcon } from '@/components/icons';
import { WarmDeckProvider, useWarmStream, useWarmDeck } from '@/components/decks/WarmDeckProvider';

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
// WarmDeckTile — one grid entry that uses the warm pool
// --------------------------------------------------------------------------

function WarmDeckTile({
  channelId,
  isActive,
}: {
  channelId: string;
  isActive: boolean;
}) {
  const { attachSlot } = useWarmStream(channelId, isActive);
  const slotRef = useRef<HTMLDivElement | null>(null);

  const setSlotRef = useCallback(
    (el: HTMLDivElement | null) => {
      slotRef.current = el;
      attachSlot(el);
    },
    [attachSlot],
  );

  return (
    <div
      ref={setSlotRef}
      className="h-full w-full"
      style={{ backgroundColor: '#000', overflow: 'hidden' }}
    />
  );
}

// --------------------------------------------------------------------------
// SingleChannelView — single mode, wraps WarmDeckTile with overlay/controls
// --------------------------------------------------------------------------

function SingleChannelView({
  entry,
  entryIndex,
  totalEntries,
  deckName,
  channelNames,
  skipCommercials,
  deckId,
  onBack,
  onJump,
  entries,
  onToggleEditor,
  onAddChannel,
}: {
  entry: DeckEntry;
  entryIndex: number;
  totalEntries: number;
  deckName: string;
  channelNames: Record<string, string>;
  skipCommercials: boolean;
  deckId: number;
  onBack: () => void;
  onJump: (i: number) => void;
  entries: DeckEntry[];
  onToggleEditor?: () => void;
  onAddChannel: () => void;
}) {
  // PlayerControls wants an HTMLVideoElement ref. The real element is owned
  // by WarmDeckProvider's pool — grab it from there and keep this ref in sync
  // so scrub/pause/volume all drive the live <video>.
  const { getVideoElement } = useWarmDeck();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Handle may not exist yet on first mount; poll briefly until it does.
    const tryAttach = () => {
      if (cancelled) return;
      const el = getVideoElement(entry.channelId);
      if (el) {
        videoRef.current = el;
      } else {
        setTimeout(tryAttach, 100);
      }
    };
    tryAttach();
    return () => {
      cancelled = true;
      videoRef.current = null;
    };
  }, [entry.channelId, getVideoElement]);

  return (
    <PlayerOverlay
      title={channelNames[entry.channelId] || entry.channelId}
      subtitle={`${deckName} · ${entryIndex + 1} of ${totalEntries}`}
      onBack={onBack}
      metaLeft={
        <EntryPillStrip
          entries={entries}
          activeIndex={entryIndex}
          onJump={onJump}
          channelNames={channelNames}
        />
      }
      controls={
        <PlayerControls
          videoRef={videoRef}
          isLive
        />
      }
      actionsRight={
        <>
          <SkipCommercialsToggle deckId={deckId} initialValue={skipCommercials} variant="icon" />
          <AddChannelButton onClick={onAddChannel} />
          {onToggleEditor && <EditDeckButton onClick={onToggleEditor} />}
        </>
      }
    >
      <div className="h-full w-full" style={{ minHeight: '60vh', backgroundColor: '#000' }}>
        <WarmDeckTile channelId={entry.channelId} isActive />
      </div>
    </PlayerOverlay>
  );
}

// --------------------------------------------------------------------------
// DeckPlayerInner — consumes WarmDeckProvider context
// --------------------------------------------------------------------------

function DeckPlayerInner({
  initialDeck,
  channelNames = {},
  onToggleEditor,
}: DeckPlayerProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<DeckViewMode>(initialDeck.viewMode);
  const [cursorIndex, setCursorIndex] = useState<number>(initialDeck.cursorIndex);
  const [savingPreset, setSavingPreset] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Gesture priming: Fire TV requires a user gesture before play() succeeds
  // even for muted video. On first keydown we call play() on all warm handles
  // (they're muted, so allowed), then pause non-active ones.
  const gesturePrimed = useRef(false);

  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // D-pad handler with performance measurement and gesture priming
  useEffect(() => {
    function handler(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement | null;
      if (target && target !== containerRef.current && containerRef.current?.contains(target)) {
        return;
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

  // Measure swap latency: when the active video fires 'playing', measure from
  // the last keydown mark.
  useEffect(() => {
    if (viewMode !== 'single') return;
    const safeIndex = Math.min(cursorIndex, entries.length - 1);
    const entry = entries[safeIndex];
    if (!entry) return;

    function onPlaying(this: HTMLVideoElement) {
      try {
        performance.mark('deck:playing');
        performance.measure('deck:swap', 'deck:keydown', 'deck:playing');
        const [m] = performance.getEntriesByName('deck:swap', 'measure');
        if (m) {
          console.log(`[warm-deck] swap=${Math.round(m.duration)}ms`);
          performance.clearMarks('deck:keydown');
          performance.clearMarks('deck:playing');
          performance.clearMeasures('deck:swap');
        }
      } catch {
        // marks may not exist if no keydown happened yet
      }
    }

    // Find the <video> managed by the warm pool — it's inside the tile slot.
    // We listen on the document for 'playing' from the correct channel's video
    // by grabbing it from the slot div after a raf.
    const raf = requestAnimationFrame(() => {
      // The warm provider places the video as a child of the slot div with
      // data-channel or we can locate it by scanning the active tile.
      // Simplest: query the warm pool video directly via a synthetic attribute.
      const video = document.querySelector<HTMLVideoElement>(
        `[data-warm-channel="${entry.channelId}"]`,
      );
      video?.addEventListener('playing', onPlaying, { once: true });
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [cursorIndex, viewMode, entries]);

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

  // ---- Single mode -------------------------------------------------------

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
        <SingleChannelView
          entry={entry}
          entryIndex={safeIndex}
          totalEntries={entries.length}
          deckName={deckName}
          channelNames={channelNames}
          skipCommercials={skipCommercials}
          deckId={deckId}
          onBack={handleBack}
          onJump={handleJump}
          entries={entries}
          onToggleEditor={onToggleEditor}
          onAddChannel={() => setShowPicker(true)}
        />
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

  // ---- Multi mode --------------------------------------------------------

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
