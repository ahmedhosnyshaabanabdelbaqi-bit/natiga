#!/usr/bin/env bash
# =============================================================================
# EV Car News deploy kit — local end-to-end test WITHOUT a Docker daemon.
#
# Runs the real deploy/evcar.sh (up, health, create-owner, backup, backups,
# restore-test, restore, seed --demo refusal, monitor) with tests/docker_shim.py
# standing in for `docker`, against:
#   - the local PostgreSQL 16 + PostGIS (superuser from PG_SUPER_URL),
#   - the local Redis (isolated key prefixes, never flushed),
#   - the real backend build (backend/dist, backend/node_modules).
# Also serves the stack through the real Caddy binary (if CADDY_BIN is set)
# with deploy/caddy/* to check routing, /media, headers and body limits.
#
#   PG_SUPER_URL=postgresql://evcar:evcar_dev_pw@localhost:5432/postgres \
#   CADDY_BIN=/path/to/caddy bash deploy/tests/local-e2e.sh
#
# Everything it creates is namespaced (deploytest_*) and removed at the end.
# =============================================================================
set -Eeuo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$HERE")
PROJECT_DIR=$(dirname "$DEPLOY_DIR")
# EVCAR_TEST_BACKEND_DIR: a snapshot of backend/ (dist, node_modules, prisma)
# when other work rebuilds backend/ concurrently.
BACKEND_DIR=${EVCAR_TEST_BACKEND_DIR:-$PROJECT_DIR/backend}
PG_SUPER_URL=${PG_SUPER_URL:-postgresql://evcar:evcar_dev_pw@localhost:5432/postgres}
SUFFIX=$(date +%s | tail -c 6)$RANDOM
WORK=$(mktemp -d "${TMPDIR:-/tmp}/evcar-deploytest.XXXXXX")
PASS=0
FAIL=0

pg_user=$(python3 -c "import urllib.parse,sys;u=urllib.parse.urlparse(sys.argv[1]);print(u.username)" "$PG_SUPER_URL")
pg_pass=$(python3 -c "import urllib.parse,sys;u=urllib.parse.urlparse(sys.argv[1]);print(urllib.parse.unquote(u.password or ''))" "$PG_SUPER_URL")
pg_host=$(python3 -c "import urllib.parse,sys;u=urllib.parse.urlparse(sys.argv[1]);print(u.hostname)" "$PG_SUPER_URL")
pg_port=$(python3 -c "import urllib.parse,sys;u=urllib.parse.urlparse(sys.argv[1]);print(u.port or 5432)" "$PG_SUPER_URL")

export EVCAR_HOME="$WORK/home"
export SHIM_STATE="$WORK/shim"
export SHIM_BACKEND_DIR="$BACKEND_DIR"
export SHIM_STORAGE="$WORK/storage"
export SHIM_API_PORT=${SHIM_API_PORT:-13$((RANDOM % 900 + 100))}
export SHIM_PG_SUPERUSER=$pg_user SHIM_PG_HOST=$pg_host SHIM_PG_PORT=$pg_port
export SHIM_REDIS_PREFIX="deploytest$SUFFIX:" SHIM_BULL_PREFIX="deploytest$SUFFIX-bull"
export NO_COLOR=1
mkdir -p "$EVCAR_HOME" "$SHIM_STATE" "$SHIM_STORAGE" "$WORK/bin"
cat >"$WORK/bin/docker" <<EOF
#!/bin/sh
exec python3 "$HERE/docker_shim.py" "\$@"
EOF
chmod +x "$WORK/bin/docker"
export PATH="$WORK/bin:$PATH"

DB="deploytest_$SUFFIX"
ROLE="deploytest_app_$SUFFIX"
EVCAR="$DEPLOY_DIR/evcar.sh"

psql_super() { PGPASSWORD=$pg_pass psql -X -q -v ON_ERROR_STOP=1 -h "$pg_host" -p "$pg_port" -U "$pg_user" "$@"; }

cleanup() {
  set +e
  python3 - "$SHIM_STATE" <<'PY'
import os, signal, sys
try:
    pid = int(open(os.path.join(sys.argv[1], "api.pid")).read())
    os.killpg(pid, signal.SIGTERM)
except Exception:
    pass
PY
  [[ -n ${CADDY_PID:-} ]] && kill "$CADDY_PID" 2>/dev/null
  sleep 1
  for d in $(psql_super -d postgres -Atc "SELECT datname FROM pg_database WHERE datname LIKE '${DB}%'"); do
    psql_super -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$d'" >/dev/null
    psql_super -d postgres -c "DROP DATABASE IF EXISTS \"$d\"" >/dev/null
  done
  psql_super -d postgres -c "DROP ROLE IF EXISTS \"$ROLE\"" >/dev/null
  if command -v redis-cli >/dev/null; then
    redis-cli --scan --pattern "deploytest$SUFFIX*" | xargs -r redis-cli del >/dev/null
  fi
  rm -rf "$WORK" /tmp/evcar-backup.dump /tmp/evcar-restore-"$DB"*
  echo
  echo "RESULT: $PASS passed, $FAIL failed"
  if ((FAIL > 0)); then exit 1; fi
}
trap cleanup EXIT

check() { # check "description" command...
  local desc=$1
  shift
  if "$@" >"$WORK/last.out" 2>&1; then
    PASS=$((PASS + 1))
    echo "PASS  $desc"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL  $desc"
    sed 's/^/      /' "$WORK/last.out" | tail -n 25
  fi
}
expect_fail() { # expect_fail "description" command...
  local desc=$1
  shift
  if "$@" >"$WORK/last.out" 2>&1; then
    FAIL=$((FAIL + 1))
    echo "FAIL  $desc (command unexpectedly succeeded)"
    sed 's/^/      /' "$WORK/last.out" | tail -n 15
  else
    PASS=$((PASS + 1))
    echo "PASS  $desc"
  fi
}

echo "work dir: $WORK · db $DB · role $ROLE · api port $SHIM_API_PORT"

# --- configuration ------------------------------------------------------------
check "install.sh --generate-env-only writes a mode-600 env file" \
  bash "$DEPLOY_DIR/install.sh" --generate-env-only --env-file "$EVCAR_HOME/.env.production" \
  --api-domain api.evcar.news --email owner@example.com
check "env file mode is 600" test "$(stat -c %a "$EVCAR_HOME/.env.production")" = 600
"$EVCAR" set POSTGRES_DB="$DB" >/dev/null 2>&1
"$EVCAR" set APP_DB_USER="$ROLE" >/dev/null 2>&1
"$EVCAR" set EVCAR_WORKER_MODE=combined >/dev/null 2>&1
"$EVCAR" set BACKUP_DIR="$EVCAR_HOME/backups" >/dev/null 2>&1
# Shared test machines have big, mostly-used disks: keep the free-space rule
# (tested below with a sparse file) but at 5 %.
"$EVCAR" set BACKUP_MIN_FREE_PERCENT=5 >/dev/null 2>&1
app_pw=$(grep -E '^APP_DB_PASSWORD=' "$EVCAR_HOME/.env.production" | cut -d= -f2)
printf '%s:%s:*:%s:%s\n%s:%s:*:%s:%s\n' "$pg_host" "$pg_port" "$pg_user" "$pg_pass" "$pg_host" "$pg_port" "$ROLE" "$app_pw" >"$SHIM_STATE/pgpass"
chmod 600 "$SHIM_STATE/pgpass"

# --- up (bootstrap role/extensions, migrations, reference seed, API) ---------------
check "evcar up (db bootstrap as superuser, migrations + seed as app role, API healthy)" "$EVCAR" up
check "app database is owned by the unprivileged role" \
  test "$(psql_super -d postgres -Atc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB'")" = "$ROLE"
