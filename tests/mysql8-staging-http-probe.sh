#!/usr/bin/env bash
set -euo pipefail
# CI makes no real network requests: curl is replaced by a deterministic stub.
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat >"$work/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
headers="";body="";url=""
while [[ $# -gt 0 ]];do
 case "$1" in
  -D|-o|-w|-H|--max-time|--connect-timeout|--max-redirs|-X|--data)
    opt="$1";val="$2";shift 2
    case "$opt" in -D)headers="$val";; -o)body="$val";; esac;;
  --silent|--show-error)shift;;
  http*)url="$1";shift;;
  *) echo "Unexpected mock curl argument: $1" >&2;exit 33;;
 esac
done
printf '%s\n' "$url" >> "$STAGING_MOCK_LOG"
path="$(printf '%s' "$url" | sed -E 's@^https://[^/]+@@')"
code=404;type=text/html;payload='<html>not found</html>'
case "$path" in
  /)code=200;payload='<html>login</html>';;
  /dokumentUI.js)code=200;type=application/javascript;payload='window.example=true';;
  /api/login)code=403;type=application/json;payload='{"error":"Ungültiger Anfrageursprung"}';;
  /api/*)code=401;type=application/json;payload='{"error":"Nicht angemeldet"}';;
esac
if [[ "$STAGING_MOCK_LEAK" == 1 && "$path" == /php/Api.php ]];then
 code=200;type=text/html;payload='<html>leak</html>'
fi
if [[ -n "$headers" ]];then
 {
  printf 'HTTP/1.1 %s\r\nContent-Type: %s\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n' "$code" "$type"
  if [[ "$STAGING_MOCK_WEAK_HEADERS" != 1 ]];then
   printf 'X-Frame-Options: DENY\r\n'
  fi
  printf '\r\n'
 } >"$headers"
fi
if [[ -n "$body" ]];then printf '%s' "$payload" >"$body";fi
printf '%s' "$code"
MOCK
chmod +x "$work/curl"
export PATH="$work:$PATH"
export STAGING_MOCK_LOG="$work/requests"
export STAGING_MOCK_LEAK=0 STAGING_MOCK_WEAK_HEADERS=0
: >"$STAGING_MOCK_LOG"

for target in \
 https://idv-ppverwaltung.de \
 https://staging.idv-ppverwaltung.de \
 https://idv-verwaltungsdashboard-1.onrender.com \
 http://staging.example.com \
 https://staging.example.com/extra \
 'https://staging.example.com?redirect=1' \
 https://127.0.0.1 \
 https://staging.example.test;do
 set +e
 bash "$root/scripts/hosting/staging-http-check.sh" "$target" >"$work/out" 2>&1
 rc=$?
 set -e
 if [[ "$rc" != 2 ]];then
  echo "Invalid origin unexpectedly accepted: $target (status $rc)" >&2;exit 1
 fi
done
test ! -s "$STAGING_MOCK_LOG" || { echo "Forbidden origin made an HTTP request" >&2;exit 1; }
echo "Forbidden and malformed staging origins rejected before HTTP OK"

bash "$root/scripts/hosting/staging-http-check.sh" https://staging.example.com >"$work/normal"
grep -q "Anonymous staging checks PASSED" "$work/normal"
grep -q 'https://staging.example.com/api/me' "$STAGING_MOCK_LOG"
echo "Full synthetic HTTPS staging acceptance flow OK"

for fault in LEAK WEAK_HEADERS;do
 set +e
 if [[ "$fault" == LEAK ]];then
   STAGING_MOCK_LEAK=1 bash "$root/scripts/hosting/staging-http-check.sh" https://staging.example.com >"$work/fail" 2>&1
 else
   STAGING_MOCK_WEAK_HEADERS=1 bash "$root/scripts/hosting/staging-http-check.sh" https://staging.example.com >"$work/fail" 2>&1
 fi
 rc=$?
 set -e
 if [[ "$rc" == 0 ]];then
  echo "Security fault $fault was not rejected" >&2;exit 1
 fi
done
echo "Private-file disclosure and missing headers detected by staging probe OK"
