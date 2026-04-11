// src/app/api/vod/categories/route.ts
import { NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getVodCategories } from '@/lib/xtream/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  try {
    const categories = await getVodCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    console.error('[api/vod/categories]', err);
    return NextResponse.json({ error: 'Failed to fetch VOD categories' }, { status: 502 });
  }
}
