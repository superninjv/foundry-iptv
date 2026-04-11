'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import VideoPlayer from '@/components/player/VideoPlayer';
import PlayerOverlay from '@/components/player/PlayerOverlay';
import PlayerControls, { type Quality } from '@/components/player/PlayerControls';
import AddToDeckButton from '@/components/decks/AddToDeckButton';

const ALL_QUALITY_OPTIONS: ReadonlyArray<Quality> = ['source', '2160p', '1440p', '1080p', '720p', '480p', '360p'];

const QUALITY_HEIGHT: Record<Exclude<Quality, 'source'>, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
};

function availableQualities(sourceHeight: number | undefined): ReadonlyArray<Quality> {
  if (!sourceHeight || sourceHeight <= 0) return ALL_QUALITY_OPTIONS;
  return ALL_QUALITY_OPTIONS.filter((q) => q === 'source' || QUALITY_HEIGHT[q] <= sourceHeight);
}

interface StreamSession {
  sid: string;
  hlsUrl: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

interface ChannelInfo {
  id: string;
  name: string;
  logo: string;
}

interface NowNextInfo {
  now?: { title: string };
  next?: { title: string };
}

export default function WatchPage() {
  const params = useParams<{ channelId: string }>();
  const router = useRouter();
  const channelId = params.channelId;

  const [stream, setStream] = useState<StreamSession | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [nowNext, setNowNext] = useState<NowNextInfo>({});
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState<Quality>('source');

  const streamRef = useRef<StreamSession | null>(null);
  const channelIdRef = useRef(channelId);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize stream session + cleanup on unmount (single effect to avoid strict-mode race)
  useEffect(() => {
    if (!channelId) return;

    let cancelled = false;
    let createdSid: string | null = null;

    async function init() {
      setLoading(true);
      setError('');

      try {
        // Fetch channel info, create stream, get EPG, record history, check favorites — in parallel
        const [channelsRes, streamRes, epgRes, , favRes] = await Promise.all([
          fetch('/api/channels'),
          fetch(`/api/stream/${channelId}`, { method: 'POST' }),
          fetch(`/api/epg/${channelId}`),
          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId }),
          }),
          fetch('/api/favorites'),
        ]);

        if (cancelled) {
          // Effect was cleaned up while we were loading — destroy the session we just created
          if (streamRes.ok) {
            const data = await streamRes.json();
            if (data.sid) {
              fetch(`/api/stream/${channelId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sid: data.sid }),
                keepalive: true,
              }).catch(() => {});
            }
          }
          return;
        }

        // Channel info
        if (channelsRes.ok) {
          const data = await channelsRes.json();
          const ch = data.channels?.find((c: ChannelInfo) => c.id === channelId);
          if (ch) setChannel(ch);
        }

        // Stream session
        if (!streamRes.ok) {
          setError('Failed to start stream. The channel may be unavailable.');
          setLoading(false);
          return;
        }
        const streamData = await streamRes.json();
        createdSid = streamData.sid;
        setStream(streamData);
        streamRef.current = streamData;

        // EPG now/next
        if (epgRes.ok) {
          const epgData = await epgRes.json();
          const programs = epgData.programs || [];
          const now = Date.now();
          let currentProg: { title: string } | undefined;
          let nextProg: { title: string } | undefined;

          for (let i = 0; i < programs.length; i++) {
            const p = programs[i];
            const start = new Date(p.start).getTime();
            const end = new Date(p.end).getTime();
            if (start <= now && end > now) {
              currentProg = { title: p.title };
              if (programs[i + 1]) nextProg = { title: programs[i + 1].title };
              break;
            }
            if (start > now) {
              nextProg = { title: p.title };
              break;
            }
          }
          setNowNext({ now: currentProg, next: nextProg });
        }

        // Favorites check
        if (favRes.ok) {
          const favData = await favRes.json();
          setIsFavorite((favData.favorites || []).includes(channelId));
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
      // Destroy the session we created (if any)
      const sid = createdSid || streamRef.current?.sid;
      if (sid) {
        fetch(`/api/stream/${channelId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [channelId]);

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => {
      playerContainerRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const handleQualityChange = useCallback(
    async (q: Quality) => {
      setQuality(q);
      const prevSid = streamRef.current?.sid;
      try {
        // Create-before-destroy: spin up the new session first so VideoPlayer
        // can `loadSource` swap in place, then tear down the old one. Hides
        // the ffmpeg startup gap.
        const res = await fetch(`/api/stream/${channelId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quality: q }),
        });
        if (!res.ok) return;
        const data = await res.json();
        streamRef.current = data;
        setStream(data);
        if (prevSid) {
          fetch(`/api/stream/${channelId}`, {
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
    [channelId],
  );

  const handleFullscreen = useCallback(() => {
    playerContainerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const toggleFavorite = useCallback(async () => {
    const method = isFavorite ? 'DELETE' : 'POST';
    try {
      await fetch('/api/favorites', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      setIsFavorite(!isFavorite);
    } catch {
      // Silent fail
    }
  }, [channelId, isFavorite]);

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
        <button
          onClick={() => router.push('/live')}
          className="rounded-lg px-6 py-3 font-medium"
          style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--fg)', border: '1px solid var(--border)' }}
        >
          Back to channels
        </button>
      </div>
    );
  }

  const channelName = channel?.name || 'Unknown channel';

  return (
    <div
      ref={playerContainerRef}
      tabIndex={-1}
      className="relative h-screen w-full outline-none"
      style={{ backgroundColor: '#000' }}
    >
      <PlayerOverlay
        title={channelName}
        subtitle={nowNext.now?.title}
        metaLeft={
          <div>
            {nowNext.now && (
              <p className="text-lg font-medium" style={{ color: 'var(--fg)' }}>
                {nowNext.now.title}
              </p>
            )}
            {nowNext.next && (
              <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
                Up next: {nowNext.next.title}
              </p>
            )}
          </div>
        }
        controls={
          <PlayerControls
            videoRef={videoRef}
            isLive
            quality={quality}
            qualityOptions={availableQualities(stream?.sourceHeight)}
            onQualityChange={handleQualityChange}
            onFullscreen={handleFullscreen}
          />
        }
        actionsRight={
          <>
            <button
              onClick={toggleFavorite}
              tabIndex={0}
              className="overlay-focus rounded-full p-2 transition-colors"
              style={{ color: isFavorite ? 'var(--accent)' : 'var(--fg-muted)' }}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorite ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              )}
            </button>
            <AddToDeckButton channelId={channelId} channelName={channelName} variant="icon" />
          </>
        }
      >
        {stream && <VideoPlayer ref={videoRef} hlsUrl={stream.hlsUrl} onError={setError} />}
      </PlayerOverlay>
    </div>
  );
}
