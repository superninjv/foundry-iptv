// src/app/(app)/admin/page.tsx
// Admin dashboard: user count, active sessions, last EPG ingest, ts2hls health.

import { requireAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { getConfig } from '@/lib/config/db';

export const metadata = { title: 'Admin — Dashboard' };

async function getTs2hlsHealth(): Promise<'ok' | 'error' | 'unknown'> {
  const base = process.env.TS2HLS_URL;
  if (!base) return 'unknown';
  try {
    const res = await fetch(`${base}/health`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [userCountRes, sessionCountRes, lastEpgIngest, ts2hlsHealth] =
    await Promise.all([
      query<{ count: string }>('SELECT COUNT(*) AS count FROM iptv_users').catch(
        () => ({ rows: [{ count: '?' }] }),
      ),
      query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM iptv_sessions WHERE expires_at > NOW()",
      ).catch(() => ({ rows: [{ count: '?' }] })),
      getConfig('last_epg_ingest_at'),
      getTs2hlsHealth(),
    ]);

  const userCount = userCountRes.rows[0]?.count ?? '?';
  const sessionCount = sessionCountRes.rows[0]?.count ?? '?';

  const healthColor =
    ts2hlsHealth === 'ok'
      ? '#22c55e'
      : ts2hlsHealth === 'error'
        ? '#ef4444'
        : 'var(--fg-muted)';

  const sectionStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={userCount} />
        <StatCard label="Active Sessions" value={sessionCount} />
        <StatCard
          label="Last EPG Ingest"
          value={
            lastEpgIngest
              ? new Date(lastEpgIngest).toLocaleString()
              : 'Never'
          }
        />
        <div
          className="rounded-xl border p-4"
          style={sectionStyle}
        >
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>
            ts2hls
          </p>
          <p className="mt-1 text-xl font-semibold" style={{ color: healthColor }}>
            {ts2hlsHealth === 'ok'
              ? 'Healthy'
              : ts2hlsHealth === 'error'
                ? 'Unreachable'
                : 'Not configured'}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}
    >
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
