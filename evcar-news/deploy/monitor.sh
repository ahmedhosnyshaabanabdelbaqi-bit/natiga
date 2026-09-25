#!/usr/bin/env bash
# =============================================================================
# EV Car News — monitoring checks (sudo evcar monitor; systemd: every 5 minutes)
#
# Checks: containers running/healthy, container restarts and OOM kills, API
# health (inside the server and through https://API_DOMAIN), disk usage,
# backup freshness (database and media), weekly restore test result, off-site
# copy failures, TLS certificate expiry. Warns (journal) when no alert channel
# can deliver or when the off-site remote is not encrypted.
# Alerts (lib/alert.sh): ALERT_EMAIL (via SMTP) and/or ALERT_WEBHOOK_URL; a
# problem is re-sent every ALERT_REPEAT_HOURS (6) while it lasts, and a
# "recovered" message is sent when everything is fine again.
# Optional dead-man's switch: MONITOR_HEARTBEAT_URL is fetched after every
# successful run (e.g. a healthchecks.io-style URL that alerts when pings stop).
# =============================================================================
set -Eeuo pipefail

SELF=$(readlink -f "${BASH_SOURCE[0]}")
DEPLOY_DIR=$(dirname "$SELF")
# shellcheck source=lib/common.sh
source "$DEPLOY_DIR/lib/common.sh"
# shellcheck source=lib/alert.sh
source "$DEPLOY_DIR/lib/alert.sh"

PROBLEMS=()
problem() { PROBLEMS+=("$*"); }

expected_services() {
  local s=(postgres redis api)
  [[ $(worker_mode) == separate ]] && s+=(worker)
  [[ -n $(admin_domain) ]] && s+=(admin)
  [[ $(proxy_mode) == caddy ]] && s+=(caddy)
  mail_outbox_enabled && s+=(mailpit)
  printf '%s\n' "${s[@]}"
}

check_containers() {
  local svc id info status restarts oom health prev_file new_file prev_id prev_count
  prev_file="$EVCAR_STATE_DIR/monitor-restarts"
  new_file=$(mktemp "$EVCAR_STATE_DIR/monitor-restarts.XXXXXX")
  while read -r svc; do
    id=$(service_container "$svc")
    if [[ -z $id ]]; then
      problem "container '$svc' does not exist (sudo evcar up)"
      continue
    fi
    info=$(docker inspect -f '{{.State.Status}} {{.RestartCount}} {{.State.OOMKilled}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo 'unknown 0 false none')
    read -r status restarts oom health <<<"$info"
    if [[ $status != running ]]; then problem "container '$svc' is $status"; fi
    if [[ $health == unhealthy ]]; then problem "container '$svc' is unhealthy (sudo evcar logs $svc)"; fi
    if [[ $oom == true ]]; then problem "container '$svc' was killed because it ran out of memory"; fi
    prev_id='' prev_count=0
    if [[ -r $prev_file ]]; then
      read -r prev_id prev_count < <(awk -v s="$svc" '$1 == s { print $2, $3 }' "$prev_file") || true
    fi
    if [[ $prev_id == "$id" && $restarts =~ ^[0-9]+$ && $prev_count =~ ^[0-9]+$ ]] && ((restarts > prev_count)); then
      problem "container '$svc' restarted $((restarts - prev_count)) time(s) since the last check (crash? sudo evcar logs $svc)"
    fi
    printf '%s %s %s\n' "$svc" "$id" "$restarts" >>"$new_file"
  done < <(expected_services)
  mv -f "$new_file" "$prev_file"
}

check_api() {
  local json status api code
  if service_running api; then
    json=$(dc exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(async r=>process.stdout.write(await r.text())).catch(()=>process.exit(1))" 2>/dev/null || true)
    status=$(printf '%s' "$json" | grep -o '"status":"[a-z_]*"' | head -n 1 | cut -d'"' -f4 || true)
    case $status in
      ok) ;;
      degraded) problem "API health is DEGRADED (Redis or storage down): $json" ;;
      '') problem "API health endpoint does not answer inside the server" ;;
      *) problem "API health is ${status^^}: $json" ;;
    esac
  fi
  [[ $(env_get MONITOR_PUBLIC_CHECK true) == true ]] || return 0
  api=$(env_get API_DOMAIN)
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$api/api/v1/health/live" 2>/dev/null || true)
  if [[ $code != 200 ]]; then
    problem "public URL https://$api/api/v1/health/live answered ${code:-nothing} (DNS / TLS / proxy problem?)"
  fi
}

check_disk() {
  local limit path pct seen=' ' dev
  limit=$(env_get DISK_ALERT_PERCENT 85)
  for path in / "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /)" "$(env_get BACKUP_DIR "$EVCAR_HOME/backups")"; do
    [[ -e $path ]] || continue
    dev=$(df -P "$path" | awk 'NR == 2 { print $1 }')
    [[ $seen == *" $dev "* ]] && continue
    seen+="$dev "
    pct=$(df -P "$path" | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')
    if [[ $pct =~ ^[0-9]+$ ]] && ((pct >= limit)); then
      problem "disk of $path is ${pct}% full (limit ${limit}%). Free space: old backups, docker image prune, media"
    fi
  done
  local mem_avail
  mem_avail=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || echo 0)
  if [[ $mem_avail =~ ^[0-9]+$ ]] && ((mem_avail > 0 && mem_avail < $(env_get MEMORY_ALERT_MB 100))); then
    problem "only ${mem_avail} MB of memory available"
  fi
}

