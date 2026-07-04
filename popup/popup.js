/**
 * DualSub - Popup Script
 * Quản lý giao diện popup và giao tiếp với content script
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  let currentStatus = null;
  let settings = {};

  async function sendMessage(type, payload = {}) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function updateStatus(isReady, enabled, primaryCount, secondaryCount) {
    const dot = $('#statusDot');
    const text = $('#statusText');
    if (!enabled) {
      dot.className = 'status-dot';
      text.textContent = 'Đã tắt';
      return;
    }
    if (isReady) {
      dot.className = 'status-dot active';
      text.textContent = `Sẵn sàng • ${primaryCount + secondaryCount} phụ đề`;
    } else {
      dot.className = 'status-dot loading';
      text.textContent = 'Đang tải phụ đề...';
    }
  }

  function updateInfo(primaryCount, secondaryCount, isReady) {
    $('#primaryCount').textContent = primaryCount || 0;
    $('#secondaryCount').textContent = secondaryCount || 0;
    $('#readyState').textContent = isReady ? 'Sẵn sàng' : 'Đang tải...';
  }

  function updateAvailableTracks(tracks) {
    if (!tracks || tracks.length === 0) return;
    const primarySelect = $('#primaryLang');
    const secondarySelect = $('#secondaryLang');
    for (const track of tracks) {
      const code = track.languageCode;
      let exists = false;
      for (const opt of primarySelect.options) {
        if (opt.value === code) { exists = true; break; }
      }
      if (!exists) {
        const name = track.name || code;
        const opt1 = document.createElement('option');
        opt1.value = code;
        opt1.textContent = `${name} (${code})`;
        primarySelect.appendChild(opt1);
        const opt2 = document.createElement('option');
        opt2.value = code;
        opt2.textContent = `${name} (${code})`;
        secondarySelect.appendChild(opt2);
      }
    }
  }

  function setupEventListeners() {
    $('#toggleEnabled').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        await sendMessage('setEnabled', { enabled });
        if (currentStatus) {
          currentStatus.enabled = enabled;
          updateStatus(currentStatus.isReady, enabled, currentStatus.primaryCount, currentStatus.secondaryCount);
        }
      } catch (err) { console.error('[DualSub Popup]', err); }
    });

    $('#primaryLang').addEventListener('change', applyLanguagePair);
    $('#secondaryLang').addEventListener('change', applyLanguagePair);

    $('#positionSelect').addEventListener('change', async (e) => {
      try { await sendMessage('setPosition', { position: e.target.value }); }
      catch (err) { console.error(err); }
    });

    $('#fontSizeRange').addEventListener('input', async (e) => {
      const size = parseInt(e.target.value);
      $('#fontSizeLabel').textContent = size;
      try { await sendMessage('setFontSize', { fontSize: size }); }
      catch (err) { console.error(err); }
    });

    $('#btnReload').addEventListener('click', async () => {
      const btn = $('#btnReload');
      btn.textContent = 'Đang tải...';
      btn.disabled = true;
      try {
        await sendMessage('reloadSubtitles');
        await refreshStatus();
      } catch (err) { console.error(err); }
      finally {
        btn.textContent = 'Tải lại phụ đề';
        btn.disabled = false;
      }
    });

    $('#helpLink').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/sanng1112/youtube-dual-subtitle' });
    });
  }

  async function applyLanguagePair() {
    const primaryLang = $('#primaryLang').value;
    const secondaryLang = $('#secondaryLang').value;
    const primaryLabel = $('#primaryLang option:checked').textContent;
    const secondaryLabel = $('#secondaryLang option:checked').textContent;
    try {
      await sendMessage('setLanguagePair', { primaryLang, secondaryLang, primaryLabel, secondaryLabel });
      chrome.storage.sync.set({ dualsubLangPair: { primaryLang, secondaryLang } });
      await refreshStatus();
    } catch (err) { console.error(err); }
  }

  async function refreshStatus() {
    try {
      currentStatus = await sendMessage('getStatus');
      if (!currentStatus) return;
      const { isReady, enabled, primaryCount, secondaryCount, primaryLang, secondaryLang, availableTracks, settings: extSettings } = currentStatus;
      settings = extSettings || {};
      updateStatus(isReady, enabled, primaryCount, secondaryCount);
      updateInfo(primaryCount, secondaryCount, isReady);
      updateAvailableTracks(availableTracks);
      $('#toggleEnabled').checked = enabled;
      if (primaryLang) $('#primaryLang').value = primaryLang;
      if (secondaryLang) $('#secondaryLang').value = secondaryLang;
      if (settings.position) $('#positionSelect').value = settings.position;
      if (settings.fontSize) {
        $('#fontSizeRange').value = settings.fontSize;
        $('#fontSizeLabel').textContent = settings.fontSize;
      }
    } catch (err) {
      console.warn('[DualSub Popup] Status refresh failed:', err.message);
      $('#statusDot').className = 'status-dot';
      $('#statusText').textContent = '\u26A0\uFE0F Không thể kết nối - Tải lại trang YouTube';
    }
  }

  async function init() {
    setupEventListeners();
    await refreshStatus();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

