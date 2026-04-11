// scripts/ingest-epg.ts
// Populate iptv_epg_cache from the raw provider XMLTV.
//
// Source pipeline:
//   1. Stream-parse the raw provider M3U to build a map
//      epgId (raw tvg-id) → channel.id (sha1 prefix of stream URL)
//   2. Stream-parse the raw provider XMLTV programmes element-by-element with
//      sax-style scanning over the text body
//   3. For each programme whose channel attribute matches a known epgId,
//      upsert into iptv_epg_cache keyed by our stable channel.id
//
// Programmes whose channel doesn't appear in the M3U are silently dropped —
// they'd be orphans the app can never link to.
//
// Usage:
//   npm run ingest:epg

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { createHash } from 'node:crypto';
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

/** Read a config key from iptv_config, falling back to an env var. */
async function getConfigOrEnv(key: string, envVar: string): Promise<string> {
  try {
    const res = await pool.query<{ value: string }>(
      'SELECT value FROM iptv_config WHERE key = $1',
      [key],
    );
    const dbVal = res.rows[0]?.value;
    if (dbVal) return dbVal;
  } catch {
    // iptv_config may not exist yet on very first run before 009 migration
  }
  return process.env[envVar] || '';
}

// ---------------------------------------------------------------------------
// Helpers (mirror src/lib/threadfin/client.ts so the script is standalone)
// ---------------------------------------------------------------------------

function streamUrlToChannelId(providerUrl: string): string {
  return createHash('sha1').update(providerUrl).digest('hex').slice(0, 12);
}

function isLiveStreamUrl(url: string): boolean {
  return !url.includes('/movie/') && !url.includes('/series/');
}

function parseExtinfAttributes(extinf: string): { tvgId: string } {
  // Only need tvg-id for the ingest mapping.
  const m = extinf.match(/tvg-id="([^"]*)"/i);
  return { tvgId: m ? m[1] : '' };
}

