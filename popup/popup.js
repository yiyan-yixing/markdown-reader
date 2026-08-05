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
    ai: {
      vendor: 'custom',
      provider: 'openai',
      baseUrl: '',
      model: '',
      targetLang: '中文',
      enableTranslate: true,
      enableSummary: true,
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

  // Derive an http(s) origin string from a URL (used to request host permission).
  function originFromUrl(url) {
    try {
      const u = new URL(String(url || '').trim());
      if (!u.protocol.startsWith('http')) return '';
      return u.origin;
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
        done.addEventListener('click', () => {
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

    // Detect tab state first
    detectTabState();

    // Update toggle states
    TOGGLE_FEATURES.forEach(key => {
      const el = document.querySelector(`.popup-feature[data-key="${key}"] .popup-check`);
      if (!el) return;

      let isOn;
      if (key === 'autoRefresh') isOn = settings.autoRefresh;
      else if (key === 'aiTranslate') isOn = settings.ai && settings.ai.enableTranslate;
      else if (key === 'aiSummary') isOn = settings.ai && settings.ai.enableSummary;
      else isOn = settings[key] !== false;
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
        } else if (key === 'aiTranslate') {
          settings.ai.enableTranslate = !isCurrentlyOn;
        } else if (key === 'aiSummary') {
          settings.ai.enableSummary = !isCurrentlyOn;
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

    // Theme buttons (free themes — Pro themes are gated by the license check below)
    document.querySelectorAll('.popup-theme-btn').forEach(btn => {
      if (btn.classList.contains('popup-theme-pro-btn')) return; // handled by license gate
      btn.addEventListener('click', () => {
        settings.theme = btn.dataset.theme;
        document.querySelectorAll('.popup-theme-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === settings.theme);
        });
        saveSettings(settings);
        sendMessageToActiveTab({ type: 'settingsUpdated', settings });
      });
    });

    // ── AI assistant config ──
    settings.ai = settings.ai || {};
    const aiEl = {
      vendor: document.getElementById('aiVendor'),
      provider: document.getElementById('aiProvider'),
      baseUrl: document.getElementById('aiBaseUrl'),
      apiKey: document.getElementById('aiApiKey'),
      model: document.getElementById('aiModel'),
      targetLang: document.getElementById('aiTargetLang'),
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
      });
    }

    if (aiEl.provider) aiEl.provider.value = settings.ai.provider || 'openai';
    if (aiEl.baseUrl) aiEl.baseUrl.value = settings.ai.baseUrl || '';
    if (aiEl.model) aiEl.model.value = settings.ai.model || '';
    if (aiEl.targetLang) aiEl.targetLang.value = settings.ai.targetLang || '中文';
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
      settings.ai.targetLang = aiEl.targetLang.value;
      saveSettings(settings);
      sendMessageToActiveTab({ type: 'settingsUpdated', settings });
    }

    async function maybeRequestHostPermission(baseUrl) {
      if (!chrome.permissions) return; // unsupported (e.g. test mock)
      const origin = originFromUrl(baseUrl);
      if (!origin) return;
      try {
        const has = await chrome.permissions.contains({ origins: [origin + '/*'] });
        if (!has) await chrome.permissions.request({ origins: [origin + '/*'] });
      } catch (_) {}
    }

    aiEl.vendor?.addEventListener('change', () => {
      const v = AI_VENDORS[aiEl.vendor.value] || AI_VENDORS.custom;
      if (v.protocol) aiEl.provider.value = v.protocol;
      if (v.baseUrl) aiEl.baseUrl.value = v.baseUrl;
      if (aiEl.model) aiEl.model.placeholder = v.modelHint || 'model name';
      syncBaseUrlPlaceholder();
      saveAINonSecret();
    });

    aiEl.provider?.addEventListener('change', () => { syncBaseUrlPlaceholder(); saveAINonSecret(); });
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
    aiEl.targetLang?.addEventListener('change', saveAINonSecret);

    // API key → local storage only (never put in sync / broadcasts)
    aiEl.apiKey?.addEventListener('change', () => {
      const key = aiEl.apiKey.value;
      const finalize = () => {
        settings.ai.configured = !!key;
        saveSettings(settings);
        sendMessageToActiveTab({ type: 'settingsUpdated', settings });
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
          sendMessageToActiveTab({ type: 'settingsUpdated', settings });
        }
        runTest();
      };
      if (chrome.storage && chrome.storage.local && apiKey) {
        chrome.storage.local.set({ mdReaderApiKey: apiKey }, proceed);
      } else {
        proceed();
      }
    });

    // ── License (Markdown Reader Pro) ────────────────────────────────────
    // License state lives in the SW (single source of truth, like the AI key).
    // The popup only ever sees the status + Pro boolean — never the key value.
    const LS_CHECKOUT_URL_POPUP = ''; // filled after LS product config (A1, Day 1)
    const LS_PORTAL_URL_POPUP = 'https://yiyan-yixing.lemonsqueezy.com/my-orders';

    const licenseEls = {
      status: document.getElementById('licenseStatus'),
      statusText: document.getElementById('licenseStatusText'),
      form: document.getElementById('licenseForm'),
      keyInput: document.getElementById('licenseKeyInput'),
      keyToggle: document.getElementById('licenseKeyToggle'),
      activateBtn: document.getElementById('licenseActivateBtn'),
      deactivateBtn: document.getElementById('licenseDeactivateBtn'),
      buyBtn: document.getElementById('licenseBuyBtn'),
      portalLink: document.getElementById('licensePortalLink'),
      proPicker: document.querySelector('.popup-theme-pro'),
    };

    function setLicenseStatus(state) {
      const s = state.status;
      const usage = (state.activation_usage != null && state.activation_limit)
        ? '（' + state.activation_usage + '/' + state.activation_limit + ' 设备）' : '';
      const map = {
        active:       { cls: 'active',     text: '✓ Pro 已激活' + usage },
        validating:   { cls: 'validating', text: '正在验证 License…' },
        offline_grace:{ cls: 'offline',    text: '⚠ 无法联网验证 License，Pro 暂继续可用，联网后自动重校验' },
        invalid:      { cls: 'invalid',    text: '✗ License 已失效（退款/封禁），免费版仍可使用' },
      };
      const meta = map[s] || { cls: 'unknown', text: state.isPro ? 'Pro 已激活' : '未激活 — 升级 Pro 解锁 4 款主题' };
      if (licenseEls.status) licenseEls.status.className = 'popup-license-status popup-license-status--' + meta.cls;
      if (licenseEls.statusText) licenseEls.statusText.textContent = meta.text;
      // Hide manual entry form once Pro is on; show deactivate instead.
      const isPro = !!state.isPro;
      if (licenseEls.form) licenseEls.form.classList.toggle('popup-license-form--hidden', isPro);
      if (licenseEls.deactivateBtn) licenseEls.deactivateBtn.style.display = isPro ? '' : 'none';
      // Unlock/lock the Pro theme picker.
      if (licenseEls.proPicker) licenseEls.proPicker.classList.toggle('popup-theme-pro-unlocked', isPro);
      // Hide buy + portal once activated.
      if (licenseEls.buyBtn) licenseEls.buyBtn.style.display = isPro ? 'none' : '';
      if (licenseEls.portalLink) licenseEls.portalLink.style.display = isPro ? 'none' : '';
      // Reflect current theme (incl. a Pro theme) on the picker buttons.
      document.querySelectorAll('.popup-theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === settings.theme);
      });
    }

    function sendBackground(msg) {
      return new Promise(resolve => {
        try { chrome.runtime.sendMessage(msg, resolve); } catch (_) { resolve(null); }
      });
    }

    async function refreshLicenseStatus() {
      const state = await sendBackground({ type: 'licenseGetStatus' });
      if (state) setLicenseStatus(state);
    }

    // Activate
    if (licenseEls.activateBtn) {
      licenseEls.activateBtn.addEventListener('click', async () => {
        const key = licenseEls.keyInput ? licenseEls.keyInput.value.trim() : '';
        if (!key) return;
        licenseEls.activateBtn.disabled = true;
        if (licenseEls.statusText) licenseEls.statusText.textContent = '正在激活…';
        if (licenseEls.status) licenseEls.status.className = 'popup-license-status popup-license-status--validating';
        const res = await sendBackground({ type: 'licenseActivate', license_key: key });
        licenseEls.activateBtn.disabled = false;
        if (res && res.success) {
          if (licenseEls.keyInput) licenseEls.keyInput.value = '';
          await refreshLicenseStatus();
          sendMessageToActiveTab({ type: 'licenseUpdated' });
        } else {
          const err = (res && res.error) || '激活失败';
          if (licenseEls.statusText) licenseEls.statusText.textContent = '✗ ' + err;
          if (licenseEls.status) licenseEls.status.className = 'popup-license-status popup-license-status--invalid';
        }
      });
    }

    // Deactivate (free one of the 3 device slots)
    if (licenseEls.deactivateBtn) {
      licenseEls.deactivateBtn.addEventListener('click', async () => {
        if (!confirm('停用此设备的 Pro 授权？这将释放一个设备槽位。')) return;
        await sendBackground({ type: 'licenseDeactivate' });
        await refreshLicenseStatus();
        sendMessageToActiveTab({ type: 'licenseUpdated' });
      });
    }

    // Show/hide license key (reuses the AI-key toggle pattern)
    if (licenseEls.keyToggle) {
      licenseEls.keyToggle.addEventListener('click', () => {
        if (licenseEls.keyInput) licenseEls.keyInput.type = licenseEls.keyInput.type === 'password' ? 'text' : 'password';
      });
    }

    // Buy → external LS checkout (Chrome policy: no in-extension payment iframe)
    if (licenseEls.buyBtn) {
      licenseEls.buyBtn.addEventListener('click', () => {
        if (!LS_CHECKOUT_URL_POPUP) {
          alert('升级链接待配置（LS 产品创建后填入，A1 Day 1 产物）。');
          return;
        }
        if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: LS_CHECKOUT_URL_POPUP });
      });
    }
    if (licenseEls.portalLink && LS_PORTAL_URL_POPUP) {
      licenseEls.portalLink.href = LS_PORTAL_URL_POPUP;
    }

    // Pro theme buttons — gate on license. Locked click nudges to upgrade.
    document.querySelectorAll('.popup-theme-pro-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        const state = await sendBackground({ type: 'licenseGetStatus' });
        if (!state || !state.isPro) {
          const sec = document.getElementById('popup-license-section');
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (licenseEls.status) licenseEls.status.className = 'popup-license-status popup-license-status--unknown';
          if (licenseEls.statusText) licenseEls.statusText.textContent = '🔒 这是 Pro 主题。激活 License 后解锁，或点击上方「升级 Pro」购买。';
          return;
        }
        settings.theme = theme;
        document.querySelectorAll('.popup-theme-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === theme);
        });
        saveSettings(settings);
        sendMessageToActiveTab({ type: 'settingsUpdated', settings });
      });
    });

    // Initial status fetch (async, non-blocking)
    refreshLicenseStatus();
  });
})();
