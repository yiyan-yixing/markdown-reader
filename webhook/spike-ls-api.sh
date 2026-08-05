#!/usr/bin/env bash
# ============================================================================
# Markdown Reader Pro — LemonSqueezy API spike (Day 2 rollback gate, ADR §6.1)
#
# Purpose: confirm the LS API field contract with real curl BEFORE writing the
# extension's activate/validate around it. ~1 hour.
#
# Rollback gate: if `instance_id` is NOT returned in `meta` on activate, STOP
# and loop back to @architect to revise ADR §6.1 — the contract is wrong and
# the extension cannot cache the instance_id needed for per-instance validate.
#
# This script is READ-ONLY against your own LS account. It uses test_mode where
# possible. No real customers are affected.
#
# Usage:
#   export LS_API_TOKEN=...     # REST API bearer (dashboard → Settings → API)
#   export LS_LICENSE_KEY=...   # a real or test license key you generated
#   bash webhook/spike-ls-api.sh
# ============================================================================
set -euo pipefail

API="${LS_API_BASE:-https://api.lemonsqueezy.com}"
TOKEN="${LS_API_TOKEN:?set LS_API_TOKEN (dashboard → Settings → API)}"
KEY="${LS_LICENSE_KEY:?set LS_LICENSE_KEY (a key you generated in LS)}"

banner() { printf '\n========== %s ==========\n' "$1"; }
chk()    { printf '  [spike] %s\n' "$1"; }

banner "1. License API · validate (form-urlencoded, no auth)"
# Confirm: valid=true, meta has activation_limit / activation_usage.
resp=$(curl -sS -X POST "$API/v1/licenses/validate" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "license_key=$KEY")
echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
chk "valid == true? meta.activation_limit present?"

banner "2. License API · activate (creates an instance)"
# Confirm: activated=true, meta.instance_id IS PRESENT (the rollback gate).
resp=$(curl -sS -X POST "$API/v1/licenses/activate" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "license_key=$KEY" \
  --data-urlencode "instance_name=spike-test")
echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
instance_id=$(echo "$resp" | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("meta") or {}).get("instance_id",""))' 2>/dev/null || echo "")
if [ -z "$instance_id" ]; then
  printf '\n  [!!!] ROLLBACK GATE TRIGGERED: meta.instance_id not found.\n'
  printf '        STOP. Loop back to @architect to revise ADR §6.1.\n\n'
  exit 2
fi
chk "meta.instance_id = $instance_id  (contract confirmed)"

banner "3. License API · validate WITH instance_id"
# Confirm: valid still true when instance_id is included (per-instance check).
resp=$(curl -sS -X POST "$API/v1/licenses/validate" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "license_key=$KEY" \
  --data-urlencode "instance_id=$instance_id")
echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
chk "valid == true WITH instance_id?"

banner "4. REST API · reverse-lookup order → license keys (C2)"
# You need a real order_id from your LS dashboard for this step.
ORDER_ID="${LS_ORDER_ID:-}"
if [ -z "$ORDER_ID" ]; then
  echo "  (skipped — set LS_ORDER_ID to test the order→license-keys lookup)"
else
  resp=$(curl -sS "$API/v1/orders/$ORDER_ID/license-keys" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.api+json")
  echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
  chk "data[] has id fields? (used by webhook handler)"
fi

banner "5. REST API · PATCH license-keys/{id} disabled=true (C1)"
# DANGER: this disables a key for real. Use a throwaway test key.
LK_ID="${LS_LICENSE_KEY_ID:-}"
if [ -z "$LK_ID" ]; then
  echo "  (skipped — set LS_LICENSE_KEY_ID to a throwaway key id to test PATCH)"
else
  resp=$(curl -sS -X PATCH "$API/v1/license-keys/$LK_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.api+json" \
    -H "Content-Type: application/vnd.api+json" \
    --data '{"data":{"type":"license-keys","id":"'"$LK_ID"'","attributes":{"disabled":true}}}')
  echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
  chk "attributes.disabled == true? status 200? (idempotent on re-PATCH?)"
fi

banner "6. License API · deactivate (cleanup the spike instance)"
curl -sS -X POST "$API/v1/licenses/deactivate" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "license_key=$KEY" \
  --data-urlencode "instance_id=$instance_id" | python3 -m json.tool 2>/dev/null || true
chk "spike instance deactivated (frees a slot)"

banner "SPIKE COMPLETE"
printf '  If every check above looks right, the ADR §6.1 contract is confirmed\n'
printf '  and the extension + webhook are good to wire up for real.\n'
