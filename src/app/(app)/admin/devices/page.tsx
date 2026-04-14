// src/app/(app)/admin/devices/page.tsx
// List device tokens, revoke tokens, generate pairing codes.

import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Admin — Devices' };

async function revokeToken(formData: FormData) {
  'use server';
  const tokenId = formData.get('tokenId') as string | null;
  if (!tokenId) return;
  await query(
    'UPDATE iptv_device_tokens SET revoked_at = NOW() WHERE id = $1',
    [tokenId],
  );
  revalidatePath('/admin/devices');
}

async function generatePairingCode(formData: FormData) {
  'use server';
  const label = (formData.get('label') as string | null)?.trim() ?? 'Unnamed Device';
  const platform = (formData.get('platform') as string | null)?.trim() ?? 'unknown';

  // Get admin user via server action context — we need the session
  const { auth } = await import('@/lib/auth/config');
  const session = await auth();
  if (!session?.user?.id) return;

  // Generate 8-char human-friendly code: XXXX-XXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
  const half = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const code = `${half()}-${half()}`;
  // 24-hour TTL — single-use anyway (consumed_at marks it spent), so there's
  // no point squeezing the admin with a 10-minute stopwatch.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO iptv_device_pairing_codes (code, created_by, label, platform, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [code, session.user.id, label, platform, expiresAt],
  );

  revalidatePath('/admin/devices');
  redirect(`/admin/devices?code=${encodeURIComponent(code)}&expires=${expiresAt.toISOString()}`);
}

interface TokenRow {
  id: string;
  label: string;
  platform: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  user_email: string;
}

export default async function AdminDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; expires?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const newCode = params.code;
  const codeExpires = params.expires;

  const tokensRes = await query<TokenRow>(
    `SELECT t.id, t.label, t.platform, t.created_at, t.last_used_at, t.revoked_at,
            u.email AS user_email
     FROM iptv_device_tokens t
     JOIN iptv_users u ON u.id = t.user_id
     ORDER BY t.created_at DESC`,
  ).catch(() => ({ rows: [] as TokenRow[] }));

  const tokens = tokensRes.rows;

  const sectionStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
  };
  const inputStyle = {
    backgroundColor: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--fg)',
  };
  const selectStyle = { ...inputStyle };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Devices</h1>
        <Link
          href="/admin/devices/setup/firestick"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
        >
          + Add a FireStick
        </Link>
      </div>

      {/* Show newly generated code prominently */}
      {newCode && (
        <div
          className="mb-6 rounded-xl border p-5"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-raised)' }}
        >
          <p className="text-sm font-medium mb-2">New Pairing Code (expires {codeExpires ? new Date(codeExpires).toLocaleString() : 'in 24 hours'})</p>
          <p
            className="text-4xl font-bold tracking-widest font-mono"
            style={{ color: 'var(--accent)' }}
          >
            {newCode}
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
            Enter this code on the device to pair it. Single-use; expires in 24 hours.
          </p>
        </div>
      )}

      {/* Device token list */}
      <section className="mb-8 rounded-xl border overflow-auto" style={sectionStyle}>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr
              className="border-b text-left text-xs uppercase tracking-widest"
              style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
            >
              <th className="p-3">Label</th>
              <th className="p-3">Platform</th>
              <th className="p-3">User</th>
              <th className="p-3">Created</th>
              <th className="p-3">Last Used</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr
                key={t.id}
                className="border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="p-3">{t.label}</td>
                <td className="p-3">{t.platform}</td>
                <td className="p-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {t.user_email}
                </td>
                <td className="p-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="p-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {t.last_used_at
                    ? new Date(t.last_used_at).toLocaleString()
                    : 'Never'}
                </td>
                <td className="p-3 text-xs">
                  {t.revoked_at ? (
                    <span style={{ color: '#ef4444' }}>Revoked</span>
                  ) : (
                    <span style={{ color: '#22c55e' }}>Active</span>
                  )}
                </td>
                <td className="p-3">
                  {!t.revoked_at && (
                    <form action={revokeToken}>
                      <input type="hidden" name="tokenId" value={t.id} />
                      <button
                        type="submit"
                        className="rounded px-2 py-1 text-xs hover:bg-[var(--bg)]"
                        style={{ color: '#ef4444' }}
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {tokens.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-4 text-center text-sm"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  No device tokens yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Generate pairing code */}
      <section className="rounded-xl border p-5 max-w-sm" style={sectionStyle}>
        <h2 className="mb-4 font-semibold">Generate Pairing Code</h2>
        <form action={generatePairingCode} className="flex flex-col gap-3">
          <input
            name="label"
            type="text"
            placeholder="Device label (e.g. Living Room FireStick)"
            required
            className="rounded border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <select
            name="platform"
            className="rounded border px-3 py-2 text-sm"
            style={selectStyle}
          >
            <option value="firestick">FireStick</option>
            <option value="streaming-pc">Streaming PC</option>
            <option value="desktop">Desktop</option>
            <option value="other">Other</option>
          </select>
          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            Generate Code
          </button>
        </form>
      </section>
    </div>
  );
}
