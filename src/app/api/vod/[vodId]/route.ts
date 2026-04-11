// src/app/api/vod/[vodId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getVodInfo } from '@/lib/xtream/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vodId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { vodId } = await params;

  try {
    const info = await getVodInfo(vodId);
    return NextResponse.json(info);
  } catch (err) {
    console.error('[api/vod/detail]', err);
    return NextResponse.json({ error: 'Failed to fetch VOD info' }, { status: 502 });
  }
}
