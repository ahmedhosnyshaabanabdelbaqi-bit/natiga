#!/usr/bin/env bash
# =============================================================================
# EV Car News — production management CLI (installed as /usr/local/sbin/evcar)
#
#   sudo evcar help
#
# Configuration: /opt/evcar/.env.production (EVCAR_ENV_FILE), created by
# deploy/install.sh. State: /opt/evcar/state. Backups: /opt/evcar/backups.
# Docs: docs/DEPLOYMENT.md (English) · docs/DEPLOYMENT_AR.md (عربي).
# =============================================================================
set -Eeuo pipefail

SELF=$(readlink -f "${BASH_SOURCE[0]}")
DEPLOY_DIR=$(dirname "$SELF")
# shellcheck source=lib/common.sh
source "$DEPLOY_DIR/lib/common.sh"
# shellcheck source=lib/alert.sh
source "$DEPLOY_DIR/lib/alert.sh"

# awk program counting the rows of every COPY block of `pg_restore --data-only -f -`.
# Output: "<schema>.<table> <rows>" (exact, independent of the database).
readonly AWK_COPY_COUNTS='
/^COPY / { t = $2; gsub(/"/, "", t); n = 0; c = 1; next }
c && $0 == "\\." { print t, n; c = 0; next }
c { n++ }'

# Exact row count of every ordinary table, plus the list of extension-owned
# tables (e.g. postgis spatial_ref_sys) which are excluded from comparisons.
# Filters `pg_restore -l` output: extensions (and their comments) are created by
# the superuser beforehand, and the data of extension-owned tables (e.g.
# postgis spatial_ref_sys, listed in `skip`) is provided by the extension.
readonly AWK_TOC_FILTER='
$4 == "EXTENSION" || ($4 == "COMMENT" && $6 == "EXTENSION") { next }
$4 == "TABLE" && $5 == "DATA" && index(skip, " " $6 "." $7 " ") { next }
{ print }'

readonly SQL_TABLE_COUNTS="SELECT n.nspname || '.' || c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%' ORDER BY 1"
readonly SQL_EXTENSION_TABLES="SELECT n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e' WHERE c.relkind = 'r' ORDER BY 1"

usage() {
  cat <<EOF
EV Car News — production management (sudo evcar <command>)

Stack
  up [--build]              start (or apply config changes); --build rebuilds images
  down [--yes]              stop all containers (data volumes are kept)
  restart [service]         restart one service (api, worker, caddy...) or all
  status                    containers, health, disk, backups, timers
  health                    API health (inside the server and via https://API_DOMAIN)
  logs [service] [-f] [--tail N]
  update [--branch B] [--no-pull] [--skip-backup]
                            git pull → build → pre-update DB backup → migrate → restart
  rollback                  start the previous release's images again

Database & data
  migrate                   apply database migrations (prisma migrate deploy)
  seed                      reference seed (idempotent). Demo data is REFUSED in production.
  create-owner --email E [--name N] [--set-password]
                            first owner; prints a one-time password-setup link
  backup [--db-only] [--offsite|--no-offsite]
  backups                   list local backups
  restore <latest|DIR|TIMESTAMP> [--db-only|--media-only] [--flush-redis] [--yes]
  restore-test [latest|DIR] restore into a temporary DB and verify row counts
  psql [args]               psql as the PostgreSQL superuser on the app database

Server
  monitor                   run the monitoring checks once (also every 5 min via systemd)
  timers [install|status|remove]
  dns-check                 check the DNS records of API_DOMAIN / ADMIN_DOMAIN
  proxy-config              print the nginx/apache vhost for this server (host-proxy modes)
  proxy-setup [--install] [--cert] [--yes]
                            install that vhost as a NEW file + Let's Encrypt (certbot)
  offsite-setup [--allow-unencrypted]
                            configure ENCRYPTED off-site backups with rclone (crypt remote)
  offsite-fetch [latest|TIMESTAMP] [--list]
                            download a backup set from the off-site copy (e.g. on a new server)
  alert-test                send a test alert; fails when no channel delivers it
  harden-ssh [--undo]       SSH: keys only (sshd_config.d/00-evcar-hardening.conf)
  mail-outbox               how to read e-mails captured while SMTP is not configured
  set KEY=VALUE             change a setting in the env file (then: sudo evcar up)
  set KEY                   same, the value is asked without echo — for passwords, API keys, webhook URLs
  compose <args>            raw docker compose with the right files
  version

Config: $EVCAR_ENV_FILE
EOF
}

# ---------------------------------------------------------------------------
# configuration
# ---------------------------------------------------------------------------

preflight_config() {
  local api missing=() k
  api=$(env_get API_DOMAIN '')
  valid_domain "$api" || die "API_DOMAIN='$api' is not a valid domain name (edit $EVCAR_ENV_FILE)"
  if [[ -n $(admin_domain) ]] && ! valid_domain "$(admin_domain)"; then
    die "ADMIN_DOMAIN='$(admin_domain)' is not a valid domain name"
  fi
  for k in POSTGRES_SUPERUSER_PASSWORD APP_DB_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET IP_HASH_SALT ACME_EMAIL; do
    [[ -n $(env_get "$k" '') ]] || missing+=("$k")
  done
  ((${#missing[@]} == 0)) || die "missing values in $EVCAR_ENV_FILE: ${missing[*]}"
  for k in APP_DB_PASSWORD REDIS_PASSWORD POSTGRES_SUPERUSER_PASSWORD; do
    [[ $(env_get "$k") =~ ^[A-Za-z0-9_-]{16,}$ ]] ||
      die "$k must be at least 16 characters of [A-Za-z0-9_-] (it is used inside URLs)"
  done
  [[ $(env_get APP_DB_USER evcar_app) =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || die "APP_DB_USER must match [a-z_][a-z0-9_]*"
  [[ $(db_name) =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || die "POSTGRES_DB must match [a-z_][a-z0-9_]*"
  [[ -n $(env_get SMTP_HOST '') ]] || die "SMTP_HOST is empty: the backend refuses to start in production without SMTP (use SMTP_HOST=mailpit for the local outbox)"
}

images_present() {
  docker image inspect "localhost/evcar-backend:$EVCAR_RELEASE" >/dev/null 2>&1 || return 1
  if [[ -n $(admin_domain) ]]; then
    docker image inspect "localhost/evcar-admin:$EVCAR_RELEASE" >/dev/null 2>&1 || return 1
  fi
  return 0
}

build_images() {
  local svcs=(api) svc parallel
  [[ -n $(admin_domain) ]] && svcs+=(admin)
  info "building images (${svcs[*]}, release $EVCAR_RELEASE) — the first build can take 5-20 minutes on a small server"
  # Compose builds services concurrently (npm ci + tsc next to npm ci + vite).
  # Below 3 GB of RAM, and while the live stack keeps running during an
  # update, one build at a time keeps the OOM killer away from production.
  parallel=$(env_get EVCAR_BUILD_PARALLEL auto)
  if [[ $parallel == auto ]]; then
    if (($(ram_mb) < 3072)); then parallel=false; else parallel=true; fi
  fi
  if [[ $parallel == true ]]; then
    dc build --pull "${svcs[@]}"
  else
    for svc in "${svcs[@]}"; do
      info "building $svc (one image at a time: EVCAR_BUILD_PARALLEL=$(env_get EVCAR_BUILD_PARALLEL auto), RAM $(ram_mb) MB)"
      COMPOSE_PARALLEL_LIMIT=1 dc build --pull "$svc"
    done
  fi
}

# Role, password and database come from the postgres container's environment
# (\getenv in db-bootstrap.sql): the password is never on a command line.
db_bootstrap() {
  dc exec -T postgres sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -f -' \
    <"$DEPLOY_DIR/lib/db-bootstrap.sql" >/dev/null
}

profile_enabled() {
  local p
  for p in "${EVCAR_PROFILES[@]}"; do [[ $p == "$1" ]] && return 0; done
  return 1
}

# Containers of services whose profile was switched off (e.g. worker mode
# changed to "combined") are not orphans for compose: remove them explicitly.
remove_disabled_services() {
  local svc profile id
  for svc in worker:worker admin:admin mailpit:mail-outbox; do
    profile=${svc#*:}
    svc=${svc%%:*}
    if ! profile_enabled "$profile"; then
      id=$(service_container "$svc")
      if [[ -n $id ]]; then
        info "removing disabled service $svc"
        docker rm -f "$id" >/dev/null
      fi
    fi
  done
}

start_stack() {
  info "starting postgres and redis"
  dc up -d postgres redis
  wait_healthy postgres 240 || die "postgres is not healthy: sudo evcar logs postgres"
  wait_healthy redis 90 || die "redis is not healthy: sudo evcar logs redis"
  db_bootstrap
  remove_disabled_services
  info "starting the application (${EVCAR_PROFILES[*]:-api only})"
  dc up -d --remove-orphans
  info "waiting for the API to become healthy (first start runs all migrations)"
  if ! wait_healthy api 480; then
    dc logs --tail 60 api >&2 || true
    die "the API did not become healthy (see logs above; sudo evcar logs api)"
  fi
  if profile_enabled worker && ! wait_healthy worker 240; then
    warn "the worker is not healthy yet: sudo evcar logs worker"
  fi
  ok "stack is up (release $EVCAR_RELEASE)"
}

# ---------------------------------------------------------------------------
# systemd timers (backup, restore test, monitoring)
# ---------------------------------------------------------------------------

readonly EVCAR_TIMERS=(evcar-backup.timer evcar-restore-test.timer evcar-monitor.timer)

have_systemd() { command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; }

# Timers that are not enabled + active (printed one per line).
missing_timers() {
  local t
  for t in "${EVCAR_TIMERS[@]}"; do
    if ! systemctl is-enabled -q "$t" 2>/dev/null || ! systemctl is-active -q "$t" 2>/dev/null; then
      printf '%s\n' "$t"
    fi
  done
}

# Installs the timers when one of them is missing (called by up / proxy-setup,
# so an installation that stopped half-way still gets backups and monitoring).
ensure_timers() {
  have_systemd || return 0
  [[ -n $(missing_timers) ]] || return 0
  warn "the backup / restore-test / monitoring timers are not all active: installing them"
  cmd_timers install || warn "could not install the timers; run: sudo evcar timers install"
}

warn_missing_timers() {
  have_systemd || return 0
  local missing
  missing=$(missing_timers | tr '\n' ' ')
  [[ -z ${missing// /} ]] ||
    warn "NOT active: ${missing}— no automatic backups / restore tests / monitoring. Fix: sudo evcar timers install"
}

# ---------------------------------------------------------------------------
# stack commands
# ---------------------------------------------------------------------------

cmd_up() {
  local build=0 arg
  for arg in "$@"; do
    case $arg in
      --build) build=1 ;;
      *) die "unknown option for up: $arg" ;;
    esac
  done
  require_root up
  require_env_file
  ensure_code_root_owned
  take_lock 900
  preflight_config
  render_backend_env
  ensure_dirs
  if [[ ! -s $EVCAR_STATE_DIR/release ]]; then
    # First start: images are tagged with the git commit (rollback needs distinct tags).
    EVCAR_RELEASE=$(release_id)
    export EVCAR_RELEASE
    printf '%s\n' "$EVCAR_RELEASE" >"$EVCAR_STATE_DIR/release"
  fi
  compose_setup
  # The monitor stays quiet while the stack is (re)built and started.
  maintenance_on
  trap maintenance_off EXIT
  # Backups / restore test / monitoring must exist even if this start fails.
  ensure_timers
  if ((build == 1)) || ! images_present; then build_images; fi
  start_stack
  print_endpoints
}

cmd_down() {
  local yes=0 answer
  [[ ${1:-} == --yes || ${1:-} == -y ]] && yes=1
  require_root down
  require_env_file
  if ((yes == 0)); then
    read -r -p "Stop EV Car News (the API will be offline; data is kept)? [y/N] " answer
    [[ $answer =~ ^[Yy]$ ]] || die "aborted"
  fi
  render_backend_env
  compose_setup
  dc --profile worker --profile admin --profile mail-outbox down --remove-orphans
  ok "stopped. Data volumes are kept. Start again with: sudo evcar up"
}

cmd_restart() {
  require_root restart
  require_env_file
  render_backend_env
  compose_setup
  if (($# > 0)); then dc restart "$@"; else dc restart; fi
}

cmd_logs() {
  local follow=() tail=200 svc=()
  while (($# > 0)); do
    case $1 in
      -f | --follow) follow=(-f) ;;
      --tail)
        tail=${2:?--tail needs a number}
        shift
        ;;
      -*) die "unknown option for logs: $1" ;;
      *) svc+=("$1") ;;
    esac
    shift
  done
  require_root logs
  require_env_file
  compose_setup
  dc logs --tail "$tail" "${follow[@]}" "${svc[@]}"
}

api_health_json() {
  dc exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(async r=>{process.stdout.write(await r.text());}).catch(e=>{console.error(e.message);process.exit(1)})" 2>/dev/null
}

json_first_status() { grep -o '"status":"[a-z_]*"' | head -n 1 | cut -d'"' -f4; }

cmd_health() {
  local rc=0 json status api code
  require_root health
  require_env_file
  compose_setup
  api=$(env_get API_DOMAIN)
  if json=$(api_health_json) && [[ -n $json ]]; then
    status=$(printf '%s' "$json" | json_first_status)
    case $status in
      ok) ok "API (inside the server): ok" ;;
      degraded)
        warn "API (inside the server): degraded — $json"
        rc=1
        ;;
      *)
        err "API (inside the server): ${status:-unknown} — $json"
        rc=1
        ;;
    esac
  else
    err "API (inside the server): not reachable (is it running? sudo evcar status)"
    rc=1
  fi
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$api/api/v1/health" 2>/dev/null || true)
  if [[ $code == 200 ]]; then
    ok "public URL https://$api/api/v1/health → 200"
  else
    err "public URL https://$api/api/v1/health → ${code:-no answer} (DNS, TLS certificate or proxy; see: sudo evcar dns-check)"
    rc=1
  fi
  warn_missing_timers
  return "$rc"
}

print_endpoints() {
  local api admin
  api=$(env_get API_DOMAIN)
  admin=$(admin_domain)
  echo
  echo "  API:     https://$api/api/v1   (health: https://$api/api/v1/health)"
  [[ -n $admin ]] && echo "  Admin:   https://$admin"
  echo "  Mode:    $(proxy_mode) · worker: $(worker_mode) · release: $EVCAR_RELEASE"
  if mail_outbox_enabled; then
    echo "  $(bold 'E-mail:') NOT delivered (local outbox). Configure SMTP: see docs/DEPLOYMENT.md"
  fi
  echo
}

cmd_status() {
  require_root status
  require_env_file
  compose_setup
  local root last
  echo "$(bold 'EV Car News') — $(proxy_mode) mode, worker $(worker_mode), release $EVCAR_RELEASE"
  if git_code rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "code: $(git_code rev-parse --abbrev-ref HEAD) @ $(git_code log -1 --format='%h %cs %s' | cut -c1-80)"
  fi
  echo
  dc ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}' || true
  echo
  cmd_health || true
  echo
  bold Disk
  echo
  df -hP / "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /)" 2>/dev/null | awk 'NR == 1 || !seen[$0]++' || true
  echo
  root=$(backup_root)
  last=$(cat "$EVCAR_STATE_DIR/last-backup-ok" 2>/dev/null || echo never)
  echo "$(bold Backups): last successful: $last · local size: $(du -sh "$root" 2>/dev/null | cut -f1 || echo 0)"
  [[ -s $EVCAR_STATE_DIR/last-backup-failed ]] && warn "last backup failure: $(cat "$EVCAR_STATE_DIR/last-backup-failed")"
  echo "Restore test: $(cat "$EVCAR_STATE_DIR/restore-test.last" 2>/dev/null || echo 'never run')"
  echo "Off-site: $(env_get RCLONE_REMOTE 'not configured') ($(offsite_encryption))"
  warn_offsite_encryption
  [[ -s $EVCAR_STATE_DIR/last-offsite-failed ]] && warn "last off-site failure: $(cat "$EVCAR_STATE_DIR/last-offsite-failed")"
  if have_systemd; then
    echo
    systemctl list-timers 'evcar-*' --no-pager 2>/dev/null || true
  fi
  alert_channel_available || warn "$ALERT_NO_CHANNEL_MSG"
  check_published_ports
}

# Docker publishes ports around UFW: warn about anything public except 80/443.
check_published_ports() {
  local line name part parts bad=0
  while read -r line; do
    [[ -z $line ]] && continue
    name=${line%% *}
    IFS=',' read -ra parts <<<"${line#* }"
    for part in "${parts[@]}"; do
      if [[ $part =~ (0\.0\.0\.0|\[::\]|:::):([0-9]+)- ]]; then
        case ${BASH_REMATCH[2]} in
          80 | 443) ;;
          *)
            warn "publicly published port on $name:$part"
            bad=1
            ;;
        esac
      fi
    done
  done < <(docker ps --filter "label=com.docker.compose.project=$EVCAR_COMPOSE_PROJECT" --format '{{.Names}} {{.Ports}}' 2>/dev/null || true)
  ((bad == 0)) && echo "Published ports: only 80/443 public (others bound to 127.0.0.1)"
  return 0
}

# ---------------------------------------------------------------------------
# git / update / rollback
# ---------------------------------------------------------------------------

release_id() {
  local r
  if r=$(git_code rev-parse --short=12 HEAD 2>/dev/null); then printf '%s' "$r"; else date -u +local-%Y%m%d%H%M%S; fi
}

cmd_update() {
  local branch='' pull=1 skip_backup=0 prev new
  while (($# > 0)); do
    case $1 in
      --branch)
        branch=${2:?--branch needs a name}
        shift
        ;;
      --no-pull) pull=0 ;;
      --skip-backup) skip_backup=1 ;;
      *) die "unknown option for update: $1" ;;
    esac
    shift
  done
  require_root update
  require_env_file
  ensure_code_root_owned
  if ((pull == 1)); then
    take_lock 900
    git_code rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
      die "$PROJECT_DIR is not a git checkout: copy the new code there, then run: sudo evcar update --no-pull"
    if [[ -n $(git_code status --porcelain --untracked-files=no) ]]; then
      git_code status --short >&2
      die "local changes in $PROJECT_DIR (listed above) would be overwritten; commit/remove them first"
    fi
    [[ -n $branch ]] || branch=$(env_get EVCAR_GIT_BRANCH "$(git_code rev-parse --abbrev-ref HEAD)")
    info "fetching $branch"
    git_code fetch --prune origin "+refs/heads/$branch:refs/remotes/origin/$branch"
    if [[ $(git_code rev-parse --abbrev-ref HEAD) != "$branch" ]]; then
      git_code checkout -B "$branch" "origin/$branch"
    else
      git_code merge --ff-only "origin/$branch" ||
        die "cannot fast-forward $branch (history was rewritten?). Inspect $PROJECT_DIR manually."
    fi
    env_set EVCAR_GIT_BRANCH "$branch"
    ok "code at $(git_code log -1 --format='%h %s' | cut -c1-72)"
    # Continue with the (possibly new) version of this script.
    local next=(update --no-pull)
    ((skip_backup == 1)) && next+=(--skip-backup)
    exec "$DEPLOY_DIR/evcar.sh" "${next[@]}"
  fi

  take_lock 900
  preflight_config
  render_backend_env
  compose_setup
  maintenance_on
  trap maintenance_off EXIT
  prev=$(current_release)
  new=$(release_id)
  export EVCAR_RELEASE=$new
  build_images
  if ((skip_backup == 0)) && service_running postgres; then
    info "pre-update database backup"
    do_backup pre-update 1 no >/dev/null
  fi
  service_running postgres || {
    dc up -d postgres redis
    wait_healthy postgres 240 || die "postgres is not healthy"
  }
  info "applying database migrations with the new release"
  dc run --rm --no-deps -e RUN_MIGRATIONS=true -e RUN_REFERENCE_SEED=true api true
  if [[ $prev != "$new" ]]; then printf '%s\n' "$prev" >"$EVCAR_STATE_DIR/release.previous"; fi
  printf '%s\n' "$new" >"$EVCAR_STATE_DIR/release"
  start_stack
  prune_images "$new" "$prev"
  print_endpoints
  ok "update finished. If something is wrong: sudo evcar rollback (see docs for database rollback)"
}

# Keeps the images of the given releases, of the running release and of the
# release `evcar rollback` would start (state/release.previous); removes older ones.
# (A no-op update has new == prev: release.previous then still names the
# release before, whose images must survive.)
prune_images() {
  local ref tag keep=" $* " k
  for k in "$(current_release)" "$(tr -cd 'A-Za-z0-9._-' <"$EVCAR_STATE_DIR/release.previous" 2>/dev/null || true)"; do
    [[ -n $k ]] && keep+="$k "
  done
  while read -r ref; do
    tag=${ref##*:}
    [[ $keep == *" $tag "* ]] && continue
    docker image rm "$ref" >/dev/null 2>&1 || true
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^localhost/evcar-(backend|admin):' || true)
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
}

cmd_rollback() {
  local prev cur
  require_root rollback
  require_env_file
  take_lock 900
  prev=$(tr -cd 'A-Za-z0-9._-' <"$EVCAR_STATE_DIR/release.previous" 2>/dev/null || true)
  [[ -n $prev ]] || die "no previous release recorded"
  cur=$(current_release)
  docker image inspect "localhost/evcar-backend:$prev" >/dev/null 2>&1 || die "the image of release $prev no longer exists"
  warn "rolling back $cur → $prev. Database migrations are NOT reverted: if the new release changed the"
  warn "schema in an incompatible way, restore the pre-update backup (sudo evcar backups; sudo evcar restore <dir>)."
  preflight_config
  render_backend_env
  export EVCAR_RELEASE=$prev
  compose_setup
  printf '%s\n' "$cur" >"$EVCAR_STATE_DIR/release.previous"
  printf '%s\n' "$prev" >"$EVCAR_STATE_DIR/release"
  start_stack
}

# ---------------------------------------------------------------------------
# database commands
# ---------------------------------------------------------------------------

ensure_data_services() {
  if ! service_running postgres || ! service_running redis; then
    dc up -d postgres redis
    wait_healthy postgres 240 || die "postgres is not healthy"
    wait_healthy redis 90 || die "redis is not healthy"
  fi
}

cmd_migrate() {
  require_root migrate
  require_env_file
  take_lock 900
  preflight_config
  render_backend_env
  compose_setup
  ensure_data_services
  db_bootstrap
  dc run --rm --no-deps -e RUN_MIGRATIONS=true -e RUN_REFERENCE_SEED=false api true
  ok "migrations applied"
}

cmd_seed() {
  local arg
  for arg in "$@"; do
    case $arg in
      --demo)
        die "demo data is fictional and is NEVER loaded in production (NODE_ENV=production). Use a local development environment for demos."
        ;;
      *) die "unknown option for seed: $arg" ;;
    esac
  done
  require_root seed
  require_env_file
  preflight_config
  render_backend_env
  compose_setup
  ensure_data_services
  dc run --rm --no-deps -e RUN_MIGRATIONS=false -e RUN_REFERENCE_SEED=true api true
  ok "reference seed applied (roles, permissions, markets, currencies, settings...)"
}

cmd_create_owner() {
  local email='' name='' set_password=0 out token pw pw2 status
  while (($# > 0)); do
    case $1 in
      --email)
        email=${2:-}
        shift
        ;;
      --name)
        name=${2:-}
        shift
        ;;
      --set-password) set_password=1 ;;
      *) die "unknown option for create-owner: $1" ;;
    esac
    shift
  done
  valid_email "$email" || die "usage: sudo evcar create-owner --email you@example.com [--name \"Your Name\"] [--set-password]"
  require_root create-owner
  require_env_file
  compose_setup
  service_running api || die "the API is not running (sudo evcar up)"
  local args=(node dist/cli/create-owner.js --email "$email")
  [[ -n $name ]] && args+=(--name "$name")
  if [[ -z $(admin_domain) && $set_password -eq 0 ]]; then
    warn "no admin panel is deployed (ADMIN_DOMAIN empty): the link below cannot be opened;"
    warn "re-run with --set-password to choose the password here instead."
  fi
  if ((set_password == 0)); then
    dc exec -T api "${args[@]}"
    echo
    echo "Open the link above in a browser within 24 hours to choose the owner's password."
    echo "It is shown only once and is not stored anywhere in clear text."
    return 0
  fi
  out=$(dc exec -T api "${args[@]}") || die "create-owner failed"
  token=$(printf '%s\n' "$out" | grep -oE 'token=[A-Za-z0-9_-]+' | head -n 1 | cut -d= -f2 || true)
  printf '%s\n' "$out" | grep -v 'token=' | grep -v '"token"' || true
  [[ -n $token ]] || die "could not read the setup token from create-owner's output"
  [[ -t 0 ]] || die "--set-password needs an interactive terminal"
  read -r -s -p "New password for $email (min. length per the app rules): " pw
  echo
  read -r -s -p "Repeat the password: " pw2
  echo
  [[ $pw == "$pw2" ]] || die "passwords do not match (run the command again; a new link is issued each time)"
  # Token and password travel on stdin (never on a command line).
  status=$(printf '%s\n%s\n' "$token" "$pw" | dc exec -T api node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',async()=>{
      const i=d.indexOf('\n');const token=d.slice(0,i);const password=d.slice(i+1).replace(/\n$/,'');
      const r=await fetch('http://127.0.0.1:3000/api/v1/auth/reset-password',{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({token,password})});
      const t=await r.text();process.stdout.write(String(r.status));if(r.status!==204)console.error(t);
    });")
  pw='' pw2=''
  [[ $status == 204 ]] || die "the API refused the password (HTTP ${status:-?}; see the message above). Run create-owner again."
  ok "password set. Sign in to the admin panel (or the app) with $email"
}

