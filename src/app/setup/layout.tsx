// src/app/setup/layout.tsx
// Minimal shell for the first-run setup wizard.
// Lives OUTSIDE the (app) route group so it doesn't inherit the authed layout.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setup — Foundry IPTV',
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Foundry IPTV</h1>
          <p className="text-sm text-neutral-400 mt-1">First-run setup</p>
        </div>
        {children}
      </div>
    </div>
  );
}
