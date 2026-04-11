// src/lib/ai/groq.ts
// Groq LLM client for semantic reranking of EPG search results.
// Falls back to original ordering when the API key is missing or Groq is unreachable.

import Groq from 'groq-sdk';

const RERANK_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 5_000;

const SYSTEM_PROMPT =
  'You are a TV program relevance ranker. Given a search query and a list of TV programs, ' +
  'return a JSON array of indices sorted by relevance to the query. Only return the JSON array, nothing else. ' +
  'Example: [2, 0, 4, 1, 3]';

interface RerankCandidate {
  title: string;
  description: string;
  category?: string;
}

function passthrough(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Rerank candidates by semantic relevance to query using Groq LLM.
 * Returns indices in order of relevance.
 * Falls back to original order if Groq is unreachable or API key missing.
 */
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<number[]> {
  if (!process.env.GROQ_API_KEY || candidates.length === 0) {
    return passthrough(candidates.length);
  }

  const programList = candidates
    .map((c, i) => {
      const parts = [c.title, c.description].filter(Boolean);
      if (c.category) parts.push(`[${c.category}]`);
      return `${i}. ${parts.join(' - ')}`;
    })
    .join('\n');

  const userPrompt =
    `Query: "${query}"\n\nPrograms:\n${programList}\n\n` +
    'Return the indices sorted by relevance as a JSON array:';

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const response = await Promise.race([
      groq.chat.completions.create({
        model: RERANK_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 256,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Groq rerank timeout')), TIMEOUT_MS),
      ),
    ]);

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.warn('[groq] Empty response from reranker');
      return passthrough(candidates.length);
    }

    // Extract JSON array from response (handle markdown fences or surrounding text)
    const match = content.match(/\[[\d\s,]+\]/);
    if (!match) {
      console.warn('[groq] Could not parse reranker response:', content);
      return passthrough(candidates.length);
    }

    const indices: unknown = JSON.parse(match[0]);
    if (!Array.isArray(indices)) {
      console.warn('[groq] Parsed response is not an array:', indices);
      return passthrough(candidates.length);
    }

    // Validate: every element must be a valid index
    const validIndices = indices.filter(
      (i): i is number =>
        typeof i === 'number' &&
        Number.isInteger(i) &&
        i >= 0 &&
        i < candidates.length,
    );

    // Append any missing indices to preserve all results
    const seen = new Set(validIndices);
    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) validIndices.push(i);
    }

    return validIndices;
  } catch (err) {
    console.error('[groq] Rerank failed, falling back to original order:', err);
    return passthrough(candidates.length);
  }
}
