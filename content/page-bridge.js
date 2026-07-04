/**
 * DualSub - Page Bridge (runs in page's main world via <script src="chrome-extension://...">)
 * This file has access to page-level JavaScript variables (ytInitialPlayerResponse)
 * Communicates data back to content script via DOM events
 */
(function () {
  'use strict';

  function captureData() {
    try {
      // Try to get ytInitialPlayerResponse from page context
      var data = (typeof ytInitialPlayerResponse !== 'undefined') ? ytInitialPlayerResponse : null;
      if (!data) data = (typeof window.ytInitialPlayerResponse !== 'undefined') ? window.ytInitialPlayerResponse : null;
      if (!data) return;

      // Find our receiver element
      var receivers = document.querySelectorAll('[id^="_dualsub_pr_"]');
      for (var i = 0; i < receivers.length; i++) {
        var el = receivers[i];
        if (el && el.id) {
          el.textContent = JSON.stringify({
            type: 'playerResponse',
            data: data
          });
          el.dispatchEvent(new CustomEvent('dualsub_data'));
        }
      }
    } catch (e) {
      // Fail silently - content script will timeout
    }
  }

  // Run immediately
  captureData();

  // Also run on DOM changes (for SPA navigations)
  var observer = new MutationObserver(function () {
    // Simple debounce: only run if the page URL changed
    if (window.__dualsub_lastUrl !== window.location.href) {
      window.__dualsub_lastUrl = window.location.href;
      setTimeout(captureData, 500);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
