// src/app/api/setup/progress/route.ts
// GET — returns current EPG ingest progress. Polled by Step4Ingest every 2s.
// Read-only, no auth required during setup.

import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/db';

export async function GET() {
  const [setupComplete, lastIngestAt, ingestProgress] = await Promise.all([
    getConfig('setup_complete'),
    getConfig('last_epg_ingest_at'),
    getConfig('epg_ingest_progress'),
  ]);

  // ingest-epg.ts writes JSON {stage, count, ts} to this key; parse safely.
  let progress: { stage: string; count: number; ts: number } | null = null;
  if (ingestProgress) {
    try {
      progress = JSON.parse(ingestProgress);
    } catch {
      progress = null;
    }
  }

  return NextResponse.json({
    setup_complete: setupComplete === 'true',
    last_epg_ingest_at: lastIngestAt,
    epg_ingest_progress: progress,
  });
}
