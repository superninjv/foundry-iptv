'use client';

import { useState, useEffect, useRef } from 'react';

interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
}

interface ChannelPickerProps {
  onSelect: (channelId: string) => void;
  onClose: () => void;
  excludeIds: string[];
}

export function ChannelPicker({ onSelect, onClose, excludeIds }: ChannelPickerProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/channels');
        if (!res.ok) return;
        const { channels: data } = await res.json();
        setChannels(data || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Auto-focus search input
  useEffect(() => {
    // Small delay for modal animation
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const filtered = channels.filter((ch) => {
    if (excludeIds.includes(ch.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      ch.name.toLowerCase().includes(q) ||
      ch.group.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border"
        style={{
          backgroundColor: 'var(--bg-raised)',
          borderColor: 'var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
            Add Channel
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              minWidth: '48px',
              minHeight: '48px',
              color: 'var(--fg-muted)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg)',
              borderColor: 'var(--border)',
              color: 'var(--fg)',
              minHeight: '48px',
            }}
          />
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
              {search ? 'No matching channels' : 'No channels available'}
            </div>
          ) : (
            <div className="py-1">
              {filtered.slice(0, 100).map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => onSelect(ch.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{
                    color: 'var(--fg)',
                    minHeight: '48px',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      'transparent';
                  }}
                >
                  {ch.logo ? (
                    <img
                      src={ch.logo}
                      alt=""
                      className="h-8 w-8 rounded object-contain"
                      style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded text-xs font-bold"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--fg-muted)',
                      }}
                    >
                      {ch.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{ch.name}</div>
                    {ch.group && (
                      <div
                        className="truncate text-xs"
                        style={{ color: 'var(--fg-muted)' }}
                      >
                        {ch.group}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              {filtered.length > 100 && (
                <div
                  className="px-4 py-3 text-center text-xs"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  Showing 100 of {filtered.length} channels. Refine your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
