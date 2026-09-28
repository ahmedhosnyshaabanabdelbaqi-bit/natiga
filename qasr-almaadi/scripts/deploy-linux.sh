#!/usr/bin/env bash
# Local installer only. Run on the destination Ubuntu host after uploading source.
set -Eeuo pipefail
umask 077

fail() { printf 'Deployment stopped: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run with sudo on the destination host.'
PROJECT_ROOT=${PROJECT_ROOT:-/srv/projects/child.egsystem.net}
APP_USER=${APP_USER:-ahmed}
APP_PORT=${APP_PORT:-4317}
NGINX_PORT=${NGINX_PORT:-8087}
NODE_VERSION=${NODE_VERSION:-24.20.0}
INSTALL_NGINX=${INSTALL_NGINX:-0}
HOSTNAME_PUBLIC=child.egsystem.net
SERVICE=child-egsystem-nicu
MARKER='# Managed by qasr-nicu deploy-linux.sh'
[[ $PROJECT_ROOT =~ ^/srv/projects/[a-zA-Z0-9._/-]+$ ]] || fail 'Project must be a path under /srv/projects without spaces.'
PROJECT_ROOT=$(realpath -m "$PROJECT_ROOT")
[[ $PROJECT_ROOT == /srv/projects/* && $PROJECT_ROOT != /srv/projects/ ]] || fail 'Invalid resolved project directory.'
APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ $APP_DIR == "$PROJECT_ROOT" || $APP_DIR == "$PROJECT_ROOT/"* ]] || fail 'Upload the application inside PROJECT_ROOT before running.'
[[ $APP_DIR =~ ^[a-zA-Z0-9/._-]+$ ]] || fail 'Application path cannot contain spaces or shell metacharacters.'
[[ $APP_USER =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'Invalid service account name.'
id "$APP_USER" >/dev/null 2>&1 || fail 'Create the dedicated service account first.'
[[ $(id -u "$APP_USER") -ne 0 ]] || fail 'The app must not run as root.'
APP_GROUP=$(id -gn "$APP_USER")
for port in "$APP_PORT" "$NGINX_PORT"; do
  [[ $port =~ ^[0-9]{4,5}$ ]] && (( 10#$port >= 1024 && 10#$port <= 65535 )) || fail 'Ports must be between 1024 and 65535.'
done
[[ $APP_PORT != "$NGINX_PORT" ]] || fail 'Application and nginx ports must differ.'
[[ $NODE_VERSION =~ ^24\.[0-9]+\.[0-9]+$ ]] || fail 'This installer requires a pinned Node 24 version.'
[[ $INSTALL_NGINX == 0 || $INSTALL_NGINX == 1 ]] || fail 'INSTALL_NGINX must be 0 or 1.'
for binary in curl tar sha256sum openssl runuser systemctl realpath ss; do
  command -v "$binary" >/dev/null || fail "Missing prerequisite: $binary"
done
[[ -f $APP_DIR/package-lock.json && -f $APP_DIR/server/index.ts ]] || fail 'Application source or lockfile missing.'
UNIT_PATH=/etc/systemd/system/$SERVICE.service
if [[ -e $UNIT_PATH ]]; then
  [[ ! -L $UNIT_PATH ]] && grep -Fxq "$MARKER" "$UNIT_PATH" || fail 'Existing service unit is not owned by this installer.'
fi

# All application-owned state stays on the project volume, including the runtime.
install -d -m 750 -o "$APP_USER" -g "$APP_GROUP" "$PROJECT_ROOT"
for directory in .runtime .cache/npm .home .tmp .config data backups logs deploy; do
  install -d -m 750 -o "$APP_USER" -g "$APP_GROUP" "$PROJECT_ROOT/$directory"
done
CONFIG=$PROJECT_ROOT/.config/app.env
if [[ ! -e $CONFIG ]]; then
  # A new secret does NOT change an existing database. Refuse that ambiguous case.
  [[ ! -d $PROJECT_ROOT/data/training ]] || [[ -z $(find "$PROJECT_ROOT/data/training" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail 'Existing training data requires its existing protected configuration; do not reseed or replace it.'
  [[ ! -d $APP_DIR/data/training ]] || [[ -z $(find "$APP_DIR/data/training" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail 'Local training data was uploaded. Start with a clean deployment source or explicitly migrate and rotate its existing users.'
  TRAINING_SECRET=$(openssl rand -hex 32)
  BACKUP_SECRET=$(openssl rand -hex 32)
  (set -o noclobber; cat > "$CONFIG" <<EOF
NODE_ENV=production
APP_MODE=training
HOST=127.0.0.1
PORT=$APP_PORT
DATA_DIR=$PROJECT_ROOT/data/training
PUBLIC_DEMO_ACCOUNTS=false
TRAINING_PASSWORD=$TRAINING_SECRET
BACKUP_PASSPHRASE=$BACKUP_SECRET
SESSION_SECURE=true
TRUST_PROXY=loopback
EOF
  )
  unset TRAINING_SECRET BACKUP_SECRET
fi
[[ -f $CONFIG && ! -L $CONFIG ]] || fail 'Environment configuration must be a regular file.'
chmod 600 "$CONFIG"
chown "$APP_USER:$APP_GROUP" "$CONFIG"
# Do not source an app-owned environment file in the privileged installer.
for expected in 'NODE_ENV=production' 'APP_MODE=training' 'HOST=127.0.0.1' "PORT=$APP_PORT" "DATA_DIR=$PROJECT_ROOT/data/training" 'PUBLIC_DEMO_ACCOUNTS=false' 'SESSION_SECURE=true' 'TRUST_PROXY=loopback'; do
  grep -Fxq "$expected" "$CONFIG" || fail 'Existing environment differs from the requested deployment; review it without printing secrets.'
done

case $(uname -m) in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) fail 'Only Ubuntu x86_64 and arm64 are supported.' ;;
esac
NODE_FOLDER=node-v$NODE_VERSION-linux-$NODE_ARCH
RUNTIME=$PROJECT_ROOT/.runtime/$NODE_FOLDER
if [[ ! -x $RUNTIME/bin/node ]]; then
  ARCHIVE=$NODE_FOLDER.tar.xz
  DOWNLOAD=$PROJECT_ROOT/.runtime/download-$NODE_VERSION-$NODE_ARCH
  install -d -m 750 "$DOWNLOAD"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v$NODE_VERSION/$ARCHIVE" -o "$DOWNLOAD/$ARCHIVE"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$DOWNLOAD/SHASUMS256.txt"
  (cd "$DOWNLOAD"; awk -v file="$ARCHIVE" '$2 == file {print; found=1} END {if (!found) exit 1}' SHASUMS256.txt | sha256sum --check --status) || fail 'Node archive checksum verification failed.'
  tar -xJf "$DOWNLOAD/$ARCHIVE" -C "$PROJECT_ROOT/.runtime" --no-same-owner
fi
[[ $(runuser -u "$APP_USER" -- "$RUNTIME/bin/node" --version) == "v$NODE_VERSION" ]] || fail 'Runtime version mismatch.'

if systemctl is-active --quiet "$SERVICE.service"; then
  [[ -f $UNIT_PATH ]] || fail 'An unmanaged service already has this name.'
  systemctl stop "$SERVICE.service"
fi
[[ -z $(ss -H -ltn "sport = :$APP_PORT") ]] || fail 'The application port is occupied by another service.'
# The paths were canonicalized and bounded above; only this application is owned.
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
chown -R "$APP_USER:$APP_GROUP" "$PROJECT_ROOT/.runtime"
run_app() {
  runuser -u "$APP_USER" -- env -u DATABASE_URL -u NODE_ENV -u TRAINING_PASSWORD -u BACKUP_PASSPHRASE \
    HOME="$PROJECT_ROOT/.home" TMPDIR="$PROJECT_ROOT/.tmp" \
    npm_config_cache="$PROJECT_ROOT/.cache/npm" \
    PATH="$RUNTIME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" "$@"
}
cd "$APP_DIR"
# tsx is the server entrypoint and is a devDependency, so keep it installed.
run_app "$RUNTIME/bin/npm" ci --include=dev --no-audit --no-fund
run_app "$RUNTIME/bin/npm" run build
run_app "$RUNTIME/bin/node" --env-file="$CONFIG" --input-type=module -e '
if (process.env.DATABASE_URL) throw Error("Installer expects project-local PGlite, not DATABASE_URL.");
if (!process.env.TRAINING_PASSWORD || process.env.TRAINING_PASSWORD.length < 16 || process.env.TRAINING_PASSWORD === "Training@2026") throw Error("Review the private training password in the protected environment file.");
if (!process.env.BACKUP_PASSPHRASE || process.env.BACKUP_PASSPHRASE.length < 16) throw Error("Review the protected backup passphrase.");
'

cat > "$PROJECT_ROOT/deploy/$SERVICE.service" <<EOF
$MARKER
[Unit]
Description=Child Egsystem NICU training application
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
EnvironmentFile=$CONFIG
Environment=HOME=$PROJECT_ROOT/.home
Environment=TMPDIR=$PROJECT_ROOT/.tmp
Environment=PATH=$RUNTIME/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$RUNTIME/bin/node $APP_DIR/node_modules/tsx/dist/cli.mjs $APP_DIR/server/index.ts
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$PROJECT_ROOT
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
StandardOutput=append:$PROJECT_ROOT/logs/app.log
StandardError=append:$PROJECT_ROOT/logs/app-error.log

[Install]
WantedBy=multi-user.target
EOF
install -m 644 "$PROJECT_ROOT/deploy/$SERVICE.service" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable --now "$SERVICE.service"
READY=0
for attempt in {1..60}; do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null; then READY=1; break; fi
  sleep 1
done
[[ $READY == 1 ]] || fail 'Application health check failed; inspect the project logs. Existing nginx and tunnel configurations have not been modified.'

NGINX_CONFIG=$PROJECT_ROOT/deploy/$HOSTNAME_PUBLIC.conf
cat > "$NGINX_CONFIG" <<EOF
$MARKER
# Loopback-only origin for an HTTPS cloudflared hostname route.
server {
    listen 127.0.0.1:$NGINX_PORT;
    server_name $HOSTNAME_PUBLIC;
    client_max_body_size 8m;
    access_log $PROJECT_ROOT/logs/nginx-access.log;
    error_log $PROJECT_ROOT/logs/nginx-error.log;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host $HOSTNAME_PUBLIC;
        proxy_set_header X-Forwarded-Host $HOSTNAME_PUBLIC;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
EOF
chmod 640 "$NGINX_CONFIG"
if [[ $INSTALL_NGINX == 1 ]]; then
  command -v nginx >/dev/null || fail 'nginx is not installed; the staged configuration remains available.'
  NGINX_AVAILABLE=/etc/nginx/sites-available/$HOSTNAME_PUBLIC.conf
  NGINX_ENABLED=/etc/nginx/sites-enabled/$HOSTNAME_PUBLIC.conf
  [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]] || fail 'This nginx installation uses a different layout; use the staged file after review.'
  # Never overwrite an existing hostname or change any existing nginx site.
  [[ ! -e $NGINX_AVAILABLE && ! -L $NGINX_AVAILABLE && ! -e $NGINX_ENABLED && ! -L $NGINX_ENABLED ]] || fail 'Dedicated nginx path already exists; compare and apply the staged configuration manually.'
  nginx -t || fail 'Existing nginx configuration is invalid; resolve that separately.'
  if nginx -T 2>&1 | grep -F "$HOSTNAME_PUBLIC" >/dev/null; then fail 'This hostname already exists in nginx; review it manually.'; fi
  install -m 644 "$NGINX_CONFIG" "$NGINX_AVAILABLE"
  ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  if ! nginx -t; then
    unlink "$NGINX_ENABLED"
    unlink "$NGINX_AVAILABLE"
    fail 'nginx validation failed. Only the two files just created by this installer were removed; nginx was not reloaded.'
  fi
  systemctl reload nginx
fi
printf 'Training app ready on 127.0.0.1:%s. Service: %s.service\n' "$APP_PORT" "$SERVICE"
printf 'Protected initial credentials: %s (not printed). Existing accounts are never reset.\n' "$CONFIG"
printf 'Staged nginx origin: %s (127.0.0.1:%s). Existing cloudflared routes were not changed.\n' "$NGINX_CONFIG" "$NGINX_PORT"
