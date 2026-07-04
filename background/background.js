/**
 * DualSub - Background Service Worker
 * Xử lý sự kiện extension và quản lý cài đặt
 */
chrome.runtime.onInstalled.addListener((details) => {
  // Khởi tạo cài đặt mặc định khi cài đặt lần đầu
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      dualsubSettings: {
        enabled: true,
        primaryLang: 'en',
        secondaryLang: 'vi',
        primaryLabel: 'English',
        secondaryLabel: 'Tiếng Việt',
        fontSize: 16,
        position: 'bottom',
        primaryColor: '#ffffff',
        secondaryColor: '#00e5ff',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        showSpeakerLabel: true,
      },
      dualsubLangPair: {
        primaryLang: 'en',
        secondaryLang: 'vi',
      },
    });

    // Mở trang chào mừng
    chrome.tabs.create({
      url: 'https://github.com/sanng1112/youtube-dual-subtitle',
    });
  }
});

// Lắng nghe message từ popup hoặc content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'openOptions':
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      break;
    case 'getStorage':
      chrome.storage.sync.get(request.keys, (result) => {
        sendResponse(result);
      });
      return true;
    case 'setStorage':
      chrome.storage.sync.set(request.data, () => {
        sendResponse({ success: true });
      });
      return true;

    // PROXY FETCH - bypass CORS/CSP by using background service worker
    case 'proxyFetch':
      (async () => {
        try {
          const resp = await fetch(request.url, {
            credentials: request.includeCredentials ? 'include' : 'omit',
            headers: request.headers || {},
          });
          const text = await resp.text();
          sendResponse({ ok: resp.ok, status: resp.status, text: text });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true; // Keep channel open for async

    default:
      break;
  }
  return false;
});

// Logging
console.log('[DualSub] Background service worker started');