cmd_psql() {
  require_root psql
  require_env_file
  compose_setup
  local tty=(-T)
  [[ -t 0 && -t 1 ]] && tty=()
  dc exec "${tty[@]}" postgres sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

# ---------------------------------------------------------------------------
# backups
# ---------------------------------------------------------------------------

backup_root() { env_get BACKUP_DIR "$EVCAR_HOME/backups"; }

keep_count() {
  case $1 in
    daily) env_get BACKUP_KEEP_DAILY 7 ;;
    weekly) env_get BACKUP_KEEP_WEEKLY 4 ;;
    manual) env_get BACKUP_KEEP_MANUAL 5 ;;
    offsite) echo 2 ;;
    *) echo 3 ;;
  esac
}

ts_to_epoch() {
  local t=$1
  date -u -d "${t:0:4}-${t:4:2}-${t:6:2}T${t:9:2}:${t:11:2}:${t:13:2}Z" +%s 2>/dev/null || echo 0
}

list_backup_dirs() { # newest first: "<timestamp> <path>"
  local root
  root=$(backup_root)
  [[ -d $root ]] || return 0
  find "$root" -mindepth 2 -maxdepth 2 -type d -name '2*Z' -printf '%f %p\n' 2>/dev/null | sort -r
}

resolve_backup() {
  local target=$1 found
  if [[ $target == latest ]]; then
    found=$(list_backup_dirs | head -n 1 | cut -d' ' -f2-)
  elif [[ -d $target ]]; then
    found=$(cd "$target" && pwd)
  else
    found=$(list_backup_dirs | awk -v t="$target" '$1 == t { print $2; exit }')
  fi
  [[ -n $found && -f $found/SHA256SUMS ]] || die "backup not found: $target (list them with: sudo evcar backups)"
  printf '%s' "$found"
}

