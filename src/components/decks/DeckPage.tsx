'use client';

import { useState, useCallback } from 'react';
import DeckPlayer from '@/components/decks/DeckPlayer';
import DeckEditor from '@/components/decks/DeckEditor';
import type { Deck } from '@/lib/decks/db';

interface DeckPageProps {
  deck: Deck;
  channelNames: Record<string, string>;
}

export default function DeckPage({ deck, channelNames }: DeckPageProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const toggleEditor = useCallback(() => setEditorOpen((v) => !v), []);

  return (
    <div
      className="fixed inset-0"
      style={{ backgroundColor: '#000' }}
    >
      <DeckPlayer
        initialDeck={deck}
        channelNames={channelNames}
        onToggleEditor={toggleEditor}
      />

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
