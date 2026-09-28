#!/usr/bin/env bash
# Install the fixed, root-owned coordinator for signed in-app updates.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { printf 'Run with sudo.\n' >&2; exit 1; }
PROJECT=/srv/projects/child.egsystem.net
APP=$PROJECT/app
UPDATES=$PROJECT/updates
SERVICE=child-egsystem-nicu.service
USER_NAME=ahmed
RUNTIME=$PROJECT/.runtime/node-v24.20.0-linux-x64
[[ -d $APP && -f $APP/scripts/update-worker.ts && -x $RUNTIME/bin/node ]] || { printf 'Deployed update-capable app/runtime missing.\n' >&2; exit 1; }
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "$UPDATES" "$UPDATES/jobs"
touch "$UPDATES/empty-user-npmrc" "$UPDATES/empty-global-npmrc"
chown "$USER_NAME:$USER_NAME" "$UPDATES/empty-user-npmrc" "$UPDATES/empty-global-npmrc"
chmod 600 "$UPDATES/empty-user-npmrc" "$UPDATES/empty-global-npmrc"
cat > /usr/local/sbin/child-egsystem-update <<'COORDINATOR'
#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT=/srv/projects/child.egsystem.net; APP=$PROJECT/app; ROOT=$PROJECT/updates
NODE=$PROJECT/.runtime/node-v24.20.0-linux-x64/bin/node; TSX=$APP/node_modules/tsx/dist/cli.mjs
SERVICE=child-egsystem-nicu.service
run_phase(){ runuser -u ahmed -- env --chdir="$APP" NODE_ENV=production UPDATE_ENABLED=true UPDATE_ROOT="$ROOT" UPDATE_APP_DIR="$APP" UPDATE_PUBLIC_KEY_FILE="$PROJECT/.config/update-public.pem" DATA_DIR="$PROJECT/data/training" HOME="$PROJECT/.home" TMPDIR="$PROJECT/.tmp" npm_config_cache="$PROJECT/.cache/npm" BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" "$NODE" "$TSX" "$APP/scripts/update-worker.ts" "$1"; }
[[ -f $ROOT/install-request.json ]] || exit 0
run_phase begin
systemctl stop "$SERVICE"
if run_phase apply; then
  ok=0
  if systemctl start "$SERVICE"; then
    for _ in {1..45}; do if run_phase verify-new >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done
  fi
  if [[ $ok == 1 ]]; then run_phase success; exit 0; fi
  run_phase health-failed || true
fi
systemctl stop "$SERVICE" || true
run_phase rollback
systemctl start "$SERVICE"
ok=0
for _ in {1..45}; do if run_phase verify-previous >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done
[[ $ok == 1 ]] && run_phase recovered
[[ $ok == 1 ]]
COORDINATOR
chmod 700 /usr/local/sbin/child-egsystem-update
cat > /etc/systemd/system/child-egsystem-update.service <<EOF
[Unit]
Description=Qasr NICU signed update coordinator
After=network.target
[Service]
Type=oneshot
EnvironmentFile=$PROJECT/.config/app.env
ExecStart=/usr/local/sbin/child-egsystem-update
TimeoutStartSec=20min
EOF
cat > /etc/systemd/system/child-egsystem-update.path <<EOF
[Unit]
Description=Watch for approved Qasr NICU updates
[Path]
PathExists=$UPDATES/install-request.json
Unit=child-egsystem-update.service
[Install]
WantedBy=multi-user.target
EOF
printf '{"ready":true,"installed_at":"%s"}' "$(date -u +%FT%TZ)" > "$UPDATES/worker-ready.json"
chown "$USER_NAME:$USER_NAME" "$UPDATES/worker-ready.json"; chmod 600 "$UPDATES/worker-ready.json"
systemctl daemon-reload
systemctl enable --now child-egsystem-update.path
systemctl is-active --quiet child-egsystem-update.path
