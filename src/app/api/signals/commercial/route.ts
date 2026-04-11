// src/app/api/signals/commercial/route.ts
// Service-to-service endpoint: ts2hls sidecar posts commercial-break signals
// (silence/blackframe detection) here. Bearer auth only — not user-session.
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { query } from '@/lib/db/client';

const VALID_SOURCES = new Set(['silence', 'blackframe', 'manual', 'epg']);

function checkBearer(req: NextRequest): boolean {
  const expected = process.env.TS2HLS_BEARER_TOKEN || '';
  if (!expected) return false;

  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const provided = header.slice(7);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!checkBearer(request)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { channelId, inCommercial, confidence, source } = body as {
    channelId?: unknown;
    inCommercial?: unknown;
    confidence?: unknown;
    source?: unknown;
  };

  if (typeof channelId !== 'string' || channelId.length === 0 || channelId.length > 255) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }
  if (typeof inCommercial !== 'boolean') {
    return NextResponse.json({ error: 'inCommercial must be boolean' }, { status: 400 });
  }
  let conf = 0;
  if (confidence !== undefined) {
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return NextResponse.json({ error: 'confidence must be 0..1' }, { status: 400 });
    }
    conf = confidence;
  }
  if (typeof source !== 'string' || !VALID_SOURCES.has(source)) {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO iptv_channel_commercial_state (channel_id, in_commercial, confidence, source, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (channel_id) DO UPDATE SET
         in_commercial = EXCLUDED.in_commercial,
         confidence    = EXCLUDED.confidence,
         source        = EXCLUDED.source,
         updated_at    = NOW()`,
      [channelId, inCommercial, conf, source],
    );
  } catch (err) {
    console.error('[signals/commercial] db upsert failed:', (err as Error).message);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
