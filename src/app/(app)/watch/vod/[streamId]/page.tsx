'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import VideoPlayer from '@/components/player/VideoPlayer';
import PlayerOverlay from '@/components/player/PlayerOverlay';
import PlayerControls, { type Quality } from '@/components/player/PlayerControls';
import { useVideoProgress } from '@/lib/player/useVideoProgress';

const ALL_VOD_QUALITIES: ReadonlyArray<Quality> = ['source', '2160p', '1440p', '1080p', '720p', '480p', '360p'];
const QUALITY_HEIGHT: Record<Exclude<Quality, 'source'>, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
};
function availableQualities(sourceHeight: number | undefined): ReadonlyArray<Quality> {
  if (!sourceHeight || sourceHeight <= 0) return ALL_VOD_QUALITIES;
  return ALL_VOD_QUALITIES.filter((q) => q === 'source' || QUALITY_HEIGHT[q] <= sourceHeight);
}

interface StreamSession {
  sid: string;
  hlsUrl: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

interface VodMeta {
  name?: string;
  year?: string;
  duration?: string;
  rating?: string;
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function WatchVodPage() {
  const params = useParams<{ streamId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const streamId = params.streamId;
  const ext = searchParams.get('ext') || 'mp4';
  const type = searchParams.get('type') === 'series' ? 'series' : 'movie';
  const seriesId = searchParams.get('seriesId');
  const backHref = type === 'series'
    ? (seriesId ? `/series/${seriesId}` : '/series')
    : '/vod';

  const [stream, setStream] = useState<StreamSession | null>(null);
  const [meta, setMeta] = useState<VodMeta>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState<Quality>('source');

  const streamRef = useRef<StreamSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const progress = useVideoProgress(videoRef);

  const handleQualityChange = useCallback(
    async (q: Quality) => {
      setQuality(q);
      const prevSid = streamRef.current?.sid;
      try {
        const res = await fetch(`/api/stream/vod/${streamId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, ext, quality: q }),
        });
        if (!res.ok) return;
        const data = await res.json();
        streamRef.current = data;
        setStream(data);
        if (prevSid) {
          fetch(`/api/stream/vod/${streamId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid: prevSid }),
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // silent
      }
    },
    [streamId, type, ext],
  );

  useEffect(() => {
    if (!streamId) return;

    let cancelled = false;
    let createdSid: string | null = null;

    async function init() {
      setLoading(true);
      setError('');

      try {
        const historyMediaType = type === 'series' ? 'series' : 'vod';
        // History vodStreamId must match what iptv_vod_cache stores:
        // for series that's the PARENT series id (not the episode id),
        // for movies it's the movie stream id. Otherwise the /series
        // browse page's JOIN on vod_stream_id=stream_id yields nothing.
        const historyStreamId = type === 'series' && seriesId
          ? Number(seriesId)
          : Number(streamId);
        const metaUrl = type === 'series' ? null : `/api/vod/${streamId}`;

        const [res, , metaRes] = await Promise.all([
          fetch(`/api/stream/vod/${streamId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ext }),
          }),
          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mediaType: historyMediaType,
              vodStreamId: historyStreamId,
            }),
          }).catch(() => {}),
          metaUrl ? fetch(metaUrl).catch(() => null) : Promise.resolve(null),
        ]);

        if (cancelled) {
          if (res.ok) {
            const data = await res.json();
            if (data.sid) {
              fetch(`/api/stream/vod/${streamId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sid: data.sid }),
                keepalive: true,
              }).catch(() => {});
            }
          }
          return;
        }

        if (!res.ok) {
          setError('Failed to start stream. The item may be unavailable.');
          setLoading(false);
          return;
        }

        const data = await res.json();
        createdSid = data.sid;
        setStream(data);
        streamRef.current = data;

        if (metaRes && metaRes.ok) {
          try {
            const info = await metaRes.json();
            const i = info?.info || {};
            const md = info?.movie_data || {};
            setMeta({
              name: md.name || i.name,
              year: i.releasedate ? String(i.releasedate).slice(0, 4) : undefined,
              duration: i.duration,
              rating: i.rating,
            });
          } catch {}
        }

        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Failed to connect. Check your network.');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      const sid = createdSid || streamRef.current?.sid;
      if (sid) {
        fetch(`/api/stream/vod/${streamId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [streamId, type, ext]);

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => {
      playerContainerRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const handleBack = useCallback(() => {
    router.push(backHref);
  }, [router, backHref]);

  const handleFullscreen = useCallback(() => {
    playerContainerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#000' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p style={{ color: 'var(--fg-muted)' }}>Starting stream...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4" style={{ backgroundColor: '#000' }}>
        <p className="text-lg" style={{ color: 'var(--error)' }}>
          {error}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              router.refresh();
            }}
            className="rounded-lg px-6 py-3 font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
          >
            Try again
          </button>
          <Link
            href={backHref}
            className="rounded-lg px-6 py-3 font-medium"
            style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--fg)', border: '1px solid var(--border)' }}
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  const title = meta.name || (type === 'series' ? 'Episode' : 'Movie');
  const subtitleParts = [meta.year, meta.duration, meta.rating].filter(Boolean);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined;
  const pct =
    progress.duration > 0 ? Math.min(100, (progress.current / progress.duration) * 100) : 0;

  return (
    <div
      ref={playerContainerRef}
      tabIndex={-1}
      className="relative h-screen w-full outline-none"
      style={{ backgroundColor: '#000' }}
    >
      <PlayerOverlay
        title={title}
        subtitle={subtitle}
        onBack={handleBack}
        metaLeft={
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums" style={{ color: 'var(--fg-muted)' }}>
              {formatTime(progress.current)}
            </span>
            <div
              className="h-1 flex-1 overflow-hidden rounded"
              style={{ backgroundColor: 'var(--border)' }}
              aria-hidden
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent)',
                  transition: 'width 0.25s linear',
                }}
              />
            </div>
            <span className="text-xs tabular-nums" style={{ color: 'var(--fg-muted)' }}>
              {formatTime(progress.duration)}
            </span>
          </div>
        }
        controls={
          <PlayerControls
            videoRef={videoRef}
            isLive={false}
            quality={quality}
            qualityOptions={availableQualities(stream?.sourceHeight)}
            onQualityChange={handleQualityChange}
            onFullscreen={handleFullscreen}
          />
        }
        actionsRight={
          <Link
            href={backHref}
            tabIndex={0}
            className="overlay-focus rounded-lg px-4 py-2 text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-raised)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
            }}
          >
            Back to {type === 'series' ? 'series' : 'movies'}
          </Link>
        }
      >
        {stream && <VideoPlayer ref={videoRef} hlsUrl={stream.hlsUrl} isLive={false} onError={setError} />}
      </PlayerOverlay>
    </div>
  );
}
