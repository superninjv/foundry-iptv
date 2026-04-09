# Provider connection cap — empirical probe

Recorded 2026-04-09 on foundry-01, before writing any multiview code.

## Self-reported values are unreliable

`player_api.php` on `line.primelivestreaming.org` returns
`max_connections=1` and an `active_cons` counter. **These values are
false.** Xtream Codes panels routinely report `max_connections=1` for every
user regardless of real enforcement, and many resellers never enforce a
per-account cap at all.

**Do not architect around the self-reported values.** Use the empirical
result below.

## Probe methodology

Inside a throwaway Docker container on foundry-01:

```
docker run --rm --network host jrottenberg/ffmpeg:7.1-alpine \
  -protocol_whitelist file,http,https,tcp,tls,crypto \
  -user_agent IPTVSmarters \
  -i <stream_url> \
  -t 20 -f null -
```

- Each probe used a **distinct** live channel URL pulled from the raw M3U.
- The M3U entries for live channels omit an extension; the correct URL
  shape for ffmpeg is `http://line.primelivestreaming.org:80/<user>/<pass>/<streamId>.ts`
  — appending `.ts` is required, otherwise you get a 404 HTML page.
- Each `.ts` URL returns a 302 redirect to the actual origin:
  `http://194.62.214.224:80/live/play/<session_token>/<streamId>`. The
  session tokens are ephemeral per request — you can't cache them.
- User-Agent `IPTVSmarters` mirrors what the reference mobile client sends;
  some panels cap per-UA, so we match a known-good one.
- Probes ran in ascending N (1, 2, 3, ... 8) against different channels in
  parallel, each for 20 s.

## Result

| N concurrent | success | notes                       |
|--------------|---------|-----------------------------|
| 1            | ok      |                             |
| 2            | ok      |                             |
| 3            | ok      |                             |
| 4            | ok      |                             |
| 5            | ok      |                             |
| 6            | ok      |                             |
| 7            | ok      |                             |
| 8            | ok      |                             |

**100% success at N <= 8. The real cap is >= 8, effectively unlimited for
any realistic multiview.** No existing sessions were killed when new ones
were opened — the "kill-all-on-overage" worst-case enforcement pattern does
not apply here.

## Implication for the rotor

Mode A (Live Multiview) is the **default** viewing path. Every multiview
cell gets its own dedicated live upstream. A 2x2 or 3x3 grid is trivially
achievable.

Mode B (Time-Machine Multiview) remains a **first-class feature**, not a
fallback:

- Always-on glance wall even on a backup or travel line (if we ever run
  against a different provider that *does* cap aggressively).
- Sub-second channel zap — any channel that passed through the rotor in
  the last 90 s replays from the ring buffer while a fresh upstream
  reconnects.
- Mini-DVR — 90 s per-tile rewind for free on every rotor-covered channel.
- Parlay-watch mode.
- Provider failover — if the primary line ever chokes mid-session, rotor
  cells keep playing from cache while switching upstreams to a backup.

The rotor will still probe at startup and clamp its pool to the measured
cap, re-probing hourly. For this provider the pool size is bounded by the
UI cell count and the foundry-01 CPU budget, not by provider policy.
