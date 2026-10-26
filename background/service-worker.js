/* ============================================================================
 * Markdown Reader — Service Worker
 * Background script for message routing, side panel, and CORS-safe fetches
 * ========================================================================== */

// The action has a default_popup, so Chrome must NOT open the side panel on
// action click (MR-024). Explicitly disable it as well — an upgrade may have
// persisted the old `true` behaviour.
try {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false })?.catch?.(() => {});
} catch (_) {}

// Only these URL schemes may be opened/fetched on behalf of a content script.
function isAllowedUrl(url, schemes) {
  try {
    const u = new URL(String(url || ''));
    return schemes.some(s => u.protocol === s);
  } catch (_) { return false; }
}

// Reader tabs currently known to the extension (tabId → {url, filename, ts}).
// Used by the side panel to find the tree without the "tabs" permission.
const readerTabs = new Map();
let lastReaderTabId = null;

chrome.tabs.onRemoved.addListener(tabId => {
  readerTabs.delete(tabId);
  if (lastReaderTabId === tabId) lastReaderTabId = null;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (readerTabs.has(tabId)) lastReaderTabId = tabId;
});

// Local LLM endpoints (Ollama, LM Studio, llama.cpp …) reject requests whose
// Origin is `chrome-extension://…` with HTTP 403. We strip the Origin header
// from THIS extension's requests to localhost so the server falls back to
// Host-based trust (localhost is allowed) — same as curl. Registered as a
// session rule at SW startup; no-ops where the API is unavailable (tests).
function setupLocalLLMHeaderRules() {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr || typeof dnr.updateSessionRules !== 'function') return;
  if (!chrome.runtime || !chrome.runtime.id) return;
  const extId = chrome.runtime.id;
  dnr.updateSessionRules({
    removeRuleIds: [1001],
    addRules: [{
      id: 1001,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Origin', operation: 'remove' }],
      },
      condition: {
        requestDomains: ['localhost', '127.0.0.1', '0.0.0.0'],
        initiatorDomains: [extId],
        resourceTypes: ['xmlhttprequest', 'other'],
      },
    }],
  }).catch(() => {});
}
setupLocalLLMHeaderRules();

// Tracks the reading tab that opened the standalone AI config page, so the
// "完成，返回阅读" button can return focus to it.
let aiConfigSourceTabId = null;
let aiConfigTabId = null;

