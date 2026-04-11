'use client';
// src/app/setup/steps/Step4Ingest.tsx
// Step 4 — Kick off first EPG ingest and show progress.

import { useEffect, useState, useTransition } from 'react';
import { triggerIngest } from '../actions';

export default function Step4Ingest() {
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Kick off ingest on mount
  useEffect(() => {
    let mounted = true;
    startTransition(async () => {
      try {
        await triggerIngest();
        if (mounted) setStarted(true);
      } catch (err) {
        console.error('Ingest trigger failed:', err);
        if (mounted) setStarted(true); // proceed anyway
      }
    });
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll /api/setup/progress every 2s
  useEffect(() => {
    if (!started) return;
    let timer: ReturnType<typeof setInterval>;
    const poll = async () => {
      try {
        const res = await fetch('/api/setup/progress');
        if (!res.ok) return;
        const data = await res.json() as {
          setup_complete: boolean;
          last_epg_ingest_at?: string;
          epg_ingest_progress?: string;
        };
        if (data.epg_ingest_progress) setProgress(data.epg_ingest_progress);
        if (data.setup_complete) {
          setDone(true);
          clearInterval(timer);
        }
      } catch { /* swallow */ }
    };
    poll();
    timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [started]);

  // Tick elapsed time for display
  useEffect(() => {
    if (!started || done) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [started, done]);

  if (!started || isPending) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Starting first sync…</h2>
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Preparing ingest…
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-green-400">Setup complete!</h2>
        <p className="text-sm text-neutral-400">
          Your channels and guide data have been imported. You can now browse live TV.
        </p>
        <a
          href="/live"
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
        >
          Enter app →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Running first EPG sync</h2>
      <p className="text-sm text-neutral-400">
        Importing channels and guide data — this may take up to 60 seconds for a large playlist.
      </p>

      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        {progress ?? 'Syncing…'} ({elapsed}s elapsed)
      </div>

      <p className="text-xs text-neutral-600">
        The page will advance automatically when the sync finishes.
      </p>
    </div>
  );
}
