/* ===========================================================================
 * PageSew — marketing marquee UI shot (AA contrast pass)
 *
 * Renders the REAL unpacked extension exactly like store-screenshots.js, then
 * injects a MARKETING-ONLY CSS override sheet (no product source is touched)
 * that darkens muted and indigo text until every visible label clears 4.5:1.
 *
 * Writes:
 *   store-assets/promo/.work/pagesew-ui@1x.png   (1280x800, DSF 1)
 *   store-assets/promo/.work/ui-audit.json       (per-text contrast audit)
 *
 * Run:  cd tests && node marketing-marquee-render.js
 * ========================================================================== */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORK_DIR = path.join(ROOT_DIR, 'store-assets', 'promo', '.work');
const DEMO_DIR = '/tmp/pagesew-demo';
const VIEWPORT = { width: 1280, height: 800 };
const DSF = 1;  // must match store-screenshots.js so sidebar metrics stay identical

// Marketing-only palette. Brand stays indigo; both tokens move darker.
const MARKETING_CSS = `
  #md-reader-root[data-theme="light"] {
    --md-text-muted: #5F5F5F;      /* was #909090 (3.05:1 on #F9FAFB) */
    --md-primary: #4C63B8;         /* was #607CD2 (3.78:1 on #F9FAFB) */
    --md-primary-hover: #3E52A0;
    --md-primary-alpha: rgba(76, 99, 184, 0.08);
    --md-btn-color: #5F5F5F;       /* toolbar glyphs: was rgba(88,96,105,.4) */
    --md-btn-hover-color: #3F3F3F;
    --md-btn-active-color: #3F3F3F;
  }
  /* Belt-and-braces: any rule that hardcoded the old muted gray. */
  #md-reader-root .md-tree-header,
  #md-reader-root .md-outline-header,
  #md-reader-root .md-search-input::placeholder,
  #md-reader-root .md-search-count { color: var(--md-text-muted); }
  /* Outline levels are faded by opacity in the product (h3 = .85 → 4.33:1).
     The marketing sheet keeps the size/weight/indent cascade but drops the
     opacity dimming, so every outline label clears AA. */
  #md-reader-root .md-outline-list .md-outline-item { opacity: 1; }
  /* Non-md files are faded by opacity in the product; none appear here, but
     keep the marketing sheet honest if one slips in. */
  #md-reader-root .md-tree-item.md-tree-nonmd { opacity: 1; color: #5F5F5F; }
`;

function log(s) { process.stdout.write(s + '\n'); }

// ── Demo documents (identical to store-screenshots.js) ─────────────────────
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
`;

const NOTES_MD = `# Release Notes

Notes for the 1.3 line of Atlas Notes.

## 1.3.0 — Reader refresh

- The toolbar keeps search, font size, and theme in one row.
`;

const REFERENCE_MD = `# API Reference

