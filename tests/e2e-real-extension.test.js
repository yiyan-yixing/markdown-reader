/* ===========================================================================
 * Markdown Reader — Real-extension E2E suite (no chrome.* mocks)
 *
 * Loads the unpacked extension with --load-extension and exercises the real
 * content script, service worker, popup page and chrome.storage.
 *
 * Run:
 *   node tests/e2e-real-extension.test.js            (headless)
 *   HEADLESS=false node tests/e2e-real-extension.test.js
 *   node tests/e2e-real-extension.test.js --only=MR-001
 *
 * Evidence: tests/evidence/2026-10-20/*.png
 * ========================================================================== */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const EVIDENCE_DIR = path.join(__dirname, 'evidence', '2026-10-20');
const HEADLESS = process.env.HEADLESS !== 'false';
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '');
const TEST_TIMEOUT = 20000;

const results = [];
let ctx = null;
let sw = null;
let extId = '';
let userDataDir = '';
let httpServer = null;
let httpPort = 0;
let aiServer = null;
let aiPort = 0;
let aiRequests = [];

// ── tiny test registry ─────────────────────────────────────────────────────
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

function log(s) { process.stdout.write(s + '\n'); }

async function shot(page, label) {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const file = path.join(EVIDENCE_DIR, label.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.png');
    await page.screenshot({ path: file });
    return file;
  } catch (_) { return ''; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function assertNear(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) throw new Error(msg + ' (expected ~' + expected + ', got ' + actual + ')');
}

// ── extension / settings helpers ───────────────────────────────────────────
async function swEval(fn, arg) { return sw.evaluate(fn, arg); }

async function resetSettings() {
  await swEval(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.remove('mdReaderApiKey');
  });
}

async function setSettings(patch) {
  await swEval(async (p) => {
    const cur = await chrome.storage.sync.get('mdReaderSettings');
    const next = Object.assign({}, cur.mdReaderSettings || {}, p);
    await chrome.storage.sync.set({ mdReaderSettings: next });
  }, patch);
}

async function getSettings() {
  return swEval(async () => (await chrome.storage.sync.get('mdReaderSettings')).mdReaderSettings || {});
}

async function setApiKey(key) {
  await swEval(async (k) => { await chrome.storage.local.set({ mdReaderApiKey: k }); }, key);
}

const FEATURES_MD = 'file://' + path.join(FIXTURES, 'features.md');
const OTHER_MD = 'file://' + path.join(FIXTURES, 'other.md');
const NESTED_MD = 'file://' + path.join(FIXTURES, 'nested.md');

async function openPage(url, opts) {
  const page = await ctx.newPage();
  page.on('pageerror', e => { page.__errors = page.__errors || []; page.__errors.push(e.message); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (!opts || opts.reader !== false) await waitForReader(page);
  return page;
}

async function waitForReader(page) {
  await page.waitForSelector('#md-reader-root', { timeout: 10000 });
  await page.waitForSelector('.md-content-inner', { timeout: 5000 });
}

async function openReader(opts) {
  return openPage(FEATURES_MD, opts);
}

async function openPopup() {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup/popup.html`);
  await p.waitForSelector('.popup-container');
  await p.waitForTimeout(150);
  return p;
}

async function closeAll(keep) {
  for (const p of ctx.pages()) { if (p !== keep) { try { await p.close(); } catch (_) {} } }
}

// Track Playwright routes so each test starts clean.
const activeRoutes = [];
async function addRoute(pattern, handler) {
  await ctx.route(pattern, handler);
  activeRoutes.push(pattern);
}
async function clearRoutes() {
  for (const pattern of activeRoutes.splice(0)) {
    try { await ctx.unroute(pattern); } catch (_) {}
  }
}

// Blob-page HTML used by the GitHub/GitLab/Bitbucket provider tests.
const BLOB_HTML = '<html><head><title>rendered</title></head><body><div class="markdown-body">rendered source</div></body></html>';

// Stub only the raw-markdown network hop for blob readers; everything else
// (chrome messaging, content script, rendering) stays real.
async function stubRawFetch(md) {
  await swEval((text) => {
    globalThis.__mrOrigFetch = globalThis.__mrOrigFetch || globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('raw.githubusercontent.com') || u.includes('/-/raw/') || u.includes('bitbucket.org') && u.includes('/raw/')) {
        return new Response(text, { status: 200 });
      }
      return globalThis.__mrOrigFetch(url, init);
    };
  }, md);
}
async function restoreRawFetch() {
  try { await swEval(() => { if (globalThis.__mrOrigFetch) globalThis.fetch = globalThis.__mrOrigFetch; }); } catch (_) {}
}

const tempDirs = [];
function makeTempDoc(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-doc-'));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

// ── servers ────────────────────────────────────────────────────────────────
function startHttpServer() {
  return new Promise(resolve => {
    httpServer = http.createServer((req, res) => {
      if (/features\.md/.test(req.url) || /sample\.md/.test(req.url)) {
        const body = fs.readFileSync(path.join(FIXTURES, 'features.md'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>raw</title></head><body><pre>' +
          body.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre></body></html>');
      } else {
        res.writeHead(404); res.end('not found');
      }
    });
    httpServer.listen(0, '127.0.0.1', () => {
      httpPort = httpServer.address().port;
      resolve();
    });
  });
}

// Local OpenAI-compatible SSE endpoint used by the AI tests.
function startAiServer() {
  return new Promise(resolve => {
    aiServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        aiRequests.push({ url: req.url, body });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        res.write('data: {"choices":[{"delta":{"content":"MOCK-"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"TRANSLATION"}}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    aiServer.listen(0, '127.0.0.1', () => { aiPort = aiServer.address().port; resolve(); });
  });
}

// ── setup / teardown ───────────────────────────────────────────────────────
async function setup() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await startHttpServer();
  await startAiServer();

  userDataDir = path.join(os.tmpdir(), 'mr-real-' + Date.now());
  ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: HEADLESS,
    viewport: { width: 1400, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [
      `--disable-extensions-except=${ROOT_DIR}`,
      `--load-extension=${ROOT_DIR}`,
      '--allow-file-access-from-files',
      '--no-sandbox',
      '--disable-features=DialMediaRouteProvider',
    ],
  });
  sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  extId = new URL(sw.url()).host;
  log('  Extension id: ' + extId);

  // Keep localhost AI calls working regardless of the Origin header.
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
  try { if (httpServer) httpServer.close(); } catch (_) {}
  try { if (aiServer) aiServer.close(); } catch (_) {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

// ===========================================================================
//  BATCH 1 — verification of the 17 "implemented, needs re-verification" claims
// ===========================================================================

test('MR-001', 'Three-panel layout with independently collapsible sidebars', async () => {
  await resetSettings();
  const p = await openReader();
  const rects = await p.evaluate(() => {
    const r = s => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x }; };
    return { tree: r('.md-sidebar-tree'), content: r('.md-content'), outline: r('.md-sidebar-outline') };
  });
  assert(rects.tree.w > 100, 'file tree width ' + rects.tree.w);
  assert(rects.content.w > 200, 'content width ' + rects.content.w);
  assert(rects.outline.w > 100, 'outline width ' + rects.outline.w);
  assert(rects.tree.x < rects.content.x && rects.content.x < rects.outline.x, 'panes not ordered tree < content < outline');
  await p.click('[data-action="toggle-tree"]');
  await p.waitForTimeout(350);
  let state = await p.evaluate(() => ({
    tree: document.querySelector('.md-sidebar-tree').classList.contains('md-collapsed'),
    outline: document.querySelector('.md-sidebar-outline').classList.contains('md-collapsed'),
  }));
  assert(state.tree && !state.outline, 'tree should collapse alone: ' + JSON.stringify(state));
  await p.click('[data-action="toggle-outline"]');
  await p.waitForTimeout(350);
  state = await p.evaluate(() => ({
    tree: document.querySelector('.md-sidebar-tree').classList.contains('md-collapsed'),
    outline: document.querySelector('.md-sidebar-outline').classList.contains('md-collapsed'),
  }));
  assert(state.tree && state.outline, 'both should be collapsed now: ' + JSON.stringify(state));
  return shot(p, 'MR-001-three-panel');
});

test('MR-002', 'Smart interception: file:// auto, raw .md auto, GitHub blob button', async () => {
  await resetSettings();
  // (a) file://
  const p1 = await openReader();
  assert(await p1.$('#md-reader-root'), 'file:// reader root missing');
  assert((await p1.textContent('.md-content-inner')).includes('Feature Fixture'), 'file:// content missing');
  // (b) raw http .md
  const p2 = await openPage(`http://127.0.0.1:${httpPort}/features.md`);
  assert((await p2.textContent('.md-content-inner')).includes('Feature Fixture'), 'raw-url content missing');
  // (c) GitHub blob page → floating button (page HTML served by route)
  await ctx.route('https://github.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<html><head><title>repo/README.md at main</title></head><body><div class="markdown-body"><h1>README</h1><p>rendered by github</p></div></body></html>',
  }));
  const p3 = await openPage('https://github.com/acme/demo/blob/main/README.md', { reader: false });
  await p3.waitForSelector('#md-reader-fab', { timeout: 8000 });
  const label = (await p3.textContent('#md-reader-fab')).replace(/\s+/g, ' ').trim();
  assert(label.includes('Read in Reader'), 'floating button label missing: ' + label);
  // Stub only the network hop so the click can complete deterministically.
  await swEval(() => {
    globalThis.__mrOrigFetch = globalThis.__mrOrigFetch || globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('raw.githubusercontent.com')) {
        return new Response('# Routed Doc\n\nHello from the routed raw fetch.', { status: 200 });
      }
      return globalThis.__mrOrigFetch(url, init);
    };
  });
  const evidence = await shot(p3, 'MR-002-github-blob-button');
  await p3.click('[data-action="open-reader"]');
  await p3.waitForSelector('#md-reader-root', { timeout: 10000 });
  assert((await p3.textContent('.md-content-inner')).includes('Routed Doc'), 'blob click did not render reader');
  await swEval(() => { if (globalThis.__mrOrigFetch) globalThis.fetch = globalThis.__mrOrigFetch; });
  return { screenshots: [evidence, await shot(p3, 'MR-002-blob-reader')] };
});

