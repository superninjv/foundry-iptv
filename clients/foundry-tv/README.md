# foundry-tv

Linux streaming-PC client for Foundry IPTV. Renders with [Slint](https://slint.dev/) and
plays HLS streams via GStreamer `playbin3`. Targets x86_64 (N100 mini-PC) and aarch64 (Pi 5).

## What this is

`foundry-tv` is a thin native client that authenticates against the household Foundry IPTV
server using a device bearer token, then presents Live TV, Guide, Decks, and VOD using the
same Next.js API that the web UI uses. All the heavy lifting (EPG ingest, ts2hls transcoding)
stays on the server box.

## Build

```bash
# Install system dependencies (Debian/Ubuntu)
sudo apt install \
  libgstreamer1.0-dev \
  libgstreamer-plugins-base1.0-dev \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  libfontconfig-dev \
  libxkbcommon-dev

# Build (from the workspace root)
cd clients
cargo build -p foundry-tv

# Run
./target/debug/foundry-tv
```

## Cross-compile to aarch64 (Pi 5)

```bash
# Install cross-compilation toolchain
rustup target add aarch64-unknown-linux-gnu
cargo build -p foundry-tv --target aarch64-unknown-linux-gnu
```

You will need a sysroot with the GStreamer aarch64 dev headers — easiest via
`cross` (Docker-based) or a Pi 5 sysroot mounted via NFS.
