#!/usr/bin/env bash
# =============================================================================
# EV Car News deploy kit — test of `evcar proxy-setup --install` against a REAL
# nginx that already serves an "existing website" (like evcar.news), without
# touching /etc: nginx runs from a temporary prefix.
#
#   NGINX_BIN=/usr/sbin/nginx bash deploy/tests/nginx-proxy-setup.sh
#
# Checks: the new vhost is added as its own file, nginx is reloaded, the
# existing site still answers, ACME challenges + HTTPS redirect work for the
# API subdomain, a failing config is reverted, and a name conflict is refused.
# Needs: nginx binary, ss (iproute2), curl. Uses port 80 of this machine.
# =============================================================================
set -Eeuo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$HERE")
NGINX_BIN=${NGINX_BIN:-$(command -v nginx || true)}
[[ -x $NGINX_BIN ]] || {
  echo "SKIP: no nginx binary (set NGINX_BIN)"
  exit 0
}
T=$(mktemp -d "${TMPDIR:-/tmp}/evcar-nginxtest.XXXXXX")
PASS=0 FAIL=0
export NO_COLOR=1 EVCAR_HOME="$T/home" EVCAR_NGINX_ETC="$T/etc/nginx"
mkdir -p "$T/bin" "$T/logs" "$EVCAR_HOME" "$EVCAR_NGINX_ETC"/{sites-available,sites-enabled,conf.d} "$T/www"

cat >"$T/bin/nginx" <<EOF
#!/bin/sh
exec "$NGINX_BIN" -p "$T" -c "$EVCAR_NGINX_ETC/nginx.conf" -e "$T/logs/error.log" "\$@"
EOF
cat >"$T/bin/systemctl" <<EOF
#!/bin/sh
# Stand-in for systemd's nginx.service (reload / restart / is-active).
[ "\$1" = "-q" ] && shift
case "\$1 \$2" in
  "reload nginx") exec "$T/bin/nginx" -s reload ;;
  "restart nginx") "$T/bin/nginx" -s stop 2>/dev/null; sleep 0.5; exec "$T/bin/nginx" ;;
  "is-active nginx"|"is-active -q") kill -0 "\$(cat "$T/nginx.pid" 2>/dev/null)" 2>/dev/null ;;
  *) echo "fake systemctl: \$*" >&2 ;;
esac
EOF
chmod +x "$T/bin/nginx" "$T/bin/systemctl"
export PATH="$T/bin:$PATH"

