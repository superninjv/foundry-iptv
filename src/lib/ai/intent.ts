// src/lib/ai/intent.ts
// AI intent parser: extracts multiview intent from natural language commands.

import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 5_000;

const SYSTEM_PROMPT = `You are an IPTV assistant. Parse the user's command and extract:
1. "queries": a list of search terms (team names, channel names, show names, event names) the user wants to watch
2. "layout": the grid layout if specified ("2x2", "3x3", "1+3", "2+4"), or null if not specified

Return a JSON object: {"queries": ["term1", "term2"], "layout": "2x2"}
Only return the JSON, nothing else.

Examples:
- "show me Patriots, Lakers, Arsenal, Yankees" → {"queries": ["Patriots", "Lakers", "Arsenal", "Yankees"], "layout": null}
- "pull up CNN and Fox News in a 2x2" → {"queries": ["CNN", "Fox News"], "layout": "2x2"}
- "I want to watch the NBA games tonight" → {"queries": ["NBA"], "layout": null}
- "put on ESPN, TNT, and NBCSN" → {"queries": ["ESPN", "TNT", "NBCSN"], "layout": null}`;

export interface MultiviewIntent {
  action: 'multiview';
  queries: string[];
  layout?: string; // '2x2', '3x3', '1+3', '2+4'
}

/**
 * Parse a natural language command into a structured multiview intent.
 * Returns null if the command cannot be parsed or Groq is unavailable.
 */
export async function parseIntent(
  command: string,
): Promise<MultiviewIntent | null> {
  if (!process.env.GROQ_API_KEY) {
    console.warn('[intent] GROQ_API_KEY not set, cannot parse intent');
    return null;
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const response = await Promise.race([
      groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: command },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Groq intent parse timeout')), TIMEOUT_MS),
      ),
    ]);

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.warn('[intent] Empty response from Groq');
      return null;
    }

    // Extract JSON object from response (handle markdown fences or surrounding text)
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[intent] Could not extract JSON from response:', content);
      return null;
    }

    const parsed: unknown = JSON.parse(match[0]);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).queries)
    ) {
      console.warn('[intent] Invalid parsed structure:', parsed);
      return null;
    }

    const obj = parsed as { queries: unknown[]; layout?: unknown };

    // Validate queries: must be non-empty array of strings
    const queries = obj.queries
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      .map((q) => q.trim());

    if (queries.length === 0) {
      console.warn('[intent] No valid queries extracted');
      return null;
    }

    // Validate layout
    const validLayouts = ['2x2', '3x3', '1+3', '2+4'];
    let layout: string | undefined;
    if (typeof obj.layout === 'string' && validLayouts.includes(obj.layout)) {
      layout = obj.layout;
    } else {
      // Auto-pick based on query count
      layout = autoLayout(queries.length);
    }

    return { action: 'multiview', queries, layout };
  } catch (err) {
    console.error('[intent] Failed to parse intent:', err);
    return null;
  }
}

/** Auto-pick layout based on number of channels. */
export function autoLayout(count: number): string | undefined {
  if (count <= 1) return undefined;
  if (count <= 4) return '2x2';
  return '3x3';
}
