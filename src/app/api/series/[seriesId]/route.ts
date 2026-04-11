// src/app/api/series/[seriesId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getSeriesInfo } from '@/lib/xtream/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { seriesId } = await params;

  try {
    const info = await getSeriesInfo(seriesId);
    return NextResponse.json(info);
  } catch (err) {
    console.error('[api/series/detail]', err);
    return NextResponse.json({ error: 'Failed to fetch series info' }, { status: 502 });
  }
}
