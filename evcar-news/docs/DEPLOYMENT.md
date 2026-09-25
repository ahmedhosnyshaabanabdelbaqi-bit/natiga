# EV Car News — production deployment (single Ubuntu VPS)

Step-by-step guide for non-experts (Arabic): [`DEPLOYMENT_AR.md`](DEPLOYMENT_AR.md).
Kit: [`../deploy/`](../deploy) — `install.sh` (installer), `evcar.sh` (management CLI, installed as `evcar`),
`docker-compose.prod.yml` + `compose.caddy.yml` / `compose.host-proxy.yml`, `caddy/`, `proxy/` (nginx/Apache
vhost templates), `postgres/initdb/`, `systemd/`, `monitor.sh`, `tests/`.

| Endpoint | URL |
|---|---|
| API | `https://api.evcar.news/api/v1` (health: `/api/v1/health`) |
| Admin panel (optional) | `https://admin.evcar.news` (its `/api/*` goes to the API, same origin) |
| Public media | `https://api.evcar.news/media/...` |
| Existing website | `https://evcar.news` — never modified |

## Quick start

1. **DNS** (at the evcar.news DNS provider): add `A api → <server IPv4>` and `A admin → <server IPv4>`. Do not touch
   the records of `evcar.news`/`www`/MX. Cloudflare: "DNS only" (grey). Only add `AAAA` if it is the server's real IPv6.
2. **Install** (Ubuntu 22.04/24.04, as root or with sudo):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ahmedhosnyshaabanabdelbaqi-bit/natiga/claude/eager-ride-uhdmax/evcar-news/deploy/install.sh -o install.sh
   sudo bash install.sh --branch claude/eager-ride-uhdmax          # add --dry-run to preview
   ```
   (Use `main` instead of the branch name once the code is merged.) Non-interactive example:
   `sudo bash install.sh --branch main --api-domain api.evcar.news --email ops@example.com --non-interactive -y`.
3. **First owner:** `sudo evcar create-owner --email you@example.com --name "Name"` → one-time link (24 h) to
   `https://admin.evcar.news/setup-password?token=…`. Without admin panel: add `--set-password` (prompted on the server,
   token and password go to the API over stdin, never on a command line). No password exists in code.
4. **Check:** `curl https://api.evcar.news/api/v1/health` → `"status":"ok"`; `sudo evcar status`.
5. **APK:** GitHub → Settings → Secrets and variables → Actions → Variables: `EVCAR_API_BASE_URL =
   https://api.evcar.news/api/v1` (that is also the workflow default) → Actions → `evcar-android` → Run workflow.

## What install.sh does (idempotent; `--dry-run` prints every action)

Checks Ubuntu version (22.04/24.04 supported, newer warned, older refused), arch (amd64; arm64 switches to the
community multi-arch `imresamu/postgis` image because `postgis/postgis` is amd64-only), RAM, disk, systemd →
installs Docker Engine + compose plugin from `download.docker.com` (an existing Docker with compose ≥ 2.24 is kept;
`docker.io` is never removed) → system user `evcar` + `/opt/evcar/{app,backups,state,run,proxy,rclone}` → 2 GB swap
when RAM < 2 GB → UFW (OpenSSH/ssh port, 80/tcp, 443 tcp+udp; asks first if other public listeners exist) → fail2ban
jail for sshd → unattended-upgrades (security, no auto-reboot) → clones the repo as `evcar` → DNS check → writes
`/opt/evcar/.env.production` (mode 600; secrets from `openssl rand`, never printed; existing values are never
regenerated) → `/usr/local/sbin/evcar` + systemd timers → `evcar up --build` → host-proxy setup when needed.

### Proxy modes (detected from what listens on 80/443)

| Mode | When | How |
|---|---|---|
| `caddy` | 80/443 free | Bundled Caddy 2.11 container: automatic Let's Encrypt for API/admin domains, HTTP/3, zstd/gzip, HSTS, request body limit (`PROXY_MAX_BODY`, default 32 MB ≥ 16 MiB upload chunks), 10 min body timeouts, `/media` served straight from the storage volume. During API restarts requests wait up to 30 s (`lb_try_duration`) instead of failing. |
| `nginx` / `apache` | the existing site's web server owns 80/443 | API on `127.0.0.1:API_HOST_PORT` (3000, next free port if busy), admin on `127.0.0.1:ADMIN_HOST_PORT` (8081). `evcar proxy-setup --install [--cert]` writes ONE new vhost file (`sites-available/evcar-news.conf` or `conf.d/evcar-news.conf`) for the API/admin names only, refuses if those names already exist elsewhere or if a foreign file has that name, runs `nginx -t`/`apache2ctl configtest`, reloads, and **reverts on failure**. Listen directives mirror the sockets the server already uses. Certificates: `certbot certonly --webroot` (`/var/www/evcar-acme`, cert name `evcar`, deploy hook reloads the server). The evcar.news vhost is never opened. |
| `external` | anything else (Traefik, another Caddy, a container...) | Same localhost ports; `sudo evcar proxy-config` prints the routing rules (one hop, `X-Forwarded-For` = client, `X-Forwarded-Proto`, body size, CORS `*` on `/media`). |

