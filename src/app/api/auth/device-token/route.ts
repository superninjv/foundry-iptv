// src/app/api/auth/device-token/route.ts
// POST: exchange a pairing code for a long-lived device token.
// Validates code (not expired, not consumed), generates a 32-byte token,
// stores its SHA-256 hash, marks the code consumed, returns the raw token ONCE.
//
// The returned token is used by the Rust client as:
//   Authorization: Bearer <token>
//
// Subsequent requests with this header are validated by middleware.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { query } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    code?: string;
    label_hint?: string;
  } | null;

  if (!body?.code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  const code = body.code.trim().toUpperCase();

  // Look up the pairing code
  const codeRes = await query<{
    code: string;
    created_by: string;
    label: string;
    platform: string;
    expires_at: string;
    consumed_at: string | null;
  }>(
    `SELECT code, created_by, label, platform, expires_at, consumed_at
     FROM iptv_device_pairing_codes
     WHERE code = $1`,
    [code],
  );

  const pairingCode = codeRes.rows[0];

  if (!pairingCode) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 404 });
  }

  if (pairingCode.consumed_at) {
    return NextResponse.json({ error: 'Pairing code already used' }, { status: 409 });
  }

  if (new Date(pairingCode.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Pairing code expired' }, { status: 410 });
  }

  // Generate a 32-byte random token
  const rawToken = randomBytes(32).toString('hex'); // 64 hex chars
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const label = body.label_hint?.trim() || pairingCode.label;

  // Insert device token
  const tokenRes = await query<{ id: string }>(
    `INSERT INTO iptv_device_tokens (user_id, token_hash, label, platform)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [pairingCode.created_by, tokenHash, label, pairingCode.platform],
  );

  const tokenId = tokenRes.rows[0].id;

  // Mark pairing code consumed
  await query(
    `UPDATE iptv_device_pairing_codes
     SET consumed_at = NOW(), consumed_token_id = $1
     WHERE code = $2`,
    [tokenId, code],
  );

  // Return the raw token — this is the ONLY time it's visible
  return NextResponse.json(
    {
      token: rawToken,
      token_id: tokenId,
      label,
      platform: pairingCode.platform,
    },
    { status: 201 },
  );
}
