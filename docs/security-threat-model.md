# foundry-iptv — Security threat model

## Network perimeter (Phase 1 done)
- LAN-only Caddy binding for iptv.foundry.test
- No port-forward on Netgear
- All foundry-01 to provider traffic routed through Mullvad (103.176.90.137/32, 194.62.214.224/32)
- Credentials never traverse Spectrum's pipe in plaintext

## Process isolation (Phase 2 TODO — before exposing any ts2hls/rotor)
1. **Dedicated Docker network `iptv-net`** with no route to 10.0.0.0/24. All ffmpeg/ts2hls/multiview-rotor containers attach only to this network. Contains LAN lateral movement if a container is compromised.
2. **Harden ffmpeg containers**: `--read-only --tmpfs /tmp --cap-drop=ALL --security-opt=no-new-privileges --user=iptv`.
3. **Pin jrottenberg/ffmpeg by SHA digest** not tag. Monthly CVE review.
4. Optional stretch: route `iptv-net` egress through a second Mullvad namespace so a popped ffmpeg can't phone home from foundry-01's IP.

## Content parsing (Phase 2 TODO — when lib/epg/parser.ts is written)
5. **XMLTV parser must disable external entities** (XXE). Use `@xmldom/xmldom` with entity loading off, or `fast-xml-parser` which doesn't support entities at all. Never use a raw libxml2 binding with defaults.
6. **ffmpeg `-protocol_whitelist file,http,https,tcp,tls,crypto`** — pinned in every spawn. No `concat:`, `subfile:`, or arbitrary schemes.
7. M3U parser treats stream URLs as untrusted strings — never `eval`, never shell-interpolate.

## Authentication
- NextAuth credentials, bcrypt cost 12, 24h JWT
- Single-user home app, no OAuth/SSO surface to exploit
- Login rate limit (in-memory for now, Redis TODO if we go multi-instance)

## Known residual risks (accepted)
- Provider legitimacy: it's an Xtream Codes reseller chain, not a licensed distributor. Legal risk is Jack's personal LAN-only usage vs. resale/public exposure. Plan legal section covers this.
- ffmpeg decoder CVE 0-days: mitigated by #1 (network containment) and #2 (process hardening) once implemented.
