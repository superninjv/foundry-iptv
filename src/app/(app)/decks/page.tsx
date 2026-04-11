// src/app/(app)/decks/page.tsx
// Server component: list user's decks. SSR-first per Fire TV rule.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { listDecks, createDeck, deleteDeck } from '@/lib/decks/db';

async function createDeckAction(formData: FormData) {
  'use server';
  const user = await requireAuth();
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const id = await createDeck(user.id, name);
  redirect(`/decks/${id}`);
}

async function deleteDeckAction(formData: FormData) {
  'use server';
  const user = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) return;
  await deleteDeck(user.id, id);
  redirect('/decks');
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function DecksPage() {
  const user = await requireAuth();
  const decks = await listDecks(user.id);

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--bg)' }}
      suppressHydrationWarning
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
          Superplayer Decks
        </h1>
      </div>

      <form action={createDeckAction} className="mb-8 flex gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="New deck name (e.g. Sunday NFL)"
          className="flex-1 rounded-lg px-4 py-3"
          style={{
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            minHeight: '48px',
          }}
          suppressHydrationWarning
        />
        <button
          type="submit"
          className="rounded-lg px-6 py-3 font-medium"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
            minHeight: '48px',
          }}
        >
          + New deck
        </button>
      </form>

      {decks.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)' }}>
          No decks yet. Create one above.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {decks.map((d) => (
            <div
              key={d.id}
              className="flex flex-col gap-3 rounded-lg p-4"
              style={{
                backgroundColor: 'var(--bg-raised)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
                  {d.name}
                </h2>
                {d.skipCommercials && (
                  <span
                    className="rounded px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'rgba(255, 149, 72, 0.2)',
                      color: 'var(--accent)',
                    }}
                  >
                    skip ads
                  </span>
                )}
              </div>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                {d.entryCount} channel{d.entryCount === 1 ? '' : 's'} · {formatRelative(d.updatedAt)}
              </p>
              <div className="mt-auto flex gap-2">
                <Link
                  href={`/decks/${d.id}`}
                  className="flex-1 rounded-lg px-3 py-2 text-center font-medium"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--bg)',
                    minHeight: '44px',
                  }}
                >
                  Open
                </Link>
                <form action={deleteDeckAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--fg-muted)',
                      border: '1px solid var(--border)',
                      minHeight: '44px',
                    }}
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
