#!/usr/bin/env bash
# =============================================================================
# EV Car News deploy kit — test of `evcar proxy-setup --install` in APACHE mode
# against the REAL Ubuntu apache2 (2.4.x) that already serves an "existing
# website" (like evcar.news), without touching /etc: apache2 runs from a copy of
# its configuration in a temporary directory.
#
#   APACHE_ROOT=/path/to/extracted/debs bash deploy/tests/apache-proxy-setup.sh
#
# APACHE_ROOT is a tree with usr/sbin/{apache2,apache2ctl,a2enmod},
# usr/lib/apache2/modules and etc/apache2, e.g. from
#   dpkg-deb -x apache2-bin_*.deb R; dpkg-deb -x apache2_*.deb R; (+ libapr1t64, libaprutil1t64)
# Checks: port 443 held by another program is refused before anything changes;
# the "mod_ssl adds Listen 443, the graceful reload cannot bind it and Apache
# exits" failure is detected and rolled back (modules disabled, vhost removed,
# Apache restarted, existing site answers); a normal install; tokens not logged.
# Needs: perl (a2enmod), ss, curl, python3. Uses ports 80 and 443 of this machine.
# =============================================================================
set -Eeuo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$HERE")
APACHE_ROOT=${APACHE_ROOT:-}
[[ -x $APACHE_ROOT/usr/sbin/apache2 ]] || {
  echo "SKIP: set APACHE_ROOT to an extracted apache2 package tree"
  exit 0
}
# Apache workers run as www-data: the test tree must be world-traversable.
T=$(mktemp -d /tmp/evcar-apachetest.XXXXXX)
chmod 755 "$T"
PASS=0 FAIL=0
export NO_COLOR=1 EVCAR_HOME="$T/home"
export APACHE_CONFDIR="$T/etc/apache2" EVCAR_APACHE_ETC="$T/etc/apache2"
export APACHE_HTTPD="$T/bin/apache2"
mkdir -p "$T/bin" "$T/etc" "$T/run" "$T/lock" "$T/log" "$T/site" "$T/acme" "$EVCAR_HOME"
cp -a "$APACHE_ROOT/etc/apache2" "$T/etc/"
sed -i "s#/usr/lib/apache2/modules/#$APACHE_ROOT/usr/lib/apache2/modules/#" "$APACHE_CONFDIR"/mods-available/*.load
# The passphrase helper lives in /usr/share/apache2 (not part of the test tree).
sed -i 's#^\([[:space:]]*SSLPassPhraseDialog\).*#\1 builtin#' "$APACHE_CONFDIR/mods-available/ssl.conf"
cat >>"$APACHE_CONFDIR/envvars" <<EOF
export APACHE_PID_FILE=$T/run/apache2.pid
export APACHE_RUN_DIR=$T/run
export APACHE_LOCK_DIR=$T/lock
export APACHE_LOG_DIR=$T/log
EOF

cat >"$T/bin/apache2" <<EOF
#!/bin/sh
LD_LIBRARY_PATH="$APACHE_ROOT/usr/lib/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}" exec "$APACHE_ROOT/usr/sbin/apache2" "\$@"
EOF
cat >"$T/bin/apache2ctl" <<EOF
#!/bin/sh
exec "$APACHE_ROOT/usr/sbin/apache2ctl" "\$@"
EOF
# a2enmod: the real script. When $T/grab-443 exists, something grabs port 443
# right after mod_ssl is enabled (after proxy-setup's own port check): this is
# the situation of a container publishing 443 next to the existing Apache.
cat >"$T/bin/a2enmod" <<EOF
#!/bin/sh
perl "$APACHE_ROOT/usr/sbin/a2enmod" "\$@" || exit \$?
case " \$* " in
  *" ssl "*)
    if [ -e "$T/grab-443" ]; then
      python3 -c 'import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("0.0.0.0", 443)); s.listen(); time.sleep(120)' >/dev/null 2>&1 &
      echo \$! >"$T/grabber.pid"
      sleep 0.5
    fi
    ;;
esac
EOF
cat >"$T/bin/a2dismod" <<EOF
#!/bin/sh
exec perl "$APACHE_ROOT/usr/sbin/a2dismod" "\$@"
EOF
# Stand-in for systemd's apache2.service (ExecReload = apachectl graceful).
cat >"$T/bin/systemctl" <<EOF
#!/bin/sh
[ "\$1" = "-q" ] && shift
case "\$1 \$2" in
  "reload apache2") exec "$T/bin/apache2ctl" graceful ;;
  "restart apache2") "$T/bin/apache2ctl" stop >/dev/null 2>&1; sleep 1; exec "$T/bin/apache2ctl" start ;;
  "is-active apache2"|"is-active -q") kill -0 "\$(cat "$T/run/apache2.pid" 2>/dev/null)" 2>/dev/null ;;
  *) echo "fake systemctl: \$*" >&2 ;;
esac
EOF
chmod +x "$T"/bin/*
export PATH="$T/bin:$PATH"

# Ubuntu's default module set (what the apache2 package's postinst enables).
a2enmod -q access_compat alias auth_basic authn_core authn_file authz_core authz_host authz_user autoindex \
  deflate dir env filter mime mpm_event negotiation reqtimeout setenvif status >/dev/null
echo "existing evcar.news site" >"$T/site/index.html"
cat >"$APACHE_CONFDIR/sites-available/000-default.conf" <<EOF
<VirtualHost *:80>
    ServerName evcar.news
    DocumentRoot $T/site
    <Directory $T/site>
        Require all granted
    </Directory>
</VirtualHost>
EOF
ln -sf ../sites-available/000-default.conf "$APACHE_CONFDIR/sites-enabled/000-default.conf"
before=$(sha256sum "$APACHE_CONFDIR/sites-available/000-default.conf" "$APACHE_CONFDIR/apache2.conf" "$APACHE_CONFDIR/ports.conf")

cleanup() {
  set +e
  [[ -s $T/grabber.pid ]] && kill "$(cat "$T/grabber.pid")" 2>/dev/null
  [[ -n ${HOLDER:-} ]] && kill "$HOLDER" 2>/dev/null
  apache2ctl stop >/dev/null 2>&1
  sleep 1
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
    tail -n 25 "$T/out" | sed 's/^/      /'
  fi
}
expect_fail() {
  local d=$1
  shift
  if "$@" >"$T/out" 2>&1; then
    FAIL=$((FAIL + 1))
    echo "FAIL  $d (unexpectedly succeeded)"
    tail -n 25 "$T/out" | sed 's/^/      /'
  else
    PASS=$((PASS + 1))
    echo "PASS  $d"
  fi
}
site_answers() { curl -fsS --noproxy '*' -H 'Host: evcar.news' http://127.0.0.1/ | grep -q existing; }
mod_enabled() { [[ -e $APACHE_CONFDIR/mods-enabled/$1.load ]]; }

apache2ctl start
sleep 1
check "existing site answers before" site_answers

bash "$DEPLOY_DIR/install.sh" --generate-env-only --env-file "$EVCAR_HOME/.env.production" \
  --api-domain api.evcar.news --email owner@example.com --mode apache >/dev/null 2>&1
"$DEPLOY_DIR/evcar.sh" set ACME_WEBROOT="$T/acme" >/dev/null 2>&1

# 1. Something else already owns 443: refused before any change.
python3 -c 'import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("0.0.0.0", 443)); s.listen(); time.sleep(120)' &
HOLDER=$!
sleep 0.5
expect_fail "refuses when port 443 belongs to another program" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
cp "$T/out" "$T/out.443"
check "... and says so" grep -q "port 443 is used by 'python3'" "$T/out.443"
check "... mod_ssl was NOT enabled" bash -c "! test -e '$APACHE_CONFDIR/mods-enabled/ssl.load'"
check "... no vhost was added" test ! -e "$APACHE_CONFDIR/sites-available/evcar-news.conf"
check "... the existing site still answers" site_answers
kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true
HOLDER=''
sleep 0.5

# 2. 443 is taken right after mod_ssl was enabled: the graceful reload cannot
# bind it and Apache exits (reproduces the review finding). Must be rolled back.
touch "$T/grab-443"
expect_fail "a reload that stops Apache is detected" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
cp "$T/out" "$T/out.grab"
check "... Apache had really stopped after the graceful reload (AH00072 / no listening sockets)" \
  grep -qE "AH00072|no listening sockets" "$T/log/error.log"
check "... the modules enabled for the vhost were disabled again" bash -c "! test -e '$APACHE_CONFDIR/mods-enabled/ssl.load' && ! test -e '$APACHE_CONFDIR/mods-enabled/proxy.load'"
check "... the vhost was removed" bash -c "! test -e '$APACHE_CONFDIR/sites-available/evcar-news.conf' && ! test -e '$APACHE_CONFDIR/sites-enabled/evcar-news.conf'"
check "... Apache runs again" systemctl is-active -q apache2
check "... the existing site answers again" site_answers
check "... the output explains what happened" grep -q "runs again with its previous configuration" "$T/out.grab"
rm -f "$T/grab-443"
kill "$(cat "$T/grabber.pid")" 2>/dev/null || true
rm -f "$T/grabber.pid"
sleep 0.5

# 3. Normal installation next to the existing site.
check "proxy-setup --install adds the vhost and reloads Apache" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
check "modules proxy, proxy_http, headers, ssl enabled" bash -c "for m in proxy proxy_http headers ssl; do test -e '$APACHE_CONFDIR/mods-enabled/'\$m.load || exit 1; done"
check "vhost is a separate new file, enabled by symlink" test -L "$APACHE_CONFDIR/sites-enabled/evcar-news.conf" -a -f "$APACHE_CONFDIR/sites-available/evcar-news.conf"
check "existing site configuration unchanged" bash -c "[ \"\$(sha256sum '$APACHE_CONFDIR/sites-available/000-default.conf' '$APACHE_CONFDIR/apache2.conf' '$APACHE_CONFDIR/ports.conf')\" = '$before' ]"
check "existing site still answers" site_answers
check "api subdomain redirects to HTTPS" bash -c "curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --noproxy '*' -H 'Host: api.evcar.news' http://127.0.0.1/api/v1/health | grep -q '^301 https://api.evcar.news/api/v1/health'"
mkdir -p "$T/acme/.well-known/acme-challenge"
echo token-ok >"$T/acme/.well-known/acme-challenge/abc"
chmod 644 "$T/acme/.well-known/acme-challenge/abc"
check "ACME http-01 challenge served for the api subdomain" bash -c "curl -fsS --noproxy '*' -H 'Host: api.evcar.news' http://127.0.0.1/.well-known/acme-challenge/abc | grep -q token-ok"
curl -s -o /dev/null --noproxy '*' -H 'Host: api.evcar.news' 'http://127.0.0.1/reset-password?token=SECRETTOKEN1'
curl -s -o /dev/null --noproxy '*' -H 'Host: admin.evcar.news' 'http://127.0.0.1/setup-password?token=SECRETTOKEN2'
curl -s -o /dev/null --noproxy '*' -H 'Host: api.evcar.news' 'http://127.0.0.1/api/v1/health?marker=LOGGEDREQUEST'
sleep 0.5
check "one-time tokens are not written to the vhost's access log" bash -c "! grep -rq SECRETTOKEN '$T/log'"
check "other requests are logged" grep -q LOGGEDREQUEST "$T/log/evcar-news_access.log"
check "re-running proxy-setup --install is idempotent" "$DEPLOY_DIR/evcar.sh" proxy-setup --install --yes
check "apache configuration still valid" apache2ctl configtest
