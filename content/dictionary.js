/**
 * DualSub v2 - Dictionary & Word Lookup
 */
'use strict';
var DS = window.__DualSub;

DS.Dictionary = {
  _cache: new Map(), _tooltip: null, _currentWord: null,

  init() { this._createTooltip(); this._setupListeners(); },

  _createTooltip() {
    if (this._tooltip) return;
    const el = document.createElement('div');
    el.id = 'dualsub-dict-tooltip';
    el.className = 'dualsub-dict-tooltip';
    el.innerHTML = [
      '<div class="dict-header">',
      '  <span class="dict-word"></span>',
      '  <button class="dict-save-btn">&#9734;</button>',
      '  <button class="dict-close-btn">&times;</button>',
      '</div>',
      '<div class="dict-phonetic"></div>',
      '<div class="dict-meanings"></div>',
    ].join('');
    document.body.appendChild(el);
    this._tooltip = el;
    el.querySelector('.dict-close-btn').onclick = () => this.hide();
    el.querySelector('.dict-save-btn').onclick = () => this._saveCurrentWord();
  },
  _setupListeners() {
    document.addEventListener('click', (e) => {
      if (this._tooltip && !this._tooltip.contains(e.target) && !e.target.closest('.dualsub-cue')) this.hide();
    });
    const obs = new MutationObserver(() => {
      const c = document.querySelector('.dualsub-container');
      if (c && !c.dataset.dictReady) {
        c.dataset.dictReady = '1';
        c.addEventListener('click', (e) => {
          if (!e.target.closest('.dualsub-cue')) return;
          const sel = window.getSelection().toString().trim();
          if (sel && sel.split(/\s+/).length <= 3) {
            this.lookup(sel, e);
            window.getSelection().removeAllRanges();
          } else {
            const w = this._getWordAtPoint(e.clientX, e.clientY);
            if (w) this.lookup(w, e);
          }
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  },

  _getWordAtPoint(x, y) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return null;
    const n = r.startContainer, o = r.startOffset;
    if (!n || !n.textContent) return null;
    const t = n.textContent;
    let s = o, e = o;
    while (s > 0 && /\S/.test(t[s - 1])) s--;
    while (e < t.length && /\S/.test(t[e])) e++;
    return t.slice(s, e).replace(/[^a-zA-Z'-]/g, '') || null;
  },

  async lookup(word, event) {
    if (!word || word.length > 50) return;
    const w = word.toLowerCase().replace(/[^a-z'-]/g, '');
    if (!w || w.length < 1) return;
    this._currentWord = w;
    this._showLoading(event);
    if (this._cache.has(w)) return this._showResult(w, this._cache.get(w), event);
    try {
      const data = await this._fetchDefinition(w);
      this._cache.set(w, data);
      this._showResult(w, data, event);
    } catch (e) { this._showError(w, e.message, event); }
  },

  async _fetchDefinition(word) {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
    if (!r.ok) throw new Error(r.status === 404 ? 'Khong tim thay' : 'Loi API: ' + r.status);
    const d = await r.json();
    if (!d || !d.length) throw new Error('Khong co du lieu');
    return d[0];
  },

  _showLoading(e) {
    if (!this._tooltip) return;
    this._pos(e);
    this._tooltip.querySelector('.dict-word').textContent = this._currentWord;
    this._tooltip.querySelector('.dict-phonetic').textContent = '';
    this._tooltip.querySelector('.dict-meanings').innerHTML = '<div class="dict-loading">Dang tra tu...</div>';
    this._tooltip.classList.add('active');
    this._tooltip.classList.remove('error');
  },

  _showResult(word, data, e) {
    if (!this._tooltip) return;
    this._pos(e);
    this._tooltip.querySelector('.dict-word').textContent = word;
    this._tooltip.querySelector('.dict-phonetic').textContent = (data.phonetic || (data.phonetics && data.phonetics[0] && data.phonetics[0].text) || '');
    const m = this._tooltip.querySelector('.dict-meanings');
    m.innerHTML = '';
    if (data.meanings) {
      data.meanings.slice(0, 3).forEach((meaning) => {
        const b = document.createElement('div');
        b.className = 'dict-meaning-block';
        b.innerHTML = '<div class="dict-pos">' + (meaning.partOfSpeech || '') + '</div>';
        meaning.definitions.slice(0, 3).forEach((def) => {
          const d = document.createElement('div');
          d.className = 'dict-definition';
          let h = '<div class="dict-def-text">' + DS.Util.escapeHtml(def.definition) + '</div>';
          if (def.example) h += '<div class="dict-example">\u2192 ' + DS.Util.escapeHtml(def.example) + '</div>';
          d.innerHTML = h;
          b.appendChild(d);
        });
        m.appendChild(b);
      });
    } else {
      m.innerHTML = '<div class="dict-no-data">Khong co dinh nghia</div>';
    }
    this._updateSaveButton(word);
    this._tooltip.classList.add('active');
    this._tooltip.classList.remove('error');
  },

  _showError(word, msg, e) {
    if (!this._tooltip) return;
    this._pos(e);
    this._tooltip.querySelector('.dict-word').textContent = word;
    this._tooltip.querySelector('.dict-phonetic').textContent = '';
    this._tooltip.querySelector('.dict-meanings').innerHTML = '<div class="dict-error">\u26A0 ' + DS.Util.escapeHtml(msg) + '</div>';
    this._tooltip.classList.add('active', 'error');
  },

  _pos(e) {
    if (!this._tooltip) return;
    const x = (e && e.clientX) || 0, y = (e && e.clientY) || 0;
    this._tooltip.style.left = Math.max(10, Math.min(x + 10, innerWidth - 350)) + 'px';
    this._tooltip.style.top = Math.max(10, Math.min(y - 10, innerHeight - 400)) + 'px';
  },

  hide() { if (this._tooltip) this._tooltip.classList.remove('active'); },

  _updateSaveButton(word) {
    const btn = this._tooltip && this._tooltip.querySelector('.dict-save-btn');
    if (!btn) return;
    DS.Vocabulary.isSaved(word).then((s) => {
      btn.textContent = s ? '\u2605' : '\u2606';
      btn.classList.toggle('saved', s);
    });
  },

  async _saveCurrentWord() {
    if (!this._currentWord) return;
    await DS.Vocabulary.toggle(this._currentWord);
    this._updateSaveButton(this._currentWord);
  },
};

console.log('[DualSub] Dictionary module loaded');
