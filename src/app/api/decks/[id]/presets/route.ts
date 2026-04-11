// src/app/api/decks/[id]/presets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { addPreset, isValidLayout } from '@/lib/decks/db';

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

  let body: { channelIds?: unknown; layout?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelIds, layout } = body;
  if (
    !Array.isArray(channelIds) ||
    channelIds.length === 0 ||
    !channelIds.every((c) => typeof c === 'string' && c.length > 0)
  ) {
    return NextResponse.json({ error: 'Invalid channelIds' }, { status: 400 });
  }
  if (!isValidLayout(layout)) {
    return NextResponse.json({ error: 'Invalid layout' }, { status: 400 });
  }

  const presetId = await addPreset(user.id, deckId, channelIds as string[], layout);
  if (presetId === null) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  return NextResponse.json({ id: presetId }, { status: 201 });
}
