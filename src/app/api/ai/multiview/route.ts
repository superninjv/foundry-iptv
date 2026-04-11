// src/app/api/ai/multiview/route.ts
// POST: parse natural language command into multiview channel IDs + layout.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { parseIntent } from '@/lib/ai/intent';
import { resolveMultiviewIntent } from '@/lib/ai/resolve';

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).command !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing "command" field' },
      { status: 400 },
    );
  }

  const command = ((body as Record<string, unknown>).command as string).trim();
  if (!command) {
    return NextResponse.json(
      { error: 'Command cannot be empty' },
      { status: 400 },
    );
  }
  if (command.length > 500) {
    return NextResponse.json(
      { error: 'Command too long (max 500 characters)' },
      { status: 400 },
    );
  }

  // Parse intent via Groq
  const intent = await parseIntent(command);
  if (!intent) {
    return NextResponse.json(
      { error: 'Could not understand command' },
      { status: 400 },
    );
  }

  // Resolve queries to channel IDs
  const resolved = await resolveMultiviewIntent(intent);

  return NextResponse.json({
    channelIds: resolved.channelIds,
    layout: resolved.layout,
    matches: resolved.matches,
    unresolved: resolved.unresolved,
  });
}
