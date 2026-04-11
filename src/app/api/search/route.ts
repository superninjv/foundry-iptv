// src/app/api/search/route.ts
// GET /api/search?q=term&type=all|channels|epg
// Auth-gated text search across channels and EPG data.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { searchAll, searchChannels, searchEpg, searchVod } from '@/lib/search/text';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim() || '';
  const type = searchParams.get('type') || 'all';

  if (!q) {
    return NextResponse.json({ channels: [], programs: [], vod: [] });
  }

  if (type === 'channels') {
    const channels = await searchChannels(q);
    return NextResponse.json({ channels, programs: [], vod: [] });
  }

  if (type === 'epg') {
    const programs = await searchEpg(q);
    return NextResponse.json({ channels: [], programs, vod: [] });
  }

  if (type === 'vod') {
    const vod = await searchVod(q);
    return NextResponse.json({ channels: [], programs: [], vod });
  }

  const results = await searchAll(q);
  return NextResponse.json(results);
}
