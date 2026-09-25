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
   `sudo bash install.sh --branch main --api-domain api.evcar.news --email ops@example.com --non-interactive -y`
   (non-interactive runs never enable UFW over other public services: add `--enable-firewall` to force it, or
   `--skip-firewall` on servers with a hosting panel / their own firewall). Never put secrets on the `sudo` command
   line (sudo logs it to `/var/log/auth.log`): the installer prompts for the SMTP password / OCM key (`--ocm-key`
   without a value), or reads `EVCAR_SMTP_PASSWORD` / `EVCAR_OCM_API_KEY` exported in a root shell.
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
`docker.io` is never removed; the **Docker snap is refused** with instructions — its confinement cannot build or
bind-mount from `/opt/evcar`) → `/opt/evcar/{app,backups,state,run,proxy,rclone}`, **all root-owned** (root runs
`evcar.sh`, `lib/`, the compose files and the units from the checkout; older installs with an `evcar`-owned
checkout are handed back to root, git runs as root with hooks/fsmonitor disabled) → 2 GB swap when RAM < 2 GB →
firewall: an **active UFW is left as it is** (no SSH-from-anywhere rule, 80/443 untouched in nginx/apache mode; in
caddy mode only 80/443 ports no rule names yet); an inactive UFW is enabled with SSH/80/443 only when no other public
TCP/UDP service listens, otherwise it asks (default no) — `-y`/non-interactive never blocks them unless
`--enable-firewall` → fail2ban jail for sshd (skipped when an `[sshd]` jail is already configured) →
unattended-upgrades (security, no auto-reboot) → clones the repo → DNS check → writes `/opt/evcar/.env.production`
(mode 600; secrets from `openssl rand`, never printed; existing values are never regenerated; values the file cannot
hold are refused before anything is written) → `/usr/local/sbin/evcar` → **systemd timers (before the first start)**
→ `evcar up --build` → host-proxy setup when needed. A failing build/start or vhost/certificate step no longer stops
the installer: it is listed under "Failed steps" with the command to retry, and the installer exits 1.

### Proxy modes (detected from what listens on 80/443)

| Mode | When | How |
|---|---|---|
| `caddy` | 80/443 free | Bundled Caddy 2.11 container: automatic Let's Encrypt for API/admin domains, HTTP/3, zstd/gzip, HSTS, request body limit (`PROXY_MAX_BODY`, default 32 MB ≥ 16 MiB upload chunks), 10 min body timeouts, `/media` served straight from the storage volume. During API restarts requests wait up to 30 s (`lb_try_duration`) instead of failing. |
| `nginx` / `apache` | the existing site's web server is the ONLY program on 80/443 | API on `127.0.0.1:API_HOST_PORT` (3000, next free port if busy), admin on `127.0.0.1:ADMIN_HOST_PORT` (8081). `evcar proxy-setup --install [--cert]` refuses when anything else listens on 80/443 (e.g. Apache on 80 + a container's `docker-proxy` on 443: enabling `mod_ssl` adds `Listen 443`, and `apachectl graceful` then exits — with the existing site), enables only the Apache modules not loaded yet, writes ONE new vhost file (`sites-available/evcar-news.conf` or `conf.d/evcar-news.conf`) for the API/admin names only, refuses if those names already exist elsewhere or if a foreign file has that name, runs `nginx -t`/`apache2ctl configtest`, reloads, then checks that the server still runs, that the existing site still answers on port 80 and that the new vhost serves an ACME probe file; on any failure it **reverts** the vhost and the modules it enabled and restarts the server. Listen directives mirror the sockets the server already uses. The token pages (`/setup-password`, `/reset-password`, `/verify-email`) are excluded from the access log. Certificates: `certbot certonly --webroot` (`/var/www/evcar-acme`, cert name `evcar`, deploy hook reloads the server). The evcar.news vhost is never opened. |
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
- **Secrets:** one file, `/opt/evcar/.env.production` (600). Change secrets with `sudo evcar set KEY` (value read
  without echo, or from stdin); `set KEY=VALUE` is refused for secret keys (`*_PASSWORD`, `*_API_KEY`, `*SECRET*`,
  `*_TOKEN`, `*PRIVATE_KEY*`, `*_SALT`, `ALERT_WEBHOOK_URL`, `MONITOR_HEARTBEAT_URL`, `FCM_SERVICE_ACCOUNT_JSON`,
  `DATABASE_URL`, `REDIS_URL`) unless `--force`, because sudo logs command lines. The app database password is read
  inside psql with `\getenv` (`lib/db-bootstrap.sql`, `postgres/initdb/10-evcar-init.sh`), so it never appears in
  `ps`. The file is parsed as data (never `source`d). Containers get
  only what they need: `evcar` renders `/opt/evcar/run/backend.env` (600) with just the keys documented in
  `/.env.example` (so new backend variables pass through automatically), plus derived defaults
  (`APP_PUBLIC_BASE_URL=https://API_DOMAIN`, `ADMIN_BASE_URL`, `CORS_ORIGINS=https://ADMIN_DOMAIN`). The PostgreSQL
  superuser password, alert settings, etc. never reach the application containers.