test('MR-003', 'GFM tables, task lists, strikethrough, autolinks', async () => {
  await resetSettings();
  const p = await openReader();
  const data = await p.evaluate(() => {
    const inner = document.querySelector('.md-content-inner');
    return {
      tableRows: inner.querySelectorAll('table tbody tr').length,
      checkboxes: Array.from(inner.querySelectorAll('li input[type="checkbox"]')).map(c => c.checked),
      del: inner.querySelectorAll('del').length,
      auto: !!inner.querySelector('a[href="https://example.org/auto"]'),
      mail: !!inner.querySelector('a[href="mailto:test@example.com"]'),
    };
  });
  assertEq(data.tableRows, 3, 'GFM table rows');
  assertEq(JSON.stringify(data.checkboxes), JSON.stringify([true, false, false]), 'task list checkbox states');
  assert(data.del >= 1, 'strikethrough <del> missing');
  assert(data.auto, 'bare URL autolink missing');
  assert(data.mail, 'email autolink missing');
  return shot(p, 'MR-003-gfm');
});

test('MR-004', 'Outline from h1-h6 + click scroll + scroll tracking', async () => {
  await resetSettings();
  const p = await openReader();
  const levels = await p.evaluate(() => Array.from(document.querySelectorAll('.md-outline-item'))
    .map(li => (li.className.match(/md-outline-h(\d)/) || [])[1]).filter(Boolean));
  assert(levels.includes('1') && levels.includes('2') && levels.includes('3'), 'missing h1-h3 outline levels: ' + levels.join(','));
  await p.evaluate(() => {
    const target = Array.from(document.querySelectorAll('.md-outline-item')).find(li => li.textContent.includes('Scroll Filler'));
    target.click();
  });
  await p.waitForTimeout(900);
  const afterClick = await p.evaluate(() => document.querySelector('.md-content').scrollTop);
  assert(afterClick > 100, 'outline click did not scroll content: ' + afterClick);
  await p.waitForTimeout(400);
  const active = await p.evaluate(() => (document.querySelector('.md-outline-item.active') || {}).textContent || '');
  assert(active.includes('Scroll Filler') || active.includes('Long Heading'), 'outline active item not tracking: ' + active);
  return shot(p, 'MR-004-outline');
});

test('MR-005', 'Center Document Content', async () => {
  await resetSettings();
  await setSettings({ contentWidth: 600 });
  const p = await openReader();
  const centered = await p.evaluate(() => {
    const el = document.querySelector('.md-content-inner');
    const cs = getComputedStyle(el);
    return { left: parseFloat(cs.marginLeft), right: parseFloat(cs.marginRight), centered: el.classList.contains('md-centered') };
  });
  assert(centered.centered, 'md-centered class missing by default');
  assertNear(centered.left, centered.right, 1.5, 'centered margins should be equal');
  assert(centered.left > 0, 'centered left margin should be > 0');
  const popup = await openPopup();
  await popup.click('.popup-feature[data-key="centerContent"]');
  await p.waitForTimeout(400);
  const left = await p.evaluate(() => {
    const el = document.querySelector('.md-content-inner');
    return { left: parseFloat(getComputedStyle(el).marginLeft), has: el.classList.contains('md-centered') };
  });
  assert(!left.has, 'md-centered should be removed');
  assertNear(left.left, 0, 1, 'left margin should be 0 when not centered');
  await popup.close();
  return shot(p, 'MR-005-center');
});

test('MR-006', 'Custom content width 400–2000px', async () => {
  await resetSettings();
  const p = await openReader();
  const popup = await openPopup();
  const widths = [];
  for (const w of [400, 2000]) {
    await popup.fill('#contentWidth', String(w));
    await popup.dispatchEvent('#contentWidth', 'change');
    await p.waitForTimeout(350);
    widths.push(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.md-content-inner')).maxWidth)));
  }
  assertEq(widths[0], 400, 'max-width at 400');
  assertEq(widths[1], 2000, 'max-width at 2000');
  await popup.close();
  return shot(p, 'MR-006-width');
});

test('MR-007', 'Font size 12–28px controls with clamping', async () => {
  await resetSettings();
  const p = await openReader();
  const fontSize = () => p.evaluate(() => getComputedStyle(document.querySelector('.md-content')).fontSize);
  assertEq(await fontSize(), '16px', 'default font size');
  for (let i = 0; i < 12; i++) await p.click('[data-action="font-inc"]');
  await p.waitForTimeout(150);
  assertEq(await fontSize(), '28px', 'font size should clamp at 28');
  for (let i = 0; i < 20; i++) await p.click('[data-action="font-dec"]');
  await p.waitForTimeout(150);
  assertEq(await fontSize(), '12px', 'font size should clamp at 12');
  return shot(p, 'MR-007-font');
});

test('MR-008', 'Search with match count and Enter/Shift+Enter navigation', async () => {
  await resetSettings();
  const p = await openReader();
  await p.fill('.md-search-input', 'Paragraph');
  await p.waitForTimeout(600);
  const count1 = await p.textContent('.md-search-count');
  assert(/^1\/\d+$/.test(count1), 'expected 1/N, got ' + count1);
  assert(await p.locator('.md-search-highlight').count() > 5, 'highlights missing');
  await p.press('.md-search-input', 'Enter');
  await p.waitForTimeout(150);
  const count2 = await p.textContent('.md-search-count');
  assert(count2.startsWith('2/'), 'Enter should advance to 2/N, got ' + count2);
  await p.press('.md-search-input', 'Shift+Enter');
  await p.waitForTimeout(150);
  const count3 = await p.textContent('.md-search-count');
  assert(count3.startsWith('1/'), 'Shift+Enter should go back to 1/N, got ' + count3);
  await p.press('.md-search-input', 'Escape');
  await p.waitForTimeout(150);
  assertEq(await p.locator('.md-search-highlight').count(), 0, 'Escape should clear highlights');
  assertEq(await p.inputValue('.md-search-input'), '', 'Escape should clear input');
  return shot(p, 'MR-008-search');
});

test('MR-009', 'Copy code button copies exact code text', async () => {
  await resetSettings();
  const p = await openReader();
  const code = await p.textContent('.md-content pre code');
  await p.click('.md-copy-btn');
  await p.waitForTimeout(200);
  const btnText = await p.textContent('.md-copy-btn');
  assert(btnText.includes('Copied'), 'button should show Copied!, got ' + btnText);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assertEq(clip, code, 'clipboard text');
  return shot(p, 'MR-009-copy');
});

test('MR-010', 'Keyboard shortcuts: Cmd/Ctrl+F, Enter, Shift+Enter, Escape', async () => {
  await resetSettings();
  const p = await openReader();
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  await p.waitForTimeout(150);
  assert(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('md-search-input')), 'Cmd/Ctrl+F should focus search');
  await p.keyboard.type('Heading');
  await p.waitForTimeout(500);
  const c1 = await p.textContent('.md-search-count');
  assert(/^1\/\d+$/.test(c1), 'search count after typing: ' + c1);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(120);
  assert((await p.textContent('.md-search-count')).startsWith('2/'), 'Enter next');
  await p.keyboard.press('Shift+Enter');
  await p.waitForTimeout(120);
  assert((await p.textContent('.md-search-count')).startsWith('1/'), 'Shift+Enter prev');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(120);
  assertEq(await p.locator('.md-search-highlight').count(), 0, 'Escape clear');
  return shot(p, 'MR-010-shortcuts');
});

