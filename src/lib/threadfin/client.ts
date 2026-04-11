// src/lib/threadfin/client.ts
// Core data layer: reads the raw upstream provider M3U directly (bypassing
// Threadfin's manual XEPG curation) so the app sees every live channel the
// provider exposes — currently ~52K vs Threadfin's manually-activated 1851.
//
// EPG data is read from the raw provider XMLTV. Each Channel carries both:
//   - id: a deterministic sha1 prefix of the provider stream URL (stable
//     across restarts as long as the provider doesn't reshuffle stream IDs).
//     This is what the app uses everywhere — favorites, history, lists.
//   - epgId: the raw M3U `tvg-id` attribute (e.g. "loc.ABC (KOAT) Albuquerque").
//     Used by the EPG ingest script to join programmes with channels.
//
// Threadfin still runs as a service for other consumers but is no longer in
// the foundry-iptv data path.

import { createHash } from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { Channel, EpgProgram, NowNext } from './types';

const THREADFIN_URL = process.env.THREADFIN_URL || 'http://threadfin.foundry.test';

// RAW_M3U_URL is resolved lazily so we can prefer a DB-backed config value
// over the environment variable without making module load async.
let _resolvedM3uUrl: string | null = null;

async function getM3uUrl(): Promise<string> {
  if (_resolvedM3uUrl) return _resolvedM3uUrl;
  try {
    const { getConfigOrEnv } = await import('@/lib/config/db');
    const url = await getConfigOrEnv('m3u_url', 'RAW_M3U_URL');
    _resolvedM3uUrl = url ?? `${THREADFIN_URL}/raw/prime.m3u`;
  } catch {
    _resolvedM3uUrl = process.env.RAW_M3U_URL ?? `${THREADFIN_URL}/raw/prime.m3u`;
  }
  return _resolvedM3uUrl;
}

// Persist caches across Next.js dev-mode hot reloads via globalThis. The
// inflight promise is also stored here so concurrent listChannels() calls
// share a single parse instead of each spinning up their own (the raw M3U
// is ~400 MB and ffmpeg-style parallelism would OOM the dev server).
const globalCache = globalThis as unknown as {
  __threadfin_channels?: { data: Channel[]; fetchedAt: number };
  __threadfin_channels_inflight?: Promise<Channel[]>;
};

// Cap how long we keep the (large) channel list in memory before refetching.
const CACHE_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Channel ID derivation
// ---------------------------------------------------------------------------

/**
 * Stable channel ID derived from the provider stream URL.
 * sha1 truncated to 12 hex chars → 48 bits → collision-free for ~2M streams.
 */
