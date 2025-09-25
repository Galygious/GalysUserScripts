// ==UserScript==
// @name         YouTube Transcript → TXT (Button in Top Menu, TT-safe)
// @namespace    galy.transcript.ddhhmmss.menu
// @version      1.3
// @description  Adds a "Transcript → TXT" button into the video actions row (next to Like/Share). Exports transcript as {dd:hh:mm:ss} lines. Avoids innerHTML for Trusted Types.
// @author       You
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    "use strict";
      const DEBUG = true;
      const TAG = "%c[YT→TXT]";
      const TAG_STYLE = "background:#111;color:#0ff;padding:2px 4px;border-radius:3px";
      const log  = (...a) => DEBUG && console.log(TAG, TAG_STYLE, ...a);
      const warn = (...a) => DEBUG && console.warn(TAG, TAG_STYLE, ...a);
      const group = (label) => DEBUG && console.group(`%c—— START ${label} ——`, "color:#0ff");
      const groupEnd = (label) => DEBUG && console.groupEnd(`—— END ${label} ——`);
  
  
    const BTN_ID = "galy-transcript-to-txt-btn";
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  
    // ---------- time helpers
    function parseTimestampToSeconds(ts) {
      ts = (ts || "").replace(/\s+/g, "");
      const parts = ts.split(":").map(Number);
      if (parts.some(isNaN)) return 0;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];   // h:m:s
      if (parts.length === 2) return parts[0] * 60 + parts[1];                     // m:s
      return parts[0] || 0;                                                        // s
    }
    function pad2(n) { return String(n).padStart(2, "0"); }
    function formatDHMS(totalSeconds) {
      totalSeconds = Math.max(0, Math.floor(totalSeconds));
      const d = Math.floor(totalSeconds / 86400);
      totalSeconds %= 86400;
      const h = Math.floor(totalSeconds / 3600);
      totalSeconds %= 3600;
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `{${pad2(d)}:${pad2(h)}:${pad2(m)}:${pad2(s)}}`;
    }
  
    // ---------- transcript scraping
    function findTranscriptContainer() {
      return (
        document.querySelector("#segments-container") ||
        document.querySelector("ytd-transcript-segment-list-renderer")
      );
    }
   function collectSegments() {
    const label = "COLLECT SEGMENTS";
    group(label);
  
    const container = findTranscriptContainer();
    if (!container) {
      warn("Transcript container not found.");
      groupEnd(label);
      return [];
    }
  
    const segs = [];
    const seen = new Set();
  
    const renderers = container.querySelectorAll("ytd-transcript-segment-renderer");
    log("Using renderer mode =", renderers.length > 0, ", count =", renderers.length);
  
    const take = (ts, text) => {
      const key = `${ts}|${text}`;
      if (!ts && !text) return;
      if (seen.has(key)) return;
      seen.add(key);
      segs.push({ ts, text });
    };
  
    if (renderers.length) {
      renderers.forEach(r => {
        const ts = r.querySelector(".segment-timestamp")?.textContent?.trim() || "";
        const text = r.querySelector(".segment-text")?.textContent?.trim() || "";
        take(ts, text);
      });
      log("Unique segments after renderer scan =", segs.length);
      groupEnd(label);
      return segs;
    }
  
    const segments = container.querySelectorAll(".segment");
    log("Fallback .segment mode, count =", segments.length);
    segments.forEach(node => {
      const ts = node.querySelector(".segment-timestamp")?.textContent?.trim() || "";
      const text = node.querySelector(".segment-text")?.textContent?.trim() || "";
      take(ts, text);
    });
    log("Unique segments after fallback scan =", segs.length);
    groupEnd(label);
    return segs;
  }
  
  
    function buildTxt(segs) {
      return segs.map(({ ts, text }) => `${formatDHMS(parseTimestampToSeconds(ts))} ${text}`).join("\n");
    }
    function getVideoTitleSafe() {
      const t =
        document.querySelector("h1.ytd-watch-metadata")?.textContent?.trim() ||
        document.title.replace(/ - YouTube$/, "");
      return (t || "youtube_transcript").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
    }
    function downloadTxt(filename, content) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    async function ensureLazySegmentsRendered() {
      const c = findTranscriptContainer();
      if (!c) return;
      c.scrollTop = 0;
      for (let i = 0; i < 3; i++) {
        c.scrollTop = c.scrollHeight;
        await sleep(120);
      }
    }
  async function onDownloadClick() {
    const label = "DOWNLOAD RUN";
    group(label);
    try {
      log("Step 1, ensureTranscriptOpen()");
      const opened = await ensureTranscriptOpen();
      log("Transcript open =", opened);
      if (!opened) {
        warn("Could not open transcript automatically. Ask user to open once.");
        alert("Couldn't open the transcript automatically. Open it once, then click again.");
        return;
      }
  
      log("Step 2, ensureTranscriptEnglish()");
      const enSet = await ensureTranscriptEnglish();
      log("English set =", enSet);
  
      log("Step 3, ensureLazySegmentsRendered()");
      await ensureLazySegmentsRendered();
  
      log("Step 4, collectSegments()");
      const segs = collectSegments();
      log("Segments collected =", segs.length);
      if (!segs.length) {
        warn("No transcript segments found.");
        alert("No transcript segments found.");
        return;
      }
  
      log("Step 5, build and download");
      const txt = buildTxt(segs);
      const title = getVideoTitleSafe();
      downloadTxt(`${title} - transcript`, txt);
      log("Download triggered.");
    } catch (e) {
      warn("Unhandled error:", e);
      alert("Unexpected error, see console for details.");
    } finally {
      groupEnd(label);
    }
  }
  
  
  
    // ---------- TT-safe icon builder (no innerHTML)
    function buildDocIcon() {
      const wrap = document.createElement("span");
      wrap.className = "ytIconWrapperHost";
      wrap.style.width = "24px";
      wrap.style.height = "24px";
  
      const shape = document.createElement("span");
      shape.className = "yt-icon-shape ytSpecIconShapeHost";
      wrap.appendChild(shape);
  
      const div = document.createElement("div");
      div.style.width = "100%";
      div.style.height = "100%";
      div.style.display = "block";
      div.style.fill = "currentcolor";
      shape.appendChild(div);
  
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
  
      const path = document.createElementNS(ns, "path");
      // simple "document" icon
      path.setAttribute("d",
        "M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5zM7 11h10v2H7v-2zm0 4h10v2H7v-2zM7 7h4v2H7V7z"
      );
      svg.appendChild(path);
      div.appendChild(svg);
      return wrap;
    }
  
    // ---------- UI injection in top action buttons
    function createMenuButton() {
      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.className =
        "yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.gap = "6px";
      btn.title = "Export transcript as TXT";
      btn.setAttribute("aria-label", "Export transcript as TXT");
  
      const icon = buildDocIcon();
      const label = document.createElement("div");
      label.className = "yt-spec-button-shape-next__button-text-content";
      label.textContent = "Transcript → TXT";
  
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener("click", onDownloadClick);
      return btn;
    }
  
    function findTopButtonsRow() {
      return (
        document.querySelector("ytd-watch-metadata ytd-menu-renderer #top-level-buttons-computed") ||
        document.querySelector("ytd-watch-metadata ytd-menu-renderer .top-level-buttons")
      );
    }
  
    function injectIntoMenu() {
      if (document.getElementById(BTN_ID)) return;
      const row = findTopButtonsRow();
      if (!row) return;
      const btn = createMenuButton();
      row.appendChild(btn);
    }
  async function ensureTranscriptOpen() {
    const label = "ENSURE TRANSCRIPT OPEN";
    group(label);
  
    if (findTranscriptContainer()) {
      log("Already open.");
      groupEnd(label);
      return true;
    }
  
    const btn = document.querySelector(
      'ytd-video-description-transcript-section-renderer ytd-button-renderer button[aria-label*="transcript" i], ' +
      'ytd-video-description-transcript-section-renderer ytd-button-renderer button'
    );
    log("CTA button found =", !!btn, btn);
  
    if (!btn) {
      warn("CTA not found.");
      groupEnd(label);
      return false;
    }
  
    btn.click();
    log("Clicked CTA, waiting for container…");
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      if (findTranscriptContainer()) {
        log("Transcript container detected.");
        groupEnd(label);
        return true;
      }
    }
    warn("Timed out waiting for transcript container.");
    groupEnd(label);
    return false;
  }
  
  async function ensureTranscriptEnglish() {
  console.groupCollapsed("%c— START ENSURE ENGLISH —", "color:#00c2ff;font-weight:700");

  // 0) Find footer + current label - with more diagnostic info
  console.log("[YT-TXT] Looking for transcript footer...");
  const footer = document.querySelector("ytd-transcript-search-panel-renderer ytd-transcript-footer-renderer");
  console.log("[YT-TXT] Footer present =", !!footer, footer || null);
  
  if (!footer) {
    // Try alternative selectors
    const altFooter = document.querySelector("ytd-transcript-footer-renderer");
    console.log("[YT-TXT] Alternative footer =", !!altFooter, altFooter || null);
    console.warn("[YT-TXT] No footer found, aborting."); 
    console.groupEnd(); 
    return false; 
  }

  const labelEl = footer?.querySelector("yt-dropdown-menu #label-text");
  const labelNow = labelEl?.textContent?.trim() || "";
  console.log("[YT-TXT] Label element =", !!labelEl, labelEl || null);
  console.log("[YT-TXT] Current label =", JSON.stringify(labelNow));
  
  if (/english/i.test(labelNow)) { 
    console.log("[YT-TXT] Already English, done."); 
    console.groupEnd(); 
    return true; 
  }

  // Strategy 1: Try the hidden list first (this is what actually works)
  const hiddenList = footer.querySelector("tp-yt-iron-dropdown tp-yt-paper-listbox");
  console.log("[YT-TXT] Strategy 1, hidden list present =", !!hiddenList, hiddenList || null);
  if (hiddenList) {
    const ok = await tryClickEnglishOption(hiddenList);
    if (ok) {
      // wait for label update
      for (let i = 0; i < 40; i++) {
        const t = labelEl?.textContent?.trim().toLowerCase() || "";
        if (t.includes("english")) { console.log("[YT-TXT] Strategy 1 worked!"); console.groupEnd(); return true; }
        await sleep(75);
      }
    }
  }

  // Strategy 2: Fallback - try to open dropdown normally (rarely works but worth one quick try)
  const triggerBtn = footer.querySelector('yt-dropdown-menu tp-yt-paper-menu-button #label');
  console.log("[YT-TXT] Strategy 2, trying to open dropdown normally...");
  if (triggerBtn) {
    ["pointerdown","mousedown","mouseup","click"].forEach(type => {
      triggerBtn.dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, view:window }));
    });
    
    // Quick check for visible dropdown
    let listbox = null;
    for (let i = 0; i < 10; i++) { // reduced from 40 to 10 for speed
      listbox = document.querySelector('tp-yt-iron-dropdown[aria-hidden="false"] tp-yt-paper-listbox');
      if (listbox) break;
      await sleep(50); // reduced from 75 to 50
    }
    
    if (listbox) {
      console.log("[YT-TXT] Strategy 2 worked!");
      return await pickEnglish(listbox, labelEl);
    }
  }

  console.warn("[YT-TXT] Dropdown never opened, language not changed.");
  console.groupEnd();
  return false;
}

