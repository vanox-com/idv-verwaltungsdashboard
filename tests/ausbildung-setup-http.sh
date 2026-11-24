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
MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_DATABASE=idv_ausbildung_setup_ci MYSQL_USER=root \
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
setup="$(curl -sS -b "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"bestaetigung":"BACKUP_ERSTELLT_AUSBILDUNG"}' "$base/api/ausbildung/setup")"
[[ "$setup" == *'"ok":true'* && "$setup" == *'"bereit":true'* ]] || { echo "Setup failed: $setup";cat "$temp/php.log";exit 1; }
after="$(curl -sS -b "$temp/admin.cookies" "$base/api/ausbildung/setup-status")"
[[ "$after" == *'"bereit":true'* && "$after" == *'"ausbildungsmodule":11'* ]] || { echo "Schema incomplete: $after";exit 1; }
twice="$(curl -sS -b "$temp/admin.cookies" -H 'Content-Type: application/json' -X POST \
 --data '{"bestaetigung":"BACKUP_ERSTELLT_AUSBILDUNG"}' "$base/api/ausbildung/setup")"
[[ "$twice" == *'"bereitsEingerichtet":true'* ]] || { echo "Setup not idempotent: $twice";exit 1; }
bootstrap="$(curl -sS -b "$temp/admin.cookies" "$base/api/ausbildung/bootstrap")"
[[ "$bootstrap" == *'"module"'* && "$bootstrap" == *'"anwaerter":[]'* ]] || { echo "Bootstrap failed after setup: $bootstrap";exit 1; }
public="$(curl -sS "$base/api/ausbildung-oeffentlich")"
[[ "$public" == *'"materialien":[]'* ]] || { echo "Public catalog not private-by-default: $public";exit 1; }
people="$(mysql -N -B -h127.0.0.1 -uroot -ptraining-ci-password idv_ausbildung_setup_ci -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='personal'")"
[[ "$people" == 1 ]] || { echo "Existing personal table vanished";exit 1; }
echo 'Ausbildung setup integration passed: preflight, admin-only confirmed migration, repeatability, dashboard, public privacy, original personal table'
