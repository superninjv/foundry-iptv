export default function Loading() {
  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      {/* Title placeholder */}
      <div
        className="mb-4 h-8 w-32 animate-pulse rounded"
        style={{ backgroundColor: 'var(--bg-raised)' }}
      />

      {/* Category pills */}
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-8 shrink-0 animate-pulse rounded-full"
            style={{
              backgroundColor: 'var(--bg-raised)',
              width: `${60 + (i % 3) * 20}px`,
            }}
          />
        ))}
      </div>

      {/* Channel card grid — auto-fill matches ChannelGrid */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg"
            style={{ backgroundColor: 'var(--bg-raised)' }}
          />
        ))}
      </div>
    </div>
  );
}
