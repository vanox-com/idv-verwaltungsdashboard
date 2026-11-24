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
# Existing police account with exactly the same displayed DN must not be touched.
hash_police="$(php -r 'echo password_hash("Original-Police-2026!",PASSWORD_BCRYPT);')"
# Minimal CI fixture does not always have every police role pre-seeded.
# This role is part of the fixture BEFORE Ausbildung account creation, not
# inserted by the real migration.
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "INSERT IGNORE INTO roles(name,farbe,sensibel) VALUES('Polizeirat','#6885a1',1)"
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern,gesperrt) VALUES('TRAIN1','Existing police user','Polizeirat','$hash_police',0,0)"
original_before="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "SELECT CONCAT_WS('::',id,dienstnummer,anzeigename,rolle,passwort_hash,gesperrt) FROM users WHERE dienstnummer='TRAIN1'")"
trainer='{"dienstnummer":"TRAIN1","name":"Synthetic Ausbilder","kuerzel":"SA","rang":"Test-Rang","funktion":"Ausbilder mittlerer Dienst","eintritt":"2026-11-24","email":"","notiz":"","kompetenzen":["PM.0","PM.1","PM.2","PM.3","PM.4","PM.5","PM.6"],"startpasswort":"Trainer-Test-2026!"}'
created="$(req "$temp/lead" POST /api/ausbildung/ausbilder "$trainer")"
[[ "$created" == *'"ok":true'* ]] || { echo "$created";cat "$temp/php.log";exit 1; }
original_after="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "SELECT CONCAT_WS('::',id,dienstnummer,anzeigename,rolle,passwort_hash,gesperrt) FROM users WHERE dienstnummer='TRAIN1'")"
[[ "$original_before" == "$original_after" ]] || { echo 'Existing police account was modified';exit 1; }
new_trainers="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "SELECT COUNT(*) FROM users WHERE dienstnummer='AUS-TRAIN1' AND rolle='Ausbilder'")"
[[ "$new_trainers" == 1 ]] || { echo 'Separate AUS- login was not created';exit 1; }
login="$(curl -sS -c "$temp/trainer" -H 'Content-Type: application/json' -X POST --data '{"dienstnummer":"AUS-TRAIN1","passwort":"Trainer-Test-2026!"}' "$base/api/login")"
[[ "$login" == *'"mussPasswortAendern":true'* ]] || { echo "$login";exit 1; }
pass="$(req "$temp/trainer" POST /api/passwort '{"alt":"Trainer-Test-2026!","neu":"Trainer-New-2026!"}')"
[[ "$pass" == *'"ok":true'* ]] || { echo "$pass";exit 1; }
# Training-only accounts get a minimum dashboard shell, never police records.
bootstrap="$(req "$temp/trainer" GET /api/bootstrap)"
[[ "$bootstrap" == *'"user"'* && "$bootstrap" == *'"dashboard"'* && "$bootstrap" != *'"personal"'* && "$bootstrap" != *'"kuendigungen"'* ]] || { echo "Police data leaked into training bootstrap: $bootstrap";exit 1; }
code="$(curl -sS -o "$temp/restricted" -w '%{http_code}' -b "$temp/trainer" "$base/api/users")"
[[ "$code" == 403 ]] || { echo "Trainer reached user administration: $code";exit 1; }
code="$(curl -sS -o "$temp/restricted" -w '%{http_code}' -b "$temp/trainer" -H 'Content-Type: application/json' -X POST --data "$trainer" "$base/api/ausbildung/ausbilder")"
[[ "$code" == 403 ]] || { echo "Privilege escalation: $code";exit 1; }
# Der normale Personalstamm ist maßgeblich – neue Dienstgrade erzeugen
# beim nächsten Monitor-Abruf automatisch verknüpfte Ausbildungsakten.
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "
 INSERT INTO personal(personalnummer,vorname,nachname,dienstgrad,status,beschaeftigungsart,eintrittsdatum)
 VALUES
 (999997,'Synthetic','Anwärter','Polizeimeisteranwärter','Aktiv','Hauptberuf','2026-11-24'),
 (999998,'Synthetic','PKA','Polizeikommissaranwärter','Aktiv','Hauptberuf','2026-11-24'),
 (999999,'Synthetic','KKA','Kriminalkommissaranwärter','Aktiv','Hauptberuf','2026-11-24'),
 (999996,'Synthetic','Normalkraft','Polizeimeister','Aktiv','Hauptberuf','2026-11-24');"
