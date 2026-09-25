#!/usr/bin/env bash
# =============================================================================
# EV Car News deploy kit — test of `evcar harden-ssh` with the REAL OpenSSH
# sshd (Ubuntu package) on a copy of Ubuntu's default sshd_config plus the
# 50-cloud-init.conf that VPS images ship (PasswordAuthentication yes).
#
#   SSHD_BIN=/usr/sbin/sshd SSHD_DEFAULT_CONFIG=/usr/share/openssh/sshd_config \
#     bash deploy/tests/harden-ssh.sh
# Nothing outside a temporary directory is changed (except creating /run/sshd,
# which `sshd -t` requires). sshd also needs its privilege-separation user
# `sshd` (present wherever openssh-server is installed; elsewhere, e.g.:
#   unshare -m sh -c 'mount --bind passwd-with-sshd /etc/passwd && bash harden-ssh.sh').
# =============================================================================
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$HERE")
SSHD_BIN=${SSHD_BIN:-$(command -v sshd || true)}
SSHD_DEFAULT_CONFIG=${SSHD_DEFAULT_CONFIG:-/usr/share/openssh/sshd_config}
[[ -x $SSHD_BIN && -r $SSHD_DEFAULT_CONFIG ]] || {
  echo "SKIP: needs SSHD_BIN and SSHD_DEFAULT_CONFIG (Ubuntu's /usr/share/openssh/sshd_config)"
  exit 0
}
[[ $(id -u) -eq 0 ]] || {
  echo "SKIP: run as root (sshd -T)"
  exit 0
}
command -v ssh-keygen >/dev/null || {
  echo "SKIP: needs ssh-keygen (openssh-client)"
  exit 0
}
T=$(mktemp -d "${TMPDIR:-/tmp}/evcar-sshtest.XXXXXX")
PASS=0 FAIL=0
cleanup() {
  rm -rf "$T"
  echo "RESULT: $PASS passed, $FAIL failed"
  if ((FAIL > 0)); then exit 1; fi
}
trap cleanup EXIT
export NO_COLOR=1 EVCAR_SSHD_DIR="$T/etc/ssh" EVCAR_SSHD_BIN="$SSHD_BIN"
mkdir -p "$T/etc/ssh/sshd_config.d" "$T/keys" "$T/bin" /run/sshd
ssh-keygen -q -t ed25519 -N '' -f "$T/hostkey" >/dev/null
{
  echo "HostKey $T/hostkey"
  echo "AuthorizedKeysFile $T/keys/%u"
  sed "s#^Include /etc/ssh/sshd_config.d/\\*\\.conf#Include $T/etc/ssh/sshd_config.d/*.conf#" "$SSHD_DEFAULT_CONFIG"
} >"$T/etc/ssh/sshd_config"
echo "PasswordAuthentication yes" >"$T/etc/ssh/sshd_config.d/50-cloud-init.conf"
printf '#!/bin/sh\necho "fake systemctl: $*" >&2\nexit 3\n' >"$T/bin/systemctl"
chmod +x "$T/bin/systemctl"
export PATH="$T/bin:$PATH"
check() {
  local d=$1
  shift
  if "$@" >"$T/out" 2>&1; then
    PASS=$((PASS + 1)); echo "PASS  $d"
  else
    FAIL=$((FAIL + 1)); echo "FAIL  $d"; tail -n 20 "$T/out" | sed 's/^/      /'
  fi
}
expect_fail() {
  local d=$1
  shift
  if "$@" >"$T/out" 2>&1; then
    FAIL=$((FAIL + 1)); echo "FAIL  $d (unexpectedly succeeded)"; tail -n 20 "$T/out" | sed 's/^/      /'
  else
    PASS=$((PASS + 1)); echo "PASS  $d"
  fi
}
effective() { "$SSHD_BIN" -T -f "$T/etc/ssh/sshd_config" | awk -v k="$1" '$1 == k { print $2 }'; }

check "Ubuntu's sshd_config reads sshd_config.d/*.conf first (Include on line $(grep -n '^Include' "$T/etc/ssh/sshd_config" | cut -d: -f1))" \
  test "$(effective passwordauthentication)" = yes
# The step the old checklist gave: edit sshd_config itself.
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' "$T/etc/ssh/sshd_config"
check "finding reproduced: 'PasswordAuthentication no' in sshd_config has NO effect behind 50-cloud-init.conf" \
  test "$(effective passwordauthentication)" = yes
sed -i 's/^PasswordAuthentication no/#PasswordAuthentication yes/' "$T/etc/ssh/sshd_config"

expect_fail "harden-ssh refuses while the login user has no SSH key (lock-out protection)" \
  "$DEPLOY_DIR/evcar.sh" harden-ssh --yes
check "... and changed nothing" test ! -e "$T/etc/ssh/sshd_config.d/00-evcar-hardening.conf"

ssh-keygen -q -t ed25519 -N '' -f "$T/userkey" >/dev/null
cp "$T/userkey.pub" "$T/keys/root"
check "harden-ssh with a key present" "$DEPLOY_DIR/evcar.sh" harden-ssh --yes
check "effective PasswordAuthentication is now 'no' (00- file wins over 50-cloud-init.conf)" test "$(effective passwordauthentication)" = no
check "effective KbdInteractiveAuthentication is 'no'" test "$(effective kbdinteractiveauthentication)" = no
check "effective PermitRootLogin is 'prohibit-password'" test "$(effective permitrootlogin)" = without-password -o "$(effective permitrootlogin)" = prohibit-password
check "sshd -t accepts the configuration" "$SSHD_BIN" -t -f "$T/etc/ssh/sshd_config"
check "undo removes the file" bash -c "'$DEPLOY_DIR/evcar.sh' harden-ssh --undo && test ! -e '$T/etc/ssh/sshd_config.d/00-evcar-hardening.conf' && test \"\$('$SSHD_BIN' -T -f '$T/etc/ssh/sshd_config' | awk '\$1 == \"passwordauthentication\" { print \$2 }')\" = yes"

echo "PermitRootLogin no" >"$T/etc/ssh/sshd_config.d/10-admin.conf"
check "an existing stricter PermitRootLogin no is kept" bash -c "'$DEPLOY_DIR/evcar.sh' harden-ssh --yes && ! grep -q PermitRootLogin '$T/etc/ssh/sshd_config.d/00-evcar-hardening.conf'"
check "... effective PermitRootLogin stays 'no'" test "$(effective permitrootlogin)" = no

sed -i '/^Include /d' "$T/etc/ssh/sshd_config"
rm -f "$T/etc/ssh/sshd_config.d/00-evcar-hardening.conf"
expect_fail "refuses when sshd_config does not include sshd_config.d" "$DEPLOY_DIR/evcar.sh" harden-ssh --yes
