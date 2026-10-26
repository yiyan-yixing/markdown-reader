/* ===========================================================================
 * PageSew — Chrome Web Store screenshot generator
 *
 * Loads the real unpacked extension with --load-extension, opens neutral demo
 * markdown files from /tmp/pagesew-demo, drives the real reader UI, and writes
 * five 1280x800 PNGs to store-assets/screenshots/.
 *
 * Run:
 *   cd tests && node store-screenshots.js
 *
 * No manifest or feature code is modified. The AI response comes from a local
 * mock OpenAI-compatible SSE endpoint; the stored key is a non-secret token.
 * ========================================================================== */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'store-assets', 'screenshots');
const DEMO_DIR = '/tmp/pagesew-demo';
const VIEWPORT = { width: 1280, height: 800 };
const HEADLESS = process.env.HEADLESS !== 'false';
const TARGETS = [
  '01-three-pane.png',
  '02-gfm-code.png',
  '03-search-toc.png',
  '04-dark-theme.png',
  '05-ai-panel.png',
];

function log(s) { process.stdout.write(s + '\n'); }

// ── Demo documents (neutral, no personal data) ─────────────────────────────
const GUIDE_MD = `# Atlas Notes — Field Guide

A short handbook for the **Atlas Notes** project: how to write in Markdown,
keep the outline tidy, and publish a static site from the same folder.

> Markdown is the source of truth. Themes, search, and exports are views on
> top of the same plain text.

## Getting started

Open any \`.md\` file in the browser. The reader replaces the raw text with a
three-pane view: the folder on the left, the document in the middle, and its
outline on the right. Click a sibling file to switch documents without losing
your place.

1. Create a folder for the project.
2. Add \`guide.md\`, \`setup.md\`, and \`notes.md\`.
3. Open \`guide.md\` and start writing.

## Writing content

Headings become the outline automatically. Keep one \`#\` title per document
and use \`##\` for sections; deeper levels nest under their parent.

- Use **bold** for emphasis and \`inline code\` for identifiers.
- Link to related pages with [setup](https://example.com/setup).
- Separate long sections with a horizontal rule.

> Short paragraphs read better on a laptop screen. Prefer two or three
> sentences, then start a new paragraph.

### A note on structure

Every document should answer three questions: what is this, who is it for,
and what should the reader do next. Put the answers near the top.

## Publishing

Build the site with a single command, then upload the \`public/\` folder to any
static host. Relative links keep working because the exporter preserves the
folder structure.

## Troubleshooting

If a page looks stale, hard-refresh the browser before changing anything. If
the outline is empty, check that the document has at least one heading.
`;

const SETUP_MD = `# Setup

This page lists what the Atlas Notes demo needs and how to run it locally.
Nothing here calls a network service; the whole workflow is file-based.

## Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20 LTS | build and preview |
| npm | 10 or newer | install dependencies |
| Git | 2.40 or newer | version history |

## Install

\`\`\`bash
# install dependencies
npm install

# build and preview the site
npm run build
npm run preview -- --port 4000
\`\`\`

## Release checklist

- [x] run the linter
- [x] build the site
- [ ] check every internal link
`;

const NOTES_MD = `# Release Notes

Notes for the 1.3 line of Atlas Notes: what changed, what to check, and how to
roll back. Sections are ordered newest first.

## 1.3.0 — Reader refresh

- The toolbar keeps search, font size, and theme in one row.
- The outline follows the scroll position and highlights the current section.
- File navigation happens in place, so the reading position is preserved.
- The render cache is cleared whenever the reader version changes.

## 1.2.4 — Build fixes

Fixed a cache invalidation bug. The build cache key now includes the Markdown
parser version, so upgrading the parser always triggers a rebuild. Clear the
cache once after upgrading.

- CI now publishes the cache directory between jobs.
- A stale cache no longer produces an empty table of contents.

## 1.2.3 — Link checker

The link checker reports cache hits separately from fresh fetches, and prints
a summary at the end of the run. External links are checked with a two-second
timeout, and redirects are followed at most three times.

## 1.2.2 — Themes

Added two dark palettes and a system-following \`auto\` mode. The selected theme
is stored per browser profile, not per document.

## 1.2.1 — Performance

Large documents (over 5,000 lines) now render in under a second. The outline
is built from the parsed document instead of a second DOM query.

## 1.2.0 — First public preview

The first release with the three-pane layout, outline navigation, and
in-document search.
`;

