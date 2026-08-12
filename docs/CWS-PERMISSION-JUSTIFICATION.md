# Chrome Web Store — Permission Justification (B5)

> Paste the relevant sections into the "Privacy practices" / permission
> justification fields when submitting v1.1.0 to the Chrome Web Store.
> Source: ADR §5.4 + §5.5. Keep the narrative single-purpose ("Markdown reader").

## Single purpose

**Markdown Reader** renders `.md` files in a clean three-panel reading interface
(file tree · rendered content · outline). All capabilities are in service of
reading Markdown: rendering, navigation, themes, and reading-comprehension
helpers (AI translate / summarize using the user's own model).

## Permission justification

### `declarativeNetRequest` (highest scrutiny — read carefully)

This extension uses `declarativeNetRequest` **solely** to remove the `Origin`
HTTP request header from requests that **this extension itself sends to the
user's own local machine** (`localhost` / `127.0.0.1` / `0.0.0.0`), and only when
the user has configured a local AI model server (Ollama, LM Studio, llama.cpp)
for the extension's translate/summarize feature.

Local AI servers reject requests whose `Origin` is `chrome-extension://…` with
HTTP 403. Removing this header lets the server fall back to Host-based trust
(localhost allowed, equivalent to `curl`), so the user's own model works without
manual `OLLAMA_ORIGINS` configuration.

**Scope is tightly restricted:**
- Only a **session rule** (not static), registered at service-worker startup.
- Only matches requests whose `requestDomains` are `localhost`, `127.0.0.1`,
  `0.0.0.0` (loopback only — no public domains).
- Only matches requests whose `initiatorDomains` is this extension itself.
- Only modifies the `Origin` header (no read/write of cookies, auth tokens, or
  any other header).
- Does **not** read, log, transmit, or store any response body or personal data.

No network traffic to third parties is involved. The rule exists exclusively to
make the user's own local software interoperable with the extension.

**Source reference:** `background/service-worker.js` → `setupLocalLLMHeaderRules()`
(rule id `1001`).

### `storage`

Stores user preferences (theme, font size, feature toggles) and the user's own
AI API key — all locally (`chrome.storage.local` / `chrome.storage.sync`).
Nothing is uploaded to any server we operate.

### `activeTab`, `scripting`, `sidePanel`

Used to render the reader UI in the active tab when the user opens a Markdown
file, and to show the optional file-tree side panel.

### `host_permissions` (raw.githubusercontent / gitlab / bitbucket / file://)

Used only to fetch raw Markdown text from those hosts so it can be rendered.

### `optional_host_permissions` (http://*/*, https://*/*)

Requested **at runtime, only when the user configures a custom AI endpoint**,
so the extension can call the user's chosen model provider. Never granted
otherwise.

## Data usage disclosure (Chrome Web Store "Privacy practices")

- **Personally identifiable data collected:** None.
- **Authentication data collected:** None (the user's AI API key is stored
  locally and transmitted only to the model provider the user configured).
- **Personal communications:** None.
- **Analytics / tracking:** None.
- **Cryptocurrency mining:** None.