verify_checksums() {
  (cd "$1" && sha256sum --quiet --strict -c SHA256SUMS) || die "checksum verification FAILED for $1 (corrupted backup)"
}

# ---------------------------------------------------------------------------
# media of a backup set
#
# Format v2 (this version): media/ is a full copy of the storage volume, but a
# file that did not change since the previous backup is a HARD LINK to that
# backup's copy (rsync --link-dest): media files are immutable, so every set
# is complete while the disk holds each file once. media.sha256 lists every
# file's checksum (hashes of hard-linked files are reused, not recomputed).
# Format v1 (older sets): one media.tar per set. Both can be restored.
# ---------------------------------------------------------------------------

readonly MEDIA_RSYNC_EXCLUDES=(--exclude=/tmp/ --exclude=/.multipart/ --exclude='*.part' --exclude='*.tmp')
readonly MIB64=67108864

media_format() { # media_format SET → tree | tar | none
  if [[ -d $1/media && -f $1/media.sha256 ]]; then
    echo tree
  elif [[ -f $1/media.tar ]]; then
    echo tar
  else
    echo none
  fi
}

# Host path of the storage volume ('' → stream it through the api image).
storage_host_path() {
  local p
  [[ $(env_get EVCAR_BACKUP_MEDIA_METHOD auto) != stream ]] || return 1
  command -v rsync >/dev/null 2>&1 || return 1
  p=$(docker volume inspect -f '{{.Mountpoint}}' "${EVCAR_COMPOSE_PROJECT}_storage" 2>/dev/null) || return 1
  [[ -n $p && -d $p ]] || return 1
  printf '%s' "$p"
}

# The 2 newest backup sets that have a media tree (hard-link sources).
media_link_sources() {
  local ts path n=0
  while read -r ts path; do
    [[ -n $path && $(media_format "$path") == tree ]] || continue
    printf '%s\n' "$path"
    n=$((n + 1))
    ((n < 2)) || break
  done < <(list_backup_dirs)
}

# media_new_bytes SRC LINK_SOURCE... → bytes the next snapshot has to copy
# (files not identical to a file of the previous snapshot); '' when unknown.
media_new_bytes() {
  local src=$1 d links=() empty out
  shift
  for d in "$@"; do links+=("--link-dest=$d/media"); done
  empty=$(mktemp -d)
  out=$(LC_ALL=C rsync -a --dry-run --stats --no-human-readable --numeric-ids "${MEDIA_RSYNC_EXCLUDES[@]}" \
    "${links[@]}" "$src/" "$empty/" 2>/dev/null | awk -F': ' '/^Total transferred file size/ { gsub(/[^0-9]/, "", $2); print $2 }') || out=''
  rmdir "$empty" 2>/dev/null || rm -rf "$empty"
  printf '%s' "$out"
}

# Size of the storage volume measured inside the api image ('' when unknown).
media_total_bytes() {
  dc run --rm --no-deps -T --entrypoint du api -sb /app/storage 2>/dev/null | awk 'NR == 1 { print $1 + 0 }' || true
}

# plan_backup_space ROOT WITH_MEDIA(true|false) — the dump (written first inside
# the postgres container, i.e. on Docker's disk, then copied to ROOT) and the new
# media bytes must fit while BACKUP_MIN_FREE_PERCENT of each disk stays free.
# Sets BACKUP_MEDIA_FITS=1|0. Fails the backup when not even the dump fits.
plan_backup_space() {
  local root=$1 with_media=$2 dbsize docker_root same=0 need_root need_docker media_new src
  BACKUP_MEDIA_FITS=0
  dbsize=$(pg_super -d "$(db_name)" -Atc "SELECT pg_database_size(current_database())" 2>/dev/null || echo 0)
  [[ $dbsize =~ ^[0-9]+$ ]] || dbsize=0
  docker_root=$(docker_root_dir)
  [[ -d $docker_root && $(fs_dev "$docker_root") == "$(fs_dev "$root")" ]] && same=1
  need_root=$((dbsize + MIB64))
  need_docker=$((dbsize + MIB64))
  ((same == 1)) && need_root=$((2 * dbsize + MIB64))
  if ! space_ok "$root" "$need_root"; then
    backup_failed "$BACKUP_KIND" "not enough free disk space in $root for the database dump ($(human_bytes "$(fs_avail "$root")") free, ~$(human_bytes "$need_root") needed while keeping $(env_get BACKUP_MIN_FREE_PERCENT 15)% of the disk free). Delete old backups or *_pre_restore_* databases, or add disk space"
  fi
  if ((same == 0)) && [[ -d $docker_root ]] && ! space_ok "$docker_root" "$need_docker"; then
    backup_failed "$BACKUP_KIND" "not enough free disk space in $docker_root (Docker) for the temporary database dump (~$(human_bytes "$need_docker") needed)"
  fi
  [[ $with_media == true ]] || return 0
  if src=$(storage_host_path); then
    local links=()
    mapfile -t links < <(media_link_sources)
    media_new=$(media_new_bytes "$src" "${links[@]}")
  else
    media_new=$(media_total_bytes)
  fi
  if [[ ! $media_new =~ ^[0-9]+$ ]]; then
    warn "could not measure the media files; assuming they fit"
    media_new=0
  fi
  if space_ok "$root" $((need_root + media_new)); then
    BACKUP_MEDIA_FITS=1
    info "media: ~$(human_bytes "$media_new") of new/changed files to copy"
  else
    warn "media: ~$(human_bytes "$media_new") of new files do not fit in $root while keeping $(env_get BACKUP_MIN_FREE_PERCENT 15)% free — this backup is DATABASE ONLY"
  fi
}

# space_for_db_copy → 0 when Docker's disk can hold a temporary copy of the
# database (x1.3, for restore / restore-test) and still keep the reserve free;
# otherwise prints the reason and returns 1.
space_for_db_copy() {
  local dbsize need root
  dbsize=$(pg_super -d "$(db_name)" -Atc "SELECT pg_database_size(current_database())" 2>/dev/null || echo 0)
  [[ $dbsize =~ ^[0-9]+$ ]] || dbsize=0
  need=$((dbsize * 13 / 10 + MIB64))
  root=$(docker_root_dir)
  [[ -d $root ]] || return 0
  if ! space_ok "$root" "$need"; then
    printf 'not enough free disk space in %s for a temporary copy of the database (~%s needed, %s free, keeping %s%% of the disk free)\n' \
      "$root" "$(human_bytes "$need")" "$(human_bytes "$(fs_avail "$root")")" "$(env_get BACKUP_MIN_FREE_PERCENT 15)"
    return 1
  fi
}

ensure_space_for_db_copy() {
  local msg
  msg=$(space_for_db_copy) || die "$1: $msg"
}

# snapshot_media TMP → TMP/media (0 = ok). Files that vanish during the copy
# (media deleted meanwhile) and in-progress uploads (*.part) are not errors.
snapshot_media() {
  local tmp=$1 src rc=0 links=() d
  install -d -m 700 "$tmp/media"
  if src=$(storage_host_path); then
    while read -r d; do [[ -n $d ]] && links+=("--link-dest=$d/media"); done < <(media_link_sources)
    rsync -a --numeric-ids "${MEDIA_RSYNC_EXCLUDES[@]}" "${links[@]}" "$src/" "$tmp/media/" || rc=$?
    case $rc in
      0) return 0 ;;
      24)
        info "some media files were deleted during the copy (normal while the site is in use)"
        return 0
        ;;
      *)
        err "rsync of the media files failed (exit $rc)"
        return 1
        ;;
    esac
  fi
  # No host access to the volume (or EVCAR_BACKUP_MEDIA_METHOD=stream): full
  # copy through the api image. GNU tar exits 1 for "file changed/removed as
  # we read it" (uploads during the backup): only >= 2 is an error.
  info "media: streaming through the api image (full copy, no hard links)"
  local src_rc
  {
    dc run --rm --no-deps -T --entrypoint tar api -C /app/storage -cf - --warning=no-file-changed --warning=no-file-removed \
      --exclude=./tmp --exclude=./.multipart --exclude='*.part' --exclude='*.tmp' .
    echo "$?" >"$tmp/.media_src_rc"
  } | tar -C "$tmp/media" -xf - || rc=$?
  src_rc=$(cat "$tmp/.media_src_rc" 2>/dev/null || echo 2)
  rm -f "$tmp/.media_src_rc"
  if ((rc != 0)) || [[ ! $src_rc =~ ^[01]$ ]]; then
    err "media archive failed (tar in the container: exit $src_rc, extraction: exit $rc)"
    return 1
  fi
}

# hash_media TMP LINK_SOURCE... → TMP/media.sha256 (sha256sum format, paths
# "./..."). The hash of a file that is a hard link of the same path in a
# previous set is taken from that set's media.sha256 instead of re-reading it.
hash_media() {
  local tmp=$1
  shift
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$tmp/media" "$@" >"$tmp/media.sha256" <<'PY'
import hashlib, os, sys
new = os.fsencode(sys.argv[1])
prevs = [os.fsencode(p) for p in sys.argv[2:]]
known = []
for p in prevs:
    table = {}
    try:
        with open(os.path.join(p, b"media.sha256"), "rb") as f:
            for line in f:
                line = line.rstrip(b"\n")
                if len(line) > 66 and line[64:66] == b"  " and not line.startswith(b"\\"):
                    table[line[66:]] = line[:64]
    except OSError:
        pass
    known.append((os.path.join(p, b"media"), table))
out = sys.stdout.buffer
for root, dirs, files in os.walk(new):
    dirs.sort()
    for name in sorted(files):
        path = os.path.join(root, name)
        st = os.lstat(path)
        if not os.path.isfile(path) or os.path.islink(path):
            continue
        rel = b"./" + os.path.relpath(path, new)
        digest = None
        for pmedia, table in known:
            h = table.get(rel)
            if h is None:
                continue
            try:
                pst = os.lstat(os.path.join(pmedia, rel[2:]))
            except OSError:
                continue
            if (pst.st_ino, pst.st_dev) == (st.st_ino, st.st_dev):
                digest = h
                break
        if digest is None:
            h = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            digest = h.hexdigest().encode()
        if b"\\" in rel or b"\n" in rel:
            out.write(b"\\" + digest + b"  " + rel.replace(b"\\", b"\\\\").replace(b"\n", b"\\n") + b"\n")
        else:
            out.write(digest + b"  " + rel + b"\n")
PY
  else
    (cd "$tmp/media" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) >"$tmp/media.sha256"
  fi
}

# verify_media SET → 0 when every media file matches its checksum.
verify_media() {
  local set=$1
  case $(media_format "$set") in
    tree)
      if [[ ! -s $set/media.sha256 ]]; then
        [[ -z $(find "$set/media" -type f -print -quit) ]]
      else
        (cd "$set/media" && sha256sum --quiet --strict -c ../media.sha256)
      fi
      ;;
    tar) tar -tf "$set/media.tar" >/dev/null ;;
    *) return 0 ;;
  esac
}

media_file_count() {
  case $(media_format "$1") in
    tree) wc -l <"$1/media.sha256" | tr -d ' ' ;;
    tar) tar -tf "$1/media.tar" | grep -vc '/$' || true ;;
    *) echo 0 ;;
  esac
}

# restore_media SET → writes the set's media back into the storage volume
# (files that exist only in the volume are kept).
restore_media() {
  local set=$1
  case $(media_format "$set") in
    tree) tar -C "$set/media" -cf - . | dc run --rm --no-deps -T --entrypoint tar api -C /app/storage -xf - ;;
    tar) dc run --rm --no-deps -T --entrypoint tar api -C /app/storage -xf - <"$set/media.tar" ;;
    *) return 0 ;;
  esac
}

