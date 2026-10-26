/* ============================================================================
 * Markdown Reader — Popup Logic
 * ========================================================================== */

(function () {
  'use strict';

  const DEFAULT_PLUGIN_OPTIONS = {
    gfmTables: true,
    gfmTaskLists: true,
    gfmStrikethrough: true,
    gfmAutolinks: true,
  };
  const DEFAULTS = {
    theme: 'auto',
    fontSize: 16,
    contentWidth: 800,
    centerContent: true,
    showOutline: true,
    showFileTree: true,
    allSidebarsHidden: false,
    autoRefresh: false,
    customCSS: '',
    customCSSEnabled: true,
    customWidth: true,
    adjustFont: true,
    allPlugins: true,
    pluginOptions: { ...DEFAULT_PLUGIN_OPTIONS },
    // AI feature preferences are top-level (v1.3.0); the `ai` object holds only
    // the model connection (vendor / provider / baseUrl / model).
    targetLang: '中文',
    enableTranslate: true,
    enableSummary: true,
    ai: {
      vendor: 'custom',
      provider: 'openai',
      baseUrl: '',
      model: '',
      configured: false,
    },
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
    'aiTranslate',
    'aiSummary',
  ];

  // Derive an http(s) origin pattern from a URL. Extension host-permission
  // patterns do not accept ports, so the port is intentionally dropped
  // (http://127.0.0.1:11434 → http://127.0.0.1).
  function originFromUrl(url) {
    try {
      const u = new URL(String(url || '').trim());
      if (!u.protocol.startsWith('http')) return '';
      return u.protocol + '//' + u.hostname;
    } catch (_) { return ''; }
  }

  // Vendor presets — selecting one auto-fills protocol + Base URL + model hint.
  const AI_VENDORS = {
    custom:    { label: '自定义（手动填写）', protocol: '', baseUrl: '', modelHint: '' },
    openai:    { label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', modelHint: 'gpt-4o-mini' },
    deepseek:  { label: 'DeepSeek 深度求索', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', modelHint: 'deepseek-chat' },
    zhipu:     { label: '智谱 GLM (BigModel)', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelHint: 'glm-4-flash' },
    moonshot:  { label: 'Kimi (月之暗面)', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', modelHint: 'moonshot-v1-8k' },
    qwen:      { label: '通义千问 (阿里 DashScope)', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelHint: 'qwen-plus' },
    ollama:    { label: '本地 Ollama', protocol: 'openai', baseUrl: 'http://localhost:11434/v1', modelHint: 'qwen2.5:7b' },
    anthropic: { label: 'Anthropic Claude', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', modelHint: 'claude-sonnet-4-5' },
  };

  // Load settings
  function loadSettings(cb) {
    chrome.storage.sync.get('mdReaderSettings', result => {
      const saved = result.mdReaderSettings || null;
      const settings = { ...DEFAULTS, ...(saved || {}) };
      settings.ai = { ...DEFAULTS.ai, ...((saved && saved.ai) || {}) };
      // MR-017: existing installs without a saved theme keep the legacy light
      // default; `auto` is only the default for a fresh install.
      if (saved && saved.theme === undefined) settings.theme = 'light';
      // v1.3.0: AI feature prefs moved out of settings.ai.* to the top level.
      const ai = settings.ai || {};
      if (settings.targetLang === undefined && ai.targetLang !== undefined) settings.targetLang = ai.targetLang;
      if (settings.enableTranslate === undefined && ai.enableTranslate !== undefined) settings.enableTranslate = ai.enableTranslate;
      if (settings.enableSummary === undefined && ai.enableSummary !== undefined) settings.enableSummary = ai.enableSummary;
      delete ai.targetLang;
      delete ai.enableTranslate;
      delete ai.enableSummary;

      // MR-020 migration: an older popup stored a boolean in `customCSS`,
      // wiping user CSS. Move the intent to `customCSSEnabled`.
      if (typeof settings.customCSS === 'boolean') {
        settings.customCSSEnabled = settings.customCSS;
        settings.customCSS = '';
      }
      if (typeof settings.customCSS !== 'string') settings.customCSS = '';
      if (typeof settings.customCSSEnabled !== 'boolean') settings.customCSSEnabled = true;
      if (typeof settings.customWidth !== 'boolean') settings.customWidth = true;
      if (typeof settings.adjustFont !== 'boolean') settings.adjustFont = true;

      // MR-019: normalise per-extension plugin options.
      const po = (settings.pluginOptions && typeof settings.pluginOptions === 'object') ? settings.pluginOptions : {};
      settings.pluginOptions = { ...DEFAULT_PLUGIN_OPTIONS };
      Object.keys(DEFAULT_PLUGIN_OPTIONS).forEach(k => {
        if (typeof po[k] === 'boolean') settings.pluginOptions[k] = po[k];
      });
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

  // Settings changes must reach EVERY open reader tab instantly (no manual
  // refresh). Route through the service worker, which broadcasts to all tabs.
  // `sendMessageToActiveTab` is only for active-tab actions (getPageType /
  // activateReader); settings updates go wide.
  // `settings` is passed explicitly — it only exists inside the loadSettings
  // callback, so a module-level reference would throw a ReferenceError here.
  function broadcastSettings(settings) {
    try {
      chrome.runtime.sendMessage({ type: 'settingsUpdated', settings }).catch(() => {});
    } catch (_) {}
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
        if (statusText) statusText.textContent = 'Not a Markdown page — open a .md file or a direct .md link, or try the sample below';
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
    // Standalone mode: popup.html opened as a full tab from the reader's
    // "配置" button. Style it for a full page and surface a "done" action.
    if (/[?&]standalone=1/.test(location.search)) {
      document.body && document.body.classList.add('standalone');
      const aiSection = document.querySelector('#aiVendor') &&
        document.querySelector('#aiVendor').closest('.popup-section');
      if (aiSection) aiSection.scrollIntoView();
      const done = document.getElementById('aiDoneBtn');
      if (done) {
        done.style.display = '';
        done.addEventListener('click', async () => {
          // MR-027: guarantee endpoint access before leaving the config page.
          try {
            const baseUrlInput = document.getElementById('aiBaseUrl');
            if (chrome.permissions && baseUrlInput) {
              const providerSel = document.getElementById('aiProvider');
              const typed = (baseUrlInput.value || '').trim()
                || (providerSel && providerSel.value === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1');
              const origin = originFromUrl(typed);
              if (origin) await chrome.permissions.request({ origins: [origin + '/*'] });
            }
          } catch (_) {}
          // Hand off to the SW: it closes this tab and focuses the reading tab.
          try { chrome.runtime.sendMessage({ type: 'aiConfigDone' }); } catch (_) {}
          // Self-close fallback (harmless if the SW already closed this tab).
          if (chrome.tabs && chrome.tabs.getCurrent) {
            chrome.tabs.getCurrent(t => { if (t && t.id) { try { chrome.tabs.remove(t.id); } catch (_) {} } });
          } else {
            window.close();
          }
        });
      }
    }

    // Reviewability: open a bundled public sample so the reader can be seen
    // without hunting for a local .md file or toggling file-URL access first.
    const sampleBtn = document.getElementById('popupTrySample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://raw.githubusercontent.com/yiyan-yixing/markdown-reader/main/sample.md' });
        window.close();
      });
    }

    // Detect tab state first
    detectTabState();

    // Update toggle states
    TOGGLE_FEATURES.forEach(key => {
      const el = document.querySelector(`.popup-feature[data-key="${key}"] .popup-check`);
      if (!el) return;

      let isOn;
      if (key === 'autoRefresh') isOn = settings.autoRefresh;
      else if (key === 'customCSS') isOn = settings.customCSSEnabled !== false;
      else if (key === 'aiTranslate') isOn = settings.enableTranslate !== false;
      else if (key === 'aiSummary') isOn = settings.enableSummary !== false;
      else isOn = settings[key] !== false;
      el.classList.toggle('unchecked', !isOn);
    });

    // Font size
    const fontSizeDisplay = document.getElementById('fontSizeDisplay');
    if (fontSizeDisplay) fontSizeDisplay.textContent = settings.fontSize;

    // Content width
    const widthInput = document.getElementById('contentWidth');
    if (widthInput) widthInput.value = settings.contentWidth || 800;

    // Custom CSS textarea (string, independent from the enable toggle)
    const customCssInput = document.getElementById('customCSS');
    if (customCssInput) customCssInput.value = settings.customCSS || '';

    // Reflect which controls are actually live.
    function syncControlAvailability() {
      const widthInput = document.getElementById('contentWidth');
      if (widthInput) widthInput.disabled = settings.customWidth === false;
      const fontDisabled = settings.adjustFont === false;
      ['fontDec', 'fontInc'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.disabled = fontDisabled;
      });
    }
    syncControlAvailability();

    // Per-extension plugin options
    function syncPluginOptionInputs() {
      const master = settings.allPlugins !== false;
      document.querySelectorAll('[data-plugin-option]').forEach(cb => {
        const k = cb.dataset.pluginOption;
        cb.checked = (settings.pluginOptions || {})[k] !== false;
        cb.disabled = !master;
      });
    }
    syncPluginOptionInputs();

    // Theme buttons
    document.querySelectorAll('.popup-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });

    // Controls inside a feature row must not toggle the row itself.
    document.querySelectorAll('.popup-feature input, .popup-feature textarea, .popup-feature select')
      .forEach(el => el.addEventListener('click', e => e.stopPropagation()));

    // Toggle feature clicks
    document.querySelectorAll('.popup-feature[data-key]').forEach(feature => {
      const check = feature.querySelector('.popup-check');
      if (!check || feature.classList.contains('popup-feature-info')) return;

      feature.addEventListener('click', () => {
        const key = feature.dataset.key;
        // aiTargetLang is a preference select, not a toggle — skip it.
        if (key === 'aiTargetLang') return;
        const isCurrentlyOn = !check.classList.contains('unchecked');
        check.classList.toggle('unchecked', isCurrentlyOn);

        if (key === 'autoRefresh') {
          settings.autoRefresh = !isCurrentlyOn;
        } else if (key === 'customWidth') {
          settings.customWidth = !isCurrentlyOn;
        } else if (key === 'adjustFont') {
          settings.adjustFont = !isCurrentlyOn;
        } else if (key === 'customCSS') {
          // Dedicated boolean — never write true/false into the CSS string.
          settings.customCSSEnabled = !isCurrentlyOn;
        } else if (key === 'pluginOptions') {
          // Master toggle for the individual GFM extensions (never replace the
          // object with a boolean).
          const next = !isCurrentlyOn;
          settings.pluginOptions = settings.pluginOptions || { ...DEFAULT_PLUGIN_OPTIONS };
          Object.keys(DEFAULT_PLUGIN_OPTIONS).forEach(k => { settings.pluginOptions[k] = next; });
        } else if (key === 'aiTranslate') {
          settings.enableTranslate = !isCurrentlyOn;
        } else if (key === 'aiSummary') {
          settings.enableSummary = !isCurrentlyOn;
        } else {
          settings[key] = !isCurrentlyOn;
        }
        if (key === 'allPlugins' || key === 'pluginOptions') {
          syncPluginOptionInputs();
        }
        if (key === 'customWidth' || key === 'adjustFont') {
          syncControlAvailability();
        }

        saveSettings(settings);
        broadcastSettings(settings);
      });
    });

    // Font size buttons
    document.getElementById('fontDec')?.addEventListener('click', () => {
      if (settings.adjustFont === false) return;
      settings.fontSize = Math.max(12, settings.fontSize - 1);
      document.getElementById('fontSizeDisplay').textContent = settings.fontSize;
      saveSettings(settings);
      broadcastSettings(settings);
    });

    document.getElementById('fontInc')?.addEventListener('click', () => {
      if (settings.adjustFont === false) return;
      settings.fontSize = Math.min(28, settings.fontSize + 1);
      document.getElementById('fontSizeDisplay').textContent = settings.fontSize;
      saveSettings(settings);
      broadcastSettings(settings);
    });

    // Content width
    document.getElementById('contentWidth')?.addEventListener('change', e => {
      const parsed = parseInt(e.target.value, 10);
      settings.contentWidth = Math.min(2000, Math.max(400, Number.isFinite(parsed) ? parsed : 800));
      e.target.value = String(settings.contentWidth);
      saveSettings(settings);
      broadcastSettings(settings);
    });

    // Custom CSS textarea
    document.getElementById('customCSS')?.addEventListener('change', e => {
      settings.customCSS = String(e.target.value || '');
      saveSettings(settings);
      broadcastSettings(settings);
    });

    // Per-extension plugin option checkboxes
    document.querySelectorAll('[data-plugin-option]').forEach(cb => {
      cb.addEventListener('change', () => {
        settings.pluginOptions = settings.pluginOptions || { ...DEFAULT_PLUGIN_OPTIONS };
        settings.pluginOptions[cb.dataset.pluginOption] = cb.checked;
        saveSettings(settings);
        broadcastSettings(settings);
      });
    });

    // Browse files → Chrome side panel (needs a user gesture; this click is it)
    document.getElementById('popupBrowseFiles')?.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      } catch (_) {}
    });

    // Theme buttons — all 7 themes are free and apply directly
    document.querySelectorAll('.popup-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.theme = btn.dataset.theme;
        document.querySelectorAll('.popup-theme-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === settings.theme);
        });
        saveSettings(settings);
        broadcastSettings(settings);
      });
    });

    // ── AI assistant config (model connection only — feature prefs like
    //    targetLang / enableTranslate / enableSummary live at the top level) ──
    settings.ai = settings.ai || {};

    // Show the AI feature prefs (translate / summary / target language) only
    // after the model connection is configured.
    function syncAIFeatures() {
      const el = document.getElementById('popup-ai-features');
      if (el) el.style.display = settings.ai.configured ? '' : 'none';
    }

    const aiEl = {
      vendor: document.getElementById('aiVendor'),
      provider: document.getElementById('aiProvider'),
      baseUrl: document.getElementById('aiBaseUrl'),
      apiKey: document.getElementById('aiApiKey'),
      model: document.getElementById('aiModel'),
    };

    // Populate the vendor preset dropdown from the AI_VENDORS map.
    if (aiEl.vendor) {
      aiEl.vendor.innerHTML = Object.keys(AI_VENDORS)
        .map(k => '<option value="' + k + '">' + AI_VENDORS[k].label + '</option>')
        .join('');
      aiEl.vendor.value = settings.ai.vendor || 'custom';
    }

    // API key lives in local storage (not synced) — load into the field.
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('mdReaderApiKey', res => {
        const key = (res && res.mdReaderApiKey) || '';
        if (aiEl.apiKey) aiEl.apiKey.value = key;
        // Reconcile the non-secret "configured" flag with the real key presence,
        // so a stale-false flag can't keep the reader showing "未配置".
        const configured = !!key;
        if (settings.ai.configured !== configured) {
          settings.ai.configured = configured;
          saveSettings(settings);
        }
        syncAIFeatures();
      });
    }

    if (aiEl.provider) aiEl.provider.value = settings.ai.provider || 'openai';
    if (aiEl.baseUrl) aiEl.baseUrl.value = settings.ai.baseUrl || '';
    if (aiEl.model) aiEl.model.value = settings.ai.model || '';

    // Translation target language — top-level preference (Feature Settings).
    const targetLangSel = document.getElementById('aiTargetLang');
    if (targetLangSel) targetLangSel.value = settings.targetLang || '中文';
    {
      const v0 = AI_VENDORS[(settings.ai && settings.ai.vendor) || 'custom'] || AI_VENDORS.custom;
      if (aiEl.model) aiEl.model.placeholder = v0.modelHint || 'model name';
    }

    function syncBaseUrlPlaceholder() {
      if (!aiEl.baseUrl || !aiEl.provider) return;
      aiEl.baseUrl.placeholder = aiEl.provider.value === 'anthropic'
        ? 'https://api.anthropic.com'
        : 'https://api.openai.com/v1';
    }
    syncBaseUrlPlaceholder();

    function saveAINonSecret() {
      settings.ai.vendor = aiEl.vendor ? aiEl.vendor.value : (settings.ai.vendor || 'custom');
      settings.ai.provider = aiEl.provider.value;
      settings.ai.baseUrl = (aiEl.baseUrl.value || '').trim();
      settings.ai.model = (aiEl.model.value || '').trim();
      saveSettings(settings);
      broadcastSettings(settings);
    }

    // MR-027: one place that guarantees host access before any request can be
    // made — vendor change, Base URL save, API-key save, test, and closing the
    // config page all funnel through this.
    function effectiveBaseUrl(baseUrl) {
      const typed = String(baseUrl || '').trim();
      if (typed) return typed;
      const provider = aiEl.provider ? aiEl.provider.value : 'openai';
      return provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
    }

    async function maybeRequestHostPermission(baseUrl) {
      if (!chrome.permissions) return true; // unsupported (e.g. test mock)
      const origin = originFromUrl(effectiveBaseUrl(baseUrl));
      if (!origin) return true;
      try {
        // Call request() directly: it returns true without prompting when the
        // origin is already granted, and avoids consuming the user gesture on
        // an intervening await.
        const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
        return granted !== false;
      } catch (_) { return false; }
    }

    aiEl.vendor?.addEventListener('change', async () => {
      const v = AI_VENDORS[aiEl.vendor.value] || AI_VENDORS.custom;
      if (v.protocol) aiEl.provider.value = v.protocol;
      if (v.baseUrl) aiEl.baseUrl.value = v.baseUrl;
      if (aiEl.model) aiEl.model.placeholder = v.modelHint || 'model name';
      syncBaseUrlPlaceholder();
      saveAINonSecret();
      await maybeRequestHostPermission(aiEl.baseUrl.value);
    });

    aiEl.provider?.addEventListener('change', async () => {
      syncBaseUrlPlaceholder();
      saveAINonSecret();
      await maybeRequestHostPermission(aiEl.baseUrl.value);
    });
    aiEl.baseUrl?.addEventListener('change', async () => {
      // If the typed URL no longer matches the selected preset, fall back to 自定义.
      const cur = AI_VENDORS[aiEl.vendor ? aiEl.vendor.value : 'custom'];
      const typed = (aiEl.baseUrl.value || '').trim();
      if (!cur || (!cur.baseUrl && typed) || (cur.baseUrl && cur.baseUrl !== typed)) {
        if (aiEl.vendor) aiEl.vendor.value = 'custom';
        if (aiEl.model) aiEl.model.placeholder = 'model name';
      }
      saveAINonSecret();
      await maybeRequestHostPermission(typed);
    });
    aiEl.model?.addEventListener('change', saveAINonSecret);

    // Top-level AI feature preference — the select lives in the AI 助手 section.
    targetLangSel?.addEventListener('change', () => {
      settings.targetLang = targetLangSel.value;
      saveSettings(settings);
      broadcastSettings(settings);
    });

    // API key → local storage only (never put in sync / broadcasts)
    aiEl.apiKey?.addEventListener('change', async () => {
      const key = aiEl.apiKey.value;
      // Saving the key is a user gesture → the right moment to secure access.
      await maybeRequestHostPermission(aiEl.baseUrl.value);
      const finalize = () => {
        settings.ai.configured = !!key;
        saveSettings(settings);
        broadcastSettings(settings);
        syncAIFeatures();
      };
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ mdReaderApiKey: key }, finalize);
      } else {
        finalize();
      }
    });

    // Show / hide the API key
    document.getElementById('aiKeyToggle')?.addEventListener('click', () => {
      if (aiEl.apiKey) aiEl.apiKey.type = aiEl.apiKey.type === 'password' ? 'text' : 'password';
    });

    // Test connection — uses the same Port the content script uses.
    const testBtn = document.getElementById('aiTestBtn');
    const statusEl = document.getElementById('aiStatus');
    testBtn?.addEventListener('click', async () => {
      const setStatus = (t, cls) => {
        if (statusEl) {
          statusEl.textContent = t;
          statusEl.className = 'popup-ai-status' + (cls ? ' ' + cls : '');
        }
      };
      setStatus('测试中…', '');
      testBtn.disabled = true;

      const provider = aiEl.provider.value;
      const baseUrl = (aiEl.baseUrl.value || '').trim();
      const model = (aiEl.model.value || '').trim();
      const apiKey = aiEl.apiKey.value;

      // Ensure host access to the configured endpoint (definitive user gesture).
      await maybeRequestHostPermission(baseUrl);

      const runTest = () => {
        const port = chrome.runtime.connect({ name: 'md-reader-llm' });
        let gotText = false;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          testBtn.disabled = false;
          try { port.disconnect(); } catch (_) {}
        };
        port.onMessage.addListener(m => {
          if (m.type === 'chunk') { gotText = true; }
          if (m.type === 'done') {
            setStatus(gotText ? '✓ 连接成功' : '⚠ 已连接但无返回内容', gotText ? 'ok' : 'err');
            finish();
          }
          if (m.type === 'error') {
            setStatus('✗ ' + m.error, 'err');
            finish();
          }
        });
        port.onDisconnect.addListener(() => {
          if (!finished) { setStatus('✗ 连接已断开', 'err'); finish(); }
        });
        port.postMessage({
          type: 'aiComplete',
          provider,
          baseUrl,
          model,
          messages: [{ role: 'user', content: 'Reply with exactly one word: ok' }],
          max_tokens: 16,
        });
      };

      // Persist the key first so the service worker reads the latest value.
      // Also flip the non-secret "configured" flag so the reader UI updates even
      // when the key field's change event never fired (e.g. paste + click).
      const configured = !!apiKey;
      const proceed = () => {
        if (settings.ai.configured !== configured) {
          settings.ai.configured = configured;
          saveSettings(settings);
          broadcastSettings(settings);
          syncAIFeatures();
        }
        runTest();
      };
      if (chrome.storage && chrome.storage.local && apiKey) {
        chrome.storage.local.set({ mdReaderApiKey: apiKey }, proceed);
      } else {
        proceed();
      }
    });

  });
})();
