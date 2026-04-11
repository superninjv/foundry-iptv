// src/app/(app)/search/page.tsx
// Server Component — search page. Returns three kinds of "watch right now":
//   1. Channel-name matches (MLB TEAM| ATLANTA BRAVES, etc.) — these team
//      channels often carry live events but have no EPG data because the
//      provider encodes the program info directly in the channel name.
//   2. EPG programmes that are airing right now (start_at <= NOW < end_at).
//   3. VOD movies/series matching the term.

import { requireAuth } from '@/lib/auth/session';
import { searchChannels, searchEpg, searchVod } from '@/lib/search/text';
import SearchInput from '@/components/SearchInput';
import SearchResults from '@/components/SearchResults';

export const metadata = { title: 'Search — Foundry IPTV' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAuth();

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';

  const [channels, programs, vod] = q
    ? await Promise.all([searchChannels(q), searchEpg(q), searchVod(q)])
    : [[], [], []];

  const hasResults =
    channels.length > 0 || programs.length > 0 || vod.length > 0;

  return (
    <div className="p-4 pb-24 md:p-6">
      <h1
        className="mb-6 text-2xl font-bold"
        style={{ color: 'var(--fg)' }}
      >
        Search
      </h1>

      <SearchInput initialQuery={q} />

      {!q && (
        <p
          className="mt-12 text-center text-lg"
          style={{ color: 'var(--fg-muted)' }}
        >
          Search channels, live programmes, or movies and series
        </p>
      )}

      {q && !hasResults && (
        <p
          className="mt-12 text-center text-lg"
          style={{ color: 'var(--fg-muted)' }}
        >
          Nothing matches &ldquo;{q}&rdquo;.
        </p>
      )}

      {q && hasResults && (
        <SearchResults channels={channels} programs={programs} vod={vod} />
      )}
    </div>
  );
}
