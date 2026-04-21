// src/app/api/channels/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { listChannels } from '@/lib/threadfin/client';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const category = request.nextUrl.searchParams.get('category');
  let channels = await listChannels();

  if (category) {
    channels = channels.filter((ch) => ch.group === category);
  }

  return NextResponse.json({ channels }, {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
    },
  });
}
