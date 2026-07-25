/* ============================================================================
 * Markdown Reader — Sidebar Logic
 * File browser for the side panel
 * ========================================================================== */

(function () {
  'use strict';

  const treeContainer = document.getElementById('sidebarTree');
  const searchInput = document.getElementById('sidebarSearch');
  const searchStatus = document.getElementById('sidebarSearchStatus');

  // Delegated click handler: toggle dir expand on .tree-dir-header
  // Works for both programmatic and raw-HTML tree items (e.g., test).
  treeContainer?.addEventListener('click', e => {
    const header = e.target.closest('.tree-dir-header');
    if (!header) return;
    const dir = header.parentElement;
    if (!dir) return;
    const arrow = header.querySelector('.tree-arrow');
    const children = dir.querySelector(':scope > .tree-dir-children');
    if (!arrow || !children) return;
    const isCollapsed = children.classList.contains('collapsed');
    arrow.classList.toggle('open');
    children.classList.toggle('collapsed');
    if (!searchActive) {
      const name = header.querySelector('.tree-name')?.textContent || '';
      savedCollapsedState.set(name, isCollapsed);
    }
  });

  // Saved collapsed state per directory (restored when search clears)
  let savedCollapsedState = new Map();
  let searchActive = false;

  // Listen for file tree data from content script / background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'fileTree') {
      renderTree(msg.data);
    }
  });

  // Request file tree from active tab
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'requestFileTree' }).catch(() => {
        // No content script active — show placeholder
        treeContainer.innerHTML = '<div class="tree-empty">Open a .md file to browse files</div>';
      });
    }
  });

  // Render file tree
  function renderTree(items) {
    treeContainer.innerHTML = '';
    if (!items || items.length === 0) {
      treeContainer.innerHTML = '<div class="tree-empty">No files found</div>';
      return;
    }
    items.forEach(item => {
      treeContainer.appendChild(createTreeItem(item));
    });
  }

  function createTreeItem(item) {
    const el = document.createElement('div');
    el.className = item.type === 'dir' ? 'tree-dir' : 'tree-file';

    if (item.type === 'dir') {
      const header = document.createElement('div');
      header.className = 'tree-item tree-dir-header';
      header.innerHTML = `
        <span class="tree-arrow">▶</span>
        <span class="tree-icon">📁</span>
        <span class="tree-name">${escapeHtml(item.name)}</span>
      `;

      const children = document.createElement('div');
      children.className = 'tree-dir-children collapsed';

      if (item.children && item.children.length > 0) {
        item.children.forEach(child => {
          children.appendChild(createTreeItem(child));
        });
      }

      // Event delegation on treeContainer handles clicks (both
      // programmatic and raw-HTML items). Individual listener kept for
      // closure-based `item.path` reference in savedCollapsedState.
      header.addEventListener('click', () => {
        const arrow = header.querySelector('.tree-arrow');
        const children = header.parentElement?.querySelector(':scope > .tree-dir-children');
        if (!arrow || !children) return;
        const isCollapsed = children.classList.contains('collapsed');
        arrow.classList.toggle('open');
        children.classList.toggle('collapsed');
        if (!searchActive) {
          savedCollapsedState.set(item.path || item.name, isCollapsed);
        }
      });

      el.appendChild(header);
      el.appendChild(children);
    } else {
      const fileItem = document.createElement('div');
      fileItem.className = 'tree-item';
      const icon = item.name.endsWith('.md') ? '📄' :
                   item.name.endsWith('.png') || item.name.endsWith('.jpg') ? '🖼️' : '📄';
      fileItem.innerHTML = `
        <span class="tree-icon">${icon}</span>
        <span class="tree-name">${escapeHtml(item.name)}</span>
      `;

      fileItem.addEventListener('click', () => {
        // Navigate to this file
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'navigateToFile',
              path: item.path
            });
          }
        });
      });

      el.appendChild(fileItem);
    }

    return el;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // Enhanced Search: debounce + expand dirs + count + keyboard nav
  // ============================================================

  let searchDebounce = null;
  let searchResults = [];        // matching .tree-item elements
  let searchFocusIndex = -1;

  // Remove previous search highlights
  function clearSearchHighlights() {
    document.querySelectorAll('.tree-name .search-match').forEach(el => {
      el.replaceWith(el.textContent);
    });
  }

  // Highlight matched portion in element
  function highlightMatch(el, query) {
    const text = el.textContent;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return;

    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + query.length);
    const after = text.substring(idx + query.length);

    // Escape HTML entities in before/after, but not in the match span
    const div = document.createElement('div');
    const beforeText = document.createTextNode(before);
    const matchSpan = document.createElement('span');
    matchSpan.className = 'search-match';
    matchSpan.textContent = match;
    const afterText = document.createTextNode(after);

    el.textContent = '';
    el.appendChild(beforeText);
    el.appendChild(matchSpan);
    el.appendChild(afterText);
  }

  // Collect all expandable tree-dir headers
  function getAllDirHeaders() {
    return Array.from(document.querySelectorAll('.tree-dir > .tree-dir-header'));
  }

  // Collect all file tree-items (leaf nodes)
  function getAllFileItems() {
    return Array.from(document.querySelectorAll('.tree-file > .tree-item'));
  }

  // Save current collapsed states before search
  function saveCollapsedStates() {
    savedCollapsedState.clear();
    document.querySelectorAll('.tree-dir').forEach(dir => {
      const children = dir.querySelector(':scope > .tree-dir-children');
      const header = dir.querySelector(':scope > .tree-dir-header');
      if (children && header) {
        const name = header.querySelector('.tree-name')?.textContent || '';
        savedCollapsedState.set(name, children.classList.contains('collapsed'));
      }
    });
  }

  // Restore collapsed states after search clears
  function restoreCollapsedStates() {
    savedCollapsedState.forEach((wasCollapsed, name) => {
      const dirs = document.querySelectorAll('.tree-dir > .tree-dir-header');
      for (const header of dirs) {
        if (header.querySelector('.tree-name')?.textContent === name) {
          const children = header.parentElement.querySelector(':scope > .tree-dir-children');
          const arrow = header.querySelector('.tree-arrow');
          if (children && arrow) {
            children.classList.toggle('collapsed', wasCollapsed);
            arrow.classList.toggle('open', !wasCollapsed);
          }
          break;
        }
      }
    });
  }

  function performSearch(query) {
    clearSearchHighlights();

    // Show all items first
    const allFiles = getAllFileItems();
    const allDirs = getAllDirHeaders();

    allFiles.forEach(item => { item.style.display = ''; });
    allDirs.forEach(header => {
      const parent = header.closest('.tree-dir');
      if (parent) parent.style.display = '';
    });

    searchResults = [];
    searchFocusIndex = -1;

    if (!query) {
      searchActive = false;
      searchStatus.innerHTML = '';
      restoreCollapsedStates();
      return;
    }

    searchActive = true;
    const lowerQuery = query.toLowerCase();

    // 1. Hide non-matching files, collect matches
    const matchingNames = [];
    allFiles.forEach(item => {
      const nameEl = item.querySelector('.tree-name');
      if (!nameEl) return;
      const name = nameEl.textContent.toLowerCase();
      const match = name.includes(lowerQuery);
      item.style.display = match ? '' : 'none';
      if (match) {
        // Highlight match in name
        highlightMatch(nameEl, query);
        matchingNames.push(item);
      }
    });

    // 2. Auto-expand directories containing matches, collapse others
    allDirs.forEach(header => {
      const parentDir = header.closest('.tree-dir');
      if (!parentDir) return;

      const childrenContainer = parentDir.querySelector(':scope > .tree-dir-children');
      if (!childrenContainer) return;

      // Find if any file (in entire subtree) matches
      const childFiles = parentDir.querySelectorAll('.tree-file > .tree-item');
      let hasMatch = false;
      childFiles.forEach(f => {
        if (f.style.display !== 'none') hasMatch = true;
      });

      const arrow = header.querySelector('.tree-arrow');
      if (hasMatch) {
        // Expand
        childrenContainer.classList.remove('collapsed');
        if (arrow) arrow.classList.add('open');
      } else {
        // Collapse
        childrenContainer.classList.add('collapsed');
        if (arrow) arrow.classList.remove('open');
      }
    });

    // 3. Hide empty directories (no matching children)
    allDirs.forEach(header => {
      const parentDir = header.closest('.tree-dir');
      if (!parentDir) return;
      const childVisible = parentDir.querySelector('.tree-file > .tree-item[style*="display:"]:not([style*="display: none"])')
        || parentDir.querySelector('.tree-file > .tree-item:not([style])');
      // Actually, inline style check is fragile. Better approach:
      const childFiles = parentDir.querySelectorAll('.tree-file > .tree-item');
      let anyVisible = false;
      childFiles.forEach(f => {
        if (f.style.display !== 'none') anyVisible = true;
      });
      parentDir.style.display = anyVisible ? '' : 'none';
    });

    // 4. Collect ordered search results for keyboard nav
    const ordered = Array.from(document.querySelectorAll('.tree-file, .tree-dir'))
      .filter(el => el.style.display !== 'none')
      .map(el => el.querySelector('.tree-item'))
      .filter(Boolean);
    searchResults = ordered;

    // 5. Update status
    updateSearchStatus(query, matchingNames.length);
  }

  function updateSearchStatus(query, matchCount) {
    if (!query) {
      searchStatus.innerHTML = '';
      return;
    }
    if (matchCount === 0) {
      searchStatus.innerHTML = `<span class="no-match">✕ No matches for "<strong>${escapeHtml(query)}</strong>"</span>`;
    } else {
      searchStatus.innerHTML = `<span class="count">${matchCount} file${matchCount !== 1 ? 's' : ''} matched</span>`;
    }
  }

  function focusSearchResult(delta) {
    if (searchResults.length === 0) return;

    // Remove previous focus
    document.querySelectorAll('.tree-item.focused').forEach(el => el.classList.remove('focused'));

    searchFocusIndex = (searchFocusIndex + delta + searchResults.length) % searchResults.length;
    const target = searchResults[searchFocusIndex];
    if (target) {
      target.classList.add('focused');
      target.scrollIntoView({ block: 'nearest' });
    }
  }

  function activateFocusedResult() {
    if (searchFocusIndex >= 0 && searchFocusIndex < searchResults.length) {
      searchResults[searchFocusIndex]?.click();
    }
  }

  // ── Search input events ──
  searchInput?.addEventListener('input', e => {
    clearTimeout(searchDebounce);
    const query = e.target.value;
    searchDebounce = setTimeout(() => {
      performSearch(query);
    }, 300);
  });

  // ── Keyboard navigation ──
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusSearchResult(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusSearchResult(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchFocusIndex >= 0) {
        activateFocusedResult();
      } else if (searchResults.length > 0) {
        // Enter without navigation: open first result
        searchResults[0]?.click();
      }
    } else if (e.key === 'Escape') {
      searchInput.value = '';
      performSearch('');
      searchInput.blur();
    }
  });

  // ── Focus style ──
  const focusStyle = document.createElement('style');
  focusStyle.textContent = `
    .tree-item.focused {
      background: #dbeafe !important;
      outline: 2px solid #22c55e;
      outline-offset: -2px;
      border-radius: 4px;
    }
    .search-match {
      background: #fde68a;
      border-radius: 2px;
      padding: 1px 0;
    }
  `;
  document.head.appendChild(focusStyle);

})();
