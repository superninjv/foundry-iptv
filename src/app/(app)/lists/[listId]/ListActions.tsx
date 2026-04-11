'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Channel } from '@/lib/threadfin/types';

interface ListActionsProps {
  listId: string;
  listName: string;
  channels: Channel[];
  channelIds: string[];
  allChannels: Channel[];
}

export default function ListActions({
  listId,
  listName,
  channels,
  channelIds,
  allChannels,
}: ListActionsProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  async function handleRemoveChannel(channelId: string) {
    setRemoving(channelId);
    try {
      await fetch(`/api/lists/${listId}/channels`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  async function handleDeleteList() {
    if (!confirm(`Delete "${listName}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
      router.push('/lists');
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddChannel(channelId: string) {
    setAdding(channelId);
    try {
      await fetch(`/api/lists/${listId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      router.refresh();
    } finally {
      setAdding(null);
    }
  }

  // Filter available channels (not already in list)
  const existingIds = new Set(channelIds);
  const availableChannels = allChannels.filter(
    (ch) => !existingIds.has(ch.id),
  );
  const filteredAvailable = addSearch.trim()
    ? availableChannels.filter(
        (ch) =>
          ch.name.toLowerCase().includes(addSearch.toLowerCase()) ||
          ch.group.toLowerCase().includes(addSearch.toLowerCase()),
      )
    : availableChannels.slice(0, 50);

  return (
    <>
      {/* Channel list */}
      {channels.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{
            backgroundColor: 'var(--bg-raised)',
            borderColor: 'var(--border)',
          }}
        >
          <p style={{ color: 'var(--fg-muted)' }}>
            No channels in this list yet. Add some below.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch, idx) => (
            <div
              key={ch.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border)',
                minHeight: '48px',
              }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-medium"
                style={{
                  backgroundColor: 'var(--border)',
                  color: 'var(--fg-muted)',
                }}
              >
                {idx + 1}
              </span>
              {ch.logo && (
                <img
                  src={ch.logo}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded object-contain"
                  style={{ backgroundColor: '#fff' }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--fg)' }}>
                  {ch.name}
                </p>
                {ch.group && (
                  <p className="truncate text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {ch.group}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRemoveChannel(ch.id)}
                disabled={removing === ch.id}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-opacity disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--error)',
                  color: '#fff',
                  minHeight: '36px',
                }}
              >
                {removing === ch.id ? '...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add channel picker */}
      <div className="mt-6">
        <button
          onClick={() => setShowAddPicker(!showAddPicker)}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--fg)',
            backgroundColor: 'var(--bg-raised)',
            minHeight: '48px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {showAddPicker ? 'Close' : 'Add Channel'}
        </button>

        {showAddPicker && (
          <div className="mt-3">
            <input
              type="text"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Search channels..."
              className="mb-3 w-full rounded-lg border px-4 py-3 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
                minHeight: '48px',
              }}
              autoFocus
            />
            <div
              className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border)',
              }}
            >
              {filteredAvailable.length === 0 ? (
                <p className="p-3 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                  {addSearch.trim()
                    ? 'No matching channels found.'
                    : 'All channels are already in this list.'}
                </p>
              ) : (
                filteredAvailable.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => handleAddChannel(ch.id)}
                    disabled={adding === ch.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-40"
                    style={{
                      color: 'var(--fg)',
                      minHeight: '48px',
                    }}
                  >
                    {ch.logo && (
                      <img
                        src={ch.logo}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded object-contain"
                        style={{ backgroundColor: '#fff' }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{ch.name}</p>
                      {ch.group && (
                        <p className="truncate text-xs" style={{ color: 'var(--fg-muted)' }}>
                          {ch.group}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-xs font-medium"
                      style={{ color: 'var(--accent)' }}
                    >
                      {adding === ch.id ? 'Adding...' : '+ Add'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete list */}
      <div className="mt-10 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={handleDeleteList}
          disabled={deleting}
          className="rounded-lg border px-4 py-3 text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            borderColor: 'var(--error)',
            color: 'var(--error)',
            backgroundColor: 'transparent',
            minHeight: '48px',
          }}
        >
          {deleting ? 'Deleting...' : 'Delete This List'}
        </button>
      </div>
    </>
  );
}
