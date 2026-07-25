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
| `manifest.json` | MV3 config: content_script matches, host_permissions, sidePanel, action popup |
| `content/content.js` | Main content script (~1300 lines) — page detection, reader UI, search, theme, settings |
| `background/service-worker.js` | Message router: `fetchRaw` (CORS bypass), `requestFileTree`, `navigateToFile`, `settingsUpdated`, `openSidePanel` |
| `sidebar/sidebar.js` | Chrome side panel file browser with tree view and search with keyboard navigation |
| `sidebar/sidebar.html` | Chrome side panel HTML shell |
| `popup/popup.js` | Extension popup: settings toggles, theme picker, tab state detection, "Activate Reader" button |
| `popup/popup.html` | Popup UI (340px width) |
| `styles/reader.css` | Main reader styles with CSS variable theming (light + dark via `[data-theme]`) |
| `styles/themes/light.css` | Light theme overrides |
| `styles/themes/dark.css` | Dark theme overrides |
| `lib/marked.min.js` | Markdown parser (marked.js) |
| `lib/highlight.min.js` | Code syntax highlighting (highlight.js) |
| `lib/hljs-{light,dark}.css` | Code theme styles |
| `preview.html` | Standalone test page (no Chrome needed — fakes `<pre>` for content.js) |
| `sample.md` | Demo markdown file used by tests |
| `tests/markdown-reader.test.js` | Playwright E2E tests (15 test cases) |

### Message Protocol

All messages passed via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`:

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

### Testing

E2E tests use Playwright with mocked `chrome.*` APIs injected via `page.addInitScript({content: makeChromeMock()})`. Tests:

- Inject content script + deps (marked, highlight.js) into a fresh page
- Serve markdown via a local HTTP server wrapping `<pre>` tags
- 15 tests covering: reader UI, file tree, TOC, search, keyboard nav, copy buttons, theme toggle, font size, settings panel, popup UI, sidebar UI, sidebar search + keyboard, sidebar collapse/expand, narrow mode, rendered features
- Failed tests save screenshots to `tests/screenshots/`

### Settings

Persisted via `chrome.storage.sync` key `mdReaderSettings`. Dual UI: popup toggles + in-page settings panel (toggled via toolbar gear icon). Settings include theme (`light`/`dark`/`auto`), fontSize, contentWidth, centerContent, showOutline, showFileTree, autoRefresh, customCSS, allPlugins.

### Styling Convention

CSS variables in `:root` / `[data-theme="light"]` / `[data-theme="dark"]`. Reader uses scoped rules under `#md-reader-root` selector. Content script `content.css` is minimal (just body reset). Sidebar and popup styles are standalone.
