'use client';

// src/components/SearchInput.tsx
// Client component: debounced search input that navigates via URL params.
// No client-side data fetching — triggers server re-render with search results.

import { useRouter } from 'next/navigation';
import { useRef, useState, useCallback, useEffect } from 'react';

export default function SearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed) {
        router.push('/search?q=' + encodeURIComponent(trimmed));
      } else {
        router.push('/search');
      }
    },
    [router],
  );

  // Debounce navigation on input change
  useEffect(() => {
    if (value === initialQuery) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      navigate(value);
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, initialQuery, navigate]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    navigate(value);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search channels, shows, movies..."
        autoFocus
        className="w-full rounded-lg border px-4 text-base outline-none transition-colors focus:border-[var(--accent)]"
        style={{
          height: '52px',
          minHeight: '48px',
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
          color: 'var(--fg)',
        }}
      />
    </form>
  );
}