`TRUST_PROXY=1` in every mode (exactly one proxy hop; Caddy ≥ 2.5 ignores client-sent `X-Forwarded-*`, the nginx
vhost overwrites `X-Forwarded-For`, Apache appends and the API reads the right-most value). Behind a CDN/Cloudflare
proxy you would need `TRUST_PROXY=2` and real-IP config — the default setup uses DNS-only records.

### Decisions

- **Media on the API host (`/media`)** rather than a separate subdomain: one DNS record and one certificate, the backend
  already builds `APP_PUBLIC_BASE_URL/media/...` when `STORAGE_PUBLIC_BASE_URL` is empty, and Caddy serves the files
  directly from the volume (no Node in the path, `Cache-Control: public, max-age=604800, immutable`,
  `Access-Control-Allow-Origin: *` so the app's Pannellum WebView can use them as WebGL textures, a sandboxing CSP,
  dotfiles hidden, `private/` unreachable). A media subdomain only pays off with a CDN: then set
  `STORAGE_PUBLIC_BASE_URL` to the CDN URL.
- **Local disk storage by default** (`storage` volume). S3-compatible storage is an option: set `STORAGE_DRIVER=s3`,
  `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`,
  `STORAGE_PUBLIC_BASE_URL` (bucket/CDN URL; only `public/` must be anonymously readable), then `sudo evcar up`.
  Existing local files are not migrated automatically (copy them with rclone). Media backups then rely on the
  provider (enable versioning); `BACKUP_INCLUDE_MEDIA` covers local storage only. MinIO is not bundled: it no longer
  publishes maintained images on Docker Hub, so pinning one for production would not be honest.
- **Worker:** the backend has no headless worker binary, but `JOBS_ENABLED` switches BullMQ processors and cron jobs
  on/off. `EVCAR_WORKER_MODE=separate` (default from 3 GB RAM) runs a second container of the same image with
  `JOBS_ENABLED=true` (API has `false`), so 360° tile generation (sharp) cannot OOM the API. `combined` (below
  3 GB) runs jobs inside the API.
- **Database roles:** PostgreSQL's superuser is only used inside the container (unix socket) for bootstrap, dumps
  and restores. The app connects as `evcar_app`, owner of database `evcar`, **not** superuser, no CREATEDB. The
  extensions (`postgis`, `pg_trgm`, `unaccent`, `btree_gist`) are pre-created by `postgres/initdb/10-evcar-init.sh`
  (first start) and re-ensured by `evcar up` (`lib/db-bootstrap.sql`, also re-applies `APP_DB_PASSWORD`). Verified:
  all migrations apply as that role.
- **Secrets:** one file, `/opt/evcar/.env.production` (600). It is parsed as data (never `source`d). Containers get
  only what they need: `evcar` renders `/opt/evcar/run/backend.env` (600) with just the keys documented in
  `/.env.example` (so new backend variables pass through automatically), plus derived defaults
  (`APP_PUBLIC_BASE_URL=https://API_DOMAIN`, `ADMIN_BASE_URL`, `CORS_ORIGINS=https://ADMIN_DOMAIN`). The PostgreSQL
  superuser password, alert settings, etc. never reach the application containers.
- **E-mail:** production refuses `MAIL_DRIVER=console`. Without SMTP the installer sets `SMTP_HOST=mailpit`, a local
  **outbox** container (profile `mail-outbox`, UI on `127.0.0.1:8025` only): the API starts, but nothing is
  delivered (`sudo evcar mail-outbox`). Configure real SMTP with `sudo evcar set SMTP_...` + `sudo evcar up`.
- **Share links:** `SHARE_BASE_URL=https://evcar.news` (contract default). The share pages (`/n/…`, `/cars/…`,
  `/compare/…`, `/.well-known/…`) are served by the API on `https://API_DOMAIN`; until the website routes those paths
  to the API (docs/WEBSITE_INTEGRATION.md), point the share base URL to `https://api.evcar.news` in the admin settings.

### Containers (`docker-compose.prod.yml`)

