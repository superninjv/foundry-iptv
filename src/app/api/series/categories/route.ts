// src/app/api/series/categories/route.ts
import { NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getSeriesCategories } from '@/lib/xtream/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  try {
    const categories = await getSeriesCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    console.error('[api/series/categories]', err);
    return NextResponse.json({ error: 'Failed to fetch series categories' }, { status: 502 });
  }
}
