// src/app/(app)/admin/layout.tsx
// Admin section — gated by requireAdmin(). Renders a simple sub-nav.

import { requireAdmin } from '@/lib/auth/session';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/sessions', label: 'Sessions' },
  { href: '/admin/provider', label: 'Provider' },
  { href: '/admin/startup', label: 'Startup' },
  { href: '/admin/devices', label: 'Devices' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col" style={{ color: 'var(--fg)' }}>
      {/* Admin top bar */}
      <nav
        className="flex items-center gap-1 border-b px-4 py-2 text-sm"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-raised)' }}
      >
        <span
          className="mr-3 font-semibold text-xs uppercase tracking-widest"
          style={{ color: 'var(--fg-muted)' }}
        >
          Admin
        </span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded px-3 py-1 transition-colors hover:bg-[var(--bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            style={{ color: 'var(--fg)' }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Page content */}
      <div className="flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
