#!/usr/bin/env bash
set -euo pipefail
# Integration test for a pre-existing MySQL8 database lacking Ausbildung tables.
base=http://127.0.0.1:18764
temp="$(mktemp -d)"
server=""
cleanup(){ [[ -z "$server" ]] || kill "$server" 2>/dev/null || :; rm -rf "$temp"; }
trap cleanup EXIT
mysql -h127.0.0.1 -uroot -ptraining-ci-password -e 'CREATE DATABASE idv_ausbildung_setup_ci CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci < scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql
hash="$(php -r 'echo password_hash("Setup-Admin-2026!",PASSWORD_BCRYPT);')"
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci -e \
 "INSERT INTO roles(name,farbe,sensibel) VALUES('Administrator','#607b99',1) ON DUPLICATE KEY UPDATE name=name;
  INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern,gesperrt)
  VALUES('SETUPADMIN','Training Setup Admin','Administrator','$hash',0,0)"
IDV_BACKUP_DIRECTORY="$temp/secure-db-backups" MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_DATABASE=idv_ausbildung_setup_ci MYSQL_USER=root \
 MYSQL_PASSWORD=training-ci-password php -S 127.0.0.1:18764 -t public public/api.php > "$temp/php.log" 2>&1 &
server=$!
for i in $(seq 1 40); do curl -sS "$base/api/me" > /dev/null 2>&1 && break;sleep .25;done
login="$(curl -sS -c "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"dienstnummer":"SETUPADMIN","passwort":"Setup-Admin-2026!"}' "$base/api/login")"
[[ "$login" == *'"ok":true'* ]] || { echo "Login: $login";cat "$temp/php.log";exit 1; }
before="$(curl -sS -b "$temp/admin.cookies" "$base/api/ausbildung/setup-status")"
[[ "$before" == *'"bereit":false'* ]] && [[ "$before" == *'ausbildung_ausbilder'* ]] || { echo "Expected missing schema: $before";exit 1; }
status="$(curl -sS -o "$temp/unfinished" -w '%{http_code}' -b "$temp/admin.cookies" "$base/api/ausbildung/bootstrap")"
[[ "$status" == 503 ]] || { echo "Expected actionable 503 before setup, got $status";exit 1; }
status="$(curl -sS -o "$temp/no-confirm" -w '%{http_code}' -b "$temp/admin.cookies" \
 -H 'Content-Type: application/json' -X POST --data '{}' "$base/api/ausbildung/setup")"
[[ "$status" == 400 ]] || { echo "Setup without backup confirmation allowed: $status";exit 1; }
# Explicit confirmation is insufficient if no real backup exists.
status="$(curl -sS -o "$temp/without-backup" -w '%{http_code}' -b "$temp/admin.cookies" \
 -H 'Content-Type: application/json' -X POST --data '{"bestaetigung":"BACKUP_ERSTELLT_AUSBILDUNG"}' "$base/api/ausbildung/setup")"
[[ "$status" == 428 ]] || { echo "Unsafe setup without real backup: $status";exit 1; }
created="$(curl -sS -b "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"bezeichnung":"Before additive Ausbildung migration","passwort":"Training_Protected_Archive_2026!"}' "$base/api/backup/erstellen")"
[[ "$created" == *'"encrypted":true'* ]] || { echo "Required encrypted backup unavailable: $created";cat "$temp/php.log";exit 1; }
snapshot_id="$(printf '%s' "$created" | php -r '$v=json_decode(stream_get_contents(STDIN),true);echo $v["backup"]["id"]??"";')"
curl -sS -b "$temp/admin.cookies" "$base/api/backup/$snapshot_id/download" -o "$temp/downloaded-before-migration.zip"
test -s "$temp/downloaded-before-migration.zip"

# Compare protected, existing police records byte-for-byte before and after.
# Only new training tables, new training role records and new training logins are allowed.
police_before="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci -e "
 SELECT id,dienstnummer,anzeigename,rolle,passwort_hash,gesperrt,muss_passwort_aendern FROM users ORDER BY id;
 SELECT name,farbe,sensibel FROM roles WHERE name NOT IN ('Ausbildungsleitung','Ausbilder') ORDER BY name;
 SELECT rolle,modul,stufe FROM role_perms WHERE rolle NOT IN ('Ausbildungsleitung','Ausbilder') ORDER BY rolle,modul;
 SELECT COUNT(*) FROM personal;
