// src/components/MediaGrid.tsx
// Server component — shared poster grid for VOD and Series listings.
// No 'use client' — renders static HTML with links.

import Link from 'next/link';

export interface MediaItem {
  id: string;
  name: string;
  image: string;
  subtitle?: string;
}

interface MediaGridProps {
  items: MediaItem[];
  linkPrefix: string;
}

function PosterCard({ item, linkPrefix }: { item: MediaItem; linkPrefix: string }) {
  return (
    <Link
      href={`${linkPrefix}/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border transition-colors"
      style={{
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
        minHeight: '48px',
      }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '2/3', backgroundColor: 'var(--bg)' }}
      >
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span
              className="text-4xl font-bold"
              style={{ color: 'var(--fg-muted)' }}
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p
          className="line-clamp-2 text-sm font-semibold leading-tight"
          style={{ color: 'var(--fg)' }}
        >
          {item.name}
        </p>
        {item.subtitle && (
          <p
            className="truncate text-xs"
            style={{ color: 'var(--fg-muted)' }}
          >
            {item.subtitle}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function MediaGrid({ items, linkPrefix }: MediaGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-center text-lg" style={{ color: 'var(--fg-muted)' }}>
          No content available.
        </p>
      </div>
    );
  }

  return (
    // Auto-fill columns with a hard min/max — no viewport breakpoints. This
    // is robust against TV browsers that ship a non-default root font size,
    // which silently breaks Tailwind's rem-based sm/md/lg/xl breakpoints
    // and collapses the grid to 2 columns of viewport-half cards.
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      }}
    >
      {items.map((item) => (
        <PosterCard key={item.id} item={item} linkPrefix={linkPrefix} />
      ))}
    </div>
  );
}
