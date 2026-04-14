// src/app/api/admin/devices/pair/route.ts
// POST: create a device pairing code (admin only). Returns the 8-char code.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

function randomCode(): string {
  const half = () =>
    Array.from(
      { length: 4 },
      () => CHARS[Math.floor(Math.random() * CHARS.length)],
    ).join('');
  return `${half()}-${half()}`;
}

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const body = await req.json().catch(() => ({})) as {
    label?: string;
    platform?: string;
  };

  const label = (body.label ?? 'Unnamed Device').trim();
  const platform = (body.platform ?? 'unknown').trim();

  const code = randomCode();
  // 24-hour TTL. The code is still single-use (consumed_at marks it spent),
  // but the admin shouldn't be racing a stopwatch when setting up a device
  // that takes several minutes to boot/install.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO iptv_device_pairing_codes (code, created_by, label, platform, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [code, user.id, label, platform, expiresAt],
  );

  return NextResponse.json({ code, expires_at: expiresAt.toISOString() }, { status: 201 });
}
