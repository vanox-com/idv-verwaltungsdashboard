#!/usr/bin/env bash
set -euo pipefail
# Integration suite against synthetic CI-only MySQL fixtures.
# Never use this script with the production database.
tmp="$(mktemp -d)"
server=""
cleanup() {
  if [[ -n "$server" ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
php -S 127.0.0.1:8777 -t public public/api.php >"$tmp/php-server.log" 2>&1 &
server=$!
for i in {1..50}; do
  if curl -s -o /dev/null http://127.0.0.1:8777/api/me; then break; fi
  sleep 0.2
done
check() {
  local method="$1" uri="$2" expected="$3" payload="${4:-}" match="${5:-}"
  local status
  local args=(-sS -X "$method" -H "Content-Type: application/json" -c "$tmp/cookies" -b "$tmp/cookies" -o "$tmp/body" -w '%{http_code}')
  if [[ -n "$payload" ]]; then args+=(-d "$payload"); fi
  if [[ -n "$match" ]]; then args+=(-H "If-Match: $match"); fi
  status="$(curl "${args[@]}" "http://127.0.0.1:8777$uri")"
  if [[ "$status" != "$expected" ]]; then
    echo "Expected $expected, got $status for $method $uri" >&2
    cat "$tmp/body" >&2
    cat "$tmp/php-server.log" >&2
    exit 1
  fi
  if ! jq -e 'type=="object" or type=="array"' "$tmp/body" >/dev/null; then
    echo "Malformed API JSON response for $method $uri" >&2
    cat "$tmp/body" >&2
    exit 1
  fi
  echo "HTTP $status $method $uri"
}
check GET /api/me 401
check POST /api/login 200 '{"dienstnummer":"00","passwort":"only-ci-example-not-live"}'
check GET /api/me 200
check GET /api/bootstrap 200
check GET /api/users 200
check GET /api/personal/freie-nummern 200
check GET /api/personalstatistik 200
check GET /api/backup-status 200
check GET /api/personalentwicklung 200
check GET /api/rechtesimulator 200
check GET /api/geburtstage 200
check GET /api/dienstjubilaeen 200
check GET /api/mitteilungen 200
check GET /api/mitteilungen/empfaenger 200
check GET /api/mitteilungen/verwaltung 200
check GET /api/textbausteine 200
check GET /api/organigramm 200
longurl="https://example.test/$(printf 'a%.0s' {1..380})"
check POST /api/personal 200 '{"personalnummer":2,"vorname":"HTTP","nachname":"Fixture","gruppe":"Mittlerer Dienst","status":"Aktiv","beschaeftigungsart":"Hauptberuf","arbeitsvertrag_url":"'"$longurl"'"}'
check PATCH /api/personal/2 200 '{"nachname":"Fixture2"}' 1
check PATCH /api/personal/2 409 '{"nachname":"Stale update"}' 1
check POST /api/checklisten 201 '{"name":"API test list","aufgaben":[{"t":"First","u":""}]}'
check PUT /api/organigramm 200 '{"version":0,"inhalt":{"leitung":"Test","raete":[],"bereiche":[]}}'
check PUT /api/organigramm 409 '{"version":0,"inhalt":{"leitung":"Wrong","raete":[],"bereiche":[]}}'
check POST /api/textbausteine 201 '{"kategorie":"Test","titel":"Test template","inhalt":"Only CI data"}'
check POST /api/mitteilungen 200 '{"titel":"CI news","inhalt":"Only test","userIds":[1]}'
longsecret="$(printf 'X%.0s' {1..480})"
check PUT /api/copnet/1 200 '{"dienstnummer":"CIN-1","passwort":"'"$longsecret"'"}'
check GET /api/copnet/1 200
if ! jq -e --arg p "$longsecret" '.passwort==$p' "$tmp/body" >/dev/null; then
  echo "CopNet ciphertext failed 480-byte encryption roundtrip" >&2
  exit 1
fi
check POST /api/logout 200
check GET /api/me 401
echo "Real MySQL 8 + PHP HTTP integration smoke succeeded."
