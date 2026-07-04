/** DualSub v2 Popup */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  let st = null, se = {};

  async function msg(t, p) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw Error("No tab");
    return new Promise((res, rej) => {
      chrome.tabs.sendMessage(tab.id, { type: t, payload: p }, r => {
        if (chrome.runtime.lastError) rej(Error(chrome.runtime.lastError.message));
        else res(r);
      });
    });
  }

  function upStatus(rd, en, pc, sc) {
    const d = $("#statusDot"), t = $("#statusText");
    if (!en) { d.className = "status-dot"; t.textContent = "Da tat"; return; }
    if (rd) { d.className = "status-dot active"; t.textContent = "San sang \u2022 " + (pc + sc) + " phu de"; }
    else { d.className = "status-dot loading"; t.textContent = "Dang tai phu de..."; }
  }

  function upInfo(pc, sc, rd) {
    $("#primaryCount").textContent = pc || 0;
    $("#secondaryCount").textContent = sc || 0;
    $("#readyState").textContent = rd ? "San sang" : "Dang tai...";
  }

  function upTracks(tr) {
    if (!tr || !tr.length) return;
    const ps = $("#primaryLang"), ss = $("#secondaryLang");
    tr.forEach(t => {
      const c = t.languageCode;
      let ex = false;
      for (let i = 0; i < ps.options.length; i++) { if (ps.options[i].value === c) { ex = true; break; } }
      if (!ex) {
        const n = t.name || c;
        [ps, ss].forEach(s => { const o = document.createElement("option"); o.value = c; o.textContent = n + " (" + c + ")"; s.appendChild(o); });
      }
    });
  }

  function setupEL() {
    $("#toggleEnabled").addEventListener("change", async e => {
      const en = e.target.checked;
      try { await msg("setEnabled", { enabled: en }); if (st) { st.enabled = en; upStatus(st.isReady, en, st.primaryCount, st.secondaryCount); } } catch (e) { }
    });
    $("#primaryLang").addEventListener("change", applyLP);
    $("#secondaryLang").addEventListener("change", applyLP);
    $("#positionSelect").addEventListener("change", async e => { try { await msg("setPosition", { position: e.target.value }); } catch (e) { } });
    $("#fontSizeRange").addEventListener("input", async e => { const s = parseInt(e.target.value); $("#fontSizeLabel").textContent = s; try { await msg("setFontSize", { fontSize: s }); } catch (e) { } });

    // Timing
    $("#timingSlider").addEventListener("input", async e => { const v = parseFloat(e.target.value); $("#timingLabel").textContent = v.toFixed(1); try { await msg("setTimingOffset", { offset: v }); } catch (e) { } });
    $("#btnTimingMinus").addEventListener("click", () => adjT(-0.5));
    $("#btnTimingPlus").addEventListener("click", () => adjT(0.5));
    $("#btnTimingReset").addEventListener("click", () => adjT(0, true));

    // Highlight
    $("#highlightToggle").addEventListener("change", async e => { try { await msg("setHighlightEnabled", { enabled: e.target.checked, level: $("#highlightLevel").value }); } catch (e) { } });
    $("#highlightLevel").addEventListener("change", async () => { try { await msg("setHighlightEnabled", { enabled: $("#highlightToggle").checked, level: $("#highlightLevel").value }); } catch (e) { } });

    // Transcript
    $("#btnTranscript").addEventListener("click", async () => {
      try { await msg("transcriptToggle"); const b = $("#btnTranscript"); b.textContent = b.textContent === "Mo Transcript" ? "Dong Transcript" : "Mo Transcript"; } catch (e) { }
    });

    // Export
    $("#btnExportCSV").addEventListener("click", () => exp("csv"));
    $("#btnExportAnki").addEventListener("click", () => exp("anki"));

    $("#btnReload").addEventListener("click", async () => {
      const b = $("#btnReload"); b.textContent = "Dang tai..."; b.disabled = true;
      try { await msg("reloadSubtitles"); await refresh(); } catch (e) { }
      finally { b.textContent = "Tai lai phu de"; b.disabled = false; }
    });
    $("#helpLink").addEventListener("click", e => { e.preventDefault(); chrome.tabs.create({ url: "https://github.com/sanng1112/youtube-dual-subtitle" }); });
  }

  async function adjT(d, reset) {
    const s = $("#timingSlider");
    const v = reset ? 0 : Math.max(-10, Math.min(10, parseFloat(s.value) + d));
    s.value = v; $("#timingLabel").textContent = v.toFixed(1);
    try { await msg("setTimingOffset", { offset: v }); } catch (e) { }
  }

  async function exp(fmt) {
    try {
      const r = await msg("exportVocabulary", { format: fmt });
      if (!r || !r.success || !r.data) { alert("Chua co tu vung. Hay click vao tu trong phu de de them."); return; }
      const ext = fmt === "anki" ? "txt" : "csv";
      const b = new Blob([r.data], { type: "text/plain" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a"); a.href = u; a.download = "dualsub_vocabulary." + ext; a.click(); URL.revokeObjectURL(u);
    } catch (e) { alert("Loi: " + e.message); }
  }


  async function applyLP() {
    try {
      await msg("setLanguagePair", {
        primaryLang: $("#primaryLang").value,
        secondaryLang: $("#secondaryLang").value,
        primaryLabel: $("#primaryLang option:checked").textContent,
        secondaryLabel: $("#secondaryLang option:checked").textContent
      });
      chrome.storage.sync.set({ dualsubLangPair: { primaryLang: $("#primaryLang").value, secondaryLang: $("#secondaryLang").value } });
      await refresh();
    } catch (e) { }
  }

  async function refresh() {
    try {
      st = await msg("getStatus");
      if (!st) return;
      const s = st; se = s.settings || {};
      upStatus(s.isReady, s.enabled, s.primaryCount, s.secondaryCount);
      upInfo(s.primaryCount, s.secondaryCount, s.isReady);
      upTracks(s.availableTracks);
      $("#toggleEnabled").checked = s.enabled;
      if (s.primaryLang) $("#primaryLang").value = s.primaryLang;
      if (s.secondaryLang) $("#secondaryLang").value = s.secondaryLang;
      if (se.position) $("#positionSelect").value = se.position;
      if (se.fontSize) { $("#fontSizeRange").value = se.fontSize; $("#fontSizeLabel").textContent = se.fontSize; }
      if (se.timingOffset !== undefined) { $("#timingSlider").value = se.timingOffset; $("#timingLabel").textContent = se.timingOffset.toFixed(1); }
      if (se.highlightEnabled !== undefined) $("#highlightToggle").checked = se.highlightEnabled;
      if (se.highlightLevel) $("#highlightLevel").value = se.highlightLevel;
      try { const v = await msg("exportVocabulary", { format: "csv" }); if (v && v.count !== undefined) $("#vocabCount").textContent = v.count; } catch (e) { }
    } catch (e) {
      $("#statusDot").className = "status-dot";
      $("#statusText").textContent = "\u26a0 Khong the ket noi - Tai lai trang YouTube";
    }
  }

  document.addEventListener("DOMContentLoaded", () => { setupEL(); refresh(); });
})();