// Listen for messages from content script / popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    // Content script needs to fetch a raw markdown URL (avoids CORS)
    case 'fetchRaw':
      if (!msg.url || !isAllowedUrl(msg.url, ['http:', 'https:'])) {
        sendResponse({ success: false, error: 'Invalid URL' });
        return;
      }

      fetch(msg.url, { mode: 'cors' })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
        .then(text => {
          sendResponse({ success: true, text });
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message });
        });

      return true; // Keep channel open for async response

    // Enumerate local directory (file://) — open a hidden tab and read its
    // directory listing. Responds asynchronously with `{success, files}`.
    case 'enumerateDirectory': {
      if (!msg.url || !isAllowedUrl(msg.url, ['file:'])) {
        sendResponse({ success: false, error: 'Invalid folder URL', files: [] });
        return false;
      }
      const dirUrl = String(msg.url).replace(/\/+$/, '') + '/';
      let settled = false;
      let timer = null;
      let onUpdated = null;
      const finish = (files, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (onUpdated) { try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch (_) {} }
        try { chrome.tabs.remove(newTab.id); } catch (_) {}
        sendResponse({ success: !error, files: files || [], error: error || null });
      };
      const newTab = chrome.tabs.create({ url: dirUrl, active: false }, tab => {
        if (!tab || tab.id == null) { finish(null, 'Could not open the folder'); return; }
        onUpdated = (tabId, changeInfo) => {
          if (tabId !== tab.id || changeInfo.status !== 'complete') return;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          onUpdated = null;
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const anchors = document.querySelectorAll('a');
              const seen = new Set();
              const items = [];
              anchors.forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;
                const raw = href.replace(/\/+$/, '').split('/').pop();
                if (!raw || raw === '..' || raw === '.') return;
                if (seen.has(raw)) return;
                seen.add(raw);
                items.push({
                  name: decodeURIComponent(raw),
                  path: decodeURIComponent(href),
                  type: href.endsWith('/') ? 'dir' : 'file',
                });
              });
              return items;
            },
          }).then(results => finish(results && results[0] ? results[0].result : [], null))
            .catch(err => finish(null, String(err && err.message ? err.message : err)));
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        timer = setTimeout(() => finish(null, 'Timed out listing the folder'), 6000);
      });
      return true; // async response
    }

    // Content script requests file tree data
    case 'requestFileTree':
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'requestFileTree' })
            .then(sendResponse)
            .catch(() => sendResponse({ data: [] }));
        } else {
          sendResponse({ data: [] });
        }
      });
      return true; // async

    // Content script has file tree data
    case 'fileTree':
      chrome.runtime.sendMessage(msg).catch(() => {});
      break;

    // Navigate to a different file
    case 'navigateToFile':
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
        }
      });
      break;

    // Settings updated from popup — broadcast to all tabs
    case 'settingsUpdated':
      chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
        });
      });
      break;

    // Open Chrome side panel (reader toolbar / popup "Browse files").
    // `sidePanel.open` needs a user gesture; the click that sent this message
    // preserves it in current Chrome. Failures are reported, never silent.
    case 'openSidePanel': {
      const tabId = (sender.tab && sender.tab.id) || msg.tabId;
      if (!tabId) { sendResponse({ success: false, error: 'No tab id' }); return false; }
      chrome.sidePanel.open({ tabId })
        .then(() => sendResponse({ success: true }))
        .catch(err => {
          // Content-script messages may lose the user gesture. Fall back to
          // opening the same file browser as a tab rather than failing silently.
          chrome.tabs.create({ url: chrome.runtime.getURL('sidebar/sidebar.html') })
            .then(t => sendResponse({ success: true, fallbackTab: t && t.id, error: String(err && err.message ? err.message : err) }))
            .catch(() => sendResponse({ success: false, error: String(err && err.message ? err.message : err) }));
        });
      return true;
    }

    // Open a URL in a new tab (external-link action).
    case 'openTab':
      if (isAllowedUrl(msg.url, ['http:', 'https:', 'file:', 'view-source:'])) {
        chrome.tabs.create({ url: msg.url })?.catch?.(() => {});
      }
      break;

    // Re-read a local file from disk (auto-refresh fallback).
    case 'readFile':
      if (!msg.url || !isAllowedUrl(msg.url, ['file:'])) { sendResponse({ success: false, error: 'Invalid file URL' }); return false; }
      fetch(msg.url, { cache: 'no-store' })
        .then(r => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
        .then(text => sendResponse({ success: true, text }))
        .catch(err => sendResponse({ success: false, error: String(err && err.message ? err.message : err) }));
      return true;

    // Content announces a mounted reader; the side panel uses this registry.
    case 'readerReady':
      if (sender.tab && sender.tab.id) {
        readerTabs.set(sender.tab.id, {
          url: msg.url || (sender.tab.url || ''),
          filename: msg.filename || '',
          ts: Date.now(),
        });
        lastReaderTabId = sender.tab.id;
        // Let an open side panel refresh its current-file marker.
        chrome.runtime.sendMessage({ type: 'readerChanged', tabId: sender.tab.id }).catch(() => {});
      }
      sendResponse({ ok: true });
      break;

    // Side panel: ask the most recently active reader tab for its file tree.
    case 'getActiveReaderTree': {
      const pick = () => {
        if (lastReaderTabId != null && readerTabs.has(lastReaderTabId)) return lastReaderTabId;
        let best = null;
        let bestTs = -1;
        readerTabs.forEach((v, k) => { if (v.ts > bestTs) { bestTs = v.ts; best = k; } });
        return best;
      };
      const reply = (tabId, resp) => sendResponse(Object.assign({ success: true, tabId }, resp || {}));

      // Fast path: the tab we remembered. If the SW was restarted, the map is
      // empty, so fall back to probing every tab (messaging needs no host
      // permission — content scripts answer only on reader pages).
      const tryTab = async (tabId) => {
        try {
          const resp = await chrome.tabs.sendMessage(tabId, { type: 'requestFileTree' });
          if (resp && resp.readerActive !== false && Array.isArray(resp.data) && resp.data.length) {
            reply(tabId, resp); return true;
          }
        } catch (_) {}
        return false;
      };
      (async () => {
        const remembered = pick();
        if (remembered != null && await tryTab(remembered)) return;
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id == null || tab.id === remembered) continue;
          if (await tryTab(tab.id)) return;
        }
        sendResponse({ success: false, data: [], reason: 'no-reader' });
      })();
      return true;
    }

    // Is an AI API key configured? The SW is the single source of truth — the
    // key lives only in storage.local, so we never hand the value to content;
    // we just answer with a boolean.
    case 'aiCheckConfig':
      chrome.storage.local.get('mdReaderApiKey', data => {
        sendResponse({ configured: !!(data && data.mdReaderApiKey) });
      });
      return true; // keep channel open for async response

    // Open the AI config page (popup.html as a real extension tab, where a user
    // gesture can drive chrome.permissions.request). Content scripts can't.
    case 'openAIConfig':
      if (sender.tab && sender.tab.id) aiConfigSourceTabId = sender.tab.id;
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?standalone=1') }, t => {
        if (t && t.id) aiConfigTabId = t.id;
      });
      break;

    // "完成，返回阅读" — close the config tab and focus the reading tab that
    // opened it (closing alone only activates an adjacent tab, not necessarily
    // the reading page).
    case 'aiConfigDone':
      if (aiConfigTabId != null) {
        const closeId = aiConfigTabId;
        aiConfigTabId = null;
        chrome.tabs.remove(closeId).catch(() => {});
      }
      if (aiConfigSourceTabId != null) {
        const srcId = aiConfigSourceTabId;
        aiConfigSourceTabId = null;
        chrome.tabs.update(srcId, { active: true }).then(() => {
          chrome.tabs.get(srcId, t => {
            if (t && t.windowId != null) chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
          });
        }).catch(() => {});
      }
      break;

  }
});

