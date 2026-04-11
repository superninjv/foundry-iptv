'use client';

import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
        Something went wrong
      </h1>

      {process.env.NODE_ENV === 'development' && (
        <pre
          className="max-w-lg overflow-auto rounded-lg p-4 text-sm"
          style={{
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--error)',
            border: '1px solid var(--border)',
          }}
        >
          {error.message}
        </pre>
      )}

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
          }}
        >
          Try again
        </button>
        <Link
          href="/live"
          className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
