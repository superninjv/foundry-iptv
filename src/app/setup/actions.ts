'use server';
// src/app/setup/actions.ts
// Server actions for the first-run setup wizard.

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db/client';
import { getConfig, setConfig } from '@/lib/config/db';
import { validateProviderUrl } from '@/lib/setup/provider';
import { spawn } from 'node:child_process';
import path from 'node:path';

type ActionState = { error: string };

// ── Step 1: create admin account ──────────────────────────────────────────────

export async function seedAdmin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') redirect('/live');

  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const displayName = (formData.get('displayName') as string | null)?.trim() ?? '';
  const password = (formData.get('password') as string | null) ?? '';
  const confirm = (formData.get('confirmPassword') as string | null) ?? '';

  if (!email || !displayName || !password) {
    return { error: 'All fields are required.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  // Check no users exist yet
  const existing = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM iptv_users',
  );
  const userCount = Number(existing.rows[0]?.count ?? '0');
  if (userCount > 0) {
    // Already has users — skip ahead
    redirect('/setup?step=2');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO iptv_users (email, password_hash, display_name, is_admin, can_manage_sessions)
     VALUES ($1, $2, $3, TRUE, TRUE)`,
    [email, passwordHash, displayName],
  );

  redirect('/setup?step=2');
}

// ── Step 2: provider URLs ─────────────────────────────────────────────────────

export async function saveProvider(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') redirect('/live');

  const m3u = (formData.get('m3u_url') as string | null)?.trim() ?? '';
  const xmltv = (formData.get('xmltv_url') as string | null)?.trim() ?? '';

  const m3uResult = await validateProviderUrl(m3u, 'M3U');
  if (!m3uResult.ok) return { error: m3uResult.error! };

  const xmltvResult = await validateProviderUrl(xmltv, 'XMLTV');
  if (!xmltvResult.ok) return { error: xmltvResult.error! };

  await setConfig('m3u_url', m3u);
  await setConfig('xmltv_url', xmltv);

  redirect('/setup?step=3');
}

// ── Step 3: preferences ───────────────────────────────────────────────────────

export async function savePrefs(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') redirect('/live');

  const timezone = (formData.get('timezone') as string | null)?.trim() || 'America/New_York';
  const language = (formData.get('default_language') as string | null)?.trim() || 'en';
  const fireTv = formData.get('firetv_optimizations') === 'on' ? 'true' : 'false';

  await setConfig('timezone', timezone);
  await setConfig('default_language', language);
  await setConfig('firetv_optimizations', fireTv);

  redirect('/setup?step=4');
}

// ── Step 4: kick off ingest + mark complete ───────────────────────────────────

export async function triggerIngest(): Promise<void> {
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') return;

  // Detach the ingest script so the action returns immediately.
  // TODO: once ingest-epg.ts writes epg_ingest_progress to iptv_config,
  // Step4Ingest will display real progress from /api/setup/progress.
  // For now it falls back to a time-based spinner.
  const scriptPath = path.join(process.cwd(), 'scripts', 'ingest-epg.ts');
  const child = spawn(
    process.execPath, // node
    ['--import', 'tsx/esm', scriptPath],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    },
  );
  child.unref();

  // Mark setup complete
  await setConfig('setup_complete', 'true');
}
