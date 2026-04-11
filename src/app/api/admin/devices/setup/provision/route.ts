// src/app/api/admin/devices/setup/provision/route.ts
// POST { ip, label } — mint a device token, push SharedPreferences, launch app. Admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getApiUser, forbidden, unauthorized } from '@/lib/auth/session';
import { adbDevices, adbPush, adbShell } from '@/lib/adb/client';
import { query } from '@/lib/db/client';

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const DEFAULT_SERVER_URL = 'http://iptv.foundry.test';

function buildPrefsXml(token: string, serverUrl: string): string {
  return `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="server_url">${serverUrl}</string>
    <string name="device_token">${token}</string>
</map>
`;
}

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const body = await req.json().catch(() => null) as { ip?: string; label?: string } | null;
  const ip = body?.ip?.trim();
  const label = body?.label?.trim() || 'FireStick';

  if (!ip || !IP_RE.test(ip)) {
    return NextResponse.json({ error: 'Valid IPv4 address required' }, { status: 400 });
  }

  const target = `${ip}:5555`;

  // Ensure device is authorized.
  const devices = await adbDevices();
  const found = devices.find((d) => d.serial === target);
  if (!found || found.state !== 'device') {
    return NextResponse.json(
      { error: 'Device is not connected and authorized.' },
      { status: 400 },
    );
  }

  // Generate token — mirrors /api/auth/device-token logic.
  const rawToken = randomBytes(32).toString('hex'); // 64 hex chars
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  // Insert into iptv_device_tokens.
  const tokenRes = await query<{ id: string }>(
    `INSERT INTO iptv_device_tokens (user_id, token_hash, label, platform)
     VALUES ($1, $2, $3, 'firestick')
     RETURNING id`,
    [user.id, tokenHash, label],
  );
  const tokenId = tokenRes.rows[0].id;

  // Build SharedPreferences XML and push it.
  const serverUrl = process.env.FOUNDRY_PUBLIC_URL || DEFAULT_SERVER_URL;
  const xml = buildPrefsXml(rawToken, serverUrl);
  const tmpFile = join(tmpdir(), `foundry_prefs_${tokenId}.xml`);

  try {
    await writeFile(tmpFile, xml, 'utf8');

    // Push to device temp location.
    const pushResult = await adbPush(target, tmpFile, '/data/local/tmp/foundry_prefs.xml');
    if (pushResult.code !== 0) {
      throw new Error(`adb push failed: ${pushResult.stderr.trim()}`);
    }

    // Copy into app SharedPreferences via run-as.
    const copyResult = await adbShell(
      target,
      'run-as com.foundry.iptv sh -c "mkdir -p shared_prefs && cp /data/local/tmp/foundry_prefs.xml shared_prefs/foundry_prefs.xml && chmod 660 shared_prefs/foundry_prefs.xml"',
    );
    if (copyResult.code !== 0) {
      // run-as may fail if app not installed yet or package name wrong — surface clearly.
      throw new Error(`run-as copy failed: ${copyResult.stderr.trim() || copyResult.stdout.trim()}`);
    }

    // Force-stop and relaunch so the app reads the new prefs.
    await adbShell(target, 'am force-stop com.foundry.iptv');
    await adbShell(target, 'am start -n com.foundry.iptv/.MainActivity');

    return NextResponse.json({ success: true, token_id: tokenId, label }, { status: 201 });
  } catch (err) {
    // Roll back the token row so a retry can succeed cleanly.
    await query('DELETE FROM iptv_device_tokens WHERE id = $1', [tokenId]).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
