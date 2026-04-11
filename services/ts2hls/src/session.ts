import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Session, StreamMode, Quality } from './types.js';

// GOP control shared by all transcoded presets. -g 48 + keyint_min 48 gives
// a 2-second max GOP at 24fps (tighter at higher framerates), matching
// -hls_time 2 so HLS segments line up with IDRs — fixes hls.js waiting for
// a keyframe on stream start and clean seeking on rewind. -sc_threshold 0
// disables scene-change-triggered extra IDRs so the cadence stays regular.
// Deliberately NOT setting -force_key_frames: it fights -g and can confuse
// libx264's rate control, causing occasional over-bitrate bursts.
const GOP_ARGS = [
  '-g', '48',
  '-keyint_min', '48',
  '-sc_threshold', '0',
];

// All transcoded presets use -preset veryfast. `ultrafast` looks significantly
// worse (no deblock filter, no B-frames, wider blocking artifacts) and the
// foundry-01 4108 handles veryfast fine even at 2160p for single-stream use.
// Bitrates target visually transparent output at each resolution. `pix_fmt
// yuv420p` is required for all current browser decoders.
function videoArgs(quality: Quality): string[] {
  switch (quality) {
    case 'source': return ['-c:v', 'copy'];
    case '2160p':  return ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...GOP_ARGS, '-vf', 'scale=-2:2160', '-b:v', '20000k', '-maxrate', '25000k', '-bufsize', '40000k'];
    case '1440p':  return ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...GOP_ARGS, '-vf', 'scale=-2:1440', '-b:v', '10000k', '-maxrate', '12500k', '-bufsize', '20000k'];
    case '1080p':  return ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...GOP_ARGS, '-vf', 'scale=-2:1080', '-b:v', '6000k',  '-maxrate', '7500k',  '-bufsize', '12000k'];
    case '720p':   return ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...GOP_ARGS, '-vf', 'scale=-2:720',  '-b:v', '3000k',  '-maxrate', '3750k',  '-bufsize', '6000k'];
    case '480p':   return ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...GOP_ARGS, '-vf', 'scale=-2:480',  '-b:v', '1500k',  '-maxrate', '1900k',  '-bufsize', '3000k'];
    case '360p':   return ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...GOP_ARGS, '-vf', 'scale=-2:360',  '-b:v', '800k',   '-maxrate', '1000k',  '-bufsize', '1600k'];
  }
}
import { startCommercialDetection } from './commercial-detect.js';

const HLS_ROOT = '/tmp/hls';
const IDLE_TIMEOUT_MS = 30_000;
const IDLE_CHECK_INTERVAL_MS = 10_000;
const SIGKILL_DELAY_MS = 5_000;

const sessions = new Map<string, Session>();
const processes = new Map<string, ChildProcess>();
const commercialAborts = new Map<string, AbortController>();

// Hostnames and IP literals that must never be used as a stream source.
// This is the first line of defense against SSRF — ffmpeg will be told to
// fetch the URL, so anything internal/loopback/link-local must be rejected.
const BLOCKED_HOST_LITERALS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::',
  '::1',
  'metadata.google.internal',
  '169.254.169.254', // AWS / GCP / Azure IMDS
]);

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(host: string): boolean {
  // Strip brackets and zone id
  const h = host.replace(/^\[|\]$/g, '').toLowerCase().split('%')[0];
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('fe80:')) return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique local
  return false;
}

// Optional allowlist of upstream hosts (comma-separated env var). When unset,
// any non-private host is allowed. When set, only listed hosts pass.
const ALLOWED_HOSTS: Set<string> | null = (() => {
  const raw = process.env.STREAM_ALLOWED_HOSTS;
  if (!raw) return null;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
})();

export function validateChannelUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOST_LITERALS.has(host)) return false;
  if (isPrivateIpv4(host)) return false;
  if (host.includes(':') && isBlockedIpv6(host)) return false;
  if (ALLOWED_HOSTS && !ALLOWED_HOSTS.has(host)) return false;

  return true;
}

/** Poll for a file to exist, resolving when it does or rejecting on timeout. */
function waitForFile(filePath: string, timeoutMs: number, pollMs = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (existsSync(filePath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for HLS playlist'));
      setTimeout(check, pollMs);
    };
    check();
  });
}

