# shellcheck shell=bash
# EV Car News deploy kit — helpers shared by evcar.sh and monitor.sh.
# This file is sourced (never executed). It expects DEPLOY_DIR to be set.
#
# Configuration lives in ONE file, $EVCAR_ENV_FILE (default
# /opt/evcar/.env.production, mode 600). It is parsed as data — never
# `source`d — so a value can never execute code.

EVCAR_HOME="${EVCAR_HOME:-/opt/evcar}"
EVCAR_ENV_FILE="${EVCAR_ENV_FILE:-$EVCAR_HOME/.env.production}"
EVCAR_STATE_DIR="${EVCAR_STATE_DIR:-$EVCAR_HOME/state}"
EVCAR_RUN_DIR="${EVCAR_RUN_DIR:-$EVCAR_HOME/run}"
EVCAR_COMPOSE_PROJECT="${EVCAR_COMPOSE_PROJECT:-evcar}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$DEPLOY_DIR/.." && pwd)}"

if [[ -t 2 && -z ${NO_COLOR:-} ]]; then
  C_RED=$'\e[31m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_BLUE=$'\e[34m' C_BOLD=$'\e[1m' C_RESET=$'\e[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_BOLD='' C_RESET=''
fi

info() { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*" >&2; }
ok() { printf '%s ok%s %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
warn() { printf '%sWARN%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
err() { printf '%sERROR%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die() {
  err "$*"
  exit 1
}
bold() { printf '%s%s%s' "$C_BOLD" "$*" "$C_RESET"; }

# ---------------------------------------------------------------------------
# .env file handling (compose-compatible: KEY=value, KEY='literal value')
# ---------------------------------------------------------------------------

# Removes surrounding quotes the way docker compose reads the value.
env_unquote() {
  local v=$1
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  if [[ ${#v} -ge 2 && ${v:0:1} == "'" && ${v: -1} == "'" ]]; then
    v=${v:1:${#v}-2}
  elif [[ ${#v} -ge 2 && ${v:0:1} == '"' && ${v: -1} == '"' ]]; then
    v=${v:1:${#v}-2}
    v=${v//\\\"/\"}
    v=${v//\\\\/\\}
  else
    v=${v%% \#*}
  fi
  printf '%s' "$v"
}

# Quotes a value for the env file. Single quotes = literal for compose (no
# ${VAR} interpolation). Values containing ' or a newline are refused.
env_quote() {
  local v=$1
  if [[ $v == *$'\n'* || $v == *"'"* ]]; then
    err "values containing a single quote (') or a newline are not supported in the env file"
    return 1
  fi
  if [[ $v =~ ^[A-Za-z0-9_./:@,+=-]*$ ]]; then
    printf '%s' "$v"
  else
    printf "'%s'" "$v"
  fi
}

# env_get KEY [DEFAULT] [FILE] — last assignment wins; empty value → DEFAULT.
env_get() {
  local key=$1 default=${2-} file=${3:-$EVCAR_ENV_FILE} line value
  [[ $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "invalid variable name: $key"
  if [[ ! -r $file ]]; then
    printf '%s' "$default"
    return 0
  fi
  line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)
  if [[ -z $line ]]; then
    printf '%s' "$default"
    return 0
  fi
  value=$(env_unquote "${line#*=}")
  if [[ -z $value ]]; then printf '%s' "$default"; else printf '%s' "$value"; fi
}

# env_has KEY [FILE] — true when the key is assigned (even to an empty value).
env_has() {
  local key=$1 file=${2:-$EVCAR_ENV_FILE}
  [[ -r $file ]] && grep -qE "^[[:space:]]*${key}=" "$file"
}

# env_set KEY VALUE [FILE] — atomic in-place update (first occurrence is
# replaced, duplicates removed, appended when missing). Keeps mode 600.
env_set() {
  local key=$1 value=$2 file=${3:-$EVCAR_ENV_FILE} line tmp
  [[ $key =~ ^[A-Z][A-Z0-9_]*$ ]] || die "invalid variable name: $key"
  line="$key=$(env_quote "$value")" || return 1
  [[ -e $file ]] || (umask 077 && : >"$file")
  tmp=$(mktemp "${file}.XXXXXX")
  EVCAR_ENV_LINE=$line awk -v key="$key" '
    BEGIN { done = 0 }
    $0 ~ ("^[[:space:]]*" key "=") { if (!done) { print ENVIRON["EVCAR_ENV_LINE"]; done = 1 }; next }
    { print }
    END { if (!done) print ENVIRON["EVCAR_ENV_LINE"] }
  ' "$file" >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$file"
}

# ---------------------------------------------------------------------------
# Docker compose wrapper
# ---------------------------------------------------------------------------

EVCAR_PROFILES=()
COMPOSE_ARGS=()

proxy_mode() { env_get EVCAR_PROXY_MODE caddy; }
admin_domain() {
  local d
  d=$(env_get ADMIN_DOMAIN '')
  [[ $d == none || $d == - ]] && d=''
  printf '%s' "$d"
}
worker_mode() { env_get EVCAR_WORKER_MODE separate; }
mail_outbox_enabled() { [[ $(env_get SMTP_HOST '') == mailpit ]]; }
real_smtp_configured() {
  local h
  h=$(env_get SMTP_HOST '')
  [[ -n $h && $h != mailpit ]]
}
current_release() {
  local r=''
  [[ -r $EVCAR_STATE_DIR/release ]] && r=$(tr -cd 'A-Za-z0-9._-' <"$EVCAR_STATE_DIR/release")
  printf '%s' "${r:-local}"
}

# Renders $EVCAR_RUN_DIR/backend.env: the variables of .env.production that
# the backend documents in /.env.example (deploy-only keys and secrets such as
# the PostgreSQL superuser password never reach the application containers),
# plus derived defaults.
render_backend_env() {
  local example="$PROJECT_DIR/.env.example" out="$EVCAR_RUN_DIR/backend.env" tmp api admin
  [[ -r $example ]] || die "missing $example (the backend's list of variables)"
  ensure_dirs
  api=$(env_get API_DOMAIN '')
  admin=$(admin_domain)
  tmp=$(mktemp "$EVCAR_RUN_DIR/backend.env.XXXXXX")
  {
    echo "# GENERATED by evcar.sh from $EVCAR_ENV_FILE on $(date -u +%FT%TZ). Do not edit:"
    echo "# change $EVCAR_ENV_FILE, then run: sudo evcar up"
    [[ -n $(env_get APP_PUBLIC_BASE_URL '') ]] || echo "APP_PUBLIC_BASE_URL=https://$api"
    [[ -n $(env_get ADMIN_BASE_URL '') ]] || echo "ADMIN_BASE_URL=https://${admin:-$api}"
    if [[ -z $(env_get CORS_ORIGINS '') && -n $admin ]]; then echo "CORS_ORIGINS=https://$admin"; fi
    awk '
      NR == FNR { if (match($0, /^[A-Z][A-Z0-9_]*=/)) keys[substr($0, 1, RLENGTH - 1)] = 1; next }
      { line = $0; sub(/^[[:space:]]+/, "", line) }
      line !~ /^[A-Z][A-Z0-9_]*=/ { next }
      {
        k = line; sub(/=.*/, "", k); v = line; sub(/^[^=]*=/, "", v)
        if (!(k in keys) || v == "" || v == "\047\047" || v == "\"\"") next
        print line
      }' "$example" "$EVCAR_ENV_FILE"
  } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$out"
}

# Computes the compose file list, profiles and the variables evcar.sh exports
# for interpolation (they win over --env-file values).
compose_setup() {
  local mode mode_file
  render_backend_env
  mode=$(proxy_mode)
  case $mode in
    caddy) mode_file=compose.caddy.yml ;;
    nginx | apache | external) mode_file=compose.host-proxy.yml ;;
    *) die "EVCAR_PROXY_MODE must be caddy, nginx, apache or external (got '$mode')" ;;
  esac
  EVCAR_PROFILES=()
  if [[ $(worker_mode) == separate ]]; then
    EVCAR_PROFILES+=(worker)
    export EVCAR_API_JOBS_ENABLED=false
  else
    export EVCAR_API_JOBS_ENABLED=true
  fi
  if [[ -n $(admin_domain) ]]; then
    EVCAR_PROFILES+=(admin)
    export EVCAR_ADMIN_SITE=admin
  else
    export EVCAR_ADMIN_SITE=none
  fi
  if mail_outbox_enabled; then
    EVCAR_PROFILES+=(mail-outbox)
    # The outbox holds password-reset links: its UI/API needs a password
    # (generated once; installs made before this rule get one here).
    if [[ -z $(env_get MAILPIT_UI_PASSWORD '') && -w $EVCAR_ENV_FILE ]]; then
      env_set MAILPIT_UI_PASSWORD "$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
    fi
  fi
  export EVCAR_RELEASE="${EVCAR_RELEASE:-$(current_release)}"
  export EVCAR_BACKEND_ENV_FILE="$EVCAR_RUN_DIR/backend.env"
  COMPOSE_ARGS=(--project-name "$EVCAR_COMPOSE_PROJECT" --env-file "$EVCAR_ENV_FILE"
    -f "$DEPLOY_DIR/docker-compose.prod.yml" -f "$DEPLOY_DIR/$mode_file")
  local p
  for p in "${EVCAR_PROFILES[@]}"; do COMPOSE_ARGS+=(--profile "$p"); done
}

dc() {
  [[ ${#COMPOSE_ARGS[@]} -gt 0 ]] || compose_setup
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

# Container id of a compose service ('' when it does not exist).
service_container() {
  docker ps -aq --filter "label=com.docker.compose.project=$EVCAR_COMPOSE_PROJECT" \
    --filter "label=com.docker.compose.service=$1" | head -n 1
}

service_running() {
  local id
  id=$(service_container "$1")
  [[ -n $id && $(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null) == true ]]
}

# Health of a service container: healthy|unhealthy|starting|none|missing|stopped
service_health() {
  local id state
  id=$(service_container "$1")
  [[ -n $id ]] || {
    printf missing
    return 0
  }
  state=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo 'false none')
  if [[ ${state%% *} != true ]]; then printf stopped; else printf '%s' "${state#* }"; fi
}

wait_healthy() {
  local service=$1 timeout=${2:-300} waited=0 h
  while ((waited < timeout)); do
    h=$(service_health "$service")
    case $h in
      healthy | none) return 0 ;;
      stopped | missing) [[ $waited -gt 20 ]] && return 1 ;;
    esac
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

# ---------------------------------------------------------------------------
# PostgreSQL helpers (commands run INSIDE the postgres container, unix socket)
# ---------------------------------------------------------------------------

# psql as the superuser. Extra args go to psql; SQL on stdin with `-f -`.
pg_super() {
  dc exec -T postgres sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"' psql "$@"
}

# psql as the application role (owner of the application database).
pg_app() {
  dc exec -T postgres sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$APP_DB_USER" "$@"' psql "$@"
}

db_name() { env_get POSTGRES_DB evcar; }

# ---------------------------------------------------------------------------
# misc
# ---------------------------------------------------------------------------

require_root() {
  [[ $(id -u) -eq 0 || -n ${EVCAR_ALLOW_NON_ROOT:-} ]] || die "run as root: sudo evcar $*"
}

require_env_file() {
  [[ -f $EVCAR_ENV_FILE ]] || die "configuration not found: $EVCAR_ENV_FILE (run deploy/install.sh first)"
  local mode
  mode=$(stat -c '%a' "$EVCAR_ENV_FILE")
  if [[ $mode != 600 && $mode != 400 ]]; then
    warn "$EVCAR_ENV_FILE had mode $mode; fixing to 600"
    chmod 600 "$EVCAR_ENV_FILE"
  fi
}

ensure_dirs() {
  install -d -m 700 "$EVCAR_STATE_DIR" "$EVCAR_RUN_DIR"
}

# Exclusive lock for operations that must not overlap (update/backup/restore).
take_lock() {
  ensure_dirs
  exec 9>"$EVCAR_STATE_DIR/evcar.lock"
  if ! flock -w "${1:-5}" 9; then
    die "another evcar operation (update/backup/restore) is running; try again later"
  fi
}

maintenance_on() { date +%s >"$EVCAR_STATE_DIR/maintenance"; }
maintenance_off() { rm -f "$EVCAR_STATE_DIR/maintenance"; }
in_maintenance() {
  local since now
  [[ -r $EVCAR_STATE_DIR/maintenance ]] || return 1
  since=$(cat "$EVCAR_STATE_DIR/maintenance" 2>/dev/null || echo 0)
  now=$(date +%s)
  [[ $since =~ ^[0-9]+$ ]] && ((now - since < 3600))
}

human_bytes() {
  local b=${1:-0}
  if ((b >= 1073741824)); then
    awk -v b="$b" 'BEGIN { printf "%.1f GB", b / 1073741824 }'
  elif ((b >= 1048576)); then
    awk -v b="$b" 'BEGIN { printf "%.1f MB", b / 1048576 }'
  else
    awk -v b="$b" 'BEGIN { printf "%.0f KB", b / 1024 }'
  fi
}

valid_domain() { [[ $1 =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; }
valid_email() { [[ $1 =~ ^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$ ]]; }

# Keys whose values are secrets: never accepted on a command line (sudo logs
# the full command line to /var/log/auth.log, the shell keeps it in its history).
is_secret_key() {
  case $1 in
    *_PASSWORD | *_API_KEY | *SECRET* | *_TOKEN | *PRIVATE_KEY* | *_SALT | *_DSN) return 0 ;;
    ALERT_WEBHOOK_URL | MONITOR_HEARTBEAT_URL | FCM_SERVICE_ACCOUNT_JSON | DATABASE_URL | REDIS_URL) return 0 ;;
  esac
  return 1
}

ram_mb() { awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || echo 0; }

# Filesystem helpers (bytes).
fs_avail() { df -PB1 "$1" 2>/dev/null | awk 'NR == 2 { print $4 + 0 }'; }
fs_size() { df -PB1 "$1" 2>/dev/null | awk 'NR == 2 { print $2 + 0 }'; }
fs_dev() { df -P "$1" 2>/dev/null | awk 'NR == 2 { print $1 }'; }

# space_ok PATH NEED_BYTES — true when writing NEED_BYTES on the filesystem of
# PATH still leaves BACKUP_MIN_FREE_PERCENT (15) of that filesystem free, so
# PostgreSQL (WAL) and Redis (AOF) on the same disk never run out of space.
space_ok() {
  local path=$1 need=$2 avail size pct reserve
  avail=$(fs_avail "$path")
  size=$(fs_size "$path")
  [[ $avail =~ ^[0-9]+$ && $size =~ ^[0-9]+$ ]] || return 0
  pct=$(env_get BACKUP_MIN_FREE_PERCENT 15)
  [[ $pct =~ ^[0-9]+$ && $pct -le 90 ]] || pct=15
  reserve=$((size * pct / 100))
  ((avail - need >= reserve))
}

# ---------------------------------------------------------------------------
# off-site copies (rclone)
# ---------------------------------------------------------------------------

rclone_conf() { env_get RCLONE_CONFIG "$EVCAR_HOME/rclone/rclone.conf"; }

# rclone_remote_type NAME → the `type` of remote NAME in rclone.conf ('' if unknown)
rclone_remote_type() {
  local conf
  conf=$(rclone_conf)
  [[ -r $conf ]] || return 0
  awk -v n="$1" '
    /^[[:space:]]*\[/ { s = $0; gsub(/^[[:space:]]*\[|\][[:space:]]*$/, "", s); next }
    s == n && $0 ~ /^[[:space:]]*type[[:space:]]*=/ { v = $0; sub(/^[^=]*=[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v); print v; exit }
  ' "$conf"
}

# offsite_encryption → none (not configured) | encrypted (crypt remote) |
# NOT-ENCRYPTED (any other remote type) | unknown (remote not found in rclone.conf)
offsite_encryption() {
  local remote type
  remote=$(env_get RCLONE_REMOTE '')
  if [[ -z $remote ]]; then
    echo none
    return 0
  fi
  type=$(rclone_remote_type "${remote%%:*}")
  case $type in
    crypt) echo encrypted ;;
    '') echo unknown ;;
    *) echo NOT-ENCRYPTED ;;
  esac
}

offsite_allowed_unencrypted() { [[ $(env_get RCLONE_ALLOW_UNENCRYPTED false) == true ]]; }

warn_offsite_encryption() {
  case $(offsite_encryption) in
    NOT-ENCRYPTED)
      offsite_allowed_unencrypted && return 0
      warn "off-site remote $(env_get RCLONE_REMOTE) is NOT a 'crypt' remote: the database dump (e-mails, password hashes) would leave this server unencrypted, so uploads are refused. Fix: sudo evcar offsite-setup (add a crypt remote)"
      ;;
    unknown) warn "off-site remote $(env_get RCLONE_REMOTE) is not defined in $(rclone_conf) (sudo evcar offsite-setup)" ;;
  esac
  return 0
}

docker_root_dir() { docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker; }

# The code that root runs (this script, lib/, compose files, templates) must not
# be writable by anyone but root. Installs made before this rule had the
# checkout owned by the `evcar` user: hand it back to root (only for the
# checkout under $EVCAR_HOME, never for a development tree).
ensure_code_root_owned() {
  local top
  [[ $(id -u) -eq 0 ]] || return 0
  # Not `git rev-parse`: git refuses a checkout owned by another user.
  top=$PROJECT_DIR
  while [[ $top != / && ! -e $top/.git ]]; do top=$(dirname "$top"); done
  [[ -e $top/.git ]] || top=$PROJECT_DIR
  [[ -d $top && $top == "$EVCAR_HOME"/* ]] || return 0
  if [[ $(stat -c %u "$top") != 0 ]] || [[ -n $(find "$top" -xdev \! -type l \( \! -user 0 -o -perm /022 \) -print -quit 2>/dev/null) ]]; then
    info "making $top owned by root and not writable by other users (the root-run scripts come from it)"
    chown -R root:root "$top"
    chmod -R go-w "$top"
  fi
}

# git on the checkout, as root, with repository hooks and fsmonitor disabled
# (nothing inside .git is ever executed).
git_code() {
  git -c core.hooksPath=/dev/null -c core.fsmonitor= -C "$PROJECT_DIR" "$@"
}
