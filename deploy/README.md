# Foundry IPTV — Deploy Guide

## One-command install (Ubuntu 24.04)

```sh
curl -fsSL https://raw.githubusercontent.com/superninjv/foundry-iptv/main/deploy/install.sh | sh
```

Re-running is idempotent — it will not clobber an existing `.env`.

After the script finishes, open the printed URL in a browser and complete the setup wizard.

## What the installer does

1. Installs `docker.io`, `docker-compose-plugin`, `curl`, `git`, `openssl`.
2. Clones the repo to `/opt/foundry-iptv`.
3. Generates `/opt/foundry-iptv/.env` from `.env.example` with random secrets.
4. Runs `docker compose up -d --build`.
5. Polls `/api/health` until healthy (up to 120 s).

## Local dev

```sh
git clone <repo> && cd foundry-iptv
./deploy/install.sh --dev   # skips clone, uses current dir
```

## Volumes

| Volume | Contents |
|---|---|
| `foundry_pg_data` | PostgreSQL data |
| `foundry_redis_data` | Redis AOF / RDB |
| `caddy_data` | TLS certs (if Caddy manages them) |

Back up with:
```sh
docker compose stop
tar -czf foundry-backup-$(date +%F).tar.gz \
  $(docker volume inspect --format '{{.Mountpoint}}' foundry_pg_data) \
  $(docker volume inspect --format '{{.Mountpoint}}' foundry_redis_data)
docker compose start
```

## Upgrade

```sh
cd /opt/foundry-iptv
git pull
docker compose up -d --build
```

The `foundry-migrate` init container runs automatically on restart and applies any new migrations.

## Secrets

All secrets live in `/opt/foundry-iptv/.env`. The file is never committed.
See `.env.example` for the full variable reference.

## Further docs

Track G will publish full user documentation. In the meantime see `docs/` in the repo.
