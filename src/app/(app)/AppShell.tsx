'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TooltipProvider, Tooltip } from '@/components/ui/Tooltip';
import {
  NavLiveIcon,
  NavGuideIcon,
  NavVodIcon,
  NavSeriesIcon,
  NavSearchIcon,
  NavDecksIcon,
  NavMultiviewIcon,
  NavListsIcon,
  NavSettingsIcon,
  NavNotificationsIcon,
  NavNowPlayingIcon,
  NavUserMenuIcon,
  NavAdminIcon,
} from '@/components/icons';

const FULLSCREEN_PATTERNS = [/^\/watch(\/|$)/, /^\/decks\/\d+$/, /^\/multiview$/];

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

function buildNavItems(isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    // Original 9 items
    { label: 'Live', href: '/live', icon: <NavLiveIcon /> },
    { label: 'Guide', href: '/guide', icon: <NavGuideIcon /> },
    { label: 'VOD', href: '/vod', icon: <NavVodIcon /> },
    { label: 'Series', href: '/series', icon: <NavSeriesIcon /> },
    { label: 'Search', href: '/search', icon: <NavSearchIcon /> },
    { label: 'Decks', href: '/decks', icon: <NavDecksIcon /> },
    { label: 'Multiview', href: '/multiview', icon: <NavMultiviewIcon /> },
    { label: 'Lists', href: '/lists', icon: <NavListsIcon /> },
    { label: 'Settings', href: '/settings', icon: <NavSettingsIcon /> },
    // 3 new items
    { label: 'Notifications', href: '/notifications', icon: <NavNotificationsIcon /> },
    { label: 'Now Playing', href: '/decks', icon: <NavNowPlayingIcon /> },
    { label: 'Account', href: '/settings', icon: <NavUserMenuIcon /> },
  ];

  if (isAdmin) {
    items.push({ label: 'Admin', href: '/admin', icon: <NavAdminIcon />, adminOnly: true });
  }

  return items;
}

// TODO(Track 1): watch pages should focus their player container on mount so
// D-pad input routes to the player immediately after sidebar ArrowRight blur.
export default function AppShell({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [navHidden, setNavHidden] = useState(false);

  const navItems = useMemo(() => buildNavItems(isAdmin), [isAdmin]);

  const isFullscreen = useMemo(
    () => FULLSCREEN_PATTERNS.some((p) => p.test(pathname)),
    [pathname],
  );

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  // Cursor auto-hide: hide after 3s of no mousemove, restore on movement.
  // Skip on touch/hover-none devices (Fire TV remote, phones).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const isHoverNone = window.matchMedia('(hover: none)').matches;
    if (isCoarse || isHoverNone) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function onMove() {
      document.body.style.cursor = '';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        document.body.style.cursor = 'none';
      }, 3000);
    }

    window.addEventListener('mousemove', onMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', onMove);
      if (timer) clearTimeout(timer);
      document.body.style.cursor = '';
    };
  }, []);

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
    <TooltipProvider>
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
                <Tooltip key={`${item.href}-${item.label}`} label={item.label} side="right">
                  <Link
                    href={item.href}
                    prefetch={false}
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
                </Tooltip>
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
                key={`${item.href}-${item.label}`}
                href={item.href}
                prefetch={false}
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
    </TooltipProvider>
  );
}
