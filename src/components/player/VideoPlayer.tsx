'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { pickHlsConfig } from './hls-config';

interface VideoPlayerProps {
  hlsUrl: string;
  muted?: boolean;
  controls?: boolean;
  isLive?: boolean;
  onReady?: () => void;
  onError?: (error: string) => void;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(function VideoPlayer(
  { hlsUrl, muted, controls, isLive = true, onReady, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

  const handleError = useCallback(
    (msg: string) => {
      onError?.(msg);
    },
    [onError],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Prefer hls.js over native wherever MSE is available. Fire TV Silk
    // reports canPlayType('application/vnd.apple.mpegurl') = "maybe" via
    // Amazon's patched platform decoder, but the native path is flaky:
    // it has no retry on transient segment 404s, no quality switching via
    // loadSource, and emits a bare `error` event with no recovery info.
    // Desktop Safari is the only environment where native HLS is actually
    // better than hls.js, so only fall back to native when MSE is absent.
    if (!Hls.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => onReady?.());
        video.addEventListener('error', () =>
          handleError('Video playback error'),
        );
        return;
      }
      handleError('HLS is not supported in this browser');
      return;
    }

    // Reuse the existing Hls instance if possible — `loadSource` swaps the
    // manifest in place without tearing down the MediaSource. This makes
    // quality switches flicker-free.
    if (hlsRef.current) {
      hlsRef.current.loadSource(hlsUrl);
      hlsRef.current.startLoad();
      return;
    }

    // Live HLS needs DVR-friendly config (wide latency tolerance so rewinds
    // don't snap to live). VOD must NOT carry those live settings: hls.js
    // will otherwise keep trying to sync to the event playlist's "live edge"
    // (the encoder head) and stall waiting for segments that don't exist yet.
    //
    // Platform-specific buffer limits come from pickHlsConfig() — Fire TV
    // Silk gets tight values inside its ~100-200 MB MSE budget; desktop gets
    // relaxed values. We override liveMaxLatencyDurationCount to 150 on live
    // streams so scrubbing back into the DVR window doesn't snap forward.
    const platformConfig = pickHlsConfig();
    const hls = isLive
      ? new Hls({
          ...platformConfig,
          lowLatencyMode: false,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 150,
          liveDurationInfinity: true,
        })
      : new Hls({
          ...platformConfig,
          lowLatencyMode: false,
          // Start at the beginning, not at the current encoder head.
          startPosition: 0,
          liveDurationInfinity: false,
          // Cap forward prefetch. Without these, ffmpeg (running -c:v copy
          // without -re) races ahead and hls.js greedily downloads every
          // segment the event playlist exposes, causing a visible stall as
          // the buffer suddenly jumps from 10s to 5+ minutes.
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });

    hlsRef.current = hls;

    hls.loadSource(hlsUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
      onReady?.();
    });

    let networkRetries = 0;
    const MAX_NETWORK_RETRIES = 8;

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            networkRetries++;
            if (networkRetries <= MAX_NETWORK_RETRIES) {
              setTimeout(() => hls.startLoad(), 1500);
            } else {
              handleError('Network error — stream may be offline');
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            handleError('Fatal playback error');
            hls.destroy();
            hlsRef.current = null;
            break;
        }
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [hlsUrl, onReady, handleError]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !!muted;
    }
  }, [muted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      controls={controls}
      className="h-full w-full"
      style={{ backgroundColor: '#000' }}
    />
  );
});

export default VideoPlayer;
