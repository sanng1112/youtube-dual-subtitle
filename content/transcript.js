/**
 * DualSub v2.0.0 - Synchronized Transcript Panel
 * Click vào dòng transcript de nhay den doan video tuong ung
 */
'use strict';
var DS = window.__DualSub;

DS.Transcript = {
  _panel: null,
  _items: [],
  _visible: false,
  _activeIndex: -1,
  _isScrolling: false,

  init() {
    this._createPanel();
    this._setupListeners();
  },

  _createPanel() {
    if (this._panel) return;
    const p = document.createElement('div');
    p.id = 'dualsub-transcript';
    p.className = 'dualsub-transcript';
    p.innerHTML = [
      '<div class="transcript-header">',
      '  <span class="transcript-title">Transcript dong bo</span>',
      '  <button class="transcript-close">&times;</button>',
      '</div>',
      '<div class="transcript-list"></div>',
    ].join('');
    document.body.appendChild(p);
    this._panel = p;
    p.querySelector('.transcript-close').onclick = () => this.hide();
  },

  _setupListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) this.toggle();
    });
    chrome.runtime.onMessage.addListener((req) => {
      if (req.type === 'transcriptToggle') this.toggle();
    });
  },

  toggle() { this._visible ? this.hide() : this.show(); },

  show() {
    if (!this._panel) this._createPanel();
    this._rebuildList();
    this._panel.classList.add('active');
    this._visible = true;
  },

  hide() {
    if (this._panel) this._panel.classList.remove('active');
    this._visible = false;
  },

  _rebuildList() {
    const list = this._panel && this._panel.querySelector('.transcript-list');
    if (!list) return;
    list.innerHTML = '';
    const cues = DS._STATE && DS._STATE.primarySubtitles;
    if (!cues || !cues.length) {
      list.innerHTML = '<div class="transcript-empty">Chua co phu de - mo phu de YouTube truoc</div>';
      return;
    }
    this._items = cues;
    cues.forEach((cue, i) => {
      const item = document.createElement('div');
      item.className = 'transcript-item';
      item.dataset.index = i;
      item.innerHTML = '<span class="transcript-time">' + this._fmt(cue.start) + '</span>' +
        '<span class="transcript-text">' + DS.Util.escapeHtml(cue.text) + '</span>';
      item.onclick = () => this._seekTo(cue.start);
      list.appendChild(item);
    });
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  },

  _seekTo(time) {
    const video = DS._STATE && DS._STATE.video;
    if (video) video.currentTime = time;
  },

  sync(time) {
    if (!this._visible || !this._items.length) return;
    const idx = this._items.findIndex((c) => time >= c.start && time < c.end);
    if (idx === this._activeIndex) return;
    this._activeIndex = idx;
    const list = this._panel && this._panel.querySelector('.transcript-list');
    if (!list) return;
    list.querySelectorAll('.transcript-item').forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0 && !this._isScrolling) {
      const active = list.querySelector('.transcript-item.active');
      if (active) {
        this._isScrolling = true;
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => { this._isScrolling = false; }, 500);
      }
    }
  }
};

console.log('[DualSub] Transcript module loaded');
