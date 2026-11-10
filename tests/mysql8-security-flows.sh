#!/usr/bin/env bash
set -euo pipefail
# Always use ONLY a disposable local PHP server with synthetic CI MySQL records.
base="http://127.0.0.1:8777"
admin="/tmp/idv-synthetic-admin"
if [[ $# -ge 1 ]];then admin="$1";fi
if [[ $# -ge 2 ]];then base="$2";fi
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
call(){
 local cookie="$1" method="$2" route="$3" expected="$4" payload="" revision="" status
 if [[ $# -ge 5 ]];then payload="$5";fi
 if [[ $# -ge 6 ]];then revision="$6";fi
 if [[ -n "$payload" && -n "$revision" ]];then
   status="$(curl -sS --max-time 12 -X "$method" -b "$cookie" -c "$cookie" -H "Content-Type: application/json" -H "If-Match: $revision" -d "$payload" -o "$dir/body" -w '%{http_code}' "$base$route")"
 elif [[ -n "$payload" ]];then
   status="$(curl -sS --max-time 12 -X "$method" -b "$cookie" -c "$cookie" -H "Content-Type: application/json" -d "$payload" -o "$dir/body" -w '%{http_code}' "$base$route")"
 else
   status="$(curl -sS --max-time 12 -X "$method" -b "$cookie" -c "$cookie" -o "$dir/body" -w '%{http_code}' "$base$route")"
 fi
 if [[ "$status" != "$expected" ]];then
   echo "Security test: $method $route expected $expected, got $status" >&2;cat "$dir/body" >&2;exit 1
 fi
 jq -e 'type=="object" or type=="array"' "$dir/body" >/dev/null || exit 1
}
# Never expose authenticated data anonymously.
call "$dir/anonymous" GET /api/me 401
call "$dir/anonymous" GET /api/users 401
call "$dir/anonymous" GET /api/bootstrap 401

# A role not explicitly authorized for the police dashboard must be denied,
# even when the password is valid; a locked account must be denied as well.
call "$dir/guest" POST /api/login 403 '{"dienstnummer":"12","passwort":"ci-leader-secret-123"}'
call "$dir/locked" POST /api/login 403 '{"dienstnummer":"13","passwort":"ci-leader-secret-123"}'
call "$dir/guest" GET /api/me 401
call "$dir/locked" GET /api/me 401

# An account with password-change-required must not read the dashboard.
call "$dir/gate" POST /api/login 200 '{"dienstnummer":"14","passwort":"ci-leader-secret-123"}'
jq -e '.mussPasswortAendern==true' "$dir/body" >/dev/null
call "$dir/gate" GET /api/me 401
call "$dir/gate" GET /api/bootstrap 401
call "$dir/gate" POST /api/passwort 200 '{"alt":"ci-leader-secret-123","neu":"ci-gate-new-password-456"}'
call "$dir/gate" GET /api/me 200
call "$dir/gate" POST /api/logout 200

# Two independent leadership sessions plus a separate PoliceRat account.
call "$dir/leader1" POST /api/login 200 '{"dienstnummer":"05","passwort":"ci-leader-secret-123"}'
call "$dir/leader2" POST /api/login 200 '{"dienstnummer":"05","passwort":"ci-leader-secret-123"}'
call "$dir/council" POST /api/login 200 '{"dienstnummer":"04","passwort":"rat-ci-example-not-live"}'
call "$dir/leader1" GET /api/bootstrap 200
jq -e '.user.rolle=="Leitungsdienst" and
  (.daten.personal|all(.[]; (has("geburtsdatum")|not) and (has("handy")|not)
      and (has("arbeitsvertrag_url")|not)))' "$dir/body" >/dev/null || {
   echo "Leadership account leaked sensitive personnel fields" >&2;exit 1;
 }
personrev="$(jq -r '.daten.personal[]|select(.personalnummer==2)|._revision' "$dir/body")"
[[ "$personrev" =~ ^[0-9]+$ ]] || { echo "Person revision missing" >&2;exit 1; }
call "$dir/leader1" GET /api/users 403
call "$dir/leader1" GET /api/backup-status 403
call "$dir/leader1" GET /api/kuendigungen/1/akte 403
call "$dir/leader1" PATCH /api/personal/2 403 '{"handy":"private-ci-example"}' "$personrev"
call "$dir/leader1" GET /api/personal/freie-nummern 200
call "$dir/leader1" PATCH /api/por/3 403 '{"status":"genehmigt"}'
call "$dir/council" GET /api/users 403
call "$dir/council" GET /api/personal/freie-nummern 403
call "$dir/council" PATCH /api/disziplin/2 403 '{"slots":[null,null,null,null,null,null],"bemerkung":"no"}' 0

# CSRF: cross-site requests, and requests with a forged Origin, must be blocked.
origin_status="$(curl -sS -X PATCH -b "$dir/leader1" -o "$dir/body" -w '%{http_code}' \
 -H 'Origin: https://attacker.example.invalid' -H 'Content-Type: application/json' \
 -H "If-Match: $personrev" -d '{"nachname":"forbidden"}' "$base/api/personal/2")"
[[ "$origin_status" == 403 ]] || { echo "Forged origin not rejected" >&2;exit 1; }
cross_status="$(curl -sS -X PATCH -b "$dir/leader1" -o "$dir/body" -w '%{http_code}' \
 -H 'Sec-Fetch-Site: cross-site' -H 'Content-Type: application/json' \
 -H "If-Match: $personrev" -d '{"nachname":"forbidden"}' "$base/api/personal/2")"
[[ "$cross_status" == 403 ]] || { echo "Cross-site Fetch-Metadata request not rejected" >&2;exit 1; }

# Two different roles racing to tick the same checklist item. Both are
# allowed to tick, but only ONE may save the same expected prior state.
call "$admin" POST /api/checklisten 201 '{"name":"CI security race","aufgaben":[{"t":"Race item","u":""}]}'
call "$dir/leader1" GET /api/bootstrap 200
revision="$(jq -r '.daten.checklisten[]|select(.name=="CI security race")|._revision' "$dir/body")"
[[ "$revision" =~ ^[0-9]+$ ]] || { echo "Checklist version missing" >&2;exit 1; }
curl -sS -X PATCH -b "$dir/leader1" -H 'Content-Type: application/json' -H "If-Match: $revision" \
 -d '{"erledigt":true,"erwartet":false}' -o "$dir/first" -w '%{http_code}' \
 "$base/api/checklisten/CI%20security%20race/punkte/0" >"$dir/status1" &
first=$!
curl -sS -X PATCH -b "$dir/council" -H 'Content-Type: application/json' -H "If-Match: $revision" \
 -d '{"erledigt":true,"erwartet":false}' -o "$dir/second" -w '%{http_code}' \
 "$base/api/checklisten/CI%20security%20race/punkte/0" >"$dir/status2" &
second=$!
wait "$first";wait "$second"
a="$(cat "$dir/status1")";b="$(cat "$dir/status2")"
if [[ ! ( "$a" == 200 && "$b" == 409 ) && ! ( "$a" == 409 && "$b" == 200 ) ]];then
 echo "Checklist race not protected: $a / $b" >&2
 cat "$dir/first" "$dir/second" >&2;exit 1
fi
call "$admin" GET /api/bootstrap 200
jq -e 'any(.daten.checklistenStatus[]; .name=="CI security race" and .punkt==0 and .erledigt==1)' "$dir/body" >/dev/null || {
  echo "Checklist race lost accepted completion" >&2;exit 1;
}
echo "Cross-role checklist race: one HTTP 200 and one HTTP 409 OK"

# A successful password change invalidates every other active session.
call "$dir/leader1" POST /api/passwort 200 '{"alt":"ci-leader-secret-123","neu":"ci-leader-new-password-456"}'
call "$dir/leader2" GET /api/me 401
call "$dir/leader1" GET /api/me 200
call "$dir/leader1" POST /api/logout 200
call "$dir/leader3" POST /api/login 200 '{"dienstnummer":"05","passwort":"ci-leader-new-password-456"}'
call "$dir/leader3" GET /api/me 200
call "$dir/council" POST /api/logout 200

# Lock the leader account from a separate Administrator session: other
# sessions must immediately be denied access, even without logout.
call "$admin" GET /api/users 200
leaderid="$(jq -r '.users[]|select(.dienstnummer=="05")|.id' "$dir/body")"
[[ "$leaderid" =~ ^[0-9]+$ ]] || { echo "Leadership user not found" >&2;exit 1; }
call "$admin" PATCH "/api/users/$leaderid" 200 '{"gesperrt":true}'
call "$dir/leader3" GET /api/me 401
call "$dir/leader3" GET /api/bootstrap 401
echo "Security matrix, CSRF, credentials and revoked sessions OK"
