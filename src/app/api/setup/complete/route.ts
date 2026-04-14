// src/app/api/setup/complete/route.ts
// POST — mark setup as complete. Idempotent read, guarded write.

import { NextResponse } from 'next/server';
import { getConfig, setConfig } from '@/lib/config/db';

export async function POST() {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') {
    return NextResponse.json({ ok: true, already_complete: true });
  }
  await setConfig('setup_complete', 'true');
  return NextResponse.json({ ok: true });
}
