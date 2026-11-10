#!/usr/bin/env bash
set -euo pipefail
# A deterministic lockout regression against disposable, isolated CI MySQL only.
base="http://127.0.0.1:8777"
if [[ $# -gt 0 ]];then base="$1";fi
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
for i in $(seq 1 30); do
  status="$(curl -sS --max-time 8 -o "$temp/answer" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d '{"dienstnummer":"999999","passwort":"synthetic-unknown-account"}' \
    "$base/api/login")"
  if [[ "$status" != "401" ]];then
    echo "Expected 30 incorrect-password 401 outcomes; attempt $i returned $status" >&2
    cat "$temp/answer" >&2;exit 1
  fi
done
blocked="$(curl -sS --max-time 8 -o "$temp/answer" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d '{"dienstnummer":"999999","passwort":"synthetic-unknown-account"}' \
  "$base/api/login")"
if [[ "$blocked" != "429" ]];then
 echo "IP lockout not enforced after 30 login failures: $blocked" >&2;exit 1
fi
# A correct password must not bypass an active shared 5-minute rate limit.
blocked="$(curl -sS --max-time 8 -o "$temp/answer" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d '{"dienstnummer":"00","passwort":"only-ci-example-not-live"}' \
  "$base/api/login")"
if [[ "$blocked" != "429" ]];then
 echo "Valid login bypassed active failed-login rate limit: $blocked" >&2;exit 1
fi
echo "Login brute-force protection: 30 failures → shared 429 lockout OK"
