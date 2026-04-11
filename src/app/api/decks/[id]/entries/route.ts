// src/app/api/decks/[id]/entries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { addEntry } from '@/lib/decks/db';
import { isValidTtl } from '@/lib/decks/ttl';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const deckId = Number(id);
  if (!Number.isInteger(deckId) || deckId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: { channelId?: unknown; ttl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelId, ttl } = body;
  if (!channelId || typeof channelId !== 'string') {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
  }
  if (!isValidTtl(ttl)) {
    return NextResponse.json({ error: 'Invalid ttl' }, { status: 400 });
  }

  const entryId = await addEntry(user.id, deckId, channelId, ttl);
  if (entryId === null) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  return NextResponse.json({ id: entryId }, { status: 201 });
}
