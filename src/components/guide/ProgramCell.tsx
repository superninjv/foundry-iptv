'use client';

import Link from 'next/link';
import type { EpgProgram } from '@/lib/threadfin/types';

interface ProgramCellProps {
  program: EpgProgram;
  pixelsPerMinute: number;
  timelineStart: Date;
  rowHeight: number;
}

export default function ProgramCell({
  program,
  pixelsPerMinute,
  timelineStart,
  rowHeight,
}: ProgramCellProps) {
  const startOffset =
    (new Date(program.start).getTime() - timelineStart.getTime()) / 60000;
  const durationMinutes =
    (new Date(program.end).getTime() - new Date(program.start).getTime()) / 60000;
  const left = Math.max(0, startOffset * pixelsPerMinute);
  const width = Math.max(20, durationMinutes * pixelsPerMinute - 2); // 2px gap

  const now = Date.now();
  const isNowPlaying =
    new Date(program.start).getTime() <= now && new Date(program.end).getTime() > now;

  return (
    <Link
      href={`/watch/${program.channelId}`}
      className="absolute top-0.5 flex items-center overflow-hidden rounded border px-2 text-xs transition-colors"
      style={{
        left,
        width,
        height: rowHeight - 4,
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
        borderLeftColor: isNowPlaying ? 'var(--accent)' : 'var(--border)',
        borderLeftWidth: isNowPlaying ? 3 : 1,
        color: 'var(--fg)',
      }}
      title={program.title}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
      }}
    >
      <span className="truncate">{program.title}</span>
    </Link>
  );
}
