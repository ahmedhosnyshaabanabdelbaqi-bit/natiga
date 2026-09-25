#!/usr/bin/env bash
# =============================================================================
# EV Car News — server installer for Ubuntu 22.04 / 24.04 (idempotent).
#
#   curl -fsSL https://raw.githubusercontent.com/ahmedhosnyshaabanabdelbaqi-bit/natiga/<branch>/evcar-news/deploy/install.sh -o install.sh
#   sudo bash install.sh --branch <branch>
#
#   sudo bash install.sh --dry-run        # print every action, change nothing
#   sudo bash install.sh --help
#
# What it does (each step is skipped when already done):
#   1. checks the OS (Ubuntu 22.04/24.04), CPU architecture, RAM and disk
#   2. installs Docker Engine + compose plugin from Docker's official apt repo
#      (an existing Docker with compose ≥ 2.24 is kept as is)
#   3. creates /opt/evcar (app, backups, state), all owned by root
#   4. swap file when RAM < 2 GB, UFW (OpenSSH + 80 + 443; an active UFW is left
#      as it is, other public services are never blocked without asking or
#      --enable-firewall), fail2ban for sshd (unless an sshd jail already
#      exists), unattended security upgrades
#   5. detects a web server already using ports 80/443 (e.g. the one serving
#      evcar.news) and picks the proxy mode:
#        caddy  — ports free: bundled Caddy with automatic Let's Encrypt
#        nginx / apache — existing server: the API listens on 127.0.0.1 only and
#                 a NEW vhost file for the API subdomain is offered (existing
#                 sites are never modified); certificate via certbot
#        external — another proxy (Caddy, Traefik, a container...): instructions
#   6. clones the code to /opt/evcar/app, writes /opt/evcar/.env.production with
#      strong random secrets (openssl rand, mode 600 — never printed)
#   7. installs the `evcar` command and the systemd timers (daily backup, weekly
#      restore test, monitoring every 5 minutes), then builds and starts the
#      stack (a failing build/start/vhost step is reported with the command to
#      retry; the timers are installed in any case)
# =============================================================================
set -Eeuo pipefail

readonly DEFAULT_REPO_URL="https://github.com/ahmedhosnyshaabanabdelbaqi-bit/natiga.git"
readonly DEFAULT_BRANCH="main"
readonly DEFAULT_SUBDIR="evcar-news"
readonly MIN_COMPOSE_VERSION="2.24.0"

DRY_RUN=0
ASSUME_YES=0
INTERACTIVE=1
FORCE=0
EVCAR_HOME="/opt/evcar"
ENV_FILE=""
GENERATE_ENV_ONLY=0
REPO_URL=""
BRANCH=""
SUBDIR="$DEFAULT_SUBDIR"
API_DOMAIN=""
ADMIN_DOMAIN=""
ADMIN_DOMAIN_GIVEN=0
ACME_EMAIL=""
MODE=""
WORKER_MODE=""
SMTP_HOST="" SMTP_PORT="" SMTP_USER="" SMTP_FROM="" SMTP_SECURE=""
SMTP_PASSWORD="${EVCAR_SMTP_PASSWORD:-}"
OCM_API_KEY="${EVCAR_OCM_API_KEY:-}"
OCM_GIVEN=0
SMTP_GIVEN=0
SKIP_FIREWALL=0
ENABLE_FIREWALL=0
OCM_PROMPT=0
SKIP_START=0
INSTALL_VHOST=""
OBTAIN_CERT=""
PUBLIC_IPV4=""
POSTGIS_IMAGE_OVERRIDE=""

SCRIPT_PATH=$(readlink -f "${BASH_SOURCE[0]:-$0}" 2>/dev/null || echo "$0")
SCRIPT_DIR=$(dirname "$SCRIPT_PATH")

# ---------------------------------------------------------------------------
# output helpers
# ---------------------------------------------------------------------------
if [[ -t 2 && -z ${NO_COLOR:-} ]]; then
  C_RED=$'\e[31m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_BLUE=$'\e[34m' C_BOLD=$'\e[1m' C_RESET=$'\e[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_BOLD='' C_RESET=''
fi
step() { printf '\n%s==> %s%s\n' "$C_BOLD$C_BLUE" "$*" "$C_RESET" >&2; }
info() { printf '    %s\n' "$*" >&2; }
ok() { printf '%s ok%s %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
warn() { printf '%sWARN%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() {
  printf '%sERROR%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
  exit 1
}
trap 'die "unexpected failure at line $LINENO (command: $BASH_COMMAND)"' ERR

# run CMD... — executes, or only prints it in --dry-run mode.
run() {
  if ((DRY_RUN == 1)); then
    printf '%s[dry-run]%s' "$C_YELLOW" "$C_RESET" >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
    return 0
  fi
  "$@"
}

# write_file PATH MODE [OWNER[:GROUP]] < content — atomic; dry-run prints it.
write_file() {
  local path=$1 mode=$2 owner=${3:-root:root} tmp
  if ((DRY_RUN == 1)); then
    printf '%s[dry-run]%s write %s (mode %s, owner %s):\n' "$C_YELLOW" "$C_RESET" "$path" "$mode" "$owner" >&2
    sed 's/^/      | /' >&2
    return 0
  fi
  install -d "$(dirname "$path")"
  tmp=$(mktemp "$path.XXXXXX")
  cat >"$tmp"
  chmod "$mode" "$tmp"
  chown "$owner" "$tmp"
  mv -f "$tmp" "$path"
}

tty_available() { [[ $INTERACTIVE -eq 1 ]] && { true </dev/tty; } 2>/dev/null; }

# ask VAR "Question" DEFAULT [secret]
ask() {
  local __var=$1 question=$2 default=${3-} secret=${4-} answer=''
  if ! tty_available; then
    printf -v "$__var" '%s' "$default"
    return 0
  fi
  if [[ -n $secret ]]; then
    read -r -s -p "$question${default:+ [keep current]}: " answer </dev/tty
    printf '\n' >&2
  else
    read -r -p "$question${default:+ [$default]}: " answer </dev/tty
  fi
  printf -v "$__var" '%s' "${answer:-$default}"
}

confirm() { # confirm "Question" DEFAULT(y|n)
  local q=$1 def=${2:-n} a
  ((ASSUME_YES == 1)) && return 0
  if ! tty_available; then [[ $def == y ]] && return 0 || return 1; fi
  read -r -p "$q [$([[ $def == y ]] && echo Y/n || echo y/N)] " a </dev/tty
  a=${a:-$def}
  [[ $a =~ ^[Yy] ]]
}

usage() {
  cat <<EOF
EV Car News — server installer (Ubuntu 22.04 / 24.04)

Usage: sudo bash install.sh [options]

  --api-domain NAME        API host name (default api.evcar.news)
  --admin-domain NAME      admin panel host name (default admin.<parent of API domain>)
  --no-admin               do not deploy the admin panel
  --email ADDRESS          administrator e-mail: Let's Encrypt account and alerts (required)
  --mode MODE              caddy | nginx | apache | external (default: detected)
  --worker-mode MODE       separate | combined (default: from RAM; combined below 3 GB)
  --smtp-host HOST --smtp-port PORT --smtp-user USER --smtp-from "Name <addr>" [--smtp-secure]
                           outgoing e-mail. The password is asked without echo (or read from
                           EVCAR_SMTP_PASSWORD exported in a root shell — never on the sudo
                           command line: sudo logs it in /var/log/auth.log).
                           Without SMTP, e-mails go to a local outbox and are NOT delivered.
  --ocm-key                ask for the Open Charge Map API key (optional; same rule: or
                           EVCAR_OCM_API_KEY exported in a root shell). Later: sudo evcar set OCM_API_KEY
  --repo URL               git repository (default $DEFAULT_REPO_URL)
  --branch NAME            branch to deploy (default: $DEFAULT_BRANCH, or the branch of the checkout this script is in)
  --subdir DIR             project folder inside the repository (default $DEFAULT_SUBDIR)
  --home DIR               installation directory (default /opt/evcar)
  --public-ip IPV4         this server's public IPv4 (default: detected)
  --postgis-image IMAGE    override the PostGIS image (e.g. a multi-arch build on arm64)
  --install-vhost / --no-install-vhost   (nginx/apache) add the API vhost now (default: ask)
  --obtain-cert / --no-obtain-cert       (nginx/apache) run certbot now (default: ask)
  --skip-firewall          do not touch UFW (hosting panel / own firewall rules)
  --enable-firewall        enable UFW even though other services listen publicly (they get
                           blocked; -y does NOT imply this)
  --no-start               prepare everything but do not build/start the containers
  -y, --yes                answer yes to confirmations
  --non-interactive        never prompt (defaults + flags only)
  --dry-run                print what would be done, change nothing (root not required)
  --generate-env-only --env-file PATH
                           only write a new env file (for tests / manual setups)
  --force                  continue on unsupported OS versions
  -h, --help
EOF
}

parse_args() {
  while (($# > 0)); do
    case $1 in
      --api-domain) API_DOMAIN=${2:?}; shift ;;
      --admin-domain) ADMIN_DOMAIN=${2:?}; ADMIN_DOMAIN_GIVEN=1; shift ;;
      --no-admin) ADMIN_DOMAIN=""; ADMIN_DOMAIN_GIVEN=1 ;;
      --email) ACME_EMAIL=${2:?}; shift ;;
      --mode) MODE=${2:?}; shift ;;
      --worker-mode) WORKER_MODE=${2:?}; shift ;;
      --smtp-host) SMTP_HOST=${2:?}; SMTP_GIVEN=1; shift ;;
      --smtp-port) SMTP_PORT=${2:?}; shift ;;
      --smtp-user) SMTP_USER=${2:?}; shift ;;
      --smtp-from) SMTP_FROM=${2:?}; shift ;;
      --smtp-secure) SMTP_SECURE=true ;;
      --ocm-key)
        # The key is never taken from the command line (sudo logs it).
        if [[ -n ${2:-} && ${2:-} != -* ]]; then
          die "--ocm-key takes no value (a key on the command line ends up in /var/log/auth.log): use --ocm-key alone to be asked, or: sudo evcar set OCM_API_KEY"
        fi
        OCM_PROMPT=1
        ;;
      --repo) REPO_URL=${2:?}; shift ;;
      --branch) BRANCH=${2:?}; shift ;;
      --subdir) SUBDIR=${2:?}; shift ;;
      --home) EVCAR_HOME=${2:?}; shift ;;
      --env-file) ENV_FILE=${2:?}; shift ;;
      --generate-env-only) GENERATE_ENV_ONLY=1 ;;
      --public-ip) PUBLIC_IPV4=${2:?}; shift ;;
      --postgis-image) POSTGIS_IMAGE_OVERRIDE=${2:?}; shift ;;
      --install-vhost) INSTALL_VHOST=yes ;;
      --no-install-vhost) INSTALL_VHOST=no ;;
      --obtain-cert) OBTAIN_CERT=yes ;;
      --no-obtain-cert) OBTAIN_CERT=no ;;
      --skip-firewall) SKIP_FIREWALL=1 ;;
      --enable-firewall) ENABLE_FIREWALL=1 ;;
      --no-start) SKIP_START=1 ;;
      -y | --yes) ASSUME_YES=1 ;;
      --non-interactive) INTERACTIVE=0 ;;
      --dry-run) DRY_RUN=1 ;;
      --force) FORCE=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
  done
  [[ -n ${EVCAR_SMTP_PASSWORD:-} ]] && SMTP_GIVEN=1
  [[ -n ${EVCAR_OCM_API_KEY:-} ]] && OCM_GIVEN=1
  ENV_FILE=${ENV_FILE:-$EVCAR_HOME/.env.production}
  return 0
}

