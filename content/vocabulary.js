/**
 * DualSub v2.0.0 - Vocabulary Store
 * Lưu từ vựng vào chrome.storage.local, export CSV/Anki
 */
'use strict';
var DS = window.__DualSub;

DS.Vocabulary = {
  STORAGE_KEY: 'dualsub_vocabulary',

  async getAll() {
    const r = await chrome.storage.local.get(this.STORAGE_KEY);
    return r[this.STORAGE_KEY] || [];
  },

  async save(words) {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: words });
  },

  async add(word) {
    const words = await this.getAll();
    if (words.find((w) => w.word === word)) return false;
    words.push({ word, added: Date.now(), context: this._getContext() });
    await this.save(words);
    return true;
  },

  async remove(word) {
    const words = await this.getAll();
    await this.save(words.filter((w) => w.word !== word));
    return true;
  },

  async toggle(word) {
    const saved = await this.isSaved(word);
    if (saved) await this.remove(word);
    else await this.add(word);
    return !saved;
  },

  async isSaved(word) {
    const words = await this.getAll();
    return !!words.find((w) => w.word === word);
  },

  _getContext() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('v') || url.pathname;
    } catch (e) { return ''; }
  },

  async exportCSV() {
    const words = await this.getAll();
    if (!words.length) return null;
    const header = 'Word,Added Date,Context\n';
    const rows = words.map((w) => {
      const d = new Date(w.added).toISOString().split('T')[0];
      return '"' + w.word + '","' + d + '","' + (w.context || '') + '"';
    }).join('\n');
    return header + rows;
  },

  async exportAnki() {
    const words = await this.getAll();
    if (!words.length) return null;
    return words.map((w) => w.word + '\t' + w.word).join('\n');
  },

  async getCount() {
    const words = await this.getAll();
    return words.length;
  }
};

console.log('[DualSub] Vocabulary module loaded');
