import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold" style={{ color: 'var(--fg)' }}>
        404
      </h1>
      <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>
        Page not found
      </p>
      <Link
        href="/live"
        className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
        style={{
          backgroundColor: 'var(--accent)',
          color: 'var(--bg)',
        }}
      >
        Go to Live TV
      </Link>
    </div>
  );
}
