#!/bin/bash
#
# run-tests.sh — One-click test runner for Markdown Reader Chrome extension
#
# Usage:
#   bash run-tests.sh               # headed mode (default, shows browser)
#   HEADLESS=true bash run-tests.sh  # headless mode (CI-friendly)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  Markdown Reader — E2E Test Runner"
echo "=============================================="
echo ""

# ── Pre-flight checks ──────────────────────────────────────────────────────
command -v node > /dev/null 2>&1 || { echo "ERROR: Node.js is required but not installed."; exit 1; }
NODE_VER=$(node --version)
echo "  Node:      $NODE_VER"

# ── Install test dependencies ──────────────────────────────────────────────
if [ ! -d "tests/node_modules" ]; then
  echo ""
  echo "  Installing test dependencies (playwright)..."
  cd tests && npm install && cd "$SCRIPT_DIR"
  echo "  Done."
else
  echo "  Dependencies: installed (tests/node_modules)"
fi

# ── Install Chromium browser (if needed) ───────────────────────────────────
cd tests
CHROMIUM_INSTALLED=$(npx playwright install --dry-run 2>&1 | grep -c chromium || true)
cd "$SCRIPT_DIR"

# Simple check: does Playwright have the Chromium browser?
BROWSERS_DIR="$HOME/Library/Caches/ms-playwright"
BROWSERS_DIR2="$HOME/.cache/ms-playwright"
if [ ! -d "$BROWSERS_DIR" ] && [ ! -d "$BROWSERS_DIR2" ]; then
  echo ""
  echo "  Installing Playwright Chromium browser..."
  cd tests && npx playwright install chromium && cd "$SCRIPT_DIR"
  echo "  Done."
else
  echo "  Chromium:   found"
fi

# ── Ensure sample.md exists ────────────────────────────────────────────────
if [ ! -f "sample.md" ]; then
  echo "ERROR: sample.md not found in project root."
  exit 1
fi

# ── Create screenshots directory ──────────────────────────────────────────
mkdir -p tests/screenshots

# ── Run tests ─────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Running test suite..."
echo "=============================================="
echo ""
echo "  Command: HEADLESS=${HEADLESS:-false} node tests/markdown-reader.test.js"
echo ""

# Set timeout: 3 minutes per test overall
export NODE_OPTIONS="--max-old-space-size=512"

cd tests && HEADLESS="${HEADLESS:-false}" node markdown-reader.test.js
RESULT=$?
cd "$SCRIPT_DIR"

echo ""
echo "=============================================="
if [ $RESULT -eq 0 ]; then
  echo "  Result: ALL TESTS PASSED"
  echo "=============================================="
else
  echo "  Result: SOME TESTS FAILED"
  echo "  Screenshots saved in: tests/screenshots/"
  echo "=============================================="
fi
echo ""

exit $RESULT
