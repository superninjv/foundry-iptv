'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface CellControlsProps {
  channelName: string;
  isFocused: boolean;
  onFocus: () => void;
  onRemove: () => void;
}

export function CellControls({
  channelName,
  isFocused,
  onFocus,
  onRemove,
}: CellControlsProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className="absolute inset-0"
      onClick={showControls}
      onTouchStart={showControls}
    >
      {/* Channel name label — always visible */}
      <div
        className="absolute left-2 top-2 rounded px-2 py-1 text-xs font-medium"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          color: 'var(--fg)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {channelName}
      </div>

      {/* Controls overlay — shown on interaction */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
        style={{
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Focus/audio button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
            showControls();
          }}
          className="flex items-center justify-center rounded-full transition-colors"
          style={{
            width: '56px',
            height: '56px',
            backgroundColor: isFocused
              ? 'var(--accent)'
              : 'rgba(255, 255, 255, 0.15)',
            color: isFocused ? 'var(--bg)' : 'var(--fg)',
          }}
          title={isFocused ? 'Audio active' : 'Switch audio here'}
        >
          {isFocused ? (
            // Speaker filled
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            // Speaker muted
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>

        {/* Remove button — top right */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: '48px',
            height: '48px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            color: 'var(--fg)',
          }}
          title="Remove channel"
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
    </div>
  );
}
