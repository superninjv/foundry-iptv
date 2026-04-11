'use client';

// src/components/CategoryFilter.tsx
// Tiny client component for category pill navigation via URL params.

import { useRouter, useSearchParams } from 'next/navigation';

interface CategoryFilterProps {
  categories: { id: string; name: string }[];
}

export default function CategoryFilter({ categories }: CategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get('category') || '';

  function handleSelect(categoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) {
      params.set('category', categoryId);
    } else {
      params.delete('category');
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div
      className="mb-6 flex gap-2 overflow-x-auto pb-2"
      style={{ scrollbarWidth: 'thin' }}
    >
      <button
        onClick={() => handleSelect('')}
        className="shrink-0 rounded-full px-4 py-3 text-sm font-medium"
        style={{
          backgroundColor: !active ? 'var(--accent)' : 'var(--bg-raised)',
          color: !active ? 'var(--bg)' : 'var(--fg-muted)',
          border: '1px solid',
          borderColor: !active ? 'var(--accent)' : 'var(--border)',
          minHeight: '48px',
        }}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => handleSelect(cat.id)}
          className="shrink-0 rounded-full px-4 py-3 text-sm font-medium"
          style={{
            backgroundColor: active === cat.id ? 'var(--accent)' : 'var(--bg-raised)',
            color: active === cat.id ? 'var(--bg)' : 'var(--fg-muted)',
            border: '1px solid',
            borderColor: active === cat.id ? 'var(--accent)' : 'var(--border)',
            minHeight: '48px',
          }}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
