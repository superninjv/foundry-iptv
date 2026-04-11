'use client';

/**
 * Thin Radix tooltip wrapper.
 * Usage: <Tooltip label="Settings"><button>…</button></Tooltip>
 *
 * Disabled entirely when:
 *  - navigator.userAgent contains 'FoundryNative' (Rust client marker)
 *  - matchMedia('(hover: none)').matches — touch-primary devices (Fire TV remote
 *    counts as pointer:coarse/hover:none in Silk)
 *
 * TooltipProvider should be mounted once high in the tree (AppLayout).
 */

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { useState, type ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={500}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'right' | 'left' | 'top' | 'bottom';
}

export function Tooltip({ label, children, side = 'right' }: TooltipProps) {
  // Evaluate lazily on first render (client only). useMemo to avoid re-running
  // on every render while still being client-only (useState initializer runs
  // only once, so it's safe for this one-shot media query check).
  const [disabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true; // SSR: disable until hydrated
    const isNativeClient = navigator.userAgent.includes('FoundryNative');
    const isHoverNone = window.matchMedia('(hover: none)').matches;
    return isNativeClient || isHoverNone;
  });

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          style={{
            backgroundColor: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 9999,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {label}
          <RadixTooltip.Arrow
            style={{ fill: 'var(--border)' }}
          />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