candidates="$(req "$temp/lead" GET /api/ausbildung/bootstrap)"
# Bereits hochgeladene ZIP-Präsentationen müssen automatisch verlinkt werden
# und bleiben durchgehend privat, ohne dass jemand sie einzeln erneut hochlädt.
printf '%s' "$candidates" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
$materials=$d["materialien"]??[];
if(count($materials)!==16) {fwrite(STDERR,"Expected 16 ZIP-matched Google decks, got ".count($materials));exit(1);}
$codes=array_column($materials,"modul_code");
foreach(["PM.0","PM.1","PM.2","PM.3","PM.4","PM.5","PM.6","PK.1","PK.2","PK.3","PK.4"] as $code)
 if(!in_array($code,$codes,true))exit(2);
foreach($materials as $m)if((int)($m["public_aktiv"]??-1)!==0)exit(3);'
second="$(req "$temp/lead" GET /api/ausbildung/bootstrap)"
printf '%s' "$second" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
if(count($d["materialien"]??[])!==16)exit(1);'
id="$(printf '%s' "$candidates" | php -r '$d=json_decode(stream_get_contents(STDIN),true);foreach($d["anwaerter"]??[] as $p)if($p["personalnummer"]==999997)echo $p["id"];')"
[[ "$id" =~ ^[0-9]+$ ]] || { echo "PMA not automatically linked: $candidates";exit 1; }
printf '%s' "$candidates" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
$roles=[];foreach($d["anwaerter"]??[] as $p)$roles[$p["personalnummer"]]=$p["laufbahn"];
if(($roles[999997]??null)!=="PMA"||($roles[999998]??null)!=="PKA"||
   ($roles[999999]??null)!=="KKA"||isset($roles[999996])||count($roles)!==3)exit(1);'
[[ "$(status "$id")" == 'Module unvollständig' ]] || exit 1
# Ein zweiter Ausbildungs-Personalstamm darf nicht aufgebaut werden.
code="$(curl -sS -o "$temp/no-duplicate" -w '%{http_code}' -b "$temp/lead" -H 'Content-Type: application/json' -X POST --data '{"name":"Duplicate","laufbahn":"PMA"}' "$base/api/ausbildung/anwaerter")"
[[ "$code" == 409 ]] || { echo "Duplicate trainee creation accepted: $code";exit 1; }
publicMonitors="$(curl -sS "$base/api/ausbildung-oeffentlich/monitore")"
printf '%s' "$publicMonitors" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
$counts=[];$persons=[];
foreach($d["monitore"]??[] as $r){
 $counts[$r["laufbahn"]]=$r["anzahl"];
 $persons[$r["laufbahn"]]=$r["personen"][0]??null;
}
if(($counts["PMA"]??0)!==1||($counts["PKA"]??0)!==1||($counts["KKA"]??0)!==1)exit(1);
if(($persons["PMA"]["name"]??"")!=="Synthetic Anwärter")exit(2);
if(($persons["PKA"]["name"]??"")!=="Synthetic PKA")exit(3);
if(($persons["KKA"]["name"]??"")!=="Synthetic KKA")exit(4);
if(($persons["PMA"]["moduleFertig"]??-1)!==0||
   count($persons["PMA"]["module"]??[])!==7||
   count($persons["PKA"]["module"]??[])!==4||
   count($persons["KKA"]["module"]??[])!==4)exit(5);
$allowed=["name","status","moduleFertig","moduleGesamt","moduleAbgeschlossen",
 "zurPruefungZugelassen","module","stimmenAnzahl"];
