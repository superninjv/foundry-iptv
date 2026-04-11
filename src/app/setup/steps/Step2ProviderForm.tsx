'use client';
// src/app/setup/steps/Step2ProviderForm.tsx
// Step 2 — Enter M3U + XMLTV provider URLs.

import { useActionState } from 'react';
import { saveProvider } from '../actions';

const initialState = { error: '' };

export default function Step2ProviderForm() {
  const [state, formAction, pending] = useActionState(saveProvider, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <h2 className="text-lg font-semibold">Provider URLs</h2>
      <p className="text-sm text-neutral-400">
        Enter the M3U playlist and XMLTV programme guide URLs from your IPTV provider.
        These are stored securely in the database — not in environment variables.
      </p>

      {state.error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3">
          {state.error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="m3u_url">M3U playlist URL</label>
        <input
          id="m3u_url"
          name="m3u_url"
          type="url"
          required
          autoComplete="off"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="http://provider.example/playlist.m3u"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="xmltv_url">XMLTV guide URL</label>
        <input
          id="xmltv_url"
          name="xmltv_url"
          type="url"
          required
          autoComplete="off"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="http://provider.example/epg.xml"
        />
      </div>

      <p className="text-xs text-neutral-500">
        Both URLs will be tested for reachability before saving.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
      >
        {pending ? 'Checking URLs…' : 'Continue →'}
      </button>
    </form>
  );
}
