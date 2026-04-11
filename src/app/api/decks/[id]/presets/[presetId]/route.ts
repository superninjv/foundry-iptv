// src/app/api/decks/[id]/presets/[presetId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { removePreset } from '@/lib/decks/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const p = await params;
  const deckId = Number(p.id);
  const presetId = Number(p.presetId);
  if (!Number.isInteger(deckId) || deckId <= 0 || !Number.isInteger(presetId) || presetId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const ok = await removePreset(user.id, deckId, presetId);
  if (!ok) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
