import express from 'express';
import { createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import {
  createSession,
  destroySession,
  getSession,
  touchSession,
  getActiveSessionCount,
  destroyAllSessions,
  startIdleCleanup,
  stopIdleCleanup,
  validateChannelUrl,
} from './session.js';
import type { CreateSessionRequest, CreateSessionResponse, Quality } from './types.js';
import { VALID_QUALITIES } from './types.js';

const PORT = parseInt(process.env.PORT ?? '3103', 10);
// Bind to loopback only by default. Even though docker-compose runs with
// `network_mode: host`, listening on 127.0.0.1 keeps the service off the LAN
// — only Next.js (running on the same host) can reach it. Caddy reverse-
// proxies the public /hls/* path to localhost:3103 for browsers.
const HOST = process.env.HOST ?? '127.0.0.1';
const HLS_ROOT = '/tmp/hls';

// Shared secret for the Next.js → ts2hls hop. Required for /session create,
// destroy, and status. The /hls/:sid/* path stays open because the random
// session UUID is itself a capability token (and Caddy proxies it for
// browsers, which can't easily send custom headers for media segments).
const SHARED_SECRET = process.env.TS2HLS_SHARED_SECRET || '';
if (!SHARED_SECRET) {
  console.warn(
    '[ts2hls] WARNING: TS2HLS_SHARED_SECRET is not set — /session endpoints will reject all callers.',
  );
}

const app = express();

// No wildcard CORS. ts2hls is loopback-only and reached either by Next.js
// (server-to-server, no CORS involved) or via Caddy reverse proxy (same
// origin as the app). If a future client genuinely needs cross-origin
// access, add an explicit allowlist here — never `*` for an authed API.

app.use(express.json());

function requireSharedSecret(req: express.Request, res: express.Response): boolean {
  if (!SHARED_SECRET) {
    res.status(503).json({ error: 'ts2hls misconfigured: no shared secret' });
    return false;
  }
  const header = req.headers['authorization'];
  const expected = `Bearer ${SHARED_SECRET}`;
  if (typeof header !== 'string' || header !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', activeSessions: getActiveSessionCount() });
});

// Create session
app.post('/session', async (req, res) => {
  if (!requireSharedSecret(req, res)) return;
  const body = req.body as CreateSessionRequest | undefined;

  if (!body?.channelUrl || typeof body.channelUrl !== 'string') {
    res.status(400).json({ error: 'channelUrl is required' });
    return;
  }

  if (!validateChannelUrl(body.channelUrl)) {
    res.status(400).json({ error: 'Invalid channelUrl: only http:// and https:// schemes are allowed' });
    return;
  }

  const mode = body.mode === 'vod' ? 'vod' : 'live';

  // channelId is optional — only used to tag commercial-detection signals.
  // Validate shape (hex-ish id) loosely to avoid log injection.
  const channelId =
    typeof body.channelId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.channelId)
      ? body.channelId
      : undefined;

  let quality: Quality = 'source';
  if (body.quality !== undefined) {
    if (typeof body.quality !== 'string' || !VALID_QUALITIES.includes(body.quality as Quality)) {
      res.status(400).json({ error: `Invalid quality: must be one of ${VALID_QUALITIES.join(', ')}` });
      return;
    }
    quality = body.quality as Quality;
  }

  try {
    const session = await createSession(body.channelUrl, mode, channelId, quality);
    const response: CreateSessionResponse = {
      sid: session.sid,
      hlsUrl: session.hlsUrl,
      sourceWidth: session.sourceWidth,
      sourceHeight: session.sourceHeight,
    };
    res.status(201).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create session';
    res.status(500).json({ error: message });
  }
});

// Delete session
app.delete('/session/:sid', (req, res) => {
  if (!requireSharedSecret(req, res)) return;
  const { sid } = req.params;
  const destroyed = destroySession(sid);
  if (destroyed) {
    res.sendStatus(204);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Session status
app.get('/session/:sid/status', (req, res) => {
  if (!requireSharedSecret(req, res)) return;
  const { sid } = req.params;
  const session = getSession(sid);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    sid: session.sid,
    channelUrl: session.channelUrl,
    hlsUrl: session.hlsUrl,
    pid: session.pid,
    lastAccess: session.lastAccess,
    idleSeconds: Math.round((Date.now() - session.lastAccess) / 1000),
  });
});

// Serve HLS files
app.get('/hls/:sid/*', (req, res) => {
  const { sid } = req.params;
  const session = getSession(sid);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Touch session to prevent idle cleanup
  touchSession(sid);

  // Extract the file path after /hls/:sid/
  // req.params[0] contains the wildcard match
  const filePath = (req.params as Record<string, string>)[0];
  if (!filePath) {
    res.status(400).json({ error: 'File path required' });
    return;
  }

  // Prevent directory traversal
  const normalizedFile = filePath.replace(/\.\./g, '').replace(/\/+/g, '/');
  const fullPath = join(HLS_ROOT, sid, normalizedFile);

  // Ensure resolved path is within the session's HLS directory
  if (!fullPath.startsWith(join(HLS_ROOT, sid))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Set content type based on extension
    const ext = extname(fullPath).toLowerCase();
    if (ext === '.m3u8') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (ext === '.ts') {
      res.setHeader('Content-Type', 'video/mp2t');
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Length', stat.size);

    const stream = createReadStream(fullPath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`[ts2hls] listening on ${HOST}:${PORT}`);
  startIdleCleanup();
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[ts2hls] received ${signal}, shutting down...`);
  stopIdleCleanup();
  destroyAllSessions();
  server.close(() => {
    console.log('[ts2hls] server closed');
    process.exit(0);
  });
  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('[ts2hls] forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
