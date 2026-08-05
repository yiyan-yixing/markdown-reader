/* ============================================================================
 * Markdown Reader Pro — LemonSqueezy refund webhook handler
 *
 * Listens for `order_refunded` → looks up the order's license keys → disables
 * each via the LS REST API. The next time the extension validates (TTL expiry
 * or manual re-check) LS returns valid=false and Pro relocks (AC-06).
 *
 * Deployed on Cloudflare Workers free tier. Stateless + idempotent
 * (PATCH disabled=true is idempotent; LS at-least-once redelivery is safe).
 *
 * ADR §6.2 contract — 4 technical corrections vs. the PRD (PRD §5.4 was wrong):
 *   C1: disable = PATCH /v1/license-keys/{id} {disabled:true} (Bearer), NOT
 *       POST /v1/licenses/{id}/disable (that endpoint does not exist).
 *   C2: payload has NO license_key_id — reverse-lookup via
 *       GET /v1/orders/{order_id}/license-keys.
 *   C3: signature header is `X-Signature` (not XSIGN). HMAC-SHA256 hex of the
 *       RAW body. request.text() consumes the body — parse with JSON.parse after.
 *   JSON:API media type for REST API: application/vnd.api+json.
 *
 * Secrets (wrangler secret put, never committed):
 *   LS_API_TOKEN    — REST API bearer token (needs license-keys:write scope)
 *   WEBHOOK_SECRET  — LS webhook signing secret
 * ========================================================================== */

const LS_API = 'https://api.lemonsqueezy.com';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 1. Verify signature. The body MUST be read as raw text BEFORE any JSON
    //    parse — request.text() consumes it, so we keep `raw` and JSON.parse it.
    const raw = await request.text();
    const sig = request.headers.get('X-Signature');
    if (!sig || !env.WEBHOOK_SECRET) {
      return new Response('missing signature', { status: 401 });
    }
    const expected = await hmacSha256Hex(raw, env.WEBHOOK_SECRET);
    if (!timingSafeEqualHex(sig, expected)) {
      return new Response('invalid signature', { status: 401 });
    }

    // 2. Parse event. Ignore anything that isn't order_refunded (return 200 so
    //    LS doesn't retry forever on events we don't care about).
    let evt;
    try { evt = JSON.parse(raw); } catch (_) {
      return new Response('bad json', { status: 400 });
    }
    const eventName = evt && evt.meta && evt.meta.event_name;
    if (eventName !== 'order_refunded') {
      return new Response('ignored: ' + (eventName || 'unknown'), { status: 200 });
    }
    const orderId = evt.data && evt.data.id;
    if (!orderId) {
      return new Response('no order id', { status: 400 });
    }

    // 3. Reverse-lookup license keys for this order (C2). The payload's
    //    relationships.license-keys only has a links.related URL, not the ids.
    const lkResp = await fetch(`${LS_API}/v1/orders/${orderId}/license-keys`, {
      headers: {
        Authorization: `Bearer ${env.LS_API_TOKEN}`,
        Accept: 'application/vnd.api+json',
      },
    });
    if (!lkResp.ok) {
      // 502 → LS will retry this webhook; covers transient lookup failures.
      return new Response('lookup failed: HTTP ' + lkResp.status, { status: 502 });
    }
    const lkData = await lkResp.json();
    const ids = (lkData.data || []).map(k => k.id);
    if (ids.length === 0) {
      // Order had no license keys (subscription / physical) — nothing to do.
      return new Response('no license keys for order', { status: 200 });
    }

    // 4. Disable each license key (C1). PATCH disabled=true is idempotent, so
    //    redelivery is safe even if a previous run already disabled some.
    const results = await Promise.all(ids.map(id =>
      fetch(`${LS_API}/v1/license-keys/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.LS_API_TOKEN}`,
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
        body: JSON.stringify({
          data: { type: 'license-keys', id, attributes: { disabled: true } },
        }),
      }).then(r => ({ id, ok: r.ok, status: r.status }))
       .catch(() => ({ id, ok: false, status: 0 }))  // network rejection → failure
    ));

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      // Partial / total failure → 502 so LS retries. Already-disabled keys
      // return 200 (idempotent), so a failure here is a real error.
      return new Response('partial disable: ' + JSON.stringify(failed), { status: 502 });
    }

    return new Response('ok: disabled ' + ids.length + ' key(s)', { status: 200 });
  },
};

// HMAC-SHA256(raw, secret) → hex digest, via Web Crypto (available in Workers).
async function hmacSha256Hex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time hex compare (mitigates timing attacks on signature checks).
function timingSafeEqualHex(a, b) {
  const sa = String(a || '').toLowerCase();
  const sb = String(b || '').toLowerCase();
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}
