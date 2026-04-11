// scripts/ingest-vod.ts
// Standalone script to populate iptv_vod_cache from the Xtream API.
// Fetches VOD movies and series, filters to English-only categories,
// and upserts into iptv_vod_cache in batches.
//
// Usage:
//   npm run ingest:vod

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { Pool } from 'pg';

const THREADFIN_URL = process.env.THREADFIN_URL || 'http://threadfin.foundry.test';

const connString = (process.env.DATABASE_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '')
  .replace(/\?$/, '');
const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
const ssl =
  sslMode === 'require' || sslMode === 'true' || sslMode === '1'
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({ connectionString: connString, ssl });

// ---------------------------------------------------------------------------
// Xtream credential extraction (same logic as src/lib/xtream/client.ts)
// ---------------------------------------------------------------------------

interface XtreamCreds {
  host: string;
  username: string;
  password: string;
}

async function extractCredentials(): Promise<XtreamCreds> {
  try {
    const res = await fetch(`${THREADFIN_URL}/conf/urls.json`);
    if (res.ok) {
      const data: Record<string, { url: string }> = await res.json();
      const entries = Object.values(data);

      for (const entry of entries) {
        if (!entry.url) continue;
        const url = new URL(entry.url);
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length >= 3) {
          const creds: XtreamCreds = {
            host: url.host,
            username: segments[0],
            password: segments[1],
          };
          console.log(`[ingest-vod] Credentials extracted from urls.json (host: ${creds.host})`);
          return creds;
        }
      }
    }
  } catch (err) {
    console.warn('[ingest-vod] Failed to extract credentials from urls.json:', (err as Error).message);
  }

  const host = process.env.XTREAM_HOST;
  const username = process.env.XTREAM_USERNAME;
  const password = process.env.XTREAM_PASSWORD;

  if (!host || !username || !password) {
    throw new Error('[ingest-vod] No Xtream credentials available.');
  }

  console.log(`[ingest-vod] Credentials loaded from env vars (host: ${host})`);
  return { host, username, password };
}

// ---------------------------------------------------------------------------
// Xtream API helpers
// ---------------------------------------------------------------------------

