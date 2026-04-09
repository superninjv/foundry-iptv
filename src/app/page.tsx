export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Foundry IPTV</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        Self-hosted TV for foundry-01. Phase 1 scaffold.
      </p>
      {/* TODO Phase 2: replace with redirect to /live once auth + guide are wired. */}
    </main>
  );
}
