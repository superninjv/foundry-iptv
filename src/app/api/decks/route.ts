// src/app/api/decks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { listDecks, createDeck } from '@/lib/decks/db';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const decks = await listDecks(user.id);
  return NextResponse.json({ decks });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const id = await createDeck(user.id, name.trim());
  return NextResponse.json({ id }, { status: 201 });
}
