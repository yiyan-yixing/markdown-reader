/* ============================================================================
 * Markdown Reader — Sidebar Logic
 * File browser for the side panel
 * ========================================================================== */

(function () {
  'use strict';

  const treeContainer = document.getElementById('sidebarTree');
  const searchInput = document.getElementById('sidebarSearch');

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
      header.className = 'tree-item';
      header.innerHTML = `
        <span class="tree-arrow">▶</span>
        <span class="tree-icon">📁</span>
        <span class="tree-name">${item.name}</span>
      `;

      const children = document.createElement('div');
      children.className = 'tree-dir-children collapsed';

      if (item.children && item.children.length > 0) {
        item.children.forEach(child => {
          children.appendChild(createTreeItem(child));
        });
      }

      header.addEventListener('click', () => {
        const arrow = header.querySelector('.tree-arrow');
        arrow.classList.toggle('open');
        children.classList.toggle('collapsed');
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
        <span class="tree-name">${item.name}</span>
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

  // Search filter
  searchInput?.addEventListener('input', e => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.tree-file .tree-name, .tree-dir > .tree-item .tree-name').forEach(name => {
      const item = name.closest('.tree-file') || name.closest('.tree-dir');
      if (item) {
        const match = name.textContent.toLowerCase().includes(query);
        item.style.display = match || !query ? '' : 'none';
      }
    });
  });
})();
