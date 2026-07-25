/* ============================================================================
 * Markdown Reader — Service Worker
 * Background script for message routing, side panel, and CORS-safe fetches
 * ========================================================================== */

// Open side panel when action icon is clicked (Chrome 114+)
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

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
  }
});
