export default function Loading() {
  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: '#000' }}>
      {/* 2×2 grid skeleton — mirrors MultiviewGrid default layout */}
      <div
        className="grid flex-1 gap-1 p-1"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded"
            style={{ backgroundColor: '#111' }}
          />
        ))}
      </div>
    </div>
  );
}
