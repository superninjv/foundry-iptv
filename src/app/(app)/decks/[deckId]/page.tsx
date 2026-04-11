// src/app/(app)/decks/[deckId]/page.tsx
// Fullscreen deck playback. Player fills the viewport; editor lives in a
// collapsible bottom drawer toggled by a button in the overlay actions.

import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { getDeck } from '@/lib/decks/db';
import { listChannels } from '@/lib/threadfin/client';
import DeckPage from '@/components/decks/DeckPage';

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const user = await requireAuth();
  const { deckId } = await params;
  const numericId = Number(deckId);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const deck = await getDeck(user.id, numericId);
  if (!deck) notFound();

  // Build a channelId -> name map for just the channels referenced by this
  // deck. listChannels() is in-memory cached for 10 min so this is cheap.
  const referencedIds = new Set<string>();
  for (const e of deck.entries) referencedIds.add(e.channelId);
  for (const p of deck.presets) for (const id of p.channelIds) referencedIds.add(id);

  const channelNames: Record<string, string> = {};
  if (referencedIds.size > 0) {
    const channels = await listChannels();
    for (const ch of channels) {
      if (referencedIds.has(ch.id) && ch.name) {
        channelNames[ch.id] = ch.name;
      }
    }
  }

  return <DeckPage deck={deck} channelNames={channelNames} />;
}