test('MR-011', 'Collapsible sidebars individually and hide-all', async () => {
  await resetSettings();
  const p = await openReader();
  const cls = () => p.evaluate(() => ({
    tree: document.querySelector('.md-sidebar-tree').classList.contains('md-collapsed'),
    outline: document.querySelector('.md-sidebar-outline').classList.contains('md-collapsed'),
  }));
  await p.click('[data-action="toggle-tree"]');
  await p.waitForTimeout(320);
  assertEq(JSON.stringify(await cls()), JSON.stringify({ tree: true, outline: false }), 'individual tree collapse');
  await p.click('[data-action="toggle-outline"]');
  await p.waitForTimeout(320);
  assertEq(JSON.stringify(await cls()), JSON.stringify({ tree: true, outline: true }), 'individual outline collapse');
  // fresh page for hide-all
  await resetSettings();
  await p.reload();
  await waitForReader(p);
  await p.click('.md-toolbar [data-action="toggle-all-sidebars"]');
  await p.waitForTimeout(320);
  assertEq(JSON.stringify(await cls()), JSON.stringify({ tree: true, outline: true }), 'hide all');
  await p.click('.md-toolbar [data-action="toggle-all-sidebars"]');
  await p.waitForTimeout(320);
  assertEq(JSON.stringify(await cls()), JSON.stringify({ tree: false, outline: false }), 'show all restores');
  return shot(p, 'MR-011-sidebars');
});

test('MR-012', 'Responsive overlays at <=960px (outside click / ESC dismiss)', async () => {
  await resetSettings();
  const p = await openReader();
  await p.setViewportSize({ width: 900, height: 800 });
  await p.waitForTimeout(300);
  assert(await p.evaluate(() => document.getElementById('md-reader-root').classList.contains('md-narrow')), 'md-narrow not set');
  await p.click('[data-action="toggle-tree"]');
  await p.waitForTimeout(250);
  assert(await p.evaluate(() => document.querySelector('.md-sidebar-tree').classList.contains('md-sidebar-mobile-open')), 'overlay did not open');
  const box = await p.locator('.md-content').boundingBox();
  await p.mouse.click(box.x + box.width - 20, box.y + 60);
  await p.waitForTimeout(250);
  assert(!(await p.evaluate(() => document.querySelector('.md-sidebar-tree').classList.contains('md-sidebar-mobile-open'))), 'outside click did not dismiss');
  await p.click('[data-action="toggle-tree"]');
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  assert(!(await p.evaluate(() => document.querySelector('.md-sidebar-tree').classList.contains('md-sidebar-mobile-open'))), 'Escape did not dismiss');
  return shot(p, 'MR-012-responsive');
});

test('MR-013', 'Loading overlay while fetching GitHub blob, removed on render', async () => {
  await resetSettings();
  await ctx.route('https://github.com/**', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<html><head><title>blob</title></head><body><div class="markdown-body">rendered</div></body></html>',
  }));
  await swEval(() => {
    globalThis.__mrOrigFetch = globalThis.__mrOrigFetch || globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('raw.githubusercontent.com')) {
        await new Promise(r => setTimeout(r, 800)); // keep the overlay observable
        return new Response('# Loading Fixture\n\nBody after the overlay.', { status: 200 });
      }
      return globalThis.__mrOrigFetch(url, init);
    };
  });
  const p = await openPage('https://github.com/acme/demo/blob/main/README.md', { reader: false });
  await p.waitForSelector('#md-reader-fab');
  await p.click('[data-action="open-reader"]');
  await p.waitForSelector('#md-reader-loading', { timeout: 2000 });
  const overlayText = await p.textContent('#md-reader-loading');
  assert(overlayText.includes('Loading markdown'), 'overlay copy missing: ' + overlayText);
  const evidence = await shot(p, 'MR-013-loading-overlay');
  await p.waitForSelector('#md-reader-root', { timeout: 10000 });
  assertEq(await p.locator('#md-reader-loading').count(), 0, 'loading overlay should be removed');
  assert((await p.textContent('.md-content-inner')).includes('Loading Fixture'), 'reader content missing');
  await swEval(() => { if (globalThis.__mrOrigFetch) globalThis.fetch = globalThis.__mrOrigFetch; });
  return { screenshots: [evidence, await shot(p, 'MR-013-rendered')] };
});

test('MR-014', 'Heading anchor hover + click copies permalink and scrolls', async () => {
  await resetSettings();
  const p = await openReader();
  const anchorCount = await p.locator('.md-heading-anchor').count();
  assert(anchorCount >= 5, 'expected >=5 anchors, got ' + anchorCount);
  const expected = await p.evaluate(() => window.location.origin + window.location.pathname + '#md-heading-0');
  await p.locator('.md-content-inner h1').first().hover();
  await p.waitForTimeout(200);
  await p.locator('.md-heading-anchor').first().click();
  await p.waitForTimeout(500);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assertEq(clip, expected, 'permalink clipboard');
  const pos = await p.evaluate(() => {
    const c = document.querySelector('.md-content');
    return { scrollTop: c.scrollTop, headingTop: document.querySelector('.md-content-inner h1').getBoundingClientRect().top, contentTop: c.getBoundingClientRect().top };
  });
  assertNear(pos.headingTop, pos.contentTop, 6, 'clicking anchor should align the heading with the top of the content area (scrollTop=' + pos.scrollTop + ')');
  return shot(p, 'MR-014-anchor');
});

test('MR-015', 'Go-to-top appears after 640px and returns to top', async () => {
  await resetSettings();
  const p = await openReader();
  const hiddenBefore = await p.evaluate(() => document.querySelector('.md-fab-top').classList.contains('md-fab-hidden'));
  assert(hiddenBefore, 'go-top should start hidden');
  await p.evaluate(() => { document.querySelector('.md-content').scrollTop = 900; });
  await p.waitForTimeout(900);
  assert(!(await p.evaluate(() => document.querySelector('.md-fab-top').classList.contains('md-fab-hidden'))), 'go-top should appear after 640px');
  await shot(p, 'MR-015-go-top-visible');
  await p.click('.md-fab-top');
  await p.waitForTimeout(1200);
  const top = await p.evaluate(() => document.querySelector('.md-content').scrollTop);
  assert(top < 5, 'go-top should return scrollTop to 0, got ' + top);
  return shot(p, 'MR-015-go-top-clicked');
});

test('MR-016', 'Seven themes apply data-theme and distinct --md-bg', async () => {
  await resetSettings();
  const p = await openReader();
  const popup = await openPopup();
  const themes = ['light', 'light-indigo', 'dark', 'nord', 'solarized', 'dracula', 'tokyo-night'];
  const seen = {};
  const shots = [];
  for (const t of themes) {
    await popup.click(`.popup-theme-btn[data-theme="${t}"]`);
    await p.waitForTimeout(220);
    const applied = await p.evaluate(() => {
      const root = document.getElementById('md-reader-root');
      return {
        theme: root.getAttribute('data-theme'),
        bg: getComputedStyle(root).getPropertyValue('--md-bg').trim(),
        primary: getComputedStyle(root).getPropertyValue('--md-primary').trim(),
        accent: getComputedStyle(root).getPropertyValue('--md-accent').trim(),
        sidebar: getComputedStyle(root).getPropertyValue('--md-sidebar-bg').trim(),
      };
    });
    assertEq(applied.theme, t, 'data-theme for ' + t);
    assert(applied.bg, '--md-bg empty for ' + t);
    seen[t] = [applied.bg, applied.primary, applied.accent, applied.sidebar].join('|');
    if (t === 'dracula') shots.push(await shot(p, 'MR-016-theme-dracula'));
  }
  const uniq = new Set(Object.values(seen));
  assertEq(uniq.size, 7, 'expected 7 distinct theme palettes, got ' + JSON.stringify(seen));
  await popup.close();
  return { screenshots: shots };
});

