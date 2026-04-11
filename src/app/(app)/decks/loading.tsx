export default function Loading() {
  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      {/* Title placeholder */}
      <div
        className="mb-6 h-8 w-24 animate-pulse rounded"
        style={{ backgroundColor: 'var(--bg-raised)' }}
      />

      {/* Deck card grid — auto-fill matches DeckList layout */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl"
            style={{ backgroundColor: 'var(--bg-raised)', height: '140px' }}
          />
        ))}
      </div>
    </div>
  );
}
