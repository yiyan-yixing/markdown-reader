/* ===========================================================================
 * Markdown Reader — Automated E2E Test Suite
 *
 * Injects content script via page.addInitScript (with mocked chrome APIs)
 * for reliable headless testing.
 *
 * Tests:
 *   [01] Reader UI loads and renders markdown
 *   [02] File tree sidebar renders with current file highlighted
 *   [03] TOC outline extracts headings with heading anchors
 *   [04] Search highlights matches with count display
 *   [05] Search keyboard navigation (Enter, Esc)
 *   [06] Code copy button exists on all code blocks
 *   [07] Theme toggle light / dark / back to light
 *   [08] Font size A+ increases, A- decreases
 *   [09] Settings panel opens, toggles features, closes
 *   [10] Popup HTML loads and shows UI
 *   [11] Sidebar HTML loads and shows UI
 *   [12] Sidebar search with keyboard navigation
 *   [13] Sidebar tree directory collapse/expand
 *   [14] Responsive narrow-mode sidebar toggle
 *   [15] Rendered markdown features (tables, lists, quotes, code)
 *
 *  Every failure saves a screenshot to tests/screenshots/.
 * ========================================================================== */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// -- Configuration ----------------------------------------------------------
const ROOT_DIR        = path.resolve(__dirname, '..');
const SCREENSHOT_DIR  = path.resolve(__dirname, 'screenshots');
const SAMPLE_MD_PATH  = path.join(ROOT_DIR, 'sample.md');
const SAMPLE_MD       = fs.readFileSync(SAMPLE_MD_PATH, 'utf-8');
const USER_DATA_DIR   = path.join(os.tmpdir(), 'md-reader-test-' + Date.now());
const TEST_TIMEOUT    = 15000;
const HEADLESS        = process.env.HEADLESS === 'true';

// -- Test state -------------------------------------------------------------
let passed = 0, failed = 0, failedEntries = [];
let context = null, page = null, server = null, serverUrl = '';

// -- Helpers ----------------------------------------------------------------

function PASS(name) {
  passed++;
  console.log('  \x1b[32mPASS\x1b[0m  ' + name);
}

function FAIL(name, err) {
  failed++;
  var msg = err ? (err.message || String(err)) : 'Assertion failed';
  failedEntries.push({ name: name, msg: msg });
  console.log('  \x1b[31mFAIL\x1b[0m  ' + name);
  console.log('        ' + msg.split('\n')[0]);
}

async function snap(name) {
  try {
    var safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, Date.now() + '_' + safe + '.png') });
  } catch (_) {}
}

async function runTest(name, fn) {
  var start = Date.now();
  context.setDefaultTimeout(TEST_TIMEOUT);
  try {
    await fn();
    PASS(name);
  } catch (err) {
    await snap(name);
    FAIL(name, err);
  }
  var elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('         (' + elapsed + 's)');
}

// -- HTTP server ------------------------------------------------------------

function startServer() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      if (req.url.indexOf('.md') !== -1) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<html><head></head><body>' +
          '<pre style="word-wrap:break-word;white-space:pre-wrap;">' +
          SAMPLE_MD.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
          '</pre></body></html>'
        );
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    srv.listen(0, '127.0.0.1', function () {
      var port = srv.address().port;
      serverUrl = 'http://127.0.0.1:' + port;
      server = srv;
      console.log('  HTTP server on port ' + port);
      resolve(srv);
    });
  });
}

function stopServer() {
  try { if (server) server.close(); } catch (_) {}
}

// -- Chrome API mock (runs in page context) ---------------------------------

function makeChromeMock() {
  // Returns source string for addInitScript
  return [
    'window.chrome = window.chrome || {};',
    'window.chrome.runtime = window.chrome.runtime || {',
    '  id: "mock-ext-id",',
    '  getManifest: function() { return { version: "1.0.0" }; },',
    '  getURL: function(p) { return "chrome-extension://mock-ext-id/" + p; },',
    '  sendMessage: function() {},',
    '  onMessage: { addListener: function() {}, removeListener: function() {} },',
    '};',
    'window.chrome.storage = window.chrome.storage || {',
    '  sync: {',
    '    get: function(keys, cb) { if (cb) setTimeout(function() { cb({ mdReaderSettings: {} }); }, 0); },',
    '    set: function() {},',
    '    remove: function() {},',
    '    clear: function() {},',
    '  },',
    '};',
    'window.chrome.tabs = window.chrome.tabs || {',
    '  query: function(q, cb) { if (cb) cb([{ id: 1, url: "" }]); },',
    '  sendMessage: function() { return { catch: function() { return this; } }; },',
    '};',
    'window.chrome.sidePanel = window.chrome.sidePanel || {',
    '  setPanelBehavior: function() { return { catch: function() {} }; },',
    '};',
  ].join('\n');
}

