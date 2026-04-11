// src/lib/xtream/client.ts
// Xtream Codes API client for VOD and Series data.
// Auto-extracts credentials from Threadfin's urls.json; falls back to env vars.

import type {
  VodCategory,
  VodStream,
  VodInfo,
  SeriesCategory,
  Series,
  SeriesInfo,
} from './types';

const THREADFIN_URL = process.env.THREADFIN_URL || 'http://threadfin.foundry.test';

// ---------------------------------------------------------------------------
// globalThis caching (survives Next.js dev-mode hot reloads)
// ---------------------------------------------------------------------------

interface XtreamCreds {
  host: string;
  username: string;
  password: string;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const g = globalThis as unknown as {
  __xtream_creds?: XtreamCreds;
  __xtream_cache?: Record<string, CacheEntry<unknown>>;
};

function getCache(): Record<string, CacheEntry<unknown>> {
  if (!g.__xtream_cache) g.__xtream_cache = {};
  return g.__xtream_cache;
}

function getCached<T>(key: string, ttlMs: number): T | null {
  const cache = getCache();
  const entry = cache[key];
  if (entry && Date.now() - entry.fetchedAt < ttlMs) {
    return entry.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  getCache()[key] = { data, fetchedAt: Date.now() };
}

const TTL_CATEGORIES = 10 * 60 * 1000; // 10 min
const TTL_STREAMS = 30 * 60 * 1000;    // 30 min
const TTL_INFO = 30 * 60 * 1000;       // 30 min

// ---------------------------------------------------------------------------
// Credential extraction
// ---------------------------------------------------------------------------

/**
 * Extract Xtream credentials from Threadfin's urls.json.
 * URL pattern: http://host:port/username/password/streamId
 * Falls back to env vars XTREAM_HOST, XTREAM_USERNAME, XTREAM_PASSWORD.
 */
export async function extractCredentials(): Promise<XtreamCreds> {
  if (g.__xtream_creds) return g.__xtream_creds;

  try {
    const res = await fetch(`${THREADFIN_URL}/conf/urls.json`);
    if (res.ok) {
      const data: Record<string, { url: string }> = await res.json();
      const entries = Object.values(data);

      for (const entry of entries) {
        if (!entry.url) continue;
        const url = new URL(entry.url);
        const segments = url.pathname.split('/').filter(Boolean);
        // Pattern: /username/password/streamId
        if (segments.length >= 3) {
          const creds: XtreamCreds = {
            host: url.host,
            username: segments[0],
            password: segments[1],
          };
          g.__xtream_creds = creds;
          console.log(`[xtream] Credentials extracted from urls.json (host: ${creds.host})`);
          return creds;
        }
      }
    }
  } catch (err) {
    console.warn('[xtream] Failed to extract credentials from urls.json:', (err as Error).message);
  }

  // Fallback to env vars
  const host = process.env.XTREAM_HOST;
  const username = process.env.XTREAM_USERNAME;
  const password = process.env.XTREAM_PASSWORD;

  if (!host || !username || !password) {
    throw new Error('[xtream] No credentials available. Set XTREAM_HOST, XTREAM_USERNAME, XTREAM_PASSWORD or ensure Threadfin urls.json is accessible.');
  }

  const creds: XtreamCreds = { host, username, password };
  g.__xtream_creds = creds;
  console.log(`[xtream] Credentials loaded from env vars (host: ${creds.host})`);
  return creds;
}

// ---------------------------------------------------------------------------
// Generic API caller
// ---------------------------------------------------------------------------

export async function xtreamGet<T>(action: string, params?: Record<string, string>): Promise<T> {
  const creds = await extractCredentials();
  const url = new URL(`http://${creds.host}/player_api.php`);
  url.searchParams.set('username', creds.username);
  url.searchParams.set('password', creds.password);
  url.searchParams.set('action', action);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`[xtream] API error ${res.status} for action=${action}`);
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
  // Check for explicit English markers
  for (const marker of ENGLISH_MARKERS) {
    if (upper.includes(marker)) return true;
  }
  // Check for common English genre names (exact or as part of composite)
  for (const cat of COMMON_ENGLISH_CATEGORIES) {
    if (upper.includes(cat)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// VOD functions
// ---------------------------------------------------------------------------

export async function getVodCategories(): Promise<VodCategory[]> {
  const cached = getCached<VodCategory[]>('vod_categories', TTL_CATEGORIES);
  if (cached) return cached;

  const all = await xtreamGet<VodCategory[]>('get_vod_categories');
  const filtered = all.filter((c) => isEnglishCategory(c.category_name));
  setCache('vod_categories', filtered);
  console.log(`[xtream] VOD categories: ${filtered.length}/${all.length} (English-filtered)`);
  return filtered;
}

export async function getVodStreams(categoryId?: string): Promise<VodStream[]> {
  const cacheKey = `vod_streams_${categoryId || 'all'}`;
  const cached = getCached<VodStream[]>(cacheKey, TTL_STREAMS);
  if (cached) return cached;

  const params: Record<string, string> = {};
  if (categoryId) params.category_id = categoryId;
  const streams = await xtreamGet<VodStream[]>('get_vod_streams', params);
  setCache(cacheKey, streams);
  return streams;
}

export async function getVodInfo(vodId: string): Promise<VodInfo> {
  const cacheKey = `vod_info_${vodId}`;
  const cached = getCached<VodInfo>(cacheKey, TTL_INFO);
  if (cached) return cached;

  const info = await xtreamGet<VodInfo>('get_vod_info', { vod_id: vodId });
  setCache(cacheKey, info);
  return info;
}

// ---------------------------------------------------------------------------
// Series functions
// ---------------------------------------------------------------------------

export async function getSeriesCategories(): Promise<VodCategory[]> {
  const cached = getCached<VodCategory[]>('series_categories', TTL_CATEGORIES);
  if (cached) return cached;

  const all = await xtreamGet<VodCategory[]>('get_series_categories');
  const filtered = all.filter((c) => isEnglishCategory(c.category_name));
  setCache('series_categories', filtered);
  console.log(`[xtream] Series categories: ${filtered.length}/${all.length} (English-filtered)`);
  return filtered;
}

export async function getSeriesList(categoryId?: string): Promise<Series[]> {
  const cacheKey = `series_list_${categoryId || 'all'}`;
  const cached = getCached<Series[]>(cacheKey, TTL_STREAMS);
  if (cached) return cached;

  const params: Record<string, string> = {};
  if (categoryId) params.category_id = categoryId;
  const series = await xtreamGet<Series[]>('get_series', params);
  setCache(cacheKey, series);
  return series;
}

export async function getSeriesInfo(seriesId: string): Promise<SeriesInfo> {
  const memKey = `series_info_${seriesId}`;
  const fromMem = getCached<SeriesInfo>(memKey, TTL_INFO);
  if (fromMem) return fromMem;

  // L2: Redis. Survives dev-server restarts so the first /series/[id] visit
  // after `systemctl restart iptv-dev` is instant instead of a ~1.5s Xtream
  // round-trip. TTL matches the in-memory TTL_INFO (30 min).
  const { cached } = await import('@/lib/cache/redis');
  const info = await cached<SeriesInfo>(
    `xtream:series_info:${seriesId}`,
    30 * 60,
    () => xtreamGet<SeriesInfo>('get_series_info', { series_id: seriesId }),
  );
  setCache(memKey, info);
  return info;
}

// ---------------------------------------------------------------------------
// Stream URL builder
// ---------------------------------------------------------------------------

/**
 * Build the direct provider stream URL for VOD or Series content.
 * Movie: http://host/movie/user/pass/streamId.ext
 * Series: http://host/series/user/pass/streamId.ext
 */
export async function getStreamUrl(
  streamId: string,
  type: 'movie' | 'series',
  ext: string,
): Promise<string> {
  const creds = await extractCredentials();
  return `http://${creds.host}/${type}/${creds.username}/${creds.password}/${streamId}.${ext}`;
}
