// src/app/api/admin/devices/setup/install/route.ts
// POST { ip } — push and install the APK on a connected FireStick. Admin-only.
//
// APK path resolution order:
//   1. FOUNDRY_APK_PATH env var (if set)
//   2. /srv/foundry-apk/foundry-iptv.apk (production)
//   3. ./clients/dist/foundry-iptv.apk (local dev fallback)

import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getApiUser, forbidden, unauthorized } from '@/lib/auth/session';
import { adbDevices, adbInstall } from '@/lib/adb/client';

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const PROD_APK = '/srv/foundry-apk/foundry-iptv.apk';
const DEV_APK = resolve(process.cwd(), 'clients/dist/foundry-iptv.apk');

function resolveApkPath(): string | null {
  const envPath = process.env.FOUNDRY_APK_PATH;
  if (envPath) return envPath;
  if (existsSync(PROD_APK)) return PROD_APK;
  if (existsSync(DEV_APK)) return DEV_APK;
  return null;
}

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

  // Ensure device is in authorized state before installing.
  const devices = await adbDevices();
  const found = devices.find((d) => d.serial === target);
  if (!found || found.state !== 'device') {
    return NextResponse.json(
      { error: 'Device is not connected and authorized. Please complete the authorization step first.' },
      { status: 400 },
    );
  }

  const apkPath = resolveApkPath();
  if (!apkPath) {
    return NextResponse.json(
      { error: 'APK not found. Expected at /srv/foundry-apk/foundry-iptv.apk or ./clients/dist/foundry-iptv.apk. Set FOUNDRY_APK_PATH to override.' },
      { status: 500 },
    );
  }

  try {
    const result = await adbInstall(target, apkPath);
    const success = result.code === 0 && result.stdout.includes('Success');
    return NextResponse.json({ success, stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
