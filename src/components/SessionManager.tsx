'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

export default function SessionManager({ sessions }: { sessions: Session[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  async function handleLogoutOthers() {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout_others' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to logout other sessions' });
        return;
      }

      setMessage({ type: 'success', text: `Logged out ${data.deletedCount} other session(s)` });
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function shortenUA(ua: string | null): string {
    if (!ua) return 'Unknown device';
    if (ua.length > 60) return ua.slice(0, 57) + '...';
    return ua;
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          No active sessions found.
        </p>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between rounded-lg border px-4 py-3"
          style={{
            backgroundColor: 'var(--bg-raised)',
            borderColor: s.isCurrent ? 'var(--accent)' : 'var(--border)',
          }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm" style={{ color: 'var(--fg)' }}>
              {s.isCurrent ? 'This session' : shortenUA(s.userAgent)}
            </span>
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {s.ipAddress || 'No IP'} &middot; Created {formatDate(s.createdAt)}
            </span>
          </div>
          {s.isCurrent && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'var(--accent)', color: '#07090c' }}
            >
              Current
            </span>
          )}
        </div>
      ))}

      {otherSessions.length > 0 && (
        <button
          onClick={handleLogoutOthers}
          disabled={submitting}
          className="rounded-lg px-5 py-3 text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            backgroundColor: 'var(--error)',
            color: '#07090c',
            minHeight: '48px',
          }}
        >
          {submitting ? 'Logging out...' : `Log out ${otherSessions.length} other session(s)`}
        </button>
      )}

      {message && (
        <p
          className="text-sm"
          style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--error)' }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