")"
setup="$(curl -sS -b "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"bestaetigung":"BACKUP_ERSTELLT_AUSBILDUNG"}' "$base/api/ausbildung/setup")"
[[ "$setup" == *'"ok":true'* && "$setup" == *'"bereit":true'* ]] || { echo "Setup failed: $setup";cat "$temp/php.log";exit 1; }
police_after="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci -e "
 SELECT id,dienstnummer,anzeigename,rolle,passwort_hash,gesperrt,muss_passwort_aendern FROM users ORDER BY id;
 SELECT name,farbe,sensibel FROM roles WHERE name NOT IN ('Ausbildungsleitung','Ausbilder') ORDER BY name;
 SELECT rolle,modul,stufe FROM role_perms WHERE rolle NOT IN ('Ausbildungsleitung','Ausbilder') ORDER BY rolle,modul;
 SELECT COUNT(*) FROM personal;
")"
[[ "$police_before" == "$police_after" ]] || { echo "Existing police records/roles/permissions changed during setup";exit 1; }
after="$(curl -sS -b "$temp/admin.cookies" "$base/api/ausbildung/setup-status")"
[[ "$after" == *'"bereit":true'* && "$after" == *'"ausbildungsmodule":11'* && "$after" == *'"personalbindungBereit":true'* ]] || { echo "Schema incomplete: $after";exit 1; }
twice="$(curl -sS -b "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"bestaetigung":"BACKUP_ERSTELLT_AUSBILDUNG"}' "$base/api/ausbildung/setup")"
[[ "$twice" == *'"bereitsEingerichtet":true'* ]] || { echo "Setup not idempotent: $twice";exit 1; }
# Regression: vorhandene Ausbildung ist einsatzbereit, aber nur die neu hinzugekommene
# Personalstamm-Verknüpfung fehlt (derselbe Zustand wie im produktiven Screenshot).
# Die Grundtabellen bleiben bestehen. Auf separater synthetischer CI-Datenbank
# darf der Server die idempotente Ergänzung nach geprüftem Backup reparieren.
mysql -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci -e "
 ALTER TABLE ausbildung_anwaerter DROP INDEX ausbildung_anwaerter_quelle_uq;
 ALTER TABLE ausbildung_anwaerter DROP COLUMN personal_quelle;"
partial="$(curl -sS -b "$temp/admin.cookies" "$base/api/ausbildung/setup-status")"
[[ "$partial" == *'"bereit":true'* && "$partial" == *'"personalbindungBereit":false'* ]] || { echo "Missing binding not detected: $partial";exit 1; }
code="$(curl -sS -o "$temp/partial-bootstrap" -w '%{http_code}' -b "$temp/admin.cookies" "$base/api/ausbildung/bootstrap")"
[[ "$code" == 503 ]] || { echo "Unlinked monitor was not blocked: $code";exit 1; }
repair="$(curl -sS -b "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"bestaetigung":"BACKUP_ERSTELLT_AUSBILDUNG"}' "$base/api/ausbildung/setup")"
[[ "$repair" == *'"ok":true'* && "$repair" == *'"personalbindungBereit":true'* ]] || { echo "Partial binding repair failed: $repair";cat "$temp/php.log";exit 1; }
bootstrap="$(curl -sS -b "$temp/admin.cookies" "$base/api/ausbildung/bootstrap")"
[[ "$bootstrap" == *'"module"'* && "$bootstrap" == *'"anwaerter":[]'* ]] || { echo "Bootstrap failed after setup: $bootstrap";exit 1; }
public="$(curl -sS "$base/api/ausbildung-oeffentlich")"
[[ "$public" == *'"materialien":[]'* ]] || { echo "Public catalog not private-by-default: $public";exit 1; }
anon="$(curl -sS "$base/api/ausbildung-oeffentlich/monitore")"
[[ "$anon" == *'"laufbahn":"PMA"'* && "$anon" == *'"laufbahn":"PKA"'* && "$anon" == *'"laufbahn":"KKA"'* ]] || { echo "Anonymous monitor endpoint failed: $anon";exit 1; }
people="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='personal'")"
[[ "$people" == 1 ]] || { echo "Existing personal table vanished";exit 1; }
echo 'Ausbildung setup passed: additive tables only; byte-identical existing users, roles, role rights and personal counts; no original records changed'
