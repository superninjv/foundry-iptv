'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Channel, EpgProgram } from '@/lib/threadfin/types';
import TimeAxis from './TimeAxis';
import ChannelColumn from './ChannelColumn';
import ProgramCell from './ProgramCell';

interface TimelineGridProps {
  channels: Channel[];
  programsByChannel: Record<string, EpgProgram[]>;
  serverNow: number;
  timeZone: string;
}

const ROW_HEIGHT = 64;
const PIXELS_PER_MINUTE = 200 / 30; // 200px per 30 min
const CHANNEL_COLUMN_WIDTH = 160;
// The initial viewport shows "30 minutes before now" flush against the left
// edge, so the timeline only carries 30 minutes of past. Forward horizon is
// wide enough that the user can scroll through most of an evening's lineup
// without running out of data.
const MINUTES_BACK = 30;
const HOURS_FORWARD = 12;

export default function TimelineGrid({
  channels,
  programsByChannel,
  serverNow,
  timeZone,
}: TimelineGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const channelColumnRef = useRef<HTMLDivElement>(null);

  // Use server timestamp to avoid hydration mismatch
  const { startTime, endTime, totalWidth, nowOffset } = useMemo(() => {
    const now = new Date(serverNow);
    const start = new Date(now.getTime() - MINUTES_BACK * 60 * 1000);
    const end = new Date(now.getTime() + HOURS_FORWARD * 60 * 60 * 1000);
    const totalMinutes = (end.getTime() - start.getTime()) / 60000;
    const width = totalMinutes * PIXELS_PER_MINUTE;
    const offset = (now.getTime() - start.getTime()) / 60000 * PIXELS_PER_MINUTE;
    return { startTime: start, endTime: end, totalWidth: width, nowOffset: offset };
  }, [serverNow]);

  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // Sync scroll: program grid → channel column (vertical) + time axis (horizontal)
  function handleGridScroll() {
    const grid = scrollContainerRef.current;
    if (!grid) return;
    if (channelColumnRef.current) {
      channelColumnRef.current.scrollTop = grid.scrollTop;
    }
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = grid.scrollLeft;
    }
  }

  // The timeline now starts exactly 30 minutes before now, so the left edge
  // of the natural scroll position (scrollLeft=0) already shows what we
  // want. Keep an explicit reset to 0 so browser back-forward cache restores
  // don't leave stale scroll state.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const grid = scrollContainerRef.current;
      if (grid) grid.scrollLeft = 0;
      if (timelineScrollRef.current) {
        timelineScrollRef.current.scrollLeft = 0;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [nowOffset]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  if (channels.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p style={{ color: 'var(--fg-muted)' }}>No channels available for the guide.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
      {/* Header row: channel column header + time axis */}
      <div className="flex shrink-0">
        <div
          className="flex shrink-0 items-end border-b border-r px-3 pb-1"
          style={{
            width: CHANNEL_COLUMN_WIDTH,
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-raised)',
          }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
            Channels
          </span>
        </div>
        <div
          className="overflow-hidden border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-raised)' }}
          ref={timelineScrollRef}
        >
          <div style={{ width: totalWidth }}>
            <TimeAxis
              startTime={startTime}
              endTime={endTime}
              pixelsPerMinute={PIXELS_PER_MINUTE}
              serverNow={serverNow}
              timeZone={timeZone}
            />
          </div>
        </div>
      </div>

      {/* Body: channel column + scrollable program grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fixed channel column — synced to program grid vertical scroll */}
        <div
          ref={channelColumnRef}
          className="shrink-0 overflow-y-auto border-r"
          style={{
            width: CHANNEL_COLUMN_WIDTH,
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-raised)',
            scrollbarWidth: 'none',
          }}
        >
          <ChannelColumn
            channels={channels}
            rowHeight={ROW_HEIGHT}
            virtualRows={virtualRows}
            totalHeight={totalHeight}
          />
        </div>

        {/* Scrollable program grid */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
          onScroll={handleGridScroll}
        >
          <div style={{ width: totalWidth, height: totalHeight, position: 'relative' }}>
            {/* Now marker — vertical red line */}
            <div
              className="absolute top-0 z-10 w-0.5"
              style={{
                left: nowOffset,
                height: totalHeight,
                backgroundColor: 'var(--error)',
                opacity: 0.6,
              }}
            />

            {/* Virtual rows */}
            {virtualRows.map((virtualRow) => {
              const channel = channels[virtualRow.index];
              if (!channel) return null;
              const programs = programsByChannel[channel.id] || [];

              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 border-b"
                  style={{
                    top: virtualRow.start,
                    height: ROW_HEIGHT,
                    width: totalWidth,
                    borderColor: 'var(--border)',
                  }}
                >
                  {programs
                    .filter((p) => {
                      const pEnd = new Date(p.end).getTime();
                      const pStart = new Date(p.start).getTime();
                      return pEnd > startTime.getTime() && pStart < endTime.getTime();
                    })
                    .map((program, i) => (
                      <ProgramCell
                        key={`${program.channelId}-${i}`}
                        program={program}
                        pixelsPerMinute={PIXELS_PER_MINUTE}
                        timelineStart={startTime}
                        rowHeight={ROW_HEIGHT}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
