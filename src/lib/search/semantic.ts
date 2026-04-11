// src/lib/search/semantic.ts
// AI-enhanced unified search: channels + EPG + VOD → Groq LLM reranking.

import {
  searchChannels,
  searchEpg,
  searchVod,
  type EpgSearchResult,
  type VodSearchResult,
} from './text';
import { rerank } from '@/lib/ai/groq';
import type { Channel } from '@/lib/threadfin/types';

const RESULT_LIMIT = 20;

export interface AiSearchResults {
  channels: Channel[];
  programs: EpgSearchResult[];
  vod: VodSearchResult[];
}

/**
 * AI-enhanced unified search.
 * 1. Parallel: search channels (in-memory) + EPG (pg_trgm) + VOD (pg_trgm)
 * 2. Merge into a single candidate list with type labels
 * 3. Groq reranks the combined set by semantic relevance
 * 4. Split back into typed results
 */
export async function aiSearch(query: string): Promise<AiSearchResults> {
  // Parallel retrieval from all sources
  const [channels, programs, vod] = await Promise.all([
    searchChannels(query),
    searchEpg(query, 20),
    searchVod(query, 20),
  ]);

  // Build combined candidate list for Groq
  type TaggedCandidate = { type: 'channel' | 'program' | 'vod'; index: number };
  const tagged: TaggedCandidate[] = [];
  const rerankInput: { title: string; description: string; category?: string }[] = [];

  for (let i = 0; i < channels.length && tagged.length < 40; i++) {
    tagged.push({ type: 'channel', index: i });
    rerankInput.push({
      title: `[LIVE] ${channels[i].name}`,
      description: `Live TV channel in ${channels[i].group}`,
      category: channels[i].group,
    });
  }

  for (let i = 0; i < programs.length && tagged.length < 40; i++) {
    tagged.push({ type: 'program', index: i });
    rerankInput.push({
      title: `[NOW/UPCOMING] ${programs[i].title}`,
      description: programs[i].description || '',
      category: programs[i].category,
    });
  }

  for (let i = 0; i < vod.length && tagged.length < 40; i++) {
    tagged.push({ type: 'vod', index: i });
    rerankInput.push({
      title: `[${vod[i].mediaType === 'movie' ? 'MOVIE' : 'SERIES'}] ${vod[i].name}`,
      description: vod[i].plot || '',
      category: vod[i].genre,
    });
  }

  if (tagged.length === 0) return { channels: [], programs: [], vod: [] };

  // Groq reranks the combined set
  const rankedIndices = await rerank(query, rerankInput);

  // Split back into typed results in ranked order
  const result: AiSearchResults = { channels: [], programs: [], vod: [] };
  let count = 0;

  for (const idx of rankedIndices) {
    if (count >= RESULT_LIMIT) break;
    const entry = tagged[idx];
    if (!entry) continue;

    switch (entry.type) {
      case 'channel':
        result.channels.push(channels[entry.index]);
        break;
      case 'program':
        result.programs.push(programs[entry.index]);
        break;
      case 'vod':
        result.vod.push(vod[entry.index]);
        break;
    }
    count++;
  }

  return result;
}
