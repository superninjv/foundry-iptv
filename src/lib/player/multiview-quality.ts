import type { Quality } from '@/lib/stream/client';

export type MultiviewLayout = '2x2' | '3x3' | '1+3' | '2+4';

// Opt out of server-side transcoding for the heavy layouts. Set
// NEXT_PUBLIC_MULTIVIEW_LOW_CPU=true in .env.local on boxes that can't keep
// up with 6+ concurrent ffmpeg transcodes (e.g. the foundry-01 Xeon 4108
// until the Gold 6146s land). Flipping this drops 3x3 and 2+4 back to source
// passthrough so the browser handles scaling.
const PREFER_LOW_CPU = process.env.NEXT_PUBLIC_MULTIVIEW_LOW_CPU === 'true';

export function qualityForLayout(layout: MultiviewLayout): Quality {
  if (PREFER_LOW_CPU && (layout === '3x3' || layout === '2+4')) {
    return 'source';
  }
  switch (layout) {
    case '2x2': return '720p';
    case '1+3': return '720p';
    case '3x3': return '480p';
    case '2+4': return '480p';
  }
}
