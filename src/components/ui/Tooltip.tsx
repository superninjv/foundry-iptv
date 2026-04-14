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
import { useEffect, useState, type ReactNode } from 'react';

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
  // Render passthrough on both SSR AND initial client render. Activate the
  // Radix tree only after mount so React sees identical HTML on both sides
  // and hydration is clean. Radix's <Slot> injects `data-state` onto the
  // child on the client; if we rendered it during SSR we'd get a mismatch
  // against the server's plain markup.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes('FoundryNative')) return;
    if (window.matchMedia('(hover: none)').matches) return;
    setEnabled(true);
  }, []);

  if (!enabled) {
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
