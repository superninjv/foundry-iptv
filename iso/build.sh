#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
CHROOT_DIR="${SCRIPT_DIR}/config/includes.chroot"
GIT_SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'dev')"
DATE_TAG="$(date +%Y%m%d)"

log() { printf '\033[1;32m==> %s\033[0m\n' "$*"; }
err() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# Pre-flight
command -v lb    >/dev/null || err "live-build not installed. apt-get install -y live-build"
command -v docker >/dev/null || err "docker not installed"

log "Phase 1: Build Docker images"
cd "$PROJECT_ROOT"
docker compose build --build-arg GIT_SHA="$GIT_SHA"

log "Phase 2: Save + compress Docker images"
mkdir -p "${CHROOT_DIR}/opt/foundry/docker-images"

# Save all images needed by the compose stack
declare -A IMAGES=(
  ["foundry-iptv"]="foundry-iptv-foundry-iptv:latest"
  ["ts2hls"]="foundry-iptv-ts2hls:latest"
  ["pgvector-pg16"]="pgvector/pgvector:pg16"
  ["redis-7-alpine"]="redis:7-alpine"
  ["caddy-2-alpine"]="caddy:2-alpine"
)

# Pull external images that may not be local
docker pull pgvector/pgvector:pg16
docker pull redis:7-alpine
docker pull caddy:2-alpine

for name in "${!IMAGES[@]}"; do
  img="${IMAGES[$name]}"
  tarball="${CHROOT_DIR}/opt/foundry/docker-images/${name}.tar.zst"
  if [ -f "$tarball" ]; then
    log "  Skipping ${name} (already saved)"
    continue
  fi
  log "  Saving ${img} -> ${name}.tar.zst"
  docker save "$img" | zstd -T0 -3 -o "$tarball"
done

log "Phase 3: Copy application source"
APP_DEST="${CHROOT_DIR}/opt/foundry"
# Sync source, excluding build artifacts and the iso/ dir itself
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='iso/' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='docker-images' \
  "${PROJECT_ROOT}/" "${APP_DEST}/"

log "Phase 4: Generate docker-compose.prod.yml"
# Replace build: directives with image: refs for offline boot
cd "$PROJECT_ROOT"
python3 -c "
import re, sys

with open('docker-compose.yml') as f:
    content = f.read()

# Remove build: blocks and replace with image: for foundry services
# This is a simple sed-style replacement
lines = content.split('\n')
result = []
skip_build = False
indent = ''
for line in lines:
    # Detect 'build:' lines (simple or block form)
    stripped = line.lstrip()
    if stripped.startswith('build:'):
        # Check if it's a simple value or block
        if stripped == 'build: .':
            # Replace with image
            result.append(line.replace('build: .', 'image: foundry-iptv-foundry-iptv:latest'))
            continue
        elif stripped.startswith('build:') and stripped != 'build:':
            # Simple build: <path>
            current_indent = line[:len(line)-len(stripped)]
            if 'ts2hls' in '\n'.join(result[-10:]):
                result.append(current_indent + 'image: foundry-iptv-ts2hls:latest')
            else:
                result.append(current_indent + 'image: foundry-iptv-foundry-iptv:latest')
            continue
        else:
            # Block form - skip this line and following indented lines
            indent = line[:len(line)-len(stripped)]
            skip_build = True
            # Determine which service we're in
            service_context = [l for l in result[-20:] if l.strip().endswith(':')]
            if any('ts2hls' in l for l in service_context):
                result.append(indent + 'image: foundry-iptv-ts2hls:latest')
            else:
                result.append(indent + 'image: foundry-iptv-foundry-iptv:latest')
            continue
    if skip_build:
        if stripped and not line.startswith(indent + '  '):
            skip_build = False
            result.append(line)
        # else skip the indented build sub-keys
        continue
    result.append(line)

with open('${APP_DEST}/docker-compose.yml', 'w') as f:
    f.write('\n'.join(result))
" 2>/dev/null || {
  # Fallback: just use sed for simple replacements
  log "  Python transform failed, using sed fallback"
  sed -E \
    -e '/^\s+build:\s*\.$/c\    image: foundry-iptv-foundry-iptv:latest' \
    -e '/^\s+build:\s*$/,/^\s+[a-z]/{ /^\s+build:\s*$/c\    image: foundry-iptv-foundry-iptv:latest' \
    -e '}' \
    docker-compose.yml > "${APP_DEST}/docker-compose.yml"
}

log "Phase 5: Configure live-build"
cd "$SCRIPT_DIR"
# Clean previous build
lb clean 2>/dev/null || true

lb config \
  --distribution bookworm \
  --architectures amd64 \
  --binary-images iso-hybrid \
  --bootloaders "syslinux,grub-efi" \
  --debian-installer live \
  --debian-installer-gui false \
  --memtest none \
  --iso-application "Foundry IPTV" \
  --iso-volume "FOUNDRY-IPTV" \
  --apt-indices false \
  --cache true \
  --security true \
  --updates true

log "Phase 6: Build ISO"
lb build

log "Phase 7: Rename + checksum"
ISO_SRC="$(ls live-image-amd64.hybrid.iso 2>/dev/null || ls *.iso 2>/dev/null | head -1)"
ISO_NAME="foundry-iptv-${DATE_TAG}-${GIT_SHA}.iso"
mv "$ISO_SRC" "$ISO_NAME"
sha256sum "$ISO_NAME" > SHA256SUMS

log "Done! ISO: ${SCRIPT_DIR}/${ISO_NAME}"
log "Size: $(du -h "$ISO_NAME" | cut -f1)"