- **E-mail:** production refuses `MAIL_DRIVER=console`. Without SMTP the installer sets `SMTP_HOST=mailpit`, a local
  **outbox** container (profile `mail-outbox`, UI on `127.0.0.1:8025` only, **basic auth** user `evcar` /
  `MAILPIT_UI_PASSWORD` because it holds password-reset links; only on the `edge` network — no route to
  PostgreSQL/Redis; `cap_drop: ALL`): the API starts, but nothing is delivered (`sudo evcar mail-outbox`).
  Configure real SMTP with `sudo evcar set SMTP_HOST=…`, `sudo evcar set SMTP_PASSWORD` (prompt) + `sudo evcar up`.
- **Share links:** `SHARE_BASE_URL=https://evcar.news` (contract default). The share pages (`/n/…`, `/cars/…`,
  `/compare/…`, `/.well-known/…`) are served by the API on `https://API_DOMAIN`; until the website routes those paths
  to the API (docs/WEBSITE_INTEGRATION.md), point the share base URL to `https://api.evcar.news` in the admin settings.

### Containers (`docker-compose.prod.yml`)

| Service | Image | Networks | Notes |
|---|---|---|---|
| postgres | `postgis/postgis:16-3.5` | `data` (internal) | tuned via `PG_*`, `shm_size` 256 MB, healthcheck |
| redis | `redis:7.4.11-alpine` | `data` | password, AOF `everysec`, `maxmemory` + `noeviction` (BullMQ) |
| api | built from `backend/` → `localhost/evcar-backend:<git sha>` | `data`, `edge` | runs migrations + reference seed on start; `cap_drop: ALL`; read-only root, `/tmp` tmpfs 256 MB |
| worker | same image (profile `worker`) | `data`, `edge` | `JOBS_ENABLED=true`; read-only root, `/tmp` tmpfs 512 MB |
| admin | built from `admin/` (profile `admin`) | `edge` | nginx static SPA; read-only root (tmpfs for conf.d, cache, run, tmp); `cap_drop: ALL` + `CHOWN`, `SETGID`, `SETUID`; no access log (`deploy/admin/00-evcar-no-access-log.conf`: token URLs) |
| mailpit | `axllent/mailpit:v1.31.2` (profile `mail-outbox`) | `edge` | only while SMTP is not configured; UI/API password; `cap_drop: ALL` |
| caddy | `caddy:2.11.4-alpine` (`compose.caddy.yml`) | `edge` | ports 80, 443, 443/udp; `cap_drop: ALL` + `NET_BIND_SERVICE`, `DAC_OVERRIDE` (media files are 0640); read-only root |

Read-only roots can be switched off with `EVCAR_READ_ONLY_ROOT=false` (escape hatch; then `sudo evcar up`). The
tmpfs mounts are RAM and count against each container's memory limit (`API_TMP_SIZE`, `WORKER_TMP_SIZE`).
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
| `update [--branch B] [--no-pull] [--skip-backup]` | `git pull --ff-only` (as root, hooks disabled) → build (old version keeps serving; below 3 GB RAM one image at a time, `EVCAR_BUILD_PARALLEL`) → pre-update DB backup → `prisma migrate deploy` + reference seed with the new image → recreate containers. Migrations must stay backward compatible (expand/contract) because the old API runs during them. |
| `rollback` | previous release's images (kept by image pruning even after a no-op update; does not revert migrations: restore the `pre-update` backup if needed) |
| `migrate`, `seed` | migrations / idempotent reference seed. `seed --demo` is refused (NODE_ENV=production). |
| `create-owner --email E [--name N] [--set-password]` | first owner / recovery link |
| `backup [--db-only]`, `backups`, `restore`, `restore-test`, `psql` | see below |
| `set KEY=VALUE` / `set KEY` | edit the env file safely (quoting, mode 600), then `evcar up`; `set KEY` prompts (secrets) |
| `alert-test` | sends a test alert; exits 1 when no channel delivered it |
| `harden-ssh [--undo]` | key-only SSH via `/etc/ssh/sshd_config.d/00-evcar-hardening.conf` (see the security checklist) |
| `offsite-setup [--allow-unencrypted]`, `offsite-fetch [latest\|TS] [--list]` | encrypted off-site copies; download a set (disaster recovery) |
| `dns-check`, `proxy-config`, `proxy-setup`, `mail-outbox`, `timers`, `monitor`, `compose …` | `up` and `proxy-setup` re-install missing timers; `status`/`health` warn about inactive timers |