/* ============================================================================
 * AI Assistant — streaming LLM proxy over a long-lived Port.
 *
 * Content script / popup open a Port named 'md-reader-llm' and postMessage:
 *   { provider: 'openai' | 'anthropic', baseUrl, model, messages, temperature?, max_tokens? }
 * The service worker reads the API key from chrome.storage.local (NEVER passed
 * in the message), performs the fetch (host_permissions bypass CORS), and posts
 * back: { type:'chunk', text } | { type:'done' } | { type:'error', error }.
 *
 * Supported protocols:
 *   - openai    → POST {base}/chat/completions  (Bearer auth, SSE delta.content)
 *   - anthropic → POST {base}/v1/messages        (x-api-key, SSE content_block_delta)
 * ========================================================================== */

const AI_DEFAULTS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
};

// Resolve an OpenAI-compatible chat-completions endpoint from a (possibly empty) base URL.
function openaiEndpoint(baseUrl) {
  let base = (baseUrl || '').trim() || AI_DEFAULTS.openai;
  base = base.replace(/\/+$/, '');
  // If only an origin was given (no path), assume /v1.
  const pathPart = base.replace(/^https?:\/\/[^/]+/i, '');
  if (!pathPart) base += '/v1';
  return base + '/chat/completions';
}

// Resolve an Anthropic messages endpoint from a (possibly empty) base URL.
function anthropicEndpoint(baseUrl) {
  let base = (baseUrl || '').trim() || AI_DEFAULTS.anthropic;
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/v1$/, ''); // tolerate a trailing /v1
  return base + '/v1/messages';
}

// Split OpenAI-style messages into { system, turns } for the Anthropic format.
function splitAnthropicMessages(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') || undefined;
  const turns = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  return { system, turns };
}

async function safeText(resp) {
  try { return await resp.text(); } catch (_) { return ''; }
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// Is the configured endpoint a loopback address? Used to tailor error advice.
function isLocalEndpoint(baseUrl) {
  try {
    const h = new URL((baseUrl || '').trim()).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]';
  } catch (_) { return false; }
}

