#!/usr/bin/env bash
set -euo pipefail
# Probe only a SEPARATE HTTPS staging origin, never the production IDV site.
if [[ $# -ne 1 ]];then
 echo "Usage: bash scripts/hosting/staging-http-check.sh https://staging.example.test" >&2;exit 2
fi
origin="$(printf '%s' "$1" | sed 's@/$@@')"
if [[ ! "$origin" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] ||
 [[ "$origin" == "https://idv-ppverwaltung.de" ]] ||
 [[ "$origin" == "https://www.idv-ppverwaltung.de" ]];then
 echo "Only a separate HTTPS staging origin is allowed" >&2;exit 2
fi
status(){ curl --silent --show-error --max-time 12 -o /dev/null -w '%{http_code}' "$origin$1"; }
for path in / /dokumentUI.js;do
 code="$(status "$path")"
 if [[ "$code" != "200" ]];then echo "Public asset $path returned $code" >&2;exit 1;fi
done
for path in /api/me /api/bootstrap /api/dokumentgenerator/status;do
 code="$(status "$path")"
 if [[ "$code" != "401" ]];then
  echo "Unauthenticated API $path returned $code instead of 401" >&2;exit 1
 fi
done
for path in /php/Api.php /src/schema.sql /scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql /.env /migration-output/private.sql;do
 code="$(status "$path")"
 if [[ "$code" == "200" || "$code" == "206" ]];then
  echo "STAGING LEAK: private file accessible at $path" >&2;exit 1
 fi
done
echo "Staging HTTPS, anonymous API, static assets and private-path isolation OK"
echo "Authenticated Google popup, certificate, CopNet and session-cookie tests remain manual."