## Backups, restore, restore test (requirements §19)

- **Daily** (`evcar-backup.timer`, 03:15 UTC ± 20 min): `pg_dump -Fc` (validated with `pg_restore -l`), exact row
  count of every table computed from the dump, the media as a **hard-link snapshot** (`media/`: `rsync -a
  --link-dest` against the previous sets — media files are immutable, so every set is complete while each file is
  stored once; `media.sha256` lists every file, hashes of hard-linked files are reused), `manifest.txt`,
  `SHA256SUMS`. Excluded: `tmp/`, `.multipart/`, in-progress `*.part`/`*.tmp` uploads. A file deleted during the copy
  (rsync exit 24, or GNU tar exit 1 in the stream fallback) is not an error; any other media failure keeps the
  database dump (`media_included=false`, alert, `state/last-backup-media-failed` for the monitor). Without host access
  to the volume (or `EVCAR_BACKUP_MEDIA_METHOD=stream`) media are streamed through the api image (full copy). Written
  to a temp dir then renamed (no half backups). Rotation: 7 daily + 4 weekly (weekly = hard-linked copy, promoted
  every ≥ 6.5 days), 5 manual, 3 pre-update, 3 pre-restore, 2 fetched off-site sets. Sets of the previous format
  (`media.tar`) remain restorable. `BACKUP_INCLUDE_MEDIA=false` for DB-only.
