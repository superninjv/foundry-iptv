'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useVideoProgress } from '@/lib/player/useVideoProgress';

export type Quality = 'source' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p';

interface PlayerControlsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isLive: boolean;
  quality?: Quality;
  qualityOptions?: ReadonlyArray<Quality>;
  onQualityChange?: (q: Quality) => void;
  onFullscreen?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function qualityLabel(q: Quality): string {
  return q === 'source' ? 'Source' : q;
}

export default function PlayerControls({
  videoRef,
  isLive,
  quality = 'source',
  qualityOptions,
  onQualityChange,
  onFullscreen,
}: PlayerControlsProps) {
  const progress = useVideoProgress(videoRef);
  const [paused, setPaused] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const qPopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setPaused(v.paused);
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [videoRef]);

  useEffect(() => {
    if (!qOpen) return;
    function onDoc(e: MouseEvent) {
      if (!qPopRef.current) return;
      if (!qPopRef.current.contains(e.target as Node)) setQOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setQOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [qOpen]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, [videoRef]);

  const skip = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      const start = v.seekable.length > 0 ? v.seekable.start(0) : 0;
      const end = v.seekable.length > 0 ? v.seekable.end(0) : v.duration || 0;
      const target = Math.max(start, Math.min(end, v.currentTime + delta));
      v.currentTime = target;
    },
    [videoRef],
  );

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Number(e.target.value);
    },
    [videoRef],
  );

  const jumpToLive = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = progress.seekable.end;
  }, [videoRef, progress.seekable.end]);

  const handleFullscreen = useCallback(() => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }
    const v = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }, [videoRef, onFullscreen]);

  const min = progress.seekable.start;
  const max = progress.seekable.end;
  const value = Math.max(min, Math.min(max, progress.current));
  const haveRange = max > min;

  let timeLabel: string;
  if (isLive) {
    const offset = Math.max(0, max - value);
    timeLabel = `−${formatTime(offset)} / LIVE`;
  } else {
    timeLabel = `${formatTime(value)} / ${formatTime(progress.duration || max)}`;
  }

  const showJumpToLive = isLive && haveRange && max - value > 2;
  const showQuality = !!(qualityOptions && qualityOptions.length > 0 && onQualityChange);

  const btnStyle: React.CSSProperties = {
    minWidth: 40,
    minHeight: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-raised)',
    color: 'var(--fg)',
    cursor: 'pointer',
  };

  return (
    <div
      className="flex items-center gap-3"
      style={{ marginTop: 12, width: '100%' }}
    >
      <button
        type="button"
        onClick={() => skip(-10)}
        tabIndex={0}
        aria-label="Rewind 10 seconds"
        title="Rewind 10s"
        className="overlay-focus"
        style={btnStyle}
        disabled={!haveRange}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="11 17 6 12 11 7" />
          <polyline points="18 17 13 12 18 7" />
        </svg>
      </button>

      <button
        type="button"
        onClick={togglePlay}
        tabIndex={0}
        aria-label={paused ? 'Play' : 'Pause'}
        className="overlay-focus"
        style={btnStyle}
      >
        {paused ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={() => skip(10)}
        tabIndex={0}
        aria-label="Fast-forward 10 seconds"
        title="Forward 10s"
        className="overlay-focus"
        style={btnStyle}
        disabled={!haveRange}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
      </button>

      <input
        type="range"
        min={min}
        max={haveRange ? max : 1}
        step={0.1}
        value={haveRange ? value : 0}
        onChange={handleScrub}
        disabled={!haveRange}
        tabIndex={0}
        aria-label="Seek"
        className="overlay-focus"
        style={{
          flex: 1,
          minWidth: 0,
          height: 6,
          accentColor: 'var(--accent)',
          cursor: haveRange ? 'pointer' : 'default',
        }}
      />

      <span
        className="tabular-nums"
        style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}
      >
        {timeLabel}
      </span>

      {showJumpToLive && (
        <button
          type="button"
          onClick={jumpToLive}
          tabIndex={0}
          aria-label="Jump to live"
          className="overlay-focus"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 36,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg-raised)',
            color: 'var(--fg)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 999,
              background: '#dc2626',
            }}
          />
          LIVE
        </button>
      )}

      {showQuality && (
        <div style={{ position: 'relative' }} ref={qPopRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setQOpen((v) => !v);
            }}
            tabIndex={0}
            aria-label="Quality"
            className="overlay-focus"
            style={{
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--bg-raised)',
              color: 'var(--fg)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {qualityLabel(quality)}
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M5 8l5 5 5-5z" />
            </svg>
          </button>
          {qOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                right: 0,
                zIndex: 50,
                minWidth: 120,
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 6,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                color: 'var(--fg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {qualityOptions!.map((q) => {
                const selected = q === quality;
                return (
                  <button
                    key={q}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onQualityChange?.(q);
                      setQOpen(false);
                    }}
                    tabIndex={0}
                    className="overlay-focus"
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: selected ? 'var(--accent)' : 'transparent',
                      background: selected ? 'rgba(255,149,72,0.1)' : 'transparent',
                      color: 'var(--fg)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {qualityLabel(q)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleFullscreen}
        tabIndex={0}
        aria-label="Fullscreen"
        className="overlay-focus"
        style={btnStyle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9V5a1 1 0 0 1 1-1h4" />
          <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
          <path d="M4 15v4a1 1 0 0 0 1 1h4" />
          <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
        </svg>
      </button>
    </div>
  );
}
