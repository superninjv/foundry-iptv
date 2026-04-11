'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateListForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create list');
        return;
      }

      setName('');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New list name..."
        className="flex-1 rounded-lg border px-4 py-3 text-sm outline-none"
        style={{
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
          color: 'var(--fg)',
          minHeight: '48px',
        }}
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className="rounded-lg px-5 py-3 text-sm font-medium transition-opacity disabled:opacity-40"
        style={{
          backgroundColor: 'var(--accent)',
          color: '#07090c',
          minHeight: '48px',
        }}
      >
        {submitting ? 'Creating...' : 'Create List'}
      </button>
      {error && (
        <span className="self-center text-sm" style={{ color: 'var(--error)' }}>
          {error}
        </span>
      )}
    </form>
  );
}
