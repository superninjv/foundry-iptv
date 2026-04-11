'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';

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

    // Safari native HLS — use src swap for URL changes.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => onReady?.());
      video.addEventListener('error', () =>
        handleError('Video playback error'),
      );
      return;
    }

    if (!Hls.isSupported()) {
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

    // Live HLS needs DVR-friendly config (big back buffer, wide latency
    // tolerance so rewinds don't snap to live). VOD playback must NOT carry
    // those live settings: hls.js will otherwise keep trying to sync to the
    // "live edge" of the event playlist, which for VOD means the encoder's
    // head position — causing it to stall waiting for segments that haven't
    // been written yet and show very slow playback progress.
    const hls = isLive
      ? new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 150,
          backBufferLength: 300,
          liveDurationInfinity: true,
        })
      : new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Start at the beginning, not at the current encoder head.
          startPosition: 0,
          backBufferLength: 300,
          // Cap forward prefetch. Without these, ffmpeg (running -c:v copy
          // without -re) races ahead and hls.js greedily downloads every
          // segment the event playlist exposes, causing a visible stall as
          // the buffer suddenly jumps from 10s to 5+ minutes.
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
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