export function streamUrlToChannelId(providerUrl: string): string {
  return createHash('sha1').update(providerUrl).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Raw M3U streaming parser
// ---------------------------------------------------------------------------
//
// The raw M3U is ~400 MB / 1.35M entries (live + movies + series). We can't
// load it all into memory then parse — that's several GB of JS objects. We
// stream-fetch it and parse line by line, only emitting Channel objects for
// the ~52K live entries (URLs that don't contain `/movie/` or `/series/`).
//

function parseExtinfAttributes(extinf: string): {
  attrs: Record<string, string>;
  displayName: string;
} {
  // Format: #EXTINF:<duration> [attr1="val1" attr2="val2" ...],<displayName>
  const commaIdx = extinf.lastIndexOf(',');
  const headerEnd = commaIdx === -1 ? extinf.length : commaIdx;
  const header = extinf.slice(0, headerEnd);
  const displayName = commaIdx === -1 ? '' : extinf.slice(commaIdx + 1).trim();

  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return { attrs, displayName };
}

function isLiveStreamUrl(url: string): boolean {
  // Provider URLs look like:
  //   http://host/USER/PASS/12345          ← live (numeric only or no /movie//series/)
  //   http://host/movie/USER/PASS/12345.mp4
  //   http://host/series/USER/PASS/12345.mp4
  return !url.includes('/movie/') && !url.includes('/series/');
}

/**
 * Stream-parse the raw M3U from RAW_M3U_URL, yielding Channel objects only
 * for live entries. Memory footprint stays bounded (only the running channel
 * list), regardless of how many movies/series are in the file.
 */
// Bypass globalThis.fetch entirely. Next.js 16 instruments the global fetch
// and tries to buffer the full response body into a string for its data
// cache, even when `cache: 'no-store'` is set. For a 400 MB M3U this trips
// ERR_STRING_TOO_LONG and cascades into a RangeError: Maximum call stack
// size exceeded. node:http/https are not instrumented, so we use them
// directly and stream the body without ever materializing it as a string.
function rawHttpGet(urlStr: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      { method: 'GET', headers: { 'User-Agent': 'foundry-iptv/1.0' } },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        resolve(res);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetchChannelsFromRawM3u(): Promise<Channel[]> {
  const RAW_M3U_URL = await getM3uUrl();
  // Reset resolved URL so next invocation re-checks the DB (in case admin changed it)
  _resolvedM3uUrl = null;
  console.log(`[channels] streaming raw M3U from ${RAW_M3U_URL}`);
  let stream: IncomingMessage;
  try {
    stream = await rawHttpGet(RAW_M3U_URL);
  } catch (err) {
    console.warn(
      '[channels] Failed to fetch raw M3U:',
      (err as Error).message,
    );
    return [];
  }

  const channels: Channel[] = [];
  const seenIds = new Set<string>();
  let buffer = '';
  let pendingExtinf: { attrs: Record<string, string>; displayName: string } | null = null;
  let totalEntries = 0;
  let liveEntries = 0;

  stream.setEncoding('utf-8');
  for await (const chunk of stream) {
    buffer += chunk as string;

    // Process complete lines; keep the trailing partial line in the buffer.
    let nlIdx: number;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);

      if (line.length === 0) continue;
      if (line.startsWith('#EXTM3U')) continue;

      if (line.startsWith('#EXTINF:')) {
        pendingExtinf = parseExtinfAttributes(line);
        continue;
      }
      if (line.startsWith('#')) {
        continue; // unknown directive — skip
      }

      // URL line
      totalEntries++;
      const url = line;
      const meta = pendingExtinf;
      pendingExtinf = null;
      if (!meta) continue;
      if (!isLiveStreamUrl(url)) continue;

      liveEntries++;
      // Append .ts so ffmpeg picks the right demuxer for raw MPEG-TS.
      const providerUrl = /\.[a-z0-9]{2,4}$/i.test(url) ? url : `${url}.ts`;
      const id = streamUrlToChannelId(providerUrl);
      if (seenIds.has(id)) continue; // dedup against URL collisions
      seenIds.add(id);

      channels.push({
        id,
        epgId: meta.attrs['tvg-id'] || '',
        name: meta.attrs['tvg-name'] || meta.displayName || '',
        logo: meta.attrs['tvg-logo'] || '',
        group: meta.attrs['group-title'] || '',
        providerUrl,
      });
    }
  }

  // Flush any final line still in the buffer.
  buffer = buffer.trim();
  if (buffer && pendingExtinf && !buffer.startsWith('#') && isLiveStreamUrl(buffer)) {
    const providerUrl = /\.[a-z0-9]{2,4}$/i.test(buffer) ? buffer : `${buffer}.ts`;
    const id = streamUrlToChannelId(providerUrl);
    if (!seenIds.has(id)) {
      channels.push({
        id,
        epgId: pendingExtinf.attrs['tvg-id'] || '',
        name: pendingExtinf.attrs['tvg-name'] || pendingExtinf.displayName || '',
        logo: pendingExtinf.attrs['tvg-logo'] || '',
        group: pendingExtinf.attrs['group-title'] || '',
        providerUrl,
      });
    }
  }

  console.log(
    `[channels] parsed raw M3U: ${totalEntries} entries scanned, ${liveEntries} live, ${channels.length} unique channels`,
  );
  return channels;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all channels with provider URLs. In-memory cached 10 min. Concurrent
 *  callers share a single in-flight parse so the M3U is never decoded twice
 *  in parallel. */
const REDIS_KEY = 'threadfin:channels:v1';
const REDIS_TTL_SEC = 6 * 60 * 60; // 6 hours — M3U rarely changes

export async function listChannels(): Promise<Channel[]> {
  const cc = globalCache.__threadfin_channels;
  if (cc && Date.now() - cc.fetchedAt < CACHE_TTL_MS) {
    return cc.data;
  }
  if (globalCache.__threadfin_channels_inflight) {
    return globalCache.__threadfin_channels_inflight;
  }
  const inflight = (async () => {
    try {
      // L2: Redis. The M3U parse is ~8s cold; Redis round-trip + JSON parse
      // is ~100-500ms. Survives dev-server restarts and lets every fresh
      // process skip the parse for 6 hours.
      const { getRedis } = await import('@/lib/cache/redis');
      const redis = getRedis();
      if (redis) {
        try {
          const existing = await redis.get(REDIS_KEY);
          if (existing) {
            const parsed = JSON.parse(existing) as Channel[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`[channels] loaded ${parsed.length} channels from Redis cache`);
              globalCache.__threadfin_channels = { data: parsed, fetchedAt: Date.now() };
              return parsed;
            }
          }
        } catch (err) {
          console.warn('[channels] Redis get failed:', (err as Error).message);
        }
      }

      const data = await fetchChannelsFromRawM3u();
      globalCache.__threadfin_channels = { data, fetchedAt: Date.now() };

      if (redis && data.length > 0) {
        try {
          await redis.setex(REDIS_KEY, REDIS_TTL_SEC, JSON.stringify(data));
          console.log(`[channels] wrote ${data.length} channels to Redis`);
        } catch (err) {
          console.warn('[channels] Redis set failed:', (err as Error).message);
        }
      }
      return data;
    } finally {
      globalCache.__threadfin_channels_inflight = undefined;
    }
  })();
  globalCache.__threadfin_channels_inflight = inflight;
  return inflight;
}

