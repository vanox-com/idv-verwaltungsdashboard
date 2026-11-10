#!/usr/bin/env bash
set -euo pipefail
# Run only against disposable CI MySQL and synthetic authenticated fixture.
if [[ $# -lt 2 ]]; then echo "Usage: route-check COOKIE_FILE LOCAL_API_BASE" >&2;exit 1;fi
cookie="$1";base="$2"
manifest="tests/mysql8-api-route-manifest.json"
total="$(jq -r '.original_route_count' "$manifest")"
if [[ "$total" != "103" ]]; then echo "Original route inventory changed" >&2;exit 1;fi
checked=0;skipped=0
while IFS=$'\t' read -r method uri skip; do
  if [[ "$skip" == "true" ]]; then skipped=$((skipped+1));continue;fi
  payload='{}'
  # Prevent accidental creation of a synthetic termination record during probing.
  if [[ "$method" == "POST" && "$uri" == "/api/kuendigung" ]]; then payload='{"nr":{}}';fi
  if [[ "$method" == "GET" ]]; then
    status="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' -X "$method" -b "$cookie" "$base$uri")"
  else
    status="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' -X "$method" -b "$cookie" -H "Content-Type: application/json" -H "If-Match: 0" -d "$payload" "$base$uri")"
  fi
  if [[ "$status" == "501" || "$status" == "500" || "$status" == "000" ]]; then
    echo "API port incomplete or failed: $method $uri returned HTTP $status" >&2
    exit 1
  fi
  checked=$((checked+1))
done < <(jq -r '.routes[] | [.method,.url,(.skip|tostring)] | @tsv' "$manifest")
echo "API method/path dispatch audit OK: $checked exercised, $skipped intentionally skipped, $total original Node routes."
