// src/app/api/admin/devices/setup/status/route.ts
// POST { ip } — poll device state. Admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, forbidden, unauthorized } from '@/lib/auth/session';
import { adbDevices } from '@/lib/adb/client';

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const body = await req.json().catch(() => null) as { ip?: string } | null;
  const ip = body?.ip?.trim();

  if (!ip || !IP_RE.test(ip)) {
    return NextResponse.json({ error: 'Valid IPv4 address required' }, { status: 400 });
  }

  const target = `${ip}:5555`;

  try {
    const devices = await adbDevices();
    const found = devices.find((d) => d.serial === target);

    const state = found?.state ?? 'not-present';
    return NextResponse.json({ target, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