// -- Inject content script + deps into a fresh page -------------------------

async function prepareReaderPage(p) {
  // Mock chrome APIs
  await p.addInitScript({
    content: makeChromeMock(),
  });
  // marked
  await p.addInitScript({
    content: fs.readFileSync(path.join(ROOT_DIR, 'lib/marked.min.js'), 'utf-8'),
  });
  // highlight.js
  await p.addInitScript({
    content: fs.readFileSync(path.join(ROOT_DIR, 'lib/highlight.min.js'), 'utf-8'),
  });
  // content script
  await p.addInitScript({
    content: fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf-8'),
  });
}

// -- Inject CSS -------------------------------------------------------------

async function injectCSS(p) {
  var cssFiles = [
    'content/content.css',
    'styles/reader.css',
    'styles/themes/dark.css',
    'styles/themes/light.css',
  ];
  var combined = cssFiles.map(function (f) {
    return fs.readFileSync(path.join(ROOT_DIR, f), 'utf-8');
  }).join('\n');
  await p.addStyleTag({ content: combined });
}

// -- Sidebar chrome mock (for standalone sidebar test) ----------------------

function makeSidebarChromeMock() {
  return [
    'window.chrome = {',
    '  runtime: {',
    '    id: "mock",',
    '    onMessage: { addListener: function() {}, removeListener: function() {} },',
    '    sendMessage: function() {},',
    '  },',
    '  storage: { sync: { get: function(k, cb) { setTimeout(function() { cb({}); }, 0); }, set: function() {} } },',
    '  tabs: {',
    '    query: function(q, cb) { if (cb) setTimeout(function() { cb([{ id: 1 }]); }, 0); },',
    '    sendMessage: function() { return { then: function() { return this; }, catch: function() { return this; } }; },',
    '  },',
    '};',
  ].join('\n');
}

// -- Summary ----------------------------------------------------------------

function printSummary() {
  var total = passed + failed;
  console.log('');
  console.log('--'.repeat(25));
  console.log('  Total: ' + total + '  |  \x1b[32mPASS: ' + passed + '\x1b[0m  |  \x1b[31mFAIL: ' + failed + '\x1b[0m');
  if (failed > 0) {
    console.log('');
    for (var i = 0; i < failedEntries.length; i++) {
      console.log('  \x1b[31m*\x1b[0m ' + failedEntries[i].name);
      console.log('    ' + failedEntries[i].msg.split('\n')[0]);
    }
    console.log('\n  Screenshots: ' + SCREENSHOT_DIR);
  }
  if (passed === total) console.log('\n\x1b[32mAll tests passed!\x1b[0m');
}

// -- Cleanup ----------------------------------------------------------------

async function cleanup() {
  try { stopServer(); } catch (_) {}
  try { if (context) await context.close(); } catch (_) {}
  try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}

// ===========================================================================
//  MAIN
// ===========================================================================

