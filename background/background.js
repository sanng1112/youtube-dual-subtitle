/**
 * DualSub v2 - Background Service Worker
 * HYBRID APPROACH:
 * Background: fetch YouTube page HTML → extract tracks → send to content script
 * Content script: fetch actual captions (same-origin with cookies)
 */
chrome.runtime.onInstalled.addListener(function(details) {
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

async function getTracksFromYouTube(videoId) {
  try {
    var resp = await fetch('https://www.youtube.com/watch?v=' + videoId);
    if (!resp.ok) return { error: 'HTTP ' + resp.status };
    var html = await resp.text();
    var data = extractPlayerResponse(html);

function extractPlayerResponse(html) {
  var marker = 'ytInitialPlayerResponse = ';
  var idx = html.indexOf(marker);
  if (idx === -1) return null;
  var braceIdx = html.indexOf('{', idx + marker.length);
  if (braceIdx === -1) return null;
  var depth = 0, endIdx = braceIdx;
  for (var i = braceIdx; i < html.length && i < braceIdx + 500000; i++) {
    var ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
    if (ch === '"' || ch === '`') { var q = ch; i++; while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++; } }
  }
  if (depth !== 0) return null;
  try { return JSON.parse(html.slice(braceIdx, endIdx)); } catch (e) { return null; }
}

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

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'fetchTracks') {
    (async function() {
      var result = await getTracksFromYouTube(request.videoId);
      sendResponse(result);
    })();
    return true;
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

    if (!data) return { error: 'No player response' };
    var tracks = extractCaptionTracks(data);
    if (!tracks || !tracks.length) return { error: 'No tracks' };
    return { tracks: tracks };
  } catch (e) { return { error: e.message }; }
}