| Service | Image | Networks | Notes |
|---|---|---|---|
| postgres | `postgis/postgis:16-3.5` | `data` (internal) | tuned via `PG_*`, `shm_size` 256 MB, healthcheck |
| redis | `redis:7.4.11-alpine` | `data` | password, AOF `everysec`, `maxmemory` + `noeviction` (BullMQ) |
| api | built from `backend/` → `localhost/evcar-backend:<git sha>` | `data`, `edge` | runs migrations + reference seed on start; `cap_drop: ALL` |
| worker | same image (profile `worker`) | `data`, `edge` | `JOBS_ENABLED=true` |
| admin | built from `admin/` (profile `admin`) | `edge` | nginx static SPA |
| mailpit | `axllent/mailpit:v1.31.2` (profile `mail-outbox`) | `data`, `edge` | only while SMTP is not configured |
| caddy | `caddy:2.11.4-alpine` (`compose.caddy.yml`) | `edge` | ports 80, 443, 443/udp; `cap_drop: ALL` + `NET_BIND_SERVICE`, `DAC_OVERRIDE` (media files are 0640) |

All services: `restart: unless-stopped`, `no-new-privileges`, memory + pids limits (sized by the installer from RAM:
`PG_MEM_LIMIT`, `API_MEM_LIMIT`, `WORKER_MEM_LIMIT`...), json-file logs 5 × 10 MB. The `data` network is `internal`
(no internet, not reachable from the proxy). Nothing is published on a public interface except Caddy's 80/443;
`evcar status` warns about any other public port (Docker-published ports bypass UFW). Local images use the
`localhost/` prefix (never pulled from a registry by mistake).

## Operations (`sudo evcar <command>`)

| Command | |
|---|---|
| `status`, `health`, `logs [svc] [-f]` | state, health (inside + public URL), logs |
| `up [--build]`, `down`, `restart [svc]` | apply config changes / stop (volumes kept) / restart |
| `update [--branch B] [--no-pull] [--skip-backup]` | `git pull --ff-only` as `evcar` → build (old version keeps serving) → pre-update DB backup → `prisma migrate deploy` + reference seed with the new image → recreate containers. Migrations must stay backward compatible (expand/contract) because the old API runs during them. |
| `rollback` | previous release's images (does not revert migrations: restore the `pre-update` backup if needed) |
| `migrate`, `seed` | migrations / idempotent reference seed. `seed --demo` is refused (NODE_ENV=production). |
| `create-owner --email E [--name N] [--set-password]` | first owner / recovery link |
| `backup [--db-only]`, `backups`, `restore`, `restore-test`, `psql` | see below |
| `set KEY=VALUE` | edit the env file safely (quoting, mode 600), then `evcar up` |
| `dns-check`, `proxy-config`, `proxy-setup`, `offsite-setup`, `mail-outbox`, `timers`, `monitor`, `compose …` | |

## Backups, restore, restore test (requirements §19)

- **Daily** (`evcar-backup.timer`, 03:15 UTC ± 20 min): `pg_dump -Fc` (validated with `pg_restore -l`), exact row
  count of every table computed from the dump, `media.tar` of the storage volume (without `tmp/`, `.multipart/`),
  `manifest.txt`, `SHA256SUMS`. Written to a temp dir then renamed (no half backups). Rotation: 7 daily + 4 weekly
  (weekly = hard-linked copy, promoted every ≥ 6.5 days), 5 manual, 3 pre-update, 3 pre-restore.
  `BACKUP_INCLUDE_MEDIA=false` for DB-only. Free-space check before starting.
- **Off-site** (optional): `sudo evcar offsite-setup` (rclone; use a `crypt` remote). Daily/weekly sets are copied
  with `rclone copy` (never `sync`, so an empty local disk can never delete remote backups) and pruned by count.
- **Restore test** (`evcar-restore-test.timer`, Sundays 05:15 UTC): verifies checksums, restores the latest set into a
  temporary database **as the unprivileged app role**, compares every table's row count with the counts contained
  in the dump (exact), checks `_prisma_migrations` (no failed/rolled-back) and PostGIS, checks the media archive, drops
  the temporary DB, records the result in `/opt/evcar/state/restore-test.last` and alerts on failure.
- **Restore** (`evcar restore <latest|dir|timestamp> [--db-only|--media-only] [--flush-redis] [--yes]`): checksum
  verification → typed confirmation (`RESTORE`) → safety backup of the current DB → restore into a fresh database →
  same verification as the restore test → stop API/worker → rename current DB to `<db>_pre_restore_<ts>` and the new
  one to `<db>` → media extracted over the volume (newer files kept) → start (pending migrations are applied). The old
  DB is kept until you drop it (`sudo evcar psql -c 'DROP DATABASE "…";'`). Disaster recovery on a new server:
  install, copy the backup directory into `/opt/evcar/backups/manual/`, `sudo evcar restore <timestamp>`.
- Keep a copy of `/opt/evcar/.env.production` in a password manager (SMTP/API keys). A new server with new secrets
  works with a restored DB (access tokens are short-lived; refresh tokens are stored hashed).

## Monitoring (`evcar-monitor.timer`, every 5 min; `monitor.sh`)