- **Free space:** before each backup the dump (sized as `pg_database_size`, counted twice when it is first written on
  Docker's disk and then copied to the same disk) and the new media bytes (`rsync --dry-run --stats`) must leave
  `BACKUP_MIN_FREE_PERCENT` (15 %) of each disk free — PostgreSQL WAL and Redis AOF live on the same disk. Media that
  do not fit → database-only backup + alert; a dump that does not fit → backup fails + alert. `restore-test` and
  `restore` check that Docker's disk can hold 1.3 × the database. **Disk needed:** ≈ media × 2 (live + backups) +
  database dumps × ~12 + images/OS ≈ 10 GB.
- **Off-site** (optional): `sudo evcar offsite-setup` (rclone). Only a **`crypt` remote** is accepted (the dump holds
  e-mails, password hashes and sessions) unless `--allow-unencrypted`; `offsite_upload` refuses (and alerts) when
  `RCLONE_REMOTE` is not a crypt remote, `status` and the monitor warn. Daily/weekly sets are copied with `rclone
  copy` (never `sync`, so an empty local disk can never delete remote backups; media as one streamed `media.tar`
  object instead of thousands of tiles) and pruned by count. **Store `/opt/evcar/rclone/rclone.conf` (storage
  credentials + crypt passwords) in a password manager** next to `.env.production`: without it the off-site copies
  cannot be decrypted after losing the server.
- **Restore test** (`evcar-restore-test.timer`, Sundays 05:15 UTC): verifies checksums, restores the latest set into a
  temporary database **as the unprivileged app role**, compares every table's row count with the counts contained
  in the dump (exact), checks `_prisma_migrations` (no failed/rolled-back) and PostGIS, checks the media archive, drops
  the temporary DB, records the result in `/opt/evcar/state/restore-test.last` and alerts on failure.
- **Restore** (`evcar restore <latest|dir|timestamp> [--db-only|--media-only] [--flush-redis] [--yes]`): checksum
  verification → typed confirmation (`RESTORE`) → safety backup of the current DB → restore into a fresh database →
  same verification as the restore test → stop API/worker → rename current DB to `<db>_pre_restore_<ts>` and the new
  one to `<db>` → media extracted over the volume (newer files kept) → start (pending migrations are applied). The old
  DB is kept until you drop it (`sudo evcar psql -c 'DROP DATABASE "…";'`). The switch is one transaction; if a later
  step fails after the API was stopped, the application is started again and the message says which database runs.
- **Disaster recovery on a new server:** `install.sh` → paste the saved `rclone.conf` into
  `/opt/evcar/rclone/rclone.conf` (mode 600) → `sudo evcar set RCLONE_REMOTE=offsite-crypt:` →
  `sudo evcar offsite-fetch --list` / `sudo evcar offsite-fetch latest` (downloads into `backups/offsite/<ts>`,
  unpacks the media, verifies all checksums) → `sudo evcar restore <ts>` → move DNS.
- Keep a copy of `/opt/evcar/.env.production` **and** `/opt/evcar/rclone/rclone.conf` in a password manager. A new
  server with new secrets works with a restored DB (access tokens are short-lived; refresh tokens are stored hashed).

## Monitoring (`evcar-monitor.timer`, every 5 min; `monitor.sh`)

Containers running/healthy, restart count increases, OOM kills, API health inside the server (`/api/v1/health`:
ok/degraded/error) and through `https://API_DOMAIN/api/v1/health/live` (`MONITOR_PUBLIC_CHECK=false` to disable),
disk usage of `/`, Docker root and the backup disk (`DISK_ALERT_PERCENT`, 85), available memory, last successful
backup (< 26 h), last restore test (not failed, < 8.5 days), off-site failures, TLS expiry (< 14 days). Alerts:
`ALERT_EMAIL` (through the configured SMTP server; curl reads credentials from a 0600 config file) and/or
`ALERT_WEBHOOK_URL` (JSON `{"text","content"}` for Slack/Discord/Telegram `sendMessage?chat_id=…`;
`ALERT_WEBHOOK_FORMAT=text` for ntfy). Repeats every `ALERT_REPEAT_HOURS` (6), sends "recovered", is silenced during
`up`/`update`/`restore`. `MONITOR_HEARTBEAT_URL` (optional) is pinged after each clean run — use an external uptime /
dead-man's-switch service so a dead server is noticed too. A fresh install has **no working channel** (mailpit SMTP,
no webhook): the installer summary, `evcar status` and every monitor run say so. Verify with `sudo evcar alert-test`
(fails unless a channel delivered). Also checked: missing media in the last backup, off-site failures/refusals.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Ports 80/443 busy | handled by the modes above; `sudo evcar proxy-config` |
| DNS not propagated | `sudo evcar dns-check`; when fixed: `sudo evcar restart caddy` (caddy mode) or `sudo evcar proxy-setup --install --cert` |
| Certificate errors | `sudo evcar logs caddy`; wrong `AAAA`, Cloudflare orange cloud, Let's Encrypt rate limit after repeated failures (wait) |
| Out of memory / build killed | `sudo evcar set EVCAR_WORKER_MODE=combined`, more RAM (2–4 GB recommended), swap is created below 2 GB; builds run one at a time below 3 GB (`EVCAR_BUILD_PARALLEL=false` forces it) |
| Installer stopped half-way | timers are already installed; run the command listed under "Failed steps" (`sudo evcar up --build`, `sudo evcar proxy-setup --install --cert`) |
| Apache on 80 but something else on 443 | detected: mode `external` (`sudo evcar proxy-config`); Apache is never given `mod_ssl` in that situation |
| "Docker is installed as a SNAP" | check `sudo docker ps -a`, then `sudo snap remove docker` and re-run `install.sh` |
| Service fails with "Read-only file system" | `sudo evcar set EVCAR_READ_ONLY_ROOT=false`, `sudo evcar up`, report the log |
| API unhealthy | `sudo evcar logs api` — env validation lists every missing/invalid variable |
| Admin build fails | `sudo evcar set ADMIN_DOMAIN=` then `sudo evcar up` (API only) |
| Disk full | `sudo evcar status`, lower `BACKUP_KEEP_*`, drop `*_pre_restore_*` DBs, `docker system df` |

## Security checklist

