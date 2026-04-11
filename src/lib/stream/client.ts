// src/lib/stream/client.ts
// ts2hls sidecar HTTP client. Manages HLS transcode sessions.
// All session endpoints require a shared bearer secret — ts2hls is loopback-
// only on the host but the secret stops any local process from spawning
// ffmpeg as the iptv user via the API.

const TS2HLS_URL = process.env.TS2HLS_URL || 'http://localhost:3103';
const TS2HLS_SHARED_SECRET = process.env.TS2HLS_SHARED_SECRET || '';

export type StreamMode = 'live' | 'vod';

export type Quality = 'source' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p';
export const VALID_QUALITIES: readonly Quality[] = ['source', '2160p', '1440p', '1080p', '720p', '480p', '360p'] as const;

function authHeaders(): Record<string, string> {
  if (!TS2HLS_SHARED_SECRET) {
    throw new Error('TS2HLS_SHARED_SECRET is not set');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TS2HLS_SHARED_SECRET}`,
  };
}

export async function createSession(
  channelUrl: string,
  mode: StreamMode = 'live',
  channelId?: string,
  quality?: Quality,
): Promise<{ sid: string; hlsUrl: string; sourceWidth?: number; sourceHeight?: number }> {
  const res = await fetch(`${TS2HLS_URL}/session`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ channelUrl, mode, channelId, ...(quality ? { quality } : {}) }),
  });
  if (!res.ok) throw new Error(`ts2hls error: ${res.status}`);
  return res.json();
}

export async function destroySession(sid: string): Promise<void> {
  await fetch(`${TS2HLS_URL}/session/${sid}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).catch(() => {});
}