foreach($persons as $p){
 if(array_diff(array_keys($p),$allowed))exit(6);
 if(array_diff(array_keys($p["module"][0]),["code","titel","abgeschlossen"]))exit(7);
}
if(array_key_exists("stimmenPunkte",$persons["PMA"]) ||
   array_key_exists("stimmenSchwelle",$persons["PMA"]))exit(8);
if(str_contains(json_encode($d),"personalnummer") ||
   str_contains(json_encode($d),"anzeigename") ||
   str_contains(json_encode($d),"ausbilder_user_id") ||
   str_contains(json_encode($d),"stimme\""))exit(9);'

for module in PM.0 PM.1 PM.2 PM.3 PM.4 PM.5 PM.6;do
 rev="$(revision "$id")"
 answer="$(req "$temp/trainer" PUT "/api/ausbildung/anwaerter/$id/modul/$module" "{\"abgeschlossen\":true,\"revision\":$rev}")"
 [[ "$answer" == *'"ok":true'* ]] || { echo "$module: $answer";cat "$temp/php.log";exit 1; }
done
[[ "$(status "$id")" == 'Nicht bereit' ]] || exit 1
# Modulabschluss ist nur die erste Voraussetzung für PMA. Ohne Stimmen darf
# die öffentliche Ansicht noch KEINE endgültige Prüfungszulassung behaupten.
beforeVotes="$(curl -sS "$base/api/ausbildung-oeffentlich/monitore")"
printf '%s' "$beforeVotes" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
foreach($d["monitore"]??[] as $r)if($r["laufbahn"]==="PMA"){
 $p=$r["personen"][0]??[];
 if(!($p["moduleAbgeschlossen"]??false) ||
    ($p["zurPruefungZugelassen"]??true) ||
    ($p["status"]??"")!=="Module abgeschlossen – Stimmen fehlen" ||
    ($p["stimmenAnzahl"]??-1)!==0 || array_key_exists("stimmenPunkte",$p))exit(1);
 foreach($p["module"]??[] as $m)if(!$m["abgeschlossen"])exit(2);
 exit(0);
}exit(3);'

rev="$(revision "$id")"
# Pflichtfeld-Regeln müssen SERVERSEITIG gelten, nicht nur im Formular.
for payload in \
  "{\"stimme\":\"Nein\",\"anlass\":\"Sonstige Leistungen\",\"revision\":$rev}" \
  "{\"stimme\":\"Ja\",\"anlass\":\"Streifenfahrt\",\"revision\":$rev}" \
  "{\"stimme\":\"Ja\",\"bemerkung\":\"fehlender Anlass\",\"revision\":$rev}"; do
  code="$(curl -sS -o "$temp/rejected-vote" -w '%{http_code}' -b "$temp/trainer" \
     -H 'Content-Type: application/json' -X PUT --data "$payload" \
     "$base/api/ausbildung/anwaerter/$id/stimme")"
  [[ "$code" == 400 ]] || { echo "Invalid vote accepted: $code";cat "$temp/rejected-vote";exit 1; }
done
[[ "$(revision "$id")" == "$rev" ]] || { echo 'Invalid vote mutated record';exit 1; }
# Eine gültige Nein-Stimme benötigt und speichert eine schriftliche Begründung.
validNo="$(req "$temp/trainer" PUT "/api/ausbildung/anwaerter/$id/stimme" "{\"stimme\":\"Nein\",\"anlass\":\"Sonstige Leistungen\",\"bemerkung\":\"Unzureichende Eigensicherung\",\"revision\":$rev}")"
[[ "$validNo" == *'"ok":true'* ]] || { echo "No vote rejected: $validNo";exit 1; }
storedNo="$(req "$temp/lead" GET "/api/ausbildung/anwaerter/$id")"
printf '%s' "$storedNo" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);$v=$d["fortschritt"]["stimmen"][0]??[];
if(($v["stimme"]??"")!=="Nein"||($v["anlass"]??"")!=="Sonstige Leistungen"||
   ($v["bemerkung"]??"")!=="Unzureichende Eigensicherung")exit(1);'