check "app role is not superuser / cannot create databases" \
  test "$(psql_super -d postgres -Atc "SELECT rolsuper::text || rolcreatedb::text FROM pg_roles WHERE rolname = '$ROLE'")" = falsefalse
check "migrations applied" test "$(psql_super -d "$DB" -Atc 'SELECT count(*) > 0 FROM _prisma_migrations WHERE finished_at IS NOT NULL')" = t
check "evcar up is idempotent (second run)" "$EVCAR" up
check "backend.env contains only documented backend variables" \
  bash -c "! grep -qE '^(POSTGRES_SUPERUSER_PASSWORD|REDIS_PASSWORD|API_DOMAIN|ACME_EMAIL|ALERT_EMAIL)=' '$EVCAR_HOME/run/backend.env'"
check "backend.env has mode 600" test "$(stat -c %a "$EVCAR_HOME/run/backend.env")" = 600
check "the app DB password never appears on a docker/psql command line" bash -c "! grep -qF '$app_pw' '$SHIM_STATE/calls.log'"
check "the mail outbox has a generated password" grep -qE '^MAILPIT_UI_PASSWORD=[0-9a-f]{48}$' "$EVCAR_HOME/.env.production"

# --- secrets never on the command line ----------------------------------------------
expect_fail "set refuses a secret value on the command line" "$EVCAR" set SMTP_PASSWORD=abc
check "set KEY reads a secret from stdin" bash -c "printf 'p@ss w0rd' | '$EVCAR' set SMTP_PASSWORD && grep -qx \"SMTP_PASSWORD='p@ss w0rd'\" '$EVCAR_HOME/.env.production'"
check "set KEY= clears a secret" bash -c "'$EVCAR' set SMTP_PASSWORD= && grep -qx 'SMTP_PASSWORD=' '$EVCAR_HOME/.env.production'"
check "plain settings still work on the command line" "$EVCAR" set LOG_LEVEL=info

