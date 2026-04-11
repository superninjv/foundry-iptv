// src/lib/decks/ttl.ts
// TTL parsing for superplayer deck entries.

export type DeckTtl = '12h' | '24h' | '48h' | 'never';

export const VALID_TTLS: readonly DeckTtl[] = ['12h', '24h', '48h', 'never'];

export function isValidTtl(value: unknown): value is DeckTtl {
  return typeof value === 'string' && (VALID_TTLS as readonly string[]).includes(value);
}

export function ttlToTimestamp(ttl: DeckTtl): Date {
  const now = Date.now();
  switch (ttl) {
    case '12h':
      return new Date(now + 12 * 60 * 60 * 1000);
    case '24h':
      return new Date(now + 24 * 60 * 60 * 1000);
    case '48h':
      return new Date(now + 48 * 60 * 60 * 1000);
    case 'never':
      return new Date(now + 365 * 24 * 60 * 60 * 1000);
  }
}
