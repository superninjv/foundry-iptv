'use client';

import { useEffect, useState, type FormEvent } from 'react';
import AddToDeckButton from '@/components/decks/AddToDeckButton';

// Inject spinner keyframes once
function useSpinnerStyle() {
  useEffect(() => {
    const id = 'ai-setup-spin';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }, []);
}

interface ResolvedMatch {
  query: string;
  channelId: string;
  channelName: string;
  matchSource: 'channel_name' | 'epg_program';
}

interface AiMultiviewResponse {
  channelIds: string[];
  layout: string | null;
  matches: ResolvedMatch[];
  unresolved: string[];
}

interface AiSetupProps {
  onSetup: (channelIds: string[], layout: string) => void;
}

type Phase = 'input' | 'loading' | 'results' | 'error';

export default function AiSetup({ onSetup }: AiSetupProps) {
  useSpinnerStyle();
  const [command, setCommand] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [result, setResult] = useState<AiMultiviewResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;

    setPhase('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/ai/multiview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as Record<string, string>).error || `Request failed (${res.status})`,
        );
      }

      const data: AiMultiviewResponse = await res.json();

      if (data.channelIds.length === 0) {
        setErrorMsg('No channels found matching your request. Try different terms.');
        setPhase('error');
        return;
      }

      setResult(data);
      setPhase('results');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('error');
    }
  }

  function handleConfirm() {
    if (!result) return;
    const layout = result.layout ?? '2x2';
    onSetup(result.channelIds, layout);
  }

  function handleReset() {
    setPhase('input');
    setResult(null);
    setErrorMsg('');
    setCommand('');
  }

  return (
    <div style={styles.container}>
      {phase === 'input' && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="What do you want to watch?"
            maxLength={500}
            autoFocus
            style={styles.input}
          />
          <button
            type="submit"
            disabled={!command.trim()}
            style={{
              ...styles.button,
              opacity: command.trim() ? 1 : 0.5,
            }}
          >
            Find Channels
          </button>
        </form>
      )}

      {phase === 'loading' && (
        <div style={styles.status}>
          <div style={styles.spinner} />
          <p style={styles.statusText}>Finding channels...</p>
        </div>
      )}

      {phase === 'results' && result && (
        <div style={styles.results}>
          <div style={styles.matchList}>
            <p style={styles.sectionLabel}>Found:</p>
            {result.matches.map((m) => (
              <div key={m.channelId} style={styles.matchRow}>
                <span style={styles.matchQuery}>{m.query}</span>
                <span style={styles.matchArrow}>&rarr;</span>
                <span style={styles.matchChannel}>{m.channelName}</span>
                {m.matchSource === 'epg_program' && (
                  <span style={styles.matchBadge}>EPG</span>
                )}
                <span style={{ marginLeft: 'auto' }}>
                  <AddToDeckButton
                    channelId={m.channelId}
                    channelName={m.channelName}
                    variant="icon"
                  />
                </span>
              </div>
            ))}
          </div>

          {result.unresolved.length > 0 && (
            <div style={styles.unresolvedBlock}>
              <p style={styles.sectionLabel}>Could not find:</p>
              <p style={styles.unresolvedList}>
                {result.unresolved.join(', ')}
              </p>
            </div>
          )}

          {result.layout && (
            <p style={styles.layoutInfo}>Layout: {result.layout}</p>
          )}

          <div style={styles.actionRow}>
            <button onClick={handleConfirm} style={styles.button}>
              Confirm
            </button>
            <button onClick={handleReset} style={styles.buttonSecondary}>
              Try Again
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div style={styles.errorBlock}>
          <p style={styles.errorText}>{errorMsg}</p>
          <button onClick={handleReset} style={styles.buttonSecondary}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 600,
    margin: '0 auto',
    padding: 24,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  input: {
    width: '100%',
    padding: '16px 20px',
    fontSize: 18,
    fontFamily: 'inherit',
    background: '#0e1218',
    color: '#e7ecf3',
    border: '1px solid #1a1f28',
    borderRadius: 8,
    outline: 'none',
  },
  button: {
    padding: '14px 24px',
    fontSize: 16,
    fontFamily: 'inherit',
    fontWeight: 600,
    color: '#07090c',
    background: '#ff9548',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 48,
  },
  buttonSecondary: {
    padding: '14px 24px',
    fontSize: 16,
    fontFamily: 'inherit',
    fontWeight: 600,
    color: '#8893a4',
    background: '#0e1218',
    border: '1px solid #1a1f28',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 48,
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '48px 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #1a1f28',
    borderTopColor: '#ff9548',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  statusText: {
    color: '#8893a4',
    fontSize: 16,
    margin: 0,
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  sectionLabel: {
    color: '#8893a4',
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: '0 0 8px 0',
  },
  matchList: {
    padding: 0,
  },
  matchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    borderBottom: '1px solid #1a1f28',
  },
  matchQuery: {
    color: '#e7ecf3',
    fontSize: 15,
  },
  matchArrow: {
    color: '#8893a4',
    fontSize: 14,
  },
  matchChannel: {
    color: '#ff9548',
    fontSize: 15,
    fontWeight: 500,
  },
  matchBadge: {
    color: '#8893a4',
    fontSize: 11,
    fontWeight: 600,
    background: '#1a1f28',
    padding: '2px 6px',
    borderRadius: 4,
    marginLeft: 4,
  },
  unresolvedBlock: {
    padding: 0,
  },
  unresolvedList: {
    color: '#8893a4',
    fontSize: 14,
    margin: 0,
  },
  layoutInfo: {
    color: '#8893a4',
    fontSize: 14,
    margin: 0,
  },
  actionRow: {
    display: 'flex',
    gap: 12,
    marginTop: 8,
  },
  errorBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '32px 0',
  },
  errorText: {
    color: '#e7ecf3',
    fontSize: 16,
    margin: 0,
    textAlign: 'center' as const,
  },
};