test('MR-027', 'AI translate + whole-document summarize over the real SW proxy', async () => {
  await resetSettings();
  await setApiKey('test-key-123');
  await setSettings({
    ai: {
      vendor: 'custom', provider: 'openai', baseUrl: `http://127.0.0.1:${aiPort}/v1`,
      model: 'mock-model', configured: true,
    },
  });
  aiRequests = [];
  const p = await openReader();
  // selection → popover → translate
  await p.evaluate(() => {
    const para = document.querySelector('.md-content-inner p');
    const range = document.createRange();
    range.selectNodeContents(para);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await p.waitForSelector('.md-ai-popover.md-ai-show', { timeout: 3000 });
  await p.click('[data-ai-action="translate"]');
  await p.waitForFunction(() => (document.querySelector('#md-ai-body') || {}).textContent.includes('MOCK-TRANSLATION'), null, { timeout: 8000 });
  const translateText = await p.textContent('#md-ai-body');
  assert(translateText.includes('MOCK-TRANSLATION'), 'translate stream missing');
  assert(aiRequests.length >= 1, 'SW did not call the provider');
  const payload = JSON.parse(aiRequests[0].body);
  assertEq(aiRequests[0].url, '/v1/chat/completions', 'endpoint path');
  assertEq(payload.model, 'mock-model', 'model forwarded');
  assertEq(payload.stream, true, 'stream flag');

  // whole document summarize
  await p.click('[data-action="summarize-all"]');
  await p.waitForTimeout(900);
  const sumText = await p.textContent('#md-ai-body');
  assert(sumText.includes('MOCK-TRANSLATION'), 'summarize stream missing');
  assert(aiRequests.length >= 2, 'summarize did not hit the provider');
  const sumPrompt = JSON.parse(aiRequests[1].body).messages.map(m => m.content).join('\n');
  assert(/Overview|Key points|Action items/.test(sumPrompt), 'summarize prompt missing structure');
  return shot(p, 'MR-027-ai');
});

// ===========================================================================
//  SECURITY — untrusted markdown cannot hijack the reader UI
// ===========================================================================

test('SEC-001', 'Markdown cannot claim reader ids/names or inject inline styles', async () => {
  await resetSettings();
  const evil = [
    '# Evil',
    '',
    '- item one',
    '- item two',
    '',
    '<div id="md-ai-popover" class="md-outline-item" style="position:fixed;inset:0;background:red">pwn</div>',
    '<div id="md-outline" name="md-outline">fake outline</div>',
    '<img id="xss-img" src="x" onerror="window.__xssFired=true">',
    '<button data-action="open-settings" class="md-btn">fake settings</button>',
    '<button data-ai-action="config" class="md-ai-popover-btn">fake ai</button>',
  ].join('\n');
  const file = makeTempDoc('evil.md', evil);
  const p = await openPage('file://' + file);
  const state = await p.evaluate(() => ({
    injStyle: !!document.querySelector('.md-content-inner [style]'),
    injIds: Array.from(document.querySelectorAll('.md-content-inner [id]'))
      .map(e => e.id).filter(id => !/^md-heading-\d+$/.test(id) && id !== 'md-ai-banner'),
    popover: !!document.getElementById('md-ai-popover'),
    outlineItems: document.querySelectorAll('#md-outline .md-outline-item').length,
    fired: !!window.__xssFired,
    actions: Array.from(document.querySelectorAll('.md-content-inner [data-action], .md-content-inner [data-ai-action]'))
      .filter(el => !el.closest('#md-ai-banner')).length,
  }));
  assertEq(state.injStyle, false, 'inline style must be stripped');
  assertEq(state.injIds.length, 0, 'markdown ids must be stripped');
  assert(state.popover, 'reader AI popover must still exist');
  assert(state.outlineItems > 0, 'reader outline must still be built');
  assertEq(state.fired, false, 'no script execution');
  assertEq(state.actions, 0, 'markdown must not inject UI action handlers');
  return shot(p, 'SEC-001-sanitize');
});

// ===========================================================================
//  BATCH 2 — newly implemented / repaired claims
// ===========================================================================

test('MR-017', 'Auto theme follows prefers-color-scheme + three-state toolbar cycle', async () => {
  await resetSettings();
  const p = await openReader();
  // New installs default to auto.
  let state = await p.evaluate(() => ({
    mode: document.getElementById('md-reader-root').getAttribute('data-theme-mode'),
    theme: document.getElementById('md-reader-root').getAttribute('data-theme'),
  }));
  assertEq(state.mode, 'auto', 'default should be auto for a new install');
  assert(state.theme === 'light' || state.theme === 'dark', 'auto should resolve to light/dark');

  // Live system change.
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.waitForTimeout(250);
  assertEq(await p.evaluate(() => document.getElementById('md-reader-root').getAttribute('data-theme')), 'dark', 'auto should follow dark OS');
  const icons = await p.evaluate(() => ({
    family: document.getElementById('md-reader-root').getAttribute('data-theme-family'),
    sun: getComputedStyle(document.querySelector('.md-icon-sun')).display,
    moon: getComputedStyle(document.querySelector('.md-icon-moon')).display,
  }));
  assertEq(icons.family, 'dark', 'auto OS change must update the icon family');
  assert((icons.sun === 'none') !== (icons.moon === 'none'), 'exactly one theme icon should be visible: ' + JSON.stringify(icons));
  await p.emulateMedia({ colorScheme: 'light' });
  await p.waitForTimeout(250);
  assertEq(await p.evaluate(() => document.getElementById('md-reader-root').getAttribute('data-theme')), 'light', 'auto should follow light OS');

  // Toolbar cycle: auto → light → dark → auto.
  await p.click('[data-action="toggle-theme"]');
  await p.waitForTimeout(200);
  assertEq(await p.evaluate(() => document.getElementById('md-reader-root').getAttribute('data-theme-mode')), 'fixed', 'first click leaves auto');
  assertEq(await (await getSettings()).theme, 'light', 'first click → light');
  await p.click('[data-action="toggle-theme"]');
  await p.waitForTimeout(200);
  assertEq(await (await getSettings()).theme, 'dark', 'second click → dark');
  await p.click('[data-action="toggle-theme"]');
  await p.waitForTimeout(250);
  assertEq(await (await getSettings()).theme, 'auto', 'third click → auto');
  assertEq(await p.evaluate(() => document.getElementById('md-reader-root').getAttribute('data-theme-mode')), 'auto', 'auto mode restored');

  // Existing installs without a theme keep the legacy light default.
  await resetSettings();
  await swEval(async () => { await chrome.storage.sync.set({ mdReaderSettings: { fontSize: 15 } }); });
  const legacy = await openReader();
  const legacyState = await legacy.evaluate(() => ({
    theme: document.getElementById('md-reader-root').getAttribute('data-theme'),
    mode: document.getElementById('md-reader-root').getAttribute('data-theme-mode'),
    storedTheme: null,
  }));
  assertEq(legacyState.theme, 'light', 'legacy settings without theme should stay light');
  assertEq(legacyState.mode, 'fixed', 'legacy settings should not flip to auto');
  await legacy.close();
  await resetSettings();
  const p2 = await openReader();

  // Popup Auto button
  const popup = await openPopup();
  await popup.click('.popup-theme-btn[data-theme="auto"]');
  await p2.waitForTimeout(250);
  assertEq(await (await getSettings()).theme, 'auto', 'popup Auto button');
  await popup.close();
  await p2.emulateMedia({ colorScheme: 'light' });
  return shot(p2, 'MR-017-auto-theme');
});

test('MR-018', 'Auto-refresh re-reads the file, preserving scroll and search', async () => {
  await resetSettings();
  await setSettings({ autoRefresh: true, refreshInterval: 1000 });
  const filler = Array.from({ length: 40 }, (_, i) => 'Filler line ' + (i + 1) + ': the quick brown fox keeps the page scrollable.').join('\n\n');
  const file = makeTempDoc('live.md', '# Live V1\n\nfirst body paragraph\n\n' + filler + '\n\n- one\n- two\n');
  const p = await openPage('file://' + file);
  assert((await p.textContent('.md-content-inner')).includes('Live V1'), 'initial render');
  await p.waitForTimeout(1200);
  // Preserve state that must survive the refresh.
  await p.fill('.md-search-input', 'body');
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelector('.md-content').scrollTop = 40; });
  await p.waitForTimeout(150);
  fs.writeFileSync(file, '# Live V2\n\nsecond body paragraph\n\n' + filler + '\n\n- one\n- two\n');
  await p.waitForFunction(() => (document.querySelector('.md-content-inner') || {}).textContent.includes('Live V2'), null, { timeout: 8000 });
  const after = await p.evaluate(() => ({
    text: document.querySelector('.md-content-inner').textContent,
    scrollTop: document.querySelector('.md-content').scrollTop,
    query: document.querySelector('.md-search-input').value,
    highlights: document.querySelectorAll('.md-search-highlight').length,
  }));
  assert(after.text.includes('second body'), 'content should show the edited body');
  assert(after.query === 'body', 'search query should be preserved');
  assert(after.highlights > 0, 'search highlights should be reapplied');
  assert(after.scrollTop >= 30, 'scroll position should be preserved, got ' + after.scrollTop);
  assertEq(await p.evaluate(() => document.visibilityState), 'visible', 'auto-refresh test must run in a visible tab');

  // Remote documents must not claim auto-refresh is active (it is file:// only).
  await setSettings({ autoRefresh: true });
  const remote = await openPage(`http://127.0.0.1:${httpPort}/features.md`);
  assertEq(await remote.evaluate(() => document.getElementById('md-auto-refresh').style.display), 'none', 'remote reader must not show the auto-refresh indicator');
  await remote.close();
  return shot(p, 'MR-018-auto-refresh');
});