async function main() {
  console.log('');
  console.log('=== Markdown Reader -- Automated E2E Test Suite ===');
  console.log('  Project:  ' + ROOT_DIR);
  console.log('  Screens:  ' + SCREENSHOT_DIR);
  console.log('  Headless: ' + HEADLESS);
  console.log('');

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Start HTTP server
  await startServer();
  var MD_URL = serverUrl + '/sample.md';

  // Launch browser
  console.log('  Launching Chromium...');
  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });
  context.setDefaultTimeout(TEST_TIMEOUT);
  page = await context.newPage();

  // =====================================================================
  //  01  Reader UI loads
  // =====================================================================
  await runTest('01. Reader UI loads and renders sample.md', async function () {
    var p = await context.newPage();
    await prepareReaderPage(p);
    await p.goto(MD_URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#md-reader-root', { timeout: 10000 });
    await p.waitForSelector('.md-content-inner', { timeout: 5000 });
    await injectCSS(p);

    var text = await p.textContent('.md-content-inner');
    if (text.indexOf('Markdown Reader') === -1) throw new Error('Expected "Markdown Reader"');
    if (text.indexOf('Sample Document') === -1) throw new Error('Expected "Sample Document"');
    if (text.indexOf('Features') === -1) throw new Error('Expected "Features"');
    if (text.indexOf('function greet') === -1) throw new Error('Expected JS code');
    if (text.indexOf('@dataclass') === -1) throw new Error('Expected Python code');

    await page.close();
    page = p;
  });

  // =====================================================================
  //  02  File tree sidebar
  // =====================================================================
  await runTest('02. File tree sidebar with current file', async function () {
    var tree = await page.waitForSelector('.md-sidebar-tree', { timeout: 5000 });
    var text = await tree.textContent();
    if (text.indexOf('sample.md') === -1) throw new Error('Expected "sample.md" in tree');

    var active = await page.$('.md-tree-item.md-tree-active');
    if (!active) throw new Error('Expected .md-tree-active');
    var aText = await active.textContent();
    if (aText.indexOf('sample.md') === -1) throw new Error('Active file mismatch');
  });

  // =====================================================================
  //  03  TOC outline
  // =====================================================================
  await runTest('03. TOC outline with headings + anchors', async function () {
    var list = await page.waitForSelector('.md-outline-list', { timeout: 5000 });
    var items = await list.$$('.md-outline-item');
    if (items.length < 5) throw new Error('Expected >=5 items, got ' + items.length);

    var text = await list.textContent();
    var expected = ['Features', 'Code Examples', 'JavaScript', 'Table Example'];
    for (var i = 0; i < expected.length; i++) {
      if (text.indexOf(expected[i]) === -1) throw new Error('Missing "' + expected[i] + '"');
    }

    var anchors = await page.$$('.md-heading-anchor');
    if (anchors.length < 5) throw new Error('Expected >=5 anchors, got ' + anchors.length);
  });

  // =====================================================================
  //  04  Search highlights
  // =====================================================================
  await runTest('04. Search highlights with count', async function () {
    var input = await page.$('.md-search-input');
    if (!input) throw new Error('Search input missing');
    await input.fill('Markdown');
    await page.waitForTimeout(600);

    var highlights = await page.$$('.md-search-highlight');
    if (highlights.length === 0) throw new Error('Expected >=1 highlight');

    var countText = await page.textContent('.md-search-count');
    if (!countText || countText.indexOf('/') === -1)
      throw new Error('Expected count "X/Y", got "' + countText + '"');

    await page.click('[data-action="search-next"]');
    await page.waitForTimeout(100);
    if (!(await page.$('.md-search-highlight.current')))
      throw new Error('Expected .current after next');

    await page.click('[data-action="search-prev"]');
    await page.waitForTimeout(100);
  });

  // =====================================================================
  //  05  Search keyboard
  // =====================================================================
  await runTest('05. Search keyboard (Enter, Esc)', async function () {
    var input = await page.$('.md-search-input');
    if (!input) throw new Error('Search input missing');
    await input.fill('Markdown');
    await page.waitForTimeout(500);

    await input.press('Enter');
    await page.waitForTimeout(100);
    await input.press('Shift+Enter');
    await page.waitForTimeout(100);

    await input.press('Escape');
    await page.waitForTimeout(300);
    if ((await input.inputValue()) !== '') throw new Error('Expected empty after Esc');
  });

  // =====================================================================
  //  06  Code copy button
  // =====================================================================
  await runTest('06. Code copy button on code blocks', async function () {
    var blocks = await page.$$('.md-code-block');
    if (blocks.length === 0) throw new Error('Expected code blocks');

    for (var i = 0; i < blocks.length; i++) {
      if (!(await blocks[i].$('.md-copy-btn')))
        throw new Error('Copy btn missing in block #' + i);
    }
  });

  // =====================================================================
  //  07  Theme toggle
  // =====================================================================
  await runTest('07. Theme toggles light / dark', async function () {
    var theme = await page.getAttribute('#md-reader-root', 'data-theme');
    var init = theme;

    await page.click('[data-action="toggle-theme"]');
    await page.waitForTimeout(200);
    theme = await page.getAttribute('#md-reader-root', 'data-theme');
    if (theme === init) throw new Error('Theme unchanged');

    await page.click('[data-action="toggle-theme"]');
    await page.waitForTimeout(200);
    theme = await page.getAttribute('#md-reader-root', 'data-theme');
    if (theme !== init) throw new Error('Theme not restored');
  });

  // =====================================================================
  //  08  Font size
  // =====================================================================
  await runTest('08. Font size A+ / A-', async function () {
    var contentLoc = page.locator('.md-content');
    var init = parseInt(await contentLoc.evaluate(function (el) { return el.style.fontSize; }) || '16', 10);

    await page.click('[data-action="font-inc"]');
    await page.waitForTimeout(100);
    var afterInc = parseInt(await contentLoc.evaluate(function (el) { return el.style.fontSize; }), 10);
    if (afterInc <= init) throw new Error('No increase: ' + init + ' -> ' + afterInc);

    await page.click('[data-action="font-dec"]');
    await page.waitForTimeout(50);
    await page.click('[data-action="font-dec"]');
    await page.waitForTimeout(100);
    var afterDec = parseInt(await contentLoc.evaluate(function (el) { return el.style.fontSize; }), 10);
    if (afterDec >= afterInc) throw new Error('No decrease: ' + afterInc + ' -> ' + afterDec);
  });

  // =====================================================================
  //  09  Settings panel
  // =====================================================================
  await runTest('09. Settings panel opens, toggles, closes', async function () {
    await page.click('[data-action="open-settings"]');
    await page.waitForTimeout(300);
    var panel = page.locator('#md-settings-panel');
    await panel.waitFor({ state: 'visible', timeout: 5000 });

    var toggles = panel.locator('[data-toggle]');
    if ((await toggles.count()) === 0) throw new Error('Expected [data-toggle]');

    var tgl = toggles.first();
    var wasChecked = await tgl.evaluate(function (el) { return el.classList.contains('checked'); });
    await tgl.click();
    await page.waitForTimeout(100);
    var isChecked = await tgl.evaluate(function (el) { return el.classList.contains('checked'); });
    if (isChecked === wasChecked) throw new Error('Toggle unchanged');

    await page.click('[data-action="close-settings"]');
    await page.waitForTimeout(200);
    var hidden = await panel.evaluate(function (el) { return el.style.display === 'none'; });
    if (!hidden) throw new Error('Settings not hidden');
  });

  // =====================================================================
  //  10  Popup
  // =====================================================================
  await runTest('10. Popup HTML loads and shows UI', async function () {
    var popup = await context.newPage();
    try {
      var popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf-8');
      await popup.goto('data:text/html,' + encodeURIComponent(
        '<!DOCTYPE html>' + popupHtml
      ), { waitUntil: 'domcontentloaded', timeout: 8000 });
      await popup.waitForSelector('.popup-container', { timeout: 5000 });

      var title = await popup.textContent('.popup-title');
      if (title.indexOf('Markdown Reader') === -1) throw new Error('Title mismatch: "' + title + '"');

      var feat = await popup.$$('.popup-feature');
      if (feat.length < 5) throw new Error('Expected >=5 features, got ' + feat.length);

      var btns = await popup.$$('.popup-theme-btn');
      if (btns.length < 2) throw new Error('Expected >=2 theme buttons');

      var ver = await popup.textContent('.popup-version');
      if (!ver || !ver.trim()) throw new Error('Version missing');
    } finally {
      await popup.close();
    }
  });

  // =====================================================================
  //  11  Sidebar UI loads
  // =====================================================================
  await runTest('11. Sidebar HTML loads and shows UI', async function () {
    var sb = await context.newPage();
    try {
      var sidebarHtml = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.html'), 'utf-8');
      var sidebarCss  = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.css'), 'utf-8');
      var sidebarJs   = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.js'), 'utf-8');

            var inlineHtml =
        "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><style>" + sidebarCss + "</style></head>" +
        "<body>" + sidebarHtml.replace(
          /<script src=\"sidebar\.js\"><\/script>/,
          "<script>" + sidebarJs + "</script>"
        ) + "</body></html>";
      await sb.goto("data:text/html," + encodeURIComponent(inlineHtml), {
        waitUntil: "load", timeout: 10000,
      });

      await sb.waitForSelector('.sidebar-container', { timeout: 5000 });
      var header = await sb.textContent('.sidebar-header h2');
      if (!header || header.indexOf('Files') === -1) throw new Error('Header mismatch');

      var searchInput = await sb.$('#sidebarSearch');
      if (!searchInput) throw new Error('Expected #sidebarSearch');
    } finally {
      await sb.close();
    }
  });

  // =====================================================================
  //  12  Sidebar search + keyboard nav
  // =====================================================================
  await runTest('12. Sidebar search with keyboard navigation', async function () {
    var sb = await context.newPage();
    try {
      var sidebarHtml = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.html'), 'utf-8');
      var sidebarCss  = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.css'), 'utf-8');
      var sidebarJs   = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.js'), 'utf-8');

      // Mock chrome API (with proper Promise-like for sendMessage)
      await sb.addInitScript({
        content: [
          'window.chrome = {',
          '  runtime: { id: "mock", onMessage: { addListener: function() {} }, sendMessage: function() {} },',
          '  storage: { sync: { get: function(k, cb) { setTimeout(function() { cb({}); }, 0); }, set: function() {} } },',
          '  tabs: {',
          '    query: function(q, cb) { if (cb) setTimeout(function() { cb([{ id: 1 }]); }, 0); },',
          '    sendMessage: function() { return { then: function() { return this; }, catch: function() { return this; } }; },',
          '  },',
          '};',
        ].join('\n'),
      });

            var inlineHtml =
        "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><style>" + sidebarCss + "</style></head>" +
        "<body>" + sidebarHtml.replace(
          /<script src=\"sidebar\.js\"><\/script>/,
          "<script>" + sidebarJs + "</script>"
        ) + "</body></html>";
      await sb.goto("data:text/html," + encodeURIComponent(inlineHtml), {
        waitUntil: "load", timeout: 10000,
      });

      await sb.waitForSelector('#sidebarSearch', { timeout: 5000 });
      await sb.waitForTimeout(500); // Let sidebar init complete

      // Populate a mock file tree
      await sb.evaluate(function () {
        var c = document.getElementById('sidebarTree');
        if (!c) return;
        c.innerHTML =
          '<div class="tree-dir">' +
            '<div class="tree-item tree-dir-header">' +
              '<span class="tree-arrow">&#9654;</span>' +
              '<span class="tree-icon">&#x1F4C1;</span>' +
              '<span class="tree-name">src</span>' +
            '</div>' +
            '<div class="tree-dir-children">' +
              '<div class="tree-file"><div class="tree-item"><span class="tree-icon">&#x1F4C4;</span><span class="tree-name">index.md</span></div></div>' +
              '<div class="tree-file"><div class="tree-item"><span class="tree-icon">&#x1F4C4;</span><span class="tree-name">README.md</span></div></div>' +
            '</div>' +
          '</div>' +
          '<div class="tree-dir">' +
            '<div class="tree-item tree-dir-header">' +
              '<span class="tree-arrow">&#9654;</span>' +
              '<span class="tree-icon">&#x1F4C1;</span>' +
              '<span class="tree-name">docs</span>' +
            '</div>' +
            '<div class="tree-dir-children collapsed">' +
              '<div class="tree-file"><div class="tree-item"><span class="tree-icon">&#x1F4C4;</span><span class="tree-name">guide.md</span></div></div>' +
            '</div>' +
          '</div>';
      });

      // Fill search
      var input = await sb.$('#sidebarSearch');
      await input.fill('index');
      await sb.waitForTimeout(600);

      // Check status shows match count
      var status = await sb.textContent('#sidebarSearchStatus');
      if (!status || status.indexOf('1 file') === -1)
        throw new Error('Expected "1 file" in status, got "' + status + '"');

      // ArrowDown focus
      await input.press('ArrowDown');
      await sb.waitForTimeout(100);
      if (!(await sb.$('.tree-item.focused'))) throw new Error('Expected .focused');

      // Enter
      await input.press('Enter');
      await sb.waitForTimeout(100);

      // Escape clears
      await input.press('Escape');
      await sb.waitForTimeout(300);
      if ((await input.inputValue()) !== '') throw new Error('Expected empty after Esc');
    } finally {
      await sb.close();
    }
  });

  // =====================================================================
  //  13  Sidebar dir collapse / expand
  // =====================================================================
  await runTest('13. Sidebar tree directory collapse/expand', async function () {
    var sb = await context.newPage();
    try {
      var sidebarHtml = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.html'), 'utf-8');
      var sidebarCss  = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.css'), 'utf-8');
      var sidebarJs   = fs.readFileSync(path.join(ROOT_DIR, 'sidebar/sidebar.js'), 'utf-8');

      await sb.addInitScript({
        content: [
          'window.chrome = {',
          '  runtime: { id: "mock", onMessage: { addListener: function() {} }, sendMessage: function() {} },',
          '  storage: { sync: { get: function(k, cb) { setTimeout(function() { cb({}); }, 0); }, set: function() {} } },',
          '  tabs: {',
          '    query: function(q, cb) { if (cb) setTimeout(function() { cb([{ id: 1 }]); }, 0); },',
          '    sendMessage: function() { return { then: function() { return this; }, catch: function() { return this; } }; },',
          '  },',
          '};',
        ].join('\n'),
      });

      await sb.setContent(
        '<html><head><meta charset="UTF-8"><style>' + sidebarCss + '</style></head>' +
        '<body>' + sidebarHtml + '<script>' + sidebarJs + '</script></body></html>',
        { waitUntil: 'load' }
      );

      await sb.waitForTimeout(500);

      // Populate tree with a collapsed dir
      await sb.evaluate(function () {
        var c = document.getElementById('sidebarTree');
        if (!c) return;
        c.innerHTML =
          '<div class="tree-dir">' +
            '<div class="tree-item tree-dir-header">' +
              '<span class="tree-arrow">&#9654;</span>' +
              '<span class="tree-icon">&#x1F4C1;</span>' +
              '<span class="tree-name">notes</span>' +
            '</div>' +
            '<div class="tree-dir-children collapsed">' +
              '<div class="tree-file"><div class="tree-item"><span class="tree-icon">&#x1F4C4;</span><span class="tree-name">meeting.md</span></div></div>' +
            '</div>' +
          '</div>';
      });

      // Wait for any pending async operations
      await sb.waitForTimeout(200);

      var arrow = sb.locator('.tree-arrow');
      var wasOpen = await arrow.evaluate(function (el) { return el.classList.contains('open'); });
      if (wasOpen) throw new Error('Expected arrow collapsed initially');

      // Click the header to expand
      await sb.click('.tree-dir-header');
      await sb.waitForTimeout(200);

      // Check arrow state changed
      var isOpen = await arrow.evaluate(function (el) { return el.classList.contains('open'); });
      if (!isOpen) throw new Error('Arrow not open after click');

      // Children should no longer be collapsed
      var children = sb.locator('.tree-dir-children');
      var collapsed = await children.evaluate(function (el) { return el.classList.contains('collapsed'); });
      if (collapsed) throw new Error('Children still collapsed after expand');
    } finally {
      await sb.close();
    }
  });

  // =====================================================================
  //  14  Narrow mode
  // =====================================================================
  await runTest('14. Narrow mode (800px) sidebar toggle', async function () {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);

    var narrow = await page.locator('#md-reader-root')
      .evaluate(function (el) { return el.classList.contains('md-narrow'); });
    if (!narrow) throw new Error('Expected .md-narrow at 800px');

    await page.click('[data-action="toggle-tree"]');
    await page.waitForTimeout(300);
    var mobileCount = await page.locator('.md-sidebar-tree.md-sidebar-mobile-open').count();
    if (mobileCount === 0) throw new Error('Expected mobile sidebar');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
  });

  // =====================================================================
  //  15  Rendered features
  // =====================================================================
  await runTest('15. Rendered tables, task lists, quotes, code', async function () {
    var innerText = await page.textContent('.md-content-inner');
    if (innerText.indexOf('Markdown Plugins') === -1) throw new Error('Expected table');
    if (innerText.indexOf('Content script injection') === -1) throw new Error('Expected task list');
    if (innerText.indexOf('best way to predict') === -1) throw new Error('Expected quote');
    if (innerText.indexOf('Markdown Guide') === -1) throw new Error('Expected link');
    if (!(await page.$('.md-content-inner hr'))) throw new Error('Expected hr');
  });

  // -- Summary ---------------------------------------------------------
  printSummary();
}

// ===========================================================================
//  RUN
// ===========================================================================

(async function () {
  try {
    await main();
  } catch (err) {
    console.error('\n\x1b[31mSuite error:\x1b[0m', err.message);
  } finally {
    await cleanup();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
