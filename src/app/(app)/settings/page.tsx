import { requireAuth } from '@/lib/auth/session';
import { auth } from '@/lib/auth/config';
import { query } from '@/lib/db/client';
import { listChannels } from '@/lib/threadfin/client';
import { formatDateTime } from '@/lib/format/time';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import SessionManager from '@/components/SessionManager';

export const metadata = { title: 'Settings' };

// Read version from package.json at build time
const APP_VERSION = process.env.npm_package_version || '0.1.0';

export default async function SettingsPage() {
  const user = await requireAuth();
  const session = await auth();
  const currentSessionId = session?.sessionId;

  // Fetch all data in parallel
  const [
    channelsResult,
    epgCountResult,
    vodCountResult,
    sessionsResult,
    epgLatestResult,
    vodLatestResult,
  ] = await Promise.all([
    listChannels().then((chs) => chs.length).catch(() => 0),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM iptv_epg_cache').catch(() => ({ rows: [{ count: '0' }] })),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM iptv_vod_cache').catch(() => ({ rows: [{ count: '0' }] })),
    query<{
      id: string;
      created_at: string;
      expires_at: string;
      ip_address: string | null;
      user_agent: string | null;
    }>(
      `SELECT id, created_at, expires_at, ip_address, user_agent
       FROM iptv_sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [user.id],
    ),
    query<{ updated_at: string }>('SELECT MAX(updated_at) AS updated_at FROM iptv_epg_cache').catch(() => ({ rows: [{ updated_at: null }] })),
    query<{ updated_at: string }>('SELECT MAX(updated_at) AS updated_at FROM iptv_vod_cache').catch(() => ({ rows: [{ updated_at: null }] })),
  ]);

  const channelCount = channelsResult;
  const epgCount = parseInt(epgCountResult.rows[0]?.count || '0', 10);
  const vodCount = parseInt(vodCountResult.rows[0]?.count || '0', 10);
  const lastEpgIngest = epgLatestResult.rows[0]?.updated_at || null;
  const lastVodIngest = vodLatestResult.rows[0]?.updated_at || null;

  const sessions = sessionsResult.rows.map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    ipAddress: s.ip_address,
    userAgent: s.user_agent,
    isCurrent: s.id === currentSessionId,
  }));

  function formatTime(iso: string | null): string {
    if (!iso) return 'Never';
    try {
      return formatDateTime(iso);
    } catch {
      return iso;
    }
  }

  const sectionStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
  };

  const labelStyle = { color: 'var(--fg-muted)' };
  const valueStyle = { color: 'var(--fg)' };

  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--fg)' }}>
        Settings
      </h1>

      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {/* Account */}
        <section className="rounded-xl border p-5" style={sectionStyle}>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            Account
          </h2>
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={labelStyle}>
                Email
              </span>
              <span className="text-sm" style={valueStyle}>
                {user.email}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={labelStyle}>
                Display Name
              </span>
              <span className="text-sm" style={valueStyle}>
                {user.name}
              </span>
            </div>
          </div>

          <h3
            className="mb-3 text-sm font-medium"
            style={{ color: 'var(--fg-muted)' }}
          >
            Change Password
          </h3>
          <ChangePasswordForm />
        </section>

        {/* App Info */}
        <section className="rounded-xl border p-5" style={sectionStyle}>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            App Info
          </h2>
          <div className="flex flex-col gap-2">
            <InfoRow label="Version" value={`Foundry IPTV v${APP_VERSION}`} />
            <InfoRow label="Server" value="foundry-01" />
            <InfoRow label="Channels" value={channelCount.toLocaleString()} />
            <InfoRow label="EPG Programs Cached" value={epgCount.toLocaleString()} />
            <InfoRow label="VOD Cached" value={vodCount.toLocaleString()} />
          </div>
        </section>

        {/* Session Management */}
        <section className="rounded-xl border p-5" style={sectionStyle}>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            Sessions
          </h2>
          <SessionManager sessions={sessions} />
        </section>

        {/* Data Management */}
        <section className="rounded-xl border p-5" style={sectionStyle}>
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            Data Management
          </h2>
          <div className="flex flex-col gap-2">
            <InfoRow label="Last EPG Ingest" value={formatTime(lastEpgIngest)} />
            <InfoRow label="Last VOD Ingest" value={formatTime(lastVodIngest)} />
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
            EPG and VOD data are refreshed automatically via systemd timers on foundry-01.
          </p>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>
        {value}
      </span>
    </div>
  );
}
