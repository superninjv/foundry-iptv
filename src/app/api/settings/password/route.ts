// src/app/api/settings/password/route.ts
// Change password endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '@/lib/auth/passwords';

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Current password and new password are required' },
      { status: 400 },
    );
  }

  // Fetch current hash
  const res = await query<{ password_hash: string }>(
    'SELECT password_hash FROM iptv_users WHERE id = $1',
    [user.id],
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Verify current password
  const valid = await verifyPassword(currentPassword, res.rows[0].password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
  }

  // Validate new password strength
  const validation = validatePasswordStrength(newPassword);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Password too weak', details: validation.errors },
      { status: 400 },
    );
  }

  // Hash and update
  const newHash = await hashPassword(newPassword);
  await query('UPDATE iptv_users SET password_hash = $1 WHERE id = $2', [
    newHash,
    user.id,
  ]);

  return NextResponse.json({ ok: true });
}