# --- alert channels ----------------------------------------------------------------------
expect_fail "alert-test fails while no channel can deliver (outbox SMTP, no webhook)" "$EVCAR" alert-test
HOOK_PORT=$((SHIM_API_PORT + 3000))
python3 - "$HOOK_PORT" "$WORK/hook.json" <<'PY' &
import http.server, sys
port, out = int(sys.argv[1]), sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        open(out, "wb").write(body)
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).handle_request()
PY
HOOK_PID=$!
sleep 0.5
printf 'http://127.0.0.1:%s/hook' "$HOOK_PORT" | "$EVCAR" set ALERT_WEBHOOK_URL >/dev/null 2>&1
check "alert-test delivers through the webhook" "$EVCAR" alert-test
check "the webhook received the test alert" grep -q 'test alert' "$WORK/hook.json"
wait "$HOOK_PID" 2>/dev/null || true
"$EVCAR" set ALERT_WEBHOOK_URL= >/dev/null 2>&1

# --- health, owner --------------------------------------------------------------------
check "health: API healthy inside the server" bash -c "'$EVCAR' health 2>&1 | grep -q 'inside the server): ok'"
check "create-owner prints a one-time setup link" \
  bash -c "'$EVCAR' create-owner --email owner@example.com --name 'Test Owner' | grep -qE 'https://admin.evcar.news/setup-password\\?token='"
