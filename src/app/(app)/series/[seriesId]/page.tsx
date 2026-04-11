// src/app/(app)/series/[seriesId]/page.tsx — SERVER COMPONENT
// Series detail page with poster, metadata, season tabs, and episode list.

import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { getSeriesInfo } from '@/lib/xtream/client';
import SeasonTabs from '@/components/SeasonTabs';

export const metadata = { title: 'Series Detail' };

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  await requireAuth();
  const { seriesId } = await params;

  let info;
  try {
    info = await getSeriesInfo(seriesId);
  } catch (err) {
    console.error('[series/detail]', err);
    return (
      <div className="p-4 pb-20 md:p-6 md:pb-6">
        <Link
          href="/series"
          className="mb-6 inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--fg-muted)',
            border: '1px solid var(--border)',
            minHeight: '48px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
            Series not found or unavailable.
          </p>
        </div>
      </div>
    );
  }

  const series = info.info;
  const backdropUrl = series.backdrop_path?.[0]
    ? `https://image.tmdb.org/t/p/w1280${series.backdrop_path[0]}`
    : '';
  const posterUrl = series.cover || '';

  // Transform episodes for the client component
  const seasonsDisplay: Record<string, {
    id: string;
    episodeNum: number;
    title: string;
    duration: string;
    containerExtension: string;
  }[]> = {};

  for (const [seasonNum, episodes] of Object.entries(info.episodes || {})) {
    seasonsDisplay[seasonNum] = episodes.map((ep) => ({
      id: ep.id,
      episodeNum: ep.episode_num,
      title: ep.title || `Episode ${ep.episode_num}`,
      duration: ep.info?.duration || '',
      containerExtension: ep.container_extension || 'mp4',
    }));
  }

  const hasEpisodes = Object.keys(seasonsDisplay).length > 0;

  return (
    <div className="pb-20 md:pb-6">
      {/* Backdrop */}
      {backdropUrl && (
        <div className="relative h-64 w-full overflow-hidden md:h-80 lg:h-96">
          <img
            src={backdropUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to top, var(--bg) 0%, transparent 60%)',
            }}
          />
        </div>
      )}

      <div
        className="relative p-4 md:p-6"
        style={{ marginTop: backdropUrl ? '-4rem' : '0' }}
      >
        {/* Back button */}
        <Link
          href="/series"
          className="mb-6 inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--fg-muted)',
            border: '1px solid var(--border)',
            minHeight: '48px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Poster */}
          <div className="shrink-0">
            <div
              className="w-48 overflow-hidden rounded-xl border md:w-56"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border)',
                aspectRatio: '2/3',
              }}
            >
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={series.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-5xl font-bold" style={{ color: 'var(--fg-muted)' }}>
                    {series.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="mb-2 text-2xl font-bold md:text-3xl" style={{ color: 'var(--fg)' }}>
              {series.name}
            </h1>

            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--fg-muted)' }}>
              {series.releaseDate && <span>{series.releaseDate.slice(0, 4)}</span>}
              {series.rating && series.rating !== '0' && (
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {series.rating}
                </span>
              )}
            </div>

            {series.genre && (
              <div className="mb-3 flex flex-wrap gap-2">
                {series.genre.split(',').map((g) => (
                  <span
                    key={g.trim()}
                    className="rounded-full px-3 py-1 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-raised)',
                      color: 'var(--fg-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {g.trim()}
                  </span>
                ))}
              </div>
            )}

            {series.plot && (
              <p className="mb-4 leading-relaxed text-sm md:text-base" style={{ color: 'var(--fg-muted)' }}>
                {series.plot}
              </p>
            )}

            {series.director && (
              <p className="mb-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--fg)' }}>Director:</span>{' '}
                {series.director}
              </p>
            )}

            {series.cast && (
              <p className="mb-4 text-sm" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--fg)' }}>Cast:</span>{' '}
                {series.cast}
              </p>
            )}
          </div>
        </div>

        {/* Episodes */}
        {hasEpisodes && (
          <div className="mt-8">
            <h2 className="mb-4 text-xl font-bold" style={{ color: 'var(--fg)' }}>
              Episodes
            </h2>
            <SeasonTabs seasons={seasonsDisplay} seriesId={seriesId} />
          </div>
        )}

        {!hasEpisodes && (
          <div className="mt-8 flex min-h-[20vh] items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              No episodes available yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
