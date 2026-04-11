// src/app/(app)/vod/page.tsx — SERVER COMPONENT
// Watched-only browse: only lists movies the current user has actually played.
// Discovery of anything else happens via /search.

import { requireAuth } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import MediaGrid from '@/components/MediaGrid';
import SearchInput from '@/components/SearchInput';

export const metadata = { title: 'Movies' };
export const revalidate = 0;

const PAGE_SIZE = 60;

export default async function VodPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireAuth();

  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const [countResult, movieResult] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*) AS count
           FROM iptv_vod_cache v
           INNER JOIN (
             SELECT DISTINCT vod_stream_id
               FROM iptv_watch_history
              WHERE user_id = $1
                AND media_type = 'vod'
                AND vod_stream_id IS NOT NULL
           ) h ON h.vod_stream_id = v.stream_id
          WHERE v.media_type = 'movie'`,
        [user.id],
      ),
      query<{ stream_id: number; name: string; cover: string | null; rating: string | null }>(
        `SELECT v.stream_id, v.name, v.cover, v.rating
           FROM iptv_vod_cache v
           INNER JOIN (
             SELECT DISTINCT vod_stream_id
               FROM iptv_watch_history
              WHERE user_id = $1
                AND media_type = 'vod'
                AND vod_stream_id IS NOT NULL
           ) h ON h.vod_stream_id = v.stream_id
          WHERE v.media_type = 'movie'
          ORDER BY v.name
          LIMIT $2 OFFSET $3`,
        [user.id, PAGE_SIZE, offset],
      ),
    ]);

    const totalItems = parseInt(countResult.rows[0]?.count || '0', 10);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const items = movieResult.rows.map((r) => ({
      id: String(r.stream_id),
      name: r.name,
      image: r.cover || '',
      subtitle: r.rating && r.rating !== '0' ? `Rating: ${r.rating}` : undefined,
    }));

    if (items.length === 0 && page === 1) {
      return <EmptyState />;
    }

    return (
      <div className="p-4 pb-20 md:p-6 md:pb-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--fg)' }}>
          Movies
        </h1>

        <MediaGrid items={items} linkPrefix="/vod" />

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            {hasPrev && (
              <a
                href={`/vod?page=${page - 1}`}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--fg)', border: '1px solid var(--border)' }}
              >
                Previous
              </a>
            )}
            <span style={{ color: 'var(--fg-muted)' }} className="text-sm">
              Page {page} of {totalPages}
            </span>
            {hasNext && (
              <a
                href={`/vod?page=${page + 1}`}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--fg)', border: '1px solid var(--border)' }}
              >
                Next
              </a>
            )}
          </div>
        )}
      </div>
    );
  } catch (err) {
    console.error('[vod/page]', err);
    return (
      <div className="p-4 pb-20 md:p-6 md:pb-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--fg)' }}>
          Movies
        </h1>
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-center text-lg" style={{ color: 'var(--fg-muted)' }}>
            Unable to load movies.
          </p>
        </div>
      </div>
    );
  }
}

function EmptyState() {
  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--fg)' }}>
        Movies
      </h1>
      <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-6 text-center">
        <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
          Nothing watched yet — search to discover.
        </p>
        <div className="w-full">
          <SearchInput initialQuery="" />
        </div>
      </div>
    </div>
  );
}