rev="$(revision "$id")"
vote="$(req "$temp/trainer" PUT "/api/ausbildung/anwaerter/$id/stimme" "{\"stimme\":\"Ja\",\"anlass\":\"Sonstige Leistungen\",\"bemerkung\":\"Gute Einsatzleistung\",\"revision\":$rev}")"
[[ "$vote" == *'"ok":true'* ]] || { echo "$vote";exit 1; }
rev="$(revision "$id")"
vote="$(req "$temp/lead" PUT "/api/ausbildung/anwaerter/$id/stimme" "{\"stimme\":\"Ja\",\"anlass\":\"Streifenfahrt\",\"streifenfahrt_datum\":\"2026-11-23\",\"revision\":$rev}")"
[[ "$vote" == *'"ok":true'* ]] || { echo "$vote";exit 1; }
[[ "$(status "$id")" == 'Zugelassen' ]] || { echo "Status: $(status "$id")";exit 1; }
privateVotes="$(req "$temp/lead" GET "/api/ausbildung/anwaerter/$id")"
printf '%s' "$privateVotes" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
$vs=$d["fortschritt"]["stimmen"]??[];
if(count($vs)!==2)exit(1);
$found=false;
foreach($vs as $v){
 if($v["stimme"]==="Ja"&&$v["anlass"]==="Streifenfahrt"){
   if($v["streifenfahrt_datum"]!=="2026-11-23")exit(2);
   $found=true;
 }
}
if(!$found)exit(3);'

# Öffentlich: Name und Modulstände ja, wer abgestimmt hat und wie NEIN.
# Punktesaldo nach normalem Ausbilder (1,0) + Leitung (2,0) überschreitet
# exakt die Zulassungsschwelle von 2,5.
afterVotes="$(curl -sS "$base/api/ausbildung-oeffentlich/monitore")"
printf '%s' "$afterVotes" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
foreach($d["monitore"]??[] as $r)if($r["laufbahn"]==="PMA"){
 $p=$r["personen"][0]??[];
 if(!($p["moduleAbgeschlossen"]??false) ||
    !($p["zurPruefungZugelassen"]??false) ||
    ($p["status"]??"")!=="Zur Prüfung zugelassen" ||
    ($p["stimmenAnzahl"]??-1)!==2 ||
    array_key_exists("stimmenPunkte",$p))exit(1);
 exit(0);
}exit(2);'

# Die bereits vergebene Ja-Stimme eines normalen Ausbilders zählt 1 Punkt,
# die der Ausbildungsleitung 2 Punkte. Änderungen der Ausbilderfunktion
# werden ohne Rewrite der historischen ausbildung_stimmen neu gewertet.
check_weight(){
 local expected="$1"
 req "$temp/lead" GET "/api/ausbildung/anwaerter/$id" | php -r '
   $d=json_decode(stream_get_contents(STDIN),true);
   if(!$d||abs((float)($d["fortschritt"]["jaPunkte"]??-1)-(float)$argv[1])>0.001)
     {fwrite(STDERR,"Wrong Ja-Punkte: ".json_encode($d).PHP_EOL);exit(1);}
   if(($d["fortschritt"]["stimmenJa"]??0)!==2)exit(2);
 ' "$expected"
}
check_weight 3.0
trainerId="$(req "$temp/lead" GET /api/ausbildung/bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo $d["ausbilder"][0]["id"]??"";')"
[[ "$trainerId" =~ ^[0-9]+$ ]] || { echo 'Trainer profile absent';exit 1; }
change_role(){
 local role="$1"
 local payload
 payload="$(php -r '$x=json_decode(stream_get_contents(STDIN),true);$x["funktion"]=$argv[1];unset($x["startpasswort"]);echo json_encode($x,JSON_UNESCAPED_UNICODE);' "$role" <<< "$trainer")"
 local changed
 changed="$(req "$temp/lead" PATCH "/api/ausbildung/ausbilder/$trainerId" "$payload")"
 [[ "$changed" == *'"ok":true'* ]] || { echo "Role update failed: $changed";exit 1; }
}
change_role 'Ausbilder auf Probe'
check_weight 2.5
change_role 'Leitungsdienst'
check_weight 3.5
change_role 'Ausbildungsleitung'
check_weight 4.0
change_role 'Ausbilder mittlerer Dienst'
check_weight 3.0
stored_weight="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "
 SELECT s.gewicht FROM ausbildung_stimmen s
 JOIN users u ON u.id=s.ausbilder_user_id
 WHERE s.anwaerter_id=$id AND u.dienstnummer='AUS-TRAIN1'")"