// Pick English from a *visible* listbox, then wait for label update
async function pickEnglish(listbox, labelEl) {
  const ok = await tryClickEnglishOption(listbox);
  if (!ok) { console.warn("[YT-TXT] No English option found."); return false; }
  // wait for label to change
  for (let i = 0; i < 40; i++) {
    const txt = labelEl?.textContent?.trim().toLowerCase() || "";
    if (txt.includes("english")) { console.log("[YT-TXT] Label updated →", txt); return true; }
    await sleep(75);
  }
  console.warn("[YT-TXT] Clicked English, label did not update.");
  return false;
}

// Find the best English item and click, with clear logging
async function tryClickEnglishOption(root) {
  const options = Array.from(root.querySelectorAll("a, tp-yt-paper-item, tp-yt-paper-item-body, [role='option']"));
  const getText = el => (el.textContent || "").trim();
  const plain = options.find(el => /^english\s*$/i.test(getText(el)));
  const anyEn = options.find(el => /english/i.test(getText(el)));
  const target = plain || anyEn;
  console.log("[YT-TXT] English option candidate =", target ? getText(target) : null, target || null);
  if (!target) return false;

  target.scrollIntoView({ block:"nearest" });
  const clickable = target.matches("a") ? target : (target.querySelector("a") || target);

  ["pointerdown","mousedown","mouseup","click"].forEach(type => {
    clickable.dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, view:window }));
  });
  clickable.click();
  console.log("[YT-TXT] English option clicked.");
  await sleep(100);
  return true;
}
  
  
    // ---------- observe SPA/nav and DOM changes
    const docObserver = new MutationObserver(() => injectIntoMenu());
    docObserver.observe(document.documentElement, { childList: true, subtree: true });
  
    window.addEventListener("yt-navigate-finish", () => setTimeout(injectIntoMenu, 400));
    window.addEventListener("yt-page-data-updated", () => setTimeout(injectIntoMenu, 400));
  
    // First pass
    setTimeout(injectIntoMenu, 800);
  })();
  