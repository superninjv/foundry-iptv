// src/app/api/search/ai/route.ts
// GET /api/search/ai?q=natural+language+query
// AI-enhanced unified search: channels + EPG + VOD, reranked by Groq.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { aiSearch } from '@/lib/search/semantic';

const MAX_QUERY_LENGTH = 500;

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const q = request.nextUrl.searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 },
    );
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `Query must be ${MAX_QUERY_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const results = await aiSearch(q);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[api/search/ai] Search failed:', err);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 },
    );
  }
}
