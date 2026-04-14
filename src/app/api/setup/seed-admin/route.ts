// src/app/api/setup/seed-admin/route.ts
// POST — programmatic admin seed (used by native clients or automated setup).
// The web wizard uses server actions directly; this route is for non-browser flows.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db/client';
import { getConfig } from '@/lib/config/db';

interface SeedBody {
  email: string;
  display_name: string;
  password: string;
}

export async function POST(req: NextRequest) {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') {
    return NextResponse.json({ error: 'Setup already complete.' }, { status: 409 });
  }

  let body: SeedBody;
  try {
    body = await req.json() as SeedBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { email, display_name, password } = body;
  if (!email || !display_name || !password) {
    return NextResponse.json({ error: 'email, display_name, and password are required.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const existing = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM iptv_users');
  if (Number(existing.rows[0]?.count ?? '0') > 0) {
    return NextResponse.json({ error: 'Users already exist.' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO iptv_users (email, password_hash, display_name, is_admin, can_manage_sessions)
     VALUES ($1, $2, $3, TRUE, TRUE)`,
    [email, passwordHash, display_name],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
