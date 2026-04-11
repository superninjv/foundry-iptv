// src/app/api/decks/[id]/from-ai/route.ts
// POST: parse a natural-language command via the existing AI multiview pipeline
// and bulk-add resolved channels to a deck. Optionally stores a multiview preset.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { parseIntent } from '@/lib/ai/intent';
import { resolveMultiviewIntent } from '@/lib/ai/resolve';
import { addEntry, addPreset, isValidLayout } from '@/lib/decks/db';

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const deckId = parseId(id);
  if (deckId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).command !== 'string'
  ) {
    return NextResponse.json({ error: 'Missing "command" field' }, { status: 400 });
  }

  const command = ((body as Record<string, unknown>).command as string).trim();
  if (!command) {
    return NextResponse.json({ error: 'Command cannot be empty' }, { status: 400 });
  }
  if (command.length > 500) {
    return NextResponse.json(
      { error: 'Command too long (max 500 characters)' },
      { status: 400 },
    );
  }

  const intent = await parseIntent(command);
  if (!intent) {
    return NextResponse.json(
      { error: 'Could not understand command' },
      { status: 400 },
    );
  }

  const resolved = await resolveMultiviewIntent(intent);

  let addedEntries = 0;
  let firstFailedOwnership = false;
  for (const channelId of resolved.channelIds) {
    const entryId = await addEntry(user.id, deckId, channelId, '24h');
    if (entryId === null) {
      firstFailedOwnership = true;
      break;
    }
    addedEntries += 1;
  }

  if (firstFailedOwnership && addedEntries === 0) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  let addedPreset = false;
  if (
    isValidLayout(resolved.layout) &&
    resolved.channelIds.length >= 2 &&
    resolved.channelIds.length <= 9
  ) {
    const presetId = await addPreset(
      user.id,
      deckId,
      resolved.channelIds,
      resolved.layout,
    );
    addedPreset = presetId !== null;
  }

  return NextResponse.json({
    addedEntries,
    addedPreset,
    unresolved: resolved.unresolved,
  });
}
