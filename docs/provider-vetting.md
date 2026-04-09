# Provider vetting — line.primelivestreaming.org

Recorded 2026-04-09 before any foundry-iptv code runs against the provider.
This is the one place we moralise: reseller IPTV services of this shape are
near-universally unlicensed redistribution. Foundry IPTV is being built as a
personal LAN-only viewing frontend on Jack's own hardware, with no public
exposure, no redistribution, no third-party users, no monetisation. The code
is generic enough to run against any Xtream Codes source (including a future
licensed one).

## Host / domain

- Host: `line.primelivestreaming.org`
- A record: `103.176.90.137`
- IP owner: BOJING CO LIMITED / bojicloud.com — Hong Kong. "Grey" hoster
  (not an established CDN, not on any public abuse list we check, but also
  not a reputable commercial provider).
- Registrar: Namecheap. NS: Cloudflare, unproxied.
- Domain created: 2026-01-22 — 11 weeks old at vetting time. Yellow flag.
- Same IP also serves `line.vpntxvpn.ru`. Clear reseller chain — the HK
  address is a front door, actual stream origins are elsewhere.

## Transport

- `curl -vI https://line.primelivestreaming.org/` : connection refused on 443.
  **HTTP-only panel**. Credentials travel in plaintext on every request.
- `curl -I http://line.primelivestreaming.org/` : standard Nginx panel, no
  obvious tracker/ad-injection headers.
- Stream HTTP redirects resolve to upstream `194.62.214.224` — a European
  hoster, different from the HK front door. Typical reseller architecture.

## Credentials

- Credentials observed in query-string form on every request.
- Mitigation: route all foundry-01 -> provider traffic via the Mullvad
  wireguard tunnel (`wg-quick@mullvad` is already up on foundry-01). Use a
  policy route so only traffic to the provider IPs takes the tunnel —
  everything else stays on the Netgear/Spectrum path to keep GH Actions and
  package pulls cheap.
- Never hit the provider from the workstation; foundry-01 is the single
  known egress.
- The initial account appeared to expire ~40 hours after creation. Jack
  confirmed it was a free trial line, so this is expected, not a compromise.

## M3U content scan (Docker-isolated on foundry-01)

- Total size: ~350 MB
- Total entries: ~1.2 million (overwhelmingly series VOD; live TV is a
  small fraction of the file).
- Stream schemes: `http`, `https`, `rtmp` only — zero unusual schemes.
- No executable-like paths (`.exe`, `.apk`, `.sh`) anywhere in the playlist.
- Logos pull from a mix of legitimate CDNs and other reseller panels.
- Playlist parses as valid M3U (`#EXTM3U` header, `#EXTINF` entries) — not
  an HTML phishing landing page.

## Verdict

**Yellow flags, no red flags. Proceed with hardening.**

Yellow:

- HTTP-only panel (credentials in plaintext without VPN)
- Grey HK hoster (BOJING CO LIMITED)
- Young domain (11 weeks)
- Reseller chain (HK front, EU upstream)

Hardening applied regardless of verdict:

- Mullvad policy route for foundry-01 -> provider traffic.
- Threadfin + ts2hls + multiview-rotor run as Docker containers or a
  dedicated non-root `iptv` system user with `ProtectSystem=strict`,
  `PrivateTmp=yes`, `NoNewPrivileges=yes`, writes confined to
  `/var/cache/foundry-iptv/`.
- ffmpeg pinned to `-protocol_whitelist file,http,https,tcp,tls,crypto`.
- `iptv.foundry.test` is LAN-only — Caddy binds to the foundry-01 private
  IP, no port-forward on the Netgear.