const REFERENCE_MD = `# API Reference

The exporter exposes a small set of functions for build scripts.

## build(options)

Reads every Markdown file in \`source/\` and writes HTML to \`public/\`.

## preview(port)

Serves \`public/\` on the given port and rebuilds on save.

## links(root)

Returns every internal link found in the rendered output.
`;

// Short, faithful demo translation used by the local mock LLM.
const MOCK_TRANSLATION = `在浏览器中打开任意 \`.md\` 文件，阅读器会把原始文本替换为三栏视图：左侧是文件夹，中间是文档，右侧是文档大纲。

点击同级文件即可切换文档，阅读位置不会丢失。

**提示**：先创建项目文件夹，再放入 \`guide.md\`、\`setup.md\` 和 \`notes.md\`，然后打开 \`guide.md\` 开始写作。`;

function writeDemoDocs() {
  fs.rmSync(DEMO_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEMO_DIR, 'guide.md'), GUIDE_MD);
  fs.writeFileSync(path.join(DEMO_DIR, 'setup.md'), SETUP_MD);
  fs.writeFileSync(path.join(DEMO_DIR, 'notes.md'), NOTES_MD);
  fs.writeFileSync(path.join(DEMO_DIR, 'reference.md'), REFERENCE_MD);
}

// ── Local OpenAI-compatible SSE endpoint (no real provider) ────────────────
let aiServer = null;
let aiPort = 0;

