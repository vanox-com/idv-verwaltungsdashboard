#!/usr/bin/env bash
set -euo pipefail
# Build a code-only package from committed Git files. No secrets or data.
cd "$(git rev-parse --show-toplevel)"
if [[ $# -ge 1 ]];then out="$1";else out="migration-output/IDV-PHP-MySQL8-STAGING.zip";fi
mkdir -p "$(dirname "$out")"
git archive --format=zip --output="$out" HEAD public php
for path in public/index.html public/.htaccess public/api.php php/Api.php php/GoogleDocuments.php php/CopNet.php;do
 if ! unzip -Z -1 "$out" | grep -Fqx "$path";then
  echo "Missing required staging file: $path" >&2;exit 1
 fi
done
if unzip -Z -1 "$out" | grep -Eq '(^|/)(src|scripts|node_modules|migration-output)/|(^|/)\.env([./]|$)';then
 echo "Unsafe entries in staging archive" >&2
 rm -f "$out";exit 1
fi
echo "Staging code-only package created: $out"
echo "Deploy with document root pointing to public/. No credentials included."
