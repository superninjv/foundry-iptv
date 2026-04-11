// src/app/api/decks/[id]/entries/[entryId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { removeEntry, renewEntry } from '@/lib/decks/db';
import { isValidTtl } from '@/lib/decks/ttl';

function parseIds(id: string, entryId: string): { deckId: number; entryId: number } | null {
  const d = Number(id);
  const e = Number(entryId);
  if (!Number.isInteger(d) || d <= 0 || !Number.isInteger(e) || e <= 0) return null;
  return { deckId: d, entryId: e };
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const p = await params;
  const ids = parseIds(p.id, p.entryId);
  if (!ids) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const ok = await removeEntry(user.id, ids.deckId, ids.entryId);
  if (!ok) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const p = await params;
  const ids = parseIds(p.id, p.entryId);
  if (!ids) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { ttl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidTtl(body.ttl)) {
    return NextResponse.json({ error: 'Invalid ttl' }, { status: 400 });
  }

  const ok = await renewEntry(user.id, ids.deckId, ids.entryId, body.ttl);
  if (!ok) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
