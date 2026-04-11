import { spawn, type ChildProcess } from 'node:child_process';

// TODO: v1 thresholds are a crude guess. Tune with real Sabres-game data —
// quiet dialogue scenes will false-positive on silence, and loud ads with
// no scene cuts will false-negative on black frames. Consider per-channel
// calibration once we have ground-truth annotations.

const SILENCE_MIN_DURATION_SEC = 1.0;
const BLACK_MIN_DURATION_SEC = 0.5;
const END_OF_BREAK_IDLE_MS = 30_000;

type DetectionSource = 'silence' | 'blackframe';

interface StartOpts {
  channelId: string;
  inputUrl: string;
  signal: AbortSignal;
}

interface DetectState {
  inCommercial: boolean;
  lastSource: DetectionSource | null;
  endTimer: ReturnType<typeof setTimeout> | null;
}

function logPrefix(channelId: string): string {
  return `[commdetect:${channelId.slice(0, 8)}]`;
}

async function postSignal(
  channelId: string,
  inCommercial: boolean,
  confidence: number,
  source: DetectionSource,
): Promise<void> {
  const base = process.env.FOUNDRY_API_URL;
  const token = process.env.TS2HLS_BEARER_TOKEN;
  if (!base || !token) {
    console.debug(`${logPrefix(channelId)} signal skipped — FOUNDRY_API_URL or TS2HLS_BEARER_TOKEN unset`);
    return;
  }
  try {
    const res = await fetch(`${base}/api/signals/commercial`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channelId, inCommercial, confidence, source }),
    });
    if (!res.ok) {
      // 404 expected until the sibling track lands — don't spam error logs.
      console.debug(`${logPrefix(channelId)} signal POST ${res.status}`);
    }
  } catch (err) {
    console.debug(`${logPrefix(channelId)} signal POST failed: ${(err as Error).message}`);
  }
}

function parseDuration(line: string): number | null {
  const m = line.match(/silence_duration:\s*([\d.]+)/) || line.match(/black_duration:\s*([\d.]+)/);
  return m ? parseFloat(m[1]!) : null;
}

export function startCommercialDetection(opts: StartOpts): ChildProcess | null {
  const { channelId, inputUrl, signal } = opts;
  const prefix = logPrefix(channelId);

  const args = [
    '-hide_banner',
    '-nostats',
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-user_agent', 'IPTVSmarters',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_delay_max', '5',
    '-i', inputUrl,
    // Combined pass: blackdetect on video, silencedetect on audio, null sink.
    '-filter_complex', '[0:v]blackdetect=d=0.1:pic_th=0.95,nullsink[v];[0:a]silencedetect=n=-50dB:d=0.5,anullsink[a]',
    '-f', 'null',
    '-',
  ];

  let proc: ChildProcess;
  try {
    proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
  } catch (err) {
    console.error(`${prefix} failed to spawn ffmpeg: ${(err as Error).message}`);
    return null;
  }

  console.log(`${prefix} started commercial detection pid=${proc.pid}`);

  const state: DetectState = { inCommercial: false, lastSource: null, endTimer: null };

  const scheduleEnd = () => {
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = setTimeout(() => {
      if (state.inCommercial) {
        state.inCommercial = false;
        const src = state.lastSource ?? 'silence';
        console.log(`${prefix} commercial END (idle 30s) source=${src}`);
        void postSignal(channelId, false, 1.0, src);
      }
    }, END_OF_BREAK_IDLE_MS);
    state.endTimer.unref();
  };

  const enterCommercial = (source: DetectionSource, confidence: number) => {
    state.lastSource = source;
    if (!state.inCommercial) {
      state.inCommercial = true;
      console.log(`${prefix} commercial START source=${source} confidence=${confidence}`);
      void postSignal(channelId, true, confidence, source);
    }
    scheduleEnd();
  };

  let buf = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      handleLine(line);
    }
  });

  function handleLine(line: string): void {
    if (line.includes('silence_end')) {
      const dur = parseDuration(line);
      if (dur !== null && dur >= SILENCE_MIN_DURATION_SEC) {
        const confidence = Math.min(0.5 + dur / 10, 0.95);
        enterCommercial('silence', confidence);
      }
    } else if (line.includes('black_end') || line.includes('blackdetect')) {
      const dur = parseDuration(line);
      if (dur !== null && dur >= BLACK_MIN_DURATION_SEC) {
        const confidence = Math.min(0.6 + dur / 5, 0.95);
        enterCommercial('blackframe', confidence);
      }
    }
  }

  proc.on('exit', (code, sig) => {
    console.log(`${prefix} ffmpeg exited code=${code} signal=${sig}`);
    if (state.endTimer) clearTimeout(state.endTimer);
  });

  proc.on('error', (err) => {
    console.error(`${prefix} ffmpeg error: ${err.message}`);
  });

  const abort = () => {
    if (state.endTimer) clearTimeout(state.endTimer);
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 3000).unref();
    }
  };

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener('abort', abort, { once: true });
  }

  return proc;
}

// Exported for unit-style tracing of the line parser.
export const __testing = { parseDuration };