check "owner has the owner role" test "$(psql_super -d "$DB" -Atc "SELECT count(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id JOIN roles r ON r.id = ur.role_id WHERE u.email = 'owner@example.com' AND r.key = 'owner'")" = 1
set_password_via_tty() { # drives the interactive --set-password flow through a pseudo-terminal
  python3 - "$EVCAR" <<'PY'
import os, pty, sys, time
evcar = sys.argv[1]
pid, fd = pty.fork()
if pid == 0:
    os.execv(evcar, [evcar, "create-owner", "--email", "pty-owner@example.com", "--set-password"])
out = b""
def read_until(token, timeout=120):
    global out
    end = time.time() + timeout
    while token not in out and time.time() < end:
        try:
            out += os.read(fd, 4096)
        except OSError:
            break
    return token in out
ok = read_until(b"New password")
os.write(fd, b"Correct-Horse-Battery-9\n")
ok = ok and read_until(b"Repeat")
os.write(fd, b"Correct-Horse-Battery-9\n")
read_until(b"__never__", timeout=60)
_, status = os.waitpid(pid, 0)
text = out.decode(errors="replace")
print(text)
sys.exit(0 if ok and os.waitstatus_to_exitcode(status) == 0 and "password set" in text and "token=" not in text else 1)
PY
}
check "create-owner --set-password (no admin panel): password set through the API, token never shown" set_password_via_tty
login_works() {
  curl -fsS -X POST "http://127.0.0.1:$SHIM_API_PORT/api/v1/auth/login" -H 'Content-Type: application/json' \
    -d '{"email":"pty-owner@example.com","password":"Correct-Horse-Battery-9"}' | grep -q accessToken
}
check "the new owner can sign in" login_works
check "status runs" "$EVCAR" status
check "logs runs" "$EVCAR" logs api --tail 5
expect_fail "seed --demo is refused in production" "$EVCAR" seed --demo
check "reference seed runs" "$EVCAR" seed
expect_fail "create-owner rejects an invalid e-mail" "$EVCAR" create-owner --email not-an-email

# --- media + backup ----------------------------------------------------------------------
mkdir -p "$SHIM_STORAGE/public/tours" "$SHIM_STORAGE/private" "$SHIM_STORAGE/tmp" "$SHIM_STORAGE/.multipart/u1" "$SHIM_STORAGE/.meta/public/tours"
head -c 2048 /dev/urandom >"$SHIM_STORAGE/public/tours/pano.jpg"
echo private >"$SHIM_STORAGE/private/doc.txt"
echo scratch >"$SHIM_STORAGE/tmp/scratch.bin"
echo '{"contentType":"image/jpeg"}' >"$SHIM_STORAGE/.meta/public/tours/pano.jpg.json"
echo partial >"$SHIM_STORAGE/public/tours/upload.jpg.1a2b3c.part"
echo part1 >"$SHIM_STORAGE/.multipart/u1/part-00001"
newest_manual() { find "$EVCAR_HOME/backups/manual" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1; }
check "backup (database + media)" "$EVCAR" backup
BK=$(newest_manual)
check "backup has db.dump, media/, media.sha256, manifest, checksums" test -s "$BK/db.dump" -a -d "$BK/media" -a -s "$BK/media.sha256" -a -s "$BK/manifest.txt" -a -s "$BK/SHA256SUMS"
check "backup checksums verify" bash -c "cd '$BK' && sha256sum --quiet --strict -c SHA256SUMS"
check "media checksums verify" bash -c "cd '$BK/media' && sha256sum --quiet --strict -c ../media.sha256"
check "media exclude tmp/, .multipart/ and in-progress *.part uploads" \
  bash -c "! test -e '$BK/media/tmp' && ! test -e '$BK/media/.multipart' && ! test -e '$BK/media/public/tours/upload.jpg.1a2b3c.part'"
check "media contain public, private and .meta files" test -f "$BK/media/public/tours/pano.jpg" -a -f "$BK/media/private/doc.txt" -a -f "$BK/media/.meta/public/tours/pano.jpg.json"
check "backup directory is private (700)" test "$(stat -c %a "$EVCAR_HOME/backups")" = 700
check "manifest records row counts" grep -qE '^db_rows=[1-9]' "$BK/manifest.txt"
check "manifest records the media files" grep -qx 'media_files=3' "$BK/manifest.txt"
check "backups lists it" bash -c "'$EVCAR' backups | grep -q 'manual.*db+media'"

head -c 4096 /dev/urandom >"$SHIM_STORAGE/public/tours/pano2.jpg"
check "second backup" "$EVCAR" backup
BK2=$(newest_manual)
check "unchanged media are hard links to the previous backup (stored once)" \
  test "$(stat -c %i "$BK/media/public/tours/pano.jpg")" = "$(stat -c %i "$BK2/media/public/tours/pano.jpg")"
check "new media are copied" test -f "$BK2/media/public/tours/pano2.jpg" -a "$(stat -c %h "$BK2/media/public/tours/pano2.jpg")" = 1
check "checksums of the incremental backup verify" bash -c "cd '$BK2/media' && sha256sum --quiet --strict -c ../media.sha256"

"$EVCAR" set EVCAR_BACKUP_MEDIA_METHOD=stream >/dev/null 2>&1
check "backup through the api image when the volume is not reachable (stream)" "$EVCAR" backup
check "streamed media are complete" bash -c "cd '$(newest_manual)/media' && sha256sum --quiet --strict -c ../media.sha256 && test -f public/tours/pano2.jpg"
check "stream: tar exit 1 ('file changed as we read it') is not an error" \
  bash -c "SHIM_TAR_CREATE_EXIT=1 '$EVCAR' backup && grep -qx 'media_included=true' \"\$(ls -d '$EVCAR_HOME'/backups/manual/2*Z | sort | tail -n 1)/manifest.txt\""
check "stream: a real media failure keeps the database dump (backup completes, media recorded as failed)" \
  bash -c "SHIM_TAR_CREATE_EXIT=2 '$EVCAR' backup; d=\$(ls -d '$EVCAR_HOME'/backups/manual/2*Z | sort | tail -n 1); test -s \$d/db.dump && grep -qx 'media_included=false' \$d/manifest.txt && test -s '$EVCAR_HOME/state/last-backup-media-failed'"
"$EVCAR" set EVCAR_BACKUP_MEDIA_METHOD=auto >/dev/null 2>&1
mkdir -p "$WORK/fakersync"
printf '#!/bin/sh\n"%s" "$@" || exit $?\nexit 24\n' "$(command -v rsync)" >"$WORK/fakersync/rsync"
chmod +x "$WORK/fakersync/rsync"
check "rsync exit 24 (media deleted during the copy) is not an error" \
  bash -c "PATH='$WORK/fakersync':\$PATH '$EVCAR' backup && grep -qx 'media_included=true' \"\$(ls -d '$EVCAR_HOME'/backups/manual/2*Z | sort | tail -n 1)/manifest.txt\" && test ! -e '$EVCAR_HOME/state/last-backup-media-failed'"

# Media that do not fit (sparse 5 TB file: no real disk use) → database-only backup, alert state.
truncate -s 5T "$SHIM_STORAGE/public/huge.bin"
check "media that do not fit are skipped: the backup is database-only" bash -c "'$EVCAR' backup >'$WORK/bk.out' 2>&1; grep -q 'DATABASE ONLY' '$WORK/bk.out'"
check "that backup still has a verified database dump" bash -c "d=\$(ls -d '$EVCAR_HOME'/backups/manual/2*Z | sort | tail -n 1); test -s \$d/db.dump && grep -qx 'media_included=false' \$d/manifest.txt && cd \$d && sha256sum --quiet --strict -c SHA256SUMS"
check "the skipped media are recorded for the monitor" test -s "$EVCAR_HOME/state/last-backup-media-failed"
"$EVCAR" set MONITOR_PUBLIC_CHECK=false >/dev/null 2>&1
expect_fail "monitor reports the missing media backup" "$EVCAR" monitor
rm -f "$SHIM_STORAGE/public/huge.bin"
check "the next full backup clears the media problem" bash -c "'$EVCAR' backup && test ! -e '$EVCAR_HOME/state/last-backup-media-failed'"
BK=$(newest_manual)

# --- restore test ----------------------------------------------------------------------------
check "restore-test latest (temporary DB, exact row counts)" "$EVCAR" restore-test latest
check "restore-test result recorded" grep -q '^ok ' "$EVCAR_HOME/state/restore-test.last"
check "temporary restore-test database was dropped" \
  test "$(psql_super -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname LIKE '${DB}_restoretest_%'")" = 0

