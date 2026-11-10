#!/usr/bin/env bash
set -euo pipefail
# Build a code-only staging ZIP directly from tracked committed files.
cd "$(git rev-parse --show-toplevel)"
if [[ $# -ge 1 ]];then out="$1";else out="migration-output/IDV-PHP-MySQL8-STAGING.zip";fi
mkdir -p "$(dirname "$out")"
git archive --format=zip --output="$out" HEAD public php scripts/hosting/preflight.php
for path in public/index.html public/.htaccess public/api.php php/Api.php php/GoogleDocuments.php php/CopNet.php scripts/hosting/preflight.php;do
 if ! unzip -Z -1 "$out" | grep -Fqx "$path";then
   echo "Required staged file is missing: $path" >&2
   exit 1
 fi
done
entries="$(unzip -Z -1 "$out")"
if printf '%s\n' "$entries" | grep -Eq '(^|/)(src|node_modules|migration-output)/|(^|/)\.env([./]|$)';then
 echo "Unsafe files in staging package" >&2
 rm -f "$out"
 exit 1
fi
if printf '%s\n' "$entries" | grep '^scripts/' | grep -Ev '^scripts/$|^scripts/hosting/$|^scripts/hosting/preflight.php$';then
 echo "Unexpected tools in staging package" >&2
 rm -f "$out"
 exit 1
fi
echo "Staging package created: $out"
echo "Use public/ as DocumentRoot. No passwords or database exports are included."
