export default function Loading() {
  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      {/* Title placeholder */}
      <div
        className="mb-4 h-8 w-48 animate-pulse rounded"
        style={{ backgroundColor: 'var(--bg-raised)' }}
      />

      {/* Timeline header (time slots) */}
      <div className="mb-2 flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-6 flex-1 animate-pulse rounded"
            style={{ backgroundColor: 'var(--bg-raised)' }}
          />
        ))}
      </div>

      {/* Timeline rows (channel name + program blocks) */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="mb-1 flex gap-1">
          {/* Channel label */}
          <div
            className="h-14 w-32 shrink-0 animate-pulse rounded"
            style={{ backgroundColor: 'var(--bg-raised)' }}
          />
          {/* Program blocks */}
          <div className="flex flex-1 gap-1">
            {Array.from({ length: 3 + (i % 3) }).map((_, j) => (
              <div
                key={j}
                className="h-14 animate-pulse rounded"
                style={{
                  backgroundColor: 'var(--bg-raised)',
                  flex: `${1 + (j % 3)}`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
