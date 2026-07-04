/**
 * DualSub v2.0.0 - Bootstrap & Shared Namespace
 * Khởi tạo namespace và các tiện ích dùng chung cho tất cả modules
 */
'use strict';

// Không dùng IIFE để các file sau có thể truy cập namespace
window.__DualSub = window.__DualSub || {};

// Dùng var để các module sau có thể dùng DS (không gây lỗi redeclare)
var DS = window.__DualSub;

/** Tiện ích dùng chung */
DS.Util = {
  parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':');
    let seconds = 0;
    if (parts.length === 3) seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    else if (parts.length === 2) seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    else seconds = parseFloat(parts[0]);
    return isNaN(seconds) ? 0 : seconds;
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },

  deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]))
        result[key] = DS.Util.deepMerge(target[key] || {}, source[key]);
      else result[key] = source[key];
    }
    return result;
  },

  /** Lấy domain để detect platform */
  getDomain() {
    return window.location.hostname.replace('www.', '').split('.')[0];
  }
};

/** Platform enum */
DS.PLATFORMS = {
  YOUTUBE: 'youtube',
  COURSERA: 'coursera',
  EDX: 'edx',
  UDEMY: 'udemy',
  UNKNOWN: 'unknown'
};

console.log('[DualSub] Bootstrap loaded');