# --- restore -------------------------------------------------------------------------------------
users_before=$(psql_super -d "$DB" -Atc 'SELECT count(*) FROM users')
"$EVCAR" create-owner --email second@example.com >/dev/null 2>&1
rm -f "$SHIM_STORAGE/public/tours/pano.jpg"
check "data changed after the backup" test "$(psql_super -d "$DB" -Atc 'SELECT count(*) FROM users')" -gt "$users_before"
expect_fail "restore without --yes and without a terminal is refused" bash -c "'$EVCAR' restore latest </dev/null"
check "restore latest --yes (fresh DB, verify, swap, media)" "$EVCAR" restore latest --yes
check "restored database has the backup's users" test "$(psql_super -d "$DB" -Atc 'SELECT count(*) FROM users')" = "$users_before"
check "previous database kept as *_pre_restore_*" \
  test "$(psql_super -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname LIKE '${DB}_pre_restore_%'")" = 1
check "media file restored" test -s "$SHIM_STORAGE/public/tours/pano.jpg"
check "API healthy after restore" bash -c "'$EVCAR' health 2>&1 | grep -q 'inside the server): ok'"
check "pre-restore safety backup exists" bash -c "ls '$EVCAR_HOME/backups/pre-restore/' | grep -q Z"
expect_fail "a restore failing after the API was stopped reports the failure" \
  env SHIM_FAIL_MEDIA_EXTRACT=1 "$EVCAR" restore "$BK" --media-only --yes
check "... and the API was started again" bash -c "'$EVCAR' health 2>&1 | grep -q 'inside the server): ok'"
check "... and the maintenance flag was cleared" test ! -e "$EVCAR_HOME/state/maintenance"

# --- corruption is detected --------------------------------------------------------------------------
cp -a "$BK" "$EVCAR_HOME/backups/manual/29990101T000000Z"
printf 'X' | dd of="$EVCAR_HOME/backups/manual/29990101T000000Z/db.dump" bs=1 seek=100 conv=notrunc status=none
expect_fail "restore-test detects a corrupted backup" "$EVCAR" restore-test latest
check "failure recorded for the monitor" grep -q '^failed ' "$EVCAR_HOME/state/restore-test.last"
rm -rf "$EVCAR_HOME/backups/manual/29990101T000000Z"
cp -a "$BK" "$EVCAR_HOME/backups/manual/29990101T000000Z"
printf 'X' | dd of="$EVCAR_HOME/backups/manual/29990101T000000Z/media/public/tours/pano2.jpg" bs=1 seek=10 conv=notrunc status=none
expect_fail "restore-test detects a corrupted media file" "$EVCAR" restore-test latest
check "the original backup was not touched by the corruption (separate copy)" bash -c "cd '$BK/media' && sha256sum --quiet --strict -c ../media.sha256"
rm -rf "$EVCAR_HOME/backups/manual/29990101T000000Z"
check "restore-test passes again on the intact backup" "$EVCAR" restore-test latest
# Sets written by the previous version (media.tar) stay restorable.
V1="$WORK/v1set/20250101T000000Z"
mkdir -p "$V1"
cp "$BK/db.dump" "$BK/db.rowcounts" "$V1/"
tar -C "$BK/media" -cf "$V1/media.tar" .
sed -e 's/^format=.*/format=evcar-backup-v1/' -e '/^media_format=/d' -e '/^media_bytes=/d' "$BK/manifest.txt" >"$V1/manifest.txt"
(cd "$V1" && sha256sum db.dump db.rowcounts manifest.txt media.tar >SHA256SUMS)
check "restore-test accepts an older set with media.tar (format v1)" "$EVCAR" restore-test "$V1"

