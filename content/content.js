/* ============================================================================
 * Markdown Reader — Content Script
 *
 * Detects raw .md pages AND GitHub/GitLab rendered markdown pages,
 * replaces with beautiful three-panel reader UI.
 * Features: file tree, TOC outline, search, themes, font adjustment,
 *   hide-all-sidebars, go-to-top, heading anchors, auto theme,
 *   responsive overlay sidebars (≤960px).
 * ========================================================================== */

(function () {
  'use strict';

  // ── Prevent double-injection ──
  if (document.getElementById('md-reader-root')) return;

  // ── Settings (defaults, synced with chrome.storage) ──
  const DEFAULTS = {
    theme: 'light',
    fontSize: 16,
    contentWidth: 800,
    centerContent: true,
    showOutline: true,
    showFileTree: true,
    allSidebarsHidden: false,
    autoRefresh: false,
    refreshInterval: 3000,
    customCSS: '',
    allPlugins: true,
    pluginOptions: {},
  };
  let settings = { ...DEFAULTS };

  // ── Load settings from storage ──
  function loadSettings() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get('mdReaderSettings', result => {
          if (result.mdReaderSettings) {
            settings = { ...DEFAULTS, ...result.mdReaderSettings };
          }
          resolve(settings);
        });
      } else {
        resolve(settings);
      }
    });
  }

  function saveSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ mdReaderSettings: settings });
    }
  }

  // ── Page type detection ──
  function detectPageType() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // 1) file:// local .md files
    if (url.startsWith('file://') && /\.(md|markdown|mdown|mkd)$/i.test(url)) {
      return { type: 'local', rawMarkdown: getRawMarkdownFromPage() };
    }

    // 2) GitHub blob URLs (rendered HTML, need to fetch raw)
    if (hostname === 'github.com' && /\/blob\//.test(url) && /\.(md|markdown)$/i.test(url)) {
      return { type: 'github-blob' };
    }

    // 3) GitLab blob URLs
    if ((hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com'))
        && /\/blob\//.test(url) && /\.(md|markdown)$/i.test(url)) {
      return { type: 'gitlab-blob' };
    }

    // 4) Bitbucket URLs
    if (hostname === 'bitbucket.org' && /\/src\//.test(url) && /\.(md|markdown)$/i.test(url)) {
      return { type: 'bitbucket-src' };
    }

    // 5) Raw .md URLs (raw.githubusercontent.com, other raw text pages)
    if (/\.(md|markdown|mdown|mkd)$/i.test(url)) {
      const raw = getRawMarkdownFromPage();
      if (raw) return { type: 'raw-url', rawMarkdown: raw };
    }

    // 6) Not a markdown page
    return { type: 'none' };
  }

  // ── Extract raw markdown from page content ──
  function getRawMarkdownFromPage() {
    // Case 1: <pre> wrapped raw text (common for file:// and raw URLs)
    const pres = document.querySelectorAll('pre');
    for (const pre of pres) {
      if (!pre.querySelector('img') && !pre.querySelector('table')
          && pre.textContent.trim().length > 20) {
        const text = pre.textContent;
        if (looksLikeMarkdown(text)) {
          return text;
        }
      }
    }

    // Case 2: plain text body (no HTML structure, common for raw.githubusercontent.com)
    if (document.body && document.body.children.length <= 2) {
      const bodyText = document.body.textContent || '';
      if (bodyText.trim().length > 20 && looksLikeMarkdown(bodyText)) {
        return bodyText;
      }
    }

    return null;
  }

  // ── Heuristic: does this text look like markdown? ──
  function looksLikeMarkdown(text) {
    const lines = text.split('\n').slice(0, 30);
    let score = 0;

    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) score += 3;       // ATX headings
      if (/^\s*[-*+]\s/.test(line)) score += 1;      // Unordered list
      if (/^\s*\d+\.\s/.test(line)) score += 1;      // Ordered list
      if (/```/.test(line)) score += 3;              // Fenced code
      if (/\*\*[^*]+\*\*/.test(line)) score += 1;    // Bold
      if (/\[[^\]]+\]\(/.test(line)) score += 1;     // Link
      if (/^\s*>/.test(line)) score += 1;            // Blockquote
      if (/^\|.*\|.*\|/.test(line)) score += 2;      // Table row
      if (/^---+/.test(line)) score += 1;            // HR
      if (/^---\s*$/.test(line)) score += 2;         // Front matter
    }

    return score >= 4;
  }

  // ── Convert GitHub blob URL to raw URL ──
  function githubBlobToRaw(url) {
    return url
      .replace('https://github.com/', 'https://raw.githubusercontent.com/')
      .replace('/blob/', '/');
  }

  // ── Convert GitLab blob URL to raw URL ──
  function gitlabBlobToRaw(url) {
    return url.replace('/blob/', '/raw/');
  }

  // ── Convert Bitbucket src URL to raw URL ──
  function bitbucketSrcToRaw(url) {
    return url.replace('/src/', '/raw/');
  }

  // ── Fetch raw markdown via background service worker (avoids CORS) ──
  function fetchRawMarkdown(rawUrl) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { type: 'fetchRaw', url: rawUrl },
          response => {
            if (response && response.success) {
              resolve(response.text);
            } else {
              reject(new Error(response?.error || 'Fetch failed'));
            }
          }
        );
      } else {
        fetch(rawUrl)
          .then(r => r.text())
          .then(resolve)
          .catch(reject);
      }
    });
  }

  // ── Navigate to another file without page reload (fetch content + swap reader) ──
  async function navigateToFile(filePath) {
    try {
      let rawMarkdown;

      if (filePath.startsWith('file://')) {
        // Local file — fetch directly (we have file:// permission now)
        const resp = await fetch(filePath);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        rawMarkdown = await resp.text();
      } else {
        // Remote markdown — use background SW for CORS
        rawMarkdown = await fetchRawMarkdown(filePath);
      }

      if (!rawMarkdown || !looksLikeMarkdown(rawMarkdown)) {
        throw new Error('Not valid markdown');
      }

      // Update reader state URL (used by getCurrentFileInfo / buildFileTree)
      _readerFileUrl = filePath;
      window.history.replaceState({}, '', filePath);

      // Update toolbar filename
      const newFilename = safeDecode(filePath.split('/').pop()?.split('?')[0] || '');
      const filenameEl = document.querySelector('.md-filename');
      if (filenameEl) {
        filenameEl.textContent = newFilename;
        filenameEl.title = filePath;
      }

      // Re-render content
      const contentInner = document.querySelector('.md-content-inner');
      if (contentInner) {
        contentInner.innerHTML = renderMarkdown(rawMarkdown);
        buildOutline(contentInner);
        addCopyButtons();
        // Re-apply settings like custom CSS
        applySettings();
        // Reset scroll to top
        document.querySelector('.md-content')?.scrollTo({ top: 0, behavior: 'instant' });
      }

      // Rebuild file tree for the new file's directory
      buildFileTree();

    } catch (_) {
      // Fallback: full page navigation
      window.location.href = filePath;
    }
  }

  // ── Safely decode URI component, fallback on invalid encoding ──
  function safeDecode(str) {
    try { return decodeURIComponent(str); } catch (e) { return str; }
  }

  // ── Current file path / URL info (optional override for in-page navigation) ──
  let _readerFileUrl = null;

  function getCurrentFileInfo(overrideUrl) {
    const url = overrideUrl || _readerFileUrl || window.location.href;
    const rawFilename = url.split('/').pop()?.split('?')[0] || 'README.md';
    const filename = safeDecode(rawFilename);
    const dir = safeDecode(url.substring(0, url.lastIndexOf('/')));
    const isLocal = url.startsWith('file://');
    const isGitHub = window.location.hostname === 'github.com';
    const isGitLab = window.location.hostname === 'gitlab.com'
                     || window.location.hostname.endsWith('.gitlab.com');

    let repoDir = '';
    if (isGitHub) {
      const match = url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)/);
      repoDir = match ? match[1] : '';
    }

    return { url, filename, dir, isLocal, isGitHub, isGitLab, repoDir };
  }

  // ── SVG icons (inline for reliability) ──
  const ICONS = {
    sidebar: '<svg width="18" height="18" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M810.7 85.3h-597.4c-70.7 0-128 57.3-128 128v597.3c0 70.7 57.3 128 128 128h597.3c70.7 0 128-57.3 128-128v-597.3c.1-70.7-57.2-128-127.9-128zm-469.4 768h-128c-23.6 0-42.7-19.1-42.7-42.7v-597.3c0-23.6 19.1-42.7 42.7-42.7h128zm512-42.6c0 23.6-19.1 42.7-42.7 42.7h-384v-682.7h384c23.6 0 42.7 19.1 42.7 42.7z"/></svg>',
    top: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>',
    sun: '<svg class="md-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg class="md-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    outline: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>',
    expand: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    collapse: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  // ── Build the reader UI ──
  function buildReaderUI(rawMarkdown) {
    const root = document.createElement('div');
    root.id = 'md-reader-root';
    root.setAttribute('data-theme', settings.theme);

    const fileInfo = getCurrentFileInfo();

    root.innerHTML = `
      <!-- Toolbar -->
      <div class="md-toolbar">
        <div class="md-toolbar-left">
          <button class="md-btn md-btn-tree" title="Toggle File Tree" data-action="toggle-tree">
            ${ICONS.sidebar}
          </button>
          <span class="md-filename" title="${fileInfo.url}">${fileInfo.filename}</span>
        </div>
        <div class="md-toolbar-center">
          <div class="md-search-box">
            ${ICONS.search}
            <input type="text" class="md-search-input" placeholder="Search in document..." />
            <span class="md-search-count"></span>
            <button class="md-btn-sm" data-action="search-prev" title="Previous">↑</button>
            <button class="md-btn-sm" data-action="search-next" title="Next">↓</button>
            <button class="md-btn-sm" data-action="search-close" title="Close">✕</button>
          </div>
        </div>
        <div class="md-toolbar-right">
          <button class="md-btn" data-action="font-dec" title="Decrease font">A-</button>
          <button class="md-btn" data-action="font-inc" title="Increase font">A+</button>
          <button class="md-btn" data-action="toggle-theme" title="Toggle theme (light / dark / auto)">
            ${ICONS.sun}
            ${ICONS.moon}
          </button>
          <button class="md-btn md-btn-outline" data-action="toggle-outline" title="Toggle Outline">
            ${ICONS.outline}
          </button>
          <button class="md-btn" data-action="toggle-all-sidebars" title="Toggle All Sidebars">
            ${ICONS.expand}
          </button>
          <button class="md-btn" data-action="open-settings" title="Settings">
            ${ICONS.settings}
          </button>
        </div>
      </div>

      <!-- Main Layout -->
      <div class="md-main">
        <!-- Left: File Tree -->
        <aside class="md-sidebar md-sidebar-tree ${settings.showFileTree ? '' : 'md-collapsed'}">
          <div class="md-sidebar-header">
            <span>📁 Files</span>
          </div>
          <div class="md-tree-container" id="md-file-tree">
            <div class="md-tree-loading">Loading…</div>
          </div>
        </aside>

        <!-- Center: Rendered Content -->
        <main class="md-content" style="font-size: ${settings.fontSize}px;">
          <div class="md-content-inner ${settings.centerContent ? 'md-centered' : ''}" style="${settings.contentWidth ? 'max-width:' + settings.contentWidth + 'px' : ''}">
            ${renderMarkdown(rawMarkdown)}
          </div>
        </main>

        <!-- Right: TOC Outline -->
        <aside class="md-sidebar md-sidebar-outline ${settings.showOutline ? '' : 'md-collapsed'}">
          <div class="md-sidebar-header">
            <span>📑 Outline</span>
          </div>
          <div class="md-outline-container" id="md-outline"></div>
        </aside>
      </div>

      <!-- Settings Panel (feature toggles) -->
      <div class="md-settings-panel" id="md-settings-panel" style="display:none;">
        <div class="md-settings-header">
          <h3>⚙️ Feature Settings</h3>
          <button class="md-btn-sm" data-action="close-settings">✕</button>
        </div>
        <div class="md-settings-list" id="md-settings-list"></div>
      </div>

      <!-- Floating Action Buttons (inspired by md-reader button group) -->
      <div class="md-fab-group" id="md-fab-group">
        <button class="md-fab md-fab-side-toggle" data-action="toggle-all-sidebars" title="Toggle sidebars">
          ${ICONS.sidebar}
        </button>
        <button class="md-fab md-fab-top md-fab-hidden" data-action="go-to-top" title="Back to top">
          ${ICONS.top}
        </button>
      </div>

      <!-- Auto-refresh indicator -->
      <div class="md-auto-refresh-indicator" id="md-auto-refresh" style="display:none;">
        <span>🔄 Auto-refresh active</span>
      </div>

      <!-- Loading overlay (shown while fetching raw markdown from GitHub etc.) -->
      <div class="md-loading-overlay" id="md-loading" style="display:none;">
        <div class="md-loading-spinner"></div>
        <div class="md-loading-text">Loading markdown…</div>
      </div>
    `;

    return root;
  }

  // ── Render markdown to HTML ──
  function renderMarkdown(raw) {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: function (code, lang) {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(code, { language: lang }).value; } catch (e) {}
          }
          if (typeof hljs !== 'undefined') {
            try { return hljs.highlightAuto(code).value; } catch (e) {}
          }
          return code;
        }
      });
      return marked.parse(raw);
    }
    return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

// ── Build TOC from rendered headings ──
function buildOutline(container) {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const outline = document.getElementById('md-outline');
  if (!outline) return;

  outline.innerHTML = '';
  if (headings.length === 0) {
    outline.innerHTML = '<div class="md-outline-empty">No headings found</div>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'md-outline-list';

  headings.forEach((h, i) => {
    const id = 'md-heading-' + i;
    h.id = id;

    // Extract heading text BEFORE inserting anchor (avoid # leaking into outline)
    const headingText = h.textContent;

    // Add heading anchor (#) link — hidden until hover (inspired by md-reader)
    const anchor = document.createElement('a');
    anchor.className = 'md-heading-anchor';
    anchor.href = '#' + id;
    anchor.textContent = '#';
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const fullUrl = window.location.origin + window.location.pathname + '#' + id;
      navigator.clipboard.writeText(fullUrl).catch(() => {});
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    h.insertBefore(anchor, h.firstChild);

    // Use HTML heading tag level (h1-h6) for outline hierarchy
    const outlineLevel = parseInt(h.tagName[1]);

    const li = document.createElement('li');
    li.className = 'md-outline-item md-outline-h' + outlineLevel;
    li.dataset.targetId = id;
    li.innerHTML = `<span class="md-outline-text">${headingText}</span>`;
    li.addEventListener('click', () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    ul.appendChild(li);
  });

  outline.appendChild(ul);
  setupScrollTracking(headings);
}

  // ── Scroll tracking → highlight current TOC item + auto-scroll outline ──
  let scrollObserver = null;
  function setupScrollTracking(headings) {
    if (scrollObserver) scrollObserver.disconnect();

    const contentArea = document.querySelector('.md-content');
    if (!contentArea) return;

    scrollObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const tocItem = document.querySelector(`.md-outline-item[data-target-id="${id}"]`);
        if (!tocItem) return;

        if (entry.isIntersecting) {
          // Remove active from all, then set this one
          document.querySelectorAll('.md-outline-item.active').forEach(el => el.classList.remove('active'));
          tocItem.classList.add('active');
          // Auto-scroll outline to keep active item visible
          tocItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }, {
      root: contentArea,
      rootMargin: '-15% 0px -35% 0px',
      threshold: 0
    });

    headings.forEach(h => scrollObserver.observe(h));
  }

  // ── Go-to-top button: show after scrolling 640px (inspired by md-reader) ──
  function setupGoTopButton() {
    const contentArea = document.querySelector('.md-content');
    const goTopBtn = document.querySelector('.md-fab-top');
    if (!contentArea || !goTopBtn) return;

    contentArea.addEventListener('scroll', () => {
      if (contentArea.scrollTop > 640) {
        goTopBtn.classList.remove('md-fab-hidden');
      } else {
        goTopBtn.classList.add('md-fab-hidden');
      }
    }, { passive: true });
  }

  // ── Hide/Show all sidebars ──
  let allSidebarsHidden = false;

  function toggleAllSidebars() {
    allSidebarsHidden = !allSidebarsHidden;
    const tree = document.querySelector('.md-sidebar-tree');
    const outline = document.querySelector('.md-sidebar-outline');
    const toggleBtn = document.querySelector('[data-action="toggle-all-sidebars"]');

    if (allSidebarsHidden) {
      // Hide both
      tree?.classList.add('md-collapsed');
      outline?.classList.add('md-collapsed');
      if (toggleBtn) {
        toggleBtn.innerHTML = ICONS.collapse;
        toggleBtn.title = 'Show All Sidebars';
      }
    } else {
      // Restore previous state
      tree?.classList.toggle('md-collapsed', !settings.showFileTree);
      outline?.classList.toggle('md-collapsed', !settings.showOutline);
      if (toggleBtn) {
        toggleBtn.innerHTML = ICONS.expand;
        toggleBtn.title = 'Hide All Sidebars';
      }
    }
  }

  // ── Responsive sidebar: ≤960px overlay mode (inspired by md-reader) ──
  function setupResponsiveSidebars() {
    const root = document.getElementById('md-reader-root');
    if (!root) return;

    function handleResize() {
      const isNarrow = window.innerWidth <= 960;
      root.classList.toggle('md-narrow', isNarrow);

      // On narrow screens, make sidebars auto-collapse (overlay mode)
      if (isNarrow) {
        const tree = document.querySelector('.md-sidebar-tree');
        const outline = document.querySelector('.md-sidebar-outline');
        // Remove mobile-open class on resize
        tree?.classList.remove('md-sidebar-mobile-open');
        outline?.classList.remove('md-sidebar-mobile-open');
      }
    }

    handleResize();
    window.addEventListener('resize', handleResize);
  }

  // ── File tree marquee hover — scroll long filenames on hover ──
  function setupFileTreeMarquee() {
    const tree = document.querySelector('.md-tree-container');
    if (!tree) return;

    let marqueeTimer = null;

    tree.addEventListener('mouseover', e => {
      const nameEl = e.target.closest('.md-tree-item')?.querySelector('.md-tree-name');
      if (!nameEl) return;

      clearTimeout(marqueeTimer);
      marqueeTimer = setTimeout(() => {
        const textEl = nameEl.querySelector('.md-tree-text');
        if (!textEl) return;
        if (textEl.scrollWidth > nameEl.clientWidth) {
          const dist = textEl.scrollWidth - nameEl.clientWidth + 10;
          const dur = Math.max(2, dist / 40);
          textEl.style.setProperty('--marquee-dist', -dist + 'px');
          textEl.style.setProperty('--marquee-dur', dur + 's');
          nameEl.classList.add('marquee');
        }
      }, 400); // 400ms delay before starting scroll
    });

    tree.addEventListener('mouseout', e => {
      const item = e.target.closest('.md-tree-item');
      if (!item) return;
      // Only stop when actually leaving the tree item (not moving between children)
      const related = e.relatedTarget;
      if (related && item.contains(related)) return;
      const nameEl = item.querySelector('.md-tree-name');
      if (nameEl) nameEl.classList.remove('marquee');
    });
  }

  // ── Outline marquee hover — scroll long headings on hover ──
  function setupOutlineMarquee() {
    const container = document.querySelector('.md-outline-container');
    if (!container) return;

    // Use MutationObserver to attach marquee to both existing and future items
    function attachMarquee(item) {
      if (item._marqueeAttached) return;
      item._marqueeAttached = true;

      const textEl = item.querySelector('.md-outline-text');
      if (!textEl) return;

      let timer = null;

      item.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // Account for item padding — clientWidth includes padding, but text
          // lives in the content area inside it.
          const style = getComputedStyle(item);
          const hPad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
          const contentWidth = item.clientWidth - hPad;
          const overflow = textEl.scrollWidth - contentWidth;
          if (overflow > 0) {
            const dist = overflow + 10;
            const dur = Math.max(2, dist / 40);
            textEl.style.setProperty('--marquee-dist', -dist + 'px');
            textEl.style.setProperty('--marquee-dur', dur + 's');
            item.classList.add('marquee');
          }
        }, 400);
      });

      item.addEventListener('mouseleave', () => {
        clearTimeout(timer);
        item.classList.remove('marquee');
      });
    }

    // Attach to all existing items
    container.querySelectorAll('.md-outline-item').forEach(attachMarquee);

    // Watch for new items added dynamically (e.g., navigateToFile rebuilds outline)
    const observer = new MutationObserver(() => {
      container.querySelectorAll('.md-outline-item:not([data-mq="1"])').forEach(item => {
        item.dataset.mq = '1';
        attachMarquee(item);
      });
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  function toggleMobileSidebar(sidebar) {
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('md-sidebar-mobile-open');

    // Close all mobile sidebars first
    document.querySelectorAll('.md-sidebar-mobile-open').forEach(el => {
      el.classList.remove('md-sidebar-mobile-open');
    });

    if (!isOpen) {
      sidebar.classList.add('md-sidebar-mobile-open');

      // Dismiss on click outside, ESC, or resize (md-reader pattern)
      const dismiss = (e) => {
        if (e.type === 'keydown' && e.key !== 'Escape') return;
        sidebar.classList.remove('md-sidebar-mobile-open');
        document.removeEventListener('click', dismiss, true);
        document.removeEventListener('keydown', dismiss, true);
        window.removeEventListener('resize', dismiss, { once: true });
        if (e.type === 'click') e.stopPropagation();
      };

      // Delay to avoid the same click closing it
      setTimeout(() => {
        document.addEventListener('click', dismiss, { capture: true, once: true });
        document.addEventListener('keydown', dismiss, true);
        window.addEventListener('resize', dismiss, { once: true });
      }, 0);
    }
  }

  // ── Search in document ──
  let searchMatches = [];
  let searchIndex = -1;

  function performSearch(query) {
    clearSearch();
    if (!query) return;

    const contentInner = document.querySelector('.md-content-inner');
    if (!contentInner) return;

    const treeWalker = document.createTreeWalker(contentInner, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];

    while (treeWalker.nextNode()) {
      textNodes.push(treeWalker.currentNode);
    }

    const lowerQuery = query.toLowerCase();
    textNodes.forEach(node => {
      const text = node.textContent;
      const lowerText = text.toLowerCase();
      let pos = 0;
      const indices = [];

      while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        indices.push(pos);
        pos += lowerQuery.length;
      }

      if (indices.length > 0) {
        const parent = node.parentNode;
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;

        indices.forEach(idx => {
          if (idx > lastIdx) {
            fragment.appendChild(document.createTextNode(text.substring(lastIdx, idx)));
          }
          const mark = document.createElement('mark');
          mark.className = 'md-search-highlight';
          mark.textContent = text.substring(idx, idx + query.length);
          fragment.appendChild(mark);
          lastIdx = idx + query.length;
        });

        if (lastIdx < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
        }

        parent.replaceChild(fragment, node);
      }
    });

    searchMatches = Array.from(document.querySelectorAll('.md-search-highlight'));
    searchIndex = searchMatches.length > 0 ? 0 : -1;

    if (searchMatches.length > 0) {
      scrollToMatch(0);
    }

    updateSearchCount();
  }

  function clearSearch() {
    document.querySelectorAll('.md-search-highlight').forEach(mark => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    searchMatches = [];
    searchIndex = -1;
    updateSearchCount();
  }

  function scrollToMatch(index) {
    if (index < 0 || index >= searchMatches.length) return;
    document.querySelectorAll('.md-search-highlight.current').forEach(el => el.classList.remove('current'));
    searchMatches[index].classList.add('current');
    searchMatches[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function updateSearchCount() {
    const countEl = document.querySelector('.md-search-count');
    if (countEl) {
      countEl.textContent = searchMatches.length > 0
        ? `${searchIndex + 1}/${searchMatches.length}`
        : '';
    }
  }

  // ── File Tree ──
  function buildFileTree() {
    const treeContainer = document.getElementById('md-file-tree');
    if (!treeContainer) return;

    const fileInfo = getCurrentFileInfo();
    treeContainer.innerHTML = '';

    if (fileInfo.isGitHub && fileInfo.repoDir) {
      buildGitHubFileTree(treeContainer, fileInfo);
    } else {
      buildSimpleFileTree(treeContainer, fileInfo);
    }
  }

  // ── Enumerate local directory — try direct fetch first, fallback to hidden tab ──
  async function enumerateLocalDirectory(dirPath) {
    // Method 1: try to fetch the directory URL directly (works with file:///* permission)
    try {
      const response = await fetch(dirPath + '/');
      const html = await response.text();
      const parsed = parseDirListing(html, dirPath);
      if (parsed && parsed.length > 0) {
        const container = document.getElementById('md-file-tree');
        if (container) renderDirListing(container, parsed, getCurrentFileInfo());
        return;
      }
    } catch (_) {}

    // Method 2: ask background SW to use a hidden tab
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'enumerateDirectory', url: dirPath }, () => {});
    }
  }

  // ── Extract filename from a path (handle full paths or relative) ──
  function basename(p) {
    return p.replace(/\/+$/, '').split('/').pop() || p;
  }

  // ── Parse directory listing HTML into file objects ──
  function parseDirListing(html, dirPath) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const links = div.querySelectorAll('a');
    const files = [];
    const seen = new Set();
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('?') || href.startsWith('#')) return;
      const name = basename(href);
      if (name === '..' || name === '.' || name === '' || seen.has(name)) return;
      seen.add(name);
      const filePath = href.startsWith('/') ? 'file://' + href : dirPath + '/' + href;
      files.push({
        name: safeDecode(name),
        path: filePath,
        type: href.endsWith('/') ? 'dir' : 'file',
      });
    });
    return files.length > 0 ? files : null;
  }

  // ── Render file list into tree container ──
  function renderDirListing(container, files, fileInfo) {
    const currentFilename = fileInfo.filename;
    const dirPath = fileInfo.dir;
    const header = container.querySelector('.md-tree-item:first-child');
    container.innerHTML = '';
    if (header) container.appendChild(header.cloneNode(true));

    // Resolve paths: handle absolute (/...), relative (file.md), or already full
    const resolved = files.map(f => {
      let fullPath = f.path;
      if (!fullPath.startsWith('file://') && !fullPath.startsWith('http://') && !fullPath.startsWith('https://')) {
        if (fullPath.startsWith('/')) {
          fullPath = 'file://' + fullPath;
        } else {
          fullPath = dirPath + '/' + fullPath;
        }
      }
      return { ...f, path: fullPath };
    });

    // Sort: dirs first, then files, alphabetically
    const sorted = [
      ...resolved.filter(f => f.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)),
      ...resolved.filter(f => f.type === 'file').sort((a, b) => a.name.localeCompare(b.name)),
    ];

    sorted.forEach(item => {
      const el = document.createElement('div');
      const isCurrent = item.name === currentFilename;
      const isMd = item.type === 'file' && (item.name.endsWith('.md') || item.name.endsWith('.markdown'));
      let cls = 'md-tree-item';
      if (isCurrent) cls += ' md-tree-active';
      else if (item.type === 'file' && !isMd) cls += ' md-tree-nonmd';
      el.className = cls;

      if (item.type === 'dir') {
        el.innerHTML = `<span class="md-tree-icon">📁</span><span class="md-tree-name"><span class="md-tree-text">${item.name}/</span></span>`;
        el.addEventListener('click', e => { e.stopPropagation(); window.location.href = item.path; });
      } else {
        el.innerHTML = `<span class="md-tree-icon">${isMd ? '📄' : '📎'}</span><span class="md-tree-name"><span class="md-tree-text">${item.name}</span></span>`;
        if (isMd && !isCurrent) {
          el.addEventListener('click', e => {
            e.stopPropagation();
            navigateToFile(item.path);
          });
        }
      }
      container.appendChild(el);
    });
  }

  // ── Simple file tree (non-GitHub pages) ──
  function buildSimpleFileTree(container, fileInfo) {
    // Directory header
    const dirName = fileInfo.dir.split('/').pop() || '/';
    const dirLabel = document.createElement('div');
    dirLabel.className = 'md-tree-item';
    dirLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--md-text-muted);padding:6px 14px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid var(--md-sidebar-border);margin-bottom:2px;cursor:default;';
    dirLabel.textContent = `📁 ${dirName}`;
    container.appendChild(dirLabel);

    // Loading state while enumerating directory
    const loading = document.createElement('div');
    loading.className = 'md-tree-loading';
    loading.textContent = '⏳ Loading files…';
    container.appendChild(loading);

    // Current file (highlighted, shown immediately)
    const currentFile = document.createElement('div');
    currentFile.className = 'md-tree-item md-tree-active';
    currentFile.innerHTML = `<span class="md-tree-icon">📄</span><span class="md-tree-name"><span class="md-tree-text">${fileInfo.filename}</span></span>`;
    container.appendChild(currentFile);

    // Try to list local directory contents via background SW (hidden tab)
    enumerateLocalDirectory(fileInfo.dir);
  }

  // ── GitHub file tree via GitHub Contents API ──
  function buildGitHubFileTree(container, fileInfo) {
    // Parse: https://github.com/owner/repo/blob/branch/path/to/file.md
    const match = fileInfo.url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
    if (!match) { buildSimpleFileTree(container, fileInfo); return; }

    const owner = match[1];
    const repo = match[2];
    const branch = match[3];
    const filePath = match[4];
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

    // Loading state
    container.innerHTML = '<div class="md-tree-loading">⏳ Loading files…</div>';

    // Fetch directory from GitHub Contents API (supports CORS)
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${encodeURIComponent(branch)}`;

    fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github.v3+json' } })
      .then(r => { if (!r.ok) throw new Error('API error'); return r.json(); })
      .then(items => {
        if (!Array.isArray(items)) throw new Error('Not a directory');
        container.innerHTML = '';

        // Directory header
        const dirLabel = document.createElement('div');
        dirLabel.className = 'md-tree-item';
        dirLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--md-text-muted);padding:6px 14px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid var(--md-sidebar-border);margin-bottom:2px;cursor:default;';
        dirLabel.textContent = `📁 ${dirPath || '/'}`;
        container.appendChild(dirLabel);

        // Parent directory
        if (dirPath) {
          const parentPath = dirPath.includes('/') ? dirPath.substring(0, dirPath.lastIndexOf('/')) : '';
          const parentUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${parentPath}`;
          const parentItem = document.createElement('div');
          parentItem.className = 'md-tree-item';
          parentItem.innerHTML = '<span class="md-tree-icon">📁</span> ..';
          parentItem.addEventListener('click', () => { window.location.href = parentUrl; });
          container.appendChild(parentItem);
        }

        // Sort: dirs first, then files
        const sorted = [
          ...items.filter(i => i.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)),
          ...items.filter(i => i.type === 'file').sort((a, b) => a.name.localeCompare(b.name))
        ];

        sorted.forEach(item => {
          const el = document.createElement('div');
          const isCurrent = item.path === filePath;
          let className = 'md-tree-item' + (isCurrent ? ' md-tree-active' : '');

          if (item.type === 'dir') {
            el.className = className;
            el.innerHTML = `<span class="md-tree-icon">📁</span><span class="md-tree-name"><span class="md-tree-text">${item.name}</span></span>`;
            el.addEventListener('click', () => {
              window.location.href = `https://github.com/${owner}/${repo}/tree/${branch}/${item.path}`;
            });
          } else {
            const isMd = item.name.endsWith('.md') || item.name.endsWith('.markdown');
            if (!isMd) className += ' md-tree-nonmd';
            el.className = className;
            el.innerHTML = `<span class="md-tree-icon">${isMd ? '📄' : '📎'}</span><span class="md-tree-name"><span class="md-tree-text">${item.name}</span></span>`;
            if (isMd && !isCurrent) {
              el.addEventListener('click', () => {
                window.location.href = `https://github.com/${owner}/${repo}/blob/${branch}/${item.path}`;
              });
            }
          }
          container.appendChild(el);
        });
      })
      .catch(() => {
        // Fallback
        container.innerHTML = '';
        buildSimpleFileTree(container, fileInfo);
      });
  }

  // ── Settings panel (feature toggles from screenshot) ──
  function buildSettingsPanel() {
    const list = document.getElementById('md-settings-list');
    if (!list) return;

    const features = [
      { key: 'allPlugins', label: 'All Built-in Markdown Plugins', desc: 'Enable GFM tables, task lists, strikethrough, etc.' },
      { key: 'showOutline', label: 'Auto-generate Outline', desc: 'Automatically create table of contents from headings' },
      { key: 'autoRefresh', label: 'Auto-refresh Document', desc: 'Automatically reload when file changes (local files)' },
      { key: 'centerContent', label: 'Center Document Content', desc: 'Center the rendered content horizontally' },
      { key: 'contentWidth', label: 'Custom Content Width', desc: 'Set maximum content width in pixels', type: 'number' },
      { key: 'customCSS', label: 'Custom CSS', desc: 'Add your own CSS styles', type: 'textarea' },
      { key: 'fontSize', label: 'Adjust Font', desc: 'Change font size in pixels', type: 'number' },
      { key: 'showFileTree', label: 'Folder Directory', desc: 'Show file tree sidebar' },
      { key: 'pluginOptions', label: 'Markdown plugin options', desc: 'Configure individual markdown extensions' },
      { key: 'moreFeatures', label: 'More Features in Development', desc: 'Stay tuned for updates!', type: 'info' },
    ];

    list.innerHTML = '';

    features.forEach(f => {
      const row = document.createElement('div');
      row.className = 'md-settings-row';

      if (f.type === 'info') {
        row.innerHTML = `
          <span class="md-settings-check md-settings-check-info">🚀</span>
          <div class="md-settings-text">
            <div class="md-settings-label">${f.label}</div>
            <div class="md-settings-desc">${f.desc}</div>
          </div>
        `;
      } else if (f.type === 'number') {
        row.innerHTML = `
          <span class="md-settings-check checked">
            <svg width="20" height="20" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" fill="none" stroke="${settings.theme === 'dark' ? '#6785e0' : '#607cd2'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <div class="md-settings-text">
            <div class="md-settings-label">${f.label}</div>
            <div class="md-settings-desc">${f.desc}</div>
            <input type="number" class="md-settings-number" data-key="${f.key}" value="${settings[f.key] || 0}" min="${f.key === 'fontSize' ? 12 : 400}" max="${f.key === 'fontSize' ? 28 : 2000}" step="${f.key === 'fontSize' ? 1 : 50}" />
          </div>
        `;
      } else if (f.type === 'textarea') {
        row.innerHTML = `
          <span class="md-settings-check checked">
            <svg width="20" height="20" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" fill="none" stroke="${settings.theme === 'dark' ? '#6785e0' : '#607cd2'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <div class="md-settings-text">
            <div class="md-settings-label">${f.label}</div>
            <div class="md-settings-desc">${f.desc}</div>
            <textarea class="md-settings-textarea" data-key="${f.key}" rows="3" placeholder="e.g. .md-content h1 { color: red; }">${settings[f.key] || ''}</textarea>
          </div>
        `;
      } else {
        const isChecked = settings[f.key] !== false;
        const accent = settings.theme === 'dark' ? '#6785e0' : '#607cd2';
        row.innerHTML = `
          <span class="md-settings-check ${isChecked ? 'checked' : ''}" data-toggle="${f.key}">
            <svg width="20" height="20" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" fill="none" stroke="${isChecked ? accent : '#9ca3af'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <div class="md-settings-text">
            <div class="md-settings-label">${f.label}</div>
            <div class="md-settings-desc">${f.desc}</div>
          </div>
        `;
      }

      list.appendChild(row);
    });

    // Toggle handlers
    list.querySelectorAll('[data-toggle]').forEach(check => {
      check.addEventListener('click', () => {
        const key = check.dataset.toggle;
        settings[key] = !settings[key];
        check.classList.toggle('checked');
        const accent = settings.theme === 'dark' ? '#6785e0' : '#607cd2';
        const svg = check.querySelector('polyline');
        svg.setAttribute('stroke', settings[key] ? accent : '#9ca3af');
        saveSettings();
        applySettings();
      });
    });

    // Number inputs
    list.querySelectorAll('.md-settings-number').forEach(input => {
      input.addEventListener('change', () => {
        settings[input.dataset.key] = parseInt(input.value);
        saveSettings();
        applySettings();
      });
    });

    // Textarea
    list.querySelectorAll('.md-settings-textarea').forEach(ta => {
      ta.addEventListener('change', () => {
        settings[ta.dataset.key] = ta.value;
        saveSettings();
        applyCustomCSS();
      });
    });
  }

  // ── Apply settings to UI ──
  function applySettings() {
    const root = document.getElementById('md-reader-root');
    if (!root) return;

    root.setAttribute('data-theme', settings.theme);

    const content = document.querySelector('.md-content');
    if (content) content.style.fontSize = settings.fontSize + 'px';

    const inner = document.querySelector('.md-content-inner');
    if (inner) {
      inner.classList.toggle('md-centered', settings.centerContent);
      if (settings.contentWidth) {
        inner.style.maxWidth = settings.contentWidth + 'px';
      }
    }

    // Sidebars — respect allSidebarsHidden flag
    if (!allSidebarsHidden) {
      const treeSidebar = document.querySelector('.md-sidebar-tree');
      if (treeSidebar) treeSidebar.classList.toggle('md-collapsed', !settings.showFileTree);

      const outlineSidebar = document.querySelector('.md-sidebar-outline');
      if (outlineSidebar) outlineSidebar.classList.toggle('md-collapsed', !settings.showOutline);
    }

    // Auto-refresh
    const indicator = document.getElementById('md-auto-refresh');
    if (indicator) indicator.style.display = settings.autoRefresh ? '' : 'none';

    if (settings.autoRefresh) startAutoRefresh();
    else stopAutoRefresh();

    // Re-render markdown if plugins setting changed
    if (settings.allPlugins && typeof marked !== 'undefined') {
      marked.setOptions({ gfm: true, breaks: true });
    }

    applyCustomCSS();
  }

  function applyCustomCSS() {
    let styleEl = document.getElementById('md-custom-css');
    if (!styleEl && settings.customCSS) {
      styleEl = document.createElement('style');
      styleEl.id = 'md-custom-css';
      document.head.appendChild(styleEl);
    }
    if (styleEl) styleEl.textContent = settings.customCSS || '';
  }

  // ── Auto-refresh ──
  let refreshTimer = null;
  let lastContent = '';

  function startAutoRefresh() {
    stopAutoRefresh();
    if (!window.location.href.startsWith('file://')) return;

    lastContent = getRawMarkdownFromPage() || '';
    refreshTimer = setInterval(() => {
      const current = getRawMarkdownFromPage();
      if (current && current !== lastContent) {
        lastContent = current;
        const inner = document.querySelector('.md-content-inner');
        if (inner) {
          inner.innerHTML = renderMarkdown(current);
          buildOutline(inner);
          addCopyButtons();
        }
      }
    }, settings.refreshInterval);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // ── Event handlers ──
  function setupEventHandlers(root) {
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      switch (action) {
        case 'toggle-tree': {
          const isNarrow = window.innerWidth <= 960;
          if (isNarrow) {
            // Mobile: overlay mode
            toggleMobileSidebar(document.querySelector('.md-sidebar-tree'));
          } else {
            // Desktop: toggle collapse
            settings.showFileTree = !settings.showFileTree;
            allSidebarsHidden = false;
            document.querySelector('.md-sidebar-tree')?.classList.toggle('md-collapsed');
            saveSettings();
          }
          break;
        }

        case 'toggle-outline': {
          const isNarrow = window.innerWidth <= 960;
          if (isNarrow) {
            toggleMobileSidebar(document.querySelector('.md-sidebar-outline'));
          } else {
            settings.showOutline = !settings.showOutline;
            allSidebarsHidden = false;
            document.querySelector('.md-sidebar-outline')?.classList.toggle('md-collapsed');
            saveSettings();
          }
          break;
        }

        case 'toggle-all-sidebars':
          toggleAllSidebars();
          break;

        case 'toggle-theme': {
          settings.theme = settings.theme === 'light' ? 'dark' : 'light';
          root.setAttribute('data-theme', settings.theme);
          saveSettings();
          break;
        }

        case 'font-dec':
          settings.fontSize = Math.max(12, settings.fontSize - 1);
          document.querySelector('.md-content').style.fontSize = settings.fontSize + 'px';
          saveSettings();
          break;

        case 'font-inc':
          settings.fontSize = Math.min(28, settings.fontSize + 1);
          document.querySelector('.md-content').style.fontSize = settings.fontSize + 'px';
          saveSettings();
          break;

        case 'go-to-top':
          document.querySelector('.md-content')?.scrollTo({ top: 0, behavior: 'smooth' });
          break;

        case 'open-settings':
          document.getElementById('md-settings-panel').style.display = '';
          break;

        case 'close-settings':
          document.getElementById('md-settings-panel').style.display = 'none';
          break;

        case 'search-prev':
          if (searchMatches.length > 0) {
            searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
            scrollToMatch(searchIndex);
            updateSearchCount();
          }
          break;

        case 'search-next':
          if (searchMatches.length > 0) {
            searchIndex = (searchIndex + 1) % searchMatches.length;
            scrollToMatch(searchIndex);
            updateSearchCount();
          }
          break;

        case 'search-close':
          clearSearch();
          document.querySelector('.md-search-input').value = '';
          break;
      }
    });

    // Search input
    const searchInput = root.querySelector('.md-search-input');
    let searchDebounce = null;
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          performSearch(e.target.value.trim());
        }, 300);
      });

      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            if (searchMatches.length > 0) {
              searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
              scrollToMatch(searchIndex);
              updateSearchCount();
            }
          } else {
            if (searchMatches.length > 0) {
              searchIndex = (searchIndex + 1) % searchMatches.length;
              scrollToMatch(searchIndex);
              updateSearchCount();
            }
          }
        }
        if (e.key === 'Escape') {
          clearSearch();
          searchInput.value = '';
          searchInput.blur();
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = root.querySelector('.md-search-input');
        if (searchInput) searchInput.focus();
      }
      // Escape to dismiss mobile sidebars
      if (e.key === 'Escape') {
        document.querySelectorAll('.md-sidebar-mobile-open').forEach(el => {
          el.classList.remove('md-sidebar-mobile-open');
        });
      }
    });
  }

  // ── Copy code button ──
  function addCopyButtons() {
    document.querySelectorAll('.md-content pre code').forEach(block => {
      const pre = block.parentElement;
      if (pre.parentElement.classList.contains('md-code-block')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'md-code-block';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const btn = document.createElement('button');
      btn.className = 'md-copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(block.textContent).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
      });
      wrapper.appendChild(btn);
    });
  }

  // ── Replace page with reader UI ──
  function replacePageWithReader(rawMarkdown) {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    const root = buildReaderUI(rawMarkdown);
    document.body.innerHTML = '';
    document.body.appendChild(root);

    // Update tab favicon to match extension icon (data URL to avoid chrome-extension:// restrictions)
    const faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#607cd2"/><path d="M38 92V36l26 30 26-30v56" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    let link = document.querySelector('link[rel*="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg);

    // Build TOC
    const contentInner = document.querySelector('.md-content-inner');
    if (contentInner) {
      buildOutline(contentInner);
      addCopyButtons();
    }

    // Setup hover marquees for outline and file tree
    setupOutlineMarquee();

    // Build file tree
    buildFileTree();
    setupFileTreeMarquee();

    // Build settings panel
    buildSettingsPanel();

    // Setup events
    setupEventHandlers(root);

    // Setup go-to-top button
    setupGoTopButton();

    // Setup responsive sidebars
    setupResponsiveSidebars();

    // Hide loading overlay
    const loading = document.getElementById('md-loading');
    if (loading) loading.style.display = 'none';

    // Apply initial settings
    applySettings();
  }

  // ── Floating action button for rendered pages (GitHub/GitLab blob) ──
  function injectFloatingButton(pageType) {
    if (!['github-blob', 'gitlab-blob', 'bitbucket-src'].includes(pageType)) return;

    const btn = document.createElement('div');
    btn.id = 'md-reader-fab';
    btn.innerHTML = `
      <button class="md-fab-btn" data-action="open-reader">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span class="md-fab-label">Read in Reader</span>
      </button>
    `;

    document.body.appendChild(btn);

    const fabStyle = document.createElement('style');
    fabStyle.id = 'md-fab-styles';
    fabStyle.textContent = `
      #md-reader-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .md-fab-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        border: none;
        border-radius: 24px;
        background: #1e293b;
        color: #e2e8f0;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        transition: all 0.2s ease;
        white-space: nowrap;
        position: relative;
      }
      .md-fab-btn:hover {
        background: #334155;
        box-shadow: 0 6px 20px rgba(0,0,0,0.35);
        transform: translateY(-1px);
      }
      .md-fab-btn svg {
        color: #e9c46a;
        flex-shrink: 0;
      }
      .md-fab-label {
        line-height: 1;
      }
      .md-fab-btn::after {
        content: '';
        position: absolute;
        top: -2px; left: -2px; right: -2px; bottom: -2px;
        border-radius: 26px;
        border: 2px solid #e9c46a;
        animation: md-fab-pulse 2s ease-out 3;
        opacity: 0;
      }
      @keyframes md-fab-pulse {
        0% { opacity: 0.8; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.1); }
      }
    `;
    document.head.appendChild(fabStyle);

    btn.querySelector('[data-action="open-reader"]').addEventListener('click', async () => {
      btn.remove();
      fabStyle.remove();

      await loadSettings();

      const loadingEl = document.createElement('div');
      loadingEl.id = 'md-reader-loading';
      loadingEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#f2f4ff;display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      loadingEl.innerHTML = `
        <div style="width:40px;height:40px;border:3px solid #e2e4f0;border-top-color:#607cd2;border-radius:50%;animation:md-spin 0.8s linear infinite;"></div>
        <div style="margin-top:16px;color:#374151;font-size:14px;">Loading markdown…</div>
        <style>@keyframes md-spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(loadingEl);

      let rawUrl = '';
      switch (pageType) {
        case 'github-blob':   rawUrl = githubBlobToRaw(window.location.href); break;
        case 'gitlab-blob':   rawUrl = gitlabBlobToRaw(window.location.href); break;
        case 'bitbucket-src': rawUrl = bitbucketSrcToRaw(window.location.href); break;
      }

      try {
        const rawMarkdown = await fetchRawMarkdown(rawUrl);
        loadingEl.remove();
        replacePageWithReader(rawMarkdown);
      } catch (err) {
        loadingEl.innerHTML = `
          <div style="color:#e76f51;font-size:14px;text-align:center;max-width:300px;">
            <div style="font-size:18px;margin-bottom:8px;">❌ Failed to load markdown</div>
            <div style="margin-bottom:12px;color:#6b7280;">${err.message}</div>
            <a href="${rawUrl}" target="_blank" style="color:#607cd2;text-decoration:underline;">Open raw file →</a>
          </div>
        `;
      }
    });
  }

  // ── Main initialization ──
  async function init() {
    const pageType = detectPageType();

    switch (pageType.type) {
      case 'none':
        return;

      case 'local':
      case 'raw-url':
        await loadSettings();
        replacePageWithReader(pageType.rawMarkdown);
        break;

      case 'github-blob':
      case 'gitlab-blob':
      case 'bitbucket-src':
        injectFloatingButton(pageType.type);
        break;
    }

    // Listen for messages from popup / background
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'settingsUpdated' && msg.settings) {
          Object.assign(settings, msg.settings);
          applySettings();
        }
        if (msg.type === 'requestFileTree') {
          sendResponse({ data: [] });
        }
        if (msg.type === 'navigateToFile' && msg.path) {
          navigateToFile(msg.path);
        }
        if (msg.type === 'activateReader') {
          const fab = document.getElementById('md-reader-fab');
          if (fab) fab.querySelector('[data-action="open-reader"]').click();
        }
        if (msg.type === 'getPageType') {
          const root = document.getElementById('md-reader-root');
          const fab = document.getElementById('md-reader-fab');
          if (root) {
            sendResponse({ type: 'reader-active' });
          } else if (fab) {
            sendResponse({ type: 'rendered-page' });
          } else {
            sendResponse({ type: 'none' });
          }
        }
        // Directory listing from background SW (hidden tab)
        if (msg.type === 'directoryList') {
          const container = document.getElementById('md-file-tree');
          if (!container) return;
          const files = msg.files;
          if (!files || files.length === 0) return;
          renderDirListing(container, files, getCurrentFileInfo());
        }
      });
    }
  }

  // ── Run ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
