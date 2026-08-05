#!/usr/bin/env bash
# ============================================================================
# Markdown Reader — package a Chrome Web Store upload ZIP (B5, Day 7)
#
# Produces dist/markdown-reader-v<version>.zip containing exactly what the store
# needs — no tests, no webhook, no docs, no .git.
#
# Usage:  bash scripts/package.sh
# Then upload the zip to https://chrome.google.com/webstore/devconsole/
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
OUT="dist/markdown-reader-v${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

# Files the extension actually loads at runtime. Keep this list tight — store
# reviewers can see anything in the zip.
zip -r "$OUT" \
  manifest.json \
  background/ \
  content/ \
  popup/ \
  sidebar/ \
  styles/ \
  lib/ \
  icons/ \
  preview.html \
  sample.md \
  -x '**/.DS_Store' 'tests/*' '*.test.js'

echo
echo "Packaged: $OUT"
echo "Version:  $VERSION"
echo "Size:     $(du -h "$OUT" | cut -f1)"
echo
echo "Next: upload to Chrome Web Store developer dashboard, paste the permission"
echo "justification from docs/CWS-PERMISSION-JUSTIFICATION.md, and submit."