// Extract a text delta from a single SSE data payload for each provider.
function extractDelta(provider, payload) {
  if (payload === '[DONE]') return null; // sentinel
  let json;
  try { json = JSON.parse(payload); } catch (_) { return ''; }

  if (provider === 'anthropic') {
    if (json.type === 'content_block_delta' && json.delta && typeof json.delta.text === 'string') {
      return json.delta.text;
    }
    if (json.type === 'message_stop') return null;
    return '';
  }

  // OpenAI-compatible
  const delta = json.choices && json.choices[0] && json.choices[0].delta;
  return (delta && typeof delta.content === 'string') ? delta.content : '';
}

async function streamLLM(port, msg, signal) {
  const provider = msg.provider === 'anthropic' ? 'anthropic' : 'openai';
  const messages = Array.isArray(msg.messages) ? msg.messages : [];

  // Key lives only in local storage; never trust the message for it.
  let apiKey = '';
  try {
    const data = await chrome.storage.local.get('mdReaderApiKey');
    apiKey = (data && data.mdReaderApiKey) || '';
  } catch (_) {}
  if (!apiKey) {
    port.postMessage({ type: 'error', error: '未配置 API Key，请在扩展弹窗「AI 助手」中填写。' });
    return;
  }

  let url, init;
  if (provider === 'anthropic') {
    const { system, turns } = splitAnthropicMessages(messages);
    url = anthropicEndpoint(msg.baseUrl);
    init = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: msg.model,
        max_tokens: msg.max_tokens || 2048,
        stream: true,
        system,
        messages: turns,
      }),
    };
  } else {
    url = openaiEndpoint(msg.baseUrl);
    init = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: msg.model,
        stream: true,
        temperature: typeof msg.temperature === 'number' ? msg.temperature : 0.3,
        messages,
      }),
    };
  }

  let resp;
  try {
    resp = await fetch(url, Object.assign({}, init, { signal }));
  } catch (err) {
    port.postMessage({ type: 'error', error: '网络请求失败：' + (err && err.message ? err.message : err) + '（请检查 Base URL 与 host 权限）' });
    return;
  }

  if (!resp.ok) {
    const errText = await safeText(resp);
    let errMsg = 'HTTP ' + resp.status + '：' + truncate(errText, 400);
    // Local 403 is almost always the server rejecting the extension's origin
    // (Ollama does this by default). The DNR rule above usually fixes it; if it
    // didn't, point the user at the OLLAMA_ORIGINS workaround.
    if (resp.status === 403 && isLocalEndpoint(msg.baseUrl)) {
      errMsg += '\n\n本地服务拒绝了请求（403）。若用的是 Ollama：它默认不接受浏览器扩展来源。本扩展已尝试自动去掉 Origin 头；若仍失败，启动 Ollama 时加：OLLAMA_ORIGINS="chrome-extension://*"';
    }
    port.postMessage({ type: 'error', error: errMsg });
    return;
  }

  const post = m => { try { port.postMessage(m); } catch (_) {} };
  const contentType = resp.headers.get('content-type') || '';

  // Non-streaming JSON fallback (some proxies ignore stream:true and return JSON).
  if (!contentType.includes('event-stream')) {
    return finishJson(resp, provider, post);
  }

  // SSE streaming.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    if (signal && signal.aborted) { try { await reader.cancel(); } catch (_) {} return; }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the last (possibly partial) line
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      const delta = extractDelta(provider, payload);
      if (delta === null) { post({ type: 'done' }); return; } // [DONE] / message_stop
      if (delta) post({ type: 'chunk', text: delta });
    }
  }
  post({ type: 'done' });
}

async function finishJson(resp, provider, post) {
  try {
    const json = await resp.json();
    let text = '';
    if (provider === 'anthropic') {
      text = (Array.isArray(json.content) ? json.content.map(c => c.text || '').join('') : '') || '';
    } else {
      text = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
    }
    if (text) post({ type: 'chunk', text });
    post({ type: 'done' });
  } catch (err) {
    post({ type: 'error', error: '解析响应失败：' + (err && err.message ? err.message : err) });
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'md-reader-llm') return;
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener(msg => {
    if (!msg || msg.type !== 'aiComplete') return;
    streamLLM(port, msg, controller.signal).catch(err => {
      try { port.postMessage({ type: 'error', error: 'LLM 调用异常：' + (err && err.message ? err.message : err) }); } catch (_) {}
    });
  });
});


