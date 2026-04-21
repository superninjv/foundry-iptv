// src/app/(app)/admin/sessions/page.tsx
// List all active sessions with user info; revoke any session.

import { requireAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { revalidatePath } from 'next/cache';

export const metadata = { title: 'Admin — Sessions' };

async function revokeSession(formData: FormData) {
  'use server';
  const sessionId = formData.get('sessionId') as string | null;
  if (!sessionId) return;
  await query('DELETE FROM iptv_sessions WHERE id = $1', [sessionId]);
  revalidatePath('/admin/sessions');
}

interface SessionRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export default async function AdminSessionsPage() {
  await requireAdmin();

  const res = await query<SessionRow>(
    `SELECT s.id, s.user_id, u.email, u.display_name,
            s.created_at, s.expires_at, s.ip_address, s.user_agent
     FROM iptv_sessions s
     JOIN iptv_users u ON u.id = s.user_id
     WHERE s.expires_at > NOW()
     ORDER BY s.created_at DESC`,
  ).catch(() => ({ rows: [] as SessionRow[] }));

  const sessions = res.rows;

  const sectionStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Active Sessions</h1>
      <section className="rounded-xl border overflow-auto" style={sectionStyle}>
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr
              className="border-b text-left text-xs uppercase tracking-widest"
              style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
            >
              <th className="p-3">User</th>
              <th className="p-3">Created</th>
              <th className="p-3">Expires</th>
              <th className="p-3">IP</th>
              <th className="p-3">User Agent</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                className="border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="p-3">
                  <div>{s.display_name ?? s.email}</div>
                  <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {s.email}
                  </div>
                </td>
                <td className="p-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {new Date(s.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {new Date(s.expires_at).toLocaleString()}
                </td>
                <td className="p-3 text-xs">{s.ip_address ?? '—'}</td>
                <td
                  className="p-3 text-xs max-w-[180px] truncate"
                  title={s.user_agent ?? undefined}
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {s.user_agent ?? '—'}
                </td>
                <td className="p-3">
                  <form action={revokeSession}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs hover:bg-[var(--bg)]"
                      style={{ color: '#ef4444' }}
                    >
                      Revoke
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-4 text-center text-sm"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  No active sessions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
