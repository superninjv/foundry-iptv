'use client';
// src/app/setup/steps/Step1AdminForm.tsx
// Step 1 — Create the admin account.

import { useActionState } from 'react';
import { seedAdmin } from '../actions';

const initialState = { error: '' };

export default function Step1AdminForm() {
  const [state, formAction, pending] = useActionState(seedAdmin, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <h2 className="text-lg font-semibold">Create your admin account</h2>
      <p className="text-sm text-neutral-400">
        This is the account you'll use to manage Foundry IPTV.
      </p>

      {state.error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3">
          {state.error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="admin@home.local"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
      >
        {pending ? 'Creating account…' : 'Continue →'}
      </button>
    </form>
  );
}
