// src/app/api/multiview/route.ts
// Manages multiple concurrent HLS transcode sessions for multiview.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getProviderUrl } from '@/lib/threadfin/client';
import { createSession, destroySession, VALID_QUALITIES, type Quality } from '@/lib/stream/client';

const MAX_CHANNELS = 9;

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: { channelIds?: unknown; quality?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelIds } = body;

  let quality: Quality | undefined;
  if (body.quality !== undefined) {
    if (typeof body.quality !== 'string' || !VALID_QUALITIES.includes(body.quality as Quality)) {
      return NextResponse.json({ error: 'Invalid quality' }, { status: 400 });
    }
    quality = body.quality as Quality;
  }

  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return NextResponse.json(
      { error: 'channelIds must be a non-empty array' },
      { status: 400 },
    );
  }

  // Validate: all entries are non-empty strings
  const validIds = channelIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );

  if (validIds.length === 0) {
    return NextResponse.json(
      { error: 'channelIds must contain non-empty strings' },
      { status: 400 },
    );
  }

  if (validIds.length > MAX_CHANNELS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_CHANNELS} channels allowed` },
      { status: 400 },
    );
  }

  // Build origin for rewriting localhost:3103 HLS URLs
  const origin = request.headers.get('x-forwarded-proto')
    ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
    : `http://${request.headers.get('host') || 'localhost:3003'}`;

  const sessions: { channelId: string; sid: string; hlsUrl: string }[] = [];
  const errors: { channelId: string; error: string }[] = [];

  await Promise.all(
    validIds.map(async (channelId) => {
      try {
        const providerUrl = await getProviderUrl(channelId);
        if (!providerUrl) {
          errors.push({ channelId, error: 'No provider URL found' });
          return;
        }

        const session = await createSession(providerUrl, 'live', channelId, quality);
        const hlsUrl = session.hlsUrl.replace('http://localhost:3103', origin);
        sessions.push({ channelId, sid: session.sid, hlsUrl });
      } catch (err) {
        errors.push({
          channelId,
          error: (err as Error).message || 'Failed to create session',
        });
      }
    }),
  );

  return NextResponse.json({ sessions, errors });
}

export async function DELETE(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: { sids?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { sids } = body;

  if (Array.isArray(sids)) {
    await Promise.all(
      sids
        .filter((sid): sid is string => typeof sid === 'string')
        .map((sid) => destroySession(sid).catch(() => {})),
    );
  }

  return new NextResponse(null, { status: 204 });
}