The exporter exposes a small set of functions for build scripts.
`;

function writeDemoDocs() {
  fs.rmSync(DEMO_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEMO_DIR, 'guide.md'), GUIDE_MD);
  fs.writeFileSync(path.join(DEMO_DIR, 'setup.md'), SETUP_MD);
  fs.writeFileSync(path.join(DEMO_DIR, 'notes.md'), NOTES_MD);
  fs.writeFileSync(path.join(DEMO_DIR, 'reference.md'), REFERENCE_MD);
}

let ctx = null;
let sw = null;
let userDataDir = '';

async function setup() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  writeDemoDocs();
  userDataDir = path.join(os.tmpdir(), 'ps-marquee-' + Date.now());
  ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    args: [
      `--disable-extensions-except=${ROOT_DIR}`,
      `--load-extension=${ROOT_DIR}`,
      '--allow-file-access-from-files',
      '--no-sandbox',
      '--disable-features=DialMediaRouteProvider',
      `--force-device-scale-factor=${DSF}`,
    ],
  });
  sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  // Light theme, default layout. A configured AI state keeps the config banner
  // out of the shot (same placeholder used by store screenshots).
  await sw.evaluate(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ mdReaderSettings: {
      theme: 'light',
      ai: { vendor: 'custom', provider: 'openai', baseUrl: 'http://127.0.0.1:9/v1', model: 'demo-model', configured: true },
    } });
    await chrome.storage.local.set({ mdReaderApiKey: 'demo-placeholder-token' });
  });
}

async function teardown() {
  try { if (ctx) await ctx.close(); } catch (_) {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
}

async function openDoc(name) {
  const page = await ctx.newPage();
  page.on('pageerror', e => log('  [pageerror] ' + e.message));
  await page.goto('file://' + path.join(DEMO_DIR, name), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#md-reader-root', { timeout: 10000 });
  await page.waitForSelector('.md-content-inner', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#md-file-tree .md-tree-item').length >= 5,
    null, { timeout: 10000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(300);
  return page;
}

// Contrast audit over every element that owns a visible text node.
const AUDIT_FN = () => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(v => parseFloat(v));
    if (p.length < 3 || p.some(v => Number.isNaN(v))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const comp = (fg, bg) => [
    fg.r * fg.a + bg[0] * (1 - fg.a),
    fg.g * fg.a + bg[1] * (1 - fg.a),
    fg.b * fg.a + bg[2] * (1 - fg.a),
  ];
  const bgOf = (el) => {
    const layers = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
      n = n.parentElement;
    }
    let base = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) base = comp(layers[i], base);
    return base;
  };
  const lum = (c) => {
    const f = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b), hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (c) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

  const root = document.getElementById('md-reader-root');
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const text = n.textContent.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity || '1') < 0.05) continue; // hidden heading anchors
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    // Skip text sitting outside the 1280x800 capture.
    if (rect.bottom < 0 || rect.top > 800 || rect.right < 0 || rect.left > 1280) continue;
    const raw = parse(cs.color);
    if (!raw) continue;
    let opacity = 1;
    for (let q = el; q && q !== document.documentElement; q = q.parentElement) {
      opacity *= parseFloat(getComputedStyle(q).opacity || '1');
    }
    const bg = bgOf(el);
    const fg = comp({ ...raw, a: raw.a * opacity }, bg);
    out.push({
      text: text.slice(0, 48),
      tag: el.tagName.toLowerCase(),
      cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      color: hex(fg),
      bg: hex(bg),
      ratio: +ratio(fg, bg).toFixed(2),
      fontSize: cs.fontSize,
      weight: cs.fontWeight,
      rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
    });
  }
  // Placeholder text is not a text node — measure it explicitly.
  const ph = document.querySelector('.md-search-input');
  if (ph) {
    const bg = bgOf(ph);
    const pcs = getComputedStyle(ph, '::placeholder');
    const raw = parse(pcs.color);
    if (raw) {
      const fg = comp(raw, bg);
      out.push({
        text: '(placeholder) ' + (ph.placeholder || ''),
        tag: 'input::placeholder',
        cls: ph.className,
        color: hex(fg), bg: hex(bg),
        ratio: +ratio(fg, bg).toFixed(2),
        fontSize: pcs.fontSize, weight: pcs.fontWeight,
        rect: (() => { const r = ph.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      });
    }
  }
  return out;
};

async function main() {
  await setup();
  const page = await openDoc('guide.md');
  await page.addStyleTag({ content: MARKETING_CSS });
  await page.waitForTimeout(400);

  const audit = await page.evaluate(AUDIT_FN);
  audit.sort((a, b) => a.ratio - b.ratio);
  fs.writeFileSync(path.join(WORK_DIR, 'ui-audit.json'), JSON.stringify(audit, null, 2));
  log('  audited ' + audit.length + ' visible text elements');
  for (const a of audit) {
    const flag = a.ratio < 4.5 ? 'FAIL' : 'ok  ';
    log(`  ${flag} ${String(a.ratio).padStart(5)} ${a.color} on ${a.bg} ${a.fontSize} "${a.text}"`);
  }

  const file = path.join(WORK_DIR, 'pagesew-ui@1x.png');
  await page.screenshot({ path: file, type: 'png', fullPage: false });
  log('  saved ' + file);

  await page.close();
  await teardown();
  log('Done.');
}

main().catch(async (err) => {
  console.error(err && err.stack || err);
  await teardown();
  process.exit(1);
});
