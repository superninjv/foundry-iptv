// src/app/api/admin/devices/setup/connect/route.ts
// POST { ip } — ADB connect to a FireStick. Admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, forbidden, unauthorized } from '@/lib/auth/session';
import { adbConnect } from '@/lib/adb/client';

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
    const result = await adbConnect(target);
    const out = result.stdout + result.stderr;

    let state: 'connected' | 'unauthorized' | 'unreachable' | 'error';
    let message: string | undefined;

    if (out.includes('connected to') || out.includes('already connected')) {
      state = 'connected';
    } else if (out.includes('failed to authenticate') || out.includes('unauthorized')) {
      state = 'unauthorized';
      message = 'Click Allow on your TV screen';
    } else if (out.includes('cannot connect') || out.includes('Connection refused') || out.includes('failed to connect') || result.code !== 0) {
      state = 'unreachable';
      message = "Can't reach that address. Check the IP and make sure the Fire TV is awake.";
    } else {
      state = 'error';
      message = out.trim() || 'Unknown error from adb connect';
    }

    return NextResponse.json({ target, state, message });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
