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

  return NextResponse.json({
    setup_complete: setupComplete === 'true',
    last_epg_ingest_at: lastIngestAt,
    // TODO: ingest-epg.ts should write 'epg_ingest_progress' key to iptv_config
    // (e.g. "Imported 12,403 / 52,000 channels") so this field is non-null.
    // Until then, clients fall back to a time-based spinner.
    epg_ingest_progress: ingestProgress,
  });
}