age_hours() { # age_hours ISO-8601 → hours since then (large when unparsable)
  local t
  t=$(date -u -d "$1" +%s 2>/dev/null || echo 0)
  echo $((($(date -u +%s) - t) / 3600))
}

check_backups() {
  local last max installed rt
  max=$(env_get BACKUP_MAX_AGE_HOURS 26)
  installed=$(cat "$EVCAR_STATE_DIR/installed_at" 2>/dev/null || date -u +%FT%TZ)
  if [[ -s $EVCAR_STATE_DIR/last-backup-failed ]]; then
    problem "last backup FAILED: $(cat "$EVCAR_STATE_DIR/last-backup-failed")"
  fi
  if [[ -r $EVCAR_STATE_DIR/last-backup-ok ]]; then
    last=$(cat "$EVCAR_STATE_DIR/last-backup-ok")
    if (($(age_hours "$last") > max)); then problem "no successful backup for more than $max hours (last: $last)"; fi
  elif (($(age_hours "$installed") > max)); then
    problem "no successful backup yet (installed $installed). Check: systemctl status evcar-backup.timer"
  fi
  if [[ -r $EVCAR_STATE_DIR/restore-test.last ]]; then
    rt=$(cat "$EVCAR_STATE_DIR/restore-test.last")
    if [[ $rt == failed* ]]; then problem "weekly restore test FAILED: $rt"; fi
    local when
    when=$(awk '{ print $2 }' <<<"$rt")
    if (($(age_hours "$when") > 8 * 24 + 12)); then problem "the restore test has not run for more than 8 days (last: $when)"; fi
  elif (($(age_hours "$installed") > 8 * 24 + 12)); then
    problem "no restore test has ever run (systemctl status evcar-restore-test.timer)"
  fi
  if [[ -s $EVCAR_STATE_DIR/last-backup-media-failed ]]; then
    problem "last backup has NO media files: $(cat "$EVCAR_STATE_DIR/last-backup-media-failed")"
  fi
  if [[ -s $EVCAR_STATE_DIR/last-offsite-failed ]]; then
    problem "off-site backup copy failed: $(cat "$EVCAR_STATE_DIR/last-offsite-failed")"
  fi
}

check_tls() {
  local api end days
  [[ $(proxy_mode) == external ]] && return 0
  api=$(env_get API_DOMAIN)
  end=$(echo | timeout 15 openssl s_client -connect 127.0.0.1:443 -servername "$api" 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)
  [[ -n $end ]] || return 0 # no certificate yet: the public check reports it
  days=$((($(date -u -d "$end" +%s) - $(date -u +%s)) / 86400))
  if ((days < $(env_get TLS_ALERT_DAYS 14))); then
    problem "TLS certificate of $api expires in $days day(s) ($end); automatic renewal is not working"
  fi
}

report() {
  local state="$EVCAR_STATE_DIR/monitor.last" key now last_status='ok' last_key='' last_alert=0 repeat host body
  now=$(date +%s)
  host=$(env_get API_DOMAIN "$(hostname)")
  if [[ -r $state ]]; then read -r last_status last_key last_alert <"$state" || true; fi
  [[ $last_alert =~ ^[0-9]+$ ]] || last_alert=0
  repeat=$(($(env_get ALERT_REPEAT_HOURS 6) * 3600))
  if ((${#PROBLEMS[@]} == 0)); then
    echo "$(date -u +%FT%TZ) all checks passed"
    if [[ $last_status == problem ]]; then
      send_alert "[EV Car News] RECOVERED on $host" "All monitoring checks pass again ($(date -u +%FT%TZ))." || true
    fi
    printf 'ok - %s\n' "$now" >"$state"
    local hb
    hb=$(env_get MONITOR_HEARTBEAT_URL '')
    if [[ -n $hb ]]; then
      local cfg
      cfg=$(mktemp)
      chmod 600 "$cfg"
      printf 'url = "%s"\n' "$(curl_cfg_escape "$hb")" >"$cfg"
      curl -fsS --max-time 15 -K "$cfg" -o /dev/null || warn "heartbeat ping failed"
      rm -f "$cfg"
    fi
    return 0
  fi
  printf '%s PROBLEM: %s\n' "$(date -u +%FT%TZ)" "${PROBLEMS[@]}"
  key=$(printf '%s\n' "${PROBLEMS[@]}" | sed -E 's/[0-9]+//g' | sort | sha256sum | cut -c1-16)
  if in_maintenance; then
    echo "maintenance in progress (update/restore): alert suppressed"
    return 1
  fi
  if [[ $last_status != problem || $key != "$last_key" ]] || ((now - last_alert >= repeat)); then
    body=$(printf -- '- %s\n' "${PROBLEMS[@]}")
    body+=$'\n\n'"Server: $(hostname) · $(date -u +%FT%TZ)"$'\n'"Details: sudo evcar status ; sudo evcar logs"
    if send_alert "[EV Car News] ALERT on $host (${#PROBLEMS[@]} problem(s))" "$body"; then
      last_alert=$now
    fi
  fi
  printf 'problem %s %s\n' "$key" "$last_alert" >"$state"
  return 1
}

main() {
  require_root monitor
  require_env_file
  ensure_dirs
  compose_setup
  # Printed on every run (journal): these cannot be alerted about.
  alert_channel_available || warn "$ALERT_NO_CHANNEL_MSG"
  warn_offsite_encryption
  check_containers
  check_api
  check_disk
  check_backups
  check_tls
  report
}

main "$@"
