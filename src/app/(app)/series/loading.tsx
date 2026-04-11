export default function Loading() {
  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      {/* Title placeholder */}
      <div
        className="mb-6 h-8 w-24 animate-pulse rounded"
        style={{ backgroundColor: 'var(--bg-raised)' }}
      />

      {/* Category filter placeholder */}
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-8 shrink-0 animate-pulse rounded-full"
            style={{
              backgroundColor: 'var(--bg-raised)',
              width: `${70 + (i % 3) * 20}px`,
            }}
          />
        ))}
      </div>

      {/* Poster grid — auto-fill matches MediaGrid */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg"
            style={{ backgroundColor: 'var(--bg-raised)', aspectRatio: '2/3' }}
          />
        ))}
      </div>
    </div>
  );
}