# do_backup KIND DB_ONLY(0|1) OFFSITE(auto|yes|no) → prints the backup directory
do_backup() {
  local kind=$1 db_only=$2 offsite=$3 root ts dir tmp media cfile media_problem='' links=()
  BACKUP_KIND=$kind
  root=$(backup_root)
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  # Two sets in the same second: `mv` would nest the new one inside the old one.
  while [[ -e $root/$kind/$ts || -e $root/.tmp-$kind-$ts ]]; do
    sleep 1
    ts=$(date -u +%Y%m%dT%H%M%SZ)
  done
  dir="$root/$kind/$ts"
  tmp="$root/.tmp-$kind-$ts"
  install -d -m 700 "$root" "$root/$kind"
  find "$root" -maxdepth 1 -name '.tmp-*' -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
  service_running postgres || die "postgres is not running (sudo evcar up)"
  media=$(env_get BACKUP_INCLUDE_MEDIA true)
  ((db_only == 1)) && media=false
  plan_backup_space "$root" "$media"
  if [[ $media == true && $BACKUP_MEDIA_FITS == 0 ]]; then
    media=false
    media_problem="media NOT backed up: not enough free disk space in $root"
  fi
  install -d -m 700 "$tmp"

  info "backup $kind/$ts: database"
  cfile=/tmp/evcar-backup.dump
  if ! dc exec -T postgres sh -c 'set -eu; umask 077; rm -f "$1"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$1"; pg_restore -l "$1" >/dev/null' sh "$cfile" ||
    ! dc exec -T postgres cat "$cfile" >"$tmp/db.dump" ||
    ! dc exec -T postgres sh -c 'pg_restore --data-only -f - "$1" | awk "$2"' sh "$cfile" "$AWK_COPY_COUNTS" >"$tmp/db.rowcounts"; then
    dc exec -T postgres rm -f "$cfile" >/dev/null 2>&1 || true
    rm -rf "$tmp"
    backup_failed "$kind" "database dump failed"
  fi
  dc exec -T postgres rm -f "$cfile" >/dev/null 2>&1 || true

  if [[ $media == true ]]; then
    info "backup $kind/$ts: media files (unchanged files are hard links to the previous backup)"
    mapfile -t links < <(media_link_sources)
    if ! snapshot_media "$tmp" || ! hash_media "$tmp" "${links[@]}"; then
      # The database dump above is fine: keep it, record the media failure.
      rm -rf "${tmp:?}/media" "${tmp:?}/media.sha256"
      media=false
      media_problem="media backup FAILED (see: sudo journalctl -u evcar-backup)"
    fi
  fi
  write_manifest "$tmp" "$kind" "$media" "$media_problem"
  local sums
  sums=$(cd "$tmp" && find . -maxdepth 1 -type f -printf '%f\n' | sort | xargs sha256sum)
  printf '%s\n' "$sums" >"$tmp/SHA256SUMS"
  chmod 700 "$tmp"
  mv "$tmp" "$dir"
  rm -f "$EVCAR_STATE_DIR/last-backup-failed"
  ok "backup written: $dir ($(du -sh "$dir" | cut -f1)$([[ $media == true ]] && echo ', media counted in full: files unchanged since the previous backup share its disk space'))"

  if [[ $kind == daily || $kind == manual ]]; then
    date -u +%FT%TZ >"$EVCAR_STATE_DIR/last-backup-ok"
    if [[ $(env_get BACKUP_INCLUDE_MEDIA true) == true && $db_only == 0 ]]; then
      if [[ -n $media_problem ]]; then
        printf '%s %s: %s\n' "$(date -u +%FT%TZ)" "$kind" "$media_problem" >"$EVCAR_STATE_DIR/last-backup-media-failed"
        send_alert "[EV Car News] MEDIA BACKUP PROBLEM on $(env_get API_DOMAIN "$(hostname)")" \
          "Backup $dir contains the database but NOT the media files: $media_problem." || true
      else
        rm -f "$EVCAR_STATE_DIR/last-backup-media-failed"
      fi
    fi
  fi
  [[ $kind == daily ]] && promote_weekly "$dir" "$offsite"
  rotate_backups "$root"
  if [[ $offsite == yes || ($offsite == auto && ($kind == daily)) ]]; then
    offsite_upload "$dir" "$kind" || true
  fi
  printf '%s\n' "$dir"
}

backup_failed() {
  local kind=$1 reason=$2
  printf '%s %s: %s\n' "$(date -u +%FT%TZ)" "$kind" "$reason" >"$EVCAR_STATE_DIR/last-backup-failed"
  send_alert "[EV Car News] BACKUP FAILED on $(env_get API_DOMAIN "$(hostname)")" \
    "Backup ($kind) failed: $reason. Check: sudo evcar logs; sudo journalctl -u evcar-backup" || true
  die "backup failed: $reason"
}

write_manifest() {
  local dir=$1 kind=$2 media=$3 problem=${4:-} files=0 bytes=0 tables rows migrations
  tables=$(wc -l <"$dir/db.rowcounts")
  rows=$(awk '{ s += $2 } END { print s + 0 }' "$dir/db.rowcounts")
  migrations=$(awk '$1 == "public._prisma_migrations" { print $2 }' "$dir/db.rowcounts")
  if [[ $media == true ]]; then
    files=$(media_file_count "$dir")
    bytes=$(find "$dir/media" -type f -printf '%s\n' | awk '{ s += $1 } END { print s + 0 }')
  fi
  {
    echo "format=evcar-backup-v2"
    echo "created_at=$(date -u +%FT%TZ)"
    echo "kind=$kind"
    echo "host=$(hostname)"
    echo "api_domain=$(env_get API_DOMAIN)"
    echo "release=$(current_release)"
    echo "git_commit=$(git_code rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "database=$(db_name)"
    echo "postgres_version=$(pg_super -d postgres -Atc 'SHOW server_version' 2>/dev/null || echo unknown)"
    echo "db_dump_bytes=$(stat -c %s "$dir/db.dump")"
    echo "db_tables=$tables"
    echo "db_rows=$rows"
    echo "migrations_applied=${migrations:-0}"
    echo "media_included=$media"
    if [[ $media == true ]]; then
      echo "media_format=tree"
      echo "media_files=$files"
      echo "media_bytes=$bytes"
    fi
    [[ -n $problem ]] && echo "media_problem=$problem"
    return 0
  } >"$dir/manifest.txt"
}

promote_weekly() {
  local dir=$1 offsite=$2 root newest ts
  root=$(backup_root)
  install -d -m 700 "$root/weekly"
  newest=$(find "$root/weekly" -mindepth 1 -maxdepth 1 -type d -name '2*Z' -printf '%f\n' | sort -r | head -n 1)
  ts=$(basename "$dir")
  if [[ -z $newest ]] || (($(ts_to_epoch "$ts") - $(ts_to_epoch "$newest") >= 6 * 86400 + 12 * 3600)); then
    cp -al "$dir" "$root/weekly/$ts"
    ok "weekly backup: $root/weekly/$ts"
    if [[ $offsite != no ]]; then offsite_upload "$root/weekly/$ts" weekly || true; fi
  fi
}

rotate_backups() {
  local root=$1 kind keep d
  for kind in daily weekly manual pre-update pre-restore offsite; do
    [[ -d $root/$kind ]] || continue
    keep=$(keep_count "$kind")
    [[ $keep =~ ^[0-9]+$ && $keep -ge 1 ]] || keep=1
    while read -r d; do
      [[ -n $d ]] || continue
      rm -rf -- "${root:?}/$kind/$d"
      info "rotated out $kind/$d"
    done < <(find "$root/$kind" -mindepth 1 -maxdepth 1 -type d -name '2*Z' -printf '%f\n' | sort -r | tail -n +$((keep + 1)))
  done
}

rclone_cmd() {
  rclone --config "$(rclone_conf)" "$@"
}

offsite_failed() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >"$EVCAR_STATE_DIR/last-offsite-failed"
  send_alert "[EV Car News] OFF-SITE BACKUP FAILED" "$1. The local backup is fine." || true
}

offsite_upload() {
  local dir=$1 kind=$2 remote keep d dest
  remote=$(env_get RCLONE_REMOTE '')
  [[ -n $remote ]] || return 0
  if ! command -v rclone >/dev/null 2>&1; then
    warn "RCLONE_REMOTE is set but rclone is not installed (sudo evcar offsite-setup)"
    offsite_failed "rclone is not installed"
    return 1
  fi
  # The dump holds e-mails, password hashes and sessions: never upload it in clear.
  if [[ $(offsite_encryption) != encrypted ]] && ! offsite_allowed_unencrypted; then
    warn_offsite_encryption
    offsite_failed "off-site copy REFUSED: $remote is not an rclone 'crypt' remote (sudo evcar offsite-setup)"
    return 1
  fi
  dest="$remote/$kind/$(basename "$dir")"
  info "off-site copy → $dest"
  local ok_upload=1
  rclone_cmd copy "$dir" "$dest" --exclude '/media/**' --transfers 2 --retries 5 --low-level-retries 10 || ok_upload=0
  # Media as ONE object (thousands of small tiles would be slow and costly as
  # separate uploads); `evcar offsite-fetch` unpacks it again.
  if ((ok_upload == 1)) && [[ $(media_format "$dir") == tree ]]; then
    tar -C "$dir" -cf - media | rclone_cmd rcat "$dest/media.tar" --retries 1 || ok_upload=0
  fi
  if ((ok_upload == 0)); then
    offsite_failed "rclone could not copy $dir to $remote"
    return 1
  fi
  rm -f "$EVCAR_STATE_DIR/last-offsite-failed"
  keep=$(keep_count "$kind")
  while read -r d; do
    [[ -n $d ]] || continue
    rclone_cmd purge "$remote/$kind/$d" || warn "could not prune remote $kind/$d"
  done < <(rclone_cmd lsf --dirs-only "$remote/$kind" 2>/dev/null | tr -d '/' | grep -E '^2[0-9]{7}T[0-9]{6}Z$' | sort -r | tail -n +$((keep + 1)))
  ok "off-site copy done"
}

cmd_backup() {
  local kind=manual db_only=0 offsite=auto
  while (($# > 0)); do
    case $1 in
      --scheduled) kind=daily ;;
      --db-only) db_only=1 ;;
      --offsite) offsite=yes ;;
      --no-offsite) offsite=no ;;
      *) die "unknown option for backup: $1" ;;
    esac
    shift
  done
  require_root backup
  require_env_file
  take_lock 3600
  render_backend_env
  compose_setup
  do_backup "$kind" "$db_only" "$offsite" >/dev/null
}

