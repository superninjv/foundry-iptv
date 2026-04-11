'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddIcon } from '@/components/icons';

type Ttl = '12h' | '24h' | '48h' | 'never';
const TTLS: Ttl[] = ['12h', '24h', '48h', 'never'];

interface DeckSummary {
  id: number;
  name: string;
  entryCount: number;
}

interface AddToDeckButtonProps {
  channelId: string;
  channelName?: string;
  variant?: 'button' | 'icon';
  className?: string;
}

type Phase = 'idle' | 'loading' | 'ready' | 'saving' | 'done' | 'error';

export default function AddToDeckButton({
  channelId,
  channelName,
  variant = 'button',
  className,
}: AddToDeckButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [ttl, setTtl] = useState<Ttl>('24h');
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [showNewDeck, setShowNewDeck] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const loadDecks = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const res = await fetchWithRetry('/api/decks');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setError('Could not load decks');
        setPhase('error');
        return;
      }
      const data = await res.json();
      const list: DeckSummary[] = data.decks || [];
      setDecks(list);
      setSelectedDeckId(list[0]?.id ?? null);
      setShowNewDeck(list.length === 0);
      setPhase('ready');
    } catch {
      setError('Network error');
      setPhase('error');
    }
  }, [router]);

  useEffect(() => {
    if (!open) return;
    loadDecks();
  }, [open, loadDecks]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function createDeckInline() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setError('Could not create deck');
        return;
      }
      const data = await res.json();
      const id = Number(data.id);
      const next: DeckSummary = { id, name, entryCount: 0 };
      setDecks((prev) => [next, ...prev]);
      setSelectedDeckId(id);
      setShowNewDeck(false);
      setNewName('');
    } catch {
      setError('Network error');
    }
  }

  async function addEntry() {
    if (selectedDeckId === null) return;
    setPhase('saving');
    setError('');
    try {
      const res = await fetchWithRetry(
        `/api/decks/${selectedDeckId}/entries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, ttl }),
        },
      );
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setError('Could not add to deck');
        setPhase('ready');
        return;
      }
      setPhase('done');
      setTimeout(() => {
        setOpen(false);
        setPhase('idle');
      }, 900);
    } catch {
      setError('Network error');
      setPhase('ready');
    }
  }

  const triggerLabel = channelName ? `Add ${channelName} to deck` : 'Add to deck';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={className}
        aria-label={triggerLabel}
        title={triggerLabel}
        style={
          variant === 'icon'
            ? {
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
              }
            : {
                minHeight: 40,
                padding: '0 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-raised)',
                color: 'var(--fg)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }
        }
      >
        <AddIcon size={18} aria-hidden />
        {variant === 'button' && <span>Deck</span>}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Add to deck"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 50,
            width: 280,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            color: 'var(--fg)',
          }}
        >
          <p
            style={{
              margin: '2px 0 10px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--fg-muted)',
            }}
          >
            Add to deck
          </p>

          {phase === 'loading' && (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>Loading…</p>
          )}

          {phase === 'error' && (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--error)' }}>
                {error || 'Something went wrong'}
              </p>
              <button
                type="button"
                onClick={loadDecks}
                style={secondaryBtn}
              >
                Retry
              </button>
            </>
          )}

          {(phase === 'ready' || phase === 'saving' || phase === 'done') && (
            <>
              {decks.length > 0 && !showNewDeck && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    maxHeight: 160,
                    overflowY: 'auto',
                    marginBottom: 8,
                  }}
                >
                  {decks.map((d) => {
                    const selected = d.id === selectedDeckId;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDeckId(d.id)}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '1px solid',
                          borderColor: selected ? 'var(--accent)' : 'transparent',
                          background: selected ? 'rgba(255,149,72,0.1)' : 'transparent',
                          color: 'var(--fg)',
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {d.name}
                        </span>
                        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
                          {d.entryCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {showNewDeck ? (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Deck name"
                    autoFocus
                    maxLength={80}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        createDeckInline();
                      }
                    }}
                    style={{
                      flex: 1,
                      minHeight: 36,
                      padding: '0 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--fg)',
                      fontSize: 14,
                    }}
                  />
                  <button
                    type="button"
                    onClick={createDeckInline}
                    disabled={!newName.trim()}
                    style={{ ...secondaryBtn, opacity: newName.trim() ? 1 : 0.5 }}
                  >
                    Create
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewDeck(true)}
                  style={{
                    ...secondaryBtn,
                    width: '100%',
                    marginBottom: 10,
                  }}
                >
                  + New deck
                </button>
              )}

              <div style={{ marginBottom: 10 }}>
                <p
                  style={{
                    margin: '0 0 6px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--fg-muted)',
                  }}
                >
                  Expires
                </p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {TTLS.map((t) => {
                    const selected = t === ttl;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTtl(t)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: '1px solid',
                          borderColor: selected ? 'var(--accent)' : 'var(--border)',
                          background: selected ? 'var(--accent)' : 'transparent',
                          color: selected ? 'var(--bg)' : 'var(--fg)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--error)' }}>
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={addEntry}
                disabled={
                  selectedDeckId === null || phase === 'saving' || phase === 'done'
                }
                style={{
                  width: '100%',
                  minHeight: 40,
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: selectedDeckId === null ? 0.5 : 1,
                }}
              >
                {phase === 'done'
                  ? 'Added'
                  : phase === 'saving'
                    ? 'Adding…'
                    : 'Add'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    return await fetch(url, init);
  }
}
