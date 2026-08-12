# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that renders `.md` files in a three-panel reading interface — file tree (left), rendered content (center), and TOC outline (right). Vanilla JS, no framework. Inspired by [md-reader](https://github.com/md-reader/md-reader).

## Commands

```bash
# Run E2E tests (headed mode, shows browser)
bash run-tests.sh

# Run E2E tests (headless mode, CI-friendly)
HEADLESS=true bash run-tests.sh

# Quick preview without Chrome (standalone test page)
cd /Users/zhanglei/yiyan-yixing/workshop/markdown-reader
python3 -m http.server 7790
# → open http://localhost:7790/preview.html
```

Test dependencies are in `tests/package.json` (Playwright). The test script auto-installs deps and Chromium on first run.

## Architecture

### Component Overview

```
┌─────────────┐     chrome.runtime.sendMessage     ┌──────────────┐
│   popup/    │ ◄──────────────────────────────►   │  background/ │
│  (settings) │     chrome.tabs.sendMessage        │  service-    │
└─────────────┘                                    │  worker.js   │
       │                                           │  (CORS fetch │
       │ chrome.tabs.sendMessage                   │   + routing) │
       ▼                                           └──────┬───────┘
┌──────────────────────────────────────────────────────────┘
│  content/  ──► reads raw markdown, builds reader UI
│  content.js     (three-panel layout, search, themes,
│                 copy-button, scroll-tracked TOC, etc.)
└──────────────────────────────────────────────────────────┘
┌──────────────┐     chrome.runtime.sendMessage     ┌──────────────┐
│   sidebar/   │ ◄──────────────────────────────►   │  background/ │
│  (file tree  │     chrome.tabs.sendMessage        │              │
│   browser)   │                                    └──────────────┘
└──────────────┘
```

### URL Processing Flow (Smart Interception)

`content/content.js` `detectPageType()` returns one of: `local`, `raw-url`, `github-blob`, `gitlab-blob`, `bitbucket-src`, `none`.

| Page type | Behavior |
|-----------|----------|
| `file://*.md` / raw `.md` URLs | Auto-intercept → `replacePageWithReader()` |
| GitHub/GitLab/Bitbucket blob pages | Inject floating "📖 Read in Reader" button → onclick fetches raw markdown via background SW (CORS bypass) |
| Other | No-op |

The popup's "Open in Markdown Reader" button sends `activateReader` message to simulate clicking the floating button.

### Key Files

| File | Role |
|------|------|
| `manifest.json` | MV3 config: content_script matches, host_permissions, optional_host_permissions (for BYO LLM endpoints), sidePanel, action popup |
| `content/content.js` | Main content script — page detection, reader UI, search, theme, settings, AI assistant (selection translate/summarize + result panel, not-configured banner, toolbar 🤖 config button, `reconcileAIConfig`) |
| `background/service-worker.js` | Message router: `fetchRaw` (CORS bypass), `requestFileTree`, `navigateToFile`, `settingsUpdated`, `openSidePanel`, **+ streaming LLM proxy over Port `md-reader-llm`** |
| `sidebar/sidebar.js` | Chrome side panel file browser with tree view and search with keyboard navigation |
| `sidebar/sidebar.html` | Chrome side panel HTML shell |
| `popup/popup.js` | Extension popup: settings toggles, theme picker, tab state detection, "Activate Reader" button, AI config (vendor presets, provider/baseUrl/key/model) + test-connection |
| `popup/popup.html` | Popup UI (340px width) |
| `styles/reader.css` | Main reader styles with CSS variable theming (light + dark via `[data-theme]`) |
| `styles/ai.css` | AI assistant styles — selection popover + streaming result panel (themed via `--md-*`) |
| `styles/themes/light.css` | Light theme overrides |
| `styles/themes/dark.css` | Dark theme overrides |
| `lib/marked.min.js` | Markdown parser (marked.js) |
| `lib/highlight.min.js` | Code syntax highlighting (highlight.js) |
| `lib/hljs-{light,dark}.css` | Code theme styles |
| `preview.html` | Standalone test page (no Chrome needed — fakes `<pre>` for content.js) |
| `sample.md` | Demo markdown file used by tests |
| `tests/markdown-reader.test.js` | Playwright E2E tests (21 test cases) |

### Message Protocol

