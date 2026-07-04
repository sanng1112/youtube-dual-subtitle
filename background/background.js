/**
 * DualSub v2 - Background Service Worker
 * Xử lý caption fetching (không bị CSP/CORS giới hạn)
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.storage.sync.set({
    dualsubSettings: {
      enabled: true, primaryLang: 'en', secondaryLang: 'vi',
      primaryLabel: 'English', secondaryLabel: 'Tieng Viet',
      fontSize: 16, position: 'bottom',
      primaryColor: '#ffffff', secondaryColor: '#00e5ff',
      backgroundColor: 'rgba(0,0,0,0.6)', showSpeakerLabel: true,
      timingOffset: 0, highlightEnabled: false,
      highlightLevel: 'advanced', transcriptVisible: false,
    },
    dualsubLangPair: { primaryLang: 'en', secondaryLang: 'vi' },
  });
  chrome.tabs.create({ url: 'https://github.com/sanng1112/youtube-dual-subtitle' });
});

/**
 * Get captions from background worker (no CSP/CORS limits)
 * Fetches YouTube page HTML, extracts captions, returns cues
 */
async function getYouTubeCaptions(videoId, langCode) {
  try {
    var pageResp = await fetch('https://www.youtube.com/watch?v=' + videoId);
    if (!pageResp.ok) return { error: 'HTTP ' + pageResp.status };
    var html = await pageResp.text();

    var data = extractPlayerResponse(html);
    if (!data) return { error: 'No player response' };

    var tracks = extractCaptionTracks(data);
    if (!tracks || tracks.length === 0) return { error: 'No tracks' };

    // Find matching track
    var track = tracks.find(function(t) { return t.lang === langCode; });
    if (!track && langCode === 'vi') track = tracks.find(function(t) { return t.lang.indexOf('vi') === 0; });
    if (!track && langCode === 'en') track = tracks.find(function(t) { return t.lang.indexOf('en') === 0; });
    if (!track) track = tracks.find(function(t) { return t.lang.indexOf(langCode) >= 0; });
    if (!track) track = tracks[0];
    if (!track) return { error: 'No matching track' };

    // Fetch captions
    var cues = await fetchCues(track.url, langCode);
    if (!cues || cues.length === 0) {
      cues = await fetchCues(track.url + '&tlang=' + langCode, track.lang + '->' + langCode);
    }
    if (!cues || cues.length === 0) return { error: 'Cannot fetch captions' };

    return { cues: cues, lang: track.lang, name: track.name };
  } catch (err) {
    return { error: err.message };
  }
}

/** Extract ytInitialPlayerResponse from page HTML */
function extractPlayerResponse(html) {
  var marker = 'ytInitialPlayerResponse = ';
  var idx = html.indexOf(marker);
  if (idx === -1) return null;
  var startIdx = idx + marker.length;
  var braceIdx = html.indexOf('{', startIdx);
  if (braceIdx === -1) return null;

  var depth = 0, endIdx = braceIdx;
  var maxLen = Math.min(html.length, braceIdx + 500000);
  for (var i = braceIdx; i < maxLen; i++) {
    var ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { endIdx = i + 1; break; }
    }
    if (ch === '"' || ch === '`') {
      var q = ch; i++;
      while (i < maxLen && html[i] !== q) {
        if (html[i] === '\\') i++;
        i++;
      }
    }
  }
  if (depth !== 0) return null;
  try { return JSON.parse(html.slice(braceIdx, endIdx)); }
  catch (e) { return null; }
}

/** Extract caption tracks from player response */
function extractCaptionTracks(data) {
  try {
    var tr = data.captions && data.captions.playerCaptionsTracklistRenderer && data.captions.playerCaptionsTracklistRenderer.captionTracks;
    if (!tr || !tr.length) return [];
    return tr.map(function(t) {
      return {
        url: t.baseUrl,
        lang: t.languageCode,
        name: (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || t.languageCode,
        kind: t.kind || 'standard',
        translatable: t.isTranslatable || false,
      };
    });
  } catch (e) { return []; }
}

/** Fetch and parse VTT captions */
async function fetchCues(baseUrl, label) {
  try {
    var resp = await fetch(baseUrl + '&fmt=vtt');
    if (!resp.ok) return null;
    return parseVTT(await resp.text());
  } catch (e) { return null; }
}

/** Parse VTT to cues */
function parseVTT(text) {
  if (!text) return [];
  var cues = [], lines = text.split('\n'), i = 0;
  while (i < lines.length && lines[i].indexOf('-->') === -1) i++;
  for (; i < lines.length; i++) {
    var line = lines[i].trim();
    var m = line.match(/([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (m) {
      var start = parseTime(m[1]), end = parseTime(m[2]);
      i++;
      var t = '';
      while (i < lines.length && lines[i].trim() !== '' && lines[i].indexOf('-->') === -1) {
        if (t) t += '\n';
        t += lines[i].trim();
        i++;
      }
      if (t && !isNaN(start) && !isNaN(end)) cues.push({ start: start, end: end, text: t });
      i--;
    }
  }
  return cues;
}

function parseTime(str) {
  if (!str) return 0;
  var parts = str.split(':');
  var sec = 0;
  if (parts.length === 3) sec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  else if (parts.length === 2) sec = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  else sec = parseFloat(parts[0]);
  return isNaN(sec) ? 0 : sec;
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'fetchCaptions') {
    (async function() {
      var result = await getYouTubeCaptions(request.videoId, request.langCode);
      sendResponse(result);
    })();
    return true; // async
  }
  if (request.type === 'getStorage') {
    chrome.storage.sync.get(request.keys, function(r) { sendResponse(r); });
    return true;
  }
  if (request.type === 'setStorage') {
    chrome.storage.sync.set(request.data, function() { sendResponse({ success: true }); });
    return true;
  }
  return false;
});

console.log('[DualSub] Background worker ready');