/** List unique category names. Derived from channels. */
export async function getCategories(): Promise<string[]> {
  const channels = await listChannels();
  const groups = new Set<string>();
  for (const ch of channels) {
    if (ch.group) groups.add(ch.group);
  }
  return Array.from(groups).sort();
}

/**
 * List unique category names with channel counts. Derived from the cached
 * channel list (same source as `getCategories()` — no extra fetch).
 *
 * Used by the native FireStick client so category badges can render without a
 * follow-up round-trip.
 */
export async function getCategoriesWithCounts(): Promise<Array<{ name: string; count: number }>> {
  const channels = await listChannels();
  const counts = new Map<string, number>();
  for (const ch of channels) {
    if (!ch.group) continue;
    counts.set(ch.group, (counts.get(ch.group) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// EPG — read from Postgres cache (populated by scripts/ingest-epg.ts)
// ---------------------------------------------------------------------------

/** Get EPG programmes for a channel from Postgres. */
export async function getEpg(channelId: string): Promise<EpgProgram[]> {
  try {
    const { query } = await import('@/lib/db/client');
    const res = await query<{
      channel_id: string; title: string; description: string;
      start_at: Date; end_at: Date; category: string | null;
    }>(
      `SELECT channel_id, title, description, start_at, end_at, category
       FROM iptv_epg_cache
       WHERE channel_id = $1 AND end_at > NOW()
       ORDER BY start_at`,
      [channelId],
    );
    return res.rows.map((r) => ({
      channelId: r.channel_id,
      title: r.title,
      description: r.description || '',
      start: new Date(r.start_at),
      end: new Date(r.end_at),
      category: r.category || undefined,
    }));
  } catch {
    return [];
  }
}

/** Get all EPG data grouped by channel (for the guide page). Uses Postgres. */
export async function getAllEpg(): Promise<Record<string, EpgProgram[]>> {
  try {
    const { query } = await import('@/lib/db/client');
    const res = await query<{
      channel_id: string; title: string; description: string;
      start_at: Date; end_at: Date; category: string | null;
    }>(
      `SELECT channel_id, title, description, start_at, end_at, category
       FROM iptv_epg_cache
       WHERE end_at > NOW()
       ORDER BY channel_id, start_at`,
    );
    const result: Record<string, EpgProgram[]> = {};
    for (const r of res.rows) {
      const prog: EpgProgram = {
        channelId: r.channel_id,
        title: r.title,
        description: r.description || '',
        start: new Date(r.start_at),
        end: new Date(r.end_at),
        category: r.category || undefined,
      };
      if (!result[r.channel_id]) result[r.channel_id] = [];
      result[r.channel_id].push(prog);
    }
    return result;
  } catch {
    return {};
  }
}

/** Get current and next programme for a channel. */
export async function getNowNext(channelId: string): Promise<NowNext> {
  const programs = await getEpg(channelId);
  const now = Date.now();

  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    if (p.start.getTime() <= now && p.end.getTime() > now) {
      return { now: p, next: programs[i + 1] };
    }
    if (p.start.getTime() > now) {
      return { now: undefined, next: p };
    }
  }
  return {};
}

/** Get now-playing title for multiple channels at once. */
export async function getBulkNowPlaying(
  channelIds: string[],
): Promise<Record<string, string>> {
  if (channelIds.length === 0) return {};

  try {
    const { query } = await import('@/lib/db/client');
    const res = await query<{ channel_id: string; title: string }>(
      `SELECT DISTINCT ON (channel_id) channel_id, title
       FROM iptv_epg_cache
       WHERE channel_id = ANY($1)
         AND start_at <= NOW()
         AND end_at > NOW()
       ORDER BY channel_id, start_at`,
      [channelIds],
    );

    const result: Record<string, string> = {};
    for (const row of res.rows) {
      result[row.channel_id] = row.title;
    }
    return result;
  } catch (err) {
    console.warn(
      '[threadfin] getBulkNowPlaying DB query failed:',
      (err as Error).message,
    );
    return {};
  }
}

/** Get the provider stream URL for a channel. Derived from listChannels(). */
export async function getProviderUrl(channelId: string): Promise<string | null> {
  const channels = await listChannels();
  const channel = channels.find((ch) => ch.id === channelId);
  return channel?.providerUrl || null;
}