test('MR-019', 'Per-extension markdown plugin options (tables / tasks / strike / autolinks)', async () => {
  await resetSettings();
  const p = await openReader();
  const popup = await openPopup();
  const counts = async () => p.evaluate(() => ({
    table: document.querySelectorAll('.md-content-inner table').length,
    tasks: document.querySelectorAll('.md-content-inner input[type="checkbox"]').length,
    del: document.querySelectorAll('.md-content-inner del').length,
    auto: document.querySelectorAll('.md-content-inner a[href="https://example.org/auto"]').length,
  }));
  assertEq((await counts()).table, 1, 'baseline table');
  await popup.uncheck('[data-plugin-option="gfmTables"]');
  await p.waitForTimeout(400);
  assertEq((await counts()).table, 0, 'tables off removes the table');
  await popup.uncheck('[data-plugin-option="gfmTaskLists"]');
  await p.waitForTimeout(400);
  assertEq((await counts()).tasks, 0, 'task lists off removes checkboxes');
  assert((await p.textContent('.md-content-inner')).includes('[ ]'), 'task marker should remain literal');
  await popup.uncheck('[data-plugin-option="gfmStrikethrough"]');
  await p.waitForTimeout(400);
  assertEq((await counts()).del, 0, 'strikethrough off removes <del>');
  await popup.uncheck('[data-plugin-option="gfmAutolinks"]');
  await p.waitForTimeout(400);
  assertEq((await counts()).auto, 0, 'autolinks off removes the bare-URL link');
  // Nested / loose lists must still render when task lists are disabled
  // (the custom list-item renderer previously threw on block tokens).
  const nested = await openPage(NESTED_MD);
  const nestedData = await nested.evaluate(() => ({
    text: document.querySelector('.md-content-inner').textContent,
    nestedLists: document.querySelectorAll('.md-content-inner ul ul').length,
    checkboxes: document.querySelectorAll('.md-content-inner input[type="checkbox"]').length,
  }));
  assert(nestedData.text.includes('[x]'), 'task marker should survive as literal text');
  assert(nestedData.nestedLists >= 1, 'nested list should render');
  assertEq(nestedData.checkboxes, 0, 'no checkboxes when task lists are off');
  const stored = (await getSettings()).pluginOptions;
  assertEq(stored.gfmTables, false, 'stored pluginOptions.gfmTables');
  // In-page panel exposes the same four switches.
  await popup.close();
  await p.click('[data-action="open-settings"]');
  const panelOpts = await p.locator('[data-plugin-option]').count();
  assertEq(panelOpts, 4, 'in-page plugin option switches');
  return shot(p, 'MR-019-plugin-options');
});

test('MR-020', 'Custom CSS enable flag is separate from the CSS string (plus migration)', async () => {
  await resetSettings();
  const p = await openReader();
  const popup = await openPopup();
  const css = '.md-content-inner h1 { color: rgb(255, 0, 0); }';
  await popup.fill('#customCSS', css);
  await popup.dispatchEvent('#customCSS', 'change');
  await p.waitForTimeout(400);
  assertEq(await p.evaluate(() => getComputedStyle(document.querySelector('.md-content-inner h1')).color), 'rgb(255, 0, 0)', 'custom CSS applied');
  // Toggling the row must not destroy the CSS string.
  await popup.click('.popup-feature[data-key="customCSS"] .popup-check');
  await p.waitForTimeout(400);
  assert(!(await p.evaluate(() => getComputedStyle(document.querySelector('.md-content-inner h1')).color === 'rgb(255, 0, 0)')), 'CSS should be disabled');
  let st = await getSettings();
  assertEq(st.customCSS, css, 'custom CSS string preserved after toggle');
  assertEq(st.customCSSEnabled, false, 'customCSSEnabled recorded');
  assertEq(await popup.inputValue('#customCSS'), css, 'textarea keeps the CSS');
  await popup.click('.popup-feature[data-key="customCSS"] .popup-check');
  await p.waitForTimeout(400);
  assertEq(await p.evaluate(() => getComputedStyle(document.querySelector('.md-content-inner h1')).color), 'rgb(255, 0, 0)', 'CSS re-enabled');
  await popup.close();

  // Migration of the corrupted shape (boolean written into customCSS).
  await swEval(async () => {
    await chrome.storage.sync.set({ mdReaderSettings: { customCSS: false } });
  });
  const p2 = await openReader();
  const migrated = await getSettings();
  assertEq(migrated.customCSS, '', 'boolean customCSS cleared');
  assertEq(migrated.customCSSEnabled, false, 'boolean migrated into customCSSEnabled');
  return shot(p2, 'MR-020-custom-css');
});

test('MR-021', 'Every settings toggle has an observable effect', async () => {
  await resetSettings();
  const p = await openReader();
  const popup = await openPopup();

  // customWidth — off removes the inline max-width, on restores it.
  const width = () => p.evaluate(() => document.querySelector('.md-content-inner').style.maxWidth);
  assertEq(await width(), '800px', 'default inline width');
  await popup.click('.popup-feature[data-key="customWidth"]');
  await p.waitForTimeout(350);
  assertEq(await width(), '', 'customWidth off clears inline width');
  await popup.click('.popup-feature[data-key="customWidth"]');
  await p.waitForTimeout(350);
  assertEq(await width(), '800px', 'customWidth on restores width');

  // adjustFont — off pins 16px and disables the toolbar controls.
  await popup.click('.popup-feature[data-key="adjustFont"]');
  await p.waitForTimeout(350);
  await p.click('[data-action="font-inc"]');
  await p.waitForTimeout(200);
  assertEq(await p.evaluate(() => getComputedStyle(document.querySelector('.md-content')).fontSize), '16px', 'font locked at 16 when adjustFont off');
  await popup.click('.popup-feature[data-key="adjustFont"]');
  await p.waitForTimeout(350);
  await p.click('[data-action="font-inc"]');
  await p.waitForTimeout(200);
  assertEq(await p.evaluate(() => getComputedStyle(document.querySelector('.md-content')).fontSize), '17px', 'font controls re-enabled');

  // allPlugins — off disables all GFM extensions and re-renders.
  await popup.click('.popup-feature[data-key="allPlugins"]');
  await p.waitForTimeout(400);
  let gfm = await p.evaluate(() => ({
    table: document.querySelectorAll('.md-content-inner table').length,
    tasks: document.querySelectorAll('.md-content-inner input[type="checkbox"]').length,
    del: document.querySelectorAll('.md-content-inner del').length,
    auto: document.querySelectorAll('.md-content-inner a[href="https://example.org/auto"]').length,
  }));
  assertEq(JSON.stringify(gfm), JSON.stringify({ table: 0, tasks: 0, del: 0, auto: 0 }), 'allPlugins off disables GFM');
  await popup.click('.popup-feature[data-key="allPlugins"]');
  await p.waitForTimeout(400);
  assertEq(await p.locator('.md-content-inner table').count(), 1, 'allPlugins back on');

  // pluginOptions master toggle flips all four extensions.
  await popup.click('.popup-feature[data-key="pluginOptions"] .popup-check');
  await p.waitForTimeout(400);
  let po = (await getSettings()).pluginOptions;
  assertEq(Object.values(po).every(v => v === false), true, 'pluginOptions master off flips every extension');
  await popup.click('.popup-feature[data-key="pluginOptions"] .popup-check');
  await p.waitForTimeout(400);
  po = (await getSettings()).pluginOptions;
  assertEq(Object.values(po).every(v => v === true), true, 'pluginOptions master on flips every extension');

  // showFileTree / showOutline
  const sidebars = () => p.evaluate(() => ({
    tree: document.querySelector('.md-sidebar-tree').classList.contains('md-collapsed'),
    outline: document.querySelector('.md-sidebar-outline').classList.contains('md-collapsed'),
  }));
  await popup.click('.popup-feature[data-key="showFileTree"]');
  await p.waitForTimeout(320);
  assert((await sidebars()).tree, 'showFileTree off collapses tree');
  await popup.click('.popup-feature[data-key="showFileTree"]');
  await popup.click('.popup-feature[data-key="showOutline"]');
  await p.waitForTimeout(320);
  assert((await sidebars()).outline, 'showOutline off collapses outline');
  await popup.click('.popup-feature[data-key="showOutline"]');
  await p.waitForTimeout(320);

  // centerContent
  await popup.click('.popup-feature[data-key="centerContent"]');
  await p.waitForTimeout(320);
  assert(!(await p.evaluate(() => document.querySelector('.md-content-inner').classList.contains('md-centered'))), 'centerContent off');
  await popup.click('.popup-feature[data-key="centerContent"]');
  await popup.waitForTimeout(300);

  // autoRefresh — indicator appears only for file:// (asserted in MR-018).
  await popup.click('.popup-feature[data-key="autoRefresh"]');
  await p.waitForTimeout(300);
  assertEq(await p.evaluate(() => document.getElementById('md-auto-refresh').style.display), '', 'auto-refresh indicator shown');
  await popup.click('.popup-feature[data-key="autoRefresh"]');
  await p.waitForTimeout(300);
  assertEq(await p.evaluate(() => document.getElementById('md-auto-refresh').style.display), 'none', 'auto-refresh indicator hidden');
  await popup.close();
  return shot(p, 'MR-021-toggles');
});

