'use client';

// src/components/SeasonTabs.tsx
// Tiny client component for switching between seasons in the series detail page.

import { useState } from 'react';
import Link from 'next/link';

interface EpisodeDisplay {
  id: string;
  episodeNum: number;
  title: string;
  duration: string;
  containerExtension: string;
}

interface SeasonTabsProps {
  seasons: Record<string, EpisodeDisplay[]>;
  seriesId: string;
}

export default function SeasonTabs({ seasons, seriesId }: SeasonTabsProps) {
  const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
  const [activeSeason, setActiveSeason] = useState(seasonKeys[0] || '1');

  const episodes = seasons[activeSeason] || [];

  return (
    <div>
      {/* Season selector */}
      <div
        className="mb-4 flex gap-2 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {seasonKeys.map((season) => (
          <button
            key={season}
            onClick={() => setActiveSeason(season)}
            className="shrink-0 rounded-lg px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor: activeSeason === season ? 'var(--accent)' : 'var(--bg-raised)',
              color: activeSeason === season ? 'var(--bg)' : 'var(--fg-muted)',
              border: '1px solid',
              borderColor: activeSeason === season ? 'var(--accent)' : 'var(--border)',
              minHeight: '48px',
            }}
          >
            Season {season}
          </button>
        ))}
      </div>

      {/* Episode list */}
      <div className="flex flex-col gap-2">
        {episodes.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
            No episodes available for this season.
          </p>
        )}
        {episodes.map((ep) => (
          <Link
            key={ep.id}
            href={`/watch/vod/${ep.id}?ext=${ep.containerExtension}&type=series&seriesId=${seriesId}`}
            className="flex items-center gap-4 rounded-xl border p-4 transition-colors"
            style={{
              backgroundColor: 'var(--bg-raised)',
              borderColor: 'var(--border)',
              minHeight: '48px',
            }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--accent)' }}
            >
              {ep.episodeNum}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--fg)' }}>
                {ep.title}
              </p>
              {ep.duration && (
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {ep.duration}
                </p>
              )}
            </div>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="var(--accent)"
              className="shrink-0"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
