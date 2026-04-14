// src/app/api/startup/route.ts
// Public-to-authed: returns household settings for client boot sequence.
// Used by both the web client and the Rust native clients.

import { NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  try {
    const res = await query<{
      default_deck_id: string | null;
      default_view_mode: string;
      allow_user_override: boolean;
    }>(
      'SELECT default_deck_id, default_view_mode, allow_user_override FROM iptv_household_settings WHERE id = 1',
    );

    const row = res.rows[0];
    if (!row) {
      return NextResponse.json({
        default_deck_id: null,
        default_view_mode: 'single',
        allow_user_override: true,
      });
    }

    return NextResponse.json({
      default_deck_id: row.default_deck_id,
      default_view_mode: row.default_view_mode,
      allow_user_override: row.allow_user_override,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch startup settings' },
      { status: 500 },
    );
  }
}