test('MR-021b', 'AI feature toggles gate translate and summarize', async () => {
  await resetSettings();
  await setApiKey('test-key');
  await setSettings({
    ai: { vendor: 'custom', provider: 'openai', baseUrl: `http://127.0.0.1:${aiPort}/v1`, model: 'mock-model', configured: true },
    enableTranslate: true,
    enableSummary: true,
  });
  aiRequests = [];
  const p = await openReader();
  const popup = await openPopup();
  await popup.click('.popup-feature[data-key="aiSummary"]');
  await p.waitForTimeout(250);
  await p.click('[data-action="summarize-all"]');
  await p.waitForTimeout(500);
  assertEq(aiRequests.length, 0, 'summarize toggle off must not call the model');
  assert((await p.textContent('#md-ai-body')).includes('已关闭'), 'reader explains the disabled summary');
  await popup.click('.popup-feature[data-key="aiSummary"]');
  await popup.waitForTimeout(200);
  await popup.close();

  // translate off → no translate action in the selection popover
  await resetSettings();
  await setApiKey('test-key');
  await setSettings({
    ai: { vendor: 'custom', provider: 'openai', baseUrl: `http://127.0.0.1:${aiPort}/v1`, model: 'mock-model', configured: true },
    enableTranslate: false,
    enableSummary: true,
  });
  const p2 = await openReader();
  await p2.evaluate(() => {
    const para = document.querySelector('.md-content-inner p');
    const r = document.createRange(); r.selectNodeContents(para);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await p2.waitForSelector('.md-ai-popover.md-ai-show', { timeout: 3000 });
  const translateVisible = await p2.evaluate(() => {
    const b = document.querySelector('.md-ai-popover [data-ai-action="translate"]');
    return !!b && getComputedStyle(b).display !== 'none';
  });
  assert(!translateVisible, 'translate action should be hidden when disabled');
  return shot(p2, 'MR-021b-ai-toggles');
});

test('MR-022', 'External link opens the original page per source type', async () => {
  await resetSettings();
  const p = await openReader();
  assert(await p.$('[data-action="open-original"]'), 'external-link toolbar button missing');
  const [newPage] = await Promise.all([
    ctx.waitForEvent('page'),
    p.click('[data-action="open-original"]'),
  ]);
  const url = newPage.url();
  if (/^view-source:file:\/\//.test(url)) {
    // expected on platforms that preserve view-source
  } else {
    // Some builds strip view-source; the fallback is only acceptable if that
    // tab really shows the raw file (reader did NOT mount).
    assert(url.startsWith('file://') && url.includes('features.md'), 'file:// original URL unexpected: ' + url);
    assertEq(await newPage.locator('#md-reader-root').count(), 0, 'non-view-source original tab must not mount the reader');
  }
  await newPage.close();

  // Raw URL → view-source of the raw document.
  const rawPage = await openPage(`http://127.0.0.1:${httpPort}/features.md`);
  const [rawOriginal] = await Promise.all([
    ctx.waitForEvent('page'),
    rawPage.click('[data-action="open-original"]'),
  ]);
  assert(/127\.0\.0\.1/.test(rawOriginal.url()) && /pagesew=original/.test(rawOriginal.url()), 'raw original should open the untouched document, got ' + rawOriginal.url());
  // The original tab must NOT be re-intercepted by the reader.
  assertEq(await rawOriginal.locator('#md-reader-root').count(), 0, 'original raw tab should not mount the reader');
  await rawOriginal.close();

  // GitHub blob → original blob URL (not raw, not view-source).
  await addRoute('https://github.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await stubRawFetch('# Blob Doc\n\nbody\n\n- one\n- two\n');
  const p2 = await openPage('https://github.com/acme/demo/blob/main/README.md', { reader: false });
  await p2.waitForSelector('#md-reader-fab');
  await p2.click('[data-action="open-reader"]');
  await p2.waitForSelector('#md-reader-root');
  // Headless Chromium does not surface extension-created tabs as Playwright
  // pages, so record the REAL chrome.tabs.create calls (delegating wrapper)
  // and assert the exact URL that was opened.
  await swEval(() => {
    const realCreate = chrome.tabs.create.bind(chrome.tabs);
    globalThis.__realCreate = realCreate;
    globalThis.__createdTabs = [];
    chrome.tabs.create = async (opts) => {
      const tab = await realCreate(opts);
      globalThis.__createdTabs.push({ url: opts && opts.url, id: tab && tab.id });
      return tab;
    };
  });
  await p2.click('[data-action="open-original"]');
  await p2.waitForTimeout(600);
  const created = await swEval(() => globalThis.__createdTabs || []);
  assert(created.some(t => t.url === 'https://github.com/acme/demo/blob/main/README.md' && t.id != null),
    'GitHub original URL should open in a new tab, got ' + JSON.stringify(created));
  await swEval(() => { if (globalThis.__realCreate) chrome.tabs.create = globalThis.__realCreate; });
  await restoreRawFetch();
  return shot(p2, 'MR-022-external-link');
});

test('MR-023a', 'Local file tree lists sibling files and navigates', async () => {
  await resetSettings();
  const p = await openReader();
  await p.waitForFunction(() => {
    const items = document.querySelectorAll('#md-file-tree .md-tree-item');
    return items.length >= 3;
  }, null, { timeout: 8000 });
  const names = await p.evaluate(() => Array.from(document.querySelectorAll('#md-file-tree .md-tree-text')).map(e => e.textContent));
  assert(names.some(n => n.includes('features.md')), 'features.md missing: ' + names.join(','));
  assert(names.some(n => n.includes('other.md')), 'other.md missing: ' + names.join(','));
  await p.evaluate(() => {
    const item = Array.from(document.querySelectorAll('#md-file-tree .md-tree-item')).find(e => e.textContent.includes('other.md'));
    item.click();
  });
  await p.waitForFunction(() => (document.querySelector('.md-content-inner') || {}).textContent.includes('Other File'), null, { timeout: 8000 });
  assert(p.url().endsWith('other.md'), 'URL should switch to other.md, got ' + p.url());
  return shot(p, 'MR-023-local-tree');
});

test('MR-023b', 'GitHub / GitLab / Bitbucket trees use provider APIs', async () => {
  await resetSettings();

  // GitHub Contents API
  await addRoute('https://github.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await addRoute('https://api.github.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([
      { name: 'guide.md', path: 'docs/guide.md', type: 'file' },
      { name: 'more.md', path: 'docs/more.md', type: 'file' },
      { name: 'assets', path: 'docs/assets', type: 'dir' },
    ]),
  }));
  await stubRawFetch('# Guide\n\nbody\n\n- one\n- two\n');
  const gh = await openPage('https://github.com/acme/demo/blob/main/docs/guide.md', { reader: false });
  await gh.waitForSelector('#md-reader-fab');
  await gh.click('[data-action="open-reader"]');
  await gh.waitForSelector('#md-reader-root');
  await gh.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 4, null, { timeout: 8000 });
  let names = await gh.evaluate(() => Array.from(document.querySelectorAll('#md-file-tree .md-tree-text')).map(e => e.textContent));
  assert(names.some(n => n.includes('more.md')), 'GitHub: more.md missing ' + names.join(','));
  assert(names.some(n => n.includes('assets')), 'GitHub: directory missing ' + names.join(','));

  // Clicking a remote tree entry must soft-render by fetching the RAW URL only.
  await stubRawFetch('# More Doc\n\nloaded from the sibling file\n\n- one\n- two\n');
  await gh.evaluate(() => {
    const item = Array.from(document.querySelectorAll('#md-file-tree .md-tree-item')).find(e => e.textContent.includes('more.md'));
    item.click();
  });
  await gh.waitForFunction(() => (document.querySelector('.md-content-inner') || {}).textContent.includes('More Doc'), null, { timeout: 8000 });
  assert(/\/blob\/main\/docs\/more\.md$/.test(gh.url()), 'reader URL should stay on the blob page, got ' + gh.url());

  // GitLab tree API
  await addRoute('https://gitlab.com/**', route => {
    if (route.request().url().includes('/api/v4/')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([
          { name: 'guide.md', path: 'docs/guide.md', type: 'blob' },
          { name: 'more.md', path: 'docs/more.md', type: 'blob' },
          { name: 'assets', path: 'docs/assets', type: 'tree' },
        ]),
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML });
  });
  await stubRawFetch('# GitLab Guide\n\nbody\n\n- one\n- two\n');
  const gl = await openPage('https://gitlab.com/group/proj/-/blob/main/docs/guide.md', { reader: false });
  await gl.waitForSelector('#md-reader-fab');
  await gl.click('[data-action="open-reader"]');
  await gl.waitForSelector('#md-reader-root');
  await gl.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 4, null, { timeout: 8000 });
  names = await gl.evaluate(() => Array.from(document.querySelectorAll('#md-file-tree .md-tree-text')).map(e => e.textContent));
  assert(names.some(n => n.includes('more.md')), 'GitLab: more.md missing ' + names.join(','));

  // Bitbucket src API
  await addRoute('https://bitbucket.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await addRoute('https://api.bitbucket.org/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ values: [
      { type: 'commit_file', path: 'docs/guide.md' },
      { type: 'commit_file', path: 'docs/more.md' },
      { type: 'commit_directory', path: 'docs/assets' },
    ] }),
  }));
  await stubRawFetch('# Bitbucket Guide\n\nbody\n\n- one\n- two\n');
  const bb = await openPage('https://bitbucket.org/team/repo/src/main/docs/guide.md', { reader: false });
  await bb.waitForSelector('#md-reader-fab');
  await bb.click('[data-action="open-reader"]');
  await bb.waitForSelector('#md-reader-root');
  await bb.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 4, null, { timeout: 8000 });
  names = await bb.evaluate(() => Array.from(document.querySelectorAll('#md-file-tree .md-tree-text')).map(e => e.textContent));
  assert(names.some(n => n.includes('more.md')), 'Bitbucket: more.md missing ' + names.join(','));
  await restoreRawFetch();
  return shot(bb, 'MR-023-providers');
});