[[ "$stored_weight" == "1.00" || "$stored_weight" == "1.0" ]] || {
 echo "Existing vote unexpectedly rewritten: $stored_weight";exit 1; }

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
# Public AuLK library must expose ONLY explicitly approved documents.
before="$(curl -sS "$base/api/ausbildung-oeffentlich")"
[[ "$before" == *'"materialien":[]'* ]] || { echo "Unexpected public files: $before";exit 1; }
newDoc="$(req "$temp/lead" POST /api/ausbildung/materialien '{"titel":"Synthetic approved presentation","typ":"Präsentation","modul_code":"PM.1","url":"https://docs.google.com/presentation/d/SYNTHETIC"}')"
[[ "$newDoc" == *'"ok":true'* ]] || { echo "Document create failed: $newDoc";exit 1; }
docId="$(req "$temp/lead" GET /api/ausbildung/bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true);foreach($d["materialien"]??[] as $m)if(($m["titel"]??"")==="Synthetic approved presentation"){echo $m["id"];break;}')"
[[ "$docId" =~ ^[0-9]+$ ]] || { echo "No document ID";exit 1; }
out="$(req "$temp/lead" PATCH "/api/ausbildung/materialien/$docId/freigabe" '{"public_aktiv":true}')"
[[ "$out" == *'"ok":true'* ]] || { echo "$out";exit 1; }
publicDoc="$(curl -sS "$base/api/ausbildung-oeffentlich")"
[[ "$publicDoc" == *'Synthetic approved presentation'* ]] && [[ "$publicDoc" != *'Synthetic Anwärter'* ]] || { echo "Public catalog error: $publicDoc";exit 1; }
req "$temp/lead" PATCH "/api/ausbildung/materialien/$docId/freigabe" '{"public_aktiv":false}' >/dev/null
again="$(curl -sS "$base/api/ausbildung-oeffentlich")"
[[ "$again" == *'"materialien":[]'* ]] || { echo "Unpublish did not revoke: $again";exit 1; }
# Classroom signaling is separate from the personnel database and strictly invitation-scoped.
# Bulk import is private-by-default and must never overwrite or publish existing materials.
imports='{"bestaetigung":"AULK_PRIVAT_IMPORT","eintraege":[{"modul_code":"PM.2","titel":"Synthetic AuLK deck","url":"https://docs.google.com/presentation/d/SYNTHETIC-PRIVATE/edit"}]}'
imp="$(req "$temp/lead" POST /api/ausbildung/materialien/import "$imports")"
[[ "$imp" == *'"neu":1'* ]] || { echo "First private import failed: $imp";exit 1; }
imp2="$(req "$temp/lead" POST /api/ausbildung/materialien/import "$imports")"
[[ "$imp2" == *'"neu":0'* && "$imp2" == *'"vorhanden":1'* ]] || { echo "Import is not idempotent: $imp2";exit 1; }
publicDoc="$(curl -sS "$base/api/ausbildung-oeffentlich")"
[[ "$publicDoc" != *'Synthetic AuLK deck'* ]] || { echo "Private AuLK mapping became public";exit 1; }
roomInfo="$(req "$temp/lead" POST /api/ausbildung/unterricht "{\"modul_code\":\"PM.1\",\"material_id\":$docId}")"
roomId="$(printf '%s' "$roomInfo" | parse id)"
token="$(printf '%s' "$roomInfo" | php -r '$x=json_decode(stream_get_contents(STDIN),true);echo explode("#",$x["einladung"]??"")[1]??"";')"
[[ "$roomId" =~ ^[0-9]+$ && "$token" =~ ^[a-f0-9]{64}$ ]] || { echo "Classroom creation: $roomInfo";exit 1; }
# The creator of an existing lesson is resolved from the regular user table.
# No schema migration and no exposure of trainer identity via public invite.
roomList="$(req "$temp/lead" GET /api/ausbildung/unterricht)"
printf '%s' "$roomList" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
if(count($d["raeume"]??[])!==1)exit(1);
$room=$d["raeume"][0];
if(($room["erstellt_von"]??"")!=="Synthetic Training Lead")exit(2);
if(!isset($room["erstellt"],$room["titel"],$room["modul_code"]))exit(3);'

