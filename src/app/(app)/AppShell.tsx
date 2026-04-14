'use client';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Foundry IPTV Contributors
// This file is part of Foundry IPTV, licensed under AGPL-3.0.
// See LICENSE file in the project root.


import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import SpatialNavProvider from '@/components/tv/SpatialNavProvider';
import {
  NavLiveIcon,
  NavGuideIcon,
  NavOnDemandIcon,
  NavSearchIcon,
  NavMyStuffIcon,
  NavSettingsIcon,
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
    { label: 'Live', href: '/live', icon: <NavLiveIcon /> },
    { label: 'Guide', href: '/guide', icon: <NavGuideIcon /> },
    { label: 'On Demand', href: '/on-demand', icon: <NavOnDemandIcon /> },
    { label: 'Search', href: '/search', icon: <NavSearchIcon /> },
    { label: 'My Stuff', href: '/my-stuff', icon: <NavMyStuffIcon /> },
    { label: 'Settings', href: '/settings', icon: <NavSettingsIcon /> },
  ];

  if (isAdmin) {
    items.push({ label: 'Admin', href: '/admin', icon: <NavAdminIcon />, adminOnly: true });
  }

  return items;
}

export default function AppShell({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
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

  // Fullscreen nav: start hidden, reveal on user input (mouse/touch/key), then
  // auto-hide after 3s of idle. Avoids flashing the nav bar when a player page
  // first loads.
  useEffect(() => {
    if (!isFullscreen) {
      setNavHidden(false);
      return;
    }
    setNavHidden(true);
    let timer: ReturnType<typeof setTimeout> | null = null;
    function reset() {
      if (timer) clearTimeout(timer);
      setNavHidden(false);
      timer = setTimeout(() => setNavHidden(true), 3000);
    }
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

  // Escape toggles nav on fullscreen routes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (!isFullscreen) return;
      e.preventDefault();
      e.stopPropagation();
      setNavHidden((hidden) => !hidden);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  return (
    <SpatialNavProvider>
      <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        {/* Desktop sidebar — always collapsed, icons only */}
        <nav
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
          <div
            className="flex h-14 items-center justify-center border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-sm font-bold" style={{ color: 'var(--accent-warm)' }}>
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
                  prefetch={false}
                  data-nav-item
                  tabIndex={0}
                  className="nav-focus flex items-center justify-center rounded-lg py-3"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--fg-muted)',
                    backgroundColor: 'transparent',
                    minHeight: '48px',
                    transition: 'background-color 150ms ease, color 150ms ease',
                    borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                  title={item.label}
                >
                  <span className="shrink-0">{item.icon}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main
          className={isFullscreen ? 'flex-1' : 'flex-1 md:ml-16'}
          style={{ minHeight: '100vh' }}
        >
          {children}
        </main>
      </div>
    </SpatialNavProvider>
  );
}