# ---------------------------------------------------------------------------
# env file helpers (same format as deploy/lib/common.sh; never `source`d)
# ---------------------------------------------------------------------------
env_read() { # env_read KEY → value from $ENV_FILE ('' when absent)
  local line v
  [[ -r $ENV_FILE ]] || return 0
  line=$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -n 1 || true)
  [[ -n $line ]] || return 0
  v=${line#*=}
  if [[ ${#v} -ge 2 && ${v:0:1} == "'" && ${v: -1} == "'" ]]; then v=${v:1:${#v}-2}; fi
  if [[ ${#v} -ge 2 && ${v:0:1} == '"' && ${v: -1} == '"' ]]; then v=${v:1:${#v}-2}; fi
  printf '%s' "$v"
}

env_line() { # env_line KEY VALUE → KEY=value with compose-safe quoting
  local k=$1 v=$2
  if [[ $v == *"'"* || $v == *$'\n'* ]]; then die "the value of $k must not contain a single quote or a newline"; fi
  if [[ $v =~ ^[A-Za-z0-9_./:@,+=-]*$ ]]; then printf '%s=%s\n' "$k" "$v"; else printf "%s='%s'\n" "$k" "$v"; fi
}

# Values written to the env file cannot contain a single quote or a newline.
env_value_ok() { [[ $1 != *"'"* && $1 != *$'\n'* ]]; }

# ask_env_value VAR "Question" DEFAULT [secret] — like ask, re-asks while the
# answer cannot be stored in the env file.
ask_env_value() {
  local __v=$1
  while :; do
    ask "$@"
    env_value_ok "${!__v}" && return 0
    tty_available || die "the value for '$2' must not contain a single quote (') or a newline"
    warn "a single quote (') or a newline cannot be stored in the configuration file; please enter it again"
  done
}

# Refuses, BEFORE anything is written, values the env file cannot hold.
validate_env_values() {
  local k v
  for k in API_DOMAIN ADMIN_DOMAIN ACME_EMAIL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM OCM_API_KEY BRANCH; do
    v=${!k}
    env_value_ok "$v" || die "the value of $k must not contain a single quote (') or a newline (it could not be stored in the configuration file)"
  done
}

rand_hex() { openssl rand -hex "${1:-32}"; }
rand_b64url() { openssl rand -base64 "${1:-48}" | tr '+/' '-_' | tr -d '=\n'; }

valid_domain() { [[ $1 =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; }
valid_email() { [[ $1 =~ ^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$ ]]; }

# ---------------------------------------------------------------------------
# 1. preflight
# ---------------------------------------------------------------------------
OS_ID="" OS_VERSION="" OS_CODENAME="" ARCH="" RAM_MB=0 CPUS=1

preflight() {
  step "Checking the server"
  if [[ $(id -u) -ne 0 ]]; then
    ((DRY_RUN == 1 || GENERATE_ENV_ONLY == 1)) || die "run as root: sudo bash install.sh"
    warn "not running as root (fine for --dry-run)"
  fi
  if [[ -r /etc/os-release ]]; then
    OS_ID=$(. /etc/os-release && echo "${ID:-}")
    OS_VERSION=$(. /etc/os-release && echo "${VERSION_ID:-}")
    OS_CODENAME=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")
  fi
  if [[ $OS_ID != ubuntu ]]; then
    ((FORCE == 1)) || die "this installer supports Ubuntu 22.04 and 24.04 (found: ${OS_ID:-unknown} $OS_VERSION). --force to try anyway"
    warn "unsupported OS ${OS_ID:-unknown} $OS_VERSION (--force)"
  else
    case $OS_VERSION in
      22.04 | 24.04) ok "Ubuntu $OS_VERSION ($OS_CODENAME)" ;;
      *)
        if [[ $(printf '%s\n%s\n' 22.04 "$OS_VERSION" | sort -V | head -n 1) != 22.04 ]]; then
          die "Ubuntu $OS_VERSION is too old (22.04 or newer required)"
        fi
        warn "Ubuntu $OS_VERSION has not been tested with this kit (22.04 and 24.04 are); continuing"
        ;;
    esac
  fi
  ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
  case $ARCH in
    amd64 | x86_64) ok "architecture amd64" ;;
    arm64 | aarch64)
      warn "arm64 server: the official postgis/postgis image is amd64-only."
      if [[ -z $POSTGIS_IMAGE_OVERRIDE ]]; then
        POSTGIS_IMAGE_OVERRIDE="imresamu/postgis:16-3.5-bookworm"
        warn "using the community multi-arch image $POSTGIS_IMAGE_OVERRIDE (PostgreSQL 16 + PostGIS 3.5). Prefer an amd64 VPS if you can."
      fi
      ;;
    *) die "unsupported CPU architecture: $ARCH (amd64 or arm64 required)" ;;
  esac
  RAM_MB=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
  CPUS=$(nproc 2>/dev/null || echo 1)
  local disk_free_gb
  disk_free_gb=$(df -P -BG / | awk 'NR == 2 { gsub(/G/, "", $4); print $4 }')
  info "RAM ${RAM_MB} MB · CPUs ${CPUS} · free disk on / ${disk_free_gb} GB"
  ((RAM_MB >= 900)) || die "at least 1 GB of RAM is required"
  if ((disk_free_gb < 10)); then
    ((FORCE == 1)) || die "at least 10 GB of free disk space is required (images, database, media, backups)"
    warn "low disk space (--force)"
  elif ((disk_free_gb < 25)); then
    warn "less than 25 GB free: backups of media (360° photos) can fill the disk; watch 'sudo evcar status'"
  fi
  if ! command -v ss >/dev/null 2>&1 && ((DRY_RUN == 0)); then
    apt_install iproute2 # `ss`: detection of the web server on ports 80/443
  fi
  if [[ ! -d /run/systemd/system ]]; then
    ((DRY_RUN == 1)) || die "systemd is required (timers for backups and monitoring)"
    warn "systemd not running here (fine for --dry-run)"
  fi
}

# ---------------------------------------------------------------------------
# 2. configuration (prompts / flags / existing env file)
# ---------------------------------------------------------------------------
detect_checkout() { # defaults from the git checkout this script runs from
  local top
  top=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)
  [[ -n $top ]] || return 0
  if [[ -z $REPO_URL ]]; then
    REPO_URL=$(git -C "$top" remote get-url origin 2>/dev/null || true)
    # never persist credentials embedded in a remote URL
    [[ $REPO_URL == *@* && $REPO_URL == http* ]] && REPO_URL=""
  fi
  [[ -n $BRANCH ]] || BRANCH=$(git -C "$top" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  [[ $BRANCH == HEAD ]] && BRANCH=""
  return 0
}

gather_config() {
  step "Configuration"
  local existing=0 parent
  [[ -f $ENV_FILE ]] && existing=1
  if ((existing == 1)); then
    info "existing configuration found: $ENV_FILE (secrets are kept; only missing values are added)"
    [[ -n $API_DOMAIN ]] || API_DOMAIN=$(env_read API_DOMAIN)
    if ((ADMIN_DOMAIN_GIVEN == 0)); then ADMIN_DOMAIN=$(env_read ADMIN_DOMAIN); ADMIN_DOMAIN_GIVEN=1; fi
    [[ -n $ACME_EMAIL ]] || ACME_EMAIL=$(env_read ACME_EMAIL)
    [[ -n $MODE ]] || MODE=$(env_read EVCAR_PROXY_MODE)
    [[ -n $WORKER_MODE ]] || WORKER_MODE=$(env_read EVCAR_WORKER_MODE)
    [[ -n $BRANCH ]] || BRANCH=$(env_read EVCAR_GIT_BRANCH)
  fi
  detect_checkout
  REPO_URL=${REPO_URL:-$DEFAULT_REPO_URL}
  BRANCH=${BRANCH:-$DEFAULT_BRANCH}

  if [[ -z $API_DOMAIN ]]; then
    ask API_DOMAIN "API domain (a NEW subdomain; the existing website is not touched)" "api.evcar.news"
  fi
  API_DOMAIN=${API_DOMAIN,,}
  valid_domain "$API_DOMAIN" || die "invalid API domain: '$API_DOMAIN'"
  parent=${API_DOMAIN#*.}
  if ((ADMIN_DOMAIN_GIVEN == 0)); then
    ask ADMIN_DOMAIN "Admin panel domain (type 'none' to skip the admin panel)" "admin.$parent"
  fi
  ADMIN_DOMAIN=${ADMIN_DOMAIN,,}
  [[ $ADMIN_DOMAIN == none || $ADMIN_DOMAIN == - ]] && ADMIN_DOMAIN=""
  if [[ -n $ADMIN_DOMAIN ]]; then
    valid_domain "$ADMIN_DOMAIN" || die "invalid admin domain: '$ADMIN_DOMAIN'"
    [[ $ADMIN_DOMAIN != "$API_DOMAIN" ]] || die "the admin domain must differ from the API domain"
  fi
  if [[ -z $ACME_EMAIL ]]; then
    ask ACME_EMAIL "Administrator e-mail (Let's Encrypt account + alerts)" ""
  fi
  valid_email "$ACME_EMAIL" || die "a valid administrator e-mail is required (--email)"

  if ((existing == 0 && SMTP_GIVEN == 0)) && tty_available; then
    echo >&2
    info "Outgoing e-mail (verification / password reset). Without SMTP the API still runs,"
    info "but e-mails are only kept in a local outbox and are NOT delivered."
    if confirm "Configure an SMTP server now?" n; then
      ask_env_value SMTP_HOST "SMTP host (e.g. smtp.gmail.com)" ""
      ask_env_value SMTP_PORT "SMTP port (587 = STARTTLS, 465 = TLS)" "587"
      ask_env_value SMTP_USER "SMTP user name" ""
      ask_env_value SMTP_PASSWORD "SMTP password" "" secret
      ask_env_value SMTP_FROM "Sender (From)" "EV Car News <no-reply@${parent}>"
      SMTP_GIVEN=1
    fi
  fi
  # --smtp-host given without the password in the environment: ask for it.
  if ((SMTP_GIVEN == 1)) && [[ -n $SMTP_HOST && -n $SMTP_USER && -z $SMTP_PASSWORD ]] && tty_available; then
    ask_env_value SMTP_PASSWORD "SMTP password for $SMTP_USER" "" secret
  fi
  if [[ -n $SMTP_HOST ]]; then
    SMTP_PORT=${SMTP_PORT:-587}
    [[ -n $SMTP_SECURE ]] || { [[ $SMTP_PORT == 465 ]] && SMTP_SECURE=true || SMTP_SECURE=false; }
    SMTP_FROM=${SMTP_FROM:-EV Car News <no-reply@${parent}>}
  fi
  if { ((OCM_PROMPT == 1)) || ((existing == 0 && OCM_GIVEN == 0)); } && tty_available; then
    ask_env_value OCM_API_KEY "Open Charge Map API key (optional, Enter to skip)" "" secret
    if [[ -n $OCM_API_KEY ]]; then OCM_GIVEN=1; fi
  elif ((OCM_PROMPT == 1)); then
    die "--ocm-key needs a terminal to ask for the key (or export EVCAR_OCM_API_KEY in a root shell)"
  fi
  validate_env_values

  if [[ -z $WORKER_MODE ]]; then
    if ((RAM_MB < 3072)); then WORKER_MODE=combined; else WORKER_MODE=separate; fi
  fi
  [[ $WORKER_MODE == separate || $WORKER_MODE == combined ]] || die "--worker-mode must be separate or combined"
}

# ---------------------------------------------------------------------------
# 3. proxy mode detection
# ---------------------------------------------------------------------------
WEB_PROCS=""
API_HOST_PORT=3000
ADMIN_HOST_PORT=8081

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -Hltn "sport = :$1" 2>/dev/null | grep -q .
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

# Lines describing listeners on 80/443 ('' when both are free).
web_listeners() {
  local p
  if command -v ss >/dev/null 2>&1; then
    ss -Hltnp '( sport = :80 or sport = :443 )' 2>/dev/null || true
    return 0
  fi
  for p in 80 443; do
    if port_in_use "$p"; then echo "port $p in use"; fi
  done
}

# Names of the processes listening on 80/443.
web_procs() {
  local listeners=$1 n
  if command -v ss >/dev/null 2>&1; then
    grep -oE 'users:\(\("[^"]+"' <<<"$listeners" | cut -d'"' -f2 | sort -u | tr '\n' ' ' || true
    return 0
  fi
  for n in nginx apache2 httpd caddy traefik haproxy lighttpd litespeed openlitespeed; do
    if pgrep -x "$n" >/dev/null 2>&1; then printf '%s ' "$n"; fi
  done
}

# only_procs "LIST" NAME... → every process of LIST is one of NAME (and LIST is not empty).
only_procs() {
  local list=$1 p n hit
  shift
  [[ -n ${list// /} ]] || return 1
  for p in $list; do
    hit=0
    for n in "$@"; do [[ $p == "$n" ]] && hit=1; done
    ((hit == 1)) || return 1
  done
}

evcar_caddy_running() {
  command -v docker >/dev/null 2>&1 &&
    [[ -n $(docker ps -q --filter label=com.docker.compose.project=evcar --filter label=com.docker.compose.service=caddy 2>/dev/null) ]]
}

detect_mode() {
  step "Detecting what uses ports 80/443"
  local listeners
  listeners=$(web_listeners)
  WEB_PROCS=$(web_procs "$listeners")
  if [[ -n $MODE ]]; then
    info "proxy mode: $MODE (configured)"
  elif [[ -z $listeners ]] || evcar_caddy_running; then
    MODE=caddy
    ok "ports 80/443 are free → bundled Caddy with automatic HTTPS"
  elif only_procs "$WEB_PROCS" nginx; then
    MODE=nginx
    ok "nginx already serves ports 80/443 (your existing site) → it will proxy the API subdomain"
  elif only_procs "$WEB_PROCS" apache2 httpd; then
    # Only when Apache is the ONLY program on 80/443: enabling mod_ssl adds
    # `Listen 443`, and a reload that cannot bind it stops Apache (and the site).
    MODE=apache
    ok "Apache already serves ports 80/443 (your existing site) → it will proxy the API subdomain"
  else
    MODE=external
    warn "ports 80/443 are used by: ${WEB_PROCS:-an unknown process} → mode 'external' (you route the subdomain yourself)"
  fi
  case $MODE in caddy | nginx | apache | external) ;; *) die "--mode must be caddy, nginx, apache or external" ;; esac
  if [[ $MODE != caddy ]]; then
    local existing_api existing_admin
    existing_api=$(env_read API_HOST_PORT)
    existing_admin=$(env_read ADMIN_HOST_PORT)
    if [[ -n $existing_api ]]; then
      API_HOST_PORT=$existing_api
    else
      while port_in_use "$API_HOST_PORT" && ((API_HOST_PORT < 3100)); do API_HOST_PORT=$((API_HOST_PORT + 1)); done
    fi
    if [[ -n $existing_admin ]]; then
      ADMIN_HOST_PORT=$existing_admin
    else
      while port_in_use "$ADMIN_HOST_PORT" && ((ADMIN_HOST_PORT < 8180)); do ADMIN_HOST_PORT=$((ADMIN_HOST_PORT + 1)); done
    fi
    info "API on 127.0.0.1:$API_HOST_PORT$([[ -n $ADMIN_DOMAIN ]] && echo ", admin panel on 127.0.0.1:$ADMIN_HOST_PORT") (never public)"
  fi
}

# ---------------------------------------------------------------------------
# 4. system packages, Docker, user, swap, firewall, fail2ban, upgrades
# ---------------------------------------------------------------------------
APT_UPDATED=0
apt_install() {
  local missing=() p
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  ((${#missing[@]} > 0)) || return 0
  if ((APT_UPDATED == 0)); then
    run env DEBIAN_FRONTEND=noninteractive apt-get update -q
    APT_UPDATED=1
  fi
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "${missing[@]}"
}

install_base_packages() {
  step "Base packages"
  dpkg -s fail2ban >/dev/null 2>&1 && F2B_PREINSTALLED=1
  apt_install ca-certificates curl gnupg git openssl ufw fail2ban unattended-upgrades dnsutils iproute2 python3 rsync
  ok "base packages present"
}

compose_version_ok() {
  local v
  v=$(docker compose version --short 2>/dev/null | sed 's/^v//') || return 1
  [[ -n $v ]] && [[ $(printf '%s\n%s\n' "$MIN_COMPOSE_VERSION" "$v" | sort -V | head -n 1) == "$MIN_COMPOSE_VERSION" ]]
}

# The Docker snap (offered by the Ubuntu Server installer) is strictly
# confined: it cannot read build contexts or bind-mount files outside $HOME,
# and this kit builds and mounts from /opt/evcar.
docker_is_snap() {
  local bin
  if command -v snap >/dev/null 2>&1 && snap list docker >/dev/null 2>&1; then return 0; fi
  bin=$(command -v docker 2>/dev/null || true)
  [[ -n $bin && $(readlink -f "$bin") == /snap/* ]]
}

install_docker() {
  step "Docker Engine + compose plugin"
  if docker_is_snap; then
    die "Docker is installed as a SNAP (Ubuntu installer option). The snap cannot build or mount files from /opt/evcar.
      This kit needs Docker Engine from download.docker.com. Check first what runs in the snap:
        sudo docker ps -a        (containers)   sudo docker volume ls   (their data)
      If nothing there is needed (or after moving it), remove it and re-run this installer:
        sudo snap remove docker
      (snap remove keeps a snapshot of its data; 'snap saved' lists it.)"
  fi
  if command -v docker >/dev/null 2>&1 && compose_version_ok; then
    local dv
    dv=$(docker version -f '{{.Server.Version}}' 2>/dev/null || true)
    ok "Docker ${dv:-(daemon not reachable)} with compose $(docker compose version --short) already installed — kept"
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    # Docker from Ubuntu (docker.io) or an old compose: never remove it (other
    # containers may run on this server); add the compose v2 plugin.
    warn "Docker is installed but docker compose >= $MIN_COMPOSE_VERSION is missing"
    if dpkg -s docker-ce >/dev/null 2>&1; then
      apt_install docker-compose-plugin
    else
      apt_install docker-compose-v2 || true
    fi
    ((DRY_RUN == 1)) || compose_version_ok ||
      die "could not get docker compose >= $MIN_COMPOSE_VERSION. Install Docker from https://docs.docker.com/engine/install/ubuntu/ and re-run"
    return 0
  fi
  local p
  for p in containerd runc podman-docker; do
    if dpkg -s "$p" >/dev/null 2>&1; then
      die "package '$p' conflicts with Docker's containerd.io. Remove it first (check that nothing else uses it): apt-get remove $p"
    fi
  done
  run install -m 0755 -d /etc/apt/keyrings
  run curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  run chmod a+r /etc/apt/keyrings/docker.asc
  write_file /etc/apt/sources.list.d/docker.sources 644 <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${OS_CODENAME:-noble}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  run env DEBIAN_FRONTEND=noninteractive apt-get update -q
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  run systemctl enable --now docker
  ((DRY_RUN == 1)) || compose_version_ok || die "docker compose is not working after installation"
  ok "Docker installed from download.docker.com"
}

create_user_and_dirs() {
  step "Directories in $EVCAR_HOME"
  run install -d -m 755 -o root -g root "$EVCAR_HOME"
  # Root-owned: root runs evcar.sh, lib/, the compose files and the systemd
  # units from this checkout, so nobody else may be able to change them.
  run install -d -m 755 -o root -g root "$EVCAR_HOME/app"
  run install -d -m 700 -o root -g root "$EVCAR_HOME/backups" "$EVCAR_HOME/state" "$EVCAR_HOME/run" "$EVCAR_HOME/rclone"
  run install -d -m 755 -o root -g root "$EVCAR_HOME/proxy"
  ok "layout: $EVCAR_HOME/{app,backups,state,run,proxy,rclone} (secrets: $ENV_FILE, mode 600)"
}

setup_swap() {
  step "Swap"
  if [[ -n $(swapon --noheadings --show 2>/dev/null) ]]; then
    ok "swap already active ($(free -m | awk '/^Swap:/ { print $2 }') MB)"
    return 0
  fi
  if ((RAM_MB >= 2048)); then
    ok "RAM ≥ 2 GB, no swap file needed"
    return 0
  fi
  info "RAM < 2 GB: creating a 2 GB swap file (image builds need memory)"
  if [[ ! -f /swapfile ]]; then
    run fallocate -l 2G /swapfile || run dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    run chmod 600 /swapfile
    run mkswap /swapfile
  fi
  run swapon /swapfile
  if ! grep -qE '^/swapfile[[:space:]]' /etc/fstab; then
    if ((DRY_RUN == 1)); then run sh -c 'echo "/swapfile none swap sw 0 0" >> /etc/fstab'; else echo '/swapfile none swap sw 0 0' >>/etc/fstab; fi
  fi
  write_file /etc/sysctl.d/99-evcar-swap.conf 644 <<<'vm.swappiness=10'
  run sysctl -q -p /etc/sysctl.d/99-evcar-swap.conf
  ok "2 GB swap enabled"
}

ssh_ports() {
  local ports
  ports=$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }' | sort -un | tr '\n' ' ' || true)
  [[ -n $ports ]] || ports=$(ss -Hltnp 2>/dev/null | awk '/"sshd"/ { n = split($4, a, ":"); print a[n] }' | sort -un | tr '\n' ' ' || true)
  printf '%s' "${ports:-22}"
}

# Public listeners (TCP and UDP) that UFW's "deny incoming" would block, as
# "port/proto" words: everything except loopback, SSH, 80/443, DHCP clients,
# mDNS and Docker-published ports (docker-proxy: Docker bypasses UFW anyway).
other_public_listeners() {
  local sshp=$1
  ss -Hltunp 2>/dev/null | awk -v ssh=" ${sshp} " '
    {
      proto = $1; local = $5
      if ($0 ~ /"docker-proxy"/) next
      n = split(local, parts, ":"); port = parts[n]
      addr = substr(local, 1, length(local) - length(port) - 1)
      if (addr ~ /^127\./ || addr ~ /^\[::1\]/ || addr ~ /^\[::ffff:127\./ || addr ~ /%lo$/ || addr ~ /^\[fe80:/) next
      if (proto == "tcp" && (index(ssh, " " port " ") || port == 80 || port == 443)) next
      if (proto == "udp" && (port == 443 || port == 68 || port == 546 || port == 5353)) next
      print port "/" proto
    }' | sort -u -t/ -k1,1n | tr '\n' ' ' | sed 's/ $//' || true
}

# ufw_mentions_port PORT → an existing UFW rule already names this port (any source).
ufw_mentions_port() {
  ufw status 2>/dev/null | grep -qE "^([^ ]*,)?$1([/, ]|\$)"
}

setup_firewall() {
  step "Firewall (UFW)"
  if ((SKIP_FIREWALL == 1)); then
    warn "--skip-firewall: UFW not changed"
    return 0
  fi
  local sshp active=0 others p
  sshp=$(ssh_ports)
  ufw status 2>/dev/null | grep -q '^Status: active' && active=1

  if ((active == 1)); then
    # The administrator manages this firewall: never add SSH-from-anywhere
    # (it would override source-restricted SSH rules) and never touch 80/443 of
    # the existing site. Only ports of the bundled Caddy that no rule names yet.
    ok "UFW is already active: its existing rules are kept as they are (SSH and the existing site included)"
    if [[ $MODE == caddy ]]; then
      for p in 80/tcp 443/tcp 443/udp; do
        if ufw_mentions_port "${p%/*}"; then
          info "UFW already has a rule for port ${p%/*}: unchanged"
        else
          run ufw allow "$p"
        fi
      done
      info "(Docker-published ports bypass UFW: Caddy's 80/443 are reachable in any case.)"
    else
      info "mode $MODE: ports 80/443 belong to your web server and its rules; nothing added"
    fi
    return 0
  fi

  # UFW inactive: enabling it blocks every other public service of this server.
  others=$(other_public_listeners "$sshp")
  if [[ -n $others ]]; then
    warn "other services listen publicly on: $others — enabling UFW would block them."
    if ((ENABLE_FIREWALL == 1)); then
      warn "--enable-firewall: enabling UFW anyway"
    elif ((ASSUME_YES == 0)) && tty_available; then
      if ! confirm "Enable UFW anyway (only SSH $sshp, 80 and 443 stay open; the services above get blocked)?" n; then
        warn "UFW left disabled. Enable it later yourself (allow those services first), e.g.: ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443; ufw enable"
        return 0
      fi
    else
      warn "UFW left DISABLED (non-interactive / -y never blocks existing services)."
      warn "Allow those services first, then: ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443; ufw enable — or re-run with --enable-firewall"
      return 0
    fi
  fi
  if ufw app list 2>/dev/null | grep -q OpenSSH; then run ufw allow OpenSSH; fi
  for p in $sshp; do run ufw allow "$p/tcp"; done
  run ufw allow 80/tcp
  run ufw allow 443
  if ! { run ufw default deny incoming && run ufw default allow outgoing && run ufw --force enable; }; then
    warn "UFW could not be enabled (see the message above). The server works, but configure a firewall!"
    return 0
  fi
  ok "UFW enabled: SSH ($sshp), 80/tcp and 443 (tcp+udp) allowed, everything else denied"
  info "Note: Docker-published ports bypass UFW — this stack publishes only 80/443 (caddy mode) or 127.0.0.1 ports."
}

F2B_PREINSTALLED=0

setup_fail2ban() {
  step "fail2ban (sshd)"
  local backend=auto sshp ours=/etc/fail2ban/jail.d/evcar-sshd.local f
  if [[ ! -f $ours ]]; then
    # The administrator's own [sshd] jail wins: jail.d/*.local is read after
    # jail.local, so a drop-in of ours would silently replace their settings.
    for f in /etc/fail2ban/jail.local /etc/fail2ban/jail.d/*.local /etc/fail2ban/jail.d/*.conf; do
      [[ -f $f && $f != */defaults-debian.conf ]] || continue
      if grep -qE '^[[:space:]]*\[sshd\]' "$f"; then
        ok "an [sshd] jail is already configured ($f): left unchanged"
        return 0
      fi
    done
    if ((F2B_PREINSTALLED == 1)) && fail2ban-client status sshd >/dev/null 2>&1; then
      ok "fail2ban already protects sshd (existing configuration): left unchanged"
      return 0
    fi
  fi
  sshp=$(ssh_ports)
  if [[ ! -e /var/log/auth.log ]]; then
    backend=systemd
    apt_install python3-systemd
  fi
  write_file "$ours" 644 <<EOF
# Managed by the EV Car News installer.
[sshd]
enabled  = true
port     = $(tr ' ' ',' <<<"${sshp% }")
backend  = $backend
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
  if run systemctl enable fail2ban && run systemctl restart fail2ban; then
    ok "fail2ban protects sshd (5 failures / 10 min → 1 h ban)"
  else
    warn "fail2ban did not start (see: journalctl -u fail2ban); continuing"
  fi
}

setup_unattended_upgrades() {
  step "Automatic security updates"
  write_file /etc/apt/apt.conf.d/20auto-upgrades 644 <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  if run systemctl enable --now unattended-upgrades; then
    ok "unattended-upgrades enabled (security updates; no automatic reboot)"
  else
    warn "could not enable unattended-upgrades; continuing"
  fi
}

# ---------------------------------------------------------------------------
# 5. code
# ---------------------------------------------------------------------------
PROJECT_DIR=""

# git as root, never running anything from the repository's .git (hooks, fsmonitor).
git_safe() { run git -c core.hooksPath=/dev/null -c core.fsmonitor= "$@"; }

# Checkouts made by older versions of this installer belonged to the `evcar`
# user: hand them back to root (see create_user_and_dirs).
own_code_by_root() {
  local app=$1
  [[ -d $app ]] || return 0
  if [[ $(stat -c %u "$app") != 0 ]] || [[ -n $(find "$app" -xdev \! -type l \( \! -user 0 -o -perm /022 \) -print -quit 2>/dev/null) ]]; then
    info "making $app owned by root (the root-run scripts come from it)"
    run chown -R root:root "$app"
    run chmod -R go-w "$app"
  fi
}

fetch_code() {
  step "Code ($REPO_URL, branch $BRANCH)"
  local app="$EVCAR_HOME/app"
  own_code_by_root "$app"
  if [[ -d $app/.git ]]; then
    if [[ -n $(git -c core.hooksPath=/dev/null -c core.fsmonitor= -C "$app" status --porcelain --untracked-files=no 2>/dev/null || true) ]]; then
      warn "local changes in $app: code not updated (use: sudo evcar update)"
    else
      git_safe -C "$app" fetch --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
      git_safe -C "$app" checkout -B "$BRANCH" "origin/$BRANCH"
    fi
  else
    if [[ -d $app && -n $(ls -A "$app" 2>/dev/null || true) ]]; then
      die "$app is not empty and is not a git checkout; move it away and re-run"
    fi
    git_safe clone --branch "$BRANCH" --filter=blob:none "$REPO_URL" "$app" ||
      die "git clone failed. Check --repo/--branch (a private repository needs a deploy key, see docs/DEPLOYMENT.md)"
  fi
  own_code_by_root "$app"
  PROJECT_DIR="$app/$SUBDIR"
  [[ $SUBDIR == . || $SUBDIR == '' ]] && PROJECT_DIR=$app
  if ((DRY_RUN == 0)); then
    [[ -f $PROJECT_DIR/deploy/evcar.sh ]] || die "$PROJECT_DIR/deploy/evcar.sh not found (wrong --branch or --subdir?)"
    ok "code at $(git -C "$app" log -1 --format='%h %s' | cut -c1-70)"
  fi
}

# ---------------------------------------------------------------------------
# 6. env file
# ---------------------------------------------------------------------------
resource_profile() { # sets the RES_* variables from the RAM size
  if ((RAM_MB < 1536)); then
    RES=(tiny 512M 96MB 256MB 40 160M 96mb 1G 448 768M 384)
  elif ((RAM_MB < 3072)); then
    RES=(small 768M 128MB 512MB 50 256M 160mb 1G 512 1G 512)
  elif ((RAM_MB < 6144)); then
    RES=(medium 1G 256MB 1GB 60 384M 256mb 768M 512 1G 512)
  else
    RES=(large 2G 512MB 3GB 80 512M 384mb 1G 768 2G 1024)
  fi
}

# new_env_content → prints a complete new env file (fresh secrets)
new_env_content() {
  resource_profile
  local smtp_host=$SMTP_HOST smtp_port=${SMTP_PORT:-587} smtp_secure=${SMTP_SECURE:-false} from=${SMTP_FROM:-EV Car News <no-reply@${API_DOMAIN#*.}>}
  if [[ -z $smtp_host ]]; then
    smtp_host=mailpit smtp_port=1025 smtp_secure=false
    from="EV Car News <no-reply@${API_DOMAIN#*.}>"
  fi
  # Built before the heredoc: a refused value aborts here (inside the heredoc's
  # command substitution the error would only end a subshell and the key
  # would be silently missing from the file).
  local l_smtp
  l_smtp=$(
    env_line SMTP_HOST "$smtp_host" &&
      env_line SMTP_PORT "$smtp_port" &&
      env_line SMTP_SECURE "$smtp_secure" &&
      env_line SMTP_USER "$SMTP_USER" &&
      env_line SMTP_PASSWORD "$SMTP_PASSWORD" &&
      env_line MAIL_FROM "$from" &&
      env_line OCM_API_KEY "$OCM_API_KEY"
  ) || return 1
  cat <<EOF
# =============================================================================
# EV Car News — production configuration. Generated by install.sh on $(date -u +%FT%TZ).
# SECRET FILE: mode 600, owner root. Never commit, e-mail or paste it anywhere.
# Change a value:  sudo evcar set KEY=VALUE   then apply:  sudo evcar up
# Secrets (passwords, API keys, webhook URLs): sudo evcar set KEY   (asked without echo)
# Values: KEY=value or KEY='value with spaces' (no single quotes inside).
# =============================================================================

# --- Deployment (read by evcar.sh / docker compose — NOT passed to the app) ---
API_DOMAIN=$API_DOMAIN
# Empty = no admin panel.
ADMIN_DOMAIN=$ADMIN_DOMAIN
ACME_EMAIL=$ACME_EMAIL
# caddy | nginx | apache | external
EVCAR_PROXY_MODE=$MODE
# separate = BullMQ worker in its own container | combined = inside the API
EVCAR_WORKER_MODE=$WORKER_MODE
EVCAR_GIT_BRANCH=$BRANCH
# nginx/apache/external modes: ports bound on 127.0.0.1 only.
API_HOST_PORT=$API_HOST_PORT
ADMIN_HOST_PORT=$ADMIN_HOST_PORT
# Largest request body accepted by the proxy (360° upload chunks are ≤ 16 MiB).
PROXY_MAX_BODY=32MB
${POSTGIS_IMAGE_OVERRIDE:+POSTGIS_IMAGE=$POSTGIS_IMAGE_OVERRIDE}
${PUBLIC_IPV4:+PUBLIC_IPV4=$PUBLIC_IPV4}

# --- Database / Redis (random, generated once) ---
POSTGRES_DB=evcar
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=$(rand_hex 32)
APP_DB_USER=evcar_app
APP_DB_PASSWORD=$(rand_hex 32)
REDIS_PASSWORD=$(rand_hex 32)

# --- Resources (profile "${RES[0]}" for ${RAM_MB} MB RAM) ---
PG_MEM_LIMIT=${RES[1]}
PG_SHARED_BUFFERS=${RES[2]}
PG_EFFECTIVE_CACHE_SIZE=${RES[3]}
PG_MAX_CONNECTIONS=${RES[4]}
REDIS_MEM_LIMIT=${RES[5]}
REDIS_MAXMEMORY=${RES[6]}
API_MEM_LIMIT=${RES[7]}
API_NODE_MAX_OLD_SPACE_MB=${RES[8]}
WORKER_MEM_LIMIT=${RES[9]}
WORKER_NODE_MAX_OLD_SPACE_MB=${RES[10]}

# --- Backups & monitoring ---
BACKUP_DIR=$EVCAR_HOME/backups
BACKUP_KEEP_DAILY=7
BACKUP_KEEP_WEEKLY=4
BACKUP_INCLUDE_MEDIA=true
# A backup never leaves less than this share of the disk free (PostgreSQL/Redis
# on the same disk); media are skipped (database only + alert) when they do not fit.
BACKUP_MIN_FREE_PERCENT=15
# Off-site copies (sudo evcar offsite-setup): an rclone "crypt" remote, e.g. offsite-crypt:
RCLONE_REMOTE=
ALERT_EMAIL=$ACME_EMAIL
# Optional: Slack/Discord/Telegram-compatible webhook (JSON {"text": ...}); ALERT_WEBHOOK_FORMAT=text for ntfy.
ALERT_WEBHOOK_URL=
DISK_ALERT_PERCENT=85
# Optional dead-man's switch URL pinged after every successful monitoring run.
MONITOR_HEARTBEAT_URL=

# --- Application (every key documented in .env.example may be added here) ---
# APP_PUBLIC_BASE_URL / ADMIN_BASE_URL / CORS_ORIGINS are derived from the
# domains above unless you set them explicitly.
SHARE_BASE_URL=https://evcar.news
TRUST_PROXY=1
LOG_LEVEL=info
SWAGGER_ENABLED=false
JWT_ACCESS_SECRET=$(rand_b64url 48)
IP_HASH_SALT=$(rand_hex 32)
STORAGE_DRIVER=local
STORAGE_PUBLIC_BASE_URL=
MAIL_DRIVER=smtp
# SMTP_HOST=mailpit = local outbox: e-mails are NOT delivered (sudo evcar mail-outbox).
$l_smtp
ROUTING_PROVIDER=none
# Password of the local outbox UI/API (user "evcar"; only used while SMTP_HOST=mailpit).
MAILPIT_UI_PASSWORD=$(rand_hex 24)
EOF
}

mask_secrets() {
  sed -E 's/^((POSTGRES_SUPERUSER_PASSWORD|APP_DB_PASSWORD|REDIS_PASSWORD|JWT_ACCESS_SECRET|IP_HASH_SALT|SMTP_PASSWORD|OCM_API_KEY|MAILPIT_UI_PASSWORD)=).+$/\1<secret, not shown>/'
}

write_env_file() {
  step "Configuration file $ENV_FILE"
  if [[ -f $ENV_FILE ]]; then
    # Keep every existing value (secrets!), add keys that are new or were given as flags.
    local fresh key line added=0
    fresh=$(new_env_content)
    if ((DRY_RUN == 0)); then
      cp -p "$ENV_FILE" "$ENV_FILE.bak.$(date -u +%Y%m%d%H%M%S)"
      chmod 600 "$ENV_FILE".bak.*
    fi
    while IFS= read -r line; do
      [[ $line =~ ^([A-Z][A-Z0-9_]*)= ]] || continue
      key=${BASH_REMATCH[1]}
      if ! grep -qE "^[[:space:]]*$key=" "$ENV_FILE"; then
        if ((DRY_RUN == 1)); then
          printf '[dry-run] would add %s\n' "$(mask_secrets <<<"$line")" >&2
        else
          printf '%s\n' "$line" >>"$ENV_FILE"
        fi
        added=$((added + 1))
      fi
    done <<<"$fresh"
    local k v
    for k in API_DOMAIN ADMIN_DOMAIN ACME_EMAIL EVCAR_PROXY_MODE EVCAR_WORKER_MODE EVCAR_GIT_BRANCH; do
      case $k in
        API_DOMAIN) v=$API_DOMAIN ;; ADMIN_DOMAIN) v=$ADMIN_DOMAIN ;; ACME_EMAIL) v=$ACME_EMAIL ;;
        EVCAR_PROXY_MODE) v=$MODE ;; EVCAR_WORKER_MODE) v=$WORKER_MODE ;; EVCAR_GIT_BRANCH) v=$BRANCH ;;
      esac
      if [[ $(env_read "$k") != "$v" ]]; then
        if ((DRY_RUN == 1)); then
          printf '[dry-run] would set %s=%s\n' "$k" "$v" >&2
        else
          sed -i -E "/^[[:space:]]*$k=/d" "$ENV_FILE"
          env_line "$k" "$v" >>"$ENV_FILE"
        fi
      fi
    done
    if ((SMTP_GIVEN == 1)) && [[ -n $SMTP_HOST ]] && ((DRY_RUN == 0)); then
      for k in SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD MAIL_FROM; do
        case $k in
          SMTP_HOST) v=$SMTP_HOST ;; SMTP_PORT) v=$SMTP_PORT ;; SMTP_SECURE) v=$SMTP_SECURE ;;
          SMTP_USER) v=$SMTP_USER ;; SMTP_PASSWORD) v=$SMTP_PASSWORD ;; MAIL_FROM) v=$SMTP_FROM ;;
        esac
        sed -i -E "/^[[:space:]]*$k=/d" "$ENV_FILE"
        env_line "$k" "$v" >>"$ENV_FILE"
      done
    fi
    if ((OCM_GIVEN == 1)) && ((DRY_RUN == 0)); then
      sed -i -E '/^[[:space:]]*OCM_API_KEY=/d' "$ENV_FILE"
      env_line OCM_API_KEY "$OCM_API_KEY" >>"$ENV_FILE"
    fi
    ((DRY_RUN == 1)) || chmod 600 "$ENV_FILE"
    ok "existing secrets kept; $added new key(s) added"
    return 0
  fi
  if ((DRY_RUN == 1)); then
    printf '[dry-run] would write %s (mode 600, root) with freshly generated secrets:\n' "$ENV_FILE" >&2
    new_env_content | mask_secrets | sed 's/^/      | /' >&2
    return 0
  fi
  install -d -m 755 "$(dirname "$ENV_FILE")"
  (
    umask 077
    new_env_content >"$ENV_FILE.tmp"
  )
  chmod 600 "$ENV_FILE.tmp"
  [[ $(id -u) -eq 0 ]] && chown root:root "$ENV_FILE.tmp"
  mv -f "$ENV_FILE.tmp" "$ENV_FILE"
  ok "written with random secrets (openssl rand). Keep a copy in your password manager:"
  info "sudo cat $ENV_FILE"
}

