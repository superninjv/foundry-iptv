#!/bin/sh
# deploy/install.sh — idempotent one-command installer for foundry-iptv.
# Requires Ubuntu 24.04. Run as root or a user with passwordless sudo.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/…/deploy/install.sh | sh
#   # or locally:
#   ./deploy/install.sh
#   ./deploy/install.sh --dev   # skip clone, use current directory

set -eu

REPO_URL="https://github.com/superninjv/foundry-iptv"
INSTALL_DIR="/opt/foundry-iptv"
HEALTH_URL="http://localhost/api/health"
HEALTH_TIMEOUT=120

DEV_MODE=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV_MODE=1 ;;
  esac
done

# ── helpers ──────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[install]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[install]\033[0m %s\n' "$*" >&2; }
fatal() { printf '\033[1;31m[install]\033[0m FATAL: %s\n' "$*" >&2; exit 1; }

need_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    SUDO="sudo"
  else
    fatal "Run as root or ensure the current user has passwordless sudo."
  fi
}

check_ubuntu() {
  if [ ! -f /etc/os-release ]; then
    fatal "Cannot detect OS. Only Ubuntu 24.04 is supported."
  fi
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ]; then
    fatal "This installer supports Ubuntu only. Detected: ${ID:-unknown}."
  fi
  info "Detected Ubuntu ${VERSION_ID:-?}."
}

install_deps() {
  info "Installing system dependencies…"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq docker.io docker-compose-plugin curl git openssl
  $SUDO systemctl enable --now docker
  # Add current user to docker group so compose commands work without sudo.
  if [ "$(id -u)" -ne 0 ]; then
    $SUDO usermod -aG docker "$(id -un)" || true
    # Re-exec with the updated group membership if possible.
    if command -v newgrp >/dev/null 2>&1; then
      info "User added to docker group. You may need to log out and back in for this to take effect."
    fi
  fi
}

clone_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Repository already present at $INSTALL_DIR — pulling latest."
    $SUDO git -C "$INSTALL_DIR" pull --ff-only
  else
    info "Cloning repository to $INSTALL_DIR…"
    $SUDO git clone "$REPO_URL" "$INSTALL_DIR"
    $SUDO chown -R "$(id -un):$(id -un)" "$INSTALL_DIR" 2>/dev/null || true
  fi
}

generate_env() {
  if [ -f "$INSTALL_DIR/.env" ]; then
    warn ".env already exists — skipping generation (idempotent). Delete it manually to regenerate."
    return 0
  fi
  info "Generating .env from .env.example…"

  DB_PASS="$(openssl rand -hex 32)"
  NEXTAUTH_SECRET="$(openssl rand -hex 32)"
  TS2HLS_SHARED_SECRET="$(openssl rand -hex 32)"
  TS2HLS_BEARER_TOKEN="$(openssl rand -hex 32)"
  HOST_IP="$(hostname -I | awk '{print $1}')"

  sed \
    -e "s|<generated>|REPLACE|g" \
    -e "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" \
    -e "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${NEXTAUTH_SECRET}|" \
    -e "s|TS2HLS_SHARED_SECRET=.*|TS2HLS_SHARED_SECRET=${TS2HLS_SHARED_SECRET}|" \
    -e "s|TS2HLS_BEARER_TOKEN=.*|TS2HLS_BEARER_TOKEN=${TS2HLS_BEARER_TOKEN}|" \
    -e "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=http://${HOST_IP}|" \
    "$INSTALL_DIR/.env.example" > "$INSTALL_DIR/.env"

  # Append compose-specific vars not in .env.example
  cat >> "$INSTALL_DIR/.env" <<EOF

# Compose service credentials (auto-generated)
POSTGRES_USER=foundry
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=foundry
DATABASE_URL=postgresql://foundry:${DB_PASS}@postgres:5432/foundry
REDIS_URL=redis://redis:6379/0
EOF

  ok ".env written to $INSTALL_DIR/.env"
}

start_services() {
  info "Building and starting services (this may take several minutes on first run)…"
  cd "$INSTALL_DIR"
  # Capture the current git SHA for the build arg
  GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  export GIT_SHA
  $SUDO docker compose up -d --build
}

wait_for_health() {
  info "Waiting for foundry-iptv to become healthy (up to ${HEALTH_TIMEOUT}s)…"
  elapsed=0
  while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "Health check passed."
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  fatal "foundry-iptv did not become healthy within ${HEALTH_TIMEOUT}s. Check: docker compose logs foundry-iptv"
}

# ── main ──────────────────────────────────────────────────────────────────────

need_sudo
check_ubuntu
install_deps

if [ "$DEV_MODE" -eq 1 ]; then
  INSTALL_DIR="$(pwd)"
  warn "--dev mode: using current directory ($INSTALL_DIR), skipping clone."
else
  clone_repo
fi

generate_env
start_services
wait_for_health

HOST_IP="$(hostname -I | awk '{print $1}')"
echo ""
ok "Foundry IPTV is running at http://${HOST_IP}/ — visit in a browser to complete setup."