test('MR-023d', 'Provider paths with spaces are encoded exactly once', async () => {
  await resetSettings();
  const apiUrls = [];
  await addRoute('https://github.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await addRoute('https://api.github.com/**', route => {
    apiUrls.push(route.request().url());
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([
        { name: 'guide.md', path: 'docs/my dir/guide.md', type: 'file' },
        { name: 'more.md', path: 'docs/my dir/more.md', type: 'file' },
      ]),
    });
  });
  await stubRawFetch('# Encoded Guide\n\nbody\n\n- one\n- two\n');
  const p = await openPage('https://github.com/acme/demo/blob/main/docs/my%20dir/guide.md', { reader: false });
  await p.waitForSelector('#md-reader-fab');
  await p.click('[data-action="open-reader"]');
  await p.waitForSelector('#md-reader-root');
  await p.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 3, null, { timeout: 8000 });
  assert(apiUrls.some(u => u.includes('/contents/docs/my%20dir')), 'API path should keep %20, got ' + JSON.stringify(apiUrls));
  assert(!apiUrls.some(u => u.includes('%2520')), 'API path must not be double-encoded, got ' + JSON.stringify(apiUrls));
  const current = await p.evaluate(() => {
    const el = document.querySelector('#md-file-tree .md-tree-active');
    return el ? el.textContent : '';
  });
  assert(current.includes('guide.md'), 'current file should match the decoded API path, got ' + current);
  await restoreRawFetch();
  return shot(p, 'MR-023d-encoded-path');
});

test('MR-023c', 'Tree failure shows an explicit empty state with Retry', async () => {
  await resetSettings();
  await addRoute('https://github.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await addRoute('https://api.github.com/**', route => route.fulfill({ status: 500, body: 'boom' }));
  await stubRawFetch('# Broken Tree\n\nbody\n\n- one\n- two\n');
  const p = await openPage('https://github.com/acme/demo/blob/main/README.md', { reader: false });
  await p.waitForSelector('#md-reader-fab');
  await p.click('[data-action="open-reader"]');
  await p.waitForSelector('#md-reader-root');
  await p.waitForSelector('.md-tree-empty', { timeout: 8000 });
  const text = await p.textContent('.md-tree-empty');
  assert(/GitHub API error/.test(text), 'explicit error copy, got ' + text);
  assert(await p.locator('.md-tree-retry').count() === 1, 'retry button missing');
  await restoreRawFetch();
  return shot(p, 'MR-023-tree-error');
});

test('MR-024', 'Side panel browser lists cached reader files and navigates', async () => {
  await resetSettings();
  const reader = await openReader();
  // Content answers requestFileTree from its cache.
  const cached = await swEval(async () => {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      try {
        const resp = await chrome.tabs.sendMessage(t.id, { type: 'requestFileTree' });
        if (resp && resp.data && resp.data.length) return resp;
      } catch (_) {}
    }
    return null;
  });
  assert(cached && cached.data.length >= 2, 'content did not return a cached tree');

  // Open the real side-panel document as a tab; it asks the SW for the reader.
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidebar/sidebar.html`);
  await panel.waitForSelector('.tree-file', { timeout: 8000 });
  const names = await panel.evaluate(() => Array.from(document.querySelectorAll('.tree-name')).map(e => e.textContent));
  assert(names.some(n => n.includes('features.md')), 'panel should list features.md: ' + names.join(','));
  assert(names.some(n => n.includes('other.md')), 'panel should list other.md: ' + names.join(','));
  assert(await panel.locator('.tree-item.current').count() >= 1, 'panel should mark the current file');

  // Clicking a file asks the reader tab to navigate.
  await panel.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.tree-file')).find(e => e.textContent.includes('other.md'));
    item.querySelector('.tree-item').click();
  });
  await reader.waitForFunction(() => (document.querySelector('.md-content-inner') || {}).textContent.includes('Other File'), null, { timeout: 8000 });

  // Entry points exist in the reader toolbar and the popup.
  assert(await reader.$('[data-action="browse-files"]'), 'toolbar browse-files entry missing');
  const popup = await openPopup();
  assert(await popup.$('#popupBrowseFiles'), 'popup browse-files entry missing');
  await popup.close();
  return shot(panel, 'MR-024-side-panel');
});

test('MR-024b', 'Remote side panel ignores non-reader tabs and navigates provider files', async () => {
  await resetSettings();
  await addRoute('https://github.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await addRoute('https://api.github.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([
      { name: 'guide.md', path: 'docs/guide.md', type: 'file' },
      { name: 'more.md', path: 'docs/more.md', type: 'file' },
    ]),
  }));
  await stubRawFetch('# Guide\n\nbody\n\n- one\n- two\n');
  const reader = await openPage('https://github.com/acme/demo/blob/main/docs/guide.md', { reader: false });
  await reader.waitForSelector('#md-reader-fab');

  // Before the reader mounts, the blob tab must not be mistaken for a reader.
  const panel1 = await ctx.newPage();
  await panel1.goto(`chrome-extension://${extId}/sidebar/sidebar.html`);
  await panel1.waitForSelector('.tree-empty', { timeout: 8000 });
  assert((await panel1.textContent('.tree-empty')).includes('Open a .md file'), 'panel should not show a fake tree for a non-reader tab');
  await panel1.close();

  await reader.click('[data-action="open-reader"]');
  await reader.waitForSelector('#md-reader-root');
  await reader.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 3, null, { timeout: 8000 });

  const panel2 = await ctx.newPage();
  await panel2.goto(`chrome-extension://${extId}/sidebar/sidebar.html`);
  await panel2.waitForSelector('.tree-file', { timeout: 8000 });
  await stubRawFetch('# More Remote\n\nloaded via the side panel\n\n- one\n- two\n');
  await panel2.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.tree-file')).find(e => e.textContent.includes('more.md'));
    item.querySelector('.tree-item').click();
  });
  await reader.waitForFunction(() => (document.querySelector('.md-content-inner') || {}).textContent.includes('More Remote'), null, { timeout: 8000 });
  assert(/\/blob\/main\/docs\/more\.md$/.test(reader.url()), 'remote navigation should keep the blob URL, got ' + reader.url());
  await panel2.waitForFunction(() => {
    const cur = document.querySelector('.tree-item.current');
    return cur && cur.textContent.includes('more.md');
  }, null, { timeout: 5000 });
  await restoreRawFetch();
  return shot(panel2, 'MR-024b-remote-panel');
});

test('MR-024c', 'Rapid file clicks cannot let a slow response overwrite the latest', async () => {
  await resetSettings();
  await addRoute('https://github.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: BLOB_HTML }));
  await addRoute('https://api.github.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([
      { name: 'README.md', path: 'docs/README.md', type: 'file' },
      { name: 'guide.md', path: 'docs/guide.md', type: 'file' },
      { name: 'more.md', path: 'docs/more.md', type: 'file' },
    ]),
  }));
  await swEval(() => {
    globalThis.__mrOrigFetch = globalThis.__mrOrigFetch || globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('raw.githubusercontent.com')) {
        if (u.includes('guide.md')) await new Promise(r => setTimeout(r, 900));
        const text = u.includes('guide.md') ? '# Slow Guide\n\nslow body\n\n- one\n- two\n'
          : (u.includes('more.md') ? '# Fast More\n\nfast body\n\n- one\n- two\n'
          : '# Initial Readme\n\ninitial body\n\n- one\n- two\n');
        return new Response(text, { status: 200 });
      }
      return globalThis.__mrOrigFetch(url, init);
    };
  });
  const p = await openPage('https://github.com/acme/demo/blob/main/docs/README.md', { reader: false });
  await p.waitForSelector('#md-reader-fab');
  await p.click('[data-action="open-reader"]');
  await p.waitForSelector('#md-reader-root');
  await p.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 4, null, { timeout: 8000 });
  await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#md-file-tree .md-tree-item'));
    items.find(e => e.textContent.includes('guide.md')).click();
    setTimeout(() => items.find(e => e.textContent.includes('more.md')).click(), 30);
  });
  await p.waitForFunction(() => (document.querySelector('.md-content-inner') || {}).textContent.includes('Fast More'), null, { timeout: 8000 });
  await p.waitForTimeout(1100); // let the slow guide response land
  const final = await p.evaluate(() => ({
    text: document.querySelector('.md-content-inner').textContent,
    file: document.querySelector('.md-filename').textContent,
  }));
  assert(final.text.includes('Fast More') && !final.text.includes('Slow Guide'), 'slow response overwrote the newer file: ' + final.text.slice(0, 80));
  assertEq(final.file, 'more.md', 'filename should stay on the newest click');
  await restoreRawFetch();
  return shot(p, 'MR-024c-nav-race');
});

