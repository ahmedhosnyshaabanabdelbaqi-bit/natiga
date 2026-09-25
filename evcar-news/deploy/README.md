# EV Car News — production deployment kit

Guides: [`../docs/DEPLOYMENT_AR.md`](../docs/DEPLOYMENT_AR.md) (عربي، خطوة بخطوة) ·
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) (English, with the technical decisions).

```bash
sudo bash install.sh --branch <branch> [--dry-run]   # Ubuntu 22.04/24.04 VPS
sudo evcar help                                     # management CLI (this folder's evcar.sh)
```

| Path | Purpose |
|---|---|
| `install.sh` | idempotent installer (Docker, user, firewall, fail2ban, upgrades, swap, env file, timers, start) |
| `evcar.sh` | management CLI: up/down/update/rollback/logs/status/health/migrate/seed/create-owner/backup/restore/restore-test/proxy-setup… |
| `monitor.sh` | monitoring checks + alerts (systemd timer, every 5 min) |
| `lib/` | shared shell helpers, alert delivery, idempotent DB bootstrap SQL |
| `docker-compose.prod.yml` | postgres, redis, api, worker, admin, mailpit (outbox) |
| `compose.caddy.yml` / `compose.host-proxy.yml` | proxy mode overrides (Caddy on 80/443, or 127.0.0.1 ports behind the host's nginx/Apache) |
| `caddy/` | Caddyfile + site files (API with `/media`, admin) |
| `proxy/nginx`, `proxy/apache` | vhost templates rendered by `evcar proxy-setup` |
| `postgres/initdb/` | first-start init: extensions + unprivileged owner role |
| `systemd/` | backup (daily), restore test (weekly), monitor (5 min) units |
| `tests/` | `local-e2e.sh` (docker test double + local PostgreSQL/Redis/backend + Caddy/nginx) and `nginx-proxy-setup.sh` |

Lint: `shellcheck -x *.sh lib/*.sh tests/*.sh` (see `.shellcheckrc`).
