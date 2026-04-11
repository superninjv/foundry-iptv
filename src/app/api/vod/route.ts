// src/app/api/vod/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getVodStreams } from '@/lib/xtream/client';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const category = request.nextUrl.searchParams.get('category') || undefined;

  try {
    const streams = await getVodStreams(category);
    return NextResponse.json({ streams });
  } catch (err) {
    console.error('[api/vod]', err);
    return NextResponse.json({ error: 'Failed to fetch VOD streams' }, { status: 502 });
  }
}
