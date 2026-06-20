// ==UserScript==
// @name         Amazon GPT Cart 2.0
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Production-grade GPT-friendly cart for Amazon product + search pages with exports, migration, and debug report.
// @author
// NOTE: Chrome/Tampermonkey @match patterns do NOT support `www.amazon.*`.
// Use explicit domains (and optional subdomains) instead.
// @match        https://www.amazon.com/*
// @match        https://amazon.com/*
// @match        https://smile.amazon.com/*
// @match        https://www.amazon.co.uk/*
// @match        https://amazon.co.uk/*
// @match        https://www.amazon.ca/*
// @match        https://amazon.ca/*
// @match        https://www.amazon.de/*
// @match        https://amazon.de/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=amazon.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_addValueChangeListener
// @connect      shopwisely.ai
// @connect      amazon.com
// @connect      amazon.co.uk
// @connect      amazon.ca
// @connect      amazon.de
// ==/UserScript==

(function () {
  'use strict';

  // ===========================================================================
  // REQUIRED CONSTANTS (Do not remove)
  // ===========================================================================
  const SCRIPT_VERSION = "2.0.0";
  const STORAGE_KEY_V2 = "GPT_CART_V2";
  const STORAGE_KEY_V1 = "GPT_CART_V1";
  const ENABLE_THIRD_PARTY_ENRICHMENT_DEFAULT = false;
  const MAX_CONCURRENCY_DEFAULT = 3;

  // ===========================================================================
  // Baseline audit notes (v1 → v2 rationale)
  // - v1 stored an array under GPT_CART_V1 and copied JSON only.
  // - Dedupe was inconsistent (product: asin+title; search: asin only; bulk: asin+title).
  // - Bulk add was sequential and often blocked on remote calls (Amazon dp fetch + shopwisely.ai).
  // - Debuggability was low (no structured logs, no extraction diagnostics/report).
  // - UI couldn't edit per-item metadata (notes/tags/qty) or export formats.
  // ===========================================================================

  // ===========================================================================
  // Config
  // ===========================================================================
  const APP_NAME = 'Amazon GPT Cart';
  const UI_ROOT_ID = 'agc2-root';
  const LOG_BUFFER_MAX = 400;

  /** @type {const} */
  const PAGE_TYPES = {
    product: 'product',
    search: 'search',
    cart: 'cart',
    other: 'other',
  };

  const DEFAULT_SETTINGS = Object.freeze({
    debugEnabled: false,
    includeDiagnosticsInExport: false,
    showSearchInlineButtons: true,
    maxConcurrency: MAX_CONCURRENCY_DEFAULT,

    // Remote calls are optional and disabled by default.
    enableAmazonFetchEnrichment: false,
    enableThirdPartyEnrichment: ENABLE_THIRD_PARTY_ENRICHMENT_DEFAULT,
  });

  // ===========================================================================
  // Logging / Debug buffer
  // ===========================================================================
  /** @type {{ts:number, level:'debug'|'info'|'warn'|'error', msg:string, data?:any}[]} */
  const logBuffer = [];

  /** @type {{lastExtraction:any|null}} */
  const runtime = {
    lastExtraction: null,
    currentPageType: PAGE_TYPES.other,
    ui: {
      root: null,
      shadow: null,
      mounted: false,
      drawerOpen: false,
      exportOpen: false,
      settingsOpen: false,
      bulk: null, // {id, total, done, errors, cancelled}
    },
    sessionCache: {
      asinToExtraction: new Map(), // asin -> extraction summary
      asinToAmazonEnrichment: new Map(), // asin -> {title, brand, price, images, bullets}
      asinToThirdPartyEnrichment: new Map(), // asin -> any
    },
  };

  function pushLog(level, msg, data) {
    const entry = { ts: Date.now(), level, msg };
    if (data !== undefined) entry.data = data;
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
  }

  function logDebug(msg, data) {
    pushLog('debug', msg, data);
    // Avoid calling getSettings() during state initialization to prevent infinite recursion
    if (state?.settings?.debugEnabled ?? DEFAULT_SETTINGS.debugEnabled) {
      console.debug(`[${APP_NAME}] ${msg}`, data ?? '');
    }
  }

  function logInfo(msg, data) {
    pushLog('info', msg, data);
    // Avoid calling getSettings() during state initialization to prevent infinite recursion
    if (state?.settings?.debugEnabled ?? DEFAULT_SETTINGS.debugEnabled) {
      console.info(`[${APP_NAME}] ${msg}`, data ?? '');
    }
  }

  function logWarn(msg, data) {
    pushLog('warn', msg, data);
    console.warn(`[${APP_NAME}] ${msg}`, data ?? '');
  }

  function logError(msg, data) {
    pushLog('error', msg, data);
    console.error(`[${APP_NAME}] ${msg}`, data ?? '');
  }

  // ===========================================================================
  // Small utilities
  // ===========================================================================
  function clampInt(n, min, max, fallback) {
    const x = Number.parseInt(String(n), 10);
    if (!Number.isFinite(x)) return fallback;
    return Math.min(max, Math.max(min, x));
  }

  function normalizeSpace(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function fnv1aBase36(str) {
    // 32-bit FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function uniqStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const v of asArray(arr)) {
      const s = normalizeSpace(v);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForSelector(selector, { root = document, timeoutMs = 2500, pollMs = 120 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = root.querySelector(selector);
      if (el) return el;
      await sleep(pollMs);
    }
    return null;
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function getText(sel, root = document) {
    const el = qs(sel, root);
    return el ? normalizeSpace(el.textContent) : null;
  }

  function getAttr(sel, attr, root = document) {
    const el = qs(sel, root);
    if (!el) return null;
    const v = el.getAttribute(attr);
    return v == null ? null : String(v);
  }

  function canonicalizeUrl(url) {
    try {
      const u = new URL(url, location.href);
      // Drop query + hash for deterministic identity.
      u.hash = '';
      u.search = '';
      return u.toString();
    } catch {
      return String(url ?? '');
    }
  }

  function canonicalProductUrlFromAsin(asin) {
    return `${location.origin}/dp/${asin}`;
  }

  function extractAsinFromUrl(url) {
    const s = String(url ?? '');
    const m = s.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    return m ? m[1].toUpperCase() : null;
  }

  function parsePriceFromText(priceText) {
    const raw = normalizeSpace(priceText);
    if (!raw) return { amount: null, currency: null, display: null };
    const currency = (raw.match(/[£€$]/)?.[0]) || null;
    // Remove currency and any non-numeric separators.
    const cleaned = raw.replace(/[^\d.,]/g, '').replace(/,/g, '');
    const amount = Number.parseFloat(cleaned);
    return {
      amount: Number.isFinite(amount) ? amount : null,
      currency,
      display: raw,
    };
  }

  function parseIntFromText(text) {
    const digits = String(text ?? '').replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number.parseInt(digits, 10);
    return Number.isFinite(n) ? n : null;
  }

  // ===========================================================================
  // Storage (schema v2) + v1 migration
  // ===========================================================================
  /**
   * @typedef {object} CartItemV2
   * @property {string} id
   * @property {string} asin
   * @property {string} variantHash
   * @property {string} identityKey
   * @property {string} url
   * @property {string|null} title
   * @property {string|null} brand
   * @property {{amount:number|null,currency:string|null,display:string|null}|null} price
   * @property {{amount:number|null,currency:string|null,display:string|null}|null} listPrice
   * @property {{stars:number|null,reviewCount:number|null}|null} rating
   * @property {string[]} images
   * @property {string[]} bullets
   * @property {string|null} description
   * @property {{timeText:string|null,priceText:string|null,cutoffText:string|null,conditionText:string|null}|null} delivery
   * @property {{couponText:string|null,dealText:string|null}|null} promotions
   * @property {string[]} tags
   * @property {string} note
   * @property {number} quantity
   * @property {number} addedAt
   * @property {number} updatedAt
   * @property {{pageType:string, extractedAt:number, selectors:Record<string,string|null>, confidence:{overall:number, fields:Record<string,number|null>}, diagnostics:{missing:string[], notes:string[]}}|null} extraction
   * @property {{amazonFetch?:{enabled:boolean, attemptedAt?:number, ok?:boolean, error?:string}, thirdParty?:{enabled:boolean, attemptedAt?:number, ok?:boolean, error?:string}}|null} enrichment
   */

  /**
   * @typedef {object} GPTCartV2State
   * @property {2} schemaVersion
   * @property {string} scriptVersion
   * @property {number} createdAt
   * @property {number} updatedAt
   * @property {typeof DEFAULT_SETTINGS} settings
   * @property {{itemsById: Record<string, CartItemV2>, order: string[]}} cart
   * @property {Record<string, any>} migrations
   */

  /** @type {GPTCartV2State|null} */
  let state = null;

  function createDefaultState() {
    const ts = Date.now();
    return {
      schemaVersion: 2,
      scriptVersion: SCRIPT_VERSION,
      createdAt: ts,
      updatedAt: ts,
      settings: { ...DEFAULT_SETTINGS },
      cart: { itemsById: {}, order: [] },
      migrations: {},
    };
  }

  function normalizeState(maybeState) {
    if (!maybeState || typeof maybeState !== 'object') return createDefaultState();
    if (maybeState.schemaVersion !== 2) return createDefaultState();

    const s = /** @type {GPTCartV2State} */ (maybeState);
    s.scriptVersion = SCRIPT_VERSION;
    s.createdAt = Number.isFinite(s.createdAt) ? s.createdAt : Date.now();
    s.updatedAt = Number.isFinite(s.updatedAt) ? s.updatedAt : Date.now();
    s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    s.settings.maxConcurrency = clampInt(s.settings.maxConcurrency, 1, 10, MAX_CONCURRENCY_DEFAULT);

    if (!s.cart || typeof s.cart !== 'object') s.cart = { itemsById: {}, order: [] };
    if (!s.cart.itemsById || typeof s.cart.itemsById !== 'object') s.cart.itemsById = {};
    if (!Array.isArray(s.cart.order)) s.cart.order = [];
    s.migrations = s.migrations && typeof s.migrations === 'object' ? s.migrations : {};

    // Remove order entries that no longer exist.
    s.cart.order = s.cart.order.filter((id) => !!s.cart.itemsById[id]);
    return s;
  }

  function readStoredV2Raw() {
    return GM_getValue(STORAGE_KEY_V2, null);
  }

  function parseStoredV2(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return safeJsonParse(raw, null);
    if (typeof raw === 'object') return raw; // Tampermonkey may serialize objects directly.
    return null;
  }

  function writeStoredV2(nextState) {
    // Store as JSON string for portability.
    GM_setValue(STORAGE_KEY_V2, JSON.stringify(nextState));
  }

  function getSettings() {
    if (!state) state = loadState();
    return state.settings;
  }

  function loadState() {
    const raw = readStoredV2Raw();
    let s = normalizeState(parseStoredV2(raw));
    s = maybeMigrateV1ToV2(s);
    state = s;
    return s;
  }

  function saveState(reason) {
    if (!state) state = loadState();
    state.updatedAt = Date.now();
    state.scriptVersion = SCRIPT_VERSION;
    writeStoredV2(state);
    logDebug('State saved', { reason, count: state.cart.order.length });
  }

  function readV1Raw() {
    // v1 stored arrays directly (not JSON string) via GM_setValue.
    const v = GM_getValue(STORAGE_KEY_V1, null);
    if (!v) return null;
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      const parsed = safeJsonParse(v, null);
      if (Array.isArray(parsed)) return parsed;
    }
    return null;
  }

  function makeVariantHash({ title, variantSignature }) {
    // Strong, deterministic identity is ASIN + variantHash.
    // In practice, Amazon variants usually have distinct ASINs; when we don't have a reliable
    // variant signature, we fall back to the stable value "base" (dedupe by ASIN).
    const v = normalizeSpace(variantSignature || '').toLowerCase();
    if (!v) return 'base';
    return fnv1aBase36(`variant:${v}`);
  }

  function makeItemId(asin, variantHash) {
    return `${asin}.${variantHash}`;
  }

  function maybeMigrateV1ToV2(s) {
    if (s.migrations?.v1 && s.migrations.v1.migratedAt) return s;
    const v1 = readV1Raw();
    if (!v1 || !v1.length) return s;

    const ts = Date.now();
    let migrated = 0;
    let deduped = 0;

    for (const rawItem of v1) {
      const asin = String(rawItem?.asin || '').trim().toUpperCase();
      if (!asin || asin.length !== 10) continue;

      const title = normalizeSpace(rawItem?.title || '') || null;
      const url = canonicalizeUrl(rawItem?.url || canonicalProductUrlFromAsin(asin));

      // Migration: legacy identity uses asin + hash(normalizedTitle). This is deterministic and
      // keeps distinct titles as distinct entries when v1 accidentally created duplicates.
      const variantHash = makeVariantHash({ title, variantSignature: null });
      const id = makeItemId(asin, variantHash);

      const existing = s.cart.itemsById[id];
      if (existing) {
        deduped++;
        existing.quantity = clampInt((existing.quantity || 1) + 1, 1, 999, existing.quantity || 1);
        // Merge missing fields only (keep original edits if any).
        existing.title = existing.title || title;
        existing.url = existing.url || url;
        existing.brand = existing.brand || normalizeSpace(rawItem?.brand || '') || null;
        if (!existing.price && rawItem?.price != null) {
          existing.price = {
            amount: Number.isFinite(rawItem.price) ? rawItem.price : null,
            currency: rawItem.currency || null,
            display: rawItem.price != null ? `${rawItem.currency || ''}${rawItem.price}` : null,
          };
        }
        existing.images = uniqStrings([...(existing.images || []), ...(rawItem.images || [])]);
        existing.bullets = uniqStrings([...(existing.bullets || []), ...(rawItem.bullets || [])]);
        existing.updatedAt = ts;
        continue;
      }

      /** @type {CartItemV2} */
      const item = {
        id,
        asin,
        variantHash,
        identityKey: `${asin}|${variantHash}`,
        url,
        title,
        brand: normalizeSpace(rawItem?.brand || '') || null,
        price: rawItem?.price != null
          ? {
              amount: Number.isFinite(rawItem.price) ? rawItem.price : null,
              currency: rawItem.currency || null,
              display: rawItem.currency || rawItem.price != null ? `${rawItem.currency || ''}${rawItem.price}` : null,
            }
          : null,
        listPrice: rawItem?.listPrice != null
          ? {
              amount: Number.isFinite(rawItem.listPrice) ? rawItem.listPrice : null,
              currency: rawItem.currency || null,
              display: rawItem.currency || rawItem.listPrice != null ? `${rawItem.currency || ''}${rawItem.listPrice}` : null,
            }
          : null,
        rating: (rawItem?.stars != null || rawItem?.reviewCount != null)
          ? { stars: Number.isFinite(rawItem.stars) ? rawItem.stars : null, reviewCount: Number.isFinite(rawItem.reviewCount) ? rawItem.reviewCount : null }
          : null,
        images: uniqStrings(rawItem?.images || []),
        bullets: uniqStrings(rawItem?.bullets || []),
        description: normalizeSpace(rawItem?.description || '') || null,
        delivery: rawItem?.deliveryInfo
          ? {
              timeText: rawItem.deliveryInfo.time || null,
              priceText: rawItem.deliveryInfo.price || null,
              cutoffText: rawItem.deliveryInfo.cutoff || null,
              conditionText: rawItem.deliveryInfo.condition || null,
            }
          : null,
        promotions: null,
        tags: [],
        note: '',
        quantity: 1,
        addedAt: Number.isFinite(rawItem?.addedAt) ? rawItem.addedAt : ts,
        updatedAt: ts,
        extraction: {
          pageType: 'migrated-v1',
          extractedAt: ts,
          selectors: {},
          confidence: { overall: 0.3, fields: {} },
          diagnostics: { missing: [], notes: ['Migrated from v1 (GPT_CART_V1).'] },
        },
        enrichment: null,
      };

      s.cart.itemsById[id] = item;
      s.cart.order.push(id);
      migrated++;
    }

    s.migrations.v1 = {
      migratedAt: ts,
      sourceCount: v1.length,
      migratedCount: migrated,
      dedupedCount: deduped,
    };
    s.updatedAt = ts;
    logInfo('Migrated v1 cart → v2', s.migrations.v1);
    // Persist migration immediately so it is one-time.
    state = s;
    saveState('migrate-v1');
    return s;
  }

  // ===========================================================================
  // Page detection
  // ===========================================================================
  function detectPageType() {
    const path = location.pathname || '';

    // Product snapshot confirms: /gp/product/<ASIN>/... has #productTitle and input#ASIN.
    if (/\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(path) || qs('#productTitle') || qs('input#ASIN')) {
      return PAGE_TYPES.product;
    }

    // Search snapshot confirms: /s and result items use data-component-type="s-search-result".
    if (path === '/s' || path.startsWith('/s') || qs('[data-component-type="s-search-result"][data-asin]')) {
      return PAGE_TYPES.search;
    }

    // Cart snapshot confirms: /gp/cart/view.html has div[data-asin].
    if (path.includes('/gp/cart/view.html') || path.includes('/cart/view')) {
      return PAGE_TYPES.cart;
    }

    return PAGE_TYPES.other;
  }

  // ===========================================================================
  // Extraction (product/search/cart)
  // Each extractor returns: { asin, url, fields, selectors, confidence, diagnostics }
  // ===========================================================================
  function computeConfidence(selectors, fields) {
    /** @type {Record<string, number|null>} */
    const out = {};
    let sum = 0;
    let count = 0;

    for (const [k, sel] of Object.entries(selectors)) {
      const v = fields[k];
      const present = v !== null && v !== undefined && (typeof v !== 'string' || normalizeSpace(v));
      if (!present) {
        out[k] = null;
        continue;
      }
      // Simple heuristic: primary selectors get higher confidence.
      const c = sel ? (sel.includes('#') ? 0.95 : 0.8) : 0.6;
      out[k] = c;
      sum += c;
      count++;
    }

    return {
      overall: count ? Math.round((sum / count) * 100) / 100 : 0,
      fields: out,
    };
  }

  function makeDiagnostics(fields) {
    const missing = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v == null) missing.push(k);
      if (typeof v === 'string' && !normalizeSpace(v)) missing.push(k);
    }
    return { missing: uniqStrings(missing), notes: [] };
  }

  function extractProductPage() {
    const extractedAt = Date.now();
    const selectors = {
      asin: 'input#ASIN',
      title: '#productTitle',
      brand: '#bylineInfo',
      price: '#corePrice_feature_div .a-price .a-offscreen',
      listPrice: '#corePrice_desktop .a-text-price .a-offscreen',
      stars: '#acrPopover[title]',
      reviewCount: '#acrCustomerReviewText',
      bullets: '#feature-bullets li span',
      description: '#productDescription',
      image: '#imgTagWrapperId img[data-old-hires]',
      delivery: '#deliveryBlock_feature_div span[data-csa-c-type="element"]',
    };

    let asin = getAttr(selectors.asin, 'value');
    if (!asin) asin = extractAsinFromUrl(location.href);
    asin = asin ? asin.toUpperCase() : null;

    const title = getText(selectors.title);
    const brand = normalizeSpace(getText(selectors.brand) || getText('#brand') || '') || null;

    // Price: prioritize .a-offscreen within corePrice_feature_div per snapshot.
    const priceText = getText(selectors.price)
      || getText('#corePriceDisplay_desktop_feature_div .a-price .a-offscreen')
      || getText('.a-price .a-offscreen');
    const price = priceText ? parsePriceFromText(priceText) : null;

    const listPriceText = getText(selectors.listPrice);
    const listPrice = listPriceText ? parsePriceFromText(listPriceText) : null;

    const starsTitle = getAttr('#acrPopover', 'title');
    const stars = starsTitle ? Number.parseFloat((starsTitle.match(/([\d.]+)\s+out/i)?.[1]) || '') : null;

    const reviewCountText = getText(selectors.reviewCount);
    const reviewCount = reviewCountText ? parseIntFromText(reviewCountText) : null;

    // Bullets
    const bulletEls = qsa('#feature-bullets li span');
    const bullets = uniqStrings(bulletEls.map((e) => normalizeSpace(e.textContent)));

    // Description
    const description =
      normalizeSpace(qs('#productDescription')?.innerText || '')
      || normalizeSpace(qs('#productDescription_feature_div')?.innerText || '')
      || null;

    // Image(s)
    const img = qs('#imgTagWrapperId img');
    const images = uniqStrings([
      img?.getAttribute('data-old-hires'),
      img?.getAttribute('src'),
    ].filter(Boolean));

    // Delivery (snapshot confirms data-csa-c-delivery-* attributes)
    const deliverySpan = qs('#deliveryBlock_feature_div span[data-csa-c-type="element"]');
    const delivery = deliverySpan
      ? {
          timeText: deliverySpan.getAttribute('data-csa-c-delivery-time') || null,
          priceText: deliverySpan.getAttribute('data-csa-c-delivery-price') || null,
          cutoffText: deliverySpan.getAttribute('data-csa-c-delivery-cutoff') || null,
          conditionText: deliverySpan.getAttribute('data-csa-c-delivery-condition') || null,
        }
      : null;

    const url = asin ? canonicalProductUrlFromAsin(asin) : canonicalizeUrl(location.href);

    /** @type {any} */
    const fields = {
      asin,
      url,
      title,
      brand,
      price,
      listPrice,
      stars: Number.isFinite(stars) ? stars : null,
      reviewCount,
      bullets,
      description,
      images,
      delivery,
    };

    const confidence = computeConfidence(selectors, {
      asin,
      title,
      brand,
      price: price?.display || null,
      listPrice: listPrice?.display || null,
      stars: starsTitle || null,
      reviewCount: reviewCountText || null,
      bullets: bullets.length ? 'ok' : null,
      description,
      image: images.length ? 'ok' : null,
      delivery: deliverySpan ? 'ok' : null,
    });

    const diagnostics = makeDiagnostics({
      asin,
      title,
      price: price?.display || null,
      images: images.length ? 'ok' : null,
    });

    const extraction = {
      pageType: PAGE_TYPES.product,
      extractedAt,
      url,
      asin,
      fields,
      selectors,
      confidence,
      diagnostics,
    };
    runtime.lastExtraction = extraction;
    runtime.sessionCache.asinToExtraction.set(asin || '', extraction);
    logDebug('Extracted product page', { asin, confidence });
    return extraction;
  }

  async function extractProductPageWithRetries({ timeoutMs = 2800 } = {}) {
    // Resist partial/lazy DOM: wait briefly for primary markers, then re-extract.
    await waitForSelector('#productTitle', { timeoutMs });
    await waitForSelector('input#ASIN', { timeoutMs });

    const start = Date.now();
    let ex = extractProductPage();
    while (Date.now() - start < timeoutMs) {
      const ok = ex?.asin && ex?.fields?.title && (ex?.fields?.price?.display || ex?.fields?.images?.length);
      if (ok) break;
      await sleep(180);
      ex = extractProductPage();
    }
    return ex;
  }

  function extractSearchResult(resultEl) {
    const extractedAt = Date.now();
    const asin = (resultEl.getAttribute('data-asin') || '').trim().toUpperCase() || null;
    const selectors = {
      title: 'h2 a span',
      url: 'h2 a',
      image: 'img.s-image',
      price: '.a-price .a-offscreen',
      stars: 'i.a-icon-star-mini .a-icon-alt',
      reviewCount: 'a[href*="#customerReviews"] span[aria-hidden="true"], a[href*="#customerReviews"]',
      coupon: '[data-component-type="s-coupon-component"] .s-coupon-unclipped',
      delivery: '.udm-primary-delivery-message',
    };

    const title =
      normalizeSpace(resultEl.querySelector('h2 a span')?.textContent || '')
      || null;

    const href = resultEl.querySelector('h2 a')?.getAttribute('href') || null;
    // Use canonical DP URL (search results often wrap links via /sspa/click etc).
    const url = asin ? canonicalProductUrlFromAsin(asin) : (href ? canonicalizeUrl(new URL(href, location.origin).toString()) : canonicalizeUrl(location.href));

    const img = resultEl.querySelector('img.s-image');
    const images = uniqStrings([
      img?.getAttribute('src'),
      img?.getAttribute('data-src'),
    ].filter(Boolean));

    const priceText = normalizeSpace(resultEl.querySelector('.a-price .a-offscreen')?.textContent || '') || null;
    const price = priceText ? parsePriceFromText(priceText) : null;

    const starsAlt = normalizeSpace(resultEl.querySelector('i.a-icon-star-mini .a-icon-alt')?.textContent || '') || null;
    const stars = starsAlt ? Number.parseFloat((starsAlt.match(/([\d.]+)\s+out/i)?.[1]) || '') : null;

    const reviewCountAnchor = resultEl.querySelector('a[href*="#customerReviews"]');
    const reviewCountText = normalizeSpace(reviewCountAnchor?.getAttribute('aria-label') || reviewCountAnchor?.textContent || '') || null;
    const reviewCount = reviewCountText ? parseIntFromText(reviewCountText) : null;

    const couponText = normalizeSpace(resultEl.querySelector('[data-component-type="s-coupon-component"] .s-coupon-unclipped')?.textContent || '') || null;

    const deliveryText = normalizeSpace(resultEl.querySelector('.udm-primary-delivery-message')?.textContent || '') || null;

    const delivery = deliveryText
      ? {
          timeText: deliveryText,
          priceText: /free/i.test(deliveryText) ? 'FREE' : null,
          cutoffText: null,
          conditionText: null,
        }
      : null;

    const promotions = couponText
      ? { couponText, dealText: null }
      : null;

    /** @type {any} */
    const fields = {
      asin,
      url,
      title,
      brand: null,
      price,
      listPrice: null,
      images,
      rating: { stars: Number.isFinite(stars) ? stars : null, reviewCount },
      bullets: [],
      description: null,
      delivery,
      promotions,
      variantSignature: null,
    };

    const confidence = computeConfidence(selectors, {
      title,
      url: href || null,
      image: images.length ? 'ok' : null,
      price: price?.display || null,
      stars: starsAlt,
      reviewCount: reviewCountText,
      coupon: couponText,
      delivery: deliveryText,
    });

    const diagnostics = makeDiagnostics({
      asin,
      title,
      price: price?.display || null,
      images: images.length ? 'ok' : null,
    });

    const extraction = {
      pageType: PAGE_TYPES.search,
      extractedAt,
      url,
      asin,
      fields,
      selectors,
      confidence,
      diagnostics,
    };

    if (asin) runtime.sessionCache.asinToExtraction.set(asin, extraction);
    return extraction;
  }

  function extractSearchPageResults() {
    const results = qsa('[data-component-type="s-search-result"][data-asin]').filter((el) => {
      const asin = (el.getAttribute('data-asin') || '').trim();
      return asin && asin.length === 10;
    });
    return results.map(extractSearchResult);
  }

  async function extractSearchPageResultsWithRetries({ timeoutMs = 2800 } = {}) {
    await waitForSelector('[data-component-type="s-search-result"][data-asin]', { timeoutMs });
    return extractSearchPageResults();
  }

  function extractCartPageAsins() {
    const asins = qsa('div[data-asin]')
      .map((d) => (d.getAttribute('data-asin') || '').trim().toUpperCase())
      .filter((a) => a && a.length === 10);
    return uniqStrings(asins);
  }

  // ===========================================================================
  // Cart operations
  // ===========================================================================
  function upsertItemFromExtraction(extraction) {
    if (!state) state = loadState();

    const asin = extraction?.asin || extraction?.fields?.asin;
    if (!asin || String(asin).length !== 10) {
      throw new Error('Missing ASIN in extraction');
    }

    const url = canonicalizeUrl(extraction?.url || extraction?.fields?.url || canonicalProductUrlFromAsin(asin));
    const title = normalizeSpace(extraction?.fields?.title || '') || null;

    const variantHash = makeVariantHash({
      title,
      variantSignature: extraction?.fields?.variantSignature || null,
    });
    const id = makeItemId(asin, variantHash);

    const nowTs = Date.now();
    const existing = state.cart.itemsById[id];

    /** @type {CartItemV2} */
    const incoming = {
      id,
      asin,
      variantHash,
      identityKey: `${asin}|${variantHash}`,
      url,
      title,
      brand: normalizeSpace(extraction?.fields?.brand || '') || null,
      price: extraction?.fields?.price || null,
      listPrice: extraction?.fields?.listPrice || null,
      rating: extraction?.fields?.rating
        ? extraction.fields.rating
        : (extraction?.fields?.stars != null || extraction?.fields?.reviewCount != null)
          ? { stars: extraction.fields.stars ?? null, reviewCount: extraction.fields.reviewCount ?? null }
          : null,
      images: uniqStrings(extraction?.fields?.images || []),
      bullets: uniqStrings(extraction?.fields?.bullets || []),
      description: normalizeSpace(extraction?.fields?.description || '') || null,
      delivery: extraction?.fields?.delivery || null,
      promotions: extraction?.fields?.promotions || null,
      tags: [],
      note: '',
      quantity: 1,
      addedAt: nowTs,
      updatedAt: nowTs,
      extraction: extraction
        ? {
            pageType: extraction.pageType,
            extractedAt: extraction.extractedAt,
            selectors: extraction.selectors || {},
            confidence: extraction.confidence || { overall: 0, fields: {} },
            diagnostics: extraction.diagnostics || { missing: [], notes: [] },
          }
        : null,
      enrichment: null,
    };

    if (!existing) {
      state.cart.itemsById[id] = incoming;
      state.cart.order.push(id);
      saveState('add-item');
      toast(`Added: ${title || asin}`);
      return { id, wasNew: true };
    }

    // Merge: preserve edits, prefer new extracted values when existing is missing.
    existing.url = existing.url || incoming.url;
    existing.title = existing.title || incoming.title;
    existing.brand = existing.brand || incoming.brand;
    existing.price = existing.price || incoming.price;
    existing.listPrice = existing.listPrice || incoming.listPrice;
    existing.rating = existing.rating || incoming.rating;
    existing.images = uniqStrings([...(existing.images || []), ...(incoming.images || [])]);
    existing.bullets = uniqStrings([...(existing.bullets || []), ...(incoming.bullets || [])]);
    existing.description = existing.description || incoming.description;
    existing.delivery = existing.delivery || incoming.delivery;
    existing.promotions = existing.promotions || incoming.promotions;
    existing.extraction = incoming.extraction || existing.extraction;
    existing.updatedAt = nowTs;

    saveState('merge-item');
    toast(`Already in cart: ${existing.title || asin}`);
    return { id, wasNew: false };
  }

  function removeItem(id) {
    if (!state) state = loadState();
    if (!state.cart.itemsById[id]) return;
    delete state.cart.itemsById[id];
    state.cart.order = state.cart.order.filter((x) => x !== id);
    saveState('remove-item');
  }

  function clearCart() {
    if (!state) state = loadState();
    state.cart.itemsById = {};
    state.cart.order = [];
    saveState('clear-cart');
  }

  function updateItemEdits(id, { quantity, note, tags }) {
    if (!state) state = loadState();
    const item = state.cart.itemsById[id];
    if (!item) return;

    if (quantity !== undefined) item.quantity = clampInt(quantity, 1, 999, item.quantity || 1);
    if (note !== undefined) item.note = String(note ?? '');
    if (tags !== undefined) item.tags = uniqStrings(String(tags ?? '').split(','));

    item.updatedAt = Date.now();
    saveState('edit-item');
  }

  // ===========================================================================
  // Optional enrichment (disabled by default)
  // ===========================================================================
  function gmXmlHttpRequest(opts) {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          ...opts,
          onload: (res) => resolve(res),
          onerror: (e) => reject(e),
          ontimeout: (e) => reject(e),
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function enrichWithAmazonFetch(asin) {
    const url = canonicalProductUrlFromAsin(asin);
    const res = await gmXmlHttpRequest({ method: 'GET', url });
    const doc = new DOMParser().parseFromString(res.responseText, 'text/html');

    const title = normalizeSpace(getText('#productTitle', doc) || '') || null;
    const brand = normalizeSpace(getText('#bylineInfo', doc) || getText('#brand', doc) || '') || null;
    const priceText = getText('#corePrice_feature_div .a-price .a-offscreen', doc) || getText('.a-price .a-offscreen', doc);
    const price = priceText ? parsePriceFromText(priceText) : null;
    const img = qs('#imgTagWrapperId img', doc);
    const images = uniqStrings([img?.getAttribute('data-old-hires'), img?.getAttribute('src')].filter(Boolean));
    const bullets = uniqStrings(qsa('#feature-bullets li span', doc).map((e) => normalizeSpace(e.textContent)));

    return { title, brand, price, images, bullets };
  }

  async function enrichWithShopWisely(asin) {
    // Mirrors v1 call; failure must be tolerated and must never block add.
    const payload = {
      platform: { platform: 'tampermonkey', version: SCRIPT_VERSION },
      page: {
        site: 'amazon',
        domain: location.hostname,
        url: canonicalizeUrl(location.href),
        title: document.title,
      },
      mainElements: { id: asin },
    };

    const res = await gmXmlHttpRequest({
      method: 'POST',
      url: 'https://shopwisely.ai/frame/product/api/insights',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      data: JSON.stringify(payload),
    });
    const json = safeJsonParse(res.responseText, null);
    return json?.response || json || null;
  }

  async function maybeEnrichItem(id) {
    if (!state) state = loadState();
    const item = state.cart.itemsById[id];
    if (!item) return;

    const settings = getSettings();
    const asin = item.asin;
    item.enrichment = item.enrichment || {};

    if (settings.enableAmazonFetchEnrichment) {
      item.enrichment.amazonFetch = { enabled: true, attemptedAt: Date.now() };
      try {
        const cached = runtime.sessionCache.asinToAmazonEnrichment.get(asin) || null;
        const enriched = cached || await enrichWithAmazonFetch(asin);
        if (!cached) runtime.sessionCache.asinToAmazonEnrichment.set(asin, enriched);
        item.title = item.title || enriched.title;
        item.brand = item.brand || enriched.brand;
        item.price = item.price || enriched.price;
        item.images = uniqStrings([...(item.images || []), ...(enriched.images || [])]);
        item.bullets = uniqStrings([...(item.bullets || []), ...(enriched.bullets || [])]);
        item.enrichment.amazonFetch.ok = true;
      } catch (e) {
        item.enrichment.amazonFetch.ok = false;
        item.enrichment.amazonFetch.error = String(e?.message || e);
      }
    } else {
      item.enrichment.amazonFetch = { enabled: false };
    }

    if (settings.enableThirdPartyEnrichment) {
      item.enrichment.thirdParty = { enabled: true, attemptedAt: Date.now() };
      try {
        const cached = runtime.sessionCache.asinToThirdPartyEnrichment.get(asin) || null;
        const wisely = cached || await enrichWithShopWisely(asin);
        if (!cached) runtime.sessionCache.asinToThirdPartyEnrichment.set(asin, wisely);
        // Keep raw; do not aggressively map into core fields.
        item.enrichment.thirdParty.ok = true;
        item.enrichment.thirdParty.wisely = wisely;
      } catch (e) {
        item.enrichment.thirdParty.ok = false;
        item.enrichment.thirdParty.error = String(e?.message || e);
      }
    } else {
      item.enrichment.thirdParty = { enabled: false };
    }

    item.updatedAt = Date.now();
    saveState('enrich-item');
  }

  // ===========================================================================
  // Bulk operations (concurrency + cancel + progress)
  // ===========================================================================
  function createBulkTracker(total) {
    return {
      id: fnv1aBase36(String(Date.now()) + Math.random()),
      total,
      done: 0,
      errors: 0,
      cancelled: false,
    };
  }

  async function runWithConcurrency(tasks, concurrency, onProgress, isCancelled) {
    const q = tasks.slice();
    const workers = [];

    async function worker() {
      while (q.length) {
        if (isCancelled && isCancelled()) return;
        const t = q.shift();
        if (!t) return;
        try {
          await t();
        } catch (e) {
          // caller counts errors
          logWarn('Bulk task failed', e);
        } finally {
          onProgress && onProgress();
        }
      }
    }

    const n = Math.max(1, Math.min(concurrency, 10));
    for (let i = 0; i < n; i++) workers.push(worker());
    await Promise.all(workers);
  }

  async function bulkAddSearchResults() {
    const settings = getSettings();
    const extractions = await extractSearchPageResultsWithRetries();
    const tracker = createBulkTracker(extractions.length);
    runtime.ui.bulk = tracker;
    renderUi();

    const tasks = extractions.map((ex) => async () => {
      if (tracker.cancelled) return;
      try {
        const { id } = upsertItemFromExtraction(ex);
        if (settings.enableAmazonFetchEnrichment || settings.enableThirdPartyEnrichment) {
          await maybeEnrichItem(id);
        }
      } catch (e) {
        tracker.errors++;
      }
    });

    await runWithConcurrency(
      tasks,
      clampInt(settings.maxConcurrency, 1, 10, MAX_CONCURRENCY_DEFAULT),
      () => {
        tracker.done++;
        renderUi();
      },
      () => tracker.cancelled
    );

    runtime.ui.bulk = null;
    renderUi();
    toast(`Bulk add done (${tracker.total - tracker.errors}/${tracker.total})`);
  }

  async function bulkAddCartAsins() {
    const settings = getSettings();
    const asins = extractCartPageAsins();
    const tracker = createBulkTracker(asins.length);
    runtime.ui.bulk = tracker;
    renderUi();

    const tasks = asins.map((asin) => async () => {
      if (tracker.cancelled) return;
      try {
        const extraction = {
          pageType: PAGE_TYPES.cart,
          extractedAt: Date.now(),
          url: canonicalProductUrlFromAsin(asin),
          asin,
          fields: { asin, url: canonicalProductUrlFromAsin(asin), title: null, brand: null, price: null, listPrice: null, rating: null, images: [], bullets: [], description: null, delivery: null },
          selectors: {},
          confidence: { overall: 0.2, fields: {} },
          diagnostics: { missing: ['title', 'price', 'images'], notes: ['Added from Amazon Cart ASIN list.'] },
        };
        const { id } = upsertItemFromExtraction(extraction);
        if (settings.enableAmazonFetchEnrichment || settings.enableThirdPartyEnrichment) {
          await maybeEnrichItem(id);
        }
      } catch (e) {
        tracker.errors++;
      }
    });

    await runWithConcurrency(
      tasks,
      clampInt(settings.maxConcurrency, 1, 10, MAX_CONCURRENCY_DEFAULT),
      () => {
        tracker.done++;
        renderUi();
      },
      () => tracker.cancelled
    );

    runtime.ui.bulk = null;
    renderUi();
    toast(`Bulk add done (${tracker.total - tracker.errors}/${tracker.total})`);
  }

  // ===========================================================================
  // Exporters
  // ===========================================================================
  function buildExportPayload(includeDiagnostics) {
    if (!state) state = loadState();

    const items = state.cart.order
      .map((id) => state.cart.itemsById[id])
      .filter(Boolean)
      .map((it) => ({
        id: it.id,
        asin: it.asin,
        variantHash: it.variantHash,
        url: it.url,
        title: it.title,
        brand: it.brand,
        price: it.price,
        listPrice: it.listPrice,
        rating: it.rating,
        images: it.images,
        bullets: it.bullets,
        description: it.description,
        delivery: it.delivery,
        promotions: it.promotions,
        tags: it.tags,
        note: it.note,
        quantity: it.quantity,
        addedAt: it.addedAt,
        updatedAt: it.updatedAt,
        ...(includeDiagnostics ? { extraction: it.extraction, enrichment: it.enrichment } : {}),
      }));

    return {
      schemaVersion: 2,
      scriptVersion: SCRIPT_VERSION,
      exportedAt: Date.now(),
      page: { url: canonicalizeUrl(location.href), pageType: runtime.currentPageType },
      itemCount: items.length,
      items,
    };
  }

  function exportJson(includeDiagnostics) {
    return JSON.stringify(buildExportPayload(includeDiagnostics), null, 2);
  }

  function exportCsv() {
    if (!state) state = loadState();
    const rows = [];
    const header = ['asin', 'variantHash', 'title', 'brand', 'price', 'currency', 'url', 'quantity', 'tags', 'note'];
    rows.push(header);

    for (const id of state.cart.order) {
      const it = state.cart.itemsById[id];
      if (!it) continue;
      rows.push([
        it.asin,
        it.variantHash,
        (it.title || '').replace(/\s+/g, ' ').trim(),
        it.brand || '',
        it.price?.amount != null ? String(it.price.amount) : '',
        it.price?.currency || '',
        it.url,
        String(it.quantity || 1),
        (it.tags || []).join('|'),
        (it.note || '').replace(/\r?\n/g, '\\n'),
      ]);
    }

    // CSV escaping
    return rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '');
            if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          })
          .join(',')
      )
      .join('\n');
  }

  function exportMarkdown() {
    if (!state) state = loadState();
    const lines = [];
    lines.push(`# GPT Cart (${state.cart.order.length} items)`);
    lines.push('');

    for (const id of state.cart.order) {
      const it = state.cart.itemsById[id];
      if (!it) continue;
      const title = it.title || it.asin;
      const price = it.price?.display || (it.price?.amount != null ? `${it.price.currency || ''}${it.price.amount}` : '');
      const tags = it.tags?.length ? `Tags: ${it.tags.join(', ')}` : '';
      const note = normalizeSpace(it.note) ? `Note: ${normalizeSpace(it.note)}` : '';
      const qty = it.quantity ? `Qty: ${it.quantity}` : '';

      const meta = [price && `Price: ${price}`, qty, tags, note].filter(Boolean).join(' · ');
      lines.push(`- [${title}](${it.url})${meta ? ` — ${meta}` : ''}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  async function copyToClipboard(text) {
    try {
      GM_setClipboard(text);
      return true;
    } catch (e) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ===========================================================================
  // UI (Shadow DOM)
  // ===========================================================================
  function ensureUiMounted() {
    if (runtime.ui.mounted) return;

    const root = document.createElement('div');
    root.id = UI_ROOT_ID;
    root.style.position = 'fixed';
    root.style.zIndex = '2147483647';
    root.style.inset = 'auto 16px 16px auto';
    root.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .agc2 { all: initial; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; }
        .fabRow { display:flex; gap:8px; align-items:center; }
        .btn { all: unset; cursor:pointer; user-select:none; padding:8px 10px; border-radius:10px; background:#111; color:#fff; font-size:12px; font-weight:600; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
        .btn.secondary { background:#333; }
        .btn.danger { background:#b42318; }
        .btn:focus { outline:2px solid #4c9ffe; outline-offset:2px; }
        .pill { font-weight:700; }
        .panelBackdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); display:none; }
        .drawer { position: fixed; top: 0; right: 0; width: min(520px, 95vw); height: 100vh; background: #fff; box-shadow: -8px 0 24px rgba(0,0,0,.25); transform: translateX(110%); transition: transform .18s ease; display:flex; flex-direction:column; }
        .drawerHeader { padding: 14px 14px 10px 14px; border-bottom: 1px solid #eee; display:flex; gap:10px; align-items:center; justify-content:space-between; }
        .drawerHeader h3 { margin:0; font-size: 14px; }
        .drawerBody { padding: 12px 14px; overflow:auto; flex: 1; }
        .row { display:flex; gap:10px; align-items:center; }
        .col { display:flex; flex-direction:column; gap:8px; }
        .input, .textarea, .select { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 10px; font-size: 12px; }
        .textarea { min-height: 60px; resize: vertical; }
        .item { border: 1px solid #eee; border-radius: 12px; padding: 10px; margin-bottom: 10px; }
        .itemTitle { font-weight: 700; font-size: 12px; margin-bottom: 6px; }
        .itemMeta { color: #444; font-size: 12px; margin-bottom: 8px; }
        .itemActions { display:flex; gap:8px; flex-wrap:wrap; margin-top: 8px; }
        .link { color: #0b57d0; text-decoration: none; }
        .small { font-size: 11px; color: #555; }
        .modal { position: fixed; inset: 0; display:none; align-items:center; justify-content:center; }
        .modalCard { width: min(720px, 92vw); max-height: 85vh; background:#fff; border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,.35); overflow:hidden; display:flex; flex-direction:column; }
        .modalHeader { padding: 14px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
        .modalBody { padding: 12px 14px; overflow:auto; }
        .code { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 11px; white-space: pre; }
        .badge { display:inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; background:#f2f4f7; color:#111; border: 1px solid #eaecf0; }
      </style>
      <div class="agc2">
        <div class="fabRow">
          <button class="btn secondary" data-action="addCurrent">Add</button>
          <button class="btn" data-action="toggleDrawer">Cart <span class="pill" data-bind="count">0</span></button>
        </div>

        <div class="panelBackdrop" data-bind="backdrop"></div>
        <div class="drawer" data-bind="drawer" role="dialog" aria-label="GPT Cart Drawer" aria-modal="true">
          <div class="drawerHeader">
            <h3>GPT Cart <span class="badge" data-bind="countBadge">0</span></h3>
            <div class="row">
              <button class="btn secondary" data-action="openExport">Export</button>
              <button class="btn secondary" data-action="openSettings">Settings</button>
              <button class="btn" data-action="closeDrawer">Close</button>
            </div>
          </div>
          <div class="drawerBody">
            <div class="col" style="margin-bottom:10px;">
              <input class="input" data-bind="filter" placeholder="Search title/asin/tags..." />
              <div class="row">
                <select class="select" data-bind="sort">
                  <option value="addedAt_desc">Newest</option>
                  <option value="addedAt_asc">Oldest</option>
                  <option value="title_asc">Title A→Z</option>
                  <option value="title_desc">Title Z→A</option>
                </select>
                <button class="btn secondary" data-action="bulkAddSearch" style="display:none;" data-bind="bulkSearchBtn">Add all results</button>
                <button class="btn secondary" data-action="bulkAddCart" style="display:none;" data-bind="bulkCartBtn">Add all cart items</button>
              </div>
              <div class="row" style="justify-content:space-between;">
                <button class="btn danger" data-action="clearCart">Clear cart</button>
                <button class="btn secondary" data-action="copyDebug">Copy debug report</button>
              </div>
              <div class="small" data-bind="bulkStatus" style="display:none;"></div>
              <div class="row" style="display:none;" data-bind="bulkRow">
                <button class="btn danger" data-action="cancelBulk">Cancel bulk</button>
              </div>
            </div>
            <div data-bind="items"></div>
          </div>
        </div>

        <div class="modal" data-bind="exportModal" role="dialog" aria-label="Export" aria-modal="true">
          <div class="modalCard">
            <div class="modalHeader">
              <div class="row" style="gap:10px;">
                <h3 style="margin:0;font-size:14px;">Export</h3>
                <span class="badge" data-bind="countBadge2">0</span>
              </div>
              <div class="row">
                <button class="btn secondary" data-action="closeExport">Close</button>
              </div>
            </div>
            <div class="modalBody">
              <div class="row" style="margin-bottom:10px;">
                <select class="select" data-bind="exportFormat">
                  <option value="json">JSON (LLM-ready)</option>
                  <option value="csv">CSV</option>
                  <option value="md">Markdown</option>
                </select>
                <label class="small" style="display:flex;align-items:center;gap:8px;">
                  <input type="checkbox" data-bind="exportDiagnostics" />
                  Include diagnostics
                </label>
              </div>
              <div class="row" style="margin-bottom:10px; gap:8px; flex-wrap:wrap;">
                <button class="btn secondary" data-action="refreshExport">Refresh</button>
                <button class="btn secondary" data-action="copyExport">Copy</button>
                <button class="btn secondary" data-action="downloadExport">Download</button>
              </div>
              <textarea class="textarea code" data-bind="exportText" spellcheck="false"></textarea>
            </div>
          </div>
        </div>

        <div class="modal" data-bind="settingsModal" role="dialog" aria-label="Settings" aria-modal="true">
          <div class="modalCard">
            <div class="modalHeader">
              <h3 style="margin:0;font-size:14px;">Settings</h3>
              <button class="btn secondary" data-action="closeSettings">Close</button>
            </div>
            <div class="modalBody">
              <div class="col">
                <label class="small"><input type="checkbox" data-bind="debugEnabled" /> Debug mode (console + richer reports)</label>
                <label class="small"><input type="checkbox" data-bind="showSearchInlineButtons" /> Show “Add” buttons on search results</label>
                <label class="small"><input type="checkbox" data-bind="enableAmazonFetchEnrichment" /> Optional Amazon fetch enrichment (remote)</label>
                <label class="small"><input type="checkbox" data-bind="enableThirdPartyEnrichment" /> Optional third-party enrichment (ShopWisely) (remote)</label>
                <label class="small">Max concurrency: <input class="input" style="max-width:120px;display:inline-block;margin-left:8px;" data-bind="maxConcurrency" type="number" min="1" max="10" /></label>
                <div class="row" style="margin-top:8px;">
                  <button class="btn" data-action="saveSettings">Save settings</button>
                </div>
                <div class="small">Remote/enrichment features are disabled by default and never block adding items.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    runtime.ui.root = root;
    runtime.ui.shadow = shadow;
    runtime.ui.mounted = true;

    document.documentElement.appendChild(root);

    // Click handlers (event delegation)
    shadow.addEventListener('click', async (ev) => {
      const target = /** @type {HTMLElement|null} */ (ev.target instanceof HTMLElement ? ev.target : null);
      const btn = target?.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (!action) return;

      try {
        await handleUiAction(action, btn);
      } catch (e) {
        logError(`UI action failed: ${action}`, e);
        toast(`Error: ${action}`);
      }
    });

    // Inputs (filter/sort/export/settings edits)
    shadow.addEventListener('input', (ev) => {
      const el = /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null} */ (ev.target);
      if (!el) return;

      const bind = el.getAttribute('data-bind');
      if (!bind) return;

      if (bind === 'filter' || bind === 'sort') {
        renderUi(); // rerender items list with new filter/sort
      }

      if (bind === 'exportFormat' || bind === 'exportDiagnostics') {
        refreshExportText();
      }
    });

    // ESC closes drawer/modals
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (runtime.ui.settingsOpen) {
        runtime.ui.settingsOpen = false;
        renderUi();
        return;
      }
      if (runtime.ui.exportOpen) {
        runtime.ui.exportOpen = false;
        renderUi();
        return;
      }
      if (runtime.ui.drawerOpen) {
        runtime.ui.drawerOpen = false;
        renderUi();
      }
    });
  }

  function toast(msg) {
    // Minimal, non-intrusive: reuse console + optional alert-style quick indicator.
    logInfo(msg);
  }

  function getBindEl(name) {
    return runtime.ui.shadow?.querySelector(`[data-bind="${name}"]`) || null;
  }

  function getDrawerEls() {
    return {
      backdrop: getBindEl('backdrop'),
      drawer: getBindEl('drawer'),
      exportModal: getBindEl('exportModal'),
      settingsModal: getBindEl('settingsModal'),
    };
  }

  function getUiValue(bind) {
    const el = /** @type {any} */ (getBindEl(bind));
    if (!el) return null;
    if (el.type === 'checkbox') return !!el.checked;
    return el.value;
  }

  function setUiValue(bind, value) {
    const el = /** @type {any} */ (getBindEl(bind));
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = String(value ?? '');
  }

  function renderItemsList() {
    if (!state) state = loadState();
    const container = getBindEl('items');
    if (!container) return;

    const filter = normalizeSpace(getUiValue('filter') || '').toLowerCase();
    const sort = String(getUiValue('sort') || 'addedAt_desc');

    /** @type {CartItemV2[]} */
    let items = state.cart.order.map((id) => state.cart.itemsById[id]).filter(Boolean);

    if (filter) {
      items = items.filter((it) => {
        const hay = [
          it.asin,
          it.title,
          it.brand,
          (it.tags || []).join(' '),
          it.note,
        ].map((x) => normalizeSpace(x || '').toLowerCase()).join(' ');
        return hay.includes(filter);
      });
    }

    const cmp = {
      addedAt_desc: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
      addedAt_asc: (a, b) => (a.addedAt || 0) - (b.addedAt || 0),
      title_asc: (a, b) => (a.title || a.asin).localeCompare(b.title || b.asin),
      title_desc: (a, b) => (b.title || b.asin).localeCompare(a.title || a.asin),
    }[sort] || ((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    items = items.slice().sort(cmp);

    const html = items.map((it) => {
      const price = it.price?.display || (it.price?.amount != null ? `${it.price.currency || ''}${it.price.amount}` : '');
      const img = it.images?.[0] || '';
      const title = it.title || it.asin;
      const tags = (it.tags || []).join(', ');
      const note = it.note || '';

      return `
        <div class="item" data-item-id="${it.id}">
          <div class="itemTitle">${escapeHtml(title)}</div>
          <div class="itemMeta">
            <span class="small">${escapeHtml(it.asin)}${price ? ` · ${escapeHtml(price)}` : ''}</span>
            ${img ? `<div style="margin-top:6px;"><img src="${escapeAttr(img)}" style="max-width:110px;max-height:110px;border-radius:10px;border:1px solid #eee;" /></div>` : ''}
          </div>
          <div class="row">
            <label class="small" style="min-width:70px;">Qty</label>
            <input class="input" data-edit="quantity" type="number" min="1" max="999" value="${it.quantity || 1}" />
          </div>
          <div class="row">
            <label class="small" style="min-width:70px;">Tags</label>
            <input class="input" data-edit="tags" placeholder="comma,separated" value="${escapeAttr(tags)}" />
          </div>
          <div class="col">
            <label class="small">Note</label>
            <textarea class="textarea" data-edit="note" placeholder="Notes for GPT / your own context...">${escapeHtml(note)}</textarea>
          </div>
          <div class="itemActions">
            <a class="link" href="${escapeAttr(it.url)}" target="_blank" rel="noreferrer">Open</a>
            <button class="btn secondary" data-action="copyItemJson">Copy JSON</button>
            <button class="btn secondary" data-action="enrichItem">Enrich</button>
            <button class="btn danger" data-action="removeItem">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html || `<div class="small">No items.</div>`;

    // Bind edit listeners for qty/tags/note (per-item)
    container.querySelectorAll('[data-item-id]').forEach((itemEl) => {
      itemEl.addEventListener('change', (ev) => {
        const target = /** @type {HTMLElement|null} */ (ev.target instanceof HTMLElement ? ev.target : null);
        const edit = target?.getAttribute('data-edit');
        if (!edit) return;
        const id = itemEl.getAttribute('data-item-id');
        if (!id) return;

        const val = /** @type {any} */ (target).value;
        if (edit === 'quantity') updateItemEdits(id, { quantity: val });
        if (edit === 'tags') updateItemEdits(id, { tags: val });
        if (edit === 'note') updateItemEdits(id, { note: val });
      });
    });
  }

  function renderUi() {
    ensureUiMounted();
    if (!state) state = loadState();

    runtime.currentPageType = detectPageType();

    // Update top buttons based on page type.
    const addBtn = runtime.ui.shadow?.querySelector('[data-action="addCurrent"]');
    if (addBtn) {
      if (runtime.currentPageType === PAGE_TYPES.product) addBtn.textContent = 'Add product';
      else if (runtime.currentPageType === PAGE_TYPES.search) addBtn.textContent = 'Add all';
      else if (runtime.currentPageType === PAGE_TYPES.cart) addBtn.textContent = 'Add cart';
      else addBtn.textContent = 'Add';
    }

    const count = state.cart.order.length;
    const countEl = getBindEl('count');
    const badge1 = getBindEl('countBadge');
    const badge2 = getBindEl('countBadge2');
    if (countEl) countEl.textContent = String(count);
    if (badge1) badge1.textContent = String(count);
    if (badge2) badge2.textContent = String(count);

    const { backdrop, drawer, exportModal, settingsModal } = getDrawerEls();
    if (backdrop) backdrop.style.display = (runtime.ui.drawerOpen || runtime.ui.exportOpen || runtime.ui.settingsOpen) ? 'block' : 'none';
    if (drawer) drawer.style.transform = runtime.ui.drawerOpen ? 'translateX(0)' : 'translateX(110%)';
    if (exportModal) exportModal.style.display = runtime.ui.exportOpen ? 'flex' : 'none';
    if (settingsModal) settingsModal.style.display = runtime.ui.settingsOpen ? 'flex' : 'none';

    const bulkSearchBtn = getBindEl('bulkSearchBtn');
    const bulkCartBtn = getBindEl('bulkCartBtn');
    if (bulkSearchBtn) bulkSearchBtn.style.display = runtime.currentPageType === PAGE_TYPES.search ? 'inline-block' : 'none';
    if (bulkCartBtn) bulkCartBtn.style.display = runtime.currentPageType === PAGE_TYPES.cart ? 'inline-block' : 'none';

    const bulkStatus = getBindEl('bulkStatus');
    const bulkRow = getBindEl('bulkRow');
    if (runtime.ui.bulk) {
      if (bulkStatus) {
        bulkStatus.style.display = 'block';
        bulkStatus.textContent = `Bulk: ${runtime.ui.bulk.done}/${runtime.ui.bulk.total} · errors: ${runtime.ui.bulk.errors}${runtime.ui.bulk.cancelled ? ' · cancelled' : ''}`;
      }
      if (bulkRow) bulkRow.style.display = 'flex';
    } else {
      if (bulkStatus) bulkStatus.style.display = 'none';
      if (bulkRow) bulkRow.style.display = 'none';
    }

    if (runtime.ui.drawerOpen) renderItemsList();
    if (runtime.ui.exportOpen) refreshExportText();
    if (runtime.ui.settingsOpen) renderSettingsForm();

    // Search inline buttons
    if (runtime.currentPageType === PAGE_TYPES.search) {
      maybeInjectSearchInlineButtons();
    }
  }

  function renderSettingsForm() {
    const s = getSettings();
    setUiValue('debugEnabled', s.debugEnabled);
    setUiValue('showSearchInlineButtons', s.showSearchInlineButtons);
    setUiValue('enableAmazonFetchEnrichment', s.enableAmazonFetchEnrichment);
    setUiValue('enableThirdPartyEnrichment', s.enableThirdPartyEnrichment);
    setUiValue('maxConcurrency', s.maxConcurrency);
  }

  function refreshExportText() {
    const format = String(getUiValue('exportFormat') || 'json');
    const includeDiagnostics = !!getUiValue('exportDiagnostics');
    const outEl = /** @type {HTMLTextAreaElement|null} */ (getBindEl('exportText'));
    if (!outEl) return;

    let text = '';
    if (format === 'csv') text = exportCsv();
    else if (format === 'md') text = exportMarkdown();
    else text = exportJson(includeDiagnostics);

    outEl.value = text;
  }

  async function handleUiAction(action, el) {
    if (!state) state = loadState();

    if (action === 'toggleDrawer') {
      runtime.ui.drawerOpen = !runtime.ui.drawerOpen;
      renderUi();
      return;
    }
    if (action === 'closeDrawer') {
      runtime.ui.drawerOpen = false;
      renderUi();
      return;
    }
    if (action === 'openExport') {
      runtime.ui.exportOpen = true;
      runtime.ui.settingsOpen = false;
      renderUi();
      return;
    }
    if (action === 'closeExport') {
      runtime.ui.exportOpen = false;
      renderUi();
      return;
    }
    if (action === 'openSettings') {
      runtime.ui.settingsOpen = true;
      runtime.ui.exportOpen = false;
      renderUi();
      return;
    }
    if (action === 'closeSettings') {
      runtime.ui.settingsOpen = false;
      renderUi();
      return;
    }
    if (action === 'saveSettings') {
      const next = {
        debugEnabled: !!getUiValue('debugEnabled'),
        showSearchInlineButtons: !!getUiValue('showSearchInlineButtons'),
        enableAmazonFetchEnrichment: !!getUiValue('enableAmazonFetchEnrichment'),
        enableThirdPartyEnrichment: !!getUiValue('enableThirdPartyEnrichment'),
        maxConcurrency: clampInt(getUiValue('maxConcurrency'), 1, 10, MAX_CONCURRENCY_DEFAULT),
      };
      state.settings = { ...state.settings, ...next };
      saveState('save-settings');
      runtime.ui.settingsOpen = false;
      renderUi();
      toast('Settings saved');
      return;
    }

    if (action === 'addCurrent') {
      const pt = runtime.currentPageType;
      if (pt === PAGE_TYPES.product) {
        const ex = await extractProductPageWithRetries();
        const { id } = upsertItemFromExtraction(ex);
        const settings = getSettings();
        if (settings.enableAmazonFetchEnrichment || settings.enableThirdPartyEnrichment) {
          await maybeEnrichItem(id);
        }
      } else if (pt === PAGE_TYPES.search) {
        await bulkAddSearchResults();
      } else if (pt === PAGE_TYPES.cart) {
        await bulkAddCartAsins();
      } else {
        toast('Not a supported page (product/search/cart).');
      }
      renderUi();
      return;
    }

    if (action === 'bulkAddSearch') {
      await bulkAddSearchResults();
      return;
    }
    if (action === 'bulkAddCart') {
      await bulkAddCartAsins();
      return;
    }
    if (action === 'cancelBulk') {
      if (runtime.ui.bulk) runtime.ui.bulk.cancelled = true;
      renderUi();
      return;
    }

    if (action === 'clearCart') {
      if (confirm('Clear all GPT Cart items?')) {
        clearCart();
        renderUi();
      }
      return;
    }

    if (action === 'copyDebug') {
      const report = buildDebugReport();
      await copyToClipboard(report);
      toast('Debug report copied');
      return;
    }

    if (action === 'refreshExport') {
      refreshExportText();
      return;
    }
    if (action === 'copyExport') {
      const outEl = /** @type {HTMLTextAreaElement|null} */ (getBindEl('exportText'));
      if (!outEl) return;
      await copyToClipboard(outEl.value);
      toast('Export copied');
      return;
    }
    if (action === 'downloadExport') {
      const fmt = String(getUiValue('exportFormat') || 'json');
      const outEl = /** @type {HTMLTextAreaElement|null} */ (getBindEl('exportText'));
      if (!outEl) return;
      const ext = fmt === 'csv' ? 'csv' : fmt === 'md' ? 'md' : 'json';
      downloadText(`gpt-cart-${Date.now()}.${ext}`, outEl.value);
      return;
    }

    // Item-scoped actions (use closest item container)
    const itemEl = el.closest('[data-item-id]');
    const itemId = itemEl?.getAttribute('data-item-id') || null;

    if (action === 'removeItem' && itemId) {
      removeItem(itemId);
      renderUi();
      return;
    }

    if (action === 'copyItemJson' && itemId) {
      const it = state.cart.itemsById[itemId];
      if (!it) return;
      await copyToClipboard(JSON.stringify(it, null, 2));
      toast('Item JSON copied');
      return;
    }

    if (action === 'enrichItem' && itemId) {
      await maybeEnrichItem(itemId);
      toast('Enrichment done (if enabled)');
      renderUi();
      return;
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, '&#096;');
  }

  // ===========================================================================
  // Debug report
  // ===========================================================================
  function buildDebugReport() {
    if (!state) state = loadState();
    const payload = {
      scriptVersion: SCRIPT_VERSION,
      schemaVersion: state.schemaVersion,
      pageType: runtime.currentPageType,
      url: canonicalizeUrl(location.href),
      title: document.title,
      itemCount: state.cart.order.length,
      settings: state.settings,
      migrations: state.migrations,
      lastExtraction: runtime.lastExtraction,
      recentLogs: logBuffer.slice(-200),
    };
    return JSON.stringify(payload, null, 2);
  }

  // ===========================================================================
  // Search inline buttons (optional)
  // ===========================================================================
  function maybeInjectSearchInlineButtons() {
    const settings = getSettings();
    if (!settings.showSearchInlineButtons) return;

    const results = qsa('[data-component-type="s-search-result"][data-asin]').filter((el) => {
      const asin = (el.getAttribute('data-asin') || '').trim();
      return asin && asin.length === 10;
    });

    for (const res of results) {
      const asin = (res.getAttribute('data-asin') || '').trim().toUpperCase();
      if (!asin) continue;

      const host = res.querySelector('.puis-card-container') || res;
      if (host.querySelector('[data-agc2-inline-add="1"]')) continue;

      const btn = document.createElement('button');
      btn.textContent = 'Add';
      btn.setAttribute('data-agc2-inline-add', '1');
      btn.style.position = 'absolute';
      btn.style.top = '8px';
      btn.style.right = '8px';
      btn.style.zIndex = '9999';
      btn.style.fontSize = '12px';
      btn.style.padding = '6px 8px';
      btn.style.borderRadius = '10px';
      btn.style.border = '1px solid rgba(0,0,0,.15)';
      btn.style.background = 'rgba(255,255,255,.92)';
      btn.style.cursor = 'pointer';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const extraction = extractSearchResult(res);
          const { id } = upsertItemFromExtraction(extraction);
          const s = getSettings();
          if (s.enableAmazonFetchEnrichment || s.enableThirdPartyEnrichment) {
            await maybeEnrichItem(id);
          }
          renderUi();
        } catch (err) {
          logWarn('Inline add failed', err);
          toast('Inline add failed');
        }
      });

      // Ensure positioning context
      const computed = window.getComputedStyle(host);
      if (computed.position === 'static') host.style.position = 'relative';
      host.appendChild(btn);
    }
  }

  // ===========================================================================
  // Cross-tab sync
  // ===========================================================================
  function installStorageListener() {
    try {
      GM_addValueChangeListener(STORAGE_KEY_V2, (_key, _oldVal, newVal, remote) => {
        if (!remote) return;
        const parsed = parseStoredV2(newVal);
        state = normalizeState(parsed);
        renderUi();
      });
    } catch (e) {
      logWarn('GM_addValueChangeListener failed', e);
    }
  }

  // ===========================================================================
  // Navigation / re-render hooks
  // ===========================================================================
  function installUrlWatcher() {
    let last = location.href;
    setInterval(() => {
      if (location.href === last) return;
      last = location.href;
      renderUi();
    }, 800);
  }

  // ===========================================================================
  // Init
  // ===========================================================================
  function init() {
    state = loadState();
    runtime.currentPageType = detectPageType();
    ensureUiMounted();
    installStorageListener();
    installUrlWatcher();
    renderUi();
    logInfo('Initialized', { version: SCRIPT_VERSION, pageType: runtime.currentPageType });
  }

  init();
})();

