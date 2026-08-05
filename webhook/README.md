# Markdown Reader Pro — Refund Webhook (Cloudflare Workers)

Listens for LemonSqueezy `order_refunded` events → looks up the order's license
keys → disables each. The extension's next `validate` then returns `valid=false`
and Pro relocks (AC-06). **LemonSqueezy does NOT auto-disable licenses on
refund** — that's why this worker exists.

This is the ADR §3 / §6.2 contract. See `../.claude/blackboard/adr-mdrp-linkvalidation-20260805.md`.

## Architecture (stateless + idempotent)

```
LS refund success
   → POST {worker URL}  (X-Signature: HMAC-SHA256 hex of raw body)
   → verify signature (constant-time)
   → filter: only order_refunded
   → GET /v1/orders/{order_id}/license-keys   (reverse lookup, C2)
   → PATCH /v1/license-keys/{id} disabled:true (C1)  for each key
   → 200 OK
```

No database / KV — LS already owns the order↔license relationship, and
`PATCH disabled=true` is idempotent so LS's at-least-once redelivery is safe.
Sufficient for the link-validation phase (< 100 orders).

## Deploy (one-time, ~5 min)

```bash
cd webhook
npx wrangler login                    # one-time, browser auth
npx wrangler secret put LS_API_TOKEN  # paste LS REST API token (needs license-keys:write)
npx wrangler secret put WEBHOOK_SECRET# paste LS webhook signing secret
npx wrangler deploy
# → note the workers.dev URL
```

Then in LemonSqueezy dashboard → **Settings → Webhooks → Add endpoint**:
- URL: `https://mdreader-ls-webhook.<your-subdomain>.workers.dev`
- Events: `order_refunded` (others are ignored but safe to subscribe)
- Copy the signing secret → it must match `WEBHOOK_SECRET` above.

## Local test

```bash
# Sign a fake payload with your WEBHOOK_SECRET and POST it to the worker.
export WEBHOOK_SECRET=...
body='{"meta":{"event_name":"order_refunded"},"data":{"id":"12345"}}'
sig=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST https://mdreader-ls-webhook.<sub>.workers.dev \
  -H "X-Signature: $sig" \
  -H "Content-Type: application/json" \
  -d "$body"
```

## Day-2 spike (rollback gate, ADR §6.1)

Before wiring this into production, run `spike-ls-api.sh` to confirm the LS API
field contract with real curl. If `instance_id` is not in `meta`, STOP and loop
back to @architect to revise the ADR — the worker is fine but the extension's
activate flow would break.

## Why two LS APIs?

LemonSqueezy exposes two distinct APIs — confusing but important (ADR §3.2):

| API | Prefix | Auth | This worker uses? |
|-----|--------|------|-------------------|
| License API (public) | `/v1/licenses/{activate,validate,deactivate}` | none | No — extension uses it |
| REST API (management) | `/v1/license-keys/{id}`, `/v1/orders/{id}/...` | Bearer token | **Yes** |
