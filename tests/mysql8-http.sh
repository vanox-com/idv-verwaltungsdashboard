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
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8777 -t public public/api.php >"$tmp/php-server.log" 2>&1 &
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
jq -e '.daten.dashboard.beschaeftigung.summen.gesamt >= 1 and
  (.daten.dashboard.beschaeftigung.gruppen | type=="array") and
  (.daten.dashboard.statusverteilung | type=="array") and
  (.daten.dashboard.kuendigungen | not)' "$tmp/body" >/dev/null || {
    echo "Bootstrap dashboard contract incomplete" >&2; cat "$tmp/body" >&2; exit 1;
  }
check GET /api/users 200
check GET /api/personal/freie-nummern 200
jq -e '(.nebenberuf | index(50)) != null and (.hauptberuf | index(49)) != null
      and (.hauptberuf | index(50)) == null' "$tmp/body" >/dev/null || {
   echo "Service number 50–60 employment mapping invalid" >&2; cat "$tmp/body" >&2; exit 1;
}
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
# Full feature smoke on disposable synthetic MySQL data.
check GET /api/akten/1/laufbahn 200
check GET /api/aenderungsvergleich 200
check GET /api/papierkorb 200
check GET /api/kuendigungen/archiv 200
check GET /api/routine/1/archiv 200
check GET /api/rangantraege 200
check GET /api/rangantraege/historie 200
check GET /api/por/offen 200
check GET /api/befricht 200
check GET /api/dienstnummer-antraege 200
check GET /api/dokumentgenerator/status 200
check GET /api/dokumentgenerator/archiv 200
check GET /api/urkunden/status 200
check PATCH /api/befricht/Polizeimeisteranw%C3%A4rter 200 '{"tage":null,"bemerkung":"Testregel","grund":"Prüfungsbasiert"}'
check PATCH /api/disziplin/1 200 '{"slots":[null,null,null,null,null,null],"bemerkung":"Test only"}' 0
check PATCH /api/sonder/1 200 '{"werte":{},"leitung":"Tester","sonstige":""}' 0
check PATCH /api/bef/pruefung/1 200 '{"bestanden":true}'
check POST /api/rangantraege 200 '{"personalnummer":1,"beantragter_rang":"Polizeimeister","begruendung":"Testantrag"}'
check POST /api/rangantraege/1/entscheidung 200 '{"genehmigt":false}'
check PATCH /api/por/1 200 '{"status":"genehmigt","datum":"2026-11-10","notiz":"Geprüft"}'
check POST /api/befoerdern 200 '{"nr":1}'
check POST /api/routine/1/anwesenheit 200 '{"nr":1,"tagIndex":0,"anwesend":true}' 1
check POST /api/routine/1/archiv 200 '{"datum":"2026-11-04"}'
check GET /api/routine/1/archiv 200
check POST /api/routine/1/archiv/1/wiederherstellen 200 '{}'
check POST /api/kuendigung 200 '{"nr":1,"vorname":"Test","nachname":"Person","rang":"PM","grund":"CI Test"}'
check GET /api/kuendigungen/1/akte 200
check PATCH /api/kuendigung/1 200 '{"waffe":"Informiert"}' 1
check POST /api/dienstnummer-antraege 201 '{"alt_nr":1,"ziel_nr":3,"art":"personal","begruendung":"Test ordnungsgemaesser Wechsel"}'
dn_request_id="$(jq -r '.id' "$tmp/body")"
check GET /api/dienstnummer-antraege 200
check POST "/api/dienstnummer-antraege/$dn_request_id/entscheidung" 200 '{"status":"genehmigt","notiz":"Freigabe zum Test"}'
check GET /api/akten/3/laufbahn 200
check GET /api/aenderungsvergleich 200
jq -e 'any(.[]; .bereich=="personal" and .benutzer=="Test admin" and
   (.details | type=="array"))' "$tmp/body" >/dev/null || {
   echo "Authenticated actor not recorded in MySQL audit journal" >&2;cat "$tmp/body" >&2;exit 1;
}
# Method/path contract for all 103 original Node APIs, including protected routes.
# This runs only against this disposable MySQL CI fixture.
bash tests/mysql8-api-routes.sh "$tmp/cookies" "http://127.0.0.1:8777"
# Stateful workflows catch bugs that route-only probes do not.
bash tests/mysql8-functional-flows.sh "$tmp/cookies" "http://127.0.0.1:8777"
# Two independent authenticated sessions racing on the same personnel revision.
# One update must commit; the other must receive 409 without overwriting.
check GET /api/bootstrap 200
person_revision="$(jq -r '.daten.personal[] | select(.personalnummer==2) | ._revision' "$tmp/body")"
if [[ ! "$person_revision" =~ ^[0-9]+$ ]]; then echo "Missing person revision for race" >&2;exit 1;fi
curl -sS -c "$tmp/cookie2" -o "$tmp/login2" -X POST -H "Content-Type: application/json" \
  -d '{"dienstnummer":"00","passwort":"only-ci-example-not-live"}' http://127.0.0.1:8777/api/login
