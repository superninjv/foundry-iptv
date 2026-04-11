'use client';

// TimeAxis
// Strict rule: every date/time value rendered here MUST be formatted in the
// server's configured timezone (APP_TIMEZONE, passed down as `timeZone`).
// Using the default Date getters (getHours, etc.) would read the process-
// local TZ on the server and the browser-local TZ on the client, producing
// different SSR vs hydration strings and a React hydration mismatch.

interface TimeAxisProps {
  startTime: Date;
  endTime: Date;
  pixelsPerMinute: number;
  serverNow: number;
  timeZone: string;
}

interface ZonedParts {
  hour24: number;
  minute: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  let hour24 = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour24 = parseInt(p.value, 10) || 0;
    else if (p.type === 'minute') minute = parseInt(p.value, 10) || 0;
  }
  return { hour24, minute };
}

function formatLabel(date: Date, timeZone: string, isHour: boolean): string {
  const { hour24, minute } = zonedParts(date, timeZone);
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 || 12;
  return isHour ? `${h12} ${ampm}` : `${h12}:${String(minute).padStart(2, '0')}`;
}

export default function TimeAxis({
  startTime,
  endTime,
  pixelsPerMinute,
  serverNow,
  timeZone,
}: TimeAxisProps) {
  const markers: { label: string; left: number; isHour: boolean; key: number }[] = [];

  // Walk the range in 30-minute increments. We round the start *forward* to
  // the nearest 30-minute boundary as seen in the target timezone so the
  // labels line up with real clock minutes.
  const { minute: startMinute } = zonedParts(startTime, timeZone);
  const roundForward = startMinute === 0 || startMinute === 30
    ? 0
    : startMinute < 30
      ? 30 - startMinute
      : 60 - startMinute;
  const firstMarkerTs = startTime.getTime() + roundForward * 60_000;

  for (let ts = firstMarkerTs; ts <= endTime.getTime(); ts += 30 * 60_000) {
    const d = new Date(ts);
    const { minute } = zonedParts(d, timeZone);
    const isHour = minute === 0;
    const offsetMinutes = (ts - startTime.getTime()) / 60_000;
    markers.push({
      label: formatLabel(d, timeZone, isHour),
      left: offsetMinutes * pixelsPerMinute,
      isHour,
      key: ts,
    });
  }

  const nowOffset = (serverNow - startTime.getTime()) / 60_000;
  const nowLeft = nowOffset * pixelsPerMinute;
  const totalWidth = ((endTime.getTime() - startTime.getTime()) / 60_000) * pixelsPerMinute;

  return (
    <div className="relative h-10 shrink-0" style={{ width: totalWidth }}>
      {markers.map((m) => (
        <div
          key={m.key}
          className="absolute top-0 flex h-full flex-col justify-end pb-1"
          style={{ left: m.left }}
        >
          <span
            className="whitespace-nowrap text-xs"
            style={{
              color: m.isHour ? 'var(--fg)' : 'var(--fg-muted)',
              fontWeight: m.isHour ? 600 : 400,
            }}
          >
            {m.label}
          </span>
          <div
            className="mt-1 w-px"
            style={{
              height: m.isHour ? 8 : 4,
              backgroundColor: m.isHour ? 'var(--fg-muted)' : 'var(--border)',
            }}
          />
        </div>
      ))}

      {/* Now indicator */}
      {nowLeft >= 0 && nowLeft <= totalWidth && (
        <div className="absolute top-0 flex h-full flex-col items-center" style={{ left: nowLeft }}>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: 'var(--error)', color: '#fff' }}
          >
            NOW
          </span>
        </div>
      )}
    </div>
  );
}
