# Chrome Web Store — Listing Copy (N7)

> Draft store listing text for v1.1.0. Paste into the CWS developer dashboard.
> Screenshots (5 × 1280×800) are @designer's deliverable.

## Short description (132 chars max)

Beautiful Markdown reader: three-pane view, 7 free themes, AI translate & summarize with your own model. Intercepts .md URLs.

## Detailed description

**Markdown Reader** turns any `.md` file into a clean, focused reading experience —
whether it's a local file, a raw GitHub/GitLab/Bitbucket link, or a rendered blob
page. No more wall-of-source-text Markdown.

### What you get (free)

- **Three-panel layout** — file tree (left), rendered content (center), outline
  with scroll-tracking TOC (right).
- **Smart interception** — opens a beautiful reader for `file://*.md`, raw `.md`
  URLs, and injects a "Read in Reader" button on GitHub/GitLab/Bitbucket blob
  pages.
- **AI translate & summarize (bring your own model)** — connect OpenAI, DeepSeek,
  智谱 GLM, Kimi, 通义千问, Anthropic Claude, or a local Ollama instance. Select
  text to translate or summarize; one-click summarize for the whole document.
  **Your API key never leaves your machine** — it's stored locally and sent
  directly to the provider you choose.
- **Themes** — 7 carefully-crafted themes, all free: **Light, Indigo, Dark,
  Nord, Solarized, Dracula, Tokyo Night**.
- **Search, copy code, collapsible sections, custom CSS, font controls**, and
  11 toggleable features.

### Privacy

- No analytics. No tracking. No advertising.
- Your AI key lives only in `chrome.storage.local`.
- The `declarativeNetRequest` permission is used solely to let the AI feature
  talk to your own local model server (Ollama / LM Studio) — it removes the
  `Origin` header on requests to `localhost` only. It never touches public
  domains, cookies, auth tokens, or response bodies.

See full policies: https://github.com/yiyan-yixing/markdown-reader/tree/main/docs/legal

### Support

Questions or feedback? Open an issue at
https://github.com/yiyan-yixing/markdown-reader/issues

---

## Category

Productivity → Developer Tools

## Languages

English (UI is English; AI prompts support 中文 / English / 日本語 / 한국어 / Français / Deutsch / Español)
