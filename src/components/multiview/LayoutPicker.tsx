'use client';

interface LayoutPickerProps {
  layout: string;
  onLayoutChange: (layout: string) => void;
}

const layouts = [
  {
    value: '2x2',
    label: '2x2',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="9" height="9" rx="1" />
        <rect x="13" y="2" width="9" height="9" rx="1" />
        <rect x="2" y="13" width="9" height="9" rx="1" />
        <rect x="13" y="13" width="9" height="9" rx="1" />
      </svg>
    ),
  },
  {
    value: '3x3',
    label: '3x3',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="5.5" height="5.5" rx="0.5" />
        <rect x="9.25" y="2" width="5.5" height="5.5" rx="0.5" />
        <rect x="16.5" y="2" width="5.5" height="5.5" rx="0.5" />
        <rect x="2" y="9.25" width="5.5" height="5.5" rx="0.5" />
        <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="0.5" />
        <rect x="16.5" y="9.25" width="5.5" height="5.5" rx="0.5" />
        <rect x="2" y="16.5" width="5.5" height="5.5" rx="0.5" />
        <rect x="9.25" y="16.5" width="5.5" height="5.5" rx="0.5" />
        <rect x="16.5" y="16.5" width="5.5" height="5.5" rx="0.5" />
      </svg>
    ),
  },
  {
    value: '1+3',
    label: '1+3',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="14" height="20" rx="1" />
        <rect x="18" y="2" width="4" height="6" rx="0.5" />
        <rect x="18" y="9.5" width="4" height="5" rx="0.5" />
        <rect x="18" y="16" width="4" height="6" rx="0.5" />
      </svg>
    ),
  },
  {
    value: '2+4',
    label: '2+4',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="9" height="12" rx="1" />
        <rect x="13" y="2" width="9" height="12" rx="1" />
        <rect x="2" y="16" width="4.5" height="6" rx="0.5" />
        <rect x="7.5" y="16" width="4.5" height="6" rx="0.5" />
        <rect x="13" y="16" width="4.5" height="6" rx="0.5" />
        <rect x="18.5" y="16" width="3.5" height="6" rx="0.5" />
      </svg>
    ),
  },
];

export function LayoutPicker({ layout, onLayoutChange }: LayoutPickerProps) {
  return (
    <div className="flex items-center gap-1">
      {layouts.map((l) => {
        const active = layout === l.value;
        return (
          <button
            key={l.value}
            onClick={() => onLayoutChange(l.value)}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              minWidth: '48px',
              minHeight: '48px',
              backgroundColor: active
                ? 'rgba(255, 149, 72, 0.15)'
                : 'transparent',
              color: active ? 'var(--accent)' : 'var(--fg-muted)',
            }}
            title={l.label}
          >
            {l.icon}
          </button>
        );
      })}
    </div>
  );
}
