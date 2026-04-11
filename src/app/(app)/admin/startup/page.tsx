// src/app/(app)/admin/startup/page.tsx
// Set household default deck, view mode, and allow_user_override.

import { requireAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Admin — Startup' };

interface HouseholdSettings {
  default_deck_id: string | null;
  default_view_mode: string;
  allow_user_override: boolean;
}

interface Deck {
  id: string;
  name: string;
  user_email: string;
}

async function saveStartup(formData: FormData) {
  'use server';
  const deckId = formData.get('default_deck_id') as string | null;
  const viewMode = formData.get('default_view_mode') as string | null;
  const allowOverride = formData.get('allow_user_override') === 'on';

  await query(
    `UPDATE iptv_household_settings
     SET default_deck_id = $1,
         default_view_mode = $2,
         allow_user_override = $3,
         updated_at = NOW()
     WHERE id = 1`,
    [
      deckId && deckId !== '' ? deckId : null,
      viewMode === 'multi' ? 'multi' : 'single',
      allowOverride,
    ],
  );
  revalidatePath('/admin/startup');
  redirect('/admin/startup?saved=1');
}

export default async function AdminStartupPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const saved = params.saved === '1';

  const [settingsRes, decksRes] = await Promise.all([
    query<HouseholdSettings>(
      'SELECT default_deck_id, default_view_mode, allow_user_override FROM iptv_household_settings WHERE id = 1',
    ).catch(() => ({ rows: [] as HouseholdSettings[] })),
    query<Deck>(
      `SELECT d.id::text, d.name, u.email AS user_email
       FROM iptv_superplayer_decks d
       JOIN iptv_users u ON u.id = d.user_id
       ORDER BY d.updated_at DESC`,
    ).catch(() => ({ rows: [] as Deck[] })),
  ]);

  const settings = settingsRes.rows[0] ?? {
    default_deck_id: null,
    default_view_mode: 'single',
    allow_user_override: true,
  };
  const decks = decksRes.rows;

  const sectionStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
  };
  const selectStyle = {
    backgroundColor: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--fg)',
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Startup Behavior</h1>

      {saved && (
        <p
          className="mb-4 rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: '#22c55e', color: '#22c55e' }}
        >
          Saved. Clients will receive the new settings on next boot.
        </p>
      )}

      <section className="rounded-xl border p-5 max-w-md" style={sectionStyle}>
        <form action={saveStartup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Default Deck</label>
            <select
              name="default_deck_id"
              defaultValue={settings.default_deck_id ?? ''}
              className="rounded border px-3 py-2 text-sm"
              style={selectStyle}
            >
              <option value="">None (no auto-deck on boot)</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.user_email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Default View Mode</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="default_view_mode"
                value="single"
                defaultChecked={settings.default_view_mode !== 'multi'}
              />
              Single
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="default_view_mode"
                value="multi"
                defaultChecked={settings.default_view_mode === 'multi'}
              />
              Multi
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allow_user_override"
              defaultChecked={settings.allow_user_override}
            />
            Allow users to override startup settings on their own session
          </label>

          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium self-start"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
