// src/app/api/channels/categories/route.ts
import { NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getCategoriesWithCounts } from '@/lib/threadfin/client';

/**
 * Returns `{ categories: Array<{ name, count }> }`. The richer shape lets the
 * native FireStick client render category badges without a second round-trip
 * to fetch the full channel list. Derived from the same in-memory / Redis
 * cached channel list used by `/api/channels`, so no extra upstream fetch.
 *
 * The web app does not consume this endpoint directly (server components use
 * `getCategories()` from `@/lib/threadfin/client` which still returns
 * `string[]`) — only the Rust client and any future JSON callers rely on this
 * shape.
 */
export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const categories = await getCategoriesWithCounts();
  return NextResponse.json(
    { categories },
    {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
      },
    },
  );
}
