// src/app/(app)/multiview/page.tsx
// Server component shell for multiview. Parses search params and renders the client grid.

import { requireAuth } from '@/lib/auth/session';
import { MultiviewGrid } from '@/components/multiview/MultiviewGrid';

type Layout = '2x2' | '3x3' | '1+3' | '2+4';
const VALID_LAYOUTS: Layout[] = ['2x2', '3x3', '1+3', '2+4'];

export default async function MultiviewPage({
  searchParams,
}: {
  searchParams: Promise<{ channels?: string; layout?: string }>;
}) {
  await requireAuth();

  const params = await searchParams;

  const channelIds = params.channels
    ? params.channels.split(',').filter((id) => id.trim().length > 0)
    : undefined;

  const layout =
    params.layout && VALID_LAYOUTS.includes(params.layout as Layout)
      ? (params.layout as Layout)
      : undefined;

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <MultiviewGrid initialChannelIds={channelIds} initialLayout={layout} />
    </div>
  );
}
