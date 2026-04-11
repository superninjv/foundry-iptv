// src/lib/ai/resolve.ts
// Resolve a parsed multiview intent into concrete channel IDs.

import type { MultiviewIntent } from '@/lib/ai/intent';
import { autoLayout } from '@/lib/ai/intent';
import { searchChannels, searchEpg } from '@/lib/search/text';

export interface ResolvedMatch {
  query: string;
  channelId: string;
  channelName: string;
  matchSource: 'channel_name' | 'epg_program';
}

export interface ResolvedMultiview {
  channelIds: string[];
  layout: string | null;
  matches: ResolvedMatch[];
  unresolved: string[];
}

/**
 * Resolve each query in the intent to a channel ID.
 * Tries channel name match first, then EPG program search.
 * Deduplicates channels and auto-picks layout if not specified.
 */
export async function resolveMultiviewIntent(
  intent: MultiviewIntent,
): Promise<ResolvedMultiview> {
  const matches: ResolvedMatch[] = [];
  const unresolved: string[] = [];
  const seenChannelIds = new Set<string>();

  for (const q of intent.queries) {
    // 1. Search channels by name
    const channels = await searchChannels(q);
    const queryLower = q.toLowerCase();

    if (channels.length > 0) {
      // Check if top result is a good match (name contains query)
      const best = channels[0];
      if (best.name.toLowerCase().includes(queryLower)) {
        if (!seenChannelIds.has(best.id)) {
          seenChannelIds.add(best.id);
          matches.push({
            query: q,
            channelId: best.id,
            channelName: best.name,
            matchSource: 'channel_name',
          });
        }
        continue;
      }
    }

    // 2. Search EPG programs for something airing now/soon
    try {
      const programs = await searchEpg(q, 5);
      if (programs.length > 0) {
        // Pick the best program whose channel isn't already added
        const program = programs.find((p) => !seenChannelIds.has(p.channelId));
        if (program) {
          seenChannelIds.add(program.channelId);
          matches.push({
            query: q,
            channelId: program.channelId,
            channelName: program.title,
            matchSource: 'epg_program',
          });
          continue;
        }
      }
    } catch (err) {
      console.warn('[resolve] EPG search failed for query:', q, err);
    }

    // 3. No match found
    unresolved.push(q);
  }

  const channelIds = matches.map((m) => m.channelId);

  // Determine layout
  let layout: string | null = intent.layout ?? autoLayout(channelIds.length) ?? null;

  // Single channel = no multiview layout
  if (channelIds.length <= 1) {
    layout = null;
  }

  return { channelIds, layout, matches, unresolved };
}
