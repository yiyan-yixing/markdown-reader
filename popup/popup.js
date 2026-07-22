/* ============================================================================
 * Markdown Reader — Popup Logic
 * ========================================================================== */

(function () {
  'use strict';

  const DEFAULTS = {
    theme: 'light',
    fontSize: 16,
    contentWidth: 800,
    centerContent: true,
    showOutline: true,
    showFileTree: true,
    allSidebarsHidden: false,
    autoRefresh: false,
    customCSS: '',
    allPlugins: true,
  };

  // Boolean toggle features
  const TOGGLE_FEATURES = [
    'allPlugins',
    'showOutline',
    'autoRefresh',
    'centerContent',
    'customWidth',
    'customCSS',
    'adjustFont',
    'showFileTree',
    'pluginOptions',
  ];

  // Load settings
  function loadSettings(cb) {
    chrome.storage.sync.get('mdReaderSettings', result => {
      const settings = { ...DEFAULTS, ...(result.mdReaderSettings || {}) };
      cb(settings);
    });
  }

  function saveSettings(settings) {
    chrome.storage.sync.set({ mdReaderSettings: settings });
  }

  // Send message to active tab
  function sendMessageToActiveTab(msg) {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, msg)
            .then(resolve)
            .catch(() => resolve(null));
        } else {
          resolve(null);
        }
      });
    });
  }

  // Detect current tab state
  async function detectTabState() {
    const statusText = document.getElementById('popup-status-text');
    const activateSection = document.getElementById('popup-activate-section');
    const activateBtn = document.getElementById('popupActivateReader');

    // Ask content script for page type
    const response = await sendMessageToActiveTab({ type: 'getPageType' });

    if (!response) {
      // No content script active — check URL ourselves
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const url = tab.url;
      const isGitHub = /github\.com\/.*\/blob\//.test(url) && /\.md/i.test(url);
      const isGitLab = /gitlab\.com\/.*\/blob\//.test(url) && /\.md/i.test(url);
      const isBitbucket = /bitbucket\.org\/.*\/src\//.test(url) && /\.md/i.test(url);
      const isRawMd = /\.(md|markdown|mdown|mkd)$/i.test(url);
      const isLocal = url.startsWith('file://') && /\.(md|markdown|mdown|mkd)$/i.test(url);

      if (isGitHub || isGitLab || isBitbucket) {
        // Rendered page — show activate button
        if (activateSection) activateSection.style.display = '';
        if (statusText) statusText.textContent = 'Rendered page detected — click to switch to reader';
      } else if (isLocal || isRawMd) {
        // Already auto-intercepted
        if (statusText) statusText.textContent = '✅ Reader active';
      } else {
        if (statusText) statusText.textContent = 'Not a markdown page';
      }
    } else {
      // Content script responded
      if (response.type === 'reader-active') {
        if (statusText) statusText.textContent = '✅ Reader active';
      } else if (response.type === 'rendered-page') {
        if (activateSection) activateSection.style.display = '';
        if (statusText) statusText.textContent = 'Rendered page — click to switch';
      }
    }

    // Activate reader button
    if (activateBtn) {
      activateBtn.addEventListener('click', () => {
        sendMessageToActiveTab({ type: 'activateReader' });
        window.close(); // Close popup after action
      });
    }
  }

  // Init
  loadSettings(settings => {
    // Detect tab state first
    detectTabState();

    // Update toggle states
    TOGGLE_FEATURES.forEach(key => {
      const el = document.querySelector(`.popup-feature[data-key="${key}"] .popup-check`);
      if (!el) return;

      const isOn = key === 'autoRefresh' ? settings.autoRefresh : (settings[key] !== false);
      el.classList.toggle('unchecked', !isOn);
    });

    // Font size
    const fontSizeDisplay = document.getElementById('fontSizeDisplay');
    if (fontSizeDisplay) fontSizeDisplay.textContent = settings.fontSize;

    // Content width
    const widthInput = document.getElementById('contentWidth');
    if (widthInput) widthInput.value = settings.contentWidth || 800;

    // Theme buttons
    document.querySelectorAll('.popup-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });

    // Toggle feature clicks
    document.querySelectorAll('.popup-feature[data-key]').forEach(feature => {
      const check = feature.querySelector('.popup-check');
      if (!check || feature.classList.contains('popup-feature-info')) return;

      feature.addEventListener('click', () => {
        const key = feature.dataset.key;
        const isCurrentlyOn = !check.classList.contains('unchecked');
        check.classList.toggle('unchecked', isCurrentlyOn);

        if (key === 'autoRefresh') {
          settings.autoRefresh = !isCurrentlyOn;
        } else if (key === 'customWidth') {
          settings.customWidth = !isCurrentlyOn;
        } else {
          settings[key] = !isCurrentlyOn;
        }

        saveSettings(settings);
        sendMessageToActiveTab({ type: 'settingsUpdated', settings });
      });
    });

    // Font size buttons
    document.getElementById('fontDec')?.addEventListener('click', () => {
      settings.fontSize = Math.max(12, settings.fontSize - 1);
      document.getElementById('fontSizeDisplay').textContent = settings.fontSize;
      saveSettings(settings);
      sendMessageToActiveTab({ type: 'settingsUpdated', settings });
    });

    document.getElementById('fontInc')?.addEventListener('click', () => {
      settings.fontSize = Math.min(28, settings.fontSize + 1);
      document.getElementById('fontSizeDisplay').textContent = settings.fontSize;
      saveSettings(settings);
      sendMessageToActiveTab({ type: 'settingsUpdated', settings });
    });

    // Content width
    document.getElementById('contentWidth')?.addEventListener('change', e => {
      settings.contentWidth = parseInt(e.target.value) || 800;
      saveSettings(settings);
      sendMessageToActiveTab({ type: 'settingsUpdated', settings });
    });

    // Theme buttons
    document.querySelectorAll('.popup-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.theme = btn.dataset.theme;
        document.querySelectorAll('.popup-theme-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === settings.theme);
        });
        saveSettings(settings);
        sendMessageToActiveTab({ type: 'settingsUpdated', settings });
      });
    });
  });
})();