# --- rotation --------------------------------------------------------------------------------------------
for i in 1 2 3 4 5 6; do mkdir -p "$EVCAR_HOME/backups/manual/2020010${i}T000000Z" && touch "$EVCAR_HOME/backups/manual/2020010${i}T000000Z/SHA256SUMS"; done
check "second backup (db only)" "$EVCAR" backup --db-only
check "rotation keeps 5 manual backups" test "$(find "$EVCAR_HOME/backups/manual" -mindepth 1 -maxdepth 1 -type d | wc -l)" = 5

# --- update / rollback (no git pull in tests) -------------------------------------------------------------------
check "first up recorded the git commit as release id" test "$(cat "$EVCAR_HOME/state/release")" = "$(git -C "$PROJECT_DIR" rev-parse --short=12 HEAD)"
echo old-release >"$EVCAR_HOME/state/release" # pretend an older release is running
printf '%s\n' localhost/evcar-backend:old-release localhost/evcar-admin:old-release localhost/evcar-backend:ancient >>"$SHIM_STATE/images.txt"
check "update --no-pull (build, pre-update backup, migrate, restart)" "$EVCAR" update --no-pull
check "release recorded as the git commit" test "$(cat "$EVCAR_HOME/state/release")" = "$(git -C "$PROJECT_DIR" rev-parse --short=12 HEAD)"
check "pre-update backup exists" bash -c "ls '$EVCAR_HOME/backups/pre-update/' | grep -q Z"
check "maintenance flag cleared after update" test ! -e "$EVCAR_HOME/state/maintenance"
check "images older than the previous release are pruned" bash -c "! grep -q ':ancient' '$SHIM_STATE/images.txt'"
check "a no-op update (same commit) works" "$EVCAR" update --no-pull
check "... and keeps the images of the release rollback needs" grep -q 'localhost/evcar-backend:old-release' "$SHIM_STATE/images.txt"
check "rollback to the previous release" "$EVCAR" rollback
check "rollback recorded" test "$(cat "$EVCAR_HOME/state/release")" = old-release

# --- monitor -------------------------------------------------------------------------------------------------
"$EVCAR" set MONITOR_PUBLIC_CHECK=false >/dev/null 2>&1
check "monitor passes when everything is healthy (public check off)" "$EVCAR" monitor
check "monitor warns that no alert channel can deliver" bash -c "'$EVCAR' monitor >'$WORK/mon.out' 2>&1; grep -q 'alerts (backup failures, outages) reach NOBODY' '$WORK/mon.out'"

# --- off-site: only encrypted remotes -------------------------------------------------------------------------
mkdir -p "$EVCAR_HOME/rclone" "$WORK/remote"
printf '[plain]\ntype = local\n\n[enc]\ntype = crypt\nremote = plain:%s/remote\npassword = %s\n' "$WORK" \
  "$(rclone obscure test-crypt-password 2>/dev/null || echo x)" >"$EVCAR_HOME/rclone/rclone.conf"
"$EVCAR" set RCLONE_REMOTE=plain:"$WORK/remote" >/dev/null 2>&1
check "status flags an unencrypted off-site remote" bash -c "'$EVCAR' status >'$WORK/st.out' 2>&1; grep -q \"is NOT a 'crypt' remote\" '$WORK/st.out'"
if command -v rclone >/dev/null 2>&1; then
  check "backup refuses to upload to an unencrypted remote (local backup still made)" bash -c "'$EVCAR' backup --offsite >'$WORK/bk.out' 2>&1; grep -q 'REFUSED' '$WORK/bk.out'"
  check "the refusal is recorded for the monitor" grep -q 'REFUSED' "$EVCAR_HOME/state/last-offsite-failed"
  check "nothing was uploaded unencrypted" test -z "$(find "$WORK/remote" -type f -print -quit)"
  "$EVCAR" set RCLONE_REMOTE=enc: >/dev/null 2>&1
  check "encrypted off-site copy (crypt remote)" bash -c "'$EVCAR' backup --offsite >'$WORK/bk.out' 2>&1; grep -q 'off-site copy done' '$WORK/bk.out'"
  check "off-site files and names are encrypted" bash -c "test -n \"\$(find '$WORK/remote' -type f -print -quit)\" && ! find '$WORK/remote' | grep -qE 'db\\.dump|manifest|media'"
  OFFTS=$(basename "$(newest_manual)")
  check "offsite-fetch --list shows the set" bash -c "'$EVCAR' offsite-fetch --list | grep -q '$OFFTS'"
  check "offsite-fetch downloads, unpacks and verifies the set" "$EVCAR" offsite-fetch "$OFFTS"
  check "the fetched set has the media tree back" test -f "$EVCAR_HOME/backups/offsite/$OFFTS/media/public/tours/pano2.jpg"
  check "the fetched set passes the restore test" "$EVCAR" restore-test "$EVCAR_HOME/backups/offsite/$OFFTS"
