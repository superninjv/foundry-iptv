'use client';
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Foundry IPTV Contributors
// This file is part of Foundry IPTV, licensed under AGPL-3.0.
// See LICENSE file in the project root.


// nav:
//   Mouse/touch/keydown → wake overlay, reset 3s hide timer
//   ArrowLeft/Right inside actionsRight → walk focusable siblings
//   ArrowUp from metaLeft → first focusable in actionsRight
//   ArrowDown from actionsRight → first focusable in metaLeft
//   Enter → click active element (native default)

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ChevronLeftIcon } from '@/components/icons';

export interface PlayerOverlayProps {
  visible?: boolean;
  title: string;
  subtitle?: string;
  metaLeft?: ReactNode;
  actionsRight?: ReactNode;
  controls?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
}

function focusables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'));
}

export default function PlayerOverlay({
  visible: visibleProp,
  title,
  subtitle,
  metaLeft,
  actionsRight,
  controls,
  onBack,
  children,
}: PlayerOverlayProps) {
  const [internalVisible, setInternalVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  const visible = visibleProp !== undefined ? visibleProp : internalVisible;

  const scheduleHide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setInternalVisible(false), 3000);
  }, []);

  const wake = useCallback(() => {
    setInternalVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleHide]);

  useEffect(() => {
    function onMove() {
      wake();
    }
    function onTouch() {
      wake();
    }
    function onKey() {
      wake();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchstart', onTouch);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchstart', onTouch);
      document.removeEventListener('keydown', onKey);
    };
  }, [wake]);

  const handleActionsKey = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = focusables(actionsRef.current);
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? items.indexOf(active) : -1;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = items[Math.min(items.length - 1, Math.max(0, idx) + 1)];
      next?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = items[Math.max(0, (idx < 0 ? 0 : idx) - 1)];
      prev?.focus();
    } else if (e.key === 'ArrowDown') {
      const metaItems = focusables(metaRef.current);
      if (metaItems.length > 0) {
        e.preventDefault();
        metaItems[0].focus();
      }
    }
  }, []);

  const handleMetaKey = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      const items = focusables(actionsRef.current);
      if (items.length > 0) {
        e.preventDefault();
        items[0].focus();
      }
    }
  }, []);

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: '#000' }}>
      {children}
      <div
        className="absolute inset-0 z-10 flex flex-col justify-between transition-opacity duration-300"
        style={{
          opacity: visible ? 1 : 0,
          // Backdrop is visual only — clicks in the empty middle must fall
          // through to the content underneath (e.g. MultiviewGrid's empty-cell
          // "Add Channel" button). The top/bottom chrome children re-enable
          // pointer events on themselves below.
          pointerEvents: 'none',
        }}
      >
        <div
          className="flex items-start gap-4 p-6"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)',
            paddingLeft: 'max(1.5rem, calc(4rem + 1rem))',
            pointerEvents: visible ? 'auto' : 'none',
          }}
        >
          {onBack && (
            <button
              onClick={onBack}
              className="flex h-11 w-11 items-center justify-center rounded-full overlay-focus"
              style={{
                backgroundColor: 'rgba(0,0,0,0.4)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
              }}
              aria-label="Back"
              tabIndex={0}
            >
              <ChevronLeftIcon size={24} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-bold" style={{ color: 'var(--fg)' }}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 truncate text-sm" style={{ color: 'var(--fg-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actionsRight && (
            <div
              ref={actionsRef}
              className="flex items-center gap-3"
              onKeyDown={handleActionsKey}
            >
              {actionsRight}
            </div>
          )}
        </div>

        <div
          ref={metaRef}
          className="p-6"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
            paddingLeft: 'max(1.5rem, calc(4rem + 1rem))',
            pointerEvents: visible ? 'auto' : 'none',
          }}
          onKeyDown={handleMetaKey}
        >
          {metaLeft}
          {controls}
        </div>
      </div>

    </div>
  );
}