test('MR-025', 'TOC headings clamp to two lines with an ellipsis', async () => {
  await resetSettings();
  const p = await openReader();
  const data = await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.md-outline-item'));
    const long = items.find(i => i.textContent.includes('A very long outline heading'));
    const short = items.find(i => i.textContent.includes('Feature Fixture'));
    const cs = getComputedStyle(long);
    return {
      clamp: cs.webkitLineClamp,
      whiteSpace: cs.whiteSpace,
      longHeight: long.getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight),
      shortHeight: short.getBoundingClientRect().height,
      scrollHeight: long.scrollHeight,
      clientHeight: long.clientHeight,
    };
  });
  assertEq(data.clamp, '2', 'line clamp');
  assertEq(data.whiteSpace, 'normal', 'heading should wrap');
  assert(data.longHeight > data.lineHeight + 12, 'long heading should occupy two lines, height=' + data.longHeight);
  assert(data.longHeight <= data.lineHeight * 2 + 13, 'long heading must not exceed two lines, height=' + data.longHeight);
  assert(data.longHeight > data.shortHeight, 'long heading taller than a one-line heading');
  return shot(p, 'MR-025-outline-clamp');
});

test('MR-026', 'TOC indentation steps by 0.618em per heading level', async () => {
  await resetSettings();
  const p = await openReader();
  const pads = await p.evaluate(() => {
    const out = {};
    for (let i = 1; i <= 6; i++) {
      const el = document.querySelector('.md-outline-h' + i);
      out[i] = el ? parseFloat(getComputedStyle(el).paddingLeft) : null;
    }
    return out;
  });
  for (let i = 1; i <= 6; i++) assert(pads[i] != null, 'outline level h' + i + ' missing');
  // 0.618em × 13px base = 8.034px
  for (let i = 2; i <= 6; i++) {
    assertNear(pads[i] - pads[i - 1], 8.034, 0.2, 'level ' + i + ' indent step (pads=' + JSON.stringify(pads) + ')');
  }
  assertNear(pads[1], 14, 0.2, 'h1 base indent');
  return shot(p, 'MR-026-golden-indent');
});

test('MR-028', 'highlight.js adds tokens and theme-specific colors', async () => {
  await resetSettings();
  const p = await openReader();
  const code = await p.evaluate(() => {
    const block = document.querySelector('.md-content pre code');
    return {
      hasHljs: block.classList.contains('hljs'),
      tokens: block.querySelectorAll('span[class^="hljs-"]').length,
      keyword: (() => { const k = block.querySelector('.hljs-keyword'); return k ? getComputedStyle(k).color : ''; })(),
      string: (() => { const s = block.querySelector('.hljs-string'); return s ? getComputedStyle(s).color : ''; })(),
      bg: getComputedStyle(block).backgroundColor,
    };
  });
  assert(code.hasHljs, 'code element should carry the hljs class');
  assert(code.tokens >= 3, 'expected highlighted token spans, got ' + code.tokens);
  assert(code.keyword && code.string && code.keyword !== code.string, 'keyword/string should be distinct colors');
  // Theme switch changes the palette (nord vs light).
  const lightColors = code.keyword;
  const popup = await openPopup();
  await popup.click('.popup-theme-btn[data-theme="nord"]');
  await p.waitForTimeout(350);
  const nord = await p.evaluate(() => {
    const k = document.querySelector('.md-content pre code .hljs-keyword');
    return k ? getComputedStyle(k).color : '';
  });
  assert(nord && nord !== lightColors, 'highlight palette should follow the theme (' + lightColors + ' → ' + nord + ')');

  // Every one of the 7 themes must ship a token palette.
  const palettes = { light: lightColors };
  for (const t of ['light-indigo', 'dark', 'nord', 'solarized', 'dracula', 'tokyo-night']) {
    await popup.click(`.popup-theme-btn[data-theme="${t}"]`);
    await p.waitForTimeout(200);
    palettes[t] = await p.evaluate(() => {
      const k = document.querySelector('.md-content pre code .hljs-keyword');
      return k ? getComputedStyle(k).color : '';
    });
  }
  Object.entries(palettes).forEach(([t, c]) => assert(c, 'missing hljs keyword color for theme ' + t));
  await popup.close();
  return shot(p, 'MR-028-highlight');
});

test('MR-027b', 'Host permission is ensured on vendor, key, test and config-close', async () => {
  await resetSettings();
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/popup.html?standalone=1`);
  await popup.waitForSelector('.popup-container');
  // Instrument the REAL chrome.permissions API (delegating, not faking).
  await popup.evaluate(() => {
    window.__permCalls = [];
    const record = (kind, arg) => {
      const entry = kind + ':' + JSON.stringify(arg || null);
      window.__permCalls.push(entry);
      try { chrome.storage.local.set({ __permCalls: window.__permCalls }); } catch (_) {}
    };
    const realRequest = chrome.permissions.request.bind(chrome.permissions);
    const realContains = chrome.permissions.contains.bind(chrome.permissions);
    // Delegate to the REAL API, but never let a native permission dialog hang
    // the headless run: resolve false after 1.5s without faking a grant.
    chrome.permissions.request = (p) => {
      record('request', p);
      return Promise.race([
        Promise.resolve(realRequest(p)).catch(() => false),
        new Promise(resolve => setTimeout(() => resolve(false), 1500)),
      ]);
    };
    chrome.permissions.contains = (p) => { record('contains', p); return realContains(p); };
  });
  // vendor change
  await popup.selectOption('#aiVendor', 'deepseek');
  await popup.waitForTimeout(200);
  // Base URL save + key save
  await popup.fill('#aiBaseUrl', `http://127.0.0.1:${aiPort}/v1`);
  await popup.dispatchEvent('#aiBaseUrl', 'change');
  await popup.waitForTimeout(200);
  await popup.fill('#aiApiKey', 'test-key');
  await popup.dispatchEvent('#aiApiKey', 'change');
  await popup.waitForTimeout(300);
  // test connection (local server)
  await popup.click('#aiTestBtn');
  await popup.waitForTimeout(1500);
  const callsBeforeDone = await swEval(async () => (await chrome.storage.local.get('__permCalls')).__permCalls || []);
  assert(callsBeforeDone.some(c => c.includes('api.deepseek.com')), 'vendor change should request the vendor origin: ' + JSON.stringify(callsBeforeDone));
  assert(callsBeforeDone.some(c => c.includes('127.0.0.1')), 'key/base-url save should request the endpoint origin');
  assert(callsBeforeDone.filter(c => c.startsWith('request')).length >= 3, 'request should be ensured at every stage: ' + JSON.stringify(callsBeforeDone));

  // Closing the config page also ensures access (then the SW closes the tab).
  const tabId = await swEval(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.length;
  });
  await popup.click('#aiDoneBtn').catch(() => {});
  await popup.waitForTimeout(800);
  const callsAfterDone = await swEval(async () => (await chrome.storage.local.get('__permCalls')).__permCalls || []);
  assert(callsAfterDone.length > callsBeforeDone.length, 'config-close should ensure permission before leaving: ' + JSON.stringify(callsAfterDone));
  return '';
});

// ===========================================================================
//  runner
// ===========================================================================

function selectTests() {
  if (!ONLY) return tests;
  return tests.filter(t => (t.id + ' ' + t.name).toLowerCase().includes(ONLY.toLowerCase()));
}

async function main() {
  log('');
  log('=== PageSew real-extension E2E ===');
  log('  Extension: ' + ROOT_DIR);
  log('  Headless:  ' + HEADLESS);
  log('');
  await setup();
  const selected = selectTests();
  for (const t of selected) {
    const start = Date.now();
    let shots = [];
    try {
      await closeAll();
      const out = await Promise.race([
        t.fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after ' + TEST_TIMEOUT + 'ms')), TEST_TIMEOUT)),
      ]);
      if (out && out.screenshots) shots = out.screenshots;
      else if (typeof out === 'string' && out) shots = [out];
      results.push({ id: t.id, name: t.name, status: 'PASS', ms: Date.now() - start, screenshots: shots });
      log('  \x1b[32mPASS\x1b[0m  ' + t.id + '  ' + t.name + '  (' + ((Date.now() - start) / 1000).toFixed(1) + 's)');
    } catch (err) {
      const page = ctx.pages()[ctx.pages().length - 1];
      if (page) { const s = await shot(page, t.id + '-FAIL'); if (s) shots = [s]; }
      results.push({ id: t.id, name: t.name, status: 'FAIL', ms: Date.now() - start, error: err.message, screenshots: shots });
      log('  \x1b[31mFAIL\x1b[0m  ' + t.id + '  ' + t.name);
      log('        ' + String(err.message).split('\n')[0]);
    }
    // Reset per-test network stubs / routes.
    try { await clearRoutes(); } catch (_) {}
    try {
      await swEval(() => { if (globalThis.__mrOrigFetch) globalThis.fetch = globalThis.__mrOrigFetch; });
    } catch (_) {}
  }
  await teardown();

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.length - passed;
  log('');
  log('--'.repeat(28));
  log('  Total: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + failed);
  if (failed) {
    log('  Failures:');
    results.filter(r => r.status === 'FAIL').forEach(r => log('   * ' + r.id + '  ' + r.error));
  }
  log('');
  const summaryPath = path.join(EVIDENCE_DIR, ONLY ? 'results-only.json' : 'results.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ ranAt: new Date().toISOString(), extId, results }, null, 2));
  log('  Results JSON: ' + summaryPath);
  process.exitCode = failed ? 1 : 0;
}

main().catch(async e => {
  console.error('FATAL', e);
  await teardown();
  process.exit(2);
});
