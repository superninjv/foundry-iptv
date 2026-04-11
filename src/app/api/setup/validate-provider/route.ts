// src/app/api/setup/validate-provider/route.ts
// POST — validate M3U + XMLTV URLs.
// Used by programmatic clients (e.g. Rust native client pairing flow).

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/db';
import { validateProviderUrl } from '@/lib/setup/provider';

export async function POST(req: NextRequest) {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') {
    return NextResponse.json({ error: 'Setup already complete.' }, { status: 409 });
  }

  let body: { m3u_url?: string; xmltv_url?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { m3u_url, xmltv_url } = body;

  if (!m3u_url || !xmltv_url) {
    return NextResponse.json({ error: 'm3u_url and xmltv_url are required.' }, { status: 400 });
  }

  const [m3uResult, xmltvResult] = await Promise.all([
    validateProviderUrl(m3u_url, 'M3U'),
    validateProviderUrl(xmltv_url, 'XMLTV'),
  ]);

  if (!m3uResult.ok) return NextResponse.json({ error: m3uResult.error }, { status: 422 });
  if (!xmltvResult.ok) return NextResponse.json({ error: xmltvResult.error }, { status: 422 });

  return NextResponse.json({ ok: true });
}
