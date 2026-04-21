// src/app/api/decks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getDeck, updateDeck, deleteDeck, type DeckPatch } from '@/lib/decks/db';
import { listChannels } from '@/lib/threadfin/client';
import type { Channel } from '@/lib/threadfin/types';

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const deckId = parseId(id);
  if (deckId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const deck = await getDeck(user.id, deckId);
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  // Enrich entries with the full Channel object so native clients (FireStick,
  // Kotlin) don't have to fetch the 52K-channel list and build an in-memory
  // join on every DeckScreen render. `listChannels()` hits the Redis cache in
  // 100-500ms and the resulting Map lookup is O(1) per entry. The bare
  // `channelId` is preserved alongside `channel` for backward compatibility
  // with any existing consumers.
  const allChannels = await listChannels();
  const byId = new Map<string, Channel>();
  for (const ch of allChannels) byId.set(ch.id, ch);

  const enrichedEntries = deck.entries.map((entry) => {
    const channel = byId.get(entry.channelId) ?? null;
    if (!channel) {
      console.warn(
        `[decks] entry ${entry.id} references missing channel ${entry.channelId} (deck ${deckId})`,
      );
    }
    return { ...entry, channel };
  });

  const enrichedDeck = { ...deck, entries: enrichedEntries };
  return NextResponse.json({ deck: enrichedDeck });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const deckId = parseId(id);
  if (deckId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: DeckPatch = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if ('viewMode' in body) {
    if (body.viewMode !== 'single' && body.viewMode !== 'multi') {
      return NextResponse.json({ error: 'Invalid viewMode' }, { status: 400 });
    }
    patch.viewMode = body.viewMode;
  }
  if ('cursorIndex' in body) {
    if (typeof body.cursorIndex !== 'number' || !Number.isInteger(body.cursorIndex) || body.cursorIndex < 0) {
      return NextResponse.json({ error: 'Invalid cursorIndex' }, { status: 400 });
    }
    patch.cursorIndex = body.cursorIndex;
  }
  if ('skipCommercials' in body) {
    if (typeof body.skipCommercials !== 'boolean') {
      return NextResponse.json({ error: 'Invalid skipCommercials' }, { status: 400 });
    }
    patch.skipCommercials = body.skipCommercials;
  }

  const ok = await updateDeck(user.id, deckId, patch);
  if (!ok) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const deckId = parseId(id);
  if (deckId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const ok = await deleteDeck(user.id, deckId);
  if (!ok) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
