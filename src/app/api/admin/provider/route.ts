// src/app/api/admin/provider/route.ts
// GET: current provider URLs. PUT: update + mark provider_changed_at. Admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '@/lib/auth/session';
import { getConfig, setConfig } from '@/lib/config/db';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const [m3uUrl, xmltvUrl] = await Promise.all([
    getConfig('m3u_url'),
    getConfig('xmltv_url'),
  ]);

  return NextResponse.json({
    m3u_url: m3uUrl,
    xmltv_url: xmltvUrl,
    env_m3u_url: process.env.RAW_M3U_URL ?? null,
    env_xmltv_url: process.env.RAW_XMLTV_URL ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const body = await req.json().catch(() => ({})) as {
    m3u_url?: string;
    xmltv_url?: string;
  };

  if (body.m3u_url !== undefined) {
    await setConfig('m3u_url', body.m3u_url, user.id);
  }
  if (body.xmltv_url !== undefined) {
    await setConfig('xmltv_url', body.xmltv_url, user.id);
  }

  // Mark timestamp so scheduled ingest can detect a change
  await setConfig('provider_changed_at', new Date().toISOString());

  return NextResponse.json({ ok: true });
}