else
  echo "SKIP  off-site upload checks (no rclone)"
fi
"$EVCAR" set RCLONE_REMOTE= >/dev/null 2>&1
rm -f "$EVCAR_HOME/state/last-offsite-failed"

# --- code ownership (root-run scripts must not be writable by other users) ----------------------------------
if [[ $(id -u) -eq 0 ]]; then
  FAKE="$EVCAR_HOME/app"
  mkdir -p "$FAKE/evcar-news/deploy/lib"
  git -C "$FAKE" init -q
  cp "$DEPLOY_DIR/lib/common.sh" "$FAKE/evcar-news/deploy/lib/"
  chown -R 65534:65534 "$FAKE"
  chmod -R g+w "$FAKE"
  check "an old checkout owned by another user is handed back to root" bash -c "
    DEPLOY_DIR='$FAKE/evcar-news/deploy' EVCAR_HOME='$EVCAR_HOME'; source '$FAKE/evcar-news/deploy/lib/common.sh'
    ensure_code_root_owned
    [ \"\$(find '$FAKE' \\! -user 0 -print -quit)\" = '' ] && [ \"\$(find '$FAKE' \\! -type l -perm /022 -print -quit)\" = '' ]"
  rm -rf "$FAKE"
fi
"$EVCAR" set DISK_ALERT_PERCENT=1 >/dev/null 2>&1
expect_fail "monitor reports a disk problem when over the threshold" "$EVCAR" monitor
check "monitor state records the problem" grep -q '^problem ' "$EVCAR_HOME/state/monitor.last"
"$EVCAR" set DISK_ALERT_PERCENT=85 >/dev/null 2>&1

# --- Caddy in front of the API (real binary, test copy of the config) ----------------------------------------
if [[ -n ${CADDY_BIN:-} && -x ${CADDY_BIN:-} ]]; then
  C="$WORK/caddy"
  mkdir -p "$C/sites" "$C/data"
  cp "$DEPLOY_DIR/caddy/Caddyfile" "$C/Caddyfile"
  for f in "$DEPLOY_DIR"/caddy/sites/*.caddy; do
    sed -e "s#api:3000#127.0.0.1:$SHIM_API_PORT#g" -e "s#/srv/storage/public#$SHIM_STORAGE/public#g" "$f" >"$C/sites/$(basename "$f")"
  done
  sed -i "s#api:3000#127.0.0.1:$SHIM_API_PORT#g" "$C/Caddyfile"
  touch "$SHIM_STORAGE/public/.secret"
  CPORT=$((SHIM_API_PORT + 1000))
  (cd "$C" && exec env HOME="$C/data" XDG_DATA_HOME="$C/data" XDG_CONFIG_HOME="$C/data" API_DOMAIN="http://127.0.0.1:$CPORT" \
    ADMIN_DOMAIN="" ACME_EMAIL=owner@example.com PROXY_MAX_BODY=1MB EVCAR_ADMIN_SITE=none \
    "$CADDY_BIN" run --adapter caddyfile --config "$C/Caddyfile" >"$C/caddy.log" 2>&1) &
  CADDY_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$CPORT/api/v1/health/live" && break; sleep 0.25; done
  B="http://127.0.0.1:$CPORT"
  check "caddy → API health" bash -c "curl -fsS $B/api/v1/health/live | grep -q '\"ok\"'"
  check "caddy serves /media with CORS * and a sandbox CSP" \
    bash -c "curl -fsS -D - -o /dev/null $B/media/tours/pano.jpg | tr -d '\\r' | grep -qi '^access-control-allow-origin: \\*' && curl -fsS -D - -o /dev/null $B/media/tours/pano.jpg | grep -qi 'sandbox'"
  check "caddy hides dotfiles under /media" test "$(curl -s -o /dev/null -w '%{http_code}' "$B/media/.secret")" = 404
  check "caddy never exposes private/ via /media" test "$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$B/media/../private/doc.txt")" != 200
  check "caddy sets HSTS once and strips Server" bash -c "h=\$(curl -s -D - -o /dev/null $B/api/v1/health/live | tr -d '\\r'); [ \$(grep -ci '^strict-transport-security' <<<\"\$h\") -eq 1 ] && ! grep -qi '^server:' <<<\"\$h\""
  check "caddy compresses API JSON (zstd/gzip)" bash -c "curl -s -D - -o /dev/null -H 'Accept-Encoding: zstd, gzip' $B/api/v1/app-config | grep -qiE '^content-encoding: (zstd|gzip)'"
  head -c 2000000 /dev/zero >"$WORK/big.bin"
  check "caddy rejects bodies above PROXY_MAX_BODY (413)" \
    test "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/octet-stream' --data-binary @"$WORK/big.bin" "$B/api/v1/health/live")" = 413
else
  echo "SKIP  Caddy checks (set CADDY_BIN to a caddy v2 binary)"
fi

# --- host nginx in front of the API (rendered TLS vhost, self-signed cert) ----------------------------------
if [[ -n ${NGINX_BIN:-} && -x ${NGINX_BIN:-} ]] && command -v ss >/dev/null 2>&1; then
  N="$WORK/nginx"
  mkdir -p "$N/logs" "$N/certs"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$N/certs/privkey.pem" -out "$N/certs/fullchain.pem" \
    -days 1 -subj "/CN=api.evcar.news" >/dev/null 2>&1
  "$EVCAR" set EVCAR_PROXY_MODE=nginx >/dev/null 2>&1
  "$EVCAR" set API_HOST_PORT="$SHIM_API_PORT" >/dev/null 2>&1
  NP=$((SHIM_API_PORT + 2000))
  "$EVCAR" proxy-config | sed -e "s#/etc/letsencrypt/live/evcar/#$N/certs/#g" \
    -e "s#listen 80;#listen $((NP + 1));#" -e "s#listen 443 ssl#listen $NP ssl#" >"$N/evcar.conf"
  cat >"$N/nginx.conf" <<NGX
$([[ $(id -u) -eq 0 ]] && echo 'user root;')
pid $N/nginx.pid;
events {}
http {
  access_log off;
  client_body_temp_path $N/b; proxy_temp_path $N/p; fastcgi_temp_path $N/f; uwsgi_temp_path $N/u; scgi_temp_path $N/s;
  include $N/evcar.conf;
}
NGX
  "$NGINX_BIN" -p "$N" -c "$N/nginx.conf" -e "$N/logs/error.log"
  sleep 0.5
  R=(--noproxy "*" --resolve "api.evcar.news:$NP:127.0.0.1" -k)
  U="https://api.evcar.news:$NP"
  nginx_health() { curl -fsS "${R[@]}" "$U/api/v1/health/live" | grep -q '"ok"'; }
  nginx_media_cors() {
    local n
    n=$(curl -fsS -D - -o /dev/null "${R[@]}" "$U/media/tours/pano.jpg" | tr -d '\r' | grep -ci '^access-control-allow-origin: \*')
    [[ $n -eq 1 ]]
  }
  nginx_hsts() { curl -fsS -D - -o /dev/null "${R[@]}" "$U/api/v1/health/live" | grep -qi '^strict-transport-security'; }
  nginx_413() {
    head -c 40000000 /dev/zero >"$WORK/huge.bin"
    [[ $(curl -s -o /dev/null -w '%{http_code}' "${R[@]}" -X POST -H 'Content-Type: application/octet-stream' \
      --data-binary @"$WORK/huge.bin" "$U/api/v1/health/live") == 413 ]]
  }
  check "nginx (TLS vhost) → API health" nginx_health
  check "nginx /media: exactly one Access-Control-Allow-Origin: *" nginx_media_cors
  check "nginx passes HSTS from the API (production)" nginx_hsts
  check "nginx rejects bodies above client_max_body_size (413)" nginx_413
  "$NGINX_BIN" -p "$N" -c "$N/nginx.conf" -e "$N/logs/error.log" -s stop || true
  "$EVCAR" set EVCAR_PROXY_MODE=caddy >/dev/null 2>&1
else
  echo "SKIP  nginx checks (set NGINX_BIN; needs ss)"
fi