function parseXmltvDate(raw: string): Date {
  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/,
  );
  if (!match) return new Date(raw);
  const [, y, mo, d, h, mi, s, tz] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tz ? tz.slice(0, 3) + ':' + tz.slice(3) : 'Z'}`;
  return new Date(iso);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Stage 1: build epgId → channelId map from the raw M3U
// ---------------------------------------------------------------------------

async function buildEpgIdMap(rawM3uUrl: string): Promise<Map<string, string>> {
  console.log(`[ingest-epg] reading raw M3U from ${rawM3uUrl}`);
  const res = await fetch(rawM3uUrl);
  if (!res.ok || !res.body) {
    throw new Error(`raw M3U fetch failed: ${res.status}`);
  }

  const map = new Map<string, string>();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let pendingTvgId: string | null = null;
  let liveCount = 0;

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nlIdx: number;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);
      if (!line || line.startsWith('#EXTM3U')) continue;
      if (line.startsWith('#EXTINF:')) {
        pendingTvgId = parseExtinfAttributes(line).tvgId;
        continue;
      }
      if (line.startsWith('#')) continue;

      const url = line;
      const tvgId = pendingTvgId;
      pendingTvgId = null;
      if (!isLiveStreamUrl(url)) continue;
      liveCount++;
      if (!tvgId) continue;

      const providerUrl = /\.[a-z0-9]{2,4}$/i.test(url) ? url : `${url}.ts`;
      const channelId = streamUrlToChannelId(providerUrl);
      // First-write wins — if multiple URLs share a tvg-id, the first is the
      // canonical channel for that EPG entry.
      if (!map.has(tvgId)) {
        map.set(tvgId, channelId);
      }
    }
  }

  console.log(
    `[ingest-epg] M3U scan complete: ${liveCount} live entries, ${map.size} unique tvg-ids → channel IDs`,
  );
  return map;
}

// ---------------------------------------------------------------------------
// Stage 2: stream-parse XMLTV programmes
// ---------------------------------------------------------------------------

interface Programme {
  channelId: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  category: string | null;
}

const PROG_OPEN_RE = /<programme\b([^>]*)>/g;

function extractAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function extractChildText(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXmlEntities(m[1].trim()) : null;
}

/**
 * Stream-fetch the XMLTV body and walk it as text. We don't load it into a
 * DOM — fast-xml-parser would build a giant in-memory tree for the 92 MB
 * file. Instead we scan with regex over a sliding buffer, extracting one
 * <programme>...</programme> block at a time.
 */
async function* streamProgrammes(
  epgIdMap: Map<string, string>,
  rawXmltvUrl: string,
): AsyncGenerator<Programme> {
  console.log(`[ingest-epg] streaming raw XMLTV from ${rawXmltvUrl}`);
  const res = await fetch(rawXmltvUrl);
  if (!res.ok || !res.body) {
    throw new Error(`raw XMLTV fetch failed: ${res.status}`);
  }

  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const windowEnd = now + 24 * 60 * 60 * 1000;

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let totalScanned = 0;
  let yielded = 0;
  let mappedHits = 0;

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process every full <programme>...</programme> block in the buffer.
    while (true) {
      const startIdx = buffer.indexOf('<programme');
      if (startIdx === -1) {
        // Trim already-scanned junk so the buffer doesn't grow unbounded.
        if (buffer.length > 65536) buffer = buffer.slice(-1024);
        break;
      }
      const endIdx = buffer.indexOf('</programme>', startIdx);
      if (endIdx === -1) {
        // Need more data; keep from startIdx onwards.
        buffer = buffer.slice(startIdx);
        break;
      }
      const block = buffer.slice(startIdx, endIdx + '</programme>'.length);
      buffer = buffer.slice(endIdx + '</programme>'.length);
      totalScanned++;

      const openMatch = block.match(/^<programme\b([^>]*)>/);
      if (!openMatch) continue;
      const attrs = openMatch[1];
      const xmlChannel = extractAttr(attrs, 'channel');
      const startRaw = extractAttr(attrs, 'start');
      const stopRaw = extractAttr(attrs, 'stop');
      if (!xmlChannel || !startRaw || !stopRaw) continue;

      const channelId = epgIdMap.get(xmlChannel);
      if (!channelId) continue;
      mappedHits++;

      const start = parseXmltvDate(startRaw);
      const end = parseXmltvDate(stopRaw);
      const startMs = start.getTime();
      if (Number.isNaN(startMs) || startMs < windowStart || startMs > windowEnd) continue;

      const title = extractChildText(block, 'title') || '';
      const description = extractChildText(block, 'desc') || '';
      const category = extractChildText(block, 'category');

      yielded++;
      yield {
        channelId,
        title,
        description,
        start,
        end,
        category: category || null,
      };
    }
  }

  console.log(
    `[ingest-epg] XMLTV scan complete: ${totalScanned} <programme> blocks scanned, ${mappedHits} matched a known channel, ${yielded} within 24h window`,
  );
}

// ---------------------------------------------------------------------------
// Upsert in batches
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

async function upsertBatch(rows: Programme[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (let j = 0; j < rows.length; j++) {
    const p = rows[j];
    const o = j * 6;
    placeholders.push(
      `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`,
    );
    values.push(p.channelId, p.start, p.end, p.title, p.description, p.category);
  }
  await pool.query(
    `INSERT INTO iptv_epg_cache (channel_id, start_at, end_at, title, description, category)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (channel_id, start_at) DO UPDATE SET
       end_at = EXCLUDED.end_at,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category`,
    values,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!connString) {
    console.error('[ingest-epg] Fatal: DATABASE_URL is not set.');
    process.exit(1);
  }

  // Prefer DB-backed config, fall back to env vars
  const rawM3uUrl = await getConfigOrEnv('m3u_url', 'RAW_M3U_URL')
    || `${THREADFIN_URL}/raw/prime.m3u`;
  const rawXmltvUrl = await getConfigOrEnv('xmltv_url', 'RAW_XMLTV_URL')
    || `${THREADFIN_URL}/raw/prime.xml`;

  const epgIdMap = await buildEpgIdMap(rawM3uUrl);
  if (epgIdMap.size === 0) {
    console.warn('[ingest-epg] No tvg-ids found in raw M3U — nothing to ingest.');
    await pool.end();
    return;
  }

  const deleteResult = await pool.query(
    `DELETE FROM iptv_epg_cache WHERE end_at < NOW()`,
  );
  console.log(`[ingest-epg] Deleted ${deleteResult.rowCount ?? 0} expired rows.`);

  // Buffer programmes keyed by (channel_id|startISO) so duplicate entries
  // (XMLTV often emits the same programme multiple times) collapse to one
  // row before we hit Postgres — otherwise ON CONFLICT errors with
  // "command cannot affect row a second time".
  const buffer = new Map<string, Programme>();
  let upserted = 0;
  let seenDupes = 0;

  async function flush() {
    if (buffer.size === 0) return;
    const rows = Array.from(buffer.values());
    buffer.clear();
    await upsertBatch(rows);
    upserted += rows.length;
  }

  for await (const prog of streamProgrammes(epgIdMap, rawXmltvUrl)) {
    const key = `${prog.channelId}|${prog.start.toISOString()}`;
    if (buffer.has(key)) {
      seenDupes++;
      continue;
    }
    buffer.set(key, prog);
    if (buffer.size >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();

  console.log(
    `[ingest-epg] Upserted ${upserted} programmes (${seenDupes} duplicates collapsed).`,
  );

  // Record ingest timestamp so admin dashboard can show it
  try {
    await pool.query(
      `INSERT INTO iptv_config (key, value, updated_at)
       VALUES ('last_epg_ingest_at', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [new Date().toISOString()],
    );
  } catch {
    // iptv_config may not exist if migration 009 hasn't run yet
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[ingest-epg] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