SSH keys only: `sudo evcar harden-ssh` (refuses unless the login user has an authorized key; writes
`/etc/ssh/sshd_config.d/00-evcar-hardening.conf` with `PasswordAuthentication no`, `KbdInteractiveAuthentication no`
and — unless something stricter is set — `PermitRootLogin prohibit-password`, runs `sshd -t`, reloads, prints
`sshd -T`; `--undo` removes it). Editing `/etc/ssh/sshd_config` does nothing on Ubuntu 22.04/24.04 cloud images:
it starts with `Include /etc/ssh/sshd_config.d/*.conf`, `50-cloud-init.conf` there sets `PasswordAuthentication yes`,
and sshd keeps the first value (reproduced with openssh-server 1:9.6p1-3ubuntu13.19, `deploy/tests/harden-ssh.sh`).
Keep a second SSH session open while testing. Then: UFW active (or the panel's firewall with `--skip-firewall`),
fail2ban `sshd` jail, unattended-upgrades + periodic reboots for kernels, `.env.production` and `rclone.conf` 600 and
stored in a password manager, secrets set with `sudo evcar set KEY` (never on a command line), no public DB/Redis
ports, **encrypted** off-site backups (crypt remote), alerts tested with `sudo evcar alert-test`, 2FA on GitHub /
DNS / VPS accounts, few admin accounts with least privilege, never demo data in production.

## Costs

Nothing mandatory beyond the existing VPS and domain (all components are open source, Let's Encrypt is free).
Optional, provider-priced (check their current terms; no prices are assumed here): SMTP provider, off-site storage,
S3/CDN for media, map tiles beyond the OpenStreetMap public tile policy, routing providers, a larger server.

## Verification done in the development environment (no Docker daemon available)

- `shellcheck -x` clean on every script (`deploy/.shellcheckrc` disables only SC2016: commands expanded inside
  containers); `bash -n`; YAML parsed; `docker compose config` (Compose v5.1.1 CLI) for caddy and host-proxy modes,
  all profiles, with and without `EVCAR_READ_ONLY_ROOT=false`; `caddy validate` (2.11.4); `nginx -t` (1.24) and
  `apache2 -t` (2.4.58) on the rendered vhosts; `systemd-analyze verify` on the units.
- `install.sh --dry-run` end to end (Ubuntu 24.04; firewall left off with other listeners under `-y`, timers before
  the first start); `--generate-env-only` (a single quote in the SMTP password is refused before any file is
  written; `--ocm-key VALUE` is refused); UFW rule parsing and TCP/UDP listener detection with recorded
  `ufw status` / `ss` outputs; mode detection with Apache on 80 + `docker-proxy` on 443 → `external`.
- `deploy/tests/local-e2e.sh` (110 checks): the real `evcar.sh` with a `docker` test double against the local
  PostgreSQL 16/PostGIS, Redis and the real backend build, run inside a mount namespace where the backend code,
  `node_modules` and `$HOME` are **read-only** (as with `read_only: true`) — `up` (bootstrap with `\getenv`: the
  password never appears in any recorded command line; migrations + seed as the unprivileged role), `set` refusing
  secrets on the command line / reading them from stdin, `alert-test` (fails without a channel, delivers through a
  webhook), `create-owner` (link and `--set-password` through a pseudo-terminal, then login), backups (hard-linked
  media snapshot, checksums, `*.part`/`tmp`/`.multipart` excluded, stream fallback, GNU tar exit 1 and rsync exit 24
  tolerated, a real media failure keeps the dump, media that do not fit — a sparse 5 TB file — give a database-only
  backup + monitor problem), restore-test (exact counts; corrupted dump and corrupted media file detected; old
  `media.tar` sets still accepted), restore (swap, old DB kept, media back; a failure after the API was stopped
  restarts it), update/rollback (image pruning keeps the rollback target after a no-op update), monitor, off-site
  with rclone 1.60 (plain remote refused, encrypted `crypt` round trip, `offsite-fetch` + restore-test of the
  fetched set), code ownership repair, and the real Caddy and nginx in front of the API.
- `deploy/tests/nginx-proxy-setup.sh` (23 checks) and `deploy/tests/apache-proxy-setup.sh` (24 checks, real Ubuntu
  apache2 2.4.58 + a2enmod): vhost next to an existing site, existing site untouched, ACME + redirect, token URLs
  not logged, revert on a failing config, name-conflict and foreign-file refusals, port 443 held by another program
  refused; Apache: the review's failure reproduced (mod_ssl's `Listen 443` + graceful reload → AH00072, Apache
  exits) and rolled back automatically (modules disabled, vhost removed, Apache restarted, site answers).
- `deploy/tests/harden-ssh.sh` (13 checks, real OpenSSH 9.6p1 sshd with Ubuntu's default `sshd_config` and a
  `50-cloud-init.conf`): editing `sshd_config` shown to have no effect; `harden-ssh` refuses without a key, makes
  `sshd -T` report `passwordauthentication no`, keeps a stricter `PermitRootLogin no`, `--undo` works.
- mailpit v1.31.2 binary: with `MP_UI_AUTH` the API answers 401 without and 200 with credentials; `/readyz` (image
  healthcheck) stays open. Caddy 2.11.4 started with a read-only root filesystem serves `/media`.
- **Not verified here:** building/running the Docker images (no daemon) — in particular the read-only root and
  capability set of the admin (nginx:alpine) container and the api/worker tmpfs sizes under real 360° processing;
  Let's Encrypt issuance, UFW/fail2ban/systemd on a real host, the Docker snap refusal, Ubuntu 22.04 specifically,
  arm64. Run `sudo bash install.sh --dry-run` first on the real server; `EVCAR_READ_ONLY_ROOT=false` is the escape
  hatch if a container needs to write somewhere unexpected.
