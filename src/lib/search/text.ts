// src/lib/search/text.ts
// Text search module: pg_trgm EPG search (currently airing only) + VOD
// search. Channel-by-name discovery has moved to /live's ?q= filter so the
// search page is purely "what can I watch right now".

import { query } from '@/lib/db/client';
import { listChannels } from '@/lib/threadfin/client';
import type { Channel } from '@/lib/threadfin/types';

export interface EpgSearchResult {
  channelId: string;
  channelName: string;
  channelLogo: string;
  channelGroup: string;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  category?: string;
  similarity: number;
}

export interface VodSearchResult {
  streamId: number;
  name: string;
  plot: string;
  genre: string;
  cover: string;
  mediaType: 'movie' | 'series';
  similarity: number;
}

export interface SearchResults {
  channels: Channel[];
  programs: EpgSearchResult[];
  vod: VodSearchResult[];
}

/** Sanitize and normalize a search query. */
function sanitize(q: string): string {
  return q.trim().slice(0, 200);
}

/** Search channels by name/group (in-memory, from cached listChannels).
 *  Ranks by relevance: exact word boundary > prefix > substring. Capped at
 *  `limit` so a generic term like "MLB" doesn't return 200+ cards. Group
 *  matches rank below name matches. */
export async function searchChannels(
  q: string,
  limit = 40,
): Promise<Channel[]> {
  const term = sanitize(q).toLowerCase();
  if (!term) return [];

  const channels = await listChannels();
  const scored: { ch: Channel; score: number }[] = [];

  for (const ch of channels) {
    const name = ch.name.toLowerCase();
    const group = ch.group.toLowerCase();
    let score = 0;
    // Word-boundary match in name (e.g. "braves" in "MLB ATLANTA BRAVES HD")
    if (new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:[^a-z0-9]|$)`).test(name)) {
      score = 1000;
    } else if (name.startsWith(term)) {
      score = 800;
    } else if (name.includes(term)) {
      score = 600;
    } else if (group.includes(term)) {
      score = 200;
    }
    if (score > 0) {
      // Tiebreak: shorter names score higher (more specific match).
      score -= Math.min(50, name.length);
      scored.push({ ch, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.ch);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Search currently-airing EPG programs.
 *  Filters to programmes whose start_at <= NOW() < end_at — no future
 *  programmes, no recently-ended ones. Joins channel display info from
 *  listChannels() (in-memory cached) so the UI can render channel name/logo
 *  without an extra fetch. Programmes whose channel is no longer in the
 *  playlist are dropped (orphans the user can never reach). */
export async function searchEpg(
  q: string,
  limit = 50,
): Promise<EpgSearchResult[]> {
  const term = sanitize(q);
  if (!term) return [];

  const [result, channels] = await Promise.all([
    query<{
      channel_id: string;
      title: string;
      description: string;
      start_at: Date;
      end_at: Date;
      category: string | null;
      similarity: number;
    }>(
      `SELECT channel_id, title, description, start_at, end_at, category,
              similarity(title, $1) AS similarity
       FROM iptv_epg_cache
       WHERE (title % $1 OR title ILIKE '%' || $1 || '%')
         AND start_at <= NOW()
         AND end_at > NOW()
       ORDER BY similarity(title, $1) DESC
       LIMIT $2`,
      [term, limit],
    ),
    listChannels(),
  ]);

  const channelMap = new Map<string, Channel>();
  for (const ch of channels) channelMap.set(ch.id, ch);

  const enriched: EpgSearchResult[] = [];
  for (const row of result.rows) {
    const ch = channelMap.get(row.channel_id);
    if (!ch) continue;
    enriched.push({
      channelId: row.channel_id,
      channelName: ch.name,
      channelLogo: ch.logo,
      channelGroup: ch.group,
      title: row.title,
      description: row.description,
      startAt: new Date(row.start_at),
      endAt: new Date(row.end_at),
      category: row.category ?? undefined,
      similarity: Number(row.similarity),
    });
  }
  return enriched;
}

/** Search VOD movies + series using pg_trgm. */
export async function searchVod(
  q: string,
  limit = 30,
): Promise<VodSearchResult[]> {
  const term = sanitize(q);
  if (!term) return [];

  const result = await query<{
    stream_id: number;
    name: string;
    plot: string | null;
    genre: string | null;
    cover: string | null;
    media_type: 'movie' | 'series';
    similarity: number;
  }>(
    `SELECT stream_id, name, plot, genre, cover, media_type,
            similarity(name, $1) AS similarity
     FROM iptv_vod_cache
     WHERE name % $1 OR name ILIKE '%' || $1 || '%'
     ORDER BY similarity(name, $1) DESC
     LIMIT $2`,
    [term, limit],
  );

  return result.rows.map((row) => ({
    streamId: row.stream_id,
    name: row.name,
    plot: row.plot || '',
    genre: row.genre || '',
    cover: row.cover || '',
    mediaType: row.media_type,
    similarity: Number(row.similarity),
  }));
}

/** Combined channel + EPG + VOD search. */
export async function searchAll(q: string): Promise<SearchResults> {
  const [channels, programs, vod] = await Promise.all([
    searchChannels(q),
    searchEpg(q),
    searchVod(q),
  ]);

  return { channels, programs, vod };
}