cmd_backups() {
  require_root backups
  require_env_file
  local ts path kind size content paths=() sizes=() i
  while read -r ts path; do
    [[ -n $ts ]] && paths+=("$path")
  done < <(list_backup_dirs)
  # One du over all sets, newest first: a file shared (hard-linked) between
  # sets is counted once, in the newest set that has it.
  if ((${#paths[@]} > 0)); then
    mapfile -t sizes < <(du -sh "${paths[@]}" 2>/dev/null | cut -f1)
  fi
  printf '%-12s %-18s %8s  %s\n' KIND TIMESTAMP 'SIZE*' CONTENT
  for i in "${!paths[@]}"; do
    path=${paths[$i]}
    kind=$(basename "$(dirname "$path")")
    content=db
    [[ $(media_format "$path") != none ]] && content="db+media"
    printf '%-12s %-18s %8s  %s\n' "$kind" "$(basename "$path")" "${sizes[$i]:-?}" "$content"
  done
  echo "* disk space used by each set beyond the newer ones (media shared with a newer set are not counted again)."
  echo "Total: $(du -sh "$(backup_root)" 2>/dev/null | cut -f1) in $(backup_root)"
}

# restore_dump_into DUMP TARGET_DB EXPECTED_COUNTS_OUT
# Creates TARGET_DB (owned by the app role), restores DUMP into it as the app
# role, and writes the row counts contained in DUMP to EXPECTED_COUNTS_OUT.
restore_dump_into() {
  local dump=$1 target=$2 expected=$3 cfile="/tmp/evcar-restore-$2.dump"
  dc exec -T postgres sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v target="$1" -v app_user="$APP_DB_USER" -f -' sh "$target" <<'SQL'
CREATE DATABASE :"target" OWNER :"app_user" TEMPLATE template0 ENCODING 'UTF8';
REVOKE CONNECT, TEMPORARY ON DATABASE :"target" FROM PUBLIC;
SQL
  pg_super -d "$target" -f - <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SQL
  local ext_tables
  ext_tables=$(pg_super -d "$target" -At -c "$SQL_EXTENSION_TABLES" | tr '\n' ' ')
  dc exec -T postgres sh -c 'umask 077; cat >"$1"' sh "$cfile" <"$dump"
  # Extensions were created above by the superuser: skip them (their comments
  # and their tables' data) so the whole restore runs as the unprivileged
  # owner role — objects end up owned by it, exactly like after migrations.
  if ! dc exec -T postgres sh -c '
    set -eu
    pg_restore -l "$1" | awk -v skip=" $3 " "$4" >"$1.list"
    pg_restore -U "$APP_DB_USER" -d "$2" --no-owner --no-acl --exit-on-error --single-transaction -L "$1.list" "$1"
  ' sh "$cfile" "$target" "$ext_tables" "$AWK_TOC_FILTER"; then
    dc exec -T postgres rm -f "$cfile" "$cfile.list" >/dev/null 2>&1 || true
    return 1
  fi
  dc exec -T postgres sh -c 'pg_restore --data-only -f - "$1" | awk "$2"' sh "$cfile" "$AWK_COPY_COUNTS" >"$expected"
  dc exec -T postgres rm -f "$cfile" "$cfile.list" >/dev/null 2>&1 || true
}

# verify_restored_db TARGET_DB EXPECTED_COUNTS → prints a summary; non-zero on mismatch.
verify_restored_db() {
  local target=$1 expected=$2 actual ext failed=0 summary
  actual=$(mktemp)
  ext=$(mktemp)
  pg_super -d "$target" -At -F ' ' -c "$SQL_TABLE_COUNTS" >"$actual"
  pg_super -d "$target" -At -c "$SQL_EXTENSION_TABLES" >"$ext"
  if ! summary=$(awk '
      FILENAME == ARGV[1] { skip[$1] = 1; next }
      FILENAME == ARGV[2] { want[$1] = $2; next }
      { got[$1] = $2 }
      END {
        bad = 0; tables = 0; rows = 0
        for (t in want) {
          if (t in skip) continue
          tables++; rows += want[t]
          if (!(t in got)) { print "MISSING table " t; bad++ }
          else if (got[t] != want[t]) { print "MISMATCH " t ": backup=" want[t] " restored=" got[t]; bad++ }
        }
        for (t in got) if (!(t in want) && !(t in skip)) print "note: table " t " not in the backup (rows=" got[t] ")"
        print "tables=" tables " rows=" rows " mismatches=" bad
        exit bad > 0 ? 1 : 0
      }' "$ext" "$expected" "$actual"); then
    failed=1
  fi
  printf '%s\n' "$summary"
  rm -f "$actual" "$ext"
  local bad_migrations
  bad_migrations=$(pg_super -d "$target" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL" 2>/dev/null || echo error)
  if [[ $bad_migrations != 0 ]]; then
    echo "migrations: ${bad_migrations} unfinished/rolled back (or table missing)"
    failed=1
  else
    echo "migrations: $(pg_super -d "$target" -Atc 'SELECT count(*) FROM _prisma_migrations') applied, none failed"
  fi
  if ! pg_super -d "$target" -Atc "SELECT 'postgis ' || postgis_lib_version()"; then
    failed=1
  fi
  return "$failed"
}

drop_database() {
  dc exec -T postgres sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v db="$1" -f -' sh "$1" <<'SQL' >/dev/null
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'db' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS :"db";
SQL
}

cmd_restore_test() {
  local target=latest scheduled=0 dir tmpdb expected result rc=0 manifest_files files
  while (($# > 0)); do
    case $1 in
      --scheduled) scheduled=1 ;;
      -*) die "unknown option for restore-test: $1" ;;
      *) target=$1 ;;
    esac
    shift
  done
  require_root restore-test
  require_env_file
  take_lock 3600
  render_backend_env
  compose_setup
  service_running postgres || die "postgres is not running (sudo evcar up)"
  if ! dir=$(resolve_backup "$target" 2>&1); then
    result="failed $(date -u +%FT%TZ) no backup found"
    printf '%s\n' "$result" >"$EVCAR_STATE_DIR/restore-test.last"
    ((scheduled == 1)) && { send_alert "[EV Car News] RESTORE TEST FAILED" "No backup found to test." || true; }
    die "no backup to test"
  fi
  info "restore test of $dir"
  local space_msg
  if ! space_msg=$(space_for_db_copy); then
    printf 'failed %s %s %s\n' "$(date -u +%FT%TZ)" "$(basename "$dir")" "$space_msg" >"$EVCAR_STATE_DIR/restore-test.last"
    ((scheduled == 1)) && { send_alert "[EV Car News] RESTORE TEST NOT RUN on $(env_get API_DOMAIN)" "$space_msg" || true; }
    die "restore test not run: $space_msg"
  fi
  tmpdb="$(db_name)_restoretest_$(date -u +%Y%m%d%H%M%S)"
  expected=$(mktemp)
  # shellcheck disable=SC2064
  trap "drop_database '$tmpdb' || true; rm -f '$expected'" EXIT
  local out=''
  if ! (cd "$dir" && sha256sum --quiet --strict -c SHA256SUMS); then
    out="checksum verification failed"
    rc=1
  elif [[ ! -f $dir/db.dump ]]; then
    out="no db.dump in the backup"
    rc=1
  elif ! restore_dump_into "$dir/db.dump" "$tmpdb" "$expected"; then
    out="pg_restore failed"
    rc=1
  elif ! out=$(verify_restored_db "$tmpdb" "$expected"); then
    rc=1
  fi
  printf '%s\n' "$out"
  if [[ $rc -eq 0 && $(media_format "$dir") != none ]]; then
    manifest_files=$(env_get media_files '' "$dir/manifest.txt")
    files=$(media_file_count "$dir")
    if ! verify_media "$dir"; then
      out="media files do not match their checksums (corrupted backup)"
      rc=1
    elif [[ -n $manifest_files && $files != "$manifest_files" ]]; then
      out="media: $files files, manifest says $manifest_files"
      rc=1
    else
      echo "media: $files files, checksums verified ($(media_format "$dir"))"
    fi
  fi
  local summary
  summary=$(printf '%s' "$out" | grep -E '^tables=' | head -n 1 || true)
  if ((rc == 0)); then
    result="ok $(date -u +%FT%TZ) $(basename "$dir") $summary"
    ok "restore test passed: $summary"
  else
    result="failed $(date -u +%FT%TZ) $(basename "$dir") $(printf '%s' "$out" | tail -n 3 | tr '\n' ' ')"
    err "restore test FAILED"
    if ((scheduled == 1)); then
      send_alert "[EV Car News] RESTORE TEST FAILED on $(env_get API_DOMAIN)" "Backup $dir could not be restored and verified:
$out" || true
    fi
  fi
  printf '%s\n' "$result" >"$EVCAR_STATE_DIR/restore-test.last"
  return "$rc"
}

stop_api_for_restore() {
  RESTORE_API_STOPPED=1
  dc stop api worker >/dev/null 2>&1 || dc stop api
}

# EXIT trap of `restore`: a failure after the API was stopped must not leave
# the site down.
restore_exit() {
  local rc=$?
  maintenance_off
  if ((rc != 0 && ${RESTORE_API_STOPPED:-0} == 1)); then
    err "the restore failed after the API had been stopped — starting the application again"
    if dc up -d --remove-orphans >/dev/null 2>&1 && wait_healthy api 300; then
      err "the API runs again with the $([[ ${RESTORE_DB_SWITCHED:-0} == 1 ]] && echo RESTORED || echo PREVIOUS) database. Check: sudo evcar status"
    else
      err "the API did not come back: run  sudo evcar up  and see  sudo evcar logs api"
    fi
  fi
  return "$rc"
}

cmd_restore() {
  local target='' db=1 media=1 yes=0 flush_redis=0 dir answer ts newdb olddb expected live
  while (($# > 0)); do
    case $1 in
      --db-only) media=0 ;;
      --media-only) db=0 ;;
      --yes) yes=1 ;;
      --flush-redis) flush_redis=1 ;;
      -*) die "unknown option for restore: $1" ;;
      *) target=$1 ;;
    esac
    shift
  done
  [[ -n $target ]] || die "usage: sudo evcar restore <latest|DIR|TIMESTAMP> [--db-only|--media-only] [--flush-redis] [--yes]"
  require_root restore
  require_env_file
  take_lock 3600
  preflight_config
  render_backend_env
  compose_setup
  dir=$(resolve_backup "$target")
  verify_checksums "$dir"
  [[ $db -eq 0 || -f $dir/db.dump ]] || die "$dir has no database dump"
  if [[ $media -eq 1 && $(media_format "$dir") == none ]]; then
    ((db == 1)) || die "$dir has no media files"
    warn "$dir has no media files: only the database will be restored"
    media=0
  fi
  if ((media == 1)); then
    info "verifying the media files of the backup"
    verify_media "$dir" || die "the media files of $dir do not match their checksums (corrupted backup); nothing was changed"
  fi
  if ((db == 1)); then
    ensure_space_for_db_copy restore
  fi
  echo
  echo "$(bold 'Restore') from $dir"
  sed 's/^/    /' "$dir/manifest.txt" 2>/dev/null || true
  echo
  ((db == 1)) && echo "  • the CURRENT database '$(db_name)' is replaced (it is kept, renamed, until you drop it)"
  ((media == 1)) && echo "  • media files from the backup are written back (newer files are kept)"
  echo "  • the API is stopped during the operation"
  if ((yes == 0)); then
    [[ -t 0 ]] || die "restore needs confirmation: run it in a terminal or add --yes"
    read -r -p "Type RESTORE to continue: " answer
    [[ $answer == RESTORE ]] || die "aborted"
  fi
  maintenance_on
  RESTORE_API_STOPPED=0 RESTORE_DB_SWITCHED=0
  trap restore_exit EXIT
  ensure_data_services
  ts=$(date -u +%Y%m%d%H%M%S)

  if ((db == 1)); then
    live=$(db_name)
    info "safety backup of the current database"
    do_backup pre-restore 1 no >/dev/null
    newdb="${live}_restore_$ts"
    olddb="${live}_pre_restore_$ts"
    expected=$(mktemp)
    info "restoring into a fresh database ($newdb)"
    if ! restore_dump_into "$dir/db.dump" "$newdb" "$expected"; then
      drop_database "$newdb" || true
      rm -f "$expected"
      die "restore failed; the current database was NOT changed"
    fi
    info "verifying the restored database"
    if ! verify_restored_db "$newdb" "$expected"; then
      drop_database "$newdb" || true
      rm -f "$expected"
      die "verification failed; the current database was NOT changed"
    fi
    rm -f "$expected"
    info "stopping the API and switching databases"
    stop_api_for_restore
    # One transaction: either both renames happen or none (the live database
    # is never left without its name).
    if ! dc exec -T postgres sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v live="$1" -v old="$2" -v new="$3" -f -' sh "$live" "$olddb" "$newdb" <<'SQL'; then
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN (:'live', :'new') AND pid <> pg_backend_pid();
BEGIN;
ALTER DATABASE :"live" RENAME TO :"old";
ALTER DATABASE :"new" RENAME TO :"live";
COMMIT;
SQL
      drop_database "$newdb" || true
      die "switching databases failed; the current database was NOT changed"
    fi
    RESTORE_DB_SWITCHED=1
    ok "database restored; previous database kept as $olddb"
  else
    stop_api_for_restore
  fi

  if ((media == 1)); then
    info "restoring media files"
    if ! restore_media "$dir"; then
      die "media restore failed$([[ $RESTORE_DB_SWITCHED == 1 ]] && echo " (the database WAS restored; media files may be partially restored)")"
    fi
    ok "media restored"
  fi
  if ((flush_redis == 1)); then
    dc exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli FLUSHDB' >/dev/null
    ok "redis flushed (queues, caches, rate-limit counters)"
  fi
  start_stack
  ((db == 1)) && echo "When everything looks right, free the space of the old database with:
  sudo evcar psql -c 'DROP DATABASE \"$olddb\";'"
  return 0
}

# ---------------------------------------------------------------------------
# DNS / host proxy (nginx, apache)
# ---------------------------------------------------------------------------

public_ip() { # public_ip 4|6
  local ip='' url
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ip=$(curl "-$1" -fsS --max-time 6 "$url" 2>/dev/null | tr -d '[:space:]' || true)
    [[ -n $ip ]] && break
  done
  printf '%s' "$ip"
}

resolve_records() { # resolve_records NAME A|AAAA → one address per line
  local name=$1 type=$2
  if command -v dig >/dev/null 2>&1; then
    { dig +short +time=3 +tries=2 "$type" "$name" @1.1.1.1 2>/dev/null || dig +short "$type" "$name" 2>/dev/null || true; } |
      grep -E '^[0-9a-fA-F:.]+$' | sort -u || true
  else
    local fam=ahostsv4
    [[ $type == AAAA ]] && fam=ahostsv6
    getent "$fam" "$name" 2>/dev/null | awk '{ print $1 }' | sort -u || true
  fi
}

# dns_check_domain NAME IPV4 IPV6 → 0 when NAME points to this server
dns_check_domain() {
  local name=$1 ip4=$2 ip6=$3 a aaaa good=0
  a=$(resolve_records "$name" A | tr '\n' ' ')
  aaaa=$(resolve_records "$name" AAAA | tr '\n' ' ')
  echo "  $name → A: ${a:-none}  AAAA: ${aaaa:-none}"
  if [[ -z $a && -z $aaaa ]]; then
    err "  $name has no A/AAAA record yet. Create: A $name → ${ip4:-<server IPv4>}"
    return 1
  fi
  if [[ -n $ip4 && " $a " == *" $ip4 "* ]]; then good=1; fi
  if [[ -n $a && -n $ip4 && " $a " != *" $ip4 "* ]]; then
    err "  the A record of $name does not point to this server ($ip4)"
    good=0
  fi
  if [[ -n $aaaa ]]; then
    if [[ -z $ip6 || " $aaaa " != *" $ip6 "* ]]; then
      err "  $name has an AAAA (IPv6) record that is not this server (${ip6:-no IPv6 here}): Let's Encrypt will fail — delete or fix it"
      good=0
    fi
  fi
  ((good == 1))
}

cmd_dns_check() {
  local ip4 ip6 rc=0 d
  require_env_file
  ip4=$(env_get PUBLIC_IPV4 '')
  [[ -n $ip4 ]] || ip4=$(public_ip 4)
  ip6=$(public_ip 6)
  echo "This server: IPv4 ${ip4:-unknown} · IPv6 ${ip6:-none}"
  for d in "$(env_get API_DOMAIN)" "$(admin_domain)"; do
    [[ -n $d ]] || continue
    if dns_check_domain "$d" "$ip4" "$ip6"; then ok "$d points to this server"; else rc=1; fi
  done
  ((rc == 0)) || echo "DNS changes can take from a few minutes to a few hours to propagate. Re-run: sudo evcar dns-check"
  return "$rc"
}