export async function createSession(
  channelUrl: string,
  mode: StreamMode = 'live',
  channelId?: string,
  quality: Quality = 'source',
): Promise<Session> {
  if (!validateChannelUrl(channelUrl)) {
    throw new Error('Invalid channel URL: only http:// and https:// schemes are allowed');
  }

  const sid = randomUUID();
  const hlsDir = join(HLS_ROOT, sid);
  const hlsUrl = `http://localhost:3103/hls/${sid}/index.m3u8`;

  // Create HLS output directory
  mkdirSync(hlsDir, { recursive: true });

  const isVod = mode === 'vod';

  // Input options
  const inputOpts = [
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-user_agent', 'IPTVSmarters',
    // Reconnect on upstream hiccup — IPTV providers drop TCP regularly
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_on_http_error', '4xx,5xx',
    '-reconnect_delay_max', '5',
    // Small probe — format ID is fast, full 2s probe is wasted startup latency
    '-analyzeduration', '500000',
    '-probesize', '500000',
  ];

  // Live: prefer low buffering on the input side.
  // VOD: let ffmpeg burst ahead at full speed so the first segment lands
  // fast. Using -re here broke startup — with 1x input pacing the first
  // 2s segment takes 2s real-time to emit, hls.js hits the empty initial
  // playlist and latches onto duration=0. The client-side
  // maxBufferLength: 30 cap prevents over-downloading regardless of how
  // fast the event playlist grows.
  if (!isVod) {
    inputOpts.push('-fflags', '+nobuffer+flush_packets');
  }

  // Output options differ by mode:
  //   live: 1s segments, small sliding window, delete_segments (low latency)
  //   vod : 2s segments, playlist grows from 0 (no sliding window race), no deletes
  const outputOpts = isVod
    ? [
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '0',
        // "event" playlist grows incrementally — every new segment is appended
        // and nothing is ever deleted. Unlike "vod" type, the playlist is
        // written throughout the session, not just at the end.
        '-hls_playlist_type', 'event',
        // temp_file ensures segments are atomically renamed from .tmp to
        // final name only when complete, so hls.js never reads a partial
        // segment mid-write (would show as buffering/stall on VOD).
        '-hls_flags', 'independent_segments+append_list+temp_file',
        '-hls_segment_type', 'mpegts',
      ]
    : [
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '150',
        // temp_file: write to segN.ts.tmp and atomic-rename to segN.ts only
        // when the segment is complete. Without this, hls.js can fetch a
        // segment while ffmpeg is still mid-write and the decoder shows
        // partial-data blockiness on the live edge (but clean on rewind
        // because the file is complete by the time you seek back to it).
        '-hls_flags', 'delete_segments+append_list+independent_segments+program_date_time+temp_file',
        '-hls_segment_type', 'mpegts',
      ];

  const args = [
    ...inputOpts,
    '-i', channelUrl,
    '-map', '0:v:0',
    ...videoArgs(quality),
    // Audio: re-encode to AAC 2ch — IPTV streams often ship AC3/EAC3 which browsers can't play.
    // `?` makes the stream optional so audio-less inputs don't fail.
    '-map', '0:a:0?',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    ...outputOpts,
    `${hlsDir}/index.m3u8`,
  ];

  // spawn with array args — no shell interpolation
  const proc = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  proc.stdout?.on('data', (data: Buffer) => {
    console.log(`[ffmpeg:${sid.slice(0, 8)}] ${data.toString().trimEnd()}`);
  });

  // Match "Stream #0:0[0x100]: Video: h264 ... 1920x1080 ..." in ffmpeg's
  // startup banner to learn the source resolution. Only capture once per
  // session — later log lines can mention other dimensions (thumbnails etc).
  const RES_RE = /Stream #0:.*Video:.*?(\d{2,5})x(\d{2,5})/;
  let resolutionCaptured = false;

  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    console.log(`[ffmpeg:${sid.slice(0, 8)}] ${text.trimEnd()}`);
    if (!resolutionCaptured) {
      const m = text.match(RES_RE);
      if (m) {
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          const s = sessions.get(sid);
          if (s) {
            s.sourceWidth = w;
            s.sourceHeight = h;
            console.log(`[session] ${sid.slice(0, 8)} source resolution ${w}x${h}`);
          }
          resolutionCaptured = true;
        }
      }
    }
  });

  proc.on('exit', (code, signal) => {
    console.log(`[session] ffmpeg exited for ${sid.slice(0, 8)} code=${code} signal=${signal}`);
    processes.delete(sid);
  });

  const session: Session = {
    sid,
    channelUrl,
    channelId,
    quality,
    hlsDir,
    hlsUrl,
    pid: proc.pid!,
    lastAccess: Date.now(),
  };

  sessions.set(sid, session);
  processes.set(sid, proc);

  console.log(`[session] created ${sid.slice(0, 8)} → ${channelUrl}`);

  // Commercial detection sidecar (opt-in). Only for live mode and only when
  // we know the channelId (otherwise we have nothing to tag signals with).
  if (
    process.env.ENABLE_COMMERCIAL_DETECTION === 'true' &&
    !isVod &&
    channelId
  ) {
    const ac = new AbortController();
    commercialAborts.set(sid, ac);
    startCommercialDetection({ channelId, inputUrl: channelUrl, signal: ac.signal });
  }

  // Wait for ffmpeg to produce the first playlist. The player also has retry
  // logic, so if ffmpeg is slower than the timeout we return anyway and let
  // the client handle warmup transparently.
  try {
    await waitForFile(join(hlsDir, 'index.m3u8'), 5_000);
    session.lastAccess = Date.now();
    console.log(`[session] ${sid.slice(0, 8)} HLS ready`);
  } catch {
    console.warn(`[session] ${sid.slice(0, 8)} HLS not ready after 5s — returning, player will retry`);
  }

  return session;
}

