// src/components/player/hls-config.ts
// HLS.js configuration presets split by platform.
//
// Fire TV Silk runs on a constrained ARM SoC (~1 GB usable RAM for the browser)
// with flaky Web Worker support. Reducing buffer sizes keeps the MSE budget
// inside Silk's ~100-200 MB limit and avoids the GC stalls that cause visible
// stuttering during channel-grid navigation.

import type { HlsConfig } from 'hls.js';

/** HLS config optimised for Amazon Fire TV Silk browser. */
export function getFireTvHlsConfig(): Partial<HlsConfig> {
  return {
    // Worker threads are unreliable on Silk — disable to avoid silent crashes.
    enableWorker: false,
    lowLatencyMode: false,
    // Smaller back buffer keeps MSE allocations inside Silk's ~40 MB guard.
    backBufferLength: 45,
    maxBufferSize: 40 * 1024 * 1024,
    maxBufferLength: 20,
    // Live sync: stay 3 segments behind live edge, tolerate up to 10.
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    liveDurationInfinity: true,
    // Aggressive retry for flaky LAN connections.
    fragLoadingMaxRetry: 8,
    fragLoadingRetryDelay: 1500,
  };
}

/** HLS config for desktop browsers with relaxed memory constraints. */
export function getDesktopHlsConfig(): Partial<HlsConfig> {
  return {
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 120,
    maxBufferSize: 120 * 1024 * 1024,
    maxBufferLength: 60,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    liveDurationInfinity: true,
  };
}

/**
 * Pick the right HLS config at runtime by sniffing the User-Agent.
 * Called client-side only (navigator is not available on the server).
 */
export function pickHlsConfig(): Partial<HlsConfig> {
  if (typeof navigator !== 'undefined' && /Silk|AFT|Fire TV/i.test(navigator.userAgent)) {
    return getFireTvHlsConfig();
  }
  return getDesktopHlsConfig();
}
