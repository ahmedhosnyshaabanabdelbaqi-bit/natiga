#!/usr/bin/env bash
# Managed by qasr-nicu enable-lan.sh. Run only on the destination Ubuntu host.
set -Eeuo pipefail
umask 077
fail() { printf 'LAN setup stopped: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run with sudo on the hospital server.'
DOMAIN=child.egsystem.net
PROJECT_ROOT=${PROJECT_ROOT:-/srv/projects/child.egsystem.net}
LAN_IP=${LAN_IP:-192.168.1.15}
LAN_CIDR=${LAN_CIDR:-192.168.1.0/24}
APP_PORT=${APP_PORT:-4317}
ORIGIN_PORT=${ORIGIN_PORT:-8087}
LAN_HTTP_REDIRECT=${LAN_HTTP_REDIRECT:-0}
MARKER='# Managed by qasr-nicu enable-lan.sh'
[[ $PROJECT_ROOT =~ ^/srv/projects/[a-zA-Z0-9._/-]+$ ]] || fail 'Invalid project directory.'
PROJECT_ROOT=$(realpath -e -- "$PROJECT_ROOT")
[[ $PROJECT_ROOT == /srv/projects/* && $PROJECT_ROOT != /srv/projects/ ]] || fail 'Project must resolve below /srv/projects.'
for command in python3 nginx curl openssl systemctl install sha256sum runuser flock; do command -v "$command" >/dev/null || fail "Missing command: $command"; done
[[ $APP_PORT =~ ^[0-9]{4,5}$ && $ORIGIN_PORT =~ ^[0-9]{4,5}$ ]] || fail 'Invalid loopback ports.'
(( 10#$APP_PORT >= 1024 && 10#$APP_PORT <= 65535 && 10#$ORIGIN_PORT >= 1024 && 10#$ORIGIN_PORT <= 65535 )) || fail 'Invalid port range.'
[[ $LAN_HTTP_REDIRECT == 0 || $LAN_HTTP_REDIRECT == 1 ]] || fail 'LAN_HTTP_REDIRECT must be 0 or 1.'
python3 - "$LAN_IP" "$LAN_CIDR" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1]); net=ipaddress.ip_network(sys.argv[2],strict=True)
if ip.version!=4 or not ip.is_private or ip.is_loopback or ip.is_unspecified or ip not in net or net.prefixlen<16:
    raise SystemExit('LAN_IP must be an explicit private IPv4 address inside a restricted LAN_CIDR (/16 or smaller).')
PY
ORIGIN=/etc/nginx/sites-available/$DOMAIN.conf
ORIGIN_LINK=/etc/nginx/sites-enabled/$DOMAIN.conf
TLS_CONFIG=/etc/nginx/sites-available/$DOMAIN-lan.conf
TLS_LINK=/etc/nginx/sites-enabled/$DOMAIN-lan.conf
HOOK=/etc/letsencrypt/renewal-hooks/deploy/child-egsystem-nicu-reload
WEBROOT=$PROJECT_ROOT/acme
[[ -f $ORIGIN && ! -L $ORIGIN ]] || fail 'Expected dedicated regular origin config is missing.'
[[ -L $ORIGIN_LINK && $(readlink -f -- "$ORIGIN_LINK") == "$ORIGIN" ]] || fail 'Origin enabled link is not the expected dedicated site.'
grep -Fx '# Managed by qasr-nicu deploy-linux.sh' "$ORIGIN" >/dev/null || fail 'Refusing to edit an unrecognized origin config.'
for owned in "$TLS_CONFIG" "$HOOK"; do
  if [[ -e $owned || -L $owned ]]; then
    [[ -f $owned && ! -L $owned ]] && grep -Fx "$MARKER" "$owned" >/dev/null || fail "Existing path is not owned by this installer: $owned"
  fi
done
if [[ -e $TLS_LINK || -L $TLS_LINK ]]; then
  [[ -L $TLS_LINK && $(readlink -f -- "$TLS_LINK") == "$TLS_CONFIG" ]] || fail 'Existing LAN enabled path belongs to another configuration.'
fi
[[ -d $PROJECT_ROOT/logs ]] || fail 'The deployed project logs directory is missing.'
install -d -m 750 "$PROJECT_ROOT/deploy/lan-backups"
exec 9>"$PROJECT_ROOT/deploy/.enable-lan.lock"
flock -n 9 || fail 'Another LAN setup is running.'
nginx -t
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
BACKUP=$PROJECT_ROOT/deploy/lan-backups/$STAMP
install -d -m 700 "$BACKUP"
nginx -T > "$BACKUP/nginx-before.txt" 2>&1
python3 - "$BACKUP/nginx-before.txt" "$ORIGIN" "$TLS_CONFIG" "$DOMAIN" "$LAN_IP" <<'PY'
import pathlib,re,sys
dump=pathlib.Path(sys.argv[1]).read_text(); origin,tls,domain,lan=sys.argv[2:]
chunks=re.split(r'(?m)^# configuration file (.+):\s*$',dump)
for pos in range(1,len(chunks),2):
    name,content=chunks[pos:pos+2]
    if name not in (origin,tls) and not name.endswith('/sites-enabled/'+pathlib.Path(origin).name) and not name.endswith('/sites-enabled/'+pathlib.Path(tls).name):
        if re.search(r'server_name\s+[^;]*\b'+re.escape(domain)+r'\b',content) and re.search(r'listen\s+[^;]*\b443\b',content):
            raise SystemExit('The hostname already has a TLS server in another file: '+name)
    if re.search(r'listen\s+'+re.escape(lan)+r':443\b',content):
        raise SystemExit('An explicit LAN-IP TLS listener already exists. Review SNI listener grouping before adding the wildcard child vhost.')
PY
cp -a -- "$ORIGIN" "$BACKUP/origin.conf"
HAD_TLS=0; HAD_LINK=0; HAD_HOOK=0; CHANGED_ORIGIN=0; CHANGED_TLS=0; CHANGED_HOOK=0; CHANGED_ACL=0; SUCCESS=0; PROBE=''
if [[ -f $TLS_CONFIG ]]; then cp -a -- "$TLS_CONFIG" "$BACKUP/lan.conf"; HAD_TLS=1; fi
if [[ -L $TLS_LINK ]]; then HAD_LINK=1; fi
if [[ -f $HOOK ]]; then cp -a -- "$HOOK" "$BACKUP/renew-hook"; HAD_HOOK=1; fi
cleanup() {
  local result=$?
  if [[ -n $PROBE && $PROBE == "$WEBROOT/.well-known/acme-challenge/"* ]]; then rm -f -- "$PROBE"; fi
  if [[ $SUCCESS != 1 ]]; then
    printf 'Restoring only this attempt\047s nginx changes. Backups: %s\n' "$BACKUP" >&2
    if [[ $CHANGED_ORIGIN == 1 ]]; then cp -a -- "$BACKUP/origin.conf" "$ORIGIN"; fi
    if [[ $CHANGED_TLS == 1 ]]; then
      if [[ $HAD_TLS == 1 ]]; then cp -a -- "$BACKUP/lan.conf" "$TLS_CONFIG"; else rm -f -- "$TLS_CONFIG"; fi
      if [[ $HAD_LINK == 0 && -L $TLS_LINK && $(readlink -- "$TLS_LINK") == "$TLS_CONFIG" ]]; then unlink "$TLS_LINK"; fi
    fi
    if [[ $CHANGED_HOOK == 1 ]]; then
      if [[ $HAD_HOOK == 1 ]]; then cp -a -- "$BACKUP/renew-hook" "$HOOK"; else rm -f -- "$HOOK"; fi
    fi
    if [[ $CHANGED_ACL == 1 ]]; then setfacl --restore="$BACKUP/project-root.acl" || true; fi
    if nginx -t; then systemctl reload nginx || true; fi
  fi
  return "$result"
}
trap cleanup EXIT
packages=()
command -v certbot >/dev/null || packages+=(certbot)
command -v setfacl >/dev/null || packages+=(acl)
if (( ${#packages[@]} )); then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends "${packages[@]}"
fi
install -d -m 755 "$WEBROOT" "$WEBROOT/.well-known" "$WEBROOT/.well-known/acme-challenge"
NGINX_USER=$(python3 - "$BACKUP/nginx-before.txt" <<'PY'
import pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text(); match=re.search(r'(?m)^\s*user\s+([a-z_][a-z0-9_-]*)(?:\s+[^;]+)?;',text)
print(match.group(1) if match else 'www-data')
PY
)
id "$NGINX_USER" >/dev/null
# Grant traversal only on this private project root. Do not widen parent/shared directories.
runuser -u "$NGINX_USER" -- python3 -c 'import os,sys; sys.exit(not os.access(sys.argv[1],os.X_OK))' /srv/projects || fail 'nginx worker cannot traverse /srv/projects; review that shared directory separately.'
if ! runuser -u "$NGINX_USER" -- python3 -c 'import os,sys; sys.exit(not os.access(sys.argv[1],os.X_OK))' "$PROJECT_ROOT"; then
  getfacl -p "$PROJECT_ROOT" > "$BACKUP/project-root.acl"
  setfacl -m "u:$NGINX_USER:--x" "$PROJECT_ROOT"
  CHANGED_ACL=1
fi
python3 - "$ORIGIN" "$BACKUP/origin-candidate.conf" "$WEBROOT" "$DOMAIN" "$ORIGIN_PORT" <<'PY'
import pathlib,re,sys
source,out,webroot,domain,port=sys.argv[1:]; text=pathlib.Path(source).read_text()
if len(re.findall(r'(?m)^\s*server\s*\{',text))!=1 or not re.search(r'listen\s+127\.0\.0\.1:'+re.escape(port)+r'\s*;',text) or not re.search(r'server_name\s+'+re.escape(domain)+r'\s*;',text):
    raise SystemExit('Origin shape differs from the managed single loopback server. No automatic rewrite is safe.')
start='    # BEGIN qasr-nicu ACME location'; end='    # END qasr-nicu ACME location'
block=start+'\n    location ^~ /.well-known/acme-challenge/ {\n        root '+webroot+';\n        default_type text/plain;\n        try_files $uri =404;\n        add_header Cache-Control "no-store" always;\n    }\n'+end+'\n'
if start in text:
    if text.count(start)!=1 or text.count(end)!=1: raise SystemExit('Ambiguous managed ACME markers.')
    text=re.sub(re.escape(start)+r'.*?'+re.escape(end)+r'\n?',lambda _:block,text,count=1,flags=re.S)
else:
    if '/.well-known/acme-challenge/' in text: raise SystemExit('An unmanaged ACME location exists; review it manually.')
    matches=list(re.finditer(r'(?m)^\s*location\s+/\s*\{',text))
    if len(matches)!=1: raise SystemExit('Cannot locate one root proxy location.')
    text=text[:matches[0].start()]+block+text[matches[0].start():]
pathlib.Path(out).write_text(text)
PY
if ! cmp -s "$ORIGIN" "$BACKUP/origin-candidate.conf"; then
  install -m 644 "$BACKUP/origin-candidate.conf" "$ORIGIN"
  CHANGED_ORIGIN=1
fi
nginx -t
systemctl reload nginx
TOKEN=nicu-lan-probe-$(openssl rand -hex 12)
PROBE=$WEBROOT/.well-known/acme-challenge/$TOKEN
printf '%s' "$TOKEN" > "$PROBE"
chmod 644 "$PROBE"
runuser -u "$NGINX_USER" -- python3 -c 'import os,sys; sys.exit(not os.access(sys.argv[1],os.R_OK))' "$PROBE" || fail 'nginx cannot read the isolated ACME probe.'
LOCAL=''
for attempt in 1 2 3 4 5; do
  LOCAL=$(curl --fail --silent --show-error --max-time 15 -H "Host: $DOMAIN" "http://127.0.0.1:$ORIGIN_PORT/.well-known/acme-challenge/$TOKEN") || true
  [[ $LOCAL == "$TOKEN" ]] && break
  sleep 1
done
[[ $LOCAL == "$TOKEN" ]] || fail 'Loopback origin did not serve the exact challenge token.'
PUBLIC=$(curl --fail --silent --show-error --location --max-redirs 5 --proto '=http,https' --proto-redir '=http,https' --max-time 45 "http://$DOMAIN/.well-known/acme-challenge/$TOKEN")
[[ $PUBLIC == "$TOKEN" ]] || fail 'Public HTTP challenge path is blocked, redirected to login, or routed elsewhere. Review only this hostname in Cloudflare.'
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > "$BACKUP/renew-hook-candidate" <<'HOOK'
#!/usr/bin/env bash
# Managed by qasr-nicu enable-lan.sh
set -euo pipefail
[[ ${RENEWED_LINEAGE:-} == /etc/letsencrypt/live/child.egsystem.net ]] || exit 0
[[ " ${RENEWED_DOMAINS:-} " == *' child.egsystem.net '* ]] || exit 0
nginx -t
systemctl reload nginx
HOOK
install -m 755 "$BACKUP/renew-hook-candidate" "$HOOK"
CHANGED_HOOK=1
certbot certonly --webroot --webroot-path "$WEBROOT" --domain "$DOMAIN" --cert-name "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
CERT=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
KEY=/etc/letsencrypt/live/$DOMAIN/privkey.pem
[[ -s $CERT && -s $KEY ]] || fail 'Certificate files were not created.'
openssl x509 -in "$CERT" -noout -checkhost "$DOMAIN"
openssl x509 -in "$CERT" -noout -checkend 86400 || fail 'Certificate is expired or expires within 24 hours.'
cat > "$BACKUP/lan-candidate.conf" <<EOF
$MARKER
# Same application and database as the Cloudflare origin; SNI only, never default_server.
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:QasrNicuLanTLS:10m;
    ssl_session_timeout 1d;
    client_max_body_size 8m;
    allow 127.0.0.1;
    allow $LAN_CIDR;
    deny all;
    access_log $PROJECT_ROOT/logs/nginx-lan-access.log;
    error_log $PROJECT_ROOT/logs/nginx-lan-error.log;
    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
        try_files \$uri =404;
        add_header Cache-Control "no-store" always;
    }
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host $DOMAIN;
        proxy_set_header X-Forwarded-Host $DOMAIN;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
EOF
if [[ $LAN_HTTP_REDIRECT == 1 ]]; then
cat >> "$BACKUP/lan-candidate.conf" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    allow 127.0.0.1;
    allow $LAN_CIDR;
    deny all;
    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 308 https://$DOMAIN\$request_uri; }
}
EOF
fi
install -m 644 "$BACKUP/lan-candidate.conf" "$TLS_CONFIG"
CHANGED_TLS=1
if [[ ! -L $TLS_LINK ]]; then ln -s "$TLS_CONFIG" "$TLS_LINK"; fi
nginx -t
systemctl reload nginx
# Test real CA validation and the same hostname, bypassing public DNS for this command only.
LAN_HEALTH_OK=0
for attempt in 1 2 3 4 5; do
  if curl --fail --silent --show-error --max-time 20 --resolve "$DOMAIN:443:$LAN_IP" "https://$DOMAIN/api/health" > "$BACKUP/lan-health.json"; then LAN_HEALTH_OK=1; break; fi
  sleep 1
done
[[ $LAN_HEALTH_OK == 1 ]] || fail 'LAN HTTPS validation failed after nginx reload.'
python3 - "$BACKUP/lan-health.json" <<'PY'
import json,pathlib,sys
if json.loads(pathlib.Path(sys.argv[1]).read_text()).get('ok') is not True: raise SystemExit('LAN endpoint did not return application health.')
PY
if systemctl list-unit-files certbot.timer --no-legend | grep -q '^certbot.timer'; then
  systemctl enable --now certbot.timer
else
  printf 'Certificate issued, but no certbot.timer was found. Configure certbot renewal scheduling before relying on LAN TLS.\n' >&2
fi
SUCCESS=1
printf 'LAN HTTPS ready: https://%s -> %s. Same app/database; tunnel port %s unchanged.\n' "$DOMAIN" "$LAN_IP" "$ORIGIN_PORT"
printf 'Backups and verification: %s\n' "$BACKUP"
printf 'Configure split DNS or a hostname-only client hosts entry on hospital devices. No client DNS, firewall or Cloudflare settings were modified.\n'
openssl x509 -in "$CERT" -noout -dates
