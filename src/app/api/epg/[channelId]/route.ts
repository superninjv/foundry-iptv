// src/app/api/epg/[channelId]/route.ts
import { NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getEpg } from '@/lib/threadfin/client';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { channelId } = await params;
  const programs = await getEpg(channelId);

  // Serialize dates as ISO strings
  const serialized = programs.map((p) => ({
    ...p,
    start: p.start.toISOString(),
    end: p.end.toISOString(),
  }));

  return NextResponse.json({ programs: serialized }, {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
    },
  });
}
