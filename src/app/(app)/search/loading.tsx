export default function Loading() {
  return (
    <div className="p-4 pb-24 md:p-6">
      {/* Title placeholder */}
      <div
        className="mb-6 h-8 w-28 animate-pulse rounded"
        style={{ backgroundColor: 'var(--bg-raised)' }}
      />

      {/* Search bar placeholder */}
      <div
        className="mb-8 h-12 w-full animate-pulse rounded-lg"
        style={{ backgroundColor: 'var(--bg-raised)' }}
      />

      {/* Result placeholders */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div
              className="h-16 w-16 shrink-0 animate-pulse rounded-lg"
              style={{ backgroundColor: 'var(--bg-raised)' }}
            />
            <div className="flex flex-1 flex-col justify-center gap-2">
              <div
                className="h-4 animate-pulse rounded"
                style={{
                  backgroundColor: 'var(--bg-raised)',
                  width: `${40 + (i % 4) * 15}%`,
                }}
              />
              <div
                className="h-3 w-24 animate-pulse rounded"
                style={{ backgroundColor: 'var(--bg-raised)' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
