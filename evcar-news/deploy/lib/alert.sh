# shellcheck shell=bash
# EV Car News deploy kit — alert delivery (sourced after lib/common.sh).
#
# Channels (all optional, configured in .env.production):
#   ALERT_EMAIL        recipient; sent through the SMTP server of the backend
#                      (SMTP_HOST/PORT/USER/PASSWORD/SECURE, MAIL_FROM). Not
#                      available while the mail outbox (mailpit) is used.
#   ALERT_WEBHOOK_URL  HTTPS URL receiving a POST. ALERT_WEBHOOK_FORMAT=json
#                      (default: {"text": ..., "content": ...} — Slack, Discord,
#                      Telegram sendMessage?chat_id=...) or text (plain body, e.g. ntfy).
# Secrets (SMTP password, webhook URL) are passed to curl through a 0600
# config file, never on the command line (and `evcar set` refuses them on its
# own command line: `sudo evcar set KEY` prompts for the value instead).

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# Escapes a value for a double-quoted curl config (-K) entry.
curl_cfg_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "$s"
}

alert_email() {
  local subject=$1 body=$2 to host port secure user pass from from_addr url cfg msg rc=0
  to=$(env_get ALERT_EMAIL '')
  host=$(env_get SMTP_HOST '')
  [[ -n $to ]] || return 2
  if [[ -z $host || $host == mailpit ]]; then
    warn "ALERT_EMAIL is set but no real SMTP server is configured (SMTP_HOST=${host:-empty}); e-mail alert skipped"
    return 2
  fi
  port=$(env_get SMTP_PORT 587)
  secure=$(env_get SMTP_SECURE false)
  user=$(env_get SMTP_USER '')
  pass=$(env_get SMTP_PASSWORD '')
  from=$(env_get MAIL_FROM 'EV Car News <no-reply@evcar.news>')
  from_addr=$from
  if [[ $from =~ \<([^>]+)\> ]]; then from_addr=${BASH_REMATCH[1]}; fi
  if [[ $secure == true ]]; then url="smtps://$host:$port"; else url="smtp://$host:$port"; fi

  cfg=$(mktemp)
  msg=$(mktemp)
  chmod 600 "$cfg" "$msg"
  {
    printf 'url = "%s"\n' "$(curl_cfg_escape "$url")"
    if [[ -n $user ]]; then printf 'user = "%s"\n' "$(curl_cfg_escape "$user:$pass")"; fi
  } >"$cfg"
  {
    printf 'From: %s\n' "$from"
    printf 'To: %s\n' "$to"
    printf 'Subject: %s\n' "$subject"
    printf 'Date: %s\n' "$(LC_ALL=C date -R)"
    printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: 8bit\n\n'
    printf '%s\n' "$body"
  } >"$msg"
  local tls=(--ssl-reqd)
  if [[ $secure == true ]]; then tls=(); fi
  if ! curl -sS --max-time 60 -K "$cfg" "${tls[@]}" --mail-from "$from_addr" --mail-rcpt "$to" \
    --upload-file "$msg" --crlf >/dev/null; then
    rc=1
    warn "sending the alert e-mail to $to failed"
  fi
  rm -f "$cfg" "$msg"
  return "$rc"
}

alert_webhook() {
  local subject=$1 body=$2 url format cfg payload rc=0 text
  url=$(env_get ALERT_WEBHOOK_URL '')
  [[ -n $url ]] || return 2
  format=$(env_get ALERT_WEBHOOK_FORMAT json)
  text="$subject"$'\n'"$body"
  cfg=$(mktemp)
  chmod 600 "$cfg"
  printf 'url = "%s"\n' "$(curl_cfg_escape "$url")" >"$cfg"
  if [[ $format == text ]]; then
    payload=$text
    set -- -H 'Content-Type: text/plain; charset=utf-8'
  else
    # Discord limits "content" to 2000 characters.
    payload=$(printf '{"text":"%s","content":"%s"}' "$(json_escape "$text")" "$(json_escape "${text:0:1900}")")
    set -- -H 'Content-Type: application/json'
  fi
  if ! printf '%s' "$payload" | curl -sS --max-time 30 -K "$cfg" -X POST "$@" --data-binary @- -o /dev/null; then
    rc=1
    warn "posting the alert to ALERT_WEBHOOK_URL failed"
  fi
  rm -f "$cfg"
  return "$rc"
}

# True when at least one channel can actually deliver: ALERT_EMAIL through a
# real SMTP server (not the local mailpit outbox), or ALERT_WEBHOOK_URL.
alert_channel_available() {
  [[ -n $(env_get ALERT_WEBHOOK_URL '') ]] && return 0
  [[ -n $(env_get ALERT_EMAIL '') ]] && real_smtp_configured
}

readonly ALERT_NO_CHANNEL_MSG="no working alert channel: alerts (backup failures, outages) reach NOBODY. Configure real SMTP (sudo evcar set SMTP_HOST=...; sudo evcar set SMTP_PASSWORD) or a webhook (sudo evcar set ALERT_WEBHOOK_URL), then run: sudo evcar alert-test"

# send_alert SUBJECT BODY — returns 0 when at least one channel delivered it
# (or when no channel is configured: the message is only logged).
send_alert() {
  local subject=$1 body=$2 delivered=0 configured=0 rc channel
  printf '%s\n%s\n' "$subject" "$body" >&2
  for channel in alert_email alert_webhook; do
    if "$channel" "$subject" "$body"; then
      delivered=1
      configured=1
    else
      rc=$?
      if ((rc != 2)); then configured=1; fi
    fi
  done
  if ((configured == 0)); then
    warn "$ALERT_NO_CHANNEL_MSG (this alert was only logged)"
    return 0
  fi
  if ((delivered == 1)); then return 0; fi
  return 1
}

# send_test_alert — 0 only when at least one channel really delivered it.
send_test_alert() {
  local subject body delivered=0 channel
  subject="[EV Car News] test alert from $(env_get API_DOMAIN "$(hostname)")"
  body="This is a test of the EV Car News alert channels ($(date -u +%FT%TZ)). If you read this, alerts about backups, outages and disk space reach you."
  for channel in alert_email alert_webhook; do
    if "$channel" "$subject" "$body"; then
      delivered=1
      ok "${channel#alert_}: delivered"
    else
      case $? in
        2) info "${channel#alert_}: not configured" ;;
        *) err "${channel#alert_}: FAILED" ;;
      esac
    fi
  done
  ((delivered == 1))
}