# ---------------------------------------------------------------------------
# 7. DNS
# ---------------------------------------------------------------------------
DNS_OK=0
detect_public_ip() {
  local url ip=''
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ip=$(curl -4 -fsS --max-time 6 "$url" 2>/dev/null | tr -d '[:space:]' || true)
    [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && break
    ip=''
  done
  printf '%s' "$ip"
}

dns_records() { # dns_records NAME TYPE
  if command -v dig >/dev/null 2>&1; then
    dig +short +time=3 +tries=2 "$2" "$1" @1.1.1.1 2>/dev/null | grep -E '^[0-9a-fA-F:.]+$' | sort -u || true
  else
    getent "$([[ $2 == AAAA ]] && echo ahostsv6 || echo ahostsv4)" "$1" 2>/dev/null | awk '{ print $1 }' | sort -u || true
  fi
}

check_dns() {
  step "DNS"
  [[ -n $PUBLIC_IPV4 ]] || PUBLIC_IPV4=$(detect_public_ip)
  info "this server's public IPv4: ${PUBLIC_IPV4:-unknown}"
  local d a aaaa all_ok=1
  for d in "$API_DOMAIN" $ADMIN_DOMAIN; do
    a=$(dns_records "$d" A | tr '\n' ' ')
    aaaa=$(dns_records "$d" AAAA | tr '\n' ' ')
    if [[ -n $PUBLIC_IPV4 && " $a " == *" $PUBLIC_IPV4 "* ]]; then
      ok "$d → $a"
      [[ -n $aaaa ]] && warn "$d also has AAAA $aaaa: it must be THIS server's IPv6, otherwise delete it (certificates fail)"
    else
      all_ok=0
      warn "$d → ${a:-no A record}. Create at your DNS provider:  A  ${d}  →  ${PUBLIC_IPV4:-<this server IPv4>}"
    fi
  done
  if ((all_ok == 1)); then
    DNS_OK=1
  else
    info "Only ADD these records — do not change the records of the main site (evcar.news / www)."
    info "HTTPS certificates are requested automatically once DNS points here (check: sudo evcar dns-check)."
  fi
}

# ---------------------------------------------------------------------------
# 8. evcar command, timers, start
# ---------------------------------------------------------------------------
install_cli() {
  step "evcar command"
  run ln -sfn "$PROJECT_DIR/deploy/evcar.sh" /usr/local/sbin/evcar
  if [[ ! -f $EVCAR_HOME/state/installed_at ]]; then
    if ((DRY_RUN == 1)); then run sh -c "date -u +%FT%TZ > $EVCAR_HOME/state/installed_at"; else date -u +%FT%TZ >"$EVCAR_HOME/state/installed_at"; fi
  fi
  ok "run 'sudo evcar help' for all commands"
}

# Right after the CLI, BEFORE the (long, failure-prone) first start: backups,
# restore tests and monitoring must exist even if a later step fails. The
# maintenance flag keeps the monitor quiet while the stack is being built.
install_timers() {
  step "systemd timers (daily backup, weekly restore test, monitoring)"
  if ((DRY_RUN == 0)); then
    install -d -m 700 "$EVCAR_HOME/state"
    date +%s >"$EVCAR_HOME/state/maintenance"
  fi
  run /usr/local/sbin/evcar timers install
}

start_stack() {
  step "Build and start (first build: 5-20 minutes)"
  if ((SKIP_START == 1)); then
    warn "--no-start: start later with: sudo evcar up --build"
    return 0
  fi
  if [[ -s $EVCAR_HOME/state/release ]]; then
    # Already installed: same path as `evcar update` (release tag, pre-update backup, migrations).
    run /usr/local/sbin/evcar update --no-pull
  else
    run /usr/local/sbin/evcar up --build
  fi
}

host_proxy_setup() {
  [[ $MODE == nginx || $MODE == apache ]] || return 0
  step "Existing $MODE: vhost for $API_DOMAIN${ADMIN_DOMAIN:+ and $ADMIN_DOMAIN}"
  info "A NEW file is added for the API subdomain only; the evcar.news site config is never changed."
  local args=()
  # Without a terminal, the web server is only touched when asked explicitly.
  if [[ $INSTALL_VHOST == yes ]] || { [[ -z $INSTALL_VHOST ]] && tty_available && confirm "Install the vhost now (config test + reload of $MODE)?" y; }; then
    args+=(--install --yes)
    if ((DNS_OK == 1)) && { [[ $OBTAIN_CERT == yes ]] || { [[ -z $OBTAIN_CERT ]] && tty_available && confirm "Request the Let's Encrypt certificate now (certbot)?" y; }; }; then
      args+=(--cert)
    fi
  fi
  run /usr/local/sbin/evcar proxy-setup "${args[@]}"
}

print_summary() { # print_summary [FAILED_STEP...]
  local admin_line='' title f
  [[ -n $ADMIN_DOMAIN ]] && admin_line="   Admin panel:  https://$ADMIN_DOMAIN"
  title="${C_BOLD}${C_GREEN}EV Car News is installed.${C_RESET}"
  (($# == 0)) || title="${C_BOLD}${C_YELLOW}EV Car News is installed, but some steps FAILED (see the end).${C_RESET}"
  cat >&2 <<EOF

${title}$([[ $DRY_RUN -eq 1 ]] && echo " (dry run: this is what WOULD be configured)")
   API:          https://$API_DOMAIN/api/v1   (test: curl https://$API_DOMAIN/api/v1/health)
$admin_line
   Mode:         $MODE · worker: $WORKER_MODE
   Config:       $ENV_FILE (secrets, mode 600)
   Backups:      $EVCAR_HOME/backups (daily 03:15 UTC, 7 daily + 4 weekly; restore test every Sunday)

Next steps:
   1. Create the first owner (prints a one-time link):
        sudo evcar create-owner --email $ACME_EMAIL --name "Owner"
   2. Check everything:     sudo evcar status
   3. Mobile app: GitHub → Settings → Secrets and variables → Actions → Variables:
        EVCAR_API_BASE_URL = https://$API_DOMAIN/api/v1
      then Actions → evcar-android → Run workflow (new APK).
EOF
  if [[ $(env_read SMTP_HOST) == mailpit || (-z $SMTP_HOST && ! -f $ENV_FILE) ]]; then
    printf '   %sE-mail is NOT delivered yet%s (local outbox). See: sudo evcar mail-outbox\n' "$C_YELLOW" "$C_RESET" >&2
  fi
  ((DNS_OK == 1)) || printf '   %sDNS is not ready%s: add the A record(s) above, then: sudo evcar dns-check\n' "$C_YELLOW" "$C_RESET" >&2
  if [[ -z $(env_read ALERT_WEBHOOK_URL) ]] && [[ $(env_read SMTP_HOST) == mailpit || -z $(env_read SMTP_HOST) ]]; then
    printf '   %sAlerts reach NOBODY yet%s (no real SMTP, no webhook): backup failures and outages are only logged.\n' "$C_YELLOW" "$C_RESET" >&2
    printf '      Configure SMTP or ALERT_WEBHOOK_URL (docs: "المراقبة والتنبيهات"), then: sudo evcar alert-test\n' >&2
  fi
  if (($# > 0)); then
    printf '\n%sFailed steps%s (backups and monitoring ARE installed; fix, then run the command shown):\n' "$C_RED" "$C_RESET" >&2
    for f in "$@"; do printf '   - %s\n' "$f" >&2; done
  fi
  ((DRY_RUN == 0)) || printf '\n%sDRY RUN — nothing was changed.%s\n' "$C_YELLOW" "$C_RESET" >&2
}

main() {
  parse_args "$@"
  if ((GENERATE_ENV_ONLY == 1)); then
    [[ -n $API_DOMAIN && -n $ACME_EMAIL ]] || die "--generate-env-only needs --api-domain and --email"
    [[ ! -e $ENV_FILE ]] || die "$ENV_FILE already exists"
    RAM_MB=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
    INTERACTIVE=0
    MODE=${MODE:-caddy}
    BRANCH=${BRANCH:-$DEFAULT_BRANCH}
    ((ADMIN_DOMAIN_GIVEN == 1)) || ADMIN_DOMAIN="admin.${API_DOMAIN#*.}"
    WORKER_MODE=${WORKER_MODE:-separate}
    validate_env_values
    write_env_file
    return 0
  fi
  printf '%sEV Car News — server installer%s%s\n' "$C_BOLD" "$C_RESET" "$([[ $DRY_RUN -eq 1 ]] && echo ' (DRY RUN: nothing will be changed)')" >&2
  preflight
  gather_config
  detect_mode
  step "Summary"
  info "API domain:    $API_DOMAIN"
  info "Admin panel:   ${ADMIN_DOMAIN:-not deployed}"
  info "E-mail:        $ACME_EMAIL"
  info "Proxy mode:    $MODE ${WEB_PROCS:+(ports 80/443 used by: $WEB_PROCS)}"
  info "Worker:        $WORKER_MODE"
  local smtp_desc=$SMTP_HOST
  [[ -n $smtp_desc ]] || smtp_desc=$(env_read SMTP_HOST)
  if [[ -z $smtp_desc || $smtp_desc == mailpit ]]; then smtp_desc="not configured → local outbox (e-mails NOT delivered)"; fi
  info "SMTP:          $smtp_desc"
  info "Code:          $REPO_URL ($BRANCH) → $EVCAR_HOME/app/$SUBDIR"
  if ((DRY_RUN == 0)) && ! confirm "Continue?" y; then die "aborted"; fi

  install_base_packages
  install_docker
  create_user_and_dirs
  setup_swap
  setup_firewall
  setup_fail2ban
  setup_unattended_upgrades
  fetch_code
  check_dns
  write_env_file
  install_cli
  # From here on a failing step is reported and the next ones still run.
  local failed=()
  install_timers || failed+=("systemd timers: sudo evcar timers install")
  start_stack || failed+=("build/start of the application: sudo evcar up --build   (details: sudo evcar logs api)")
  host_proxy_setup || failed+=("$MODE vhost / certificate: sudo evcar proxy-setup --install --cert   (DNS: sudo evcar dns-check)")
  ((DRY_RUN == 1)) || rm -f "$EVCAR_HOME/state/maintenance"
  print_summary "${failed[@]}"
  ((${#failed[@]} == 0)) || exit 1
}

main "$@"
