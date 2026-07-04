/**
 * DualSub v2.0.0 - Word Highlight Engine
 * To mau tu vung theo do kho (beginner/intermediate/advanced)
 */
'use strict';
var DS = window.__DualSub;

DS.Highlight = {
  _enabled: false,
  _level: 'advanced',
  _commonWords: new Set(),

  _commonWordsList: [
    'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with',
    'he','as','you','do','at','this','but','his','by','from','they','we','say','her','she',
    'or','an','will','my','one','all','would','there','their','what','so','up','out','if',
    'about','who','get','which','go','me','when','make','can','like','time','no','just',
    'him','know','take','people','into','year','your','good','some','could','them','see',
    'other','than','then','now','look','only','come','its','over','think','also','back',
    'after','use','two','how','our','work','first','well','way','even','new','want','because',
    'any','these','give','day','most','us','is','are','was','were','been','has','had','did',
    'does','very','just','also','much','many','such','may','more','should','own','each',
  ],

  init() { this._commonWords = new Set(this._commonWordsList); },

  setEnabled(enabled) { this._enabled = enabled; },

  setLevel(level) {
    this._level = level;
    const n = level === 'beginner' ? 100 : level === 'intermediate' ? 300 : this._commonWordsList.length;
    this._commonWords = new Set(this._commonWordsList.slice(0, n));
  },

  shouldHighlight(word) {
    if (!this._enabled) return false;
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    return clean.length >= 3 && !this._commonWords.has(clean);
  },

  highlightText(text) {
    if (!this._enabled || !text) return DS.Util.escapeHtml(text);
    return text.split(/(\s+)/).map((w) => {
      if (!w.trim()) return DS.Util.escapeHtml(w);
      const clean = w.replace(/[^a-zA-Z]/g, '');
      if (clean && this.shouldHighlight(clean)) {
        return '<span class="dualsub-hl" data-word="' + clean + '">' + DS.Util.escapeHtml(w) + '</span>';
      }
      return DS.Util.escapeHtml(w);
    }).join('');
  }
};

console.log('[DualSub] Highlight module loaded');