if ! jq -e '.ok==true' "$tmp/login2" >/dev/null; then echo "Second session login failed" >&2;exit 1;fi
curl -sS -b "$tmp/cookies" -X PATCH -H "Content-Type: application/json" -H "If-Match: $person_revision" \
  -d '{"nachname":"Race-A"}' -o "$tmp/bodyA" -w '%{http_code}' \
  http://127.0.0.1:8777/api/personal/2 >"$tmp/statusA" &
pidA=$!
curl -sS -b "$tmp/cookie2" -X PATCH -H "Content-Type: application/json" -H "If-Match: $person_revision" \
  -d '{"nachname":"Race-B"}' -o "$tmp/bodyB" -w '%{http_code}' \
  http://127.0.0.1:8777/api/personal/2 >"$tmp/statusB" &
pidB=$!
wait "$pidA";wait "$pidB"
statusA="$(cat "$tmp/statusA")";statusB="$(cat "$tmp/statusB")"
if [[ ! ( "$statusA" == "200" && "$statusB" == "409" ) &&
      ! ( "$statusA" == "409" && "$statusB" == "200" ) ]]; then
  echo "Parallel revisions not protected: $statusA / $statusB" >&2
  cat "$tmp/bodyA" "$tmp/bodyB" >&2; exit 1
fi
check GET /api/bootstrap 200
jq -e --argjson rev "$person_revision" '(.daten.personal[] |
   select(.personalnummer==2) | (.nachname=="Race-A" or .nachname=="Race-B") and
   ((._revision|tonumber) > $rev))' "$tmp/body" >/dev/null || {
  echo "Concurrent person edit did not commit exactly once" >&2;cat "$tmp/body" >&2;exit 1;
}
echo "Concurrent personnel version race: 200 + 409 confirmed"
# Stream must notify other sessions about the committed MySQL audit/log change.
check GET /api/bootstrap 200
next_revision="$(jq -r '.daten.personal[] | select(.personalnummer==2) | ._revision' "$tmp/body")"
curl -sS -N --max-time 9 -b "$tmp/cookie2" \
  http://127.0.0.1:8777/api/changes >"$tmp/sse.log" 2>"$tmp/sse.err" &
ssepid=$!
ready=false
for attempt in {1..30}; do
  if grep -q ': verbunden' "$tmp/sse.log" 2>/dev/null; then ready=true;break;fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  echo "SSE subscription did not establish" >&2
  cat "$tmp/sse.err" >&2;kill "$ssepid" 2>/dev/null || true;exit 1
fi
check PATCH /api/personal/2 200 '{"nachname":"SSE-Confirmed"}' "$next_revision"
notified=false
for attempt in {1..35}; do
  if grep -q 'event: aktualisierung' "$tmp/sse.log" 2>/dev/null; then notified=true;break;fi
  sleep 0.15
done
kill "$ssepid" 2>/dev/null || true
wait "$ssepid" 2>/dev/null || true
if [[ "$notified" != true ]]; then
  echo "MySQL SSE notifications did not reach another authenticated session" >&2
  cat "$tmp/sse.log" >&2;exit 1
fi
echo "Cross-session MySQL SSE update received"

# Replace admin session with the restricted PoliceRat account.
check POST /api/logout 200
check POST /api/login 200 '{"dienstnummer":"04","passwort":"rat-ci-example-not-live"}'
check GET /api/bootstrap 200
jq -e '.user.rolle=="Polizeirat" and
    (.daten.personal | all(.[]; (has("geburtsdatum")|not) and (has("handy")|not)
       and (has("ernennungsurkunde_url")|not)))' "$tmp/body" >/dev/null || {
   echo "Restricted bootstrap leaked confidential personnel data" >&2;cat "$tmp/body" >&2;exit 1;
}
revision="$(jq -r '.daten.routine[0]._revision' "$tmp/body")"
check POST /api/routine/1/termin 200 '{"datum":"2026-11-09"}' "$revision"
check PATCH /api/por/3 200 '{"status":"beantragt","notiz":"Antrag vom Rat"}'
check PATCH /api/por/3 403 '{"status":"genehmigt","notiz":"Nicht erlaubt"}'
check GET /api/personal/freie-nummern 403
check POST /api/rangantraege 403 '{"personalnummer":3,"beantragter_rang":"Polizeimeister","begruendung":"Unzulässig"}'
check GET /api/urkunden/status 403
check GET /api/kuendigungen/1/akte 403
check POST /api/logout 200
check GET /api/me 401
echo "Real MySQL 8 + PHP HTTP integration smoke succeeded."