# Workers run as the invoking user so they can read the private temp dir.
cat >"$EVCAR_NGINX_ETC/nginx.conf" <<EOF
$([[ $(id -u) -eq 0 ]] && echo 'user root;')
pid $T/nginx.pid;
events {}
http {
  access_log $T/logs/access.log;
  client_body_temp_path $T/b; proxy_temp_path $T/p; fastcgi_temp_path $T/f; uwsgi_temp_path $T/u; scgi_temp_path $T/s;
  include $EVCAR_NGINX_ETC/conf.d/*.conf;
  include $EVCAR_NGINX_ETC/sites-enabled/*;
}
EOF
cat >"$EVCAR_NGINX_ETC/sites-available/default" <<'EOF'
server {
    listen 80 default_server;
    server_name evcar.news www.evcar.news;
    location / { return 200 "existing evcar.news site\n"; }
}
EOF
ln -s "$EVCAR_NGINX_ETC/sites-available/default" "$EVCAR_NGINX_ETC/sites-enabled/default"
before=$(sha256sum "$EVCAR_NGINX_ETC/sites-available/default" "$EVCAR_NGINX_ETC/nginx.conf")

cleanup() {
  nginx -s stop 2>/dev/null || true
  sleep 0.5
  rm -rf "$T"
  echo "RESULT: $PASS passed, $FAIL failed"
  if ((FAIL > 0)); then exit 1; fi
}
trap cleanup EXIT
check() {
  local d=$1
  shift
  if "$@" >"$T/out" 2>&1; then
    PASS=$((PASS + 1))
    echo "PASS  $d"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL  $d"
    tail -n 20 "$T/out" | sed 's/^/      /'
  fi
}
expect_fail() {
  local d=$1
  shift
  if "$@" >"$T/out" 2>&1; then
    FAIL=$((FAIL + 1))
    echo "FAIL  $d (unexpectedly succeeded)"
  else
    PASS=$((PASS + 1))
    echo "PASS  $d"
  fi
}

nginx
sleep 0.5
check "existing site answers before" bash -c "curl -fsS -H 'Host: evcar.news' http://127.0.0.1/ | grep -q existing"

bash "$DEPLOY_DIR/install.sh" --generate-env-only --env-file "$EVCAR_HOME/.env.production" \
  --api-domain api.evcar.news --email owner@example.com --mode nginx >/dev/null 2>&1
"$DEPLOY_DIR/evcar.sh" set ACME_WEBROOT="$T/www" >/dev/null 2>&1

check "proxy-setup --install adds the vhost and reloads nginx" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
check "vhost is a separate new file, enabled by symlink" test -L "$EVCAR_NGINX_ETC/sites-enabled/evcar-news.conf" -a -f "$EVCAR_NGINX_ETC/sites-available/evcar-news.conf"
check "existing site files unchanged" bash -c "[ \"\$(sha256sum '$EVCAR_NGINX_ETC/sites-available/default' '$EVCAR_NGINX_ETC/nginx.conf')\" = '$before' ]"
sleep 0.5
check "existing site still answers" bash -c "curl -fsS -H 'Host: evcar.news' http://127.0.0.1/ | grep -q existing"
check "api subdomain redirects to HTTPS" bash -c "curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H 'Host: api.evcar.news' http://127.0.0.1/api/v1/health | grep -q '^301 https://api.evcar.news/api/v1/health'"
mkdir -p "$T/www/.well-known/acme-challenge"
echo token-ok >"$T/www/.well-known/acme-challenge/abc"
check "ACME http-01 challenge served for the api subdomain" bash -c "curl -fsS -H 'Host: api.evcar.news' http://127.0.0.1/.well-known/acme-challenge/abc | grep -q token-ok"
check "ACME challenge also served for the admin subdomain" bash -c "curl -fsS -H 'Host: admin.evcar.news' http://127.0.0.1/.well-known/acme-challenge/abc | grep -q token-ok"
check "re-running proxy-setup --install is idempotent" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
curl -s -o /dev/null -H 'Host: api.evcar.news' 'http://127.0.0.1/reset-password?token=SECRETTOKEN1'
curl -s -o /dev/null -H 'Host: admin.evcar.news' 'http://127.0.0.1/setup-password?token=SECRETTOKEN2'
curl -s -o /dev/null -H 'Host: api.evcar.news' 'http://127.0.0.1/api/v1/health?marker=LOGGEDREQUEST'
sleep 0.3
check "one-time tokens are not written to the access log" bash -c "! grep -q SECRETTOKEN '$T/logs/access.log'"
check "other requests of the vhost are still logged" grep -q LOGGEDREQUEST "$T/logs/access.log"
check "the probe files used to check the vhost were removed" bash -c "[ -z \"\$(ls -A '$T/www/.well-known/acme-challenge' 2>/dev/null | grep evcar-probe)\" ]"

# A broken configuration must be reverted and nginx must keep serving.
cp "$EVCAR_NGINX_ETC/sites-available/evcar-news.conf" "$T/good.conf"
"$DEPLOY_DIR/evcar.sh" set ACME_WEBROOT="$T/www with space" >/dev/null 2>&1
expect_fail "invalid vhost is rejected by nginx -t" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
check "previous vhost restored after the failed test" cmp "$T/good.conf" "$EVCAR_NGINX_ETC/sites-available/evcar-news.conf"
check "nginx configuration still valid" nginx -t
check "existing site still answers after the failed attempt" bash -c "curl -fsS -H 'Host: evcar.news' http://127.0.0.1/ | grep -q existing"
"$DEPLOY_DIR/evcar.sh" set ACME_WEBROOT="$T/www" >/dev/null 2>&1

# Port 443 held by another program (e.g. a container's docker-proxy): refused, nothing changed.
rm -f "$EVCAR_NGINX_ETC/sites-enabled/evcar-news.conf" "$EVCAR_NGINX_ETC/sites-available/evcar-news.conf"
nginx -s reload
python3 -c 'import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1", 443)); s.listen(); time.sleep(60)' &
HOLDER=$!
sleep 0.5
expect_fail "refuses when port 443 is used by another program" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
cp "$T/out" "$T/out.443"
check "... the error names the program and the external mode" grep -q "port 443 is used by 'python3'.*\|EVCAR_PROXY_MODE=external" "$T/out.443"
check "... and nothing was installed" test ! -e "$EVCAR_NGINX_ETC/sites-available/evcar-news.conf"
kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true
check "install works again once 443 is free" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes

# A domain already configured by another vhost is refused.
cat >"$EVCAR_NGINX_ETC/sites-enabled/other" <<'EOF'
server { listen 80; server_name api.evcar.news; return 200 "someone else\n"; }
EOF
expect_fail "refuses when api.evcar.news is configured in another vhost" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
rm -f "$EVCAR_NGINX_ETC/sites-enabled/other"

# A foreign file with our name is never overwritten.
rm -f "$EVCAR_NGINX_ETC/sites-enabled/evcar-news.conf"
echo "# someone else's file" >"$EVCAR_NGINX_ETC/sites-available/evcar-news.conf"
expect_fail "refuses to overwrite a foreign evcar-news.conf" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
check "foreign file untouched" grep -q "someone else's file" "$EVCAR_NGINX_ETC/sites-available/evcar-news.conf"
