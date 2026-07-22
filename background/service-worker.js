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
  }
});
