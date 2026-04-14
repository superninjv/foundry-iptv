// src/app/api/admin/startup/route.ts
// GET: household settings. PUT: update. Admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const res = await query<{
    default_deck_id: string | null;
    default_view_mode: string;
    allow_user_override: boolean;
    updated_at: string;
  }>(
    'SELECT default_deck_id, default_view_mode, allow_user_override, updated_at FROM iptv_household_settings WHERE id = 1',
  );

  return NextResponse.json(res.rows[0] ?? null);
}

export async function PUT(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const body = await req.json().catch(() => ({})) as {
    default_deck_id?: string | null;
    default_view_mode?: string;
    allow_user_override?: boolean;
  };

  await query(
    `UPDATE iptv_household_settings
     SET default_deck_id = COALESCE($1, default_deck_id),
         default_view_mode = COALESCE($2, default_view_mode),
         allow_user_override = COALESCE($3, allow_user_override),
         updated_at = NOW()
     WHERE id = 1`,
    [
      body.default_deck_id ?? null,
      body.default_view_mode ?? null,
      body.allow_user_override ?? null,
    ],
  );

  return NextResponse.json({ ok: true });
}
