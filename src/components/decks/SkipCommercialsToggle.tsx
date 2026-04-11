'use client';

import { useState, useCallback } from 'react';

interface SkipCommercialsToggleProps {
  deckId: number;
  initialValue: boolean;
  variant?: 'pill' | 'icon';
}

export default function SkipCommercialsToggle({
  deckId,
  initialValue,
  variant = 'pill',
}: SkipCommercialsToggleProps) {
  const [enabled, setEnabled] = useState(initialValue);

  const onClick = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    fetch(`/api/decks/${deckId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skipCommercials: next }),
    })
      .then((res) => {
        if (!res.ok) {
          setEnabled(!next);
          console.error(`SkipCommercialsToggle: PATCH failed with ${res.status}`);
        }
      })
      .catch((err) => {
        setEnabled(!next);
        console.error('SkipCommercialsToggle: PATCH error', err);
      });
  }, [deckId, enabled]);

  const strokeColor = enabled ? 'var(--accent)' : 'var(--fg-muted)';

  const icon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="5" y1="5" x2="19" y2="19" />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        tabIndex={0}
        aria-pressed={enabled}
        title={enabled ? 'Skip ads on' : 'Skip ads off'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '6px',
          backgroundColor: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
        }}
        onFocus={(e) => {
          e.currentTarget.style.outline = '2px solid var(--accent)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = 'none';
        }}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={0}
      aria-pressed={enabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: enabled ? 'rgba(248, 113, 113, 0.15)' : 'var(--bg-raised)',
        color: enabled ? '#f87171' : 'var(--fg-muted)',
        border: `1px solid ${enabled ? '#f87171' : 'var(--border)'}`,
        cursor: 'pointer',
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid var(--accent)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none';
      }}
    >
      {icon}
      <span>{enabled ? 'Skip ads ON' : 'Skip ads OFF'}</span>
    </button>
  );
}
