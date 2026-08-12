/* ============================================================================
 * Markdown Reader — Service Worker
 * Background script for message routing, side panel, and CORS-safe fetches
 * ========================================================================== */

// Open side panel when action icon is clicked (Chrome 114+)
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

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
      if (!msg.url) {
        sendResponse({ success: false, error: 'No URL provided' });
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

    // Enumerate local directory (file://) — open hidden tab to read the listing
    case 'enumerateDirectory':
      if (!msg.url) {
        sendResponse({ success: false, error: 'No URL provided' });
        return;
      }
      // We'll send results back via a separate message to the calling tab
      const callerTabId = sender.tab?.id;
      chrome.tabs.create({ url: msg.url + '/', active: false }, newTab => {
        const onUpdated = (tabId, changeInfo) => {
          if (tabId !== newTab.id || changeInfo.status !== 'complete') return;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            func: () => {
              const anchors = document.querySelectorAll('a');
              const seen = new Set();
              const items = [];
              anchors.forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;
                // Extract just the filename, handle full or relative paths
                const raw = href.replace(/\/+$/, '').split('/').pop();
                if (!raw || raw === '..' || raw === '.' || seen.has(raw)) return;
                seen.add(raw);
                items.push({
                  name: decodeURIComponent(raw),
                  path: decodeURIComponent(href),
                  type: href.endsWith('/') ? 'dir' : 'file',
                });
              });
              return items;
            },
          }).then(results => {
            const files = results?.[0]?.result || [];
            // Send results back to the content script that requested it
            if (callerTabId) {
              chrome.tabs.sendMessage(callerTabId, { type: 'directoryList', files }).catch(() => {});
            }
            chrome.tabs.remove(newTab.id);
          }).catch(() => {
            chrome.tabs.remove(newTab.id);
          });
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
      sendResponse({ success: true, pending: true });
      return false;

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

    // Open Chrome side panel (for content script "Browse other files" hint)
    case 'openSidePanel':
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
        }
      });
      break;

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

async function streamLLM(port, msg) {
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
    resp = await fetch(url, init);
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
  port.onMessage.addListener(msg => {
    if (!msg || msg.type !== 'aiComplete') return;
    streamLLM(port, msg).catch(err => {
      try { port.postMessage({ type: 'error', error: 'LLM 调用异常：' + (err && err.message ? err.message : err) }); } catch (_) {}
    });
  });
});


