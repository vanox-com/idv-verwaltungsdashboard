#!/usr/bin/env bash
set -euo pipefail
base=http://127.0.0.1:18767
tmp="$(mktemp -d)"
server=""
cleanup(){ [[ -z "$server" ]] || kill "$server" 2>/dev/null || :;rm -rf "$tmp"; }
trap cleanup EXIT
mysql -h127.0.0.1 -uroot -ptraining-ci-password -e 'CREATE DATABASE idv_backup_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_backup_ci < scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql
hash="$(php -r 'echo password_hash("Backup-Admin-2026!",PASSWORD_BCRYPT);')"
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_backup_ci -e "
 INSERT IGNORE INTO roles(name,farbe,sensibel) VALUES('Administrator','#607b99',1);
 INSERT IGNORE INTO role_perms(rolle,modul,stufe) VALUES('Administrator','backup',2);
 INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern,gesperrt)
 VALUES('BACKUPADMIN','Synthetic Backup Administrator','Administrator','$hash',0,0);
 INSERT INTO bekanntmachungen(titel,inhalt) VALUES('Before backup','Preserve this original');"
export IDV_BACKUP_DIRECTORY="$tmp/private-backups"
MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_DATABASE=idv_backup_ci MYSQL_USER=root \
 MYSQL_PASSWORD=training-ci-password php -S 127.0.0.1:18767 -t public public/api.php > "$tmp/php.log" 2>&1 &
server=$!
for i in $(seq 1 40);do curl -sS "$base/api/me" >/dev/null 2>&1 && break;sleep .25;done
request(){
 local method="$1" path="$2" json=""
 if [[ $# -ge 3 ]];then json="$3";fi
 if [[ "$method" == GET ]];then curl -sS -b "$tmp/auth.cookie" "$base$path"
 else curl -sS -b "$tmp/auth.cookie" -H 'Content-Type: application/json' -X "$method" --data "$json" "$base$path";fi
}
login="$(curl -sS -c "$tmp/auth.cookie" -H 'Content-Type: application/json' -X POST \
 --data '{"dienstnummer":"BACKUPADMIN","passwort":"Backup-Admin-2026!"}' "$base/api/login")"
[[ "$login" == *'"ok":true'* ]] || { echo "Login failed: $login";cat "$tmp/php.log";exit 1; }
pass='Long_Encryption_Test_Passphrase_2026!'
created="$(request POST /api/backup/erstellen '{"bezeichnung":"CI full snapshot","passwort":"Long_Encryption_Test_Passphrase_2026!"}')"
[[ "$created" == *'"encrypted":true'* ]] || { echo "Create backup failed: $created";cat "$tmp/php.log";exit 1; }
id="$(printf '%s' "$created" | php -r '$a=json_decode(stream_get_contents(STDIN),true);echo $a["backup"]["id"]??"";')"
[[ "$id" =~ ^idv_[0-9]{8}_[0-9]{6}_[a-f0-9]{20}$ ]] || { echo "Missing encrypted backup ID";exit 1; }
test -f "$tmp/private-backups/$id.zip"
if unzip -p "$tmp/private-backups/$id.zip" manifest.json 2>/dev/null | grep -q 'IDV_MYSQL8_BACKUP';then
 echo 'Backup manifest was not encrypted';exit 1
fi
listed="$(request GET /api/backup/liste)"
[[ "$listed" == *"$id"* ]] || { echo "Backup absent in UI list";exit 1; }
code="$(curl -sS -o "$tmp/unauthorized" -w '%{http_code}' "$base/api/backup/$id/download")"
[[ "$code" == 401 ]] || { echo "Unauthenticated download allowed: $code";exit 1; }
code="$(curl -sS -o "$tmp/wrong" -w '%{http_code}' -b "$tmp/auth.cookie" -H 'Content-Type: application/json' \
 -X POST --data '{"passwort":"This_is_a_wrong_password_123"}' "$base/api/backup/$id/pruefen")"
[[ "$code" == 400 ]] || { echo "Wrong passphrase was accepted: $code";exit 1; }
preview="$(request POST "/api/backup/$id/pruefen" '{"passwort":"Long_Encryption_Test_Passphrase_2026!"}')"
[[ "$preview" == *'"schema_identisch":true'* && "$preview" == *'"valid":true'* ]] || {
 echo "Preview failed: $preview";cat "$tmp/php.log";exit 1;
}
token="$(printf '%s' "$preview" | php -r '$a=json_decode(stream_get_contents(STDIN),true);echo $a["pruefung"]["freigabe"]??"";')"
[[ "$token" =~ ^[a-f0-9]{48}$ ]] || { echo "Missing one-time token";exit 1; }
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_backup_ci -e \
 "INSERT INTO bekanntmachungen(titel,inhalt) VALUES('After backup','This row must be undone by restore')"
code="$(curl -sS -o "$tmp/wrongadmin" -w '%{http_code}' -b "$tmp/auth.cookie" -H 'Content-Type: application/json' \
 -X POST --data "{\"id\":\"$id\",\"passwort\":\"$pass\",\"freigabe\":\"$token\",\"bestaetigung\":\"WIEDERHERSTELLEN idv_backup_ci\",\"admin_passwort\":\"Wrong-Admin-Password\"}" "$base/api/backup/wiederherstellen")"
[[ "$code" == 403 ]] || { echo "Wrong admin password accepted: $code";exit 1; }
restored="$(request POST /api/backup/wiederherstellen \
 "{\"id\":\"$id\",\"passwort\":\"$pass\",\"freigabe\":\"$token\",\"bestaetigung\":\"WIEDERHERSTELLEN idv_backup_ci\",\"admin_passwort\":\"Backup-Admin-2026!\"}")"
[[ "$restored" == *'"ok":true'* && "$restored" == *'"safety_backup":"safety_'* ]] || {
 echo "Restore failed: $restored";cat "$tmp/php.log";exit 1;
}
count="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_backup_ci -e "SELECT COUNT(*) FROM bekanntmachungen")"
[[ "$count" == 1 ]] || { echo "Restore did not remove test mutation: $count";exit 1; }
retained="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_backup_ci -e "SELECT inhalt FROM bekanntmachungen LIMIT 1")"
[[ "$retained" == 'Preserve this original' ]] || { echo "Original data not preserved: $retained";exit 1; }
session="$(curl -sS -o "$tmp/session" -w '%{http_code}' -b "$tmp/auth.cookie" "$base/api/me")"
[[ "$session" == 401 ]] || { echo "Old sessions reactivated: $session";exit 1; }
test ! -f "$tmp/private-backups/.restore_maintenance"
echo 'MySQL backup integration passed: AES-256 privacy, authentication, integrity, restore, safety snapshot and session invalidation'
