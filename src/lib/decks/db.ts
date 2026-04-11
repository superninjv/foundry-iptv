// src/lib/decks/db.ts
// Data access for superplayer decks. All functions enforce user ownership.

import { query, withTransaction } from '@/lib/db/client';
import { ttlToTimestamp, type DeckTtl } from './ttl';

export type DeckViewMode = 'single' | 'multi';
export type DeckLayout = '2x2' | '3x3' | '1+3' | '2+4';

export const VALID_LAYOUTS: readonly DeckLayout[] = ['2x2', '3x3', '1+3', '2+4'];

export function isValidLayout(value: unknown): value is DeckLayout {
  return typeof value === 'string' && (VALID_LAYOUTS as readonly string[]).includes(value);
}

export interface DeckSummary {
  id: number;
  name: string;
  entryCount: number;
  skipCommercials: boolean;
  updatedAt: string;
}

export interface DeckEntry {
  id: number;
  channelId: string;
  position: number;
  expiresAt: string;
  inCommercial: boolean;
}

export interface DeckPreset {
  id: number;
  position: number;
  layout: DeckLayout;
  channelIds: string[];
}

export interface Deck {
  id: number;
  name: string;
  viewMode: DeckViewMode;
  cursorIndex: number;
  skipCommercials: boolean;
  entries: DeckEntry[];
  presets: DeckPreset[];
}

async function assertOwnership(userId: string, deckId: number): Promise<boolean> {
  const res = await query<{ id: string }>(
    'SELECT id FROM iptv_superplayer_decks WHERE id = $1 AND user_id = $2',
    [deckId, userId],
  );
  return res.rows.length > 0;
}