# ss listen addresses for a port → nginx listen directives that join the
# sockets the running web server already uses (never a conflicting bind).
listen_lines() { # listen_lines PORT SUFFIX
  local port=$1 suffix=$2 addrs a out=()
  addrs=$(ss -Hltn "sport = :$port" 2>/dev/null | awk '{ print $4 }' | sed -E "s/:$port\$//" | sort -u)
  if [[ -z $addrs ]]; then
    addrs=$(ss -Hltn 'sport = :80' 2>/dev/null | awk '{ print $4 }' | sed -E 's/:80$//' | sort -u)
  fi
  while read -r a; do
    case $a in
      '') ;;
      0.0.0.0) out+=("listen $port$suffix;") ;;
      # "*" = one dual-stack socket on [::] (ipv6only=off): join it, a separate
      # 0.0.0.0 bind would fail on reload.
      '[::]' | '*') out+=("listen [::]:$port$suffix;") ;;
      *) out+=("listen $a:$port$suffix;") ;;
    esac
  done <<<"$addrs"
  ((${#out[@]} > 0)) || out=("listen $port$suffix;")
  printf '    %s\n' "${out[@]}" | sort -u
}

nginx_version_ge_1_25_1() {
  local v
  v=$(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)
  [[ -n $v ]] && printf '%s\n%s\n' 1.25.1 "$v" | sort -V -C
}

# render_template FILE → stdout with @PLACEHOLDERS@ replaced (values are validated)
render_template() {
  local file=$1
  EVCAR_T_API=$(env_get API_DOMAIN) \
    EVCAR_T_ADMIN=$(admin_domain) \
    EVCAR_T_API_PORT=$(env_get API_HOST_PORT 3000) \
    EVCAR_T_ADMIN_PORT=$(env_get ADMIN_HOST_PORT 8081) \
    EVCAR_T_MAX_BODY_MB=$(env_get PROXY_MAX_BODY 32MB | tr -cd '0-9') \
    EVCAR_T_ACME_ROOT=$(env_get ACME_WEBROOT /var/www/evcar-acme) \
    EVCAR_T_CERT=$(env_get CERT_NAME evcar) \
    EVCAR_T_NAMES="$(env_get API_DOMAIN)${EVCAR_T_EXTRA_NAME:+ $EVCAR_T_EXTRA_NAME}" \
    awk '{
      gsub(/@API_DOMAIN@/, ENVIRON["EVCAR_T_API"]); gsub(/@ADMIN_DOMAIN@/, ENVIRON["EVCAR_T_ADMIN"])
      gsub(/@API_PORT@/, ENVIRON["EVCAR_T_API_PORT"]); gsub(/@ADMIN_PORT@/, ENVIRON["EVCAR_T_ADMIN_PORT"])
      gsub(/@MAX_BODY_MB@/, ENVIRON["EVCAR_T_MAX_BODY_MB"]); gsub(/@ACME_ROOT@/, ENVIRON["EVCAR_T_ACME_ROOT"])
      gsub(/@CERT_NAME@/, ENVIRON["EVCAR_T_CERT"]); gsub(/@SERVER_NAMES@/, ENVIRON["EVCAR_T_NAMES"])
      if ($0 ~ /@LISTEN_80@/) { printf "%s", ENVIRON["EVCAR_T_L80"]; next }
      if ($0 ~ /@LISTEN_443@/) { printf "%s", ENVIRON["EVCAR_T_L443"]; next }
      if ($0 ~ /@HTTP2_ON@/) { printf "%s", ENVIRON["EVCAR_T_H2"]; next }
      if ($0 ~ /@VHOST_80@/) { printf "%s\n", ENVIRON["EVCAR_T_V80"]; next }
      if ($0 ~ /@VHOST_443@/) { printf "%s\n", ENVIRON["EVCAR_T_V443"]; next }
      print
    }' "$file"
}

# proxy_render MODE WITH_TLS(0|1) → full vhost file on stdout
proxy_render() {
  local mode=$1 with_tls=$2 dir="$DEPLOY_DIR/proxy/$1" admin names
  admin=$(admin_domain)
  names=$(env_get API_DOMAIN)
  [[ -n $admin ]] && names="$names $admin"
  export EVCAR_T_EXTRA_NAME=$admin
  if [[ $mode == nginx ]]; then
    local h2_suffix=' ssl http2' h2_line=''
    if nginx_version_ge_1_25_1; then
      h2_suffix=' ssl'
      h2_line=$'    http2 on;\n'
    fi
    EVCAR_T_L80=$(listen_lines 80 '')$'\n'
    EVCAR_T_L443=$(listen_lines 443 "$h2_suffix")$'\n'
    EVCAR_T_H2=$h2_line
    export EVCAR_T_L80 EVCAR_T_L443 EVCAR_T_H2
    render_template "$dir/http.conf.in"
    if ((with_tls == 1)); then
      render_template "$dir/api-https.conf.in"
      [[ -n $admin ]] && render_template "$dir/admin-https.conf.in"
    fi
  else
    local a80 a443
    a80=$(ss -Hltn 'sport = :80' 2>/dev/null | awk '{ print $4 }' | sed -E 's/:80$//' | grep -vE '^(\*|0\.0\.0\.0|\[::\])$' | sort -u | sed 's/$/:80/' | tr '\n' ' ' || true)
    a443=$(ss -Hltn 'sport = :443' 2>/dev/null | awk '{ print $4 }' | sed -E 's/:443$//' | grep -vE '^(\*|0\.0\.0\.0|\[::\])$' | sort -u | sed 's/$/:443/' | tr '\n' ' ' || true)
    EVCAR_T_V80="<VirtualHost ${a80}*:80>"
    EVCAR_T_V443="<VirtualHost ${a443}*:443>"
    export EVCAR_T_V80 EVCAR_T_V443
    render_template "$dir/http.conf.in"
    [[ -n $admin ]] && render_template "$dir/admin-http.conf.in"
    if ((with_tls == 1)); then
      render_template "$dir/api-https.conf.in"
      [[ -n $admin ]] && render_template "$dir/admin-https.conf.in"
    fi
  fi
  return 0
}

cmd_proxy_config() {
  require_env_file
  local mode
  mode=$(proxy_mode)
  case $mode in
    nginx | apache)
      echo "# ----- $mode vhost for $(env_get API_DOMAIN) (after the certificate exists) -----"
      proxy_render "$mode" 1
      ;;
    external)
      cat <<EOF
# Proxy mode "external": route these names on your web server / proxy:
#   https://$(env_get API_DOMAIN)/*          → http://127.0.0.1:$(env_get API_HOST_PORT 3000)
$([[ -n $(admin_domain) ]] && echo "#   https://$(admin_domain)/api/*    → http://127.0.0.1:$(env_get API_HOST_PORT 3000)
#   https://$(admin_domain)/*        → http://127.0.0.1:$(env_get ADMIN_HOST_PORT 8081)")
# Requirements: exactly ONE proxy hop (TRUST_PROXY=1), X-Forwarded-For set to the
# client address, X-Forwarded-Proto https, request bodies up to $(env_get PROXY_MAX_BODY 32MB),
# and "Access-Control-Allow-Origin: *" on /media/* responses.
# A Caddyfile example for a Caddy that already runs on the host:
#   $(env_get API_DOMAIN) {
#       reverse_proxy 127.0.0.1:$(env_get API_HOST_PORT 3000)
#   }
EOF
      ;;
    caddy) echo "Proxy mode is 'caddy': the bundled Caddy container handles TLS; nothing to configure." ;;
  esac
}

# Configuration roots of the host web server (overridable for tests).
NGINX_ETC=${EVCAR_NGINX_ETC:-/etc/nginx}
APACHE_ETC=${EVCAR_APACHE_ETC:-/etc/apache2}

detect_nginx_conf_dir() {
  if [[ -d $NGINX_ETC/sites-available && -d $NGINX_ETC/sites-enabled ]] && nginx -T 2>/dev/null | grep -qE "^\\s*include\\s+$NGINX_ETC/sites-enabled/"; then
    echo sites
  elif [[ -d $NGINX_ETC/conf.d ]] && nginx -T 2>/dev/null | grep -qE "^\\s*include\\s+$NGINX_ETC/conf\\.d/\\*\\.conf"; then
    echo confd
  else
    echo unknown
  fi
}

# Aborts when API_DOMAIN / ADMIN_DOMAIN is already configured in another vhost.
check_name_conflicts() {
  local mode=$1 ours=$2 d found
  for d in $(env_get API_DOMAIN) $(admin_domain); do
    if [[ $mode == nginx ]]; then
      found=$(nginx -T 2>/dev/null | awk -v ours="$ours" -v d="$d" '
        /^# configuration file / { f = $4; sub(/:$/, "", f); next }
        f != ours && $0 ~ "server_name" && index($0, d) { print f ": " $0 }' || true)
    else
      found=$(apache2ctl -S 2>/dev/null | grep -F "$d" | grep -vF "$ours" || true)
    fi
    if [[ -n $found ]]; then
      err "$d is already configured elsewhere on this server:"
      printf '%s\n' "$found" >&2
      die "refusing to add a conflicting vhost. Remove that configuration or choose another API_DOMAIN."
    fi
  done
}

# Names of the processes listening on TCP port PORT (empty when the port is free).
port_procs() {
  ss -Hltnp "sport = :$1" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | cut -d'"' -f2 | sort -u | tr '\n' ' ' | sed 's/ $//' || true
}

# Refuses the nginx/apache mode when port 80 or 443 is (also) held by another
# program: e.g. enabling Apache's mod_ssl adds `Listen 443`, and a graceful
# reload that cannot bind a port shuts Apache down — with the existing site.
check_web_ports_owned() {
  local mode=$1 port procs p ok_re
  if [[ $mode == nginx ]]; then ok_re='^nginx$'; else ok_re='^(apache2|httpd)$'; fi
  for port in 80 443; do
    procs=$(port_procs "$port")
    for p in $procs; do
      if [[ ! $p =~ $ok_re ]]; then
        err "port $port is used by '$p', not only by $mode: $mode cannot serve the API subdomain there"
        err "without risking the existing site. Use the 'external' mode and route the subdomain in '$p':"
        err "  sudo evcar set EVCAR_PROXY_MODE=external && sudo evcar up && sudo evcar proxy-config"
        die "nothing was changed"
      fi
    done
  done
  [[ -n $(port_procs 80) ]] || warn "no $mode process found on port 80 (ss -ltnp); continuing"
}

# Address to reach the host web server on port 80 from this machine.
http80_addr() {
  local a
  a=$(ss -Hltn 'sport = :80' 2>/dev/null | awk '{ print $4 }' | sed -E 's/:80$//' | head -n 1)
  case $a in '' | '*' | 0.0.0.0 | '[::]') a=127.0.0.1 ;; esac
  printf '%s' "$a"
}

# probe_http80 → HTTP status of http://<port-80 address>/ ("000" = no answer)
probe_http80() {
  curl -s -g -o /dev/null -w '%{http_code}' --max-time 10 --noproxy '*' "http://$(http80_addr)/" 2>/dev/null || true
}

# vhost_live ACME_ROOT → our vhost answers on port 80 (a challenge file is served for API_DOMAIN).
vhost_live() {
  local acme=$1 token file i body
  token="evcar-probe-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
  file="$acme/.well-known/acme-challenge/$token"
  printf '%s\n' "$token" >"$file"
  chmod 644 "$file"
  for i in 1 2 3 4 5; do
    body=$(curl -s -g --max-time 5 --noproxy '*' -H "Host: $(env_get API_DOMAIN)" \
      "http://$(http80_addr)/.well-known/acme-challenge/$token" 2>/dev/null || true)
    if [[ $body == "$token" ]]; then
      rm -f "$file"
      return 0
    fi
    sleep "$i"
  done
  rm -f "$file"
  return 1
}

cmd_proxy_setup() {
  local install=0 cert=0 yes=0 mode target enabled_link acme answer backup_file='' test_cmd svc m
  local mods_missing=() mods_enabled_now=() site_code_before=000
  while (($# > 0)); do
    case $1 in
      --install) install=1 ;;
      --cert) cert=1 ;;
      --yes | -y) yes=1 ;;
      *) die "unknown option for proxy-setup: $1" ;;
    esac
    shift
  done
  require_root proxy-setup
  require_env_file
  mode=$(proxy_mode)
  [[ $mode == nginx || $mode == apache ]] || die "proxy-setup is for the nginx/apache modes (current mode: $mode)"
  ensure_timers
  install -d -m 755 "$EVCAR_HOME/proxy"
  acme=$(env_get ACME_WEBROOT /var/www/evcar-acme)
  local cert_live
  cert_live="/etc/letsencrypt/live/$(env_get CERT_NAME evcar)/fullchain.pem"
  local have_cert=0
  [[ -f $cert_live ]] && have_cert=1
  proxy_render "$mode" "$have_cert" >"$EVCAR_HOME/proxy/evcar-news.$mode.conf"
  proxy_render "$mode" 1 >"$EVCAR_HOME/proxy/evcar-news.$mode.full.conf"
  ok "generated $EVCAR_HOME/proxy/evcar-news.$mode.conf (and the TLS version .full.conf)"

  if ((install == 0 && cert == 0)); then
    cat <<EOF

