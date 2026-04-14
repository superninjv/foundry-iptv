// src/app/api/stream/[channelId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getProviderUrl } from '@/lib/threadfin/client';
import { createSession, destroySession, changeSessionQuality, VALID_QUALITIES, type Quality } from '@/lib/stream/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { channelId } = await params;
  const providerUrl = await getProviderUrl(channelId);
  if (!providerUrl) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  let quality: Quality | undefined;
  try {
    const body = await request.json();
    if (body?.quality !== undefined) {
      if (typeof body.quality !== 'string' || !VALID_QUALITIES.includes(body.quality as Quality)) {
        return NextResponse.json({ error: 'Invalid quality' }, { status: 400 });
      }
      quality = body.quality as Quality;
    }
  } catch {
    // no body
  }

  const session = await createSession(providerUrl, 'live', channelId, quality);

  // Rewrite localhost:3103 HLS URL to use the request's origin so browsers
  // on other devices can reach ts2hls via Caddy's /hls/* proxy.
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
}

/**
 * PATCH /api/stream/[channelId]
 * Body: { sid: string; quality: Quality }
 * Proxies quality hot-swap to ts2hls /session/:sid/quality.
 * The client must own a valid session (authenticated) — we don't verify
 * that the sid belongs to *this user* since ts2hls sessions are
 * capability-by-UUID. The bearer token on the ts2hls hop provides
 * the server-to-server auth boundary.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  await params; // channelId not needed for quality change

  let sid: string | undefined;
  let quality: Quality | undefined;
  try {
    const body = await request.json();
    sid = body?.sid;
    quality = body?.quality;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!sid || typeof sid !== 'string') {
    return NextResponse.json({ error: 'Missing sid' }, { status: 400 });
  }
  if (!quality || !VALID_QUALITIES.includes(quality)) {
    return NextResponse.json({ error: 'Invalid quality' }, { status: 400 });
  }

  try {
    const result = await changeSessionQuality(sid, quality);
    // Rewrite localhost URL to match request origin
    const origin = request.headers.get('x-forwarded-proto')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
      : `http://${request.headers.get('host') || 'localhost:3003'}`;
    const hlsUrl = result.hlsUrl.replace('http://localhost:3103', origin);
    return NextResponse.json({ ok: true, hlsUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quality change failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  await params; // consume params even though we don't need channelId for delete

  // Read sid from body or query
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
