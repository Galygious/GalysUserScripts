// ==UserScript==
// @name         Olamovies → Add to GalyLibrary (Sequenced & Safe)
// @namespace    galy.olamovies
// @version      2.9.4
// @description  Adds "Add to GalyLibrary" button
// @match        *://olamovies.watch/*
// @match        *://*.olamovies.watch/*
// @match        *://olamovies.blog/*
// @match        *://*.olamovies.download/*
// @match        *://drive.olamovies.download/*
// @match        *://*.ol-am.top/*
// @match        *://*.bellofjob.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_cookie
// @connect      127.0.0.1
// @connect      localhost
// @connect      192.168.68.95
// @connect      192.168.71.103
// ==/UserScript==


(function() {
  "use strict";

  // Unified download backend selector
  const DOWNLOAD_BACKEND = "aria"; // or "xdm"
  // Auto-close behavior after successful handoff
  const AUTO_CLOSE = true; // set to false to keep tabs open

  // Unified send function
  async function sendUrl(url, filename = null) {
    try {
      console.log("📤 Sending to backend", { backend: DOWNLOAD_BACKEND, url, filename });
      if (DOWNLOAD_BACKEND === "aria") {
        return await sendUrlToAria(url, filename);
      } else {
        return await sendUrlToXDM(url, filename);
      }
    } catch (e) {
      console.log("❌ sendUrl error", { backend: DOWNLOAD_BACKEND, message: e?.message || String(e) });
      return false;
    }
  }

  // De-duplication: prevent re-sending the same URL repeatedly
  function getSentMap() {
    try { return JSON.parse(localStorage.getItem('galySentToBackend') || '{}'); } catch (_) { return {}; }
  }
  function saveSentMap(map) {
    try { localStorage.setItem('galySentToBackend', JSON.stringify(map)); } catch (_) {}
  }
  function hasRecentlySent(url, ttlMs = 10 * 60 * 1000) {
    try {
      const map = getSentMap();
      const ts = map[url];
      return typeof ts === 'number' && (Date.now() - ts) < ttlMs;
    } catch (_) { return false; }
  }
  function markSent(url) {
    try {
      const map = getSentMap();
      map[url] = Date.now();
      saveSentMap(map);
    } catch (_) {}
  }

  // Toggle helper for localStorage-driven flags
  function galyFlag(key, defaultValue = 'true') {
    try {
      const raw = (localStorage.getItem(key) ?? defaultValue) + '';
      return /^(1|true|yes)$/i.test(raw.trim());
    } catch (_) {
      return /^(1|true|yes)$/i.test((defaultValue + '').trim());
    }
  }

  // Random delay
  function sleep(min = 1200, max = 2500) {
    return new Promise(res => setTimeout(res, min + Math.random() * (max - min)));
  }

  // Debug: install programmatic DOM breakpoints to pause when target button/link is inserted
  (function installDomBreakpointsIfEnabled() {
    try {
      const enabled = galyFlag('galyBreakOnCloudButton', 'false');
      if (!enabled || window.__galyDomBreakpointsInstalled) return;
      window.__galyDomBreakpointsInstalled = true;
      const onlyDetails = galyFlag('galyBreakpointOnlyDetails', 'true');
      const includeFinalLinks = galyFlag('galyBreakOnFinalLinks', 'false');

      const isTargetElement = (el) => {
        try {
          if (!el || el.nodeType !== 1) return false;
          const tag = el.tagName;
          const text = (el.textContent || '').toLowerCase();
          const href = (el.getAttribute && el.getAttribute('href')) || '';

          // Step 2: specifically target the cloud download button inside #details
          const isButtonLike = tag === 'BUTTON' || el.getAttribute('role') === 'button' || el.matches?.("button, a, div[role='button']");
          const hasStep2Text = /(\bstart cloud download\b|\bcloud download\b|\bdirect cloud link\b)/i.test(text);
          const hasCloudIcon = !!el.querySelector?.('svg.lucide-cloud-upload, svg.lucide-cloud-check, svg.lucide-cloud-download');
          const inDetails = !!(el.closest && el.closest('#details'));
          if (inDetails && isButtonLike && (hasStep2Text || hasCloudIcon)) return true;

          // Optional: include final links if explicitly enabled
          if (includeFinalLinks && tag === 'A' && href && /(downloading-from-olamovies|bellofjob\.com|secret=)/i.test(href)) return true;

          return false;
        } catch (_) { return false; }
      };

      const isWithinDetailsSubtree = (parent) => {
        try {
          if (!onlyDetails) return true;
          if (!parent) return false;
          if (parent.nodeType === 1 && (parent.id === 'details' || parent.closest?.('#details'))) return true;
          return false;
        } catch (_) { return false; }
      };

      const nodeTreeContainsTarget = (node, parent) => {
        try {
          if (!node) return false;
          if (node.nodeType === 1) {
            if (!isWithinDetailsSubtree(parent || node.parentNode || node)) return false;
            if (isTargetElement(node)) return true;
            const all = node.querySelectorAll?.("a[href], button, [role='button'], svg.lucide-cloud-upload, svg.lucide-cloud-check, svg.lucide-cloud-download");
            if (!all) return false;
            for (const el of all) { if (isTargetElement(el)) return true; }
            return false;
          }
          if (node.nodeType === 11) { // DocumentFragment
            const all = node.querySelectorAll ? node.querySelectorAll('*') : [];
            for (const el of all) { if (isTargetElement(el)) return true; }
            return false;
          }
          return false;
        } catch (_) { return false; }
      };

      const originals = {
        appendChild: Node.prototype.appendChild,
        insertBefore: Node.prototype.insertBefore,
        replaceChild: Node.prototype.replaceChild,
        setAttribute: Element.prototype.setAttribute
      };

      const markAndMaybeBreak = (api, parent, node) => {
        try {
          if (!nodeTreeContainsTarget(node, parent)) return;
          try { if (node && node.style) node.style.outline = '2px solid red'; } catch (_) {}
          const sample = (node.outerHTML || '').slice(0, 300);
          console.log(`⛔ Breakpoint hit (${api}) while adding Step2 Cloud button/link`, { parent, node, sample });
          debugger;
        } catch (_) {}
      };

      Node.prototype.appendChild = function(child) {
        markAndMaybeBreak('appendChild', this, child);
        return originals.appendChild.call(this, child);
      };

      Node.prototype.insertBefore = function(newNode, referenceNode) {
        markAndMaybeBreak('insertBefore', this, newNode);
        return originals.insertBefore.call(this, newNode, referenceNode);
      };

      Node.prototype.replaceChild = function(newChild, oldChild) {
        markAndMaybeBreak('replaceChild', this, newChild);
        return originals.replaceChild.call(this, newChild, oldChild);
      };

      Element.prototype.setAttribute = function(name, value) {
        const result = originals.setAttribute.call(this, name, value);
        try {
          if ((name === 'class' || name === 'role' || name === 'href') && isWithinDetailsSubtree(this.parentNode || this)) {
            markAndMaybeBreak('setAttribute', this.parentNode || this, this);
          }
        } catch (_) {}
        return result;
      };

      // Allow restoring via console
      window.__galyRestoreDomBreakpoints = function() {
        try {
          Node.prototype.appendChild = originals.appendChild;
          Node.prototype.insertBefore = originals.insertBefore;
          Node.prototype.replaceChild = originals.replaceChild;
          Element.prototype.setAttribute = originals.setAttribute;
          window.__galyDomBreakpointsInstalled = false;
          console.log('🧹 DOM breakpoints restored to originals');
        } catch (_) {}
      };

      console.log('🧨 DOM breakpoints installed for Step2 Cloud button in #details (toggle: galyBreakOnCloudButton). Set galyBreakOnFinalLinks=true to include final links.');
    } catch (e) {
      console.log('⚠️ Failed to install DOM breakpoints:', e.message);
    }
  })();

  // Debug: generic subtree-modification breakpoint using MutationObserver
  (function installSubtreeMutationBreakpointIfEnabled() {
    try {
      const enabled = galyFlag('galyBreakOnSubtree', 'false');
      if (!enabled || window.__galySubtreeBreakpointInstalled) return;
      window.__galySubtreeBreakpointInstalled = true;

      const selector = (localStorage.getItem('galySubtreeSelector') || '#details').trim();
      const textFilterRaw = (localStorage.getItem('galySubtreeTextFilter') || '').trim();
      let textFilter = null;
      try { if (textFilterRaw) textFilter = new RegExp(textFilterRaw, 'i'); } catch (_) {}

      let observer = null;
      const attach = (container) => {
        if (!container || observer) return;
        try { container.style.outline = '2px dashed orange'; } catch (_) {}
        observer = new MutationObserver((mutations) => {
          try {
            for (const m of mutations) {
              // If text filter present, require a match in added/changed subtree
              if (textFilter) {
                let hay = '';
                try {
                  if (m.type === 'attributes') hay = (m.target.outerHTML || '') + ' ' + (m.attributeName || '');
                  else if (m.type === 'characterData') hay = (m.target.textContent || '');
                  else if (m.type === 'childList') {
                    const parts = [];
                    m.addedNodes && m.addedNodes.forEach(n => { try { parts.push(n.outerHTML || n.textContent || ''); } catch (_) {} });
                    hay = parts.join(' ');
                  }
                } catch (_) {}
                if (hay && textFilter.test(hay)) {
                  console.log('⛔ Subtree mutation breakpoint hit (filtered)', { selector, type: m.type, attribute: m.attributeName, added: m.addedNodes?.length || 0 });
                  debugger;
                  observer.disconnect();
                  return;
                }
              } else {
                // No filter: break on first meaningful change
                const added = (m.addedNodes && m.addedNodes.length) || 0;
                if (m.type === 'childList' && added > 0) {
                  console.log('⛔ Subtree mutation breakpoint hit (childList)', { selector, added });
                  debugger;
                  observer.disconnect();
                  return;
                }
                if (m.type === 'attributes') {
                  console.log('⛔ Subtree mutation breakpoint hit (attributes)', { selector, attribute: m.attributeName });
                  debugger;
                  observer.disconnect();
                  return;
                }
                if (m.type === 'characterData') {
                  console.log('⛔ Subtree mutation breakpoint hit (characterData)', { selector });
                  debugger;
                  observer.disconnect();
                  return;
                }
              }
            }
          } catch (_) {}
        });
        observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
        console.log('🧭 Subtree mutation breakpoint armed on', selector, textFilter ? `(filter: ${textFilter})` : '');
        window.__galyRearmSubtreeBreakpoint = function() {
          try { observer && observer.disconnect(); } catch (_) {}
          observer = null;
          attach(container);
        };
      };

      // Try to attach now and also poll briefly in case container is rendered later
      const tryAttach = () => {
        const node = document.querySelector(selector);
        if (node) { attach(node); return true; }
        return false;
      };
      if (!tryAttach()) {
        let attempts = 0;
        const iv = setInterval(() => {
          attempts++;
          if (tryAttach() || attempts > 40) clearInterval(iv);
        }, 250);
      }
    } catch (e) {
      console.log('⚠️ Failed to install subtree mutation breakpoint:', e.message);
    }
  })();

  // Prefer opening in a popup window when enabled via localStorage
  function openWindowPreferPopup(url, opts = {}) {
     try {
       const lc = (localStorage.getItem('galyOpenInWindow') || 'false').toLowerCase();
       const enabled = (lc === 'true' || lc === '1' || lc === 'yes');
       const keepOpener = !!opts.keepOpener || galyFlag('galyKeepOpener', 'true');
       if (!enabled) return window.open(url, "_blank", keepOpener ? undefined : undefined);
       const width = parseInt(localStorage.getItem('galyPopupWidth') || '1100', 10);
       const height = parseInt(localStorage.getItem('galyPopupHeight') || '800', 10);
       const left = Math.max(0, Math.floor(((screen.availWidth || screen.width || 0) - width) / 2));
       const top = Math.max(0, Math.floor(((screen.availHeight || screen.height || 0) - height) / 2));
       // Keep opener alive for queued windows if requested; omit noopener/noreferrer
       const base = `toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=${width},height=${height},left=${left},top=${top}`;
       const features = keepOpener ? base : `noopener,noreferrer,${base}`;
       return window.open(url, "_blank", features);
     } catch (_) {
       return window.open(url, "_blank", opts.keepOpener ? undefined : undefined);
     }
   }

  // Popunder: open child window then push it behind by refocusing parent
  function openWindowPopunder(url, opts = {}) {
    try {
      const w = openWindowPreferPopup(url, { ...opts, keepOpener: true });
      if (!w) return w;
      const juggle = () => {
        try { w.blur?.(); } catch (_) {}
        try { window.focus?.(); } catch (_) {}
        try { document.body?.focus?.(); } catch (_) {}
      };
      juggle();
      setTimeout(juggle, 0);
      setTimeout(juggle, 60);
      setTimeout(() => { try { w.blur?.(); } catch (_) {} }, 120);
      // Optional bait tab trick
      try {
        if (galyFlag('galyPopunderBait', 'false')) {
          const bait = window.open('about:blank', '_blank', 'width=10,height=10');
          if (bait) {
            try { bait.blur?.(); } catch (_) {}
            try { bait.close?.(); } catch (_) {}
            juggle();
          }
        }
      } catch (_) {}
      return w;
    } catch (_) {
      return openWindowPreferPopup(url, { ...opts, keepOpener: true });
    }
  }

  // Safe click with human-like delay
  async function humanClick(el) {
    console.log("🖱️ humanClick called for element:", el?.tagName, el?.textContent?.trim());
    console.log("Element details:", {
      visible: el?.offsetParent !== null,
      alreadyDone: el?.dataset?.galyDone,
      href: el?.href,
      tagName: el?.tagName
    });

    if (!el) {
      console.log("❌ humanClick aborted:", {
        noElement: true,
        alreadyDone: undefined,
        notVisible: true
      });
      return false;
    }

    // Allow re-clicking even if previously marked as done
    if (el.dataset && el.dataset.galyDone) {
      console.log("♻️ Re-clicking element previously marked done; clearing flag");
      try { delete el.dataset.galyDone; } catch (_) {}
    }

    el.dataset.galyDone = "1";
    console.log("✅ Marking element as done, scrolling into view");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep();

    // Try to dispatch synthetic mouse events, but handle errors gracefully
    try {
      ["mousedown","mouseup","click"].forEach(type => {
        try {
          const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: null // Use null instead of window to avoid context issues
          });
          el.dispatchEvent(event);
        } catch (eventError) {
          console.log(`Failed to dispatch ${type} event:`, eventError);
        }
      });
    } catch (mouseError) {
      console.log("Mouse event dispatch failed:", mouseError);
    }

    // Always try the native click method as primary approach
    console.log("🎯 Attempting native click method");
    try {
      if (typeof el.click === "function") {
        el.click();
        console.log("✅ Used native click method successfully");
        return true;
      } else {
        console.log("❌ Element doesn't have click method");
      }
    } catch (clickError) {
      console.log("❌ Native click failed:", clickError);
    }

    // Fallback for anchor elements
    if (el.tagName === "A" && el.href) {
      console.log("🔗 Attempting navigation fallback for anchor");
      try {
        if (el.target === "_blank") {
          console.log("Opening via helper to preserve opener:", el.href);
          const usePopunder = galyFlag('galyOpenPopunder', 'false');
          if (usePopunder) {
            openWindowPopunder(el.href, { keepOpener: true });
          } else {
            openWindowPreferPopup(el.href, { keepOpener: true });
          }
        } else {
          console.log("Navigating to:", el.href);
          window.location.href = el.href;
        }
        console.log("✅ Used window navigation fallback");
    return true;
      } catch (navError) {
        console.log("❌ Navigation fallback failed:", navError);
      }
    }

    console.log("❌ All click methods failed for:", el?.tagName, el?.textContent?.trim());
    return false;
  }

  // Add a reset button for the queue system
  function addResetButton() {
    if (document.querySelector("#galy-reset-btn")) return; // Already added

    const container = document.createElement("div");
    container.id = "galy-controls";
    container.style.cssText = "position:fixed;top:10px;left:10px;z-index:10000;background:#f5f5f5;border:1px solid #ccc;border-radius:8px;padding:8px;display:flex;gap:8px;align-items:center;font-family:Arial,sans-serif;font-size:12px;";

    const statusSpan = document.createElement("span");
    statusSpan.id = "galy-status";
    statusSpan.textContent = "Galy Queue: Loading...";
    statusSpan.style.cssText = "color:#333;";

    const resetBtn = document.createElement("button");
    resetBtn.id = "galy-reset-btn";
    resetBtn.textContent = "🔄 Reset";
    resetBtn.style.cssText = "padding:4px 8px;border-radius:4px;background:#ff9800;color:white;font-weight:bold;cursor:pointer;border:none;";
    resetBtn.title = "Reset the processing queue if it's stuck";

    container.appendChild(statusSpan);
    container.appendChild(resetBtn);

    // Insert at the top of the page
    const body = document.body;
    body.insertBefore(container, body.firstChild);

    // Add a force process button for debugging
    const forceBtn = document.createElement("button");
    forceBtn.textContent = "⚡ Force Process";
    forceBtn.style.cssText = "padding:4px 8px;border-radius:4px;background:#2196F3;color:white;font-weight:bold;cursor:pointer;border:none;margin-left:8px;";
    forceBtn.title = "Force process queue (debug)";
    forceBtn.addEventListener("click", () => {
      console.log("🔧 Force processing triggered");
      downloadManager.processQueueIfNeeded();
    });
    container.appendChild(forceBtn);

    resetBtn.addEventListener("click", e => {
      e.preventDefault();
      console.log("Resetting Galy download system");

      try {
        // Clear all download data
        localStorage.removeItem("galyDownloads");
        localStorage.removeItem("galyProcessing");
        localStorage.removeItem("galyQueue");
        localStorage.removeItem("galyStage1Complete");

        // Reinitialize the download manager
        downloadManager.initStorage();

        updateStatusDisplay();
        console.log("✅ Download system reset");
        alert("Download system reset! You can now start fresh.");
      } catch (err) {
        console.error("Failed to reset:", err);
        alert("Failed to reset download system");
      }
    });

    // Update status initially and periodically
    updateStatusDisplay();
    setInterval(updateStatusDisplay, 2000);
  }

  function updateStatusDisplay() {
    const statusSpan = document.getElementById("galy-status");
    if (!statusSpan) return;

    try {
      const stats = downloadManager.getStats();

      let status = `Total: ${stats.total} | Queue: ${stats.queued}`;
      if (stats.processing > 0) {
        status += " (Processing)";
        statusSpan.style.color = "#4caf50";
      } else {
        status += " (Idle)";
        statusSpan.style.color = "#666";
      }

      if (stats.errors > 0) {
        status += ` | Errors: ${stats.errors}`;
        statusSpan.style.color = "#ff9800";
      }

      if (stats.queued > 10) {
        status += " ⚠️";
        statusSpan.style.color = "#ff9800";
      }

      statusSpan.textContent = status;
    } catch (err) {
      console.error("Error updating status display:", err);
      statusSpan.textContent = "Status: Error";
      statusSpan.style.color = "#f44336";
    }
  }

  // Context guard: only run cloud-page logic inside OMDrive file pages
  function isCloudContext() {
    try {
      return (
        (location.hostname.endsWith('olamovies.download') && location.pathname.startsWith('/file/')) ||
        !!document.querySelector('#details')
      );
    } catch (_) { return false; }
  }

  // Auto-close policy
  function shouldAutoClose() {
    try {
      const enabled = !!AUTO_CLOSE;
      const firstVisibleAt = window.__galyFirstVisibleAt || 0;
      const minVisibleOk = firstVisibleAt && (Date.now() - firstVisibleAt > 5000);
      return enabled && minVisibleOk;
    } catch (_) { return false; }
  }

  // Capture mode to discover producer endpoints
  function setCaptureMode(durationMs = 10000) {
    try {
      window.__galyCaptureUntil = Date.now() + durationMs;
      localStorage.setItem('galyCloudProducerCandidates', JSON.stringify([]));
      setTimeout(() => {
        try {
          const raw = localStorage.getItem('galyCloudProducerCandidates');
          const list = raw ? JSON.parse(raw) : [];
          if (list.length) {
            console.log('🧭 Producer candidates:', list);
          } else {
            console.log('🧭 No producer candidates captured in window');
          }
        } catch (_) {}
      }, durationMs + 1000);
    } catch (_) {}
  }

  function addProducerCandidate(entry) {
    try {
      const until = window.__galyCaptureUntil || 0;
      if (Date.now() > until) return;
      const raw = localStorage.getItem('galyCloudProducerCandidates');
      const list = raw ? JSON.parse(raw) : [];
      list.push(entry);
      while (list.length > 30) list.shift();
      localStorage.setItem('galyCloudProducerCandidates', JSON.stringify(list));
    } catch (_) {}
  }

  // Shared guard to avoid duplicate handoffs
  let galyFinalLinkHandled = false;

  async function handleFoundDownloadUrl(url, context = 'observer') {
    try {
      if (galyFinalLinkHandled) return true;
      galyFinalLinkHandled = true;
      console.log(`🚚 Handling found download URL (${context}):`, url);

      const filename = extractFilename(url);
      const backendSuccess = await sendUrl(url, filename);
      if (!backendSuccess) {
        try {
          // Fallback: click/navigate
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          document.body.appendChild(a);
          await humanClick(a);
        } catch (_) {}
      }

      const currentProcessingId = downloadManager.getCurrentProcessing();
      if (currentProcessingId) {
        sendCompletionSignal(currentProcessingId);
        downloadManager.clearCurrentProcessing();
        downloadManager.processQueueIfNeeded();
      }
      setTimeout(() => {
        try {
          if (shouldAutoClose()) window.close();
        } catch (e) {}
      }, 3000);
      return true;
    } catch (e) {
      console.log('⚠️ Error handling found URL:', e.message);
      return false;
    }
  }

  // Remove/disable full-screen transparent overlays that may block interactions
  function disableBlockingOverlays() {
    if (!isCloudContext()) return;
    try {
      const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
        try {
          const style = getComputedStyle(el);
          const isAbsolute = style.position === 'absolute' || style.position === 'fixed';
          const full = (el.className || '').includes('inset-0') || (
            style.top === '0px' && style.left === '0px' && (
              (parseInt(style.width) >= window.innerWidth - 2 && parseInt(style.height) >= window.innerHeight - 2) ||
              (style.right === '0px' && style.bottom === '0px')
            )
          );
          const transparent = (style.opacity === '0' || style.opacity === '0.0');
          return isAbsolute && full && transparent;
        } catch (_) { return false; }
      });
      candidates.forEach(el => {
        try {
          el.style.pointerEvents = 'none';
        } catch (_) {}
      });
      if (candidates.length) {
        console.log(`🧹 Disabled ${candidates.length} transparent overlay(s)`);
      }
    } catch (e) {
      console.log('⚠️ Overlay cleanup error:', e.message);
    }
  }

  // Observe DOM for new links, including within shadow roots (open)
  function startDownloadLinkObserver() {
    if (!isCloudContext()) return;
    if (window.__galyObserverStarted) return;
    window.__galyObserverStarted = true;
    console.log('👀 Starting download link observer');

    const linkMatcher = (href) => href && (
      href.includes('downloading-from-olamovies') ||
      href.includes('bellofjob.com') ||
      href.includes('secret=')
    );

    const scanNode = (root) => {
      try {
        const anchors = root.querySelectorAll ? root.querySelectorAll('a[href]') : [];
        for (const a of anchors) {
          if (linkMatcher(a.href)) return a.href;
        }
      } catch (_) {}
      return null;
    };

    const processTree = (node) => {
      if (!node) return null;
      let found = scanNode(node);
      if (found) return found;
      // Traverse open shadow roots
      const all = node.querySelectorAll ? node.querySelectorAll('*') : [];
      for (const el of all) {
        try {
          if (el.shadowRoot) {
            found = scanNode(el.shadowRoot) || processTree(el.shadowRoot);
            if (found) return found;
          }
        } catch (_) {}
      }
      return null;
    };

    const observer = new MutationObserver((mutations) => {
      if (galyFinalLinkHandled) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          const href = processTree(node);
          if (href) {
            handleFoundDownloadUrl(href, 'mutation');
            observer.disconnect();
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    // Initial scan
    const initial = processTree(document);
    if (initial) {
      handleFoundDownloadUrl(initial, 'initial-scan');
      observer.disconnect();
    }
  }

  // Intercept network to catch links in JSON/HTML responses
  function startNetworkSniffer() {
    if (!isCloudContext()) return;
    if (window.__galyNetSnifferStarted) return;
    window.__galyNetSnifferStarted = true;
    console.log('🌐 Starting network sniffer');

    const extractLinkFromText = (text) => {
      try {
        const re = /(https?:\/\/[^\s"']*(?:downloading-from-olamovies|bellofjob\.com)[^\s"']*)/i;
        const m = text.match(re);
        return m ? m[1] : null;
      } catch (_) { return null; }
    };

    // Also capture API endpoints that produce final links
    const captureProducer = (url, bodyOrText, meta = {}) => {
      try {
        const link = extractLinkFromText(bodyOrText || '');
        if (link) {
          console.log('🧲 Captured producer -> link:', { url, link });
          try { localStorage.setItem('galyCloudProducerLast', url); } catch (_) {}
        }
        // Record candidate during capture window
        addProducerCandidate({ url, ...meta, t: Date.now() });
      } catch (_) {}
    };

    // fetch
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = async function(...args) {
        try {
          const req = args[0];
          const url = (typeof req === 'string') ? req : (req?.url || '');
          // Pre-request candidate record during capture window
          captureProducer(url, '', { phase: 'fetch-request' });
        } catch (_) {}
        const res = await origFetch.apply(this, args);
        try {
          const req = args[0];
          const url = (typeof req === 'string') ? req : (req?.url || '');
          const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
          const isRscLike = /text\/x-component|application\/x-component|__flight__|\?_rsc=/.test(ct + ' ' + url);
          let text = '';
          if (!isRscLike) {
            const clone = res.clone();
            // Avoid huge reads; bail if content-length is very large
            let okToRead = true;
            try {
              const len = (res.headers && res.headers.get && parseInt(res.headers.get('content-length') || '0', 10)) || 0;
              if (len && len > 2_000_000) okToRead = false; // >2MB
            } catch (_) {}
            if (okToRead) {
              try { text = await clone.text(); } catch (_) { text = ''; }
              const link = extractLinkFromText(text);
              if (link && !galyFinalLinkHandled) {
                handleFoundDownloadUrl(link, 'fetch');
              }
            }
          }
          // If redirected to a final link URL, treat it as the link
          const finalUrl = res.url || '';
          if (!galyFinalLinkHandled && (res.redirected || /downloading-from-olamovies|bellofjob\.com|secret=/.test(finalUrl))) {
            handleFoundDownloadUrl(finalUrl, 'fetch-redirect-url');
          }
          captureProducer(url, text, { status: res.status, redirected: res.redirected, finalUrl, ct });
        } catch (_) {}
        return res;
      };
    }

    // XHR
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(...args) {
      this.__galyMethod = args[0];
      this.__galyUrl = args[1];
      try { captureProducer(this.__galyUrl || '', '', { phase: 'xhr-open', method: this.__galyMethod || 'GET' }); } catch (_) {}
      return origOpen.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      try {
        this.addEventListener('readystatechange', function() {
          try {
            if (this.readyState === 4) {
              const respUrl = (this.responseURL || this.__galyUrl || '');
              const ct = (this.getResponseHeader && this.getResponseHeader('content-type')) || '';
              const isRscLike = /text\/x-component|application\/x-component|__flight__|\?_rsc=/.test(ct + ' ' + respUrl);
              let bodyText = '';
              if (!isRscLike && typeof this.responseText === 'string') {
                bodyText = this.responseText;
                const link = extractLinkFromText(bodyText);
                if (link && !galyFinalLinkHandled) {
                  handleFoundDownloadUrl(link, 'xhr');
                }
              }
              // Some XHRs may end up redirected; try responseURL if present
              if (!galyFinalLinkHandled && /downloading-from-olamovies|bellofjob\.com|secret=/.test(respUrl)) {
                handleFoundDownloadUrl(respUrl, 'xhr-redirect-url');
              }
              captureProducer(this.__galyUrl || respUrl || '', bodyText, { status: this.status, method: this.__galyMethod || 'GET', ct });
            }
          } catch (_) {}
        });
      } catch (_) {}
      return origSend.apply(this, args);
    };
  }

  // Watch performance entries to capture outgoing resource URLs as candidates or final links
  function startPerformanceSniffer() {
    if (!isCloudContext()) return;
    if (window.__galyPerfSnifferStarted) return;
    window.__galyPerfSnifferStarted = true;
    console.log('📈 Starting performance sniffer');
    try {
      const seen = new Set();
      const isFinalLike = (u) => /downloading-from-olamovies|bellofjob\.com|secret=/.test(u || '');
      const tick = () => {
        try {
          const entries = performance.getEntriesByType('resource') || [];
          for (const e of entries) {
            const name = e.name || '';
            if (!name || seen.has(name)) continue;
            seen.add(name);
            if (isFinalLike(name)) {
              if (!galyFinalLinkHandled) handleFoundDownloadUrl(name, 'perf');
            } else {
              addProducerCandidate({ url: name, kind: 'perf-resource', t: Date.now() });
            }
          }
        } catch (_) {}
      };
      // Run frequently for a short period; rely on capture window gating
      const interval = setInterval(() => {
        if (!isCloudContext() || galyFinalLinkHandled) { clearInterval(interval); return; }
        tick();
      }, 500);
    } catch (e) {
      console.log('⚠️ Performance sniffer error:', e.message);
    }
  }

  async function tryDirectProducer() {
    if (!isCloudContext()) return false;
    try {
      const last = localStorage.getItem('galyCloudProducerLast');
      if (!last) return false;
      console.log('🧪 Trying direct producer:', last);
      return await new Promise((resolve) => {
        if (typeof GM_xmlhttpRequest === 'undefined') return resolve(false);
        GM_xmlhttpRequest({
          method: 'GET',
          url: last,
          timeout: 8000,
          onload: (resp) => {
            try {
              const text = resp.responseText || '';
              const re = /(https?:\/\/[^\s"']*(?:downloading-from-olamovies|bellofjob\.com)[^\s"']*)/i;
              const m = text.match(re);
              if (m && m[1]) {
                console.log('✅ Producer yielded final link directly');
                handleFoundDownloadUrl(m[1], 'producer');
                resolve(true);
              } else {
                resolve(false);
              }
            } catch (_) { resolve(false); }
          },
          onerror: () => resolve(false),
          ontimeout: () => resolve(false)
        });
      });
    } catch (_) { return false; }
  }

  async function tryProducerCandidates() {
    if (!isCloudContext()) return false;
    try {
      const raw = localStorage.getItem('galyCloudProducerCandidates');
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list) || list.length === 0) return false;
      // Try most recent first
      const candidates = list.slice().reverse();
      for (const entry of candidates) {
        const url = entry && entry.url;
        if (!url) continue;
        console.log('🧪 Trying producer candidate:', url);
        const ok = await new Promise((resolve) => {
          if (typeof GM_xmlhttpRequest === 'undefined') return resolve(false);
          GM_xmlhttpRequest({
            method: 'GET',
            url,
            timeout: 8000,
            onload: (resp) => {
              try {
                const text = resp.responseText || '';
                const re = /(https?:\/\/[^\s"']*(?:downloading-from-olamovies|bellofjob\.com)[^\s"']*)/i;
                const m = text.match(re);
                if (m && m[1]) {
                  console.log('✅ Candidate yielded final link directly');
                  try { localStorage.setItem('galyCloudProducerLast', url); } catch (_) {}
                  handleFoundDownloadUrl(m[1], 'producer-candidate');
                  resolve(true);
                } else {
                  resolve(false);
                }
              } catch (_) { resolve(false); }
            },
            onerror: () => resolve(false),
            ontimeout: () => resolve(false)
          });
        });
        if (ok) return true;
      }
      return false;
    } catch (_) { return false; }
  }

  // Auto-click OMDrive Cloud button when it appears
  function startAutoClickCloudButton() {
    if (!isCloudContext()) return;
    if (window.__galyAutoCloudClickerStarted) return;
    window.__galyAutoCloudClickerStarted = true;
    console.log('🤖 Starting auto-clicker for Cloud button');

    const findCloudBtn = () => deepFind(el => {
      try {
        const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.matches?.("button, a, div[role='button']");
        if (!isButton) return false;
        const text = (el.textContent || '').trim();
        const hasText = /\b(Start Cloud Download|Cloud Download)\b/i.test(text);
        const hasIcon = !!el.querySelector?.('svg.lucide-cloud-upload');
        // Prefer within #details section if present
        const inDetails = !!el.closest?.('#details');
        return (hasText || hasIcon) && (inDetails || hasText);
      } catch (_) { return false; }
    });

    const tryClick = async () => {
      if (window.__galyCloudClicked) return;
      const debugPause = galyFlag('galyBreakOnCloudButton', 'false');
      const btn = findCloudBtn();
      if (btn) {
        if (debugPause && !window.__galyDebugPaused) {
          try { btn.style.outline = '2px solid red'; } catch (_) {}
          console.log('⛔ Debug pause: Step 2 Cloud button detected in #details. Call window.__galyResumeAutoClick() to continue.');
          window.__galyDebugPaused = true;
          window.__galyResumeAutoClick = async () => {
            try { setCaptureMode(30000); } catch (_) {}
            try { await humanClick(btn); } catch (_) {}
            window.__galyCloudClicked = true;
            setTimeout(() => { runFinalDownload().catch(()=>{}); }, 1200);
          };
          debugger;
          return true;
        } else {
          window.__galyCloudClicked = true;
          console.log('🟢 Auto-clicking Cloud button');
          try { setCaptureMode(30000); } catch (_) {}
          try { await humanClick(btn); } catch (_) {}
          // Give dialog time to render, then wait for final link
          setTimeout(() => { runFinalDownload().catch(()=>{}); }, 1200);
          return true;
        }
      }
      return false;
    };

    // Initial attempt
    tryClick();

    // Observe DOM for button appearance
    const observer = new MutationObserver(() => { tryClick(); });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // Stop after success
    const stopIfDone = setInterval(() => {
      if (window.__galyCloudClicked) {
        try { observer.disconnect(); } catch (_) {}
        clearInterval(stopIfDone);
      }
    }, 1000);
  }

  // Advanced localStorage-based download tracking system
  class GalyDownloadManager {
    constructor() {
      this.storageKeys = {
        downloads: 'galyDownloads',
        processing: 'galyProcessing',
        queue: 'galyQueue'
      };
      this.initStorage();
      this.setupStorageListener();
    }

    initStorage() {
      if (!localStorage.getItem(this.storageKeys.downloads)) {
        localStorage.setItem(this.storageKeys.downloads, JSON.stringify({}));
      }
      if (!localStorage.getItem(this.storageKeys.queue)) {
        localStorage.setItem(this.storageKeys.queue, JSON.stringify([]));
      }
      // Don't initialize processing key - let it be undefined/null when idle
    }

    setupStorageListener() {
      console.log("🎧 Setting up storage listener");
      window.addEventListener('storage', (e) => {
        console.log('📡 Storage event received:', {
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
          url: e.url
        });

        if (e.key === this.storageKeys.downloads || e.key === this.storageKeys.queue || e.key === this.storageKeys.processing) {
          console.log('✅ Relevant storage change detected:', e.key);
          updateStatusDisplay();
          this.processQueueIfNeeded();
        } else {
          console.log('⏭️ Ignoring irrelevant storage key:', e.key);
        }
      });
    }

    createDownload(url) {
      const downloadId = `galy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const download = {
        id: downloadId,
        url: url,
        state: 'queued',
        step: 'initial',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        error: null,
        metadata: {
          title: this.extractTitleFromUrl(url),
          attemptCount: 0,
          lastAttemptAt: null
        }
      };

      const downloads = this.getDownloads();
      downloads[downloadId] = download;
      this.saveDownloads(downloads);

      console.log(`Created download ${downloadId} for ${url}`);
      return download;
    }

    updateDownload(downloadId, updates) {
      const downloads = this.getDownloads();
      if (downloads[downloadId]) {
        downloads[downloadId] = {
          ...downloads[downloadId],
          ...updates,
          updatedAt: Date.now()
        };
        this.saveDownloads(downloads);
        console.log(`Updated download ${downloadId}:`, updates);
      }
    }

    getDownload(downloadId) {
      const downloads = this.getDownloads();
      return downloads[downloadId] || null;
    }

    getDownloads() {
      try {
        return JSON.parse(localStorage.getItem(this.storageKeys.downloads) || '{}');
      } catch (e) {
        console.error('Error parsing downloads:', e);
        return {};
      }
    }

    saveDownloads(downloads) {
      localStorage.setItem(this.storageKeys.downloads, JSON.stringify(downloads));
    }

    queueDownload(downloadId) {
      const queue = this.getQueue();
      if (!queue.includes(downloadId)) {
        queue.push(downloadId);
        localStorage.setItem(this.storageKeys.queue, JSON.stringify(queue));
        console.log(`Queued download ${downloadId}, queue length: ${queue.length}`);
      }
    }

    getQueue() {
      try {
        return JSON.parse(localStorage.getItem(this.storageKeys.queue) || '[]');
      } catch (e) {
        console.error('Error parsing queue:', e);
        return [];
      }
    }

    getCurrentProcessing() {
      const value = localStorage.getItem(this.storageKeys.processing);
      // localStorage.getItem returns null if key doesn't exist, which is what we want
      return value;
    }

    setCurrentProcessing(downloadId) {
      localStorage.setItem(this.storageKeys.processing, downloadId);
      if (downloadId) {
        this.updateDownload(downloadId, { state: 'processing' });
      }
    }

    clearCurrentProcessing() {
      const current = this.getCurrentProcessing();
      if (current && current !== "null") {
        this.updateDownload(current, { state: 'idle' });
      }
      // Remove the key entirely instead of setting to null to avoid "null" string
      localStorage.removeItem(this.storageKeys.processing);
    }

    processQueueIfNeeded() {
      console.log("🔄 processQueueIfNeeded() called");

      const currentProcessing = this.getCurrentProcessing();
      const queue = this.getQueue();

      console.log(`📊 Current processing: "${currentProcessing}"`);
      console.log(`📊 Queue length: ${queue.length}`);
      console.log(`📊 Queue contents:`, queue);

      // Check if nothing is processing (handle both null and "null" string from localStorage)
      const isIdle = !currentProcessing || currentProcessing === "null";
      console.log(`📊 Is idle: ${isIdle}`);

      if (isIdle && queue.length > 0) {
        console.log("✅ Conditions met - starting processing");

        const nextDownloadId = queue.shift();
        console.log(`🎯 Next download ID: ${nextDownloadId}`);

        localStorage.setItem(this.storageKeys.queue, JSON.stringify(queue));

        const download = this.getDownload(nextDownloadId);
        console.log(`📄 Download object:`, download);

        if (download) {
          console.log(`🚀 Starting download ${nextDownloadId}: ${download.url}`);

          this.setCurrentProcessing(nextDownloadId);
          this.updateDownload(nextDownloadId, {
            state: 'starting',
            step: 'opening_tab',
            metadata: {
              ...download.metadata,
              attemptCount: download.metadata.attemptCount + 1,
              lastAttemptAt: Date.now()
            }
          });

          console.log(`🔗 Opening window for: ${download.url}`);
          const usePopunder = galyFlag('galyOpenPopunder', 'false');
          const w = usePopunder ? openWindowPopunder(download.url, { keepOpener: true }) : openWindowPreferPopup(download.url, { keepOpener: true });
          if (!w) {
            console.error("❌ Failed to open window - popup blocked!");
            alert("Popup blocked — allow popups for this site.");
            this.updateDownload(nextDownloadId, {
              state: 'error',
              error: 'popup_blocked'
            });
            this.clearCurrentProcessing();
          } else {
            console.log("✅ Successfully opened window for download", nextDownloadId);
            try { if (typeof w.focus === 'function') w.focus(); } catch (e) {}
          }
        } else {
          console.error(`❌ Download ${nextDownloadId} not found in downloads store`);
          // Continue processing the next item
          this.processQueueIfNeeded();
        }
      } else {
        console.log("⏳ Conditions not met - not processing");
        if (currentProcessing) {
          console.log(`   - Currently processing: ${currentProcessing}`);
        }
        if (queue.length === 0) {
          console.log("   - Queue is empty");
        }
      }
    }

    extractTitleFromUrl(url) {
      try {
        // Extract filename from URL if possible
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart !== 'generate') {
          return decodeURIComponent(lastPart);
        }
        return urlObj.searchParams.get('id') || 'Unknown';
      } catch (e) {
        return 'Unknown';
      }
    }

    getStats() {
      const downloads = this.getDownloads();
      const queue = this.getQueue();
      const current = this.getCurrentProcessing();

      const stats = {
        total: Object.keys(downloads).length,
        queued: queue.length,
        processing: current ? 1 : 0,
        completed: 0,
        errors: 0
      };

      Object.values(downloads).forEach(download => {
        if (download.state === 'completed') stats.completed++;
        if (download.state === 'error') stats.errors++;
      });

      return stats;
    }

    cleanup() {
      const downloads = this.getDownloads();
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

      // Remove old completed/error downloads
      Object.keys(downloads).forEach(id => {
        const download = downloads[id];
        if ((download.state === 'completed' || download.state === 'error') && download.updatedAt < cutoffTime) {
          delete downloads[id];
          console.log(`Cleaned up old download ${id}`);
        }
      });

      this.saveDownloads(downloads);
    }
  }

  // Global download manager instance
  const downloadManager = new GalyDownloadManager();

  // XDM Integration
  const XDM_HOST = "http://127.0.0.1:9614";
  let xdmAvailable = false;

  // Check if XDM is running
  async function checkXDMStatus() {
    return new Promise((resolve) => {
      console.log("🔍 Checking XDM status at:", XDM_HOST + "/sync");

      // Try using GM_xmlhttpRequest if available (Greasemonkey/Tampermonkey)
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        console.log("📡 Using GM_xmlhttpRequest (CORS-bypassing!) for XDM check");
        console.log("🛡️ GM_xmlhttpRequest bypasses CORS restrictions completely");
        GM_xmlhttpRequest({
          method: 'GET',
          url: XDM_HOST + "/sync",
          timeout: 3000,
          onload: (response) => {
            console.log("📥 XDM response status:", response.status);
            console.log("📄 XDM response text:", response.responseText);
            if (response.status === 200) {
              // Treat HTTP 200 as available even if JSON parse fails
              xdmAvailable = true;
              try {
                const data = JSON.parse(response.responseText);
                if (data && data.enabled === false) {
                  xdmAvailable = false;
                }
                console.log("✅ XDM is available:", xdmAvailable, "- Response:", data);
              } catch (e) {
                console.log("⚠️ XDM /sync JSON parse failed, assuming available (status 200)");
              }
              resolve(xdmAvailable);
            } else {
              xdmAvailable = false;
              console.log("❌ XDM not available (status:", response.status, ") - Response:", response.responseText);
              resolve(false);
            }
          },
          onerror: (error) => {
            xdmAvailable = false;
            console.log("❌ XDM connection failed - Network error:", error);
            resolve(false);
          },
          ontimeout: () => {
            xdmAvailable = false;
            console.log("❌ XDM timeout - No response within 3 seconds");
            resolve(false);
          }
        });
      } else {
        console.log("🌐 Using XMLHttpRequest for XDM check (fallback)");
        // Fallback to regular XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.timeout = 3000; // 3 second timeout
        xhr.onreadystatechange = function() {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            console.log("📥 XDM XHR response status:", xhr.status);
            console.log("📄 XDM XHR response text:", xhr.responseText);
            if (xhr.status === 200) {
              // Treat HTTP 200 as available even if JSON parse fails
              xdmAvailable = true;
              try {
                const data = JSON.parse(xhr.responseText);
                if (data && data.enabled === false) {
                  xdmAvailable = false;
                }
                console.log("✅ XDM is available:", xdmAvailable, "- Response:", data);
              } catch (e) {
                console.log("⚠️ XDM /sync JSON parse failed, assuming available (status 200)");
              }
              resolve(xdmAvailable);
            } else {
              xdmAvailable = false;
              console.log("❌ XDM not available (status:", xhr.status, ") - Response:", xhr.responseText);
              resolve(false);
            }
          }
        };
        xhr.onerror = (error) => {
          xdmAvailable = false;
          console.log("❌ XDM XHR connection failed - Network error:", error);
          resolve(false);
        };
        xhr.ontimeout = () => {
          xdmAvailable = false;
          console.log("❌ XDM XHR timeout - No response within 3 seconds");
          resolve(false);
        };

        try {
          xhr.open('GET', XDM_HOST + "/sync", true);
          console.log("📤 Sending XDM check request...");
          xhr.send();
        } catch (e) {
          xdmAvailable = false;
          console.log("❌ XDM request setup failed:", e);
          resolve(false);
        }
      }
    });
  }
    async function sendUrlToAria(url, filename = null) {
        const ariaRpcUrl = "http://192.168.71.103:8087/jsonrpc"; // adjust host/port
        const token = "804f50bdd88d3bf70539a19af456ddd7";       // your rpc-secret

        const options = {};
        const effectiveFilename = filename || extractFilename(url);
        if (effectiveFilename) {
            options.out = effectiveFilename;
        }

        const body = {
            jsonrpc: "2.0",
            method: "aria2.addUri",
            id: "galy_" + Date.now(),
            params: [
                "token:" + token,
                [url],
                options
            ]
        };

        const bodyForLog = {
            ...body,
            params: [
                "token:" + (token ? token.slice(0, 4) + "…" : ""),
                [url],
                options
            ]
        };

        try {
            console.log("📡 Sending to aria2 RPC", { ariaRpcUrl, body: bodyForLog, backend: DOWNLOAD_BACKEND });
            // Use GM_xmlhttpRequest to avoid CORS headaches
            if (typeof GM_xmlhttpRequest !== "undefined") {
                return await new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: ariaRpcUrl,
                        data: JSON.stringify(body),
                        headers: { "Content-Type": "application/json" },
                        timeout: 10000,
                        onload: (resp) => {
                            const status = resp.status;
                            const text = resp.responseText || "";
                            console.log("📥 aria2 response", { status, text: text.slice(0, 500) });
                            if (status !== 200) {
                                console.error("❌ aria2 HTTP error", { status, text: text.slice(0, 500) });
                                resolve(false);
                                return;
                            }
                            try {
                                const result = JSON.parse(text);
                                if (result && result.result) {
                                    console.log("✅ aria2 accepted URL", { gid: result.result, filename: effectiveFilename || null });
                                    resolve(true);
                                } else if (result && result.error) {
                                    console.error("❌ aria2 error", result.error);
                                    resolve(false);
                                } else {
                                    console.warn("⚠️ Unexpected aria2 response", result);
                                    resolve(false);
                                }
                            } catch (e) {
                                console.error("❌ Failed to parse aria2 JSON", e);
                                resolve(false);
                            }
                        },
                        onerror: (err) => {
                            console.error("❌ aria2 network error", err);
                            resolve(false);
                        },
                        ontimeout: () => {
                            console.error("⏰ aria2 request timed out");
                            resolve(false);
                        }
                    });
                });
            } else {
                // fallback using fetch
                const res = await fetch(ariaRpcUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                const text = await res.text();
                console.log("📥 aria2 response (fetch)", { status: res.status, text: text.slice(0, 500) });
                if (!res.ok) {
                    console.error("❌ aria2 HTTP error (fetch)", { status: res.status });
                    return false;
                }
                try {
                    const result = JSON.parse(text);
                    if (result && result.result) {
                        console.log("✅ aria2 accepted URL (fetch)", { gid: result.result, filename: effectiveFilename || null });
                        return true;
                    }
                    if (result && result.error) {
                        console.error("❌ aria2 error (fetch)", result.error);
                        return false;
                    }
                    console.warn("⚠️ Unexpected aria2 response (fetch)", result);
                    return false;
                } catch (e) {
                    console.error("❌ Failed to parse aria2 JSON (fetch)", e);
                    return false;
                }
            }
        } catch (err) {
            console.error("❌ Error sending to aria2:", err);
            return false;
        }
    }


  // Send URL to XDM using official extension protocol
  async function sendUrlToXDM(url, filename = null) {
    if (!xdmAvailable) {
      console.log("❌ XDM not available, skipping");
      return false;
    }

    return new Promise((resolve) => {
      console.log("📤 Sending URL to XDM (official protocol):", url);

      // Build data using exact same format as XDM extension
      let data = "url=" + url + "\r\n"; // Note: extension doesn't encode URL
      if (filename) {
        data += "file=" + filename + "\r\n"; // Note: extension doesn't encode filename
      }

      // Add user agent (exact format from extension)
      data += "res=realUA:" + navigator.userAgent + "\r\n";

      // Add tab ID if available
      if (window && window.location) {
        // Try to get tab ID from current context
        data += "res=tabId:-1\r\n"; // Default tab ID
      }

      // Get cookies using GM_cookie (same as extension)
      const getCookiesAndSend = () => {
        if (typeof GM_cookie !== 'undefined' && GM_cookie.list) {
          console.log("🍪 Getting cookies for URL:", url);
          GM_cookie.list({ url: url }, (cookies) => {
            console.log(`🍪 Found ${cookies.length} cookies`);
            cookies.forEach(cookie => {
              data += "cookie=" + cookie.name + ":" + cookie.value + "\r\n";
            });
            sendToXDM(data, resolve);
          });
        } else {
          console.log("⚠️ No cookie support, sending without cookies");
          sendToXDM(data, resolve);
        }
      };

      getCookiesAndSend();
    });
  }

  // Send data to XDM using official protocol
  function sendToXDM(data, resolve) {
    console.log("📦 XDM data (official format):", data.replace(/\r\n/g, ' | '));

    // Use GM_xmlhttpRequest with same settings as extension
    if (typeof GM_xmlhttpRequest !== 'undefined') {
      console.log("📡 Using GM_xmlhttpRequest (privileged API)");
      GM_xmlhttpRequest({
        method: 'POST',
        url: XDM_HOST + "/download",
        data: data,
        headers: {
          'Content-Type': 'text/plain'
        },
        timeout: 10000, // Increased timeout like extension
        onload: (response) => {
          console.log("📥 XDM response status:", response.status);
          if (response.responseText) {
            console.log("📄 XDM response:", response.responseText);
          }

          if (response.status === 200) {
            console.log("✅ Successfully sent to XDM (official protocol):", data.split('\r\n')[0]);
            resolve(true);
          } else {
            console.log("❌ XDM request failed (status:", response.status, ")");
            if (response.responseText) {
              console.log("❌ XDM error response:", response.responseText);
            }
            resolve(false);
          }
        },
        onerror: (error) => {
          // Extract error details properly
          let errorMsg = 'Unknown network error';
          if (error) {
            if (typeof error === 'string') {
              errorMsg = error;
            } else if (error.message) {
              errorMsg = error.message;
            } else if (error.toString && error.toString() !== '[object Object]') {
              errorMsg = error.toString();
            } else {
              // Try to get error details
              try {
                errorMsg = JSON.stringify(error, Object.getOwnPropertyNames(error));
              } catch (e) {
                errorMsg = '[object Object] - unable to stringify';
              }
            }
          }
          console.log("❌ XDM network error:", errorMsg);
          console.log("🔍 Error object type:", typeof error);
          if (error && typeof error === 'object') {
            console.log("🔍 Error keys:", Object.keys(error).join(', '));
          }
          resolve(false);
        },
        ontimeout: () => {
          console.log("⏰ XDM request timeout (10s)");
          resolve(false);
        }
      });
    } else {
      console.log("🌐 Fallback to XMLHttpRequest");
      // Fallback to regular XMLHttpRequest (same as extension)
      const xhr = new XMLHttpRequest();
      xhr.timeout = 10000;

      xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          console.log("📥 XDM XHR response status:", xhr.status);
          if (xhr.responseText) {
            console.log("📄 XDM XHR response:", xhr.responseText);
          }

          if (xhr.status === 200) {
            console.log("✅ Successfully sent to XDM (XHR fallback)");
            resolve(true);
          } else {
            console.log("❌ XDM XHR request failed (status:", xhr.status, ")");
            resolve(false);
          }
        }
      };

      xhr.onerror = () => {
        console.log("❌ XDM XHR network error");
        resolve(false);
      };

      xhr.ontimeout = () => {
        console.log("⏰ XDM XHR timeout (10s)");
        resolve(false);
      };

      try {
        xhr.open('POST', XDM_HOST + "/download", true);
        xhr.setRequestHeader('Content-Type', 'text/plain');
        console.log("📤 Sending XDM request...");
        xhr.send(data);
      } catch (e) {
        console.log("❌ XDM request setup failed:", e.message);
        resolve(false);
      }
    }
  }

  // Extract filename from URL or page
  function extractFilename(url) {
    try {
      // Try to get filename from URL
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      if (filename && filename.includes('.')) {
        return decodeURIComponent(filename);
      }

      // Try to get from query parameters
      const id = urlObj.searchParams.get('id');
      if (id) {
        return id + '.zip'; // Common extension for downloads
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // Send completion signal to parent window
  function sendCompletionSignal(downloadId) {
    console.log("🚀 Sending completion signal from child window");
    console.log("Window opener available:", !!window.opener);
    console.log("Window opener postMessage available:", !!(window.opener && typeof window.opener.postMessage === "function"));

    // Try postMessage first
    if (window.opener && typeof window.opener.postMessage === "function") {
      try {
        const message = { galy: "stage1Done", downloadId: downloadId, timestamp: Date.now() };
        window.opener.postMessage(message, "*");
        console.log("✅ Sent stage1Done message to opener via postMessage:", message);
      } catch (err) {
        console.error("❌ Failed to send stage1Done message via postMessage:", err);
        // Fallback to localStorage signaling
        try {
          localStorage.setItem("galyStage1Complete", Date.now().toString());
          console.log("📦 Sent stage1Done signal via localStorage");
        } catch (storageErr) {
          console.error("❌ Failed localStorage fallback:", storageErr);
        }
      }
    } else {
      console.log("⚠️ No window.opener available, using localStorage fallback");
      try {
        localStorage.setItem("galyStage1Complete", Date.now().toString());
        console.log("📦 Sent stage1Done signal via localStorage");
      } catch (storageErr) {
        console.error("❌ Failed localStorage fallback:", storageErr);
      }
    }
  }

  // Expose for debugging
  window.galyDebug = {
    downloadManager,
    processQueue: () => downloadManager.processQueueIfNeeded(),
    getStats: () => downloadManager.getStats(),
    getDownloads: () => downloadManager.getDownloads(),
    getQueue: () => downloadManager.getQueue(),
    getCurrentProcessing: () => downloadManager.getCurrentProcessing(),
    checkXDM: () => checkXDMStatus(),
    xdmStatus: () => xdmAvailable,
    send: (url, filename = null) => sendUrl(url, filename),
    testXDMConnection: async () => {
      console.log("🧪 Testing XDM connection manually...");
      const result = await checkXDMStatus();
      console.log("🧪 XDM test result:", result);
      return result;
    },
    xdmHost: XDM_HOST,
    backend: () => DOWNLOAD_BACKEND
  };

  // Add "Add to GalyLibrary" buttons on main listing
  function addButtons() {
    // Add a reset button first
    addResetButton();

    document.querySelectorAll(".wp-block-buttons .wp-block-button a[href*='ol-am.top']").forEach(link => {
      if (link.dataset.galyAdded) return;
      link.dataset.galyAdded = "1";

      const btn = document.createElement("button");
      btn.textContent = "Add to GalyLibrary";
      btn.style.cssText = "margin-left:8px;padding:6px 10px;border-radius:6px;background:#4caf50;color:white;font-weight:bold;cursor:pointer;";

      link.parentElement.appendChild(btn);

      btn.addEventListener("click", e => {
        e.preventDefault();
        // Use real user gesture to unlock media/click policies
        try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { const ac = new AC(); ac.resume?.().catch(()=>{}); } } catch (_) {}
        try { document.body.click(); } catch (_) {}
        console.log("Adding to download queue:", link.href);
        if (hasRecentlySent(link.href)) {
          console.log("⏭️ Skipping queue: URL recently sent to backend", { backend: DOWNLOAD_BACKEND });
          return;
        }

        try {
          console.log("🎯 Button clicked for:", link.href);

          // Create a new download entry
          const download = downloadManager.createDownload(link.href);
          console.log("📝 Download created:", download.id);

          // Add to queue
          downloadManager.queueDownload(download.id);
          console.log("📋 Download queued");

          // Try to process the queue
          console.log("🔄 Attempting to process queue...");
          downloadManager.processQueueIfNeeded();

          updateStatusDisplay();
          console.log("✅ Button click processing complete");

        } catch (err) {
          console.error("❌ Error adding download:", err);
          // Fallback: open immediately
          console.log("🔄 Falling back to immediate open");
          const usePopunder = galyFlag('galyOpenPopunder', 'false');
          const w = usePopunder ? openWindowPopunder(link.href, { keepOpener: true }) : openWindowPreferPopup(link.href, { keepOpener: true });
          if (!w) alert("Popup blocked — allow popups for this site.");
        }
      });
    });
  }

  // Listen for stage-1 completion from child tabs and open next queued item
  function setupQueueListener() {
    // Listen for postMessage events
    window.addEventListener("message", ev => {
      console.log("📨 Received message from child window:", ev.data);
      console.log("Message origin:", ev.origin);
      console.log("Message source:", ev.source);

      if (!ev || !ev.data || ev.data.galy !== "stage1Done") {
        console.log("⏭️ Message ignored - not stage1Done or invalid format");
        return;
      }

      console.log("✅ Received stage1Done via postMessage from download:", ev.data.downloadId);

      // Update the download state to show it completed stage 1
      if (ev.data.downloadId) {
        downloadManager.updateDownload(ev.data.downloadId, {
          step: 'redirect_completed',
          state: 'redirecting'
        });
      }

      // Clear the processing flag since this download completed stage 1
      downloadManager.clearCurrentProcessing();
      console.log("🧹 Cleared processing flag, ready for next download");

      // Process the next item in queue
      downloadManager.processQueueIfNeeded();
    }, false);

    // React instantly to localStorage cross-tab signals
    try {
      window.addEventListener('storage', (ev) => {
        try {
          if (ev && ev.key === 'galyStage1Complete' && ev.newValue) {
            console.log("📦 storage event: stage1Done via localStorage");
            // Clear processing flag and process next
            downloadManager.clearCurrentProcessing();
            downloadManager.processQueueIfNeeded();
          }
        } catch (e) {
          console.log('⚠️ storage event handler error:', e);
        }
      });
    } catch (_) {}

    // Also poll for localStorage signals (fallback mechanism)
    let lastSignalTime = 0;
    setInterval(() => {
      try {
        const signalTime = localStorage.getItem("galyStage1Complete");
        if (signalTime && parseInt(signalTime) > lastSignalTime) {
          lastSignalTime = parseInt(signalTime);
          console.log("📦 Received stage1Done via localStorage, processing next");
          localStorage.removeItem("galyStage1Complete"); // Clear the signal

          // Clear processing flag when using localStorage fallback
          downloadManager.clearCurrentProcessing();

          downloadManager.processQueueIfNeeded();
        }
      } catch (err) {
        console.log("⚠️ localStorage polling error:", err);
      }
    }, 1000); // Check every second

    console.log("🎧 Queue listener setup complete - listening for completion signals");
  }

  // Redirect step (Step 1: click filename badge if present, then proceed)
  async function runRedirect() {
    await sleep(1500, 3000); // wait for page to load

    // Step 1: Click the filename badge to copy (if present on this variant)
    const filenameBadge = document.querySelector(".filename-badge");
    if (filenameBadge) {
      console.log("Clicking filename badge (step one)");
      await humanClick(filenameBadge);
      await sleep(800, 1400);
    }

    // Step 2: Click the premium/continue area under the main title
    const mainTitle = document.querySelector(".main-title");
    if (!mainTitle) return;

    const premiumBlock = mainTitle.nextElementSibling;
    if (!premiumBlock) return;

    // Prefer explicit interactive targets within the block
    const candidates = [
      premiumBlock.querySelector("a, button, div[role='button']"),
      premiumBlock.querySelector(".fHuQLFORDqUm, .RteTsIywjgzn, .RSGWCNQJDrtE"),
      premiumBlock.firstElementChild
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (await humanClick(candidate)) {
        // Update download state and notify opener that stage-1 is done
        console.log("Stage-1 completed, updating state and notifying opener");

        // Try to find the download ID from the current URL
        const currentUrl = window.location.href;
        const downloads = downloadManager.getDownloads();
        const currentDownload = Object.values(downloads).find(d => d.url === currentUrl);

        if (currentDownload) {
          downloadManager.updateDownload(currentDownload.id, {
            state: 'redirecting',
            step: 'redirect_completed',
            metadata: {
              ...currentDownload.metadata,
              redirectCompletedAt: Date.now()
            }
          });
        }

        setTimeout(() => {
          console.log("🚀 Sending completion signal from child window");
          console.log("Window opener available:", !!window.opener);
          console.log("Window opener postMessage available:", !!(window.opener && typeof window.opener.postMessage === "function"));

          // Try postMessage first
          if (window.opener && typeof window.opener.postMessage === "function") {
            try {
              const message = { galy: "stage1Done", downloadId: currentDownload?.id, timestamp: Date.now() };
              window.opener.postMessage(message, "*");
              console.log("✅ Sent stage1Done message to opener via postMessage:", message);
            } catch (err) {
              console.error("❌ Failed to send stage1Done message via postMessage:", err);
              // Fallback to localStorage signaling
              try {
                localStorage.setItem("galyStage1Complete", Date.now().toString());
                console.log("📦 Sent stage1Done signal via localStorage");
              } catch (storageErr) {
                console.error("❌ Failed localStorage fallback:", storageErr);
              }
            }
          } else {
            console.log("⚠️ No window.opener available, using localStorage fallback");
            try {
              localStorage.setItem("galyStage1Complete", Date.now().toString());
              console.log("📦 Sent stage1Done signal via localStorage");
            } catch (storageErr) {
              console.error("❌ Failed localStorage fallback:", storageErr);
            }
          }
        }, 1500); // Wait 1.5 seconds for navigation to start
        return;
      }
    }
  }

    // Cloud download step
    async function runCloudStep() {
        if (!isCloudContext()) return false;
        console.log("🔍 Looking for download button on page...");
        console.log("📍 Current URL:", window.location.href);

        // Start capture window early to grab all requests
        try { setCaptureMode(45000); } catch (_) {}
        disableBlockingOverlays();
        startNetworkSniffer();
        startDownloadLinkObserver();
        startAutoClickCloudButton();
        startPerformanceSniffer();
        // Repeated hydration nudges shortly after load
        try {
          let nudgeCount = 0;
          const nudger = setInterval(() => {
            if (!isCloudContext() || window.__galyCloudClicked || galyFinalLinkHandled || nudgeCount > 40) {
              clearInterval(nudger);
              return;
            }
            tryFocusActivation();
            routeNudge();
            nudgeCount++;
          }, 1000);
        } catch (_) {}

        // Attempt direct producer fetch first
        try {
          const directOk = await tryDirectProducer();
          if (directOk) return true;
        } catch (_) {}

        // Fallback: try any captured producer candidates in this session
        try {
          const candOk = await tryProducerCandidates();
          if (candOk) return true;
        } catch (_) {}

        // Update download state to show we're at the cloud download step
        const currentUrl = window.location.href;
        const downloads = downloadManager.getDownloads();
        const currentDownload = Object.values(downloads).find(d => d.url === currentUrl);
        // Fallback to the currently processing ID if URL doesn't match
        const currentProcessingId = downloadManager.getCurrentProcessing();
        const activeDownloadId = currentDownload?.id || currentProcessingId;

        if (activeDownloadId) {
          downloadManager.updateDownload(activeDownloadId, {
            state: 'downloading',
            step: 'cloud_download_page',
            metadata: {
              ...(currentDownload?.metadata || {}),
              cloudPageReachedAt: Date.now()
            }
          });
          console.log("📝 Updated download state for:", activeDownloadId);
        } else {
          console.log("⚠️ No matching download found for current URL");
        }

        // Wait for initial page load
        await sleep(2200, 4000);

        // Try multiple times with increasing delays (handle dynamic content loading)
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`🔄 Download button search attempt ${attempt}/3`);

            const found = await searchForDownloadButtons(currentDownload);
            if (found) {
                console.log(`✅ Found download button on attempt ${attempt}`);
                return true;
            }

            console.log(`⏳ Waiting for dynamic content (attempt ${attempt})...`);

            // Try to trigger content loading by scrolling and interacting on attempt 2
            if (attempt === 2) {
                console.log("🔄 Attempting to trigger dynamic content loading...");
                await triggerDynamicContentLoading();
            }

            // On final attempt, try clicking any buttons that might reveal download options, then re-scan
            if (attempt === 3) {
                console.log("🎯 Final attempt - trying to click potential trigger buttons...");
                await tryTriggerButtons();
                await sleep(2000, 3500);
                const foundAfterTrigger = await searchForDownloadButtons(currentDownload);
                if (foundAfterTrigger) {
                    console.log("✅ Found download button after trigger attempts");
                    return true;
                }
            }

            await sleep(3000, 5000); // Wait between attempts
        }

        console.log("❌ No download buttons found after all attempts");
        return false;
    }

    // Function to try clicking buttons that might reveal download options
    async function tryTriggerButtons() {
        try {
            console.log("🔘 Looking for buttons that might trigger download options...");

            // Look for buttons with text that suggests they might reveal downloads
            const triggerTexts = [
                'continue', 'proceed', 'next', 'start', 'begin', 'load', 'show',
                'download', 'get', 'generate', 'create', 'open', 'view'
            ];

            const potentialTriggerButtons = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
                .filter(el => {
                    const text = el.textContent?.toLowerCase() || el.value?.toLowerCase() || '';
                    return triggerTexts.some(trigger => text.includes(trigger)) && el.offsetParent;
                });

            console.log(`Found ${potentialTriggerButtons.length} potential trigger buttons`);

            // Try clicking the first few potential trigger buttons
            for (let i = 0; i < Math.min(3, potentialTriggerButtons.length); i++) {
                const btn = potentialTriggerButtons[i];
                console.log(`🎯 Trying to click trigger button: "${btn.textContent?.trim() || btn.value}"`);

                try {
                    await humanClick(btn);
                    console.log(`✅ Clicked trigger button ${i + 1}, waiting for content to load...`);
                    await sleep(2000, 4000); // Wait for potential content to load
                } catch (e) {
                    console.log(`❌ Failed to click trigger button ${i + 1}:`, e.message);
                }
            }

            console.log("✅ Finished trying trigger buttons");
        } catch (e) {
            console.log("⚠️ Error trying trigger buttons:", e.message);
        }
    }

    // Function to trigger dynamic content loading by scrolling and interacting
    async function triggerDynamicContentLoading() {
        try {
            console.log("📜 Simulating user interactions to trigger content loading...");

            // Scroll to bottom of page
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            await sleep(1000, 2000);

            // Scroll back to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
            await sleep(500, 1000);

            // Simulate mouse movement over potential interactive areas
            const interactiveElements = document.querySelectorAll('button, a, div[role="button"], [onclick]');
            for (let i = 0; i < Math.min(5, interactiveElements.length); i++) {
                const el = interactiveElements[i];
                if (el.offsetParent) { // Only visible elements
                    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    await sleep(200, 500);
                    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
                }
            }

            // Trigger any lazy loading by scrolling to middle
            window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
            await sleep(1000, 2000);

            console.log("✅ Finished triggering dynamic content loading");
        } catch (e) {
            console.log("⚠️ Error triggering dynamic content:", e.message);
        }
    }

    // Try to nudge the page into active/focused state
    function tryFocusActivation() {
      if (!isCloudContext()) return;
      try {
        console.log("🎛️ Attempting focus activation");
        if (typeof window.focus === 'function') {
          window.focus();
        }
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        // Light interactions
        window.scrollTo({ top: 1 });
        window.scrollTo({ top: 0 });
        document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }));
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
        document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));
        document.body.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: 12, clientY: 12 }));
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 12, clientY: 12 }));
        document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 12, clientY: 12 }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', code: 'Tab' }));
        document.body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab', code: 'Tab' }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
        document.body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ', code: 'Space' }));
        document.body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', code: 'Space' }));
        document.body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
        document.body.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('pageshow'));
        window.dispatchEvent(new Event('hashchange'));
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 1 }));
      } catch (e) {
        console.log("⚠️ Focus activation error:", e.message);
      }
    }

    // Nudge client routers/listeners that hydrate on navigation events
    function routeNudge() {
      try {
        const href = location.href;
        history.replaceState(history.state, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (_) {}
    }

    // Deep query helpers (search within shadow DOMs too)
    function deepQueryAll(selector, root = document) {
      const results = [];
      const visit = (node) => {
        try {
          if (node.querySelectorAll) {
            results.push(...node.querySelectorAll(selector));
          }
        } catch (_) {}
        const children = node.querySelectorAll ? node.querySelectorAll('*') : [];
        for (const el of children) {
          if (el.shadowRoot) visit(el.shadowRoot);
        }
      };
      visit(root);
      return results;
    }

    function deepFind(predicate) {
      const candidates = [
        ...deepQueryAll('a[href]'),
        ...deepQueryAll('button'),
        ...deepQueryAll("div[role='button']"),
        ...deepQueryAll("div[type='button']")
      ];
      for (const el of candidates) {
        try {
          if (predicate(el)) return el;
        } catch (_) {}
      }
      return null;
    }

    // Separate function to search for download buttons
    async function searchForDownloadButtons(currentDownload) {
        // Determine active download id within this scope
        const currentProcessingId = downloadManager.getCurrentProcessing();
        const activeDownloadId = currentDownload?.id || currentProcessingId;
        // Attempt to activate focus/state before searching
        tryFocusActivation();
        // Check for iframes that might contain the download buttons
        const iframes = document.querySelectorAll('iframe');
        if (iframes.length > 0) {
            console.log(`🔍 Found ${iframes.length} iframe(s), checking for download content...`);
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        console.log("📄 Checking iframe content...");
                        const iframeButtons = iframeDoc.querySelectorAll('button, a');
                        console.log(`Found ${iframeButtons.length} elements in iframe`);

                        // Look for download buttons in iframe
                        for (const btn of iframeButtons) {
                            if (btn.textContent && (
                                btn.textContent.includes('Download') ||
                                btn.textContent.includes('Cloud') ||
                                btn.href?.includes('downloading-from-olamovies') ||
                                btn.href?.includes('bellofjob.com')
                            )) {
                                console.log("🎯 Found download button in iframe:", btn.textContent?.trim());
                                // Note: Can't directly click iframe elements, but we can send to backend
                                if (btn.href && currentDownload) {
                                    if (hasRecentlySent(btn.href)) {
                                        console.log("⏭️ Skipping send from iframe: URL recently sent to backend", { backend: DOWNLOAD_BACKEND });
                                        return true;
                                    }
                                    const backendSuccess = await sendUrl(btn.href, extractFilename(btn.href));
                                    if (backendSuccess) {
                                            markSent(btn.href);
                                        downloadManager.updateDownload(currentDownload.id, {
                                            state: 'completed',
                                            step: 'sent_to_backend_from_iframe',
                                            metadata: {
                                                ...currentDownload.metadata,
                                                sentToBackendAt: Date.now(),
                                                backend: DOWNLOAD_BACKEND,
                                                backendSuccess: true,
                                                foundInIframe: true
                                            }
                                        });
                                        sendCompletionSignal(currentDownload.id);
                                        setTimeout(() => { try { if (shouldAutoClose()) window.close(); } catch (e) {} }, 500);
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log("⚠️ Could not access iframe content:", e.message);
                }
            }
        }

        // Case 1: Direct anchor with downloading-from-olamovies href (most direct)
        console.log("🔎 Searching for download links in main document...");
        let directAnchor = deepFind(a => a.tagName === 'A' && a.href && a.href.includes('downloading-from-olamovies'));
        console.log("Direct selector result:", directAnchor);

        if (!directAnchor) {
            // Try broader search
            const allAnchors = deepQueryAll("a[href]");
            console.log("Total anchors found:", allAnchors.length);

            directAnchor = Array.from(allAnchors)
                .find(a => a.href && a.href.includes('downloading-from-olamovies'));
            console.log("Broader search result:", directAnchor);
        }

        if (directAnchor) {
            console.log("✅ Found Direct Cloud Link anchor:", directAnchor.href);
            console.log("Anchor attributes:", {
                'data-galy-done': directAnchor.getAttribute('data-galy-done'),
                className: directAnchor.className,
                textContent: directAnchor.textContent.trim()
            });

            // Try backend first
            if (hasRecentlySent(directAnchor.href)) {
                console.log("⏭️ Skipping send: URL recently sent to backend", { backend: DOWNLOAD_BACKEND });
                return true;
            }
            const backendSuccess = await sendUrl(directAnchor.href, extractFilename(directAnchor.href));
            if (backendSuccess) {
                console.log("🎉 Successfully sent to backend, skipping click", { backend: DOWNLOAD_BACKEND });
                markSent(directAnchor.href);
                // Mark as completed and send completion signal
                if (activeDownloadId) {
                    downloadManager.updateDownload(activeDownloadId, {
                        state: 'completed',
                        step: 'sent_to_backend',
                        metadata: {
                            ...(currentDownload?.metadata || {}),
                            sentToBackendAt: Date.now(),
                            backend: DOWNLOAD_BACKEND,
                            backendSuccess: true
                        }
                    });
                    // Send completion signal to start next download
                    sendCompletionSignal(activeDownloadId);
                    downloadManager.clearCurrentProcessing();
                    downloadManager.processQueueIfNeeded();
                }
                // Close this window/tab after handing off to XDM
                setTimeout(() => { try { if (shouldAutoClose()) window.close(); } catch (e) {} }, 500);
                return true;
            }

            // Fallback to clicking
            console.log("⚠️ Backend send failed, falling back to click", { backend: DOWNLOAD_BACKEND });

            // Check if it's already been processed
            if (directAnchor.dataset.galyDone) {
                console.log("⚠️ Anchor already processed, removing data-galy-done to try again");
                delete directAnchor.dataset.galyDone;
            }

            const clickResult = await humanClick(directAnchor);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        } else {
            console.log("❌ No downloading-from-olamovies anchor found");
        }

        // Case 2: Look for "Start Cloud Download" button (most common case)
        const startCloudBtn = deepFind(btn => btn.tagName === 'BUTTON' && btn.textContent && (
            btn.textContent.trim().includes("Start Cloud Download") ||
            btn.textContent.trim().includes("Cloud Download")
        ));
        if (startCloudBtn) {
            console.log("Found Start Cloud Download button:", startCloudBtn.textContent.trim());
            try { setCaptureMode(30000); } catch (_) {}
            const clickResult = await humanClick(startCloudBtn);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        }

        // Case 3: Look for buttons with cloud-upload SVG icon
        const cloudUploadIcon = (function() {
            const icons = [
                ...deepQueryAll('svg.lucide-cloud-upload'),
                ...deepQueryAll('svg.lucide-cloud-check')
            ];
            return icons[0] || null;
        })();
        if (cloudUploadIcon) {
            const buttonWithUploadIcon = cloudUploadIcon.closest("button, a, div[type='button']");
        if (buttonWithUploadIcon) {
            console.log("Found button with cloud-upload icon");
            try { setCaptureMode(30000); } catch (_) {}
            const clickResult = await humanClick(buttonWithUploadIcon);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        }
        }

        // Case 4: Button with "Direct Cloud Link" text
        const directBtnText = deepFind(el => el.textContent && el.textContent.trim().includes("Direct Cloud Link"));
        if (directBtnText) {
            console.log("Found Direct Cloud Link button by text");
            try { setCaptureMode(30000); } catch (_) {}
            const clickResult = await humanClick(directBtnText);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        }

        // Case 5: Any button containing "Cloud" in the text
        const cloudBtn = deepFind(el => el.textContent && el.textContent.trim().toLowerCase().includes("cloud"));
        if (cloudBtn) {
            console.log("Found cloud-related button:", cloudBtn.textContent.trim());
            try { setCaptureMode(30000); } catch (_) {}
            const clickResult = await humanClick(cloudBtn);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        }

        // Case 6: Look for SVG cloud icon (specific to this site)
        const cloudIcon = (function() {
            const icons = [
                ...deepQueryAll('svg.lucide-cloud-check'),
                ...deepQueryAll('svg.lucide-cloud-download')
            ];
            return icons[0] || null;
        })();
        if (cloudIcon) {
            const buttonWithIcon = cloudIcon.closest("button, a");
        if (buttonWithIcon) {
            console.log("Found button with cloud icon");
            try { setCaptureMode(30000); } catch (_) {}
            const clickResult = await humanClick(buttonWithIcon);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        }
        }

        // Case 7: Any link with bellofjob.com or secret parameter
        const secretLink = deepFind(a => a.tagName === 'A' && a.href && (a.href.includes('bellofjob.com') || a.href.includes('secret=')));
        if (secretLink) {
            console.log("Found secret download link:", secretLink.href);
            // Prefer backend first
            if (hasRecentlySent(secretLink.href)) {
                console.log("⏭️ Skipping send: secret URL recently sent to backend", { backend: DOWNLOAD_BACKEND });
                return true;
            }
            const backendSuccess = await sendUrl(secretLink.href, extractFilename(secretLink.href));
            if (backendSuccess) {
                markSent(secretLink.href);
                if (activeDownloadId) {
                    downloadManager.updateDownload(activeDownloadId, {
                        state: 'completed',
                        step: 'sent_to_backend_secret',
                        metadata: {
                            ...(currentDownload?.metadata || {}),
                            sentToBackendAt: Date.now(),
                            backend: DOWNLOAD_BACKEND,
                            backendSuccess: true
                        }
                    });
                    sendCompletionSignal(activeDownloadId);
                    downloadManager.clearCurrentProcessing();
                    downloadManager.processQueueIfNeeded();
                }
                // Close this window/tab after handing off to XDM
                setTimeout(() => { try { if (shouldAutoClose()) window.close(); } catch (e) {} }, 500);
                return true;
            }

            // Fallback to clicking, then wait for final link
            const clickResult = await humanClick(secretLink);
            if (clickResult) {
                await runFinalDownload();
            }
            return clickResult;
        }

        // Case 8: Look for divs with type="button" that might contain buttons
        const buttonDivs = document.querySelectorAll("div[type='button']");
        for (const div of buttonDivs) {
            const innerButton = div.querySelector("button");
            if (innerButton && innerButton.textContent &&
                (innerButton.textContent.includes("Cloud") || innerButton.textContent.includes("Download"))) {
                console.log("Found button inside div[type='button']:", innerButton.textContent.trim());
                const clickResult = await humanClick(innerButton);
                if (clickResult) {
                    await runFinalDownload();
                }
                return clickResult;
            }
        }

        // Case 9: Debug - comprehensive element analysis
        console.log("🔍 === COMPREHENSIVE PAGE ANALYSIS ===");

        console.log("📋 All buttons on page:");
        document.querySelectorAll("button").forEach((btn, i) => {
            console.log(`  ${i}: "${btn.textContent.trim()}" (visible: ${btn.offsetParent !== null})`);
            console.log(`     Classes: ${btn.className}`);
            console.log(`     Parent: ${btn.parentElement?.tagName} ${btn.parentElement?.className || ''}`);
        });

        console.log("🔗 All links with href:");
        document.querySelectorAll("a[href]").forEach((link, i) => {
            if (link.href.includes('http')) {
                console.log(`  ${i}: "${link.textContent.trim()}"`);
                console.log(`     Href: ${link.href}`);
                console.log(`     data-galy-done: ${link.getAttribute('data-galy-done')}`);
                console.log(`     Visible: ${link.offsetParent !== null}`);
            }
        });

        console.log("🎯 Specific searches:");
        const cloudCheckIcon = document.querySelector("svg.lucide-cloud-check");
        console.log(`  Cloud-check icon found: ${!!cloudCheckIcon}`);
        if (cloudCheckIcon) {
            const parentButton = cloudCheckIcon.closest("a, button");
            console.log(`  Cloud-check parent: ${parentButton?.tagName} "${parentButton?.textContent?.trim()}"`);
        }

        const bellofjobLinks = Array.from(document.querySelectorAll("a[href]"))
            .filter(a => a.href.includes('bellofjob.com'));
        console.log(`  Bellofjob links found: ${bellofjobLinks.length}`);
        bellofjobLinks.forEach((link, i) => {
            console.log(`    ${i}: ${link.href}`);
        });

        // Case 10: Look for buttons that might be hidden or appear after interaction
        console.log("🔍 Additional checks:");
        const allElements = document.querySelectorAll('*');
        console.log(`  Total elements on page: ${allElements.length}`);

        // Look for elements with download-related text anywhere on the page
        const downloadRelatedElements = Array.from(allElements).filter(el =>
            el.textContent && (
                el.textContent.toLowerCase().includes('download') ||
                el.textContent.toLowerCase().includes('cloud') ||
                el.textContent.toLowerCase().includes('get link')
            ) && el.offsetParent !== null // Visible elements only
        );
        console.log(`  Elements with download text: ${downloadRelatedElements.length}`);
        downloadRelatedElements.forEach((el, i) => {
            if (i < 5) { // Show first 5
                console.log(`    ${i}: ${el.tagName} "${el.textContent.trim().substring(0, 50)}..."`);
            }
        });

        // Check for shadow DOM
        const shadowHosts = Array.from(document.querySelectorAll('*')).filter(el => el.shadowRoot);
        console.log(`  Shadow DOM hosts found: ${shadowHosts.length}`);

        console.log("⚠️ No cloud download button/link found. Check analysis above.");
    }


  // Step 4: Handle both dialog and direct link cases
  async function runFinalDownload() {
    console.log("⏳ Waiting for final download link...");

    let finalLink = null;
    for (let i = 0; i < 300; i++) { // retry up to ~60s
      // Case 1: dialog "Get Download Link"
      finalLink = document.querySelector("div[role='dialog'] a[href*='downloading-from-olamovies']");
      if (finalLink) break;

      // Case 2: direct "Direct Cloud Link" on details page
      finalLink = document.querySelector("#details a[href*='downloading-from-olamovies']");
      if (finalLink) break;

      // Case 3: bellofjob/secret direct link appearing after success panel
      finalLink = document.querySelector("a[href*='bellofjob.com'], a[href*='secret=']");
      if (finalLink) break;

      // Periodically try headless producer candidates while waiting
      if (i === 10 || i === 20 || i === 40 || i === 80 || i === 160) {
        try {
          const ok = await tryProducerCandidates();
          if (ok) return; // handleFoundDownloadUrl will take over
        } catch (_) {}
      }

      await sleep(1000, 1500);
    }

    if (!finalLink) {
      console.warn("⚠️ Final download link never appeared.");
      return;
    }

    console.log("✅ Found final link:", finalLink.href);

    // Prefer backend for final link if available
    if (hasRecentlySent(finalLink.href)) {
      console.log("⏭️ Skipping send: final URL recently sent to backend", { backend: DOWNLOAD_BACKEND });
      return;
    }
    const backendSuccess = await sendUrl(finalLink.href, extractFilename(finalLink.href));
    if (!backendSuccess) {
      // Clear previous processing flag to allow another click
      if (finalLink && finalLink.dataset && finalLink.dataset.galyDone) {
        try { delete finalLink.dataset.galyDone; } catch (_) {}
      }
      await humanClick(finalLink);
    }

    // Signal completion and move queue
    const currentProcessingId = downloadManager.getCurrentProcessing();
    if (currentProcessingId) {
      sendCompletionSignal(currentProcessingId);
      downloadManager.clearCurrentProcessing();
      downloadManager.processQueueIfNeeded();
    }
    if (backendSuccess) {
      markSent(finalLink.href);
    }
    // Close this window/tab if allowed after final action
    setTimeout(() => {
      try {
        if (shouldAutoClose()) window.close();
      } catch (e) {}
    }, 3000);
  }



  // Override document.hasFocus to always return true (trick page into thinking it's focused)
  const originalHasFocus = document.hasFocus;
  try {
    document.hasFocus = function() {
      console.log("🎯 document.hasFocus() overridden - returning true");
      return true;
    };
    console.log("✅ Successfully overrode document.hasFocus()");
  } catch (e) {
    console.log("⚠️ Could not override document.hasFocus():", e.message);
  }

  // Override visibility state to always appear visible (try multiple approaches)
  const originalVisibilityState = document.visibilityState;
  try {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function() {
        console.log("👁️ document.visibilityState overridden - returning 'visible'");
        return 'visible';
      }
    });
    console.log("✅ Successfully overrode document.visibilityState");
  } catch (e) {
    console.log("⚠️ Could not override document.visibilityState with defineProperty:", e.message);
    try {
      // Fallback: try to modify the property descriptor if it exists
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState') ||
                       Object.getOwnPropertyDescriptor(document, 'visibilityState');
      if (descriptor && descriptor.configurable) {
        descriptor.get = function() {
          console.log("👁️ document.visibilityState fallback override - returning 'visible'");
          return 'visible';
        };
        Object.defineProperty(document, 'visibilityState', descriptor);
        console.log("✅ Successfully overrode document.visibilityState with fallback");
      } else {
        console.log("⚠️ Cannot override visibilityState - property is not configurable");
        // Last resort: override on window if available
        if (window && window.document && window.document !== document) {
          try {
            Object.defineProperty(window.document, 'visibilityState', {
              get: function() {
                console.log("👁️ window.document.visibilityState override - returning 'visible'");
                return 'visible';
              }
            });
            console.log("✅ Successfully overrode window.document.visibilityState");
          } catch (windowError) {
            console.log("⚠️ Could not override window.document.visibilityState either:", windowError.message);
          }
        }
      }
    } catch (fallbackError) {
      console.log("⚠️ Fallback visibilityState override failed:", fallbackError.message);
    }
  }

  // Attempt to force document.hidden to always be false
  try {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: function() {
        console.log("👁️ document.hidden overridden - returning false");
        return false;
      }
    });
    console.log("✅ Successfully overrode document.hidden");
  } catch (e) {
    console.log("⚠️ Could not override document.hidden on instance:", e.message);
    try {
      Object.defineProperty(Document.prototype, 'hidden', {
        configurable: true,
        get: function() {
          console.log("👁️ Document.prototype.hidden overridden - returning false");
          return false;
        }
      });
      console.log("✅ Successfully overrode Document.prototype.hidden");
    } catch (e2) {
      console.log("⚠️ Could not override Document.prototype.hidden:", e2.message);
    }
  }

  // Legacy WebKit property override
  try {
    Object.defineProperty(document, 'webkitHidden', {
      configurable: true,
      get: function() {
        console.log("👁️ document.webkitHidden overridden - returning false");
        return false;
      }
    });
  } catch (_) {}

  // Optional: Soften background throttling that some sites rely on for hydration
  (function setupHydrationHelpers() {
    try {
      const toBool = (v) => {
        const s = (v || '').toString().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
      };

      // IntersectionObserver override: ensure observed targets get an intersecting callback soon
      const OriginalIO = window.IntersectionObserver;
      if (typeof OriginalIO === 'function') {
        const fakeEnabled = () => toBool(localStorage.getItem('galyFakeIntersection') ?? 'true');
        window.IntersectionObserver = function(cb, options) {
          const inst = new OriginalIO(cb, options);
          try {
            inst.__galyTargets = new Set();
            const origObserve = inst.observe?.bind(inst);
            if (origObserve) {
              inst.observe = (el) => {
                try { inst.__galyTargets.add(el); } catch (_) {}
                return origObserve(el);
              };
            }
            if (isCloudContext() && fakeEnabled()) {
              setTimeout(() => {
                try {
                  const entries = Array.from(inst.__galyTargets).map(t => {
                    const rect = t.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 };
                    return {
                      isIntersecting: true,
                      target: t,
                      intersectionRatio: 1,
                      time: performance.now(),
                      boundingClientRect: rect,
                      intersectionRect: rect,
                      rootBounds: (document.documentElement || document.body).getBoundingClientRect?.() || null
                    };
                  });
                  if (entries.length) cb(entries, inst);
                } catch (_) {}
              }, 1200);
            }
          } catch (_) {}
          return inst;
        };
        try { window.IntersectionObserver.prototype = OriginalIO.prototype; } catch (_) {}
        console.log('🧩 IntersectionObserver override installed');
      }

      // requestAnimationFrame helper: ensure timely callbacks even when throttled
      const originalRAF = window.requestAnimationFrame?.bind(window);
      if (typeof originalRAF === 'function') {
        const forceEnabled = () => toBool(localStorage.getItem('galyForceRaf') ?? 'true');
        window.requestAnimationFrame = function(callback) {
          if (!forceEnabled() || !isCloudContext()) {
            return originalRAF(callback);
          }
          let called = false;
          const id = originalRAF((ts) => { called = true; try { callback(ts); } catch (_) {} });
          // Backup timer: if throttled, fire within ~40ms
          setTimeout(() => { if (!called) { try { callback(performance.now()); } catch (_) {} } }, 40);
          return id;
        };
        console.log('🧩 requestAnimationFrame helper installed');
      }
    } catch (e) {
      console.log('⚠️ Hydration helper setup error:', e.message);
    }
  })();

  // Main
  window.addEventListener("load", async () => {
    console.log("🚀 Script loaded - focus overrides active");

    // Check backend status on load (only probe XDM when selected)
    if (DOWNLOAD_BACKEND === 'xdm') {
      await checkXDMStatus();
    } else {
      console.log('⏭️ Skipping XDM check because backend is', DOWNLOAD_BACKEND);
    }

    addButtons();
    setupQueueListener();

    if (document.querySelector(".main-title")) {
      await runRedirect();
    } else if (document.querySelector("#details")) {
      await runCloudStep();
    } else if (document.querySelector("[id^='radix-'][role='dialog']") || document.querySelector("#details a[href*='downloading-from-olamovies']")) {
      await runFinalDownload();
    }

    // If site hydrates only when visible, kick flows when tab becomes visible
    try {
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          try { if (!window.__galyFirstVisibleAt) window.__galyFirstVisibleAt = Date.now(); } catch (_) {}
          console.log('👁️ Tab became visible - re-running cloud flow');
          try { disableBlockingOverlays(); } catch (_) {}
          try { startNetworkSniffer(); } catch (_) {}
          try { startDownloadLinkObserver(); } catch (_) {}
          try { startAutoClickCloudButton(); } catch (_) {}
          try { await runCloudStep(); } catch (_) {}
          try { await runFinalDownload(); } catch (_) {}
        }
      });
    } catch (_) {}
  });
})();
