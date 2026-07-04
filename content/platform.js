/**
 * DualSub v2.0.0 - Platform Detection & Adapters
 * Hỗ trợ YouTube, Coursera, edX, Udemy
 */
'use strict';

var DS = window.__DualSub;

// ============================================================
// BASE ADAPTER
// ============================================================
class PlatformAdapter {
  get platform() { return DS.PLATFORMS.UNKNOWN; }

  /** Tìm video element */
  findVideo() { return document.querySelector('video'); }

  /** Lấy video ID / identifier */
  getVideoId() { return ''; }

  /** Lấy caption tracks từ page */
  getCaptionTracks() { return []; }

  /** Tính vị trí overlay */
  getOverlayRect(video) {
    if (!video) return null;
    return video.getBoundingClientRect();
  }

  /** Platform-specific styles cho overlay */
  getOverlayStyles() { return {}; }
}

// ============================================================
// YOUTUBE ADAPTER
// ============================================================
class YouTubeAdapter extends PlatformAdapter {
  get platform() { return DS.PLATFORMS.YOUTUBE; }

  findVideo() {
    return document.querySelector('video.html5-main-video');
  }

  getVideoId() {
    try { return new URL(window.location.href).searchParams.get('v'); }
    catch(e) { return ''; }
  }

  getCaptionTracks() {
    const pr = this._getPlayerResponse();
    if (!pr) return [];
    try {
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!tracks) return [];
      return tracks.map(t => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode,
        name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
        kind: t.kind || 'standard',
        isTranslatable: t.isTranslatable || false,
      }));
    } catch(e) { return []; }
  }

  _getPlayerResponse() {
    if (typeof ytInitialPlayerResponse !== 'undefined') return ytInitialPlayerResponse;
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('ytInitialPlayerResponse')) continue;
      try {
        const startIdx = text.indexOf('ytInitialPlayerResponse');
        const eqIdx = text.indexOf('=', startIdx);
        const braceIdx = text.indexOf('{', eqIdx);
        if (braceIdx === -1) continue;

        let depth = 0, endIdx = braceIdx;
        const maxLen = Math.min(text.length, braceIdx + 500000);
        for (let i = braceIdx; i < maxLen; i++) {
          const ch = text[i];
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
          if (ch === '"') { i++; while (i < maxLen && text[i] !== '"') { if (text[i] === '\\') i++; i++; } }
        }
        if (depth !== 0) continue;
        return JSON.parse(text.slice(braceIdx, endIdx));
      } catch(e) { continue; }
    }
    return null;
  }
}

// ============================================================
// COURSERA ADAPTER
// ============================================================
class CourseraAdapter extends PlatformAdapter {
  get platform() { return DS.PLATFORMS.COURSERA; }

  findVideo() {
    // Coursera dùng video element trong shadow DOM
    const video = document.querySelector('video');
    if (video && video.readyState > 0) return video;
    // Fallback: tìm trong tất cả shadow roots
    return document.querySelector('video');
  }

  getVideoId() {
    const m = window.location.pathname.match(/lecture\/([^/]+)/);
    return m ? m[1] : window.location.pathname;
  }

  getCaptionTracks() {
    // Coursera dùng VTT tracks riêng
    const tracks = [];
    try {
      const video = this.findVideo();
      if (!video) return tracks;
      const textTracks = video.textTracks;
      for (let i = 0; i < textTracks.length; i++) {
        const t = textTracks[i];
        if (t.language) {
          tracks.push({
            baseUrl: '', // Coursera cần fetch từ API riêng
            languageCode: t.language,
            name: t.label || t.language,
            kind: t.kind || 'subtitles',
            isTranslatable: false,
            textTrack: t,
          });
        }
      }
    } catch(e) {}
    return tracks;
  }
}

// ============================================================
// EDX ADAPTER
// ============================================================
class EdxAdapter extends PlatformAdapter {
  get platform() { return DS.PLATFORMS.EDX; }

  findVideo() {
    return document.querySelector('video');
  }

  getVideoId() {
    const m = window.location.pathname.match(/course-v1:[^/]+\/[^/]+\/[^/]+/);
    return m ? m[0] : window.location.pathname;
  }
}

// ============================================================
// UDEMY ADAPTER
// ============================================================
class UdemyAdapter extends PlatformAdapter {
  get platform() { return DS.PLATFORMS.UDEMY; }

  findVideo() {
    return document.querySelector('video');
  }

  getVideoId() {
    const m = window.location.pathname.match(/\d+/);
    return m ? m[0] : window.location.pathname;
  }
}

// ============================================================
// FACTORY
// ============================================================
DS.Platform = {
  _adapter: null,

  detect() {
    const domain = DS.Util.getDomain();
    switch (domain) {
      case 'youtube': return new YouTubeAdapter();
      case 'coursera': return new CourseraAdapter();
      case 'edx': case 'courses': return new EdxAdapter();
      case 'udemy': return new UdemyAdapter();
      default: return new PlatformAdapter();
    }
  },

  getAdapter() {
    if (!this._adapter) this._adapter = this.detect();
    return this._adapter;
  },

  reset() { this._adapter = null; }
};

console.log('[DualSub] Platform module loaded');
