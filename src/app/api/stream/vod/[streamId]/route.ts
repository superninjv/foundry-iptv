// src/app/api/stream/vod/[streamId]/route.ts
// Creates a ts2hls session for VOD/Series content.
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getStreamUrl } from '@/lib/xtream/client';
import { createSession, destroySession, VALID_QUALITIES, type Quality } from '@/lib/stream/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { streamId } = await params;

  let type: 'movie' | 'series' = 'movie';
  let ext = 'mp4';
  let quality: Quality | undefined;

  try {
    const body = await request.json();
    if (body.type === 'series') type = 'series';
    if (body.ext) ext = String(body.ext);
    if (body.quality !== undefined) {
      if (typeof body.quality !== 'string' || !VALID_QUALITIES.includes(body.quality as Quality)) {
        return NextResponse.json({ error: 'Invalid quality' }, { status: 400 });
      }
      quality = body.quality as Quality;
    }
  } catch {
    // Use defaults if no body
  }

  try {
    const providerUrl = await getStreamUrl(streamId, type, ext);
    const session = await createSession(providerUrl, 'vod', undefined, quality);

    const origin = request.headers.get('x-forwarded-proto')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
      : `http://${request.headers.get('host') || 'localhost:3003'}`;
    const hlsUrl = session.hlsUrl.replace('http://localhost:3103', origin);

    return NextResponse.json({
      sid: session.sid,
      hlsUrl,
      sourceWidth: session.sourceWidth,
      sourceHeight: session.sourceHeight,
    });
  } catch (err) {
    console.error('[api/stream/vod]', err);
    return NextResponse.json({ error: 'Failed to start VOD stream' }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  await params;

  let sid = request.nextUrl.searchParams.get('sid');
  if (!sid) {
    try {
      const body = await request.json();
      sid = body.sid;
    } catch {
      // no body
    }
  }

  if (!sid) {
    return NextResponse.json({ error: 'Missing sid' }, { status: 400 });
  }

  await destroySession(sid);
  return new NextResponse(null, { status: 204 });
}