# Room without the instructor cookie is forbidden.
code="$(curl -sS -o "$temp/no-trainer" -w '%{http_code}' "$base/api/ausbildung/unterricht/$roomId/details")"
[[ "$code" == 401 ]] || { echo "Unauthenticated trainer accessed lesson metadata: $code";exit 1; }
# The invitation is a bearer token: only one synthetic learner claims the seat.
client=abcdefabcdefabcdefabcdefabcdefab
join="$(curl -sS -H 'Content-Type: application/json' -X POST --data "{\"token\":\"$token\",\"client\":\"$client\"}" "$base/api/unterricht/beitreten")"
[[ "$join" == *'"aktiv":true'* && "$join" != *'Synthetic Training Lead'* ]] || { echo "Learner join: $join";exit 1; }
code="$(curl -sS -o "$temp/seat" -w '%{http_code}' -H 'Content-Type: application/json' -X POST \
  --data "{\"token\":\"$token\",\"client\":\"11111111111111111111111111111111\"}" "$base/api/unterricht/beitreten")"
[[ "$code" == 403 ]] || { echo "Second learner stole seat: $code";exit 1; }
offer='{"sdp":"v=0\r\no=- 1234 1 IN IP4 127.0.0.1\r\ns=IDV Training\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtcp-mux\r\na=sendonly\r\n"}'
offerResult="$(req "$temp/lead" POST "/api/ausbildung/unterricht/$roomId/angebot" "$offer")"
[[ "$offerResult" == *'"ok":true'* ]] || { echo "Offer write: $offerResult";exit 1; }
status="$(curl -sS -H 'Content-Type: application/json' -X POST --data "{\"token\":\"$token\",\"client\":\"$client\"}" "$base/api/unterricht/status")"
[[ "$status" == *'v=0'* ]] || { echo "Guest did not receive offer: $status";exit 1; }
answered="$(curl -sS -H 'Content-Type: application/json' -X POST \
  --data "{\"token\":\"$token\",\"client\":\"$client\",\"sdp\":\"v=0\\r\\no=- 5678 1 IN IP4 127.0.0.1\\r\\ns=IDV Learner\\r\\nt=0 0\\r\\nm=video 9 UDP/TLS/RTP/SAVPF 96\\r\\na=rtcp-mux\\r\\na=recvonly\\r\\n\"}" \
  "$base/api/unterricht/antwort")"
[[ "$answered" == *'"ok":true'* ]] || { echo "Guest answer: $answered";exit 1; }
teacherState="$(req "$temp/lead" GET "/api/ausbildung/unterricht/$roomId/status")"
[[ "$teacherState" == *'"teilnehmerAngemeldet":true'* && "$teacherState" == *'v=0'* ]] || { echo "Teacher did not receive answer: $teacherState";exit 1; }
closed="$(req "$temp/lead" POST "/api/ausbildung/unterricht/$roomId/beenden" '{}')"
[[ "$closed" == *'"ok":true'* ]] || { echo "Close lesson: $closed";exit 1; }
code="$(curl -sS -o "$temp/closed" -w '%{http_code}' -H 'Content-Type: application/json' -X POST \
  --data "{\"token\":\"$token\",\"client\":\"$client\"}" "$base/api/unterricht/status")"
[[ "$code" == 410 ]] || { echo "Revoked lesson still accessible: $code";exit 1; }

# Prüfen: Namensänderungen im zentralen Personalstamm behalten den Ausbildungsstand.
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "
 UPDATE personal SET vorname='Updated' WHERE personalnummer=999997"
