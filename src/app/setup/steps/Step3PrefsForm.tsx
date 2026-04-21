'use client';
// src/app/setup/steps/Step3PrefsForm.tsx
// Step 3 — Timezone, language, Fire TV optimisations.

import { useActionState, useEffect, useRef } from 'react';
import { savePrefs } from '../actions';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' },
];

const initialState = { error: '' };

export default function Step3PrefsForm() {
  const [state, formAction, pending] = useActionState(savePrefs, initialState);
  const tzRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Detect browser timezone on mount and inject as hidden field
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tzRef.current && tz) tzRef.current.value = tz;
    } catch { /* ignore */ }
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <h2 className="text-lg font-semibold">Preferences</h2>

      {state.error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3">
          {state.error}
        </p>
      )}

      {/* Hidden field — overwritten by useEffect with detected TZ */}
      <input ref={tzRef} type="hidden" name="timezone" defaultValue="America/New_York" />

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="timezone_display">Timezone</label>
        <select
          id="timezone_display"
          name="timezone_display"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          defaultValue="America/New_York"
          onChange={(e) => {
            if (tzRef.current) tzRef.current.value = e.target.value;
          }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="default_language">Default language</label>
        <select
          id="default_language"
          name="default_language"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          defaultValue="en"
        >
          {LANGUAGES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="firetv_optimizations"
          name="firetv_optimizations"
          type="checkbox"
          defaultChecked
          className="w-4 h-4 accent-blue-600"
        />
        <label htmlFor="firetv_optimizations" className="text-sm">
          Enable Fire TV / Silk optimisations
          <span className="block text-xs text-neutral-400">Reduces buffer size, disables prefetch, enforces SSR-first rendering.</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
      >
        {pending ? 'Saving…' : 'Continue →'}
      </button>
    </form>
  );
}