All messages passed via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` (except the LLM proxy, which uses a long-lived Port):

| Type | Sender → Receiver | Purpose |
|------|-------------------|---------|
| `fetchRaw` | content → background | CORS-safe markdown fetch, returns `{success, text}` |
| `requestFileTree` | sidebar → background → content | Request file listing from active tab |
| `fileTree` | content → background → sidebar | File tree data response |
| `navigateToFile` | sidebar → background → content | Navigate active tab to a different file |
| `settingsUpdated` | popup → background → all tabs | Broadcast settings change (`{settings}`) |
| `activateReader` | popup → content | Click the floating reader button |
| `getPageType` | popup → content | Returns `reader-active`, `rendered-page`, or `none` |
| `openSidePanel` | content → background | Open Chrome side panel |
| `aiCheckConfig` | content → background | Asks SW whether an AI key exists; SW replies `{configured}` (boolean) — SW is the single source of truth for "configured", the key value never enters content |
| `openAIConfig` | content → background | Open `popup.html?standalone=1` as a tab (an extension page where `chrome.permissions.request` works); SW records the source reading tab id |
| `aiConfigDone` | popup(config page) → background | "完成，返回阅读": close the config tab and focus the reading tab that opened it (`aiConfigSourceTabId`) |
| `md-reader-llm` (Port) | content/popup → background | Streaming LLM proxy — `aiComplete` `{provider, baseUrl, model, messages}`, replies `{type:'chunk'|'done'|'error'}` |

### Testing

E2E tests use Playwright with mocked `chrome.*` APIs injected via `page.addInitScript({content: makeChromeMock()})`. Tests:

- Inject content script + deps (marked, highlight.js) into a fresh page
- Serve markdown via a local HTTP server wrapping `<pre>` tags
- 21 tests covering: reader UI, file tree, TOC, search, keyboard nav, copy buttons, theme toggle, font size, settings panel, popup UI, sidebar UI, sidebar search + keyboard, sidebar collapse/expand, narrow mode, rendered features, **AI summarize-all, AI selection translate, AI not-configured hint (actionable button), popup vendor preset autofill, not-configured banner + toolbar config button, single-word dictionary translate prompt**
- Failed tests save screenshots to `tests/screenshots/`

### AI Assistant (BYO model)

Bring-your-own-model translate + summarize. User configures Provider (OpenAI-compatible `/chat/completions` or Anthropic `/v1/messages`), Base URL, model name, and an API key in the popup's「AI 助手」section. The AI feature prefs (划词翻译 / 总结 / 翻译目标语言) also live inside the「AI 助手」section — they only appear once the model connection is configured (`settings.ai.configured === true`). The general Feature Settings / in-page settings panel hold non-AI settings only.

- **API key** is stored in `chrome.storage.local` (`mdReaderApiKey`) — it is **never** placed in the synced settings or sent to the content script. Only the background service worker reads it, then calls the provider directly.
- **"Configured" is derived, not stored-as-truth:** content never trusts the `configured` boolean blindly. On mount and on every `settingsUpdated`, it asks the SW (`aiCheckConfig`) whether a key exists and the SW answers with a bare boolean (the key value never reaches content). The popup also flips `configured` on load + on the test-connection click. This keeps the reader from falsely showing "未配置" after a key is saved.
- Non-secret AI config lives under `settings.ai` (`vendor`, `provider`, `baseUrl`, `model`, `configured`) — **model connection only**. The AI feature preferences are top-level since v1.3.0: `settings.targetLang`, `settings.enableTranslate`, `settings.enableSummary` (migrated from `settings.ai.*` on load).
- **Vendor presets:** the popup's 服务商 dropdown (`AI_VENDORS` in `popup/popup.js`) auto-fills protocol + Base URL + model hint for OpenAI, DeepSeek, 智谱 GLM, Kimi, 通义千问, local Ollama, and Anthropic; a 自定义 option leaves the fields blank for manual entry. Editing the Base URL to a value that no longer matches a preset flips it back to 自定义.
- Host access to the configured endpoint is granted at runtime via `optional_host_permissions` + `chrome.permissions.request` (must originate from an extension page with a user gesture). The background SW does the fetch (bypasses CORS).
- **Local endpoints (Ollama etc.):** local LLM servers reject `chrome-extension://` origins with HTTP 403. At SW startup `setupLocalLLMHeaderRules()` registers a `declarativeNetRequest` session rule (id `1001`) that strips the `Origin` header from this extension's requests to `localhost` / `127.0.0.1` / `0.0.0.0`, so the server falls back to Host-based trust (like curl) — users pick「本地 Ollama」and it just works, no `OLLAMA_ORIGINS` needed. Requires the `declarativeNetRequest` permission. If a local call still returns 403, the SW appends an `OLLAMA_ORIGINS` hint to the error (degradation fallback).
- **Triggers:** select text → floating popover (🌐 翻译 / 📝 总结); toolbar `✨` button → summarize whole document (`>12000` chars truncated). Output streams into a fixed result panel (typewriter while streaming, markdown-rendered on completion, with copy).
- **Prompts** (`aiBuildMessages(task, text, mode)` in `content.js`): translate auto-detects a single English word (`aiIsSingleWord`) and switches to a **dictionary entry** — 🇬🇧/🇪🇸 IPA, parts of speech + senses, synonyms, antonyms, and example sentences (in `targetLang`); phrases/sentences use plain translation. Summarize splits by `mode`: `'all'` (toolbar ✨) → structured Overview / Key points / Conclusions / Action items; `'selection'` → 3–5 focused bullets.
- **Discoverable config:** when no key is set, the reader shows a dismissible `#md-ai-banner` at the top of the content, the selection popover shows a `⚙️ 配置模型` button, and the not-configured result panel shows a `⚙️ 立即配置模型` button. A toolbar `🤖` button (`data-action="ai-config"`) is always available. Any of these send `openAIConfig` → the SW opens `popup.html?standalone=1` as a tab (a real extension page, so the host-permission request works there); `popup.css`'s `body.standalone` rules center it and highlight the AI section, and a "完成，返回阅读" button closes the tab.
- All LLM traffic flows over the `md-reader-llm` Port (see Message Protocol).

### Settings

Persisted via `chrome.storage.sync` key `mdReaderSettings` (the API key is the exception — see AI Assistant). Dual UI: popup toggles + in-page settings panel (toggled via toolbar gear icon). Settings include theme (`light`/`dark`/`auto`), fontSize, contentWidth, centerContent, showOutline, showFileTree, autoRefresh, customCSS, allPlugins, and the nested `ai` block.

### Styling Convention

CSS variables in `:root` / `[data-theme="light"]` / `[data-theme="dark"]`. Reader uses scoped rules under `#md-reader-root` selector. Content script `content.css` is minimal (just body reset). Sidebar and popup styles are standalone.
