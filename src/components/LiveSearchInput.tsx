'use client';

// src/components/LiveSearchInput.tsx
// Tiny client component: name-substring search box for the /live channel
// grid. Debounced URL navigation — no client-side data fetching, all
// filtering happens server-side via the ?q= URL param.

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

interface LiveSearchInputProps {
  initialQuery: string;
  selectedCategory: string;
  totalChannels: number;
  totalFiltered: number;
}

export default function LiveSearchInput({
  initialQuery,
  selectedCategory,
  totalChannels,
  totalFiltered,
}: LiveSearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (q: string) => {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'All') {
        params.set('category', selectedCategory);
      }
      const trimmed = q.trim();
      if (trimmed) params.set('q', trimmed);
      const qs = params.toString();
      router.push(`/live${qs ? `?${qs}` : ''}`);
    },
    [router, selectedCategory],
  );

  useEffect(() => {
    if (value === initialQuery) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => navigate(value), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, initialQuery, navigate]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    navigate(value);
  }

  function clearQuery() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValue('');
    navigate('');
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4">
      <div className="relative">
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search channels by name…"
          className="w-full rounded-lg border px-4 pr-24 text-base outline-none transition-colors focus:border-[var(--accent)]"
          style={{
            height: '52px',
            minHeight: '48px',
            backgroundColor: 'var(--bg-raised)',
            borderColor: 'var(--border)',
            color: 'var(--fg)',
          }}
        />
        {value && (
          <button
            type="button"
            onClick={clearQuery}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg)',
              color: 'var(--fg-muted)',
              border: '1px solid var(--border)',
            }}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
        {value || selectedCategory !== 'All'
          ? `${totalFiltered.toLocaleString()} of ${totalChannels.toLocaleString()} channels`
          : `${totalChannels.toLocaleString()} channels available`}
      </p>
    </form>
  );
}
