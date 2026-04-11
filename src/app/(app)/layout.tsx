'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

const FULLSCREEN_PATTERNS = [/^\/watch(\/|$)/, /^\/decks\/\d+$/, /^\/multiview$/];

const navItems = [
  {
    label: 'Live',
    href: '/live',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <polyline points="17 2 12 7 7 2" />
      </svg>
    ),
  },
  {
    label: 'Guide',
    href: '/guide',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: 'VOD',
    href: '/vod',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
        <line x1="17" y1="17" x2="22" y2="17" />
      </svg>
    ),
  },
  {
    label: 'Series',
    href: '/series',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <path d="m4 11 .9-3.6A2 2 0 0 1 6.8 6h10.4a2 2 0 0 1 1.9 1.4L20 11" />
        <path d="m2 11 2.5-6.5A2 2 0 0 1 6.3 3h11.4a2 2 0 0 1 1.8 1.5L22 11" />
      </svg>
    ),
  },
  {
    label: 'Search',
    href: '/search',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    label: 'Decks',
    href: '/decks',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="16" rx="2" />
        <path d="M7 5V3" />
        <path d="M13 5V3" />
        <path d="M17 9h4v10a2 2 0 0 1-2 2h-2" />
      </svg>
    ),
  },
  {
    label: 'Multiview',
    href: '/multiview',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="9" height="9" rx="1" />
        <rect x="13" y="2" width="9" height="9" rx="1" />
        <rect x="2" y="13" width="9" height="9" rx="1" />
        <rect x="13" y="13" width="9" height="9" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Lists',
    href: '/lists',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

// TODO(Track 1): watch pages should focus their player container on mount so
// D-pad input routes to the player immediately after sidebar ArrowRight blur.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [navHidden, setNavHidden] = useState(false);

  const isFullscreen = useMemo(
    () => FULLSCREEN_PATTERNS.some((p) => p.test(pathname)),
    [pathname],
  );

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  useEffect(() => {
    if (!isFullscreen) {
      setNavHidden(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    function reset() {
      if (timer) clearTimeout(timer);
      setNavHidden(false);
      timer = setTimeout(() => setNavHidden(true), 3000);
    }
    reset();
    window.addEventListener('mousemove', reset);
    window.addEventListener('touchstart', reset);
    window.addEventListener('keydown', reset);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('touchstart', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [isFullscreen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (!isFullscreen) return;
      e.preventDefault();
      e.stopPropagation();
      setNavHidden((hidden) => {
        const next = !hidden;
        if (!next) {
          requestAnimationFrame(() => {
            const first = navRef.current?.querySelector<HTMLElement>('[data-nav-item]');
            first?.focus();
          });
        }
        return next;
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  function onNavKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const key = e.key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowRight') return;
    if (key === 'ArrowRight') {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const items = Array.from(
      navRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ?? [],
    );
    if (items.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const idx = current ? items.indexOf(current) : -1;
    e.preventDefault();
    let nextIdx: number;
    if (key === 'ArrowDown') {
      nextIdx = idx < 0 ? 0 : (idx + 1) % items.length;
    } else {
      nextIdx = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
    }
    items[nextIdx]?.focus();
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Desktop sidebar — always collapsed, icons only (no hover expand for TV compatibility) */}
      <nav
        ref={navRef}
        onKeyDown={onNavKeyDown}
        className="fixed left-0 top-0 z-40 hidden h-full flex-col border-r md:flex"
        style={{
          width: '4rem',
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
          transform: navHidden ? 'translateX(-100%)' : 'translateX(0)',
          opacity: navHidden ? 0 : 1,
          pointerEvents: navHidden ? 'none' : 'auto',
          transition: 'transform 200ms ease, opacity 200ms ease',
        }}
      >
        <div className="flex h-14 items-center justify-center border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
            F
          </span>
        </div>

        <div className="mt-4 flex flex-1 flex-col gap-1 px-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-nav-item
                tabIndex={0}
                className="foundry-nav-item flex items-center justify-center rounded-lg py-3"
                style={{
                  color: active ? 'var(--accent)' : 'var(--fg-muted)',
                  backgroundColor: active ? 'rgba(255, 149, 72, 0.1)' : 'transparent',
                  minHeight: '48px',
                }}
                title={item.label}
              >
                <span className="shrink-0">{item.icon}</span>
              </Link>
            );
          })}
        </div>
        <style>{`.foundry-nav-item:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:0.5rem;}`}</style>
      </nav>

      {/* Main content. On fullscreen routes the sidebar overlays the player
          (no left margin) so the video can fill the viewport edge to edge. */}
      <main
        className={isFullscreen ? 'flex-1' : 'flex-1 md:ml-16'}
        style={{ minHeight: '100vh' }}
      >
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t md:hidden"
        style={{
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
        }}
      >
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-1 py-3"
              style={{
                color: active ? 'var(--accent)' : 'var(--fg-muted)',
                minHeight: '48px',
              }}
            >
              {item.icon}
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
