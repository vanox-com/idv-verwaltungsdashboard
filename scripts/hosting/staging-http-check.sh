#!/usr/bin/env bash
set -euo pipefail
# Unauthenticated read-only acceptance checks on a separate HTTPS staging host.
if [[ $# -ne 1 ]];then
 echo "Usage: bash scripts/hosting/staging-http-check.sh https://staging.example.com" >&2
 exit 2
fi
origin="$(printf '%s' "$1" | sed 's@/$@@')"
# Reject paths, query, credentials and the known production addresses.
if [[ ! "$origin" =~ ^https://[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+(:[0-9]{1,5})?$ ]];then
 echo "Expected exact HTTPS origin of a separate staging hostname" >&2;exit 2
fi
host="$(printf '%s' "$origin" | sed -E 's@^https://@@;s@:[0-9]+$@@' | tr '[:upper:]' '[:lower:]')"
case "$host" in
 idv-ppverwaltung.de|*.idv-ppverwaltung.de|idv-verwaltungsdashboard-1.onrender.com|*.onrender.com|localhost|*.localhost|*.local|*.internal|*.test)
   echo "Production or test-only host is forbidden for the external staging probe" >&2;exit 2;;
esac
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

check(){
 local path="$1" expected="$2" type="" status mime
 if [[ $# -ge 3 ]];then type="$3";fi
 # curl verifies TLS certificates by default; redirects are never followed.
 status="$(curl --silent --show-error --max-time 15 --connect-timeout 6 \
   --max-redirs 0 -D "$tmp/headers" -o "$tmp/body" -w '%{http_code}' \
   "$origin$path")"
 if [[ "$status" != "$expected" ]];then
  echo "FAIL $path: expected HTTP $expected, received $status" >&2;exit 1
 fi
 if [[ -n "$type" ]];then
   mime="$(tr -d '\r' < "$tmp/headers" | grep -i '^content-type:' | tail -n 1 | tr '[:upper:]' '[:lower:]')"
   if [[ "$mime" != *"$type"* ]];then
      echo "FAIL $path: unexpected Content-Type" >&2;exit 1
   fi
 fi
 echo "OK $path ($status)"
}

check '/' 200 'text/html'
check '/dokumentUI.js' 200 'javascript'
# Deny anonymous access and reject a misleading "200 index.html" API fallback.
for path in /api/me /api/bootstrap /api/dokumentgenerator/status /api/users /api/changes /api/copnet/1;do
 check "$path" 401 'application/json'
 if ! jq -e '.error|type=="string"' "$tmp/body" >/dev/null;then
   echo "FAIL $path: API returned no structured auth error" >&2;exit 1
 fi
 headers="$(tr -d '\r' < "$tmp/headers" | tr '[:upper:]' '[:lower:]')"
 for header in 'cache-control:' 'x-content-type-options:' 'x-frame-options:';do
   if [[ "$headers" != *"$header"* ]];then
     echo "FAIL $path: missing security header $header" >&2;exit 1
   fi
 done
done
# No private file should be served, redirected or replaced with index.html.
for path in /php/Api.php /src/server.js /src/schema.sql /.git/config /.env \
 /HOSTING-SETUP.md /scripts/hosting/preflight.php \
 /scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql /migration-output/private.sql;do
 status="$(curl --silent --show-error --max-time 12 --connect-timeout 6 \
   --max-redirs 0 -o /dev/null -w '%{http_code}' "$origin$path")"
 if [[ "$status" != 403 && "$status" != 404 ]];then
  echo "FAIL private path $path: expected HTTP 403/404, got $status" >&2;exit 1
 fi
 echo "OK private path $path ($status)"
done
# CSRF origin guard must fire before a login attempt can affect any account.
status="$(curl --silent --show-error --max-time 12 --connect-timeout 6 \
 --max-redirs 0 -X POST -H 'Origin: https://unrelated.invalid' \
 -H 'Content-Type: application/json' --data '{}' \
 -o /dev/null -w '%{http_code}' "$origin/api/login")"
if [[ "$status" != 403 ]];then
 echo "FAIL cross-origin login: expected HTTP 403, got $status" >&2;exit 1
fi
echo "OK cross-origin login blocked (403)"
echo "Anonymous staging checks PASSED (not a production release approval)."
