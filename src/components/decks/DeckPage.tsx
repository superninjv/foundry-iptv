'use client';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Foundry IPTV Contributors
// This file is part of Foundry IPTV, licensed under AGPL-3.0.
// See LICENSE file in the project root.


import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DeckPlayer from '@/components/decks/DeckPlayer';
import DeckEditor from '@/components/decks/DeckEditor';
import type { Deck, DeckViewMode } from '@/lib/decks/db';

interface DeckPageProps {
  deck: Deck;
  channelNames: Record<string, string>;
}

export default function DeckPage({ deck, channelNames }: DeckPageProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<DeckViewMode>(deck.viewMode);
  const toggleEditor = useCallback(() => setEditorOpen((v) => !v), []);

  // Floating toolbar visibility — follows the same idle auto-hide pattern as
  // AppShell's nav and PlayerOverlay's chrome so the player surface is clean
  // when the user isn't interacting.
  const [chromeVisible, setChromeVisible] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function wake() {
      setChromeVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChromeVisible(false), 3000);
    }
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    window.addEventListener('keydown', wake);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  return (
    <div
      className="fixed inset-0"
      style={{ backgroundColor: '#000' }}
    >
      <DeckPlayer
        initialDeck={{ ...deck, viewMode }}
        channelNames={channelNames}
        onToggleEditor={toggleEditor}
        chromeVisible={chromeVisible}
      />

      {/* Floating toolbar — idle auto-hide, sits above the player's timeline
          so the two bottom bars don't overlap. */}
      <div
        className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1.5 transition-opacity duration-200"
        style={{
          // Single mode has PlayerControls (timeline + scrub bar) along the
          // bottom — lift the pill above it. Multi has no timeline, so sit
          // closer to the edge.
          bottom: viewMode === 'single' ? '6rem' : '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? 'auto' : 'none',
        }}
      >
        <button
          onClick={() => router.push('/decks')}
          className="rounded-full px-3 py-1.5 text-xs font-medium"
          style={{ color: 'var(--fg-muted)' }}
          title="Back to decks"
        >
          Decks
        </button>
        <button
          onClick={() => setViewMode('single')}
          className="rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            color: viewMode === 'single' ? 'var(--accent)' : 'var(--fg-muted)',
            backgroundColor: viewMode === 'single' ? 'rgba(6,182,212,0.15)' : 'transparent',
          }}
          title="Single view (left/right to switch)"
        >
          Single
        </button>
        <button
          onClick={() => setViewMode('multi')}
          className="rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            color: viewMode === 'multi' ? 'var(--accent)' : 'var(--fg-muted)',
            backgroundColor: viewMode === 'multi' ? 'rgba(6,182,212,0.15)' : 'transparent',
          }}
          title="Multiview grid"
        >
          Multi
        </button>
        <button
          onClick={toggleEditor}
          className="rounded-full px-3 py-1.5 text-xs font-medium"
          style={{ color: editorOpen ? 'var(--accent)' : 'var(--fg-muted)' }}
          title="Edit deck"
        >
          Edit
        </button>
      </div>

      {/* Editor drawer — slides up from the bottom on demand. */}
      <aside
        className="absolute bottom-0 left-0 right-0 z-30 max-h-[70vh] overflow-y-auto border-t"
        style={{
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
          transform: editorOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 220ms ease',
          boxShadow: editorOpen ? '0 -8px 24px rgba(0,0,0,0.4)' : 'none',
        }}
        aria-hidden={!editorOpen}
      >
        <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
            Edit deck — {deck.name}
          </h2>
          <button
            onClick={toggleEditor}
            tabIndex={0}
            className="overlay-focus rounded px-3 py-1 text-xs"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--fg-muted)',
              border: '1px solid var(--border)',
            }}
          >
            Close
          </button>
        </div>
        <div className="px-6 py-4">
          <DeckEditor
            deckId={deck.id}
            entries={deck.entries}
            presets={deck.presets}
            skipCommercials={deck.skipCommercials}
          />
        </div>
      </aside>
    </div>
  );
}
