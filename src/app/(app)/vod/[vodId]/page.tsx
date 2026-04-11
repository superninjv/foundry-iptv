// src/app/(app)/vod/[vodId]/page.tsx — SERVER COMPONENT
// Movie detail page with poster, metadata, and play button.

import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { getVodInfo } from '@/lib/xtream/client';

export const metadata = { title: 'Movie Detail' };

export default async function VodDetailPage({
  params,
}: {
  params: Promise<{ vodId: string }>;
}) {
  await requireAuth();
  const { vodId } = await params;

  let info;
  try {
    info = await getVodInfo(vodId);
  } catch (err) {
    console.error('[vod/detail]', err);
    return (
      <div className="p-4 pb-20 md:p-6 md:pb-6">
        <Link
          href="/vod"
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
            Movie not found or unavailable.
          </p>
        </div>
      </div>
    );
  }

  const movie = info.info;
  const streamData = info.movie_data;
  const backdropUrl = movie.backdrop_path?.[0]
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path[0]}`
    : '';
  const posterUrl = movie.movie_image || '';
  const year = movie.releasedate ? movie.releasedate.slice(0, 4) : '';

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
          href="/vod"
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
                  alt={movie.name || streamData.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-5xl font-bold" style={{ color: 'var(--fg-muted)' }}>
                    {(movie.name || streamData.name).charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="mb-2 text-2xl font-bold md:text-3xl" style={{ color: 'var(--fg)' }}>
              {movie.name || streamData.name}
            </h1>

            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--fg-muted)' }}>
              {year && <span>{year}</span>}
              {movie.duration && <span>{movie.duration}</span>}
              {movie.rating && movie.rating !== '0' && (
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {movie.rating}
                </span>
              )}
            </div>

            {movie.genre && (
              <div className="mb-3 flex flex-wrap gap-2">
                {movie.genre.split(',').map((g) => (
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

            {movie.plot && (
              <p className="mb-4 leading-relaxed text-sm md:text-base" style={{ color: 'var(--fg-muted)' }}>
                {movie.plot}
              </p>
            )}

            {movie.director && (
              <p className="mb-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--fg)' }}>Director:</span>{' '}
                {movie.director}
              </p>
            )}

            {movie.cast && (
              <p className="mb-4 text-sm" style={{ color: 'var(--fg-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--fg)' }}>Cast:</span>{' '}
                {movie.cast}
              </p>
            )}

            {/* Play button */}
            <Link
              href={`/watch/vod/${streamData.stream_id}?ext=${streamData.container_extension || 'mp4'}`}
              className="inline-flex items-center gap-3 rounded-xl px-8 py-4 text-lg font-semibold transition-opacity"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--bg)',
                minHeight: '48px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
