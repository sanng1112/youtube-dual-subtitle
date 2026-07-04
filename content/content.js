/**
 * DualSub - YouTube Dual Subtitle Extension
 * Content Script: Phát hiện video YouTube, lấy phụ đề song ngữ và hiển thị overlay
 */

(function () {
  'use strict';

  // ============================================================
  // STATE
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
    },
    availableTracks: [],
    isReady: false,
    animationId: null,
    lastTime: -1,
    isFetching: false,
    retryCount: 0,
    lastVideoId: null,
    resizeObserver: null,
  };

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
  const YouTubeCaptions = {
    getPlayerResponse() {
      if (typeof ytInitialPlayerResponse !== 'undefined') return ytInitialPlayerResponse;
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('ytInitialPlayerResponse')) {
          try {
            const m = text.match(/ytInitialPlayerResponse\s*=\s*({.*?});/);
            if (m) return JSON.parse(m[1]);
            const m2 = text.match(/window\.ytInitialPlayerResponse\s*=\s*({.*?});/);
            if (m2) return JSON.parse(m2[1]);
          } catch (e) { /* ignore */ }
        }
      }
      return null;
    },

    getCaptionTracks(playerResponse) {
      try {
        const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) {
          return tracks.map((t) => ({
            baseUrl: t.baseUrl,
            languageCode: t.languageCode,
            name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
            kind: t.kind || 'standard',
            isTranslatable: t.isTranslatable || false,
            vssId: t.vssId,
          }));
        }
      } catch (e) { /* ignore */ }
      return [];
    },

    async fetchSubtitles(baseUrl, languageCode) {
      const url = `${baseUrl}&fmt=vtt`;
      const resp = await fetch(url, { credentials: 'include', headers: { Accept: 'text/plain, */*' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${languageCode}`);
      const text = await resp.text();
      return SubtitleParser.parse(text);
    },

    getVideoId() {
      const url = new URL(window.location.href);
      return url.searchParams.get('v');
    },
  };


  // ============================================================
  // DUAL SUBTITLE UI
  // ============================================================
  const DualSubUI = {
    getOverlay() {
      if (STATE.overlay && document.body.contains(STATE.overlay)) return STATE.overlay;
      const overlay = document.createElement('div');
      overlay.id = 'dualsub-overlay';
      overlay.className = 'dualsub-overlay';
      overlay.innerHTML = `
        <div class="dualsub-container">
          <div class="dualsub-primary dualsub-cue"></div>
          <div class="dualsub-secondary dualsub-cue"></div>
        </div>
        <div class="dualsub-status">
          <span class="dualsub-status-text">DualSub</span>
        </div>
      `;
      document.body.appendChild(overlay);
      STATE.overlay = overlay;
      return overlay;
    },

    positionOverlay() {
      const overlay = STATE.overlay;
      const video = STATE.video;
      if (!overlay || !video) return;
      const rect = video.getBoundingClientRect();
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
      const overlay = STATE.overlay;
      if (!overlay) return;
      const primary = overlay.querySelector('.dualsub-primary');
      const secondary = overlay.querySelector('.dualsub-secondary');
      if (primary) {
        primary.style.color = STATE.settings.primaryColor;
        primary.style.fontSize = STATE.settings.fontSize + 'px';
        primary.style.background = STATE.settings.backgroundColor;
      }
      if (secondary) {
        secondary.style.color = STATE.settings.secondaryColor;
        secondary.style.fontSize = Math.max(12, STATE.settings.fontSize - 2) + 'px';
        secondary.style.background = STATE.settings.backgroundColor;
      }
      this.positionOverlay();
    },

    findCueAtTime(cues, time) {
      if (!cues || cues.length === 0) return null;
      let lo = 0, hi = cues.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const cue = cues[mid];
        if (time >= cue.start && time < cue.end) return cue;
        if (time < cue.start) hi = mid - 1;
        else lo = mid + 1;
      }
      return null;
    },

    findNearestCue(cues, time, window = 2.0) {
      if (!cues || cues.length === 0) return null;
      let best = null, bestDist = Infinity;
      for (const cue of cues) {
        const dist = Math.abs(time - cue.start);
        if (dist < window && dist < bestDist) { bestDist = dist; best = cue; }
      }
      return best;
    },

    updateDisplay() {
      const video = STATE.video;
      if (!video || !STATE.settings.enabled) { this.hide(); return; }
      const t = video.currentTime;
      if (Math.abs(t - STATE.lastTime) < 0.05) return;
      STATE.lastTime = t;

      let p = this.findCueAtTime(STATE.primarySubtitles, t);
      let s = this.findCueAtTime(STATE.secondarySubtitles, t);
      if (p && !s) s = this.findNearestCue(STATE.secondarySubtitles, t, 2.0);
      if (s && !p) p = this.findNearestCue(STATE.primarySubtitles, t, 2.0);
      this.render(p, s);
    },

    render(primary, secondary) {
      const overlay = STATE.overlay;
      if (!overlay) return;
      const pEl = overlay.querySelector('.dualsub-primary');
      const sEl = overlay.querySelector('.dualsub-secondary');
      if (!STATE.settings.enabled || (!primary && !secondary)) {
        pEl.textContent = ''; sEl.textContent = '';
        overlay.classList.remove('dualsub-active');
        return;
      }
      overlay.classList.add('dualsub-active');
      pEl.textContent = primary ? primary.text : '';
      pEl.style.display = primary ? 'block' : 'none';
      sEl.textContent = secondary ? secondary.text : '';
      sEl.style.display = secondary ? 'block' : 'none';
    },

    hide() {
      if (!STATE.overlay) return;
      STATE.overlay.classList.remove('dualsub-active');
      const p = STATE.overlay.querySelector('.dualsub-primary');
      const s = STATE.overlay.querySelector('.dualsub-secondary');
      if (p) p.textContent = '';
      if (s) s.textContent = '';
    },

    startLoop() {
      if (STATE.animationId) return;
      const loop = () => { this.updateDisplay(); STATE.animationId = requestAnimationFrame(loop); };
      STATE.animationId = requestAnimationFrame(loop);
    },

    stopLoop() {
      if (STATE.animationId) { cancelAnimationFrame(STATE.animationId); STATE.animationId = null; }
    },

    setupResizeObserver() {
      if (!STATE.video) return;
      const observer = new ResizeObserver(Util.debounce(() => this.positionOverlay(), 200));
      observer.observe(STATE.video);
      STATE.resizeObserver = observer;
    },
  };


  // ============================================================
  // SETTINGS MANAGEMENT
  // ============================================================
  const SettingsManager = {
    async load() {
      return new Promise((resolve) => {
        chrome.storage.sync.get('dualsubSettings', (result) => {
          if (result.dualsubSettings) {
            STATE.settings = Util.deepMerge(STATE.settings, result.dualsubSettings);
          }
          resolve(STATE.settings);
        });
      });
    },
    async save(settings) {
      STATE.settings = Util.deepMerge(STATE.settings, settings);
      return new Promise((resolve) => {
        chrome.storage.sync.set({ dualsubSettings: STATE.settings }, resolve);
      });
    },
    async setLanguagePair(primaryLang, secondaryLang, primaryLabel, secondaryLabel) {
      STATE.settings.primaryLang = primaryLang;
      STATE.settings.secondaryLang = secondaryLang;
      STATE.settings.primaryLabel = primaryLabel || primaryLang;
      STATE.settings.secondaryLabel = secondaryLabel || secondaryLang;
      await this.save({});
      await CaptionManager.loadSubtitles(STATE.availableTracks);
    },
  };

  // ============================================================
  // CAPTION FETCHING
  // ============================================================
  const CaptionManager = {
    hasVideoChanged() {
      const videoId = YouTubeCaptions.getVideoId();
      if (videoId !== STATE.lastVideoId) {
        STATE.lastVideoId = videoId;
        STATE.primarySubtitles = [];
        STATE.secondarySubtitles = [];
        STATE.availableTracks = [];
        STATE.isReady = false;
        return true;
      }
      return false;
    },

    extractTracks() {
      const pr = YouTubeCaptions.getPlayerResponse();
      if (!pr) return [];
      const tracks = YouTubeCaptions.getCaptionTracks(pr);
      STATE.availableTracks = tracks;
      return tracks;
    },

    findTrack(tracks, langCode) {
      if (!tracks || tracks.length === 0) return null;
      let exact = tracks.find((t) => t.languageCode === langCode);
      if (exact) return exact;
      if (langCode === 'vi') {
        const vi = tracks.find((t) => t.languageCode.startsWith('vi'));
        if (vi) return vi;
      }
      if (langCode === 'en') {
        const en = tracks.find((t) => t.languageCode.startsWith('en'));
        if (en) return en;
      }
      const fuzzy = tracks.find((t) => t.languageCode.includes(langCode));
      return fuzzy || tracks[0];
    },

    async fetchForLanguage(tracks, langCode) {
      const track = this.findTrack(tracks, langCode);
      if (!track) return [];
      try {
        const cues = await YouTubeCaptions.fetchSubtitles(track.baseUrl, langCode);
        if (cues.length > 0) return cues;
        if (track.languageCode !== langCode && track.isTranslatable) {
          const tc = await YouTubeCaptions.fetchSubtitles(`${track.baseUrl}&tlang=${langCode}`, `${track.languageCode}->${langCode}`);
          if (tc.length > 0) return tc;
        }
      } catch (err) {
        if (track.isTranslatable) {
          try {
            return await YouTubeCaptions.fetchSubtitles(`${track.baseUrl}&tlang=${langCode}`, `${track.languageCode}->${langCode}`);
          } catch (e2) { /* ignore */ }
        }
      }
      return [];
    },

    async loadSubtitles(tracks) {
      if (STATE.isFetching) return;
      STATE.isFetching = true;
      try {
        STATE.primarySubtitles = await this.fetchForLanguage(tracks, STATE.settings.primaryLang);
        STATE.secondarySubtitles = await this.fetchForLanguage(tracks, STATE.settings.secondaryLang);
        console.log(`[DualSub] Primary: ${STATE.primarySubtitles.length}, Secondary: ${STATE.secondarySubtitles.length}`);
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
        console.error('[DualSub] Failed to load subtitles:', err);
        if (STATE.retryCount < 3) {
          STATE.retryCount++;
          setTimeout(() => this.loadSubtitles(tracks), 2000 * STATE.retryCount);
        }
      } finally {
        STATE.isFetching = false;
      }
    },

    async init() {
      if (this.hasVideoChanged() || STATE.availableTracks.length === 0) {
        const tracks = this.extractTracks();
        if (tracks.length > 0) { await this.loadSubtitles(tracks); return true; }
        return false;
      }
      return STATE.isReady;
    },
  };


  // ============================================================
  // MESSAGE HANDLER
  // ============================================================
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
      await this.waitForVideo();
      DualSubUI.getOverlay();
      DualSubUI.applySettings();
      DualSubUI.setupResizeObserver();
      await CaptionManager.init();
      DualSubUI.startLoop();
      MessageHandler.setup();
      this.setupYouTubeNavigationDetection();
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

  window.addEventListener('beforeunload', () => {
    DualSubUI.stopLoop();
    if (STATE.resizeObserver) STATE.resizeObserver.disconnect();
  });
})();