export async function listDecks(userId: string): Promise<DeckSummary[]> {
  const res = await query<{
    id: string;
    name: string;
    skip_commercials: boolean;
    updated_at: Date;
    entry_count: string;
  }>(
    `SELECT d.id, d.name, d.skip_commercials, d.updated_at,
            COALESCE((
              SELECT COUNT(*) FROM iptv_superplayer_entries e
              WHERE e.deck_id = d.id AND e.expires_at > NOW()
            ), 0) AS entry_count
     FROM iptv_superplayer_decks d
     WHERE d.user_id = $1
     ORDER BY d.updated_at DESC`,
    [userId],
  );

  return res.rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    entryCount: Number(r.entry_count),
    skipCommercials: r.skip_commercials,
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getDeck(userId: string, deckId: number): Promise<Deck | null> {
  const deckRes = await query<{
    id: string;
    name: string;
    view_mode: DeckViewMode;
    cursor_index: number;
    skip_commercials: boolean;
  }>(
    `SELECT id, name, view_mode, cursor_index, skip_commercials
     FROM iptv_superplayer_decks
     WHERE id = $1 AND user_id = $2`,
    [deckId, userId],
  );
  if (deckRes.rows.length === 0) return null;

  // Lazy prune expired entries.
  await query(
    'DELETE FROM iptv_superplayer_entries WHERE deck_id = $1 AND expires_at <= NOW()',
    [deckId],
  );

  const entriesRes = await query<{
    id: string;
    channel_id: string;
    position: number;
    expires_at: Date;
    in_commercial: boolean | null;
  }>(
    `SELECT e.id, e.channel_id, e.position, e.expires_at,
            CASE
              WHEN c.channel_id IS NULL THEN FALSE
              WHEN c.updated_at < NOW() - INTERVAL '60 seconds' THEN FALSE
              ELSE c.in_commercial
            END AS in_commercial
     FROM iptv_superplayer_entries e
     LEFT JOIN iptv_channel_commercial_state c ON c.channel_id = e.channel_id
     WHERE e.deck_id = $1
     ORDER BY e.position ASC`,
    [deckId],
  );

  const presetsRes = await query<{
    id: string;
    position: number;
    layout: DeckLayout;
    channel_ids: string[];
  }>(
    `SELECT id, position, layout, channel_ids
     FROM iptv_superplayer_presets
     WHERE deck_id = $1
     ORDER BY position ASC`,
    [deckId],
  );

  const d = deckRes.rows[0];
  return {
    id: Number(d.id),
    name: d.name,
    viewMode: d.view_mode,
    cursorIndex: d.cursor_index,
    skipCommercials: d.skip_commercials,
    entries: entriesRes.rows.map((r) => ({
      id: Number(r.id),
      channelId: r.channel_id,
      position: r.position,
      expiresAt: r.expires_at.toISOString(),
      inCommercial: Boolean(r.in_commercial),
    })),
    presets: presetsRes.rows.map((r) => ({
      id: Number(r.id),
      position: r.position,
      layout: r.layout,
      channelIds: r.channel_ids,
    })),
  };
}

export async function createDeck(userId: string, name: string): Promise<number> {
  const res = await query<{ id: string }>(
    `INSERT INTO iptv_superplayer_decks (user_id, name)
     VALUES ($1, $2) RETURNING id`,
    [userId, name],
  );
  return Number(res.rows[0].id);
}

export async function deleteDeck(userId: string, deckId: number): Promise<boolean> {
  const res = await query(
    'DELETE FROM iptv_superplayer_decks WHERE id = $1 AND user_id = $2',
    [deckId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface DeckPatch {
  name?: string;
  viewMode?: DeckViewMode;
  cursorIndex?: number;
  skipCommercials?: boolean;
}

export async function updateDeck(
  userId: string,
  deckId: number,
  patch: DeckPatch,
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(patch.name);
  }
  if (patch.viewMode !== undefined) {
    sets.push(`view_mode = $${i++}`);
    values.push(patch.viewMode);
  }
  if (patch.cursorIndex !== undefined) {
    sets.push(`cursor_index = $${i++}`);
    values.push(patch.cursorIndex);
  }
  if (patch.skipCommercials !== undefined) {
    sets.push(`skip_commercials = $${i++}`);
    values.push(patch.skipCommercials);
  }

  if (sets.length === 0) return assertOwnership(userId, deckId);

  sets.push(`updated_at = NOW()`);
  values.push(deckId, userId);

  const res = await query(
    `UPDATE iptv_superplayer_decks SET ${sets.join(', ')}
     WHERE id = $${i++} AND user_id = $${i}`,
    values,
  );
  return (res.rowCount ?? 0) > 0;
}

export async function addEntry(
  userId: string,
  deckId: number,
  channelId: string,
  ttl: DeckTtl,
): Promise<number | null> {
  const owned = await assertOwnership(userId, deckId);
  if (!owned) return null;

  const expiresAt = ttlToTimestamp(ttl);

  return withTransaction(async (client) => {
    const posRes = await client.query<{ next_pos: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
       FROM iptv_superplayer_entries WHERE deck_id = $1`,
      [deckId],
    );
    const nextPos = posRes.rows[0].next_pos;

    const ins = await client.query<{ id: string }>(
      `INSERT INTO iptv_superplayer_entries (deck_id, channel_id, position, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [deckId, channelId, nextPos, expiresAt],
    );

    await client.query(
      'UPDATE iptv_superplayer_decks SET updated_at = NOW() WHERE id = $1',
      [deckId],
    );

    return Number(ins.rows[0].id);
  });
}

export async function removeEntry(
  userId: string,
  deckId: number,
  entryId: number,
): Promise<boolean> {
  const owned = await assertOwnership(userId, deckId);
  if (!owned) return false;

  return withTransaction(async (client) => {
    const del = await client.query(
      'DELETE FROM iptv_superplayer_entries WHERE id = $1 AND deck_id = $2',
      [entryId, deckId],
    );
    if ((del.rowCount ?? 0) === 0) return false;

    // Re-pack positions so they remain contiguous from 0.
    const rows = await client.query<{ id: string }>(
      'SELECT id FROM iptv_superplayer_entries WHERE deck_id = $1 ORDER BY position ASC',
      [deckId],
    );
    // Move everything to negative temp range first to avoid unique collisions.
    await client.query(
      `UPDATE iptv_superplayer_entries
       SET position = -position - 1
       WHERE deck_id = $1`,
      [deckId],
    );
    for (let i = 0; i < rows.rows.length; i++) {
      await client.query(
        'UPDATE iptv_superplayer_entries SET position = $1 WHERE id = $2',
        [i, rows.rows[i].id],
      );
    }

    await client.query(
      'UPDATE iptv_superplayer_decks SET updated_at = NOW() WHERE id = $1',
      [deckId],
    );
    return true;
  });
}

export async function renewEntry(
  userId: string,
  deckId: number,
  entryId: number,
  ttl: DeckTtl,
): Promise<boolean> {
  const owned = await assertOwnership(userId, deckId);
  if (!owned) return false;

  const expiresAt = ttlToTimestamp(ttl);
  const res = await query(
    `UPDATE iptv_superplayer_entries SET expires_at = $1
     WHERE id = $2 AND deck_id = $3`,
    [expiresAt, entryId, deckId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function addPreset(
  userId: string,
  deckId: number,
  channelIds: string[],
  layout: DeckLayout,
): Promise<number | null> {
  const owned = await assertOwnership(userId, deckId);
  if (!owned) return null;

  return withTransaction(async (client) => {
    const posRes = await client.query<{ next_pos: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
       FROM iptv_superplayer_presets WHERE deck_id = $1`,
      [deckId],
    );
    const nextPos = posRes.rows[0].next_pos;

    const ins = await client.query<{ id: string }>(
      `INSERT INTO iptv_superplayer_presets (deck_id, position, layout, channel_ids)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [deckId, nextPos, layout, channelIds],
    );

    await client.query(
      'UPDATE iptv_superplayer_decks SET updated_at = NOW() WHERE id = $1',
      [deckId],
    );
    return Number(ins.rows[0].id);
  });
}

export async function removePreset(
  userId: string,
  deckId: number,
  presetId: number,
): Promise<boolean> {
  const owned = await assertOwnership(userId, deckId);
  if (!owned) return false;

  return withTransaction(async (client) => {
    const del = await client.query(
      'DELETE FROM iptv_superplayer_presets WHERE id = $1 AND deck_id = $2',
      [presetId, deckId],
    );
    if ((del.rowCount ?? 0) === 0) return false;

    const rows = await client.query<{ id: string }>(
      'SELECT id FROM iptv_superplayer_presets WHERE deck_id = $1 ORDER BY position ASC',
      [deckId],
    );
    await client.query(
      `UPDATE iptv_superplayer_presets SET position = -position - 1 WHERE deck_id = $1`,
      [deckId],
    );
    for (let i = 0; i < rows.rows.length; i++) {
      await client.query(
        'UPDATE iptv_superplayer_presets SET position = $1 WHERE id = $2',
        [i, rows.rows[i].id],
      );
    }

    await client.query(
      'UPDATE iptv_superplayer_decks SET updated_at = NOW() WHERE id = $1',
      [deckId],
    );
    return true;
  });
}
