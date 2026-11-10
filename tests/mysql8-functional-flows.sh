#!/usr/bin/env bash
set -euo pipefail
# State transitions on a disposable MySQL 8 CI fixture ONLY.
cookie="$1";base="$2";work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
req(){
 local method="$1" path="$2" expected="$3" payload="" rev="" status
 if [[ $# -ge 4 ]]; then payload="$4";fi
 if [[ $# -ge 5 ]]; then rev="$5";fi
 if [[ -n "$payload" && -n "$rev" ]]; then
  status="$(curl -sS --max-time 12 -X "$method" -b "$cookie" -H "Content-Type: application/json" -H "If-Match: $rev" -d "$payload" -o "$work/body" -w '%{http_code}' "$base$path")"
 elif [[ -n "$payload" ]]; then
  status="$(curl -sS --max-time 12 -X "$method" -b "$cookie" -H "Content-Type: application/json" -d "$payload" -o "$work/body" -w '%{http_code}' "$base$path")"
 else
  status="$(curl -sS --max-time 12 -X "$method" -b "$cookie" -o "$work/body" -w '%{http_code}' "$base$path")"
 fi
 if [[ "$status" != "$expected" ]];then
  echo "Functional flow $method $path expected $expected got $status" >&2
  cat "$work/body" >&2;exit 1
 fi
 jq -e 'type=="object" or type=="array"' "$work/body" >/dev/null || {
  echo "Unexpected JSON from $method $path" >&2;exit 1;
 }
}
assert_json(){
 jq -e "$1" "$work/body" >/dev/null || { echo "Failed: $2" >&2;cat "$work/body" >&2;exit 1; }
}
# Checklists: add, tick, reject conflicting tick, reorder, trash, restore.
req POST /api/checklisten 201 '{"name":"CI Flow List","aufgaben":[{"t":"First","u":""},{"t":"Second","u":""}]}'
req GET /api/bootstrap 200
rev="$(jq -r '.daten.checklisten[] | select(.name=="CI Flow List") | ._revision' "$work/body")"
[[ "$rev" =~ ^[0-9]+$ ]] || { echo "Checklist version missing" >&2;exit 1; }
req PATCH /api/checklisten/CI%20Flow%20List/punkte/0 200 '{"erledigt":true,"erwartet":false}' "$rev"
req PATCH /api/checklisten/CI%20Flow%20List/punkte/0 409 '{"erledigt":true,"erwartet":false}' "$rev"
req PUT /api/checklisten/CI%20Flow%20List 200 '{"name":"CI Flow Renamed","aufgaben":[{"t":"Second","u":""},{"t":"First","u":""}],"zuordnung":[1,0]}' "$rev"
req GET /api/bootstrap 200
assert_json 'any(.daten.checklistenStatus[]; .name=="CI Flow Renamed" and .punkt==1 and .erledigt==1)' "Checklist checked state lost on reorder"
newrev="$(jq -r '.daten.checklisten[] | select(.name=="CI Flow Renamed") | ._revision' "$work/body")"
req DELETE /api/checklisten/CI%20Flow%20Renamed 200 '{}' "$newrev"
req GET /api/papierkorb 200
trash="$(jq -r '.[] | select(.bereich=="checklisten" and .schluessel=="CI Flow Renamed") | .id' "$work/body")"
[[ "$trash" =~ ^[0-9]+$ ]] || { echo "Checklist trash entry missing" >&2;exit 1; }
req POST "/api/papierkorb/$trash/wiederherstellen" 200 '{}'
req GET /api/bootstrap 200
assert_json 'any(.daten.checklistenStatus[]; .name=="CI Flow Renamed" and .punkt==1 and .erledigt==1)' "Checklist restore lost checked state"
echo "Checklist workflow: create, tick, conflict, reorder, trash, restore OK"

# Text templates: edit, conflict, trash, restore.
req POST /api/textbausteine 201 '{"kategorie":"CI","titel":"CI Original","inhalt":"Before"}'
key="$(jq -r '.schluessel' "$work/body")";rev="$(jq -r '._revision' "$work/body")"
[[ "$key" =~ ^neu-[a-f0-9]+$ ]] || { echo "Text key missing" >&2;exit 1; }
req PATCH "/api/textbausteine/$key" 200 '{"kategorie":"CI","titel":"CI Updated","inhalt":"After"}' "$rev"
updated="$(jq -r '._revision' "$work/body")"
req PATCH "/api/textbausteine/$key" 409 '{"kategorie":"CI","titel":"Old edit","inhalt":"Stale"}' "$rev"
req DELETE "/api/textbausteine/$key" 200 '{}' "$updated"
req GET /api/papierkorb 200
trash="$(jq -r --arg key "$key" '.[] | select(.bereich=="textbausteine" and .schluessel==$key) | .id' "$work/body")"
[[ "$trash" =~ ^[0-9]+$ ]] || { echo "Text trash entry missing" >&2;exit 1; }
req POST "/api/papierkorb/$trash/wiederherstellen" 200 '{}'
req GET /api/textbausteine 200
jq -e --arg key "$key" 'any(.[]; .schluessel==$key and .titel=="CI Updated" and .inhalt=="After")' "$work/body" >/dev/null || {
 echo "Text restore failed" >&2;exit 1;
}
echo "Text workflow: create, edit, conflict, trash, restore OK"

# Existing synthetic termination case: update a document URL and read it back.
req GET /api/bootstrap 200
rev="$(jq -r '.daten.kuendigungen[] | select(.id==1) | ._revision' "$work/body")"
[[ "$rev" =~ ^[0-9]+$ ]] || { echo "Termination version missing" >&2;exit 1; }
req PATCH /api/kuendigung/1/dokument 200 '{"feld":"vertrag","name":"CI signed contract","url":"https://example.test/ci-contract"}' "$rev"
req GET /api/kuendigungen/1/akte 200
assert_json 'any(.dokumente[]; .name=="Arbeitsvertrag" and (.wert|fromjson|.u)=="https://example.test/ci-contract")' "Termination document link was not stored"
echo "Termination document link workflow OK"

# User-defined Dienstnummer occupancy: freihalten is free; Gekündigt is not.
req POST /api/personal 200 '{"personalnummer":7,"vorname":"Free","nachname":"Fixture","status":"freihalten"}'
req POST /api/personal 200 '{"personalnummer":8,"vorname":"Leaving","nachname":"Fixture","status":"Aktiv"}'
req PATCH /api/personal/8 200 '{"status":"Gekündigt","kuendigungsgrund":"CI controlled termination"}' 1
assert_json '.kuendigung_angelegt==true' "Automatic termination was not created"
req GET /api/personal/freie-nummern 200
assert_json '(.hauptberuf | index(7))!=null and (.hauptberuf | index(8))==null' "Free vs occupied DN wrong"
req GET /api/bootstrap 200
assert_json 'any(.daten.kuendigungen[]; .personalnummer==8)' "Termination absent from dashboard"
echo "Dienstnummer free/occupied and automatic termination workflow OK"
echo "All stateful module scenarios passed."