updated="$(req "$temp/lead" GET /api/ausbildung/bootstrap)"
printf '%s' "$updated" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);
foreach($d["anwaerter"]??[] as $p){
 if($p["personalnummer"]==999997){
  if($p["name"]!=="Updated Anwärter"||$p["fortschritt"]["status"]!=="Zugelassen")exit(2);
  exit(0);
 }
}exit(1);'
# Keine unbefugte Anzeige der individuellen Laufbahnhistorie nach einer Beförderung.
link="$(req "$temp/lead" POST "/api/ausbildung/anwaerter/$id/link" '{}')"
careerToken="$(printf '%s' "$link" | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo explode("#",$d["pfad"]??"")[1]??"";')"
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "
 UPDATE personal SET dienstgrad='Polizeimeister' WHERE personalnummer=999997"
promoted="$(req "$temp/lead" GET /api/ausbildung/bootstrap)"
printf '%s' "$promoted" | php -r '$d=json_decode(stream_get_contents(STDIN),true);foreach($d["anwaerter"]??[] as $p)if($p["personalnummer"]==999997)exit(1);'
code="$(curl -sS -o "$temp/old-career" -w '%{http_code}' -H 'Content-Type: application/json'   -X POST --data "{\"token\":\"$careerToken\"}" "$base/api/ausbildung-extern/status")"
[[ "$code" == 404 ]] || { echo "Former trainee status remained public: $code";exit 1; }
# Nach Rückkehr in den Anwärterdienst ist dieselbe Person wieder mit dem alten
# Ausbildungsstand sichtbar – eine Beförderung vernichtet keine Module.
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "
 UPDATE personal SET dienstgrad='Polizeimeisteranwärter' WHERE personalnummer=999997"
restored="$(req "$temp/lead" GET /api/ausbildung/bootstrap)"
printf '%s' "$restored" | php -r '$d=json_decode(stream_get_contents(STDIN),true);foreach($d["anwaerter"]??[] as $p)if($p["personalnummer"]==999997){if($p["fortschritt"]["status"]!=="Zugelassen")exit(1);exit(0);}exit(1);'
# DN-Neubelegung: neu eingestellte Person darf nie die alten Modulabschlüsse
# oder den externen Statuslink des vorherigen Mitarbeiters übernehmen.
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_train_ci -e "
 INSERT INTO personalnummer_neubelegungen(personalnummer,vergeben_von,vorher,folgedaten)
 SELECT 999997,id,'{}','{}' FROM users WHERE dienstnummer='TLEAD' LIMIT 1;
 UPDATE personal SET vorname='Another',nachname='Recruit',eintrittsdatum='2026-11-25'
 WHERE personalnummer=999997;"
newperson="$(req "$temp/lead" GET /api/ausbildung/bootstrap)"
printf '%s' "$newperson" | php -r '
$d=json_decode(stream_get_contents(STDIN),true);foreach($d["anwaerter"]??[] as $p)if($p["personalnummer"]==999997){
 if($p["name"]!=="Another Recruit"||$p["fortschritt"]["moduleFertig"]!==0||$p["fortschritt"]["bereit"]!==false)exit(1);
 if($p["personal_quelle"]!=="personal:999997:1")exit(2);exit(0);
}exit(3);'
code="$(curl -sS -o "$temp/reused-number" -w '%{http_code}' -H 'Content-Type: application/json'  -X POST --data "{\"token\":\"$careerToken\"}" "$base/api/ausbildung-extern/status")"
[[ "$code" == 404 ]] || { echo "Old external token reached reused DN: $code";exit 1; }

trainerId="$(req "$temp/lead" GET /api/ausbildung/bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo $d["ausbilder"][0]["id"]??"";')"
req "$temp/lead" DELETE "/api/ausbildung/ausbilder/$trainerId" '{}' >/dev/null
code="$(curl -sS -o "$temp/revokeduser" -w '%{http_code}' -b "$temp/trainer" "$base/api/me")"
[[ "$code" == 401 ]] || { echo "Trainer session still valid: $code";exit 1; }
echo 'Ausbildung HTTP tests passed: canonical police personnel, automatic PMA/PKA/KKA, role isolation, private links and class rooms'
