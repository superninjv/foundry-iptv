# foundry-iptv

Self-hosted bespoke IPTV frontend for foundry-01. LAN-only, one app, every
device on the network hits it via the browser. Single-tenant home app —
this is Jack's TV, not a SaaS.

## Stack

- Next.js 16 (App Router, webpack, React Compiler) + React 19 + TypeScript
- Tailwind CSS v4
- NextAuth v5 (credentials provider against `iptv_users`)
- Postgres (foundry-01 local, `foundry_iptv` DB, pgvector + pg_trgm)
- Redis (channel + EPG cache, graceful fallback)
- ffmpeg sidecars: `services/ts2hls` (Phase 2), `services/multiview-rotor` (Phase 4)
- Threadfin in front of the Xtream provider (`line.primelivestreaming.org`)

## Quickstart

```
cp .env.example .env.local   # fill in real values
npm install
npm run migrate              # applies migrations/*.sql against DATABASE_URL
npm run dev                  # next dev --webpack on :3003
npm run typecheck
```

Do not commit `.env.local`.

## Docs

- [`docs/provider-vetting.md`](docs/provider-vetting.md) — host/domain/content
  vetting results for `line.primelivestreaming.org`.
- [`docs/provider-caps.md`](docs/provider-caps.md) — empirical cap probe
  (why Mode A Live Multiview is the default).
- Full plan: `/home/jack/.claude/plans/zesty-wondering-dongarra.md`.