async function xtreamGet<T>(creds: XtreamCreds, action: string): Promise<T> {
  const url = `http://${creds.host}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=${action}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[ingest-vod] Xtream API error ${res.status} for action=${action}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// English-only category filter
// ---------------------------------------------------------------------------

const ENGLISH_MARKERS = [
  'EN', 'US', 'UK', 'ENGLISH', 'USA', 'UNITED STATES', 'UNITED KINGDOM',
  'BRITISH', 'AMERICAN', 'CANADIAN', 'AUSTRALIAN', 'IRELAND',
];

const COMMON_ENGLISH_CATEGORIES = [
  'ACTION', 'ADVENTURE', 'ANIMATION', 'BIOGRAPHY', 'COMEDY', 'CRIME',
  'DOCUMENTARY', 'DRAMA', 'FAMILY', 'FANTASY', 'HISTORY', 'HORROR',
  'MUSIC', 'MUSICAL', 'MYSTERY', 'ROMANCE', 'SCI-FI', 'SCIENCE FICTION',
  'SPORT', 'SPORTS', 'THRILLER', 'WAR', 'WESTERN', 'KIDS', 'CHRISTMAS',
  'HOLIDAY', 'CLASSIC', 'CLASSICS', 'BOLLYWOOD', 'SUPERHERO', 'MARVEL',
  'DC', 'DISNEY', 'PIXAR', 'OSCAR', 'AWARD', 'NEW RELEASE', 'LATEST',
  'TRENDING', 'POPULAR', 'TOP RATED', 'BEST', 'RECOMMENDED',
];

function isEnglishCategory(name: string): boolean {
  const upper = name.toUpperCase().trim();
  for (const marker of ENGLISH_MARKERS) {
    if (upper.includes(marker)) return true;
  }
  for (const cat of COMMON_ENGLISH_CATEGORIES) {
    if (upper.includes(cat)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Types (minimal, matching Xtream API response shapes)
// ---------------------------------------------------------------------------

interface VodCategory {
  category_id: string;
  category_name: string;
}

interface VodStream {
  stream_id: number;
  name: string;
  rating: string;
  stream_icon: string;
  category_id: string;
  container_extension: string;
}

interface Series {
  series_id: number;
  name: string;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  rating: string;
  category_id: string;
}

// ---------------------------------------------------------------------------
// Upsert logic
// ---------------------------------------------------------------------------

interface CacheRow {
  stream_id: number;
  name: string;
  plot: string;
  cast_info: string;
  director: string;
  genre: string;
  rating: string;
  cover: string;
  release_date: string;
  duration: string;
  container_ext: string;
  category_name: string;
  media_type: 'movie' | 'series';
}

const BATCH_SIZE = 500;

async function upsertBatch(rows: CacheRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    const offset = j * 13;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`,
    );
    values.push(
      r.stream_id,
      r.name,
      r.plot,
      r.cast_info,
      r.director,
      r.genre,
      r.rating,
      r.cover,
      r.release_date,
      r.duration,
      r.container_ext,
      r.category_name,
      r.media_type,
    );
  }

  const result = await pool.query(
    `INSERT INTO iptv_vod_cache (stream_id, name, plot, cast_info, director, genre, rating, cover, release_date, duration, container_ext, category_name, media_type)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (media_type, stream_id) DO UPDATE SET
       name = EXCLUDED.name,
       plot = EXCLUDED.plot,
       cast_info = EXCLUDED.cast_info,
       director = EXCLUDED.director,
       genre = EXCLUDED.genre,
       rating = EXCLUDED.rating,
       cover = EXCLUDED.cover,
       release_date = EXCLUDED.release_date,
       duration = EXCLUDED.duration,
       container_ext = EXCLUDED.container_ext,
       category_name = EXCLUDED.category_name,
       media_type = EXCLUDED.media_type,
       updated_at = NOW()`,
    values,
  );

  return result.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!connString) {
    console.error('[ingest-vod] Fatal: DATABASE_URL is not set.');
    process.exit(1);
  }

  let creds: XtreamCreds;
  try {
    creds = await extractCredentials();
  } catch (err) {
    console.error('[ingest-vod]', (err as Error).message);
    console.warn('[ingest-vod] Xtream API unreachable or no credentials — skipping VOD ingest.');
    process.exit(0);
  }

  // ---- VOD Movies ----
  console.log('[ingest-vod] Fetching VOD categories...');
  let vodCategories: VodCategory[];
  let vodStreams: VodStream[];
  try {
    vodCategories = await xtreamGet<VodCategory[]>(creds, 'get_vod_categories');
    console.log(`[ingest-vod] Total VOD categories: ${vodCategories.length}`);

    const englishCats = vodCategories.filter((c) => isEnglishCategory(c.category_name));
    const englishCatIds = new Set(englishCats.map((c) => c.category_id));
    console.log(`[ingest-vod] English VOD categories: ${englishCats.length}`);

    console.log('[ingest-vod] Fetching VOD streams...');
    vodStreams = await xtreamGet<VodStream[]>(creds, 'get_vod_streams');
    console.log(`[ingest-vod] Total VOD streams: ${vodStreams.length}`);

    // Filter to English categories
    vodStreams = vodStreams.filter((s) => englishCatIds.has(s.category_id));
    console.log(`[ingest-vod] English VOD streams: ${vodStreams.length}`);
  } catch (err) {
    console.warn('[ingest-vod] Failed to fetch VOD data:', (err as Error).message);
    vodCategories = [];
    vodStreams = [];
  }

  // Build category ID → name lookup
  const catLookup = new Map<string, string>();
  for (const c of vodCategories) {
    catLookup.set(c.category_id, c.category_name);
  }

  // Convert to cache rows
  const movieRows: CacheRow[] = vodStreams.map((s) => ({
    stream_id: s.stream_id,
    name: s.name || '',
    plot: '',
    cast_info: '',
    director: '',
    genre: '',
    rating: s.rating || '',
    cover: s.stream_icon || '',
    release_date: '',
    duration: '',
    container_ext: s.container_extension || '',
    category_name: catLookup.get(s.category_id) || '',
    media_type: 'movie' as const,
  }));

  // ---- Series ----
  console.log('[ingest-vod] Fetching Series categories...');
  let seriesCategories: VodCategory[];
  let seriesList: Series[];
  try {
    seriesCategories = await xtreamGet<VodCategory[]>(creds, 'get_series_categories');
    console.log(`[ingest-vod] Total Series categories: ${seriesCategories.length}`);

    const englishSeriesCats = seriesCategories.filter((c) => isEnglishCategory(c.category_name));
    const englishSeriesCatIds = new Set(englishSeriesCats.map((c) => c.category_id));
    console.log(`[ingest-vod] English Series categories: ${englishSeriesCats.length}`);

    console.log('[ingest-vod] Fetching Series list...');
    seriesList = await xtreamGet<Series[]>(creds, 'get_series');
    console.log(`[ingest-vod] Total series: ${seriesList.length}`);

    seriesList = seriesList.filter((s) => englishSeriesCatIds.has(s.category_id));
    console.log(`[ingest-vod] English series: ${seriesList.length}`);
  } catch (err) {
    console.warn('[ingest-vod] Failed to fetch Series data:', (err as Error).message);
    seriesCategories = [];
    seriesList = [];
  }

  // Build series category lookup
  for (const c of seriesCategories) {
    catLookup.set(c.category_id, c.category_name);
  }

  const seriesRows: CacheRow[] = seriesList.map((s) => ({
    stream_id: s.series_id,
    name: s.name || '',
    plot: s.plot || '',
    cast_info: s.cast || '',
    director: s.director || '',
    genre: s.genre || '',
    rating: s.rating || '',
    cover: s.cover || '',
    release_date: s.releaseDate || '',
    duration: '',
    container_ext: '',
    category_name: catLookup.get(s.category_id) || '',
    media_type: 'series' as const,
  }));

  // ---- Upsert all ----
  const allRows = [...movieRows, ...seriesRows];
  console.log(`[ingest-vod] Upserting ${allRows.length} items (${movieRows.length} movies, ${seriesRows.length} series)...`);

  let totalUpserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const count = await upsertBatch(batch);
    totalUpserted += count;
    if (i % (BATCH_SIZE * 5) === 0 && i > 0) {
      console.log(`[ingest-vod]   ... ${i}/${allRows.length} processed`);
    }
  }

  console.log(`[ingest-vod] Results:`);
  console.log(`  Movies: ${movieRows.length}`);
  console.log(`  Series: ${seriesRows.length}`);
  console.log(`  Total upserted: ${totalUpserted}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[ingest-vod] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