Containers running/healthy, restart count increases, OOM kills, API health inside the server (`/api/v1/health`:
ok/degraded/error) and through `https://API_DOMAIN/api/v1/health/live` (`MONITOR_PUBLIC_CHECK=false` to disable),
disk usage of `/`, Docker root and the backup disk (`DISK_ALERT_PERCENT`, 85), available memory, last successful
backup (< 26 h), last restore test (not failed, < 8.5 days), off-site failures, TLS expiry (< 14 days). Alerts:
`ALERT_EMAIL` (through the configured SMTP server; curl reads credentials from a 0600 config file) and/or
`ALERT_WEBHOOK_URL` (JSON `{"text","content"}` for Slack/Discord/Telegram `sendMessage?chat_id=…`;
`ALERT_WEBHOOK_FORMAT=text` for ntfy). Repeats every `ALERT_REPEAT_HOURS` (6), sends "recovered", is silenced during
`update`/`restore`. `MONITOR_HEARTBEAT_URL` (optional) is pinged after each clean run — use an external uptime /
dead-man's-switch service so a dead server is noticed too.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Ports 80/443 busy | handled by the modes above; `sudo evcar proxy-config` |
| DNS not propagated | `sudo evcar dns-check`; when fixed: `sudo evcar restart caddy` (caddy mode) or `sudo evcar proxy-setup --install --cert` |
| Certificate errors | `sudo evcar logs caddy`; wrong `AAAA`, Cloudflare orange cloud, Let's Encrypt rate limit after repeated failures (wait) |
| Out of memory / build killed | `sudo evcar set EVCAR_WORKER_MODE=combined`, more RAM (2–4 GB recommended), swap is created below 2 GB |
| API unhealthy | `sudo evcar logs api` — env validation lists every missing/invalid variable |
| Admin build fails | `sudo evcar set ADMIN_DOMAIN=` then `sudo evcar up` (API only) |
| Disk full | `sudo evcar status`, lower `BACKUP_KEEP_*`, drop `*_pre_restore_*` DBs, `docker system df` |

## Security checklist

SSH keys only (then `PasswordAuthentication no`), UFW active, fail2ban `sshd` jail, unattended-upgrades + periodic
reboots for kernels, `.env.production` 600 and stored in a password manager, no public DB/Redis ports, encrypted
off-site backups, alerts tested, 2FA on GitHub / DNS / VPS accounts, few admin accounts with least privilege, never
demo data in production.

## Costs

Nothing mandatory beyond the existing VPS and domain (all components are open source, Let's Encrypt is free).
Optional, provider-priced (check their current terms; no prices are assumed here): SMTP provider, off-site storage,
S3/CDN for media, map tiles beyond the OpenStreetMap public tile policy, routing providers, a larger server.

## Verification done in the development environment (no Docker daemon available)

- `shellcheck -x` clean on every script (`deploy/.shellcheckrc` disables only SC2016: commands expanded inside
  containers); `bash -n`; YAML parsed; `docker compose config` (Compose v5.1.1 CLI) for caddy and host-proxy modes,
  combined/separate workers, with/without admin; `caddy validate` (2.11.4) for both site variants; `nginx -t`
  (1.24) and `apache2 -t` (2.4.58) on the rendered vhosts; `systemd-analyze verify` on the units.
- `install.sh --dry-run` end to end (Ubuntu 24.04 container; nginx-mode detection tested with a real nginx on port 80,
  with and without `ss`); `--generate-env-only` in a temp dir; the rendered API environment passes the backend's own
  production validation (`parseEnv`).
- `deploy/tests/local-e2e.sh` (64 checks): the real `evcar.sh` with a `docker` test double against the local
  PostgreSQL 16/PostGIS, Redis and the real backend build — `up` (role/extension bootstrap, migrations + seed as the
  unprivileged role), health, `create-owner` (link and `--set-password` through a pseudo-terminal, then login),
  `seed --demo` refused, backup (checksums, media, rotation), restore-test (exact counts; corruption detected),
  restore (swap, old DB kept, media back), update/rollback, monitor, and the real Caddy binary in front of the API
  (media headers, dotfiles, `private/`, HSTS once, compression, 413) and real nginx with the TLS vhost. Also checked
  by hand: Caddy replaces a client-sent `X-Forwarded-For` with the real peer address.
- `deploy/tests/nginx-proxy-setup.sh` (16 checks): installing the vhost next to an existing site on a real nginx,
  existing site untouched, ACME + redirect, revert on a failing config, name-conflict and foreign-file refusals.
- **Not verified here:** building/running the Docker images (no daemon), Let's Encrypt issuance, UFW/fail2ban/systemd
  on a real host, Ubuntu 22.04 specifically, arm64. Run `sudo bash install.sh --dry-run` first on the real server.
