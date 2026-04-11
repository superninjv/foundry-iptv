'use client';

import { useEffect, useState, type RefObject } from 'react';

interface VideoProgressState {
  current: number;
  duration: number;
  seekable: { start: number; end: number };
}

export function useVideoProgress(
  videoRef: RefObject<HTMLVideoElement | null>,
): VideoProgressState {
  const [state, setState] = useState<VideoProgressState>({
    current: 0,
    duration: 0,
    seekable: { start: 0, end: 0 },
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function update() {
      if (!video) return;
      let seekable = { start: 0, end: 0 };
      try {
        if (video.seekable && video.seekable.length > 0) {
          const s = video.seekable.start(0);
          const e = video.seekable.end(0);
          seekable = {
            start: Number.isFinite(s) ? s : 0,
            end: Number.isFinite(e) ? e : 0,
          };
        }
      } catch {
        // ignore
      }
      setState({
        current: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        seekable,
      });
    }

    video.addEventListener('timeupdate', update);
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('durationchange', update);
    video.addEventListener('progress', update);
    video.addEventListener('seeked', update);
    update();

    return () => {
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('durationchange', update);
      video.removeEventListener('progress', update);
      video.removeEventListener('seeked', update);
    };
  }, [videoRef]);

  return state;
}