function startAiServer() {
  return new Promise((resolve, reject) => {
    aiServer = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = '';
      req.on('data', d => { body += d; if (body.length > 1000000) req.destroy(); });
      req.on('end', () => {
        let isTranslate = true;
        try {
          const payload = JSON.parse(body || '{}');
          const msgs = payload.messages || [];
          const system = msgs.filter(m => m.role === 'system').map(m => m.content || '').join('\n');
          // Classify from the system prompt only; never from user document text.
          const probe = system || msgs.map(m => m.content || '').join('\n');
          isTranslate = /translat|dictionary/i.test(probe) && !/Summarize/i.test(probe);
        } catch (_) {}

        const reply = isTranslate
          ? MOCK_TRANSLATION
          : '## Overview\n\n- Three-pane reading layout\n- Outline follows the scroll position\n- In-document search with match counts';

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        const chunks = reply.match(/[\s\S]{1,24}/g) || [reply];
        chunks.forEach(c => {
          res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\n\n');
        });
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    aiServer.once('error', reject);
    aiServer.listen(0, '127.0.0.1', () => { aiPort = aiServer.address().port; resolve(); });
  });
}

// ── Extension harness ──────────────────────────────────────────────────────
let ctx = null;
let sw = null;
let extId = '';
let userDataDir = '';

async function swEval(fn, arg) { return sw.evaluate(fn, arg); }

async function resetSettings() {
  await swEval(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.remove('mdReaderApiKey');
    await chrome.storage.sync.set({ mdReaderSettings: { theme: 'light' } });
  });
}

async function setSettings(patch) {
  await swEval(async (p) => {
    const cur = await chrome.storage.sync.get('mdReaderSettings');
    const next = Object.assign({}, cur.mdReaderSettings || {}, p);
    await chrome.storage.sync.set({ mdReaderSettings: next });
  }, patch);
}

// A configured (but non-secret) AI state keeps the "configure AI" banner out
// of product screenshots. Nothing from this config is rendered anywhere.
async function configureAi(extra) {
  await setSettings(Object.assign({
    ai: {
      vendor: 'custom',
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${aiPort}/v1`,
      model: 'demo-model',
      configured: true,
    },
  }, extra || {}));
  await swEval(async () => {
    await chrome.storage.local.set({ mdReaderApiKey: 'demo-placeholder-token' });
  });
}

async function setup() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Remove last run's targets so a failed run can never leave stale images
  // that look like this run's output.
  for (const name of TARGETS) fs.rmSync(path.join(OUT_DIR, name), { force: true });
  writeDemoDocs();
  await startAiServer();

  userDataDir = path.join(os.tmpdir(), 'ps-store-' + Date.now());
  ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: HEADLESS,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [
      `--disable-extensions-except=${ROOT_DIR}`,
      `--load-extension=${ROOT_DIR}`,
      '--allow-file-access-from-files',
      '--no-sandbox',
      '--disable-features=DialMediaRouteProvider',
      '--force-device-scale-factor=1',
    ],
  });
  sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  extId = new URL(sw.url()).host;
  log('  Extension id: ' + extId);

  // Local mock endpoint: drop the Origin header so no OLLAMA_ORIGINS setup is
  // needed (same rule the real extension installs).
  await swEval(async () => {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [1001],
        addRules: [{
          id: 1001, priority: 1,
          action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Origin', operation: 'remove' }] },
          condition: { requestDomains: ['localhost', '127.0.0.1'], resourceTypes: ['xmlhttprequest', 'other'] },
        }],
      });
    } catch (_) {}
  });
}

async function teardown() {
  try { if (ctx) await ctx.close(); } catch (_) {}
  try { if (aiServer) await new Promise(r => aiServer.close(r)); } catch (_) {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
}

// Idempotent teardown, reused by normal exit, failures and Ctrl-C.
let teardownPromise = null;
function safeTeardown() {
  if (!teardownPromise) teardownPromise = teardown();
  return teardownPromise;
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, async () => {
    try { await safeTeardown(); } finally { process.exit(sig === 'SIGINT' ? 130 : 143); }
  });
}

async function openDoc(name) {
  const page = await ctx.newPage();
  page.on('pageerror', e => log('  [pageerror] ' + e.message));
  await page.goto('file://' + path.join(DEMO_DIR, name), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#md-reader-root', { timeout: 10000 });
  await page.waitForSelector('.md-content-inner', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 5,
    null, { timeout: 10000 });
  const treeNames = await page.$$eval('#md-file-tree .md-tree-text', els => els.map(e => e.textContent.trim()));
  for (const name of ['guide.md', 'notes.md', 'reference.md', 'setup.md']) {
    if (!treeNames.includes(name)) throw new Error('Missing file in tree: ' + name + ' (' + treeNames.join(', ') + ')');
  }
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(300);
  return page;
}

async function scrollToHeading(page, text) {
  const found = await page.evaluate((needle) => {
    const content = document.querySelector('.md-content');
    const heading = Array.from(document.querySelectorAll('.md-content-inner h1, .md-content-inner h2, .md-content-inner h3'))
      .find(h => h.textContent.trim().includes(needle));
    if (!content || !heading) return false;
    const delta = heading.getBoundingClientRect().top - content.getBoundingClientRect().top;
    content.scrollTop += delta - 24;
    return true;
  }, text);
  if (!found) throw new Error('Heading not found for scroll: ' + text);
  await page.waitForTimeout(500);
}

async function capture(page, filename) {
  const file = path.join(OUT_DIR, filename);

  // Scan what is actually rendered for personal paths, e-mail addresses,
  // key-shaped strings and form values (innerText misses input.value).
  const findings = await page.evaluate(({ user }) => {
    const text = document.body.innerText || '';
    const html = document.documentElement.outerHTML || '';
    const fieldText = Array.from(document.querySelectorAll('input,textarea,select'))
      .flatMap(el => [el.value, el.placeholder, el.getAttribute('aria-label'), el.title])
      .filter(Boolean).join('\n');
    const hay = [text, html, fieldText, document.title || ''].join('\n');
    let checks = [
      { name: 'home-path', re: /\/Users\/|\/home\/|[A-Za-z]:\\Users\\/ },
      { name: 'username', re: new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
      { name: 'api-key', re: /(?:sk-|gsk_|xai-)[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,}/ },
      { name: 'key-field', re: /(api[_-]?key|authorization)\s*[:=]/i },
      { name: 'demo-token', re: /demo-placeholder-token/ },
    ];
    if (!user) checks = checks.filter(c => c.name !== 'username');
    return checks.filter(c => c.re.test(hay)).map(c => c.name);
  }, { user: os.userInfo().username });

  log('  sensitive scan [' + filename + ']: ' + (findings.length ? findings.join(', ') : 'clean'));
  if (findings.length) throw new Error('Sensitive content detected in ' + filename + ': ' + findings.join(', '));

  await page.screenshot({ path: file, type: 'png', fullPage: false });

  const buf = fs.readFileSync(file);
  if (buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG: ' + file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== VIEWPORT.width || height !== VIEWPORT.height) {
    throw new Error('Unexpected screenshot size ' + width + 'x' + height + ': ' + file);
  }
  if (buf[24] !== 8 || buf[25] !== 2) {
    throw new Error('Expected 8-bit RGB PNG (CWS 24-bit): ' + file);
  }
  log('  saved ' + file + ' (' + width + 'x' + height + ', ' + buf.length + ' bytes)');
  return file;
}

// ── Screens ────────────────────────────────────────────────────────────────
async function main() {
  await setup();

  // 01 — three-pane reading: file tree (left), document (middle), outline (right)
  {
    await resetSettings();
    await configureAi();
    const p = await openDoc('guide.md');
    await capture(p, '01-three-pane.png');
    await p.close();
  }

  // 02 — GFM table + task list + highlighted code block
  {
    await resetSettings();
    await configureAi();
    const p = await openDoc('setup.md');
    await scrollToHeading(p, 'Requirements');
    await capture(p, '02-gfm-code.png');
    await p.close();
  }

  // 03 — in-document search hits + scroll-tracked outline highlight
  {
    await resetSettings();
    await configureAi();
    const p = await openDoc('notes.md');
    await p.fill('.md-search-input', 'cache');
    await p.waitForTimeout(900);
    // Advance to the next hit so the current match sits inside the section
    // the outline is tracking.
    await p.press('.md-search-input', 'Enter');
    await p.waitForTimeout(1200);
    const state = await p.evaluate(() => ({
      count: (document.querySelector('.md-search-count') || {}).textContent,
      matches: document.querySelectorAll('.md-search-highlight').length,
      active: (document.querySelector('.md-outline-item.active') || {}).textContent,
    }));
    log('  search state: ' + JSON.stringify(state));
    if (!(state.matches >= 5)) throw new Error('Search produced too few hits: ' + JSON.stringify(state));
    if (!/^\d+\/\d+$/.test(String(state.count || '').trim())) {
      throw new Error('Search count missing: ' + JSON.stringify(state));
    }
    if (!String(state.active || '').includes('1.2.4')) {
      throw new Error('Outline active item mismatch: ' + JSON.stringify(state));
    }
    await capture(p, '03-search-toc.png');
    await p.close();
  }

  // 04 — dark theme (Tokyo Night)
  {
    await resetSettings();
    await configureAi({ theme: 'tokyo-night' });
    const p = await openDoc('guide.md');
    await scrollToHeading(p, 'Writing content');
    await capture(p, '04-dark-theme.png');
    await p.close();
  }

  // 05 — AI selection translation panel (local mock endpoint, no real key)
  {
    await resetSettings();
    await configureAi({
      theme: 'light',
      targetLang: '中文',
      enableTranslate: true,
      enableSummary: true,
    });
    const p = await openDoc('guide.md');
    await p.evaluate(() => {
      const para = Array.from(document.querySelectorAll('.md-content-inner p'))
        .find(el => el.textContent.includes('Open any'));
      const range = document.createRange();
      range.selectNodeContents(para);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await p.waitForSelector('.md-ai-popover.md-ai-show', { timeout: 4000 });
    await p.click('[data-ai-action="translate"]');
    await p.waitForFunction(() => {
      const body = document.querySelector('#md-ai-body');
      return body && body.textContent.includes('三栏视图') && !body.querySelector('.md-ai-loading');
    }, null, { timeout: 8000 });
    await p.waitForTimeout(400);
    await capture(p, '05-ai-panel.png');
    await p.close();
  }

  await safeTeardown();
  log('Done.');
}

main().catch(async (err) => {
  console.error(err && err.stack || err);
  await safeTeardown();
  process.exit(1);
});