export function destroySession(sid: string): boolean {
  const session = sessions.get(sid);
  if (!session) return false;

  const ac = commercialAborts.get(sid);
  if (ac) {
    ac.abort();
    commercialAborts.delete(sid);
  }

  const hlsDir = session.hlsDir;
  const shortSid = sid.slice(0, 8);
  const proc = processes.get(sid);

  // Defer directory removal until ffmpeg has actually exited. rm'ing the
  // directory while ffmpeg is mid-write causes "failed to rename ... .tmp"
  // errors in the ffmpeg log and can corrupt the final segment hls.js is
  // trying to fetch, surfacing as "Video playback error" on the client.
  const cleanupDir = () => {
    try {
      if (existsSync(hlsDir)) {
        rmSync(hlsDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[session] cleanup ${shortSid} failed:`, (err as Error).message);
    }
  };

  if (proc && !proc.killed) {
    proc.once('exit', cleanupDir);
    proc.kill('SIGTERM');

    // Force kill after 5s if still alive
    const killTimer = setTimeout(() => {
      if (!proc.killed) {
        console.log(`[session] SIGKILL for ${shortSid} (SIGTERM timeout)`);
        proc.kill('SIGKILL');
      }
    }, SIGKILL_DELAY_MS);
    killTimer.unref();
  } else {
    cleanupDir();
  }

  sessions.delete(sid);
  processes.delete(sid);
  console.log(`[session] destroyed ${shortSid}`);
  return true;
}

export function getSession(sid: string): Session | undefined {
  return sessions.get(sid);
}

export function touchSession(sid: string): void {
  const session = sessions.get(sid);
  if (session) {
    session.lastAccess = Date.now();
  }
}

export function getActiveSessionCount(): number {
  return sessions.size;
}

export function destroyAllSessions(): void {
  const sids = [...sessions.keys()];
  for (const sid of sids) {
    destroySession(sid);
  }
}

// Idle cleanup: destroy sessions with no access for 30s
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startIdleCleanup(): void {
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, session] of sessions) {
      if (now - session.lastAccess > IDLE_TIMEOUT_MS) {
        console.log(`[session] idle timeout for ${sid.slice(0, 8)} (${Math.round((now - session.lastAccess) / 1000)}s)`);
        destroySession(sid);
      }
    }
  }, IDLE_CHECK_INTERVAL_MS);
  cleanupInterval.unref();
}

export function stopIdleCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
