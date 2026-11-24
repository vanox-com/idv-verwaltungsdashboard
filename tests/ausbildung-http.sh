#!/usr/bin/env bash
set -euo pipefail
# Synthetic authenticated integration test, no real accounts or personal data.
base=http://127.0.0.1:18762
temp="$(mktemp -d)"
server=""
cleanup(){ if [[ -n "$server" ]];then kill "$server" 2>/dev/null || :;fi;rm -rf "$temp"; }
trap cleanup EXIT
hash="$(php -r 'echo password_hash("Leader-Test-2026!",PASSWORD_BCRYPT);')"
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern,gesperrt) VALUES('TLEAD','Synthetic Training Lead','Ausbildungsleitung','$hash',0,0)"
MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_DATABASE=idv_train_ci MYSQL_USER=root MYSQL_PASSWORD=training-ci-password php -S 127.0.0.1:18762 -t public public/api.php >"$temp/php.log" 2>&1 &
server="$!"
for i in $(seq 1 40);do curl -sS "$base/api/me" >/dev/null 2>&1 && break;sleep .25;done
req(){ local cookie="$1" method="$2" path="$3" data=""
 if [[ $# -ge 4 ]];then data="$4";fi
 if [[ "$method" == "GET" ]];then curl -sS -b "$cookie" "$base$path"
 else curl -sS -b "$cookie" -H 'Content-Type: application/json' -X "$method" --data "$data" "$base$path";fi
}
parse(){ php -r '$d=json_decode(stream_get_contents(STDIN),true);echo $d[$argv[1]]??"";' "$1"; }
revision(){ req "$temp/lead" GET "/api/ausbildung/anwaerter/$1" | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo $d["anwaerter"]["revision"]??"";'; }
status(){ req "$temp/lead" GET "/api/ausbildung/anwaerter/$1" | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo $d["fortschritt"]["status"]??"";'; }
lead="$(curl -sS -c "$temp/lead" -H 'Content-Type: application/json' -X POST --data '{"dienstnummer":"TLEAD","passwort":"Leader-Test-2026!"}' "$base/api/login")"
[[ "$lead" == *'"ok":true'* ]] || { echo "$lead";cat "$temp/php.log";exit 1; }
trainer='{"dienstnummer":"TRAIN1","name":"Synthetic Ausbilder","kuerzel":"SA","rang":"Test-Rang","funktion":"Ausbilder mittlerer Dienst","eintritt":"2026-11-24","email":"","notiz":"","kompetenzen":["PM.0","PM.1","PM.2","PM.3","PM.4","PM.5","PM.6"],"startpasswort":"Trainer-Test-2026!"}'
created="$(req "$temp/lead" POST /api/ausbildung/ausbilder "$trainer")"
[[ "$created" == *'"ok":true'* ]] || { echo "$created";cat "$temp/php.log";exit 1; }
login="$(curl -sS -c "$temp/trainer" -H 'Content-Type: application/json' -X POST --data '{"dienstnummer":"TRAIN1","passwort":"Trainer-Test-2026!"}' "$base/api/login")"
[[ "$login" == *'"mussPasswortAendern":true'* ]] || { echo "$login";exit 1; }
pass="$(req "$temp/trainer" POST /api/passwort '{"alt":"Trainer-Test-2026!","neu":"Trainer-New-2026!"}')"
[[ "$pass" == *'"ok":true'* ]] || { echo "$pass";exit 1; }
code="$(curl -sS -o "$temp/restricted" -w '%{http_code}' -b "$temp/trainer" "$base/api/bootstrap")"
[[ "$code" == 403 ]] || { echo "Police data leak: $code";exit 1; }
code="$(curl -sS -o "$temp/restricted" -w '%{http_code}' -b "$temp/trainer" -H 'Content-Type: application/json' -X POST --data "$trainer" "$base/api/ausbildung/ausbilder")"
[[ "$code" == 403 ]] || { echo "Privilege escalation: $code";exit 1; }
candidate="$(req "$temp/lead" POST /api/ausbildung/anwaerter '{"name":"Synthetic Anwärter","laufbahn":"PMA","personalnummer":999997,"beginn":"2026-11-24","nebenberuf":"","bemerkung":""}')"
id="$(printf '%s' "$candidate" | parse id)"
[[ "$id" =~ ^[0-9]+$ ]] || { echo "Trainee create: $candidate";exit 1; }
[[ "$(status "$id")" == 'Module unvollständig' ]] || exit 1
for module in PM.0 PM.1 PM.2 PM.3 PM.4 PM.5 PM.6;do
 rev="$(revision "$id")"
 answer="$(req "$temp/trainer" PUT "/api/ausbildung/anwaerter/$id/modul/$module" "{\"abgeschlossen\":true,\"revision\":$rev}")"
 [[ "$answer" == *'"ok":true'* ]] || { echo "$module: $answer";cat "$temp/php.log";exit 1; }
done
[[ "$(status "$id")" == 'Nicht bereit' ]] || exit 1
rev="$(revision "$id")"
vote="$(req "$temp/trainer" PUT "/api/ausbildung/anwaerter/$id/stimme" "{\"stimme\":\"Ja\",\"revision\":$rev}")"
[[ "$vote" == *'"ok":true'* ]] || { echo "$vote";exit 1; }
rev="$(revision "$id")"
vote="$(req "$temp/lead" PUT "/api/ausbildung/anwaerter/$id/stimme" "{\"stimme\":\"Ja\",\"revision\":$rev}")"
[[ "$vote" == *'"ok":true'* ]] || { echo "$vote";exit 1; }
[[ "$(status "$id")" == 'Zugelassen' ]] || { echo "Status: $(status "$id")";exit 1; }
code="$(curl -sS -o "$temp/conflict" -w '%{http_code}' -b "$temp/trainer" -H 'Content-Type: application/json' -X PUT --data "{\"abgeschlossen\":false,\"revision\":$rev}" "$base/api/ausbildung/anwaerter/$id/modul/PM.0")"
[[ "$code" == 409 ]] || { echo "Stale edit accepted: $code";exit 1; }
link="$(req "$temp/lead" POST "/api/ausbildung/anwaerter/$id/link" '{}')"
token="$(printf '%s' "$link" | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo explode("#",$d["pfad"]??"")[1]??"";')"
[[ "$token" =~ ^[a-f0-9]{64}$ ]] || { echo "Link: $link";exit 1; }
public="$(curl -sS -H 'Content-Type: application/json' -X POST --data "{\"token\":\"$token\"}" "$base/api/ausbildung-extern/status")"
[[ "$public" == *'"status":"Zugelassen"'* ]] && [[ "$public" != *'Synthetic Anwärter'* ]] && [[ "$public" != *'anzeigename'* ]] || { echo "Public API error: $public";exit 1; }
req "$temp/lead" DELETE "/api/ausbildung/anwaerter/$id/link" '{}' >/dev/null
code="$(curl -sS -o "$temp/revoked" -w '%{http_code}' -H 'Content-Type: application/json' -X POST --data "{\"token\":\"$token\"}" "$base/api/ausbildung-extern/status")"
[[ "$code" == 404 ]] || { echo "Public link active: $code";exit 1; }
trainerId="$(req "$temp/lead" GET /api/ausbildung/bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo $d["ausbilder"][0]["id"]??"";')"
req "$temp/lead" DELETE "/api/ausbildung/ausbilder/$trainerId" '{}' >/dev/null
code="$(curl -sS -o "$temp/revokeduser" -w '%{http_code}' -b "$temp/trainer" "$base/api/me")"
[[ "$code" == 401 ]] || { echo "Trainer session still valid: $code";exit 1; }
echo 'Ausbildung HTTP tests passed: role isolation, trainer lifecycle, PMA score, revision, private link'