Nothing was installed. The file only serves $(env_get API_DOMAIN)$([[ -n $(admin_domain) ]] && echo " and $(admin_domain)");
your existing sites (e.g. evcar.news) are not modified. To install it as a NEW
vhost file, test the configuration and reload $mode:
  sudo evcar proxy-setup --install
Then, when DNS points here (sudo evcar dns-check), get the certificate:
  sudo evcar proxy-setup --install --cert
EOF
    return 0
  fi

  check_web_ports_owned "$mode"
  if [[ $mode == nginx ]]; then
    command -v nginx >/dev/null || die "nginx is not installed"
    case $(detect_nginx_conf_dir) in
      sites)
        target=$NGINX_ETC/sites-available/evcar-news.conf
        enabled_link=$NGINX_ETC/sites-enabled/evcar-news.conf
        ;;
      confd)
        target=$NGINX_ETC/conf.d/evcar-news.conf
        enabled_link=''
        ;;
      *) die "cannot find where this nginx loads sites from; install $EVCAR_HOME/proxy/evcar-news.nginx.conf manually" ;;
    esac
    test_cmd=(nginx -t)
    svc=nginx
  else
    command -v apache2ctl >/dev/null || die "apache2 is not installed"
    target=$APACHE_ETC/sites-available/evcar-news.conf
    enabled_link=$APACHE_ETC/sites-enabled/evcar-news.conf
    test_cmd=(apache2ctl configtest)
    svc=apache2
    for m in proxy proxy_http headers ssl setenvif; do
      apache2ctl -M 2>/dev/null | grep -qE "^[[:space:]]*${m}_module[[:space:]]" || mods_missing+=("$m")
    done
  fi
  if [[ -f $target ]] && ! head -n 3 "$target" | grep -q 'Managed by the EV Car News deploy kit'; then
    die "$target exists and was not created by this kit; refusing to overwrite it"
  fi
  # nginx -T / apache2ctl -S show the path the file is included from.
  check_name_conflicts "$mode" "${enabled_link:-$target}"
  if ((yes == 0)); then
    echo "This adds ONE new file ($target) serving only $(env_get API_DOMAIN)$([[ -n $(admin_domain) ]] && echo " + $(admin_domain)"),"
    echo "tests the configuration and reloads $mode. Existing sites are not changed."
    ((${#mods_missing[@]} == 0)) || echo "It also enables the Apache module(s): ${mods_missing[*]} (undone if anything fails)."
    read -r -p "Continue? [y/N] " answer
    [[ $answer =~ ^[Yy]$ ]] || die "aborted"
  fi
  install -d -m 755 "$acme/.well-known/acme-challenge"
  # Does the existing site answer now? (checked again after the reload)
  site_code_before=$(probe_http80)

  undo_modules() {
    if ((${#mods_enabled_now[@]} > 0)); then
      a2dismod -q -f "${mods_enabled_now[@]}" >/dev/null 2>&1 || true
    fi
    mods_enabled_now=()
  }
  revert_vhost() {
    if [[ -n $backup_file ]]; then
      cp -p "$backup_file" "$target"
    else
      rm -f "$target"
      [[ -n $enabled_link ]] && rm -f "$enabled_link"
    fi
    undo_modules
  }
  # The web server still runs, the existing site still answers, our vhost is live.
  web_server_healthy() {
    sleep 2
    if ! systemctl is-active -q "$svc" 2>/dev/null; then
      err "$svc is not running after the reload"
      return 1
    fi
    if [[ $site_code_before != 000 && $(probe_http80) == 000 ]]; then
      err "the existing site no longer answers on port 80 after the reload"
      return 1
    fi
    if ! vhost_live "$acme"; then
      err "the new vhost does not answer for $(env_get API_DOMAIN) on port 80 after the reload"
      return 1
    fi
  }
  install_vhost() { # install_vhost SOURCE
    backup_file=''
    if [[ -f $target ]]; then
      backup_file="$EVCAR_HOME/proxy/backup-$(date -u +%Y%m%d%H%M%S).conf"
      cp -p "$target" "$backup_file"
    fi
    install -m 644 "$1" "$target"
    [[ -n $enabled_link ]] && ln -sfn "$target" "$enabled_link"
    if ! "${test_cmd[@]}"; then
      err "$mode configuration test failed — reverting"
      revert_vhost
      die "vhost NOT installed (your existing configuration is unchanged)"
    fi
    if ! systemctl reload "$svc" || ! web_server_healthy; then
      err "reverting the vhost${mods_enabled_now[*]:+ and the module(s) ${mods_enabled_now[*]}}, then restarting $svc"
      revert_vhost
      systemctl restart "$svc" || true
      sleep 2
      if systemctl is-active -q "$svc" 2>/dev/null && [[ $site_code_before == 000 || $(probe_http80) != 000 ]]; then
        err "$svc runs again with its previous configuration"
      else
        err "$svc is STILL NOT RUNNING: check it now (sudo systemctl status $svc; sudo journalctl -u $svc -n 50)"
      fi
      die "vhost NOT installed (see the messages above)"
    fi
  }

  for m in "${mods_missing[@]}"; do
    if ! a2enmod -q "$m" >/dev/null; then
      undo_modules
      die "a2enmod $m failed (nothing else was changed)"
    fi
    mods_enabled_now+=("$m")
  done
  install_vhost "$EVCAR_HOME/proxy/evcar-news.$mode.conf"
  mods_enabled_now=()
  ok "vhost installed: $target ($mode reloaded; the existing site and the new vhost answer)"

  if ((cert == 1 && have_cert == 0)); then
    cmd_dns_check || die "fix DNS first (the certificate request would fail); then re-run: sudo evcar proxy-setup --install --cert"
    if ! command -v certbot >/dev/null 2>&1; then
      info "installing certbot"
      apt-get install -y certbot >/dev/null
    fi
    local domains=(-d "$(env_get API_DOMAIN)")
    [[ -n $(admin_domain) ]] && domains+=(-d "$(admin_domain)")
    certbot certonly --webroot -w "$acme" --cert-name "$(env_get CERT_NAME evcar)" "${domains[@]}" \
      --email "$(env_get ACME_EMAIL)" --agree-tos --no-eff-email --non-interactive \
      --keep-until-expiring --expand --deploy-hook "systemctl reload $svc"
    have_cert=1
    proxy_render "$mode" 1 >"$EVCAR_HOME/proxy/evcar-news.$mode.conf"
    install_vhost "$EVCAR_HOME/proxy/evcar-news.$mode.conf"
    ok "HTTPS enabled for $(env_get API_DOMAIN). Renewal: certbot's timer (reloads $mode automatically)"
  elif ((have_cert == 1)); then
    ok "certificate already present: $cert_live"
  else
    echo "Next (when DNS points here): sudo evcar proxy-setup --install --cert"
  fi
}

# ---------------------------------------------------------------------------
# misc commands
# ---------------------------------------------------------------------------

# sudo evcar set KEY=VALUE   — plain settings
# sudo evcar set KEY         — the value is read without echo from the terminal
#                              (or from stdin when there is no terminal): for
#                              passwords, API keys, webhook URLs. Values given on
#                              the command line end up in /var/log/auth.log (sudo),
#                              the journal, the shell history and `ps`.
cmd_set() {
  local force=0 arg kv='' key value from_prompt=0
  for arg in "$@"; do
    case $arg in
      --force) force=1 ;;
      -*) die "unknown option for set: $arg" ;;
      *)
        [[ -z $kv ]] || die "usage: sudo evcar set KEY=VALUE  |  sudo evcar set KEY  (asks for the value)"
        kv=$arg
        ;;
    esac
  done
  [[ -n $kv ]] || die "usage: sudo evcar set KEY=VALUE  |  sudo evcar set KEY  (asks for the value; use it for passwords and keys)"
  if [[ $kv == *=* ]]; then
    key=${kv%%=*}
    value=${kv#*=}
  else
    key=$kv
    from_prompt=1
  fi
  [[ $key =~ ^[A-Z][A-Z0-9_]*$ ]] || die "invalid key: $key"
  if ((from_prompt == 0 && force == 0)) && [[ -n $value ]] && is_secret_key "$key"; then
    die "$key is a secret: on the command line it would be stored in the shell history and in sudo's log (/var/log/auth.log, journal).
      Run instead:   sudo evcar set $key
      (the value is then asked without being shown; or pipe it: ... | sudo evcar set $key). --force skips this check."
  fi
  require_root set
  require_env_file
  if ((from_prompt == 1)); then
    if [[ -t 0 ]]; then
      read -r -s -p "Value for $key (not shown; Enter for an empty value): " value
      echo >&2
    else
      value=$(cat)
    fi
    [[ $value != *$'\n'* ]] || die "the value must be a single line"
  fi
  env_set "$key" "$value"
  if ((from_prompt == 1)); then
    ok "$key updated in $EVCAR_ENV_FILE (${#value} characters). Apply with: sudo evcar up"
  else
    ok "$key updated in $EVCAR_ENV_FILE. Apply with: sudo evcar up"
  fi
}

cmd_timers() {
  local action=${1:-status} unit
  require_root timers
  case $action in
    install)
      ensure_code_root_owned
      ln -sfn "$SELF" /usr/local/sbin/evcar
      for unit in "$DEPLOY_DIR"/systemd/*.service "$DEPLOY_DIR"/systemd/*.timer; do
        install -m 644 "$unit" "/etc/systemd/system/$(basename "$unit")"
      done
      systemctl daemon-reload
      systemctl enable --now "${EVCAR_TIMERS[@]}"
      ok "timers installed: daily backup, weekly restore test, monitoring every 5 minutes"
      ;;
    remove)
      systemctl disable --now "${EVCAR_TIMERS[@]}" 2>/dev/null || true
      rm -f /etc/systemd/system/evcar-{backup,restore-test,monitor}.{service,timer}
      systemctl daemon-reload
      ok "timers removed"
      ;;
    status) systemctl list-timers 'evcar-*' --no-pager ;;
    *) die "usage: sudo evcar timers [install|status|remove]" ;;
  esac
}

ensure_rclone() {
  command -v rclone >/dev/null 2>&1 && return 0
  info "installing rclone"
  DEBIAN_FRONTEND=noninteractive apt-get install -y rclone >/dev/null || die "could not install rclone (apt-get install rclone)"
}

cmd_offsite_setup() {
  local conf remote name type allow=0 arg answer
  for arg in "$@"; do
    case $arg in
      --allow-unencrypted) allow=1 ;;
      *) die "unknown option for offsite-setup: $arg" ;;
    esac
  done
  require_root offsite-setup
  require_env_file
  ensure_rclone
  conf=$(rclone_conf)
  install -d -m 700 "$(dirname "$conf")"
  cat <<'EOF'
rclone will now ask for your storage. Create TWO remotes (answer "n" = new remote):
  1. the storage itself, e.g. name "offsite", type S3-compatible / Backblaze B2 /
     Google Drive / SFTP to another server...
  2. an ENCRYPTING remote on top of it: name "offsite-crypt", type "crypt",
     remote "offsite:evcar-backups", let rclone generate both passwords.
The backups contain the whole database (e-mails, password hashes...): only the
encrypted remote is accepted below. Then answer "q" to quit rclone.
EOF
  rclone --config "$conf" config
  [[ -f $conf ]] && chmod 600 "$conf"
  read -r -p "Encrypted remote for the backups (e.g. offsite-crypt:): " remote
  [[ $remote == *:* ]] || die "expected <remote>:[path], e.g. offsite-crypt:"
  name=${remote%%:*}
  type=$(rclone_remote_type "$name")
  [[ -n $type ]] || die "remote '$name' is not defined in $conf (run sudo evcar offsite-setup again)"
  if [[ $type != crypt ]]; then
    if ((allow == 0)); then
      die "'$name' is a '$type' remote, not 'crypt': the backups would leave this server UNENCRYPTED.
      Run sudo evcar offsite-setup again and add a crypt remote on top of '$name' (see above),
      or, if the storage itself is private and encrypted, re-run with --allow-unencrypted."
    fi
    warn "'$name' is not encrypted by rclone (--allow-unencrypted)"
    env_set RCLONE_ALLOW_UNENCRYPTED true
  else
    env_set RCLONE_ALLOW_UNENCRYPTED false
  fi
  rclone --config "$conf" mkdir "$remote" || die "cannot access $remote"
  env_set RCLONE_REMOTE "$remote"
  ok "off-site backups enabled → $remote (daily and weekly sets are copied after each scheduled backup)"
  cat <<EOF

$(bold 'IMPORTANT — keep a copy of the rclone configuration OUTSIDE this server'), in your password
manager, next to .env.production. It holds the storage credentials and the
encryption passwords: without it the off-site backups CANNOT be read if this
server is lost. Show it with:
  sudo cat $conf
Restoring on a new server: docs/DEPLOYMENT_AR.md (section "الاسترجاع على سيرفر جديد").
EOF
  if [[ -t 0 ]]; then
    read -r -p "Show it now to copy it? [y/N] " answer
    [[ $answer =~ ^[Yy]$ ]] && { echo; cat "$conf"; echo; }
  fi
  return 0
}

# sudo evcar offsite-fetch [latest|TIMESTAMP|KIND/TIMESTAMP] [--list] [--remote R:PATH]
# Downloads a backup set from the off-site copy into BACKUP_DIR/offsite/ (e.g. on
# a new server, after restoring rclone.conf), verifies it, then:
# sudo evcar restore <TIMESTAMP>.
cmd_offsite_fetch() {
  local target=latest remote='' list=0 sets kind ts root dest tmp line
  while (($# > 0)); do
    case $1 in
      --list) list=1 ;;
      --remote)
        remote=${2:?--remote needs <remote>:<path>}
        shift
        ;;
      -*) die "unknown option for offsite-fetch: $1" ;;
      *) target=$1 ;;
    esac
    shift
  done
  require_root offsite-fetch
  require_env_file
  [[ -n $remote ]] || remote=$(env_get RCLONE_REMOTE '')
  [[ -n $remote ]] || die "no off-site remote configured. On a new server: put your saved rclone.conf in $(rclone_conf) (mode 600), then: sudo evcar set RCLONE_REMOTE=<remote>:<path>"
  [[ -r $(rclone_conf) ]] || die "missing $(rclone_conf): paste the rclone.conf saved in your password manager there (chmod 600)"
  ensure_rclone
  sets=$(for kind in daily weekly manual; do
    rclone_cmd lsf --dirs-only "$remote/$kind" 2>/dev/null | tr -d '/' | grep -E '^2[0-9]{7}T[0-9]{6}Z$' | sed "s#^#$kind #" || true
  done | sort -k2,2r)
  [[ -n $sets ]] || die "no backup sets found in $remote (daily/, weekly/, manual/)"
  if ((list == 1)); then
    printf '%-8s %s\n' KIND TIMESTAMP
    printf '%s\n' "$sets" | awk '{ printf "%-8s %s\n", $1, $2 }'
    return 0
  fi
  case $target in
    latest) line=$(printf '%s\n' "$sets" | head -n 1) ;;
    */*) line=$(printf '%s\n' "$sets" | awk -v k="${target%%/*}" -v t="${target#*/}" '$1 == k && $2 == t { print; exit }') ;;
    *) line=$(printf '%s\n' "$sets" | awk -v t="$target" '$2 == t { print; exit }') ;;
  esac
  [[ -n $line ]] || die "backup $target not found off-site (list: sudo evcar offsite-fetch --list)"
  kind=${line%% *}
  ts=${line#* }
  root=$(backup_root)
  dest="$root/offsite/$ts"
  [[ ! -e $dest ]] || die "already fetched: $dest (restore it with: sudo evcar restore $ts)"
  install -d -m 700 "$root" "$root/offsite"
  tmp="$root/.tmp-offsite-$ts"
  rm -rf "$tmp"
  install -d -m 700 "$tmp"
  info "downloading $remote/$kind/$ts"
  rclone_cmd copy "$remote/$kind/$ts" "$tmp" --transfers 4 --retries 5 --low-level-retries 10 || {
    rm -rf "$tmp"
    die "download failed"
  }
  # Sets made by this version carry the media tree as one media.tar off-site.
  if [[ -f $tmp/media.tar && -f $tmp/media.sha256 ]]; then
    tar -C "$tmp" -xf "$tmp/media.tar" || {
      rm -rf "$tmp"
      die "could not unpack media.tar"
    }
    rm -f "$tmp/media.tar"
  fi
  (cd "$tmp" && sha256sum --quiet --strict -c SHA256SUMS) || {
    rm -rf "$tmp"
    die "checksum verification FAILED for the downloaded set"
  }
  verify_media "$tmp" || {
    rm -rf "$tmp"
    die "the downloaded media files do not match their checksums"
  }
  mv "$tmp" "$dest"
  ok "backup $ts downloaded and verified: $dest"
  echo "Restore it with:  sudo evcar restore $ts"
}

cmd_alert_test() {
  require_root alert-test
  require_env_file
  if send_test_alert; then
    ok "test alert delivered — check your inbox / chat"
    return 0
  fi
  err "the test alert was NOT delivered."
  alert_channel_available || err "$ALERT_NO_CHANNEL_MSG"
  return 1
}

# sudo evcar harden-ssh [--yes] [--undo] — key-only SSH logins, done the way
# Ubuntu 22.04/24.04 read their configuration: sshd uses the FIRST value it
# finds, and /etc/ssh/sshd_config starts with `Include sshd_config.d/*.conf`,
# where cloud images put 50-cloud-init.conf (PasswordAuthentication yes). Editing
# sshd_config therefore changes nothing; a 00-*.conf file there comes first.
SSHD_DIR=${EVCAR_SSHD_DIR:-/etc/ssh}
SSHD_BIN=${EVCAR_SSHD_BIN:-sshd}

sshd_effective() { # sshd_effective KEYWORD → effective value (lowercase)
  "$SSHD_BIN" -T -f "$SSHD_DIR/sshd_config" 2>/dev/null | awk -v k="$1" 'tolower($1) == k { print tolower($2); exit }'
}

reload_sshd() {
  local unit
  command -v systemctl >/dev/null 2>&1 || return 0
  for unit in ssh.service sshd.service; do
    if systemctl is-active -q "$unit" 2>/dev/null; then
      systemctl reload "$unit"
      return
    fi
  done
  # Ubuntu 24.04 socket activation: sshd starts on the next connection and
  # reads the new configuration then.
  return 0
}

cmd_harden_ssh() {
  local yes=0 undo=0 arg conf user home keyfiles f found=0 prl answer body
  for arg in "$@"; do
    case $arg in
      --yes | -y) yes=1 ;;
      --undo) undo=1 ;;
      *) die "unknown option for harden-ssh: $arg" ;;
    esac
  done
  require_root harden-ssh
  conf="$SSHD_DIR/sshd_config.d/00-evcar-hardening.conf"
  command -v "$SSHD_BIN" >/dev/null 2>&1 || die "sshd not found"
  if ((undo == 1)); then
    rm -f "$conf"
    "$SSHD_BIN" -t -f "$SSHD_DIR/sshd_config" || die "sshd configuration test failed (not reloaded)"
    reload_sshd
    ok "removed $conf; password logins follow the rest of the configuration again"
    return 0
  fi
  grep -qE '^[[:space:]]*Include[[:space:]]+([^[:space:]]*/)?sshd_config\.d/\*\.conf' "$SSHD_DIR/sshd_config" ||
    die "$SSHD_DIR/sshd_config has no 'Include /etc/ssh/sshd_config.d/*.conf': set PasswordAuthentication no at its TOP by hand"
  user=${SUDO_USER:-root}
  home=$(getent passwd "$user" | cut -d: -f6)
  [[ -n $home ]] || die "cannot find the home directory of $user"
  # The keys of the user you logged in with must exist, or you would be locked out.
  keyfiles=$("$SSHD_BIN" -T -C "user=$user,host=localhost,addr=127.0.0.1" -f "$SSHD_DIR/sshd_config" 2>/dev/null |
    awk 'tolower($1) == "authorizedkeysfile" { for (i = 2; i <= NF; i++) print $i }')
  [[ -n $keyfiles ]] || keyfiles=".ssh/authorized_keys .ssh/authorized_keys2"
  for f in $keyfiles; do
    f=${f//%h/$home}
    f=${f//%u/$user}
    f=${f//%%/%}
    [[ $f == /* ]] || f="$home/$f"
    if [[ -f $f ]] && grep -qE '^[^#[:space:]]' "$f"; then found=1; fi
  done
  ((found == 1)) || die "no SSH key found for '$user' ($keyfiles in $home): add your public key first (ssh-copy-id $user@<server> from your computer) and log in with it — otherwise you would be locked out"
  body="# Managed by the EV Car News deploy kit (sudo evcar harden-ssh). Undo: sudo evcar harden-ssh --undo
# Read before 50-cloud-init.conf (sshd keeps the FIRST value of each keyword).
PasswordAuthentication no
KbdInteractiveAuthentication no"
  prl=$(sshd_effective permitrootlogin)
  # Never weaken a stricter existing setting (no / forced-commands-only).
  case $prl in
    yes | '') body+=$'\n'"PermitRootLogin prohibit-password" ;;
  esac
  if ((yes == 0)); then
    echo "This writes $conf:"
    printf '%s\n' "$body" | sed 's/^/    /'
    echo "Password logins over SSH stop working; key logins ($user has a key) keep working."
    echo "KEEP THIS SSH SESSION OPEN and test a new login from another terminal before closing it."
    read -r -p "Continue? [y/N] " answer
    [[ $answer =~ ^[Yy]$ ]] || die "aborted"
  fi
  install -d -m 755 "$SSHD_DIR/sshd_config.d"
  printf '%s\n' "$body" >"$conf"
  chmod 644 "$conf"
  if ! "$SSHD_BIN" -t -f "$SSHD_DIR/sshd_config"; then
    rm -f "$conf"
    die "sshd configuration test failed: nothing changed"
  fi
  if [[ $(sshd_effective passwordauthentication) != no ]]; then
    rm -f "$conf"
    die "PasswordAuthentication is still enabled by an earlier line of $SSHD_DIR/sshd_config: fix that line by hand"
  fi
  reload_sshd
  "$SSHD_BIN" -T -f "$SSHD_DIR/sshd_config" 2>/dev/null | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) ' | sed 's/^/    effective: /'
  ok "SSH accepts keys only. Now, WITHOUT closing this session, open a new terminal and log in again to check."
}

cmd_mail_outbox() {
  require_root mail-outbox
  require_env_file
  if ! mail_outbox_enabled; then
    ok "real SMTP is configured (SMTP_HOST=$(env_get SMTP_HOST)); there is no local outbox"
    return 0
  fi
  local port pw cfg
  port=$(env_get MAILPIT_UI_PORT 8025)
  pw=$(env_get MAILPIT_UI_PASSWORD '')
  cat <<EOF
E-mails are NOT delivered: they are kept in a local outbox (mailpit) until SMTP is configured.
The outbox contains password-reset links: it is protected by a password and only
listens on 127.0.0.1. Read it from your computer with an SSH tunnel:
  ssh -L $port:127.0.0.1:$port root@<server-ip>
  then open http://localhost:$port   (user: evcar · password: ${pw:-<run sudo evcar up first>})
Configure real SMTP (example):
  sudo evcar set SMTP_HOST=smtp.example.com
  sudo evcar set SMTP_PORT=587
  sudo evcar set SMTP_USER=user@example.com
  sudo evcar set SMTP_PASSWORD          (asks for the password; never type it on the command line)
  sudo evcar set MAIL_FROM='EV Car News <no-reply@evcar.news>'
  sudo evcar up
EOF
  if command -v python3 >/dev/null 2>&1; then
    # Credentials through a 0600 curl config file, never on the command line.
    cfg=$(mktemp)
    chmod 600 "$cfg"
    printf 'user = "%s"\n' "$(curl_cfg_escape "evcar:$pw")" >"$cfg"
    curl -fsS --max-time 5 -K "$cfg" "http://127.0.0.1:$port/api/v1/messages?limit=10" 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
msgs = data.get("messages", [])
print("\nLatest messages in the outbox:" if msgs else "\nThe outbox is empty.")
for m in msgs:
    to = ", ".join(x.get("Address", "") for x in m.get("To", []))
    print(f"  {m.get(\"Created\", \"\")[:19]}  {to}  {m.get(\"Subject\", \"\")}")
' || true
    rm -f "$cfg"
  fi
}

cmd_version() {
  echo "release: $(current_release)"
  git_code log -1 --format='commit: %H (%cs) %s' 2>/dev/null || true
  docker compose version 2>/dev/null || true
}

main() {
  local cmd=${1:-help}
  (($# > 0)) && shift
  case $cmd in
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    restart) cmd_restart "$@" ;;
    status) cmd_status "$@" ;;
    health) cmd_health "$@" ;;
    logs) cmd_logs "$@" ;;
    update) cmd_update "$@" ;;
    rollback) cmd_rollback "$@" ;;
    migrate) cmd_migrate "$@" ;;
    seed) cmd_seed "$@" ;;
    create-owner) cmd_create_owner "$@" ;;
    backup) cmd_backup "$@" ;;
    backups) cmd_backups "$@" ;;
    restore) cmd_restore "$@" ;;
    restore-test) cmd_restore_test "$@" ;;
    psql) cmd_psql "$@" ;;
    monitor) exec "$DEPLOY_DIR/monitor.sh" "$@" ;;
    timers) cmd_timers "$@" ;;
    dns-check) cmd_dns_check "$@" ;;
    proxy-config) cmd_proxy_config "$@" ;;
    proxy-setup) cmd_proxy_setup "$@" ;;
    offsite-setup) cmd_offsite_setup "$@" ;;
    offsite-fetch) cmd_offsite_fetch "$@" ;;
    alert-test) cmd_alert_test "$@" ;;
    harden-ssh) cmd_harden_ssh "$@" ;;
    mail-outbox) cmd_mail_outbox "$@" ;;
    set) cmd_set "$@" ;;
    compose)
      require_root compose
      require_env_file
      render_backend_env
      compose_setup
      dc "$@"
      ;;
    version) cmd_version ;;
    help | -h | --help) usage ;;
    *)
      usage >&2
      die "unknown command: $cmd"
      ;;
  esac
}

main "$@"
