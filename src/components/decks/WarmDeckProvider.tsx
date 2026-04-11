'use client';

// src/components/decks/WarmDeckProvider.tsx
// Warm-stream pool for deck and multiview pages.
//
// Keeps one hls.js instance + off-DOM <video> per channel alive for instant
// focus-swap. Only the active entry is unmuted/unpaused; warm entries buffer
// at low quality in the background.
//
// Cap: 6 streams on desktop, 4 on Fire TV (MSE budget ~600 MB total).
// LRU eviction drops the least-recently-focused entry when over cap.
// The currently-active entry is never evicted.

import Hls from 'hls.js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { pickHlsConfig } from '@/components/player/hls-config';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface WarmStreamHandle {
  channelId: string;
  sessionId: string;
  hlsUrl: string;
  hls: Hls | null;
  video: HTMLVideoElement;
  state: 'warming' | 'ready' | 'active' | 'error';
  quality: 'low' | 'medium' | 'high';
  lastFocusedAt: number;
}

export interface WarmDeckContextValue {
  ensureWarm(channelId: string, preferredQuality?: 'low' | 'medium' | 'high'): Promise<WarmStreamHandle>;
  promote(channelId: string): Promise<void>;
  demote(channelId: string): Promise<void>;
  drop(channelId: string): Promise<void>;
  getHandle(channelId: string): WarmStreamHandle | undefined;
  attachVideo(channelId: string, slot: HTMLElement | null): void;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function isFireTv(): boolean {
  return typeof navigator !== 'undefined' && /Silk|AFT|Fire TV/i.test(navigator.userAgent);
}

function getWarmCap(configCap: number | null): number {
  const defaultCap = isFireTv() ? 4 : 6;
  return configCap ?? defaultCap;
}

/** Maps our simple quality names to the ts2hls Quality type. */
const QUALITY_MAP: Record<'low' | 'medium' | 'high', string> = {
  low: '480p',
  medium: '720p',
  high: '1080p',
};

// --------------------------------------------------------------------------
// Context
// --------------------------------------------------------------------------

const WarmDeckContext = createContext<WarmDeckContextValue | null>(null);

export function useWarmDeck(): WarmDeckContextValue {
  const ctx = useContext(WarmDeckContext);
  if (!ctx) throw new Error('useWarmDeck must be used inside <WarmDeckProvider>');
  return ctx;
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

interface WarmDeckProviderProps {
  children: ReactNode;
  /** Override the warm-stream cap (e.g. from iptv_config.warm_stream_cap). */
  cap?: number;
}

export function WarmDeckProvider({ children, cap }: WarmDeckProviderProps) {
  const handles = useRef<Map<string, WarmStreamHandle>>(new Map());
  const capRef = useRef<number>(getWarmCap(cap ?? null));
  const activeChannelRef = useRef<string | null>(null);

  // Keep cap ref updated if prop changes
  useEffect(() => {
    capRef.current = getWarmCap(cap ?? null);
  }, [cap]);

  // ---- cleanup on unmount -----------------------------------------------
  useEffect(() => {
    return () => {
      for (const [channelId, handle] of handles.current) {
        _destroyHandle(handle, channelId);
      }
      handles.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- internal helpers --------------------------------------------------

  function _destroyHandle(handle: WarmStreamHandle, channelId: string) {
    handle.hls?.destroy();
    // Remove from DOM if attached
    if (handle.video.parentNode) {
      handle.video.parentNode.removeChild(handle.video);
    }
    // Best-effort DELETE — use keepalive fetch so it survives page unload
    const { sessionId } = handle;
    if (sessionId) {
      try {
        fetch(`/api/stream/${channelId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid: sessionId }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Best-effort; sendBeacon can't do DELETE with a body recognized by
        // our route, so keepalive fetch is the fallback.
      }
    }
  }

  function _evictLru(exceptChannelId: string) {
    const map = handles.current;
    if (map.size <= capRef.current) return;

    // Find LRU entry excluding the one we just ensured
    let lruId: string | null = null;
    let lruTime = Infinity;
    for (const [id, h] of map) {
      if (id === exceptChannelId) continue;
      if (id === activeChannelRef.current) continue; // never evict active
      if (h.lastFocusedAt < lruTime) {
        lruTime = h.lastFocusedAt;
        lruId = id;
      }
    }
    if (lruId) {
      const h = map.get(lruId)!;
      _destroyHandle(h, lruId);
      map.delete(lruId);
      console.log(`[warm-deck] evicted ${lruId.slice(0, 8)} (LRU)`);
    }
  }

  // ---- public API --------------------------------------------------------

  const ensureWarm = useCallback(
    async (channelId: string, preferredQuality: 'low' | 'medium' | 'high' = 'low'): Promise<WarmStreamHandle> => {
      const existing = handles.current.get(channelId);
      if (existing) return existing;

      // POST to create a ts2hls session at low quality
      const tsQuality = QUALITY_MAP[preferredQuality];
      const res = await fetch(`/api/stream/${channelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality: tsQuality }),
      });
      if (!res.ok) throw new Error(`[warm-deck] failed to start stream for ${channelId}`);
      const { sid, hlsUrl } = await res.json();

      // Create an off-DOM video element
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;
      video.preload = 'auto';

      const handle: WarmStreamHandle = {
        channelId,
        sessionId: sid,
        hlsUrl,
        hls: null,
        video,
        state: 'warming',
        quality: preferredQuality,
        lastFocusedAt: Date.now(),
      };
      handles.current.set(channelId, handle);

      // Instantiate hls.js with warm-friendly buffer limits
      const hlsConfig = {
        ...pickHlsConfig(),
        backBufferLength: 10,
        maxBufferLength: 15,
      };
      const hls = new Hls(hlsConfig);
      handle.hls = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.once(Hls.Events.MANIFEST_PARSED, () => {
        // Muted autoplay is allowed on Silk — keep buffering
        video.play().catch(() => {});
        handle.state = 'ready';
        console.log(`[warm-deck] ready ${channelId.slice(0, 8)}`);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          console.error(`[warm-deck] fatal HLS error for ${channelId.slice(0, 8)}:`, data);
          handle.state = 'error';
        }
      });

      // LRU eviction after adding
      _evictLru(channelId);

      return handle;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const promote = useCallback(async (channelId: string): Promise<void> => {
    const handle = handles.current.get(channelId);
    if (!handle) return;

    activeChannelRef.current = channelId;
    handle.lastFocusedAt = Date.now();
    handle.state = 'active';

    // Request high quality from ts2hls
    try {
      performance.mark('deck:promote-start');
      const res = await fetch(`/api/stream/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: handle.sessionId, quality: QUALITY_MAP.high }),
      });
      if (res.ok) {
        handle.quality = 'high';
        const { hlsUrl: newUrl } = await res.json();
        // If URL changed, reload source; hls.js will reconnect to the same URL
        // (ffmpeg respawns in the same dir, URL is stable)
        if (newUrl && newUrl !== handle.hlsUrl) {
          handle.hlsUrl = newUrl;
          handle.hls?.loadSource(newUrl);
        }
      }
    } catch (err) {
      console.warn('[warm-deck] quality promote failed:', err);
    }

    // Unmute and play
    handle.video.muted = false;
    handle.video.play().catch(() => {});

    // Reconfigure hls.js with active-mode buffer limits
    if (handle.hls) {
      // hls.js config fields that are readable at runtime
      (handle.hls.config as Record<string, unknown>).backBufferLength = isFireTv() ? 45 : 120;
      (handle.hls.config as Record<string, unknown>).maxBufferLength = isFireTv() ? 20 : 60;
    }
  }, []);

  const demote = useCallback(async (channelId: string): Promise<void> => {
    const handle = handles.current.get(channelId);
    if (!handle) return;

    if (activeChannelRef.current === channelId) {
      activeChannelRef.current = null;
    }
    handle.state = 'ready';

    // Request low quality from ts2hls
    try {
      const res = await fetch(`/api/stream/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: handle.sessionId, quality: QUALITY_MAP.low }),
      });
      if (res.ok) handle.quality = 'low';
    } catch (err) {
      console.warn('[warm-deck] quality demote failed:', err);
    }

    // Mute and reduce buffer
    handle.video.muted = true;
    handle.video.pause();

    if (handle.hls) {
      (handle.hls.config as Record<string, unknown>).backBufferLength = 10;
      (handle.hls.config as Record<string, unknown>).maxBufferLength = 15;
    }
  }, []);

  const drop = useCallback(async (channelId: string): Promise<void> => {
    const handle = handles.current.get(channelId);
    if (!handle) return;
    _destroyHandle(handle, channelId);
    handles.current.delete(channelId);
    if (activeChannelRef.current === channelId) {
      activeChannelRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getHandle = useCallback((channelId: string): WarmStreamHandle | undefined => {
    return handles.current.get(channelId);
  }, []);

  const attachVideo = useCallback((channelId: string, slot: HTMLElement | null): void => {
    const handle = handles.current.get(channelId);
    if (!handle) return;
    const { video } = handle;

    if (slot) {
      // Move video into the visible slot if not already there
      if (video.parentNode !== slot) {
        if (video.parentNode) video.parentNode.removeChild(video);
        slot.appendChild(video);
        // Ensure video fills the slot
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.display = 'block';
      }
    } else {
      // Remove from DOM (demote scenario)
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    }
  }, []);

  const value: WarmDeckContextValue = {
    ensureWarm,
    promote,
    demote,
    drop,
    getHandle,
    attachVideo,
  };

  return (
    <WarmDeckContext.Provider value={value}>
      {children}
    </WarmDeckContext.Provider>
  );
}

// --------------------------------------------------------------------------
// useWarmStream hook
// --------------------------------------------------------------------------

/**
 * Per-tile hook. Ensures the stream is warm, promotes when isActive becomes
 * true, demotes when it becomes false. Returns an attachSlot callback to
 * place the video element into the tile's DOM.
 */
export function useWarmStream(
  channelId: string,
  isActive: boolean,
  preferredQuality: 'low' | 'medium' | 'high' = 'low',
): {
  handle: WarmStreamHandle | null;
  attachSlot: (el: HTMLElement | null) => void;
} {
  const { ensureWarm, promote, demote, attachVideo, getHandle } = useWarmDeck();
  const handleRef = useRef<WarmStreamHandle | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Warm on mount
  useEffect(() => {
    let cancelled = false;
    ensureWarm(channelId, preferredQuality).then((h) => {
      if (cancelled) return;
      handleRef.current = h;
      // If already active by the time the promise resolves, promote immediately
      if (isActiveRef.current) {
        promote(channelId);
      }
    }).catch((err) => {
      console.error('[warm-deck] ensureWarm failed:', err);
    });
    return () => {
      cancelled = true;
      // Do NOT drop on unmount — provider manages the pool lifecycle
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Promote / demote on isActive flip
  useEffect(() => {
    const h = getHandle(channelId);
    if (!h) return; // not warmed yet; the ensureWarm callback above handles it
    if (isActive) {
      promote(channelId);
    } else {
      demote(channelId);
    }
  }, [isActive, channelId, promote, demote, getHandle]);

  const attachSlot = useCallback(
    (el: HTMLElement | null) => {
      attachVideo(channelId, el);
    },
    [attachVideo, channelId],
  );

  return {
    handle: handleRef.current ?? getHandle(channelId) ?? null,
    attachSlot,
  };
}
