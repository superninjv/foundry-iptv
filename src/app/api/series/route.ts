// src/app/api/series/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getSeriesList } from '@/lib/xtream/client';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const category = request.nextUrl.searchParams.get('category') || undefined;

  try {
    const series = await getSeriesList(category);
    return NextResponse.json({ series });
  } catch (err) {
    console.error('[api/series]', err);
    return NextResponse.json({ error: 'Failed to fetch series' }, { status: 502 });
  }
}
