/**
 * DualSub - YouTube Dual Subtitle Extension
 * Content Script: Phát hiện video YouTube, lấy phụ đề song ngữ và hiển thị overlay
 */

(function () {
  'use strict';

  // ============================================================
  // STATE (exposed to DS for other modules)
  // ============================================================
  const STATE = {
    video: null,
    playerContainer: null,
    overlay: null,
    primarySubtitles: [],
    secondarySubtitles: [],
    activeCues: { primary: null, secondary: null },
    settings: {
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
      // NEW FEATURES
      timingOffset: 0,        // Feature 3: ± seconds adjust
      highlightEnabled: false, // Feature 4: word highlighting
      highlightLevel: 'advanced',
      transcriptVisible: false,// Feature 6: transcript panel
    },
    availableTracks: [],
    isReady: false,
    animationId: null,
    lastTime: -1,
    isFetching: false,
    retryCount: 0,
    lastVideoId: null,
    resizeObserver: null,
    scrollObserver: null,
    scrollListener: null,
    _retryTimers: [],
  };

  // Expose STATE to DS modules
  window.__DualSub._STATE = STATE;

  // ============================================================
  // UTILITY
  // ============================================================
  const Util = {
    parseTime(timeStr) {
      if (!timeStr) return 0;
      const parts = timeStr.trim().split(':');
      let seconds = 0;
      if (parts.length === 3) {
        seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      } else {
        seconds = parseFloat(parts[0]);
      }
      return isNaN(seconds) ? 0 : seconds;
    },

    formatTime(sec) {
      if (!sec && sec !== 0) return '0:00';
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `${m}:${String(s).padStart(2, '0')}`;
    },

    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    debounce(fn, delay = 300) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    },

    deepMerge(target, source) {
      const result = { ...target };
      for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = Util.deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    },

    async retry(fn, maxRetries = 3, delay = 1000) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (err) {
          if (i === maxRetries - 1) throw err;
          await new Promise((r) => setTimeout(r, delay * (i + 1)));
        }
      }
    },
  };



  // ============================================================
  // SUBTITLE PARSER
  // ============================================================
  const SubtitleParser = {
    parseXML(xmlText) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const cues = [];

      // Transcript format: <text start="0.0" dur="5.0">content</text>
      const textElements = doc.querySelectorAll('text');
      if (textElements.length > 0) {
        textElements.forEach((el) => {
          const start = parseFloat(el.getAttribute('start'));
          const dur = parseFloat(el.getAttribute('dur')) || 2.0;
          const end = start + dur;
          const text = (el.textContent || '').trim();
          if (text && !isNaN(start)) cues.push({ start, end, text });
        });
        return cues;
      }

      // TTML format: <p begin="..." end="...">content</p>
      const pElements = doc.querySelectorAll('p');
      if (pElements.length > 0) {
        pElements.forEach((el) => {
          const begin = Util.parseTime(el.getAttribute('begin'));
          const end = Util.parseTime(el.getAttribute('end'));
          let text = Array.from(el.childNodes)
            .map((n) => n.nodeType === Node.TEXT_NODE ? n.textContent : n.textContent || '')
            .join('').trim();
          if (text && !isNaN(begin) && !isNaN(end) && end > begin) {
            text = text.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
            cues.push({ start: begin, end, text });
          }
        });
        return cues;
      }

      // SRT/VTT plain text
      const lines = xmlText.split('\n');
      let i = 0;
      while (i < lines.length) {
        const line = lines[i].trim();
        const m = line.match(/(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/);
        if (m) {
          const start = Util.parseTime(m[1]);
          const end = Util.parseTime(m[2]);
          i++;
          let text = '';
          while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
            if (text) text += '\n';
            text += lines[i].trim();
            i++;
          }
          if (text && !isNaN(start) && !isNaN(end)) cues.push({ start, end, text });
          continue;
        }
        i++;
      }
      return cues;
    },

    parseJSON(jsonText) {
      try {
        const data = JSON.parse(jsonText);
        if (Array.isArray(data)) {
          return data.filter((it) => it.text && it.start !== undefined).map((it) => ({
            start: +it.start, end: it.end ? +it.end : +it.start + (+it.duration || 2), text: it.text.trim()
          }));
        }
        if (data.transcript && Array.isArray(data.transcript)) {
          return data.transcript.filter((it) => it.text).map((it) => ({
            start: parseFloat(it.start || it.begin || 0),
            end: parseFloat(it.end || it.duration || 2) + parseFloat(it.start || 0),
            text: it.text.trim(),
          }));
        }
      } catch (e) { /* ignore */ }
      return [];
    },

    parse(text) {
      if (!text || !text.trim()) return [];
      if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
        const jr = this.parseJSON(text);
        if (jr.length) return jr;
      }
      if (text.includes('<text') || text.includes('<p ') || text.includes('<tt ')) {
        const xr = this.parseXML(text);
        if (xr.length) return xr;
      }
      return this.parseXML(text);
    },
  };


  // ============================================================
  // YOUTUBE CAPTION EXTRACTOR
  // ============================================================
  /**
   * Caption fetcher via background service worker (no CSP/CORS issues)
   */
  // ============================================================
  // SETTINGS MANAGEMENT
  // ============================================================
  const SettingsManager = {
    async load() {
      return new Promise(function(resolve) {
        chrome.storage.sync.get('dualsubSettings', function(result) {
          if (result.dualsubSettings) {
            STATE.settings = Object.assign({}, STATE.settings, result.dualsubSettings);
          }
          resolve(STATE.settings);
        });
      });
    },
    async save(settings) {
      Object.assign(STATE.settings, settings);
      return new Promise(function(resolve) {
        chrome.storage.sync.set({ dualsubSettings: STATE.settings }, resolve);
      });
    },
    async setLanguagePair(primaryLang, secondaryLang, primaryLabel, secondaryLabel) {
      STATE.settings.primaryLang = primaryLang;
      STATE.settings.secondaryLang = secondaryLang;
      STATE.settings.primaryLabel = primaryLabel || primaryLang;
      STATE.settings.secondaryLabel = secondaryLabel || secondaryLang;
      await this.save({});
      await CaptionManager.init();
    },
  };

  // ============================================================
  // CAPTION FETCHER
  // ============================================================
  const CaptionFetcher = {
    getVideoId() {
      try { return new URL(window.location.href).searchParams.get('v') || ''; }
      catch (e) { return ''; }
    },

    _bgMessage(msg) {
      return new Promise(function(resolve) {
        chrome.runtime.sendMessage(msg, function(response) {
          resolve(response || { error: 'No response' });
        });
      });
    },

    async fetchForLanguage(langCode) {
      var videoId = this.getVideoId();
      if (!videoId) return [];
      var result = await this._bgMessage({
        type: 'fetchCaptions',
        videoId: videoId,
        langCode: langCode,
      });
      if (result && result.cues && result.cues.length > 0) {
        console.log('[DualSub] Got ' + result.cues.length + ' cues for ' + langCode);
        return result.cues;
      }
      console.warn('[DualSub] No captions for ' + langCode + ': ' + (result && result.error ? result.error : 'unknown'));
      return [];
    },
  };

  // ============================================================
  // CAPTION FETCHING
  // ============================================================
  const CaptionManager = {
    hasVideoChanged() {
      var videoId = CaptionFetcher.getVideoId();
      if (videoId !== STATE.lastVideoId) {
        STATE.lastVideoId = videoId;
        STATE.primarySubtitles = [];
        STATE.secondarySubtitles = [];
        STATE.isReady = false;
        return true;
      }
      return false;
    },

    async init() {
      if (this.hasVideoChanged() || !STATE.isReady) {
        STATE.isFetching = true;
        var currentVideoId = CaptionFetcher.getVideoId();

        try {
          var results = await Promise.all([
            CaptionFetcher.fetchForLanguage(STATE.settings.primaryLang),
            CaptionFetcher.fetchForLanguage(STATE.settings.secondaryLang),
          ]);

          if (CaptionFetcher.getVideoId() !== currentVideoId) {
            console.log('[DualSub] Video changed, discarding');
            return;
          }

          STATE.primarySubtitles = results[0] || [];
          STATE.secondarySubtitles = results[1] || [];
          STATE.primarySubtitles.sort(function(a, b) { return a.start - b.start; });
          STATE.secondarySubtitles.sort(function(a, b) { return a.start - b.start; });

          console.log('[DualSub] Primary: ' + STATE.primarySubtitles.length + ', Secondary: ' + STATE.secondarySubtitles.length);
          STATE.isReady = true;
          STATE.retryCount = 0;

          chrome.runtime.sendMessage({
            type: 'subtitlesLoaded',
            payload: {
              primaryCount: STATE.primarySubtitles.length,
              secondaryCount: STATE.secondarySubtitles.length,
              primaryLang: STATE.settings.primaryLang,
              secondaryLang: STATE.settings.secondaryLang,
            },
          });
        } catch (err) {
          console.error('[DualSub] Error:', err);
          if (STATE.retryCount < 3) {
            STATE.retryCount++;
            STATE._retryTimers.push(setTimeout(function() { CaptionManager.init(); }, 2000 * STATE.retryCount));
          }
        } finally {
          STATE.isFetching = false;
        }
        return STATE.isReady;
      }
      return STATE.isReady;
    },
  };


  // ============================================================
  // MESSAGE HANDLER
  // ============================================================
  // ============================================================
  // DUAL SUBTITLE UI
  // ============================================================
  const DualSubUI = {
    getOverlay() {
      if (STATE.overlay && document.body.contains(STATE.overlay)) return STATE.overlay;
      var overlay = document.createElement('div');
      overlay.id = 'dualsub-overlay';
      overlay.className = 'dualsub-overlay';
      overlay.innerHTML = [
        '<div class="dualsub-container">',
        '  <div class="dualsub-primary dualsub-cue"></div>',
        '  <div class="dualsub-secondary dualsub-cue"></div>',
        '</div>',
        '<div class="dualsub-status">',
        '  <span class="dualsub-status-text">DualSub</span>',
        '</div>',
      ].join('');
      document.body.appendChild(overlay);
      STATE.overlay = overlay;
      return overlay;
    },

    positionOverlay() {
      var overlay = STATE.overlay, video = STATE.video;
      if (!overlay || !video) return;
      var rect = video.getBoundingClientRect();
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.top = rect.top + 'px';
      if (STATE.settings.position === 'top') {
        overlay.style.justifyContent = 'flex-start';
        overlay.style.paddingTop = '60px';
      } else {
        overlay.style.justifyContent = 'flex-end';
        overlay.style.paddingBottom = '60px';
      }
    },

    applySettings() {
      var overlay = STATE.overlay;
      if (!overlay) return;
      var p = overlay.querySelector('.dualsub-primary');
      var s = overlay.querySelector('.dualsub-secondary');
      if (p) p.style.fontSize = STATE.settings.fontSize + 'px';
      if (s) s.style.fontSize = Math.max(12, STATE.settings.fontSize - 2) + 'px';
      this.positionOverlay();
    },

    findCueAtTime(cues, time) {
      if (!cues || !cues.length) return null;
      var t = time + STATE.settings.timingOffset;
      var lo = 0, hi = cues.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >>> 1;
        var cue = cues[mid];
        if (t >= cue.start && t < cue.end) return cue;
        if (t < cue.start) hi = mid - 1;
        else lo = mid + 1;
      }
      return null;
    },

    findNearestCue(cues, time, windowSize) {
      if (!cues || !cues.length) return null;
      if (windowSize === undefined) windowSize = 2.0;
      var best = null, bestDist = Infinity;
      for (var i = 0; i < cues.length; i++) {
        var dist = Math.abs(time - cues[i].start);
        if (dist < windowSize && dist < bestDist) { bestDist = dist; best = cues[i]; }
      }
      return best;
    },

    updateDisplay() {
      var video = STATE.video;
      if (!video || !STATE.settings.enabled) { this.hide(); return; }
      var t = video.currentTime;
      if (Math.abs(t - STATE.lastTime) < 0.05) return;
      STATE.lastTime = t;

      var p = this.findCueAtTime(STATE.primarySubtitles, t);
      var s = this.findCueAtTime(STATE.secondarySubtitles, t);
      if (p && !s) s = this.findNearestCue(STATE.secondarySubtitles, t, 2.0);
      if (s && !p) p = this.findNearestCue(STATE.primarySubtitles, t, 2.0);
      this.render(p, s);
    },

    render(primary, secondary) {
      var overlay = STATE.overlay;
      if (!overlay) return;
      var pEl = overlay.querySelector('.dualsub-primary');
      var sEl = overlay.querySelector('.dualsub-secondary');
      if (!STATE.settings.enabled || (!primary && !secondary)) {
        pEl.textContent = ''; sEl.textContent = '';
        overlay.classList.remove('dualsub-active');
        return;
      }
      overlay.classList.add('dualsub-active');

      if (STATE.settings.highlightEnabled && window.__DualSub.Highlight) {
        pEl.innerHTML = window.__DualSub.Highlight.highlightText(primary ? primary.text : '');
        sEl.innerHTML = window.__DualSub.Highlight.highlightText(secondary ? secondary.text : '');
      } else {
        pEl.textContent = primary ? primary.text : '';
        sEl.textContent = secondary ? secondary.text : '';
      }
      pEl.style.display = primary ? 'block' : 'none';
      sEl.style.display = secondary ? 'block' : 'none';

      if (window.__DualSub.Transcript) {
        window.__DualSub.Transcript.sync(STATE.video ? STATE.video.currentTime : 0);
      }
    },

    hide() {
      if (!STATE.overlay) return;
      STATE.overlay.classList.remove('dualsub-active');
      var p = STATE.overlay.querySelector('.dualsub-primary');
      var s = STATE.overlay.querySelector('.dualsub-secondary');
      if (p) p.textContent = '';
      if (s) s.textContent = '';
    },

    startLoop() {
      if (STATE.animationId) return;
      var _this = this;
      function loop() { _this.updateDisplay(); STATE.animationId = requestAnimationFrame(loop); }
      STATE.animationId = requestAnimationFrame(loop);
    },

    stopLoop() {
      if (STATE.animationId) { cancelAnimationFrame(STATE.animationId); STATE.animationId = null; }
    },

    setupResizeObserver() {
      if (!STATE.video) return;
      var observer = new ResizeObserver(function() { DualSubUI.positionOverlay(); });
      observer.observe(STATE.video);
      STATE.resizeObserver = observer;
    },

    setupScrollListener() {
      function handleScroll() { DualSubUI.positionOverlay(); }
      document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
      STATE.scrollListener = handleScroll;
    },

    destroy() {
      this.stopLoop();
      if (STATE.resizeObserver) { STATE.resizeObserver.disconnect(); STATE.resizeObserver = null; }
      STATE._retryTimers.forEach(clearTimeout);
      STATE._retryTimers = [];
    },
  };


  const MessageHandler = {
    setup() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.type) {
          case 'getStatus':
            sendResponse({
              isReady: STATE.isReady,
              enabled: STATE.settings.enabled,
              primaryCount: STATE.primarySubtitles.length,
              secondaryCount: STATE.secondarySubtitles.length,
              primaryLang: STATE.settings.primaryLang,
              secondaryLang: STATE.settings.secondaryLang,
              availableTracks: STATE.availableTracks.map((t) => ({
                languageCode: t.languageCode, name: t.name, kind: t.kind, isTranslatable: t.isTranslatable,
              })),
              settings: STATE.settings,
            });
            break;
          case 'setEnabled':
            STATE.settings.enabled = request.payload.enabled;
            SettingsManager.save({ enabled: request.payload.enabled });
            if (!STATE.settings.enabled) DualSubUI.hide();
            sendResponse({ success: true });
            break;
          case 'setLanguagePair':
            SettingsManager.setLanguagePair(
              request.payload.primaryLang, request.payload.secondaryLang,
              request.payload.primaryLabel, request.payload.secondaryLabel
            ).then(() => sendResponse({ success: true }));
            return true;
          case 'setPosition':
            STATE.settings.position = request.payload.position;
            SettingsManager.save({ position: request.payload.position });
            DualSubUI.positionOverlay();
            sendResponse({ success: true });
            break;
          case 'setFontSize':
            STATE.settings.fontSize = request.payload.fontSize;
            SettingsManager.save({ fontSize: request.payload.fontSize });
            DualSubUI.applySettings();
            sendResponse({ success: true });
            break;
          case 'reloadSubtitles':
            CaptionManager.init().then((ready) => sendResponse({ success: true, isReady: ready }));
            return true;
          case 'updateSettings':
            SettingsManager.save(request.payload.settings || {});
            DualSubUI.applySettings();
            sendResponse({ success: true });
            break;

          // NEW FEATURE MESSAGES
          case 'setTimingOffset':
            STATE.settings.timingOffset = request.payload.offset;
            SettingsManager.save({ timingOffset: request.payload.offset });
            sendResponse({ success: true });
            break;
          case 'setHighlightEnabled':
            STATE.settings.highlightEnabled = request.payload.enabled;
            if (window.__DualSub.Highlight) {
              window.__DualSub.Highlight.setEnabled(request.payload.enabled);
              if (request.payload.level) {
                STATE.settings.highlightLevel = request.payload.level;
                window.__DualSub.Highlight.setLevel(request.payload.level);
              }
            }
            SettingsManager.save({
              highlightEnabled: request.payload.enabled,
              highlightLevel: request.payload.level || STATE.settings.highlightLevel,
            });
            sendResponse({ success: true });
            break;
          case 'transcriptToggle':
            if (window.__DualSub.Transcript) {
              window.__DualSub.Transcript.toggle();
              STATE.settings.transcriptVisible = window.__DualSub.Transcript._visible || false;
              SettingsManager.save({ transcriptVisible: STATE.settings.transcriptVisible });
            }
            sendResponse({ success: true });
            break;
          case 'exportVocabulary':
            (async () => {
              const format = request.payload.format || 'csv';
              const data = format === 'anki'
                ? await window.__DualSub.Vocabulary.exportAnki()
                : await window.__DualSub.Vocabulary.exportCSV();
              sendResponse({ success: !!data, data, format, count: await window.__DualSub.Vocabulary.getCount() });
            })();
            return true;

          default:
            sendResponse({ error: 'Unknown type' });
        }
        return false;
      });
    },
  };


  // ============================================================
  // MAIN INITIALIZATION
  // ============================================================
  const Main = {
    async init() {
      console.log('[DualSub] Initializing...');
      await SettingsManager.load();

      // Initialize feature modules
      if (window.__DualSub.Dictionary) window.__DualSub.Dictionary.init();
      if (window.__DualSub.Vocabulary) {} // No init needed, lazy load
      if (window.__DualSub.Transcript) window.__DualSub.Transcript.init();
      if (window.__DualSub.Highlight) {
        window.__DualSub.Highlight.init();
        window.__DualSub.Highlight.setEnabled(STATE.settings.highlightEnabled);
        window.__DualSub.Highlight.setLevel(STATE.settings.highlightLevel);
      }

      MessageHandler.setup(); // MUST be before caption loading
      await this.waitForVideo();
      DualSubUI.getOverlay();
      DualSubUI.applySettings();
      DualSubUI.setupResizeObserver();
      DualSubUI.setupScrollListener();
      DualSubUI.startLoop();
      this.setupYouTubeNavigationDetection();
      // Load captions (async, doesn't block UI)
      CaptionManager.init().catch(function(err) {
        console.warn('[DualSub] Caption loading deferred:', err);
      });

      // Show transcript if was visible
      if (STATE.settings.transcriptVisible && window.__DualSub.Transcript) {
        setTimeout(() => window.__DualSub.Transcript.show(), 1500);
      }

      console.log('[DualSub] Initialized successfully');
    },

    async waitForVideo(timeout = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const video = document.querySelector('video.html5-main-video');
        if (video) { STATE.video = video; return video; }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('[DualSub] Video element not found');
    },

    setupYouTubeNavigationDetection() {
      let lastUrl = window.location.href;
      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          setTimeout(() => this.reinit(), 1000);
        }
      });
      observer.observe(document.querySelector('title') || document.documentElement, {
        subtree: true, childList: true, characterData: true,
      });
      document.addEventListener('yt-navigate-finish', () => {
        setTimeout(() => this.reinit(), 1000);
      });
    },

    async reinit() {
      try {
        await this.waitForVideo(10000);
        DualSubUI.positionOverlay();
        await CaptionManager.init();
      } catch (err) {
        console.warn('[DualSub] Reinit failed:', err);
      }
    },
  };

  // ============================================================
  // START
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Main.init());
  } else {
    Main.init();
  }

  window.addEventListener('beforeunload', () => DualSubUI.destroy());
  window.addEventListener('pagehide', () => DualSubUI.destroy());
})();

