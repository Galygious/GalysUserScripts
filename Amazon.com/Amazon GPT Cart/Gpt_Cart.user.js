// ==UserScript==
// @name         Amazon GPT Cart
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Collect product data into a GPT cart and copy to clipboard.
// @author
// @match        https://www.amazon.*/*/dp/*
// @match        https://www.amazon.*/*/gp/product/*
// @match        https://www.amazon.com/*
// @include      /^https:\\/\\/www\\.amazon\\.[a-z.]+\\/(.*\\/)?(dp|gp\\/product)\\/[A-Z0-9]{10}/
// @match        https://www.amazon.*/*/s*
// @match        https://www.amazon.*/*/hz/wishlist/*
// @match        https://www.amazon.*/*/gp/registry/*
// @match        https://www.amazon.*/*/gp/cart/view.html*
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
// @require      file://D:/Galydev/TamperMonkeyScripts/GME_Tools/GME_Tools.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CART_KEY = 'GPT_CART_V1';

  const getCart = () => GM_getValue(CART_KEY, []);
  const saveCart = (cart) => GM_setValue(CART_KEY, cart);

  let overlay = null;
  let cartBtn = null;

  function getCartLabel() {
    return `🛒 Cart (${getCart().length})`;
  }

  function refreshCartLabel() {
    if (cartBtn) {
      cartBtn.textContent = getCartLabel();
    }
  }

  function renderCartOverlay() {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.3)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#f9f9f9',
      color: '#333',
      maxWidth: '650px',
      width: '90%',
      maxHeight: '80%',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '15px',
      paddingBottom: '10px',
      borderBottom: '1px solid #eee',
    });

    const headerTitle = document.createElement('span');
    headerTitle.textContent = `GPT Cart – ${getCart().length} items`;
    Object.assign(headerTitle.style, {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#333',
    });

    const headerControls = document.createElement('div');
    Object.assign(headerControls.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Cart';
    styleBtn(clearBtn);
    Object.assign(clearBtn.style, {
      padding: '6px 12px',
      fontSize: '13px',
      background: '#e74c3c',
      borderColor: '#c0392b',
      color: '#fff',
      borderRadius: '5px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'background 0.2s ease',
    });
    clearBtn.onmouseover = () => clearBtn.style.background = '#c0392b';
    clearBtn.onmouseout = () => clearBtn.style.background = '#e74c3c';
    clearBtn.onclick = () => {
      if (!confirm('Clear all items from GPT Cart?')) return;
      saveCart([]);
      list.innerHTML = '';
      headerTitle.textContent = `GPT Cart – 0 items`;
      refreshCartLabel();
    };
    headerControls.appendChild(clearBtn);

    const closeXBtn = document.createElement('button');
    closeXBtn.textContent = '✕';
    styleBtn(closeXBtn);
    Object.assign(closeXBtn.style, {
      padding: '5px 10px',
      fontSize: '20px',
      background: 'none',
      border: 'none',
      color: '#888',
      cursor: 'pointer',
      transition: 'color 0.2s ease',
    });
    closeXBtn.onmouseover = () => closeXBtn.style.color = '#333';
    closeXBtn.onmouseout = () => closeXBtn.style.color = '#888';
    closeXBtn.onclick = () => toggleCartOverlay();
    headerControls.appendChild(closeXBtn);

    header.appendChild(headerTitle);
    header.appendChild(headerControls);

    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, {
      flex: '1',
      overflowY: 'auto',
      marginBottom: '15px',
      paddingRight: '5px',
    });

    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '0';

    getCart().forEach((item, idx) => {
      const li = document.createElement('li');
      Object.assign(li.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
        padding: '8px 0',
        borderBottom: '1px dashed #eee',
      });

      const info = document.createElement('span');
      info.textContent = `${idx + 1}. ${item.title?.slice(0, 70) || item.asin}`;
      Object.assign(info.style, {
        flex: '1',
        marginRight: '10px',
        color: '#555',
      });

      const itemLink = document.createElement('a');
      itemLink.href = item.url;
      itemLink.target = '_blank';
      itemLink.style.textDecoration = 'none';
      itemLink.style.color = '#007bff';
      itemLink.onmouseover = () => itemLink.style.textDecoration = 'underline';
      itemLink.onmouseout = () => itemLink.style.textDecoration = 'none';
      itemLink.appendChild(info);

      if (item.deliveryInfo && (item.deliveryInfo.time || item.deliveryInfo.price)) {
        const deliveryDiv = document.createElement('div');
        Object.assign(deliveryDiv.style, {
          fontSize: '12px',
          color: '#777',
          marginTop: '2px',
        });
        let deliveryText = '';
        if (item.deliveryInfo.price) {
          deliveryText += `Delivery: ${item.deliveryInfo.price}`;
        }
        if (item.deliveryInfo.time) {
          deliveryText += `${item.deliveryInfo.price ? ', ' : 'Delivery: '}${item.deliveryInfo.time}`;
        }
        if (item.deliveryInfo.condition) {
          deliveryText += ` (${item.deliveryInfo.condition})`;
        }
        if (item.deliveryInfo.cutoff) {
            deliveryText += ` (Order by: ${item.deliveryInfo.cutoff})`;
        }
        deliveryDiv.textContent = deliveryText;
        itemLink.appendChild(deliveryDiv);
      }

      const del = document.createElement('button');
      del.textContent = '-';
      styleBtn(del);
      Object.assign(del.style, {
        padding: '3px 8px',
        fontSize: '18px',
        background: '#bbb',
        border: 'none',
        borderRadius: '50%',
        color: '#fff',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background 0.2s ease',
      });
      del.onmouseover = () => del.style.background = '#999';
      del.onmouseout = () => del.style.background = '#bbb';
      del.onclick = () => {
        const cart = getCart();
        cart.splice(idx, 1);
        saveCart(cart);
        li.remove();
        headerTitle.textContent = `GPT Cart – ${cart.length} items`;
        refreshCartLabel();
      };

      li.appendChild(itemLink);
      li.appendChild(del);
      list.appendChild(li);
    });

    listContainer.appendChild(list);

    panel.appendChild(header);
    panel.appendChild(listContainer);
    wrapper.appendChild(panel);
    return wrapper;
  }

  function toggleCartOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      return;
    }
    overlay = renderCartOverlay();
    document.body.appendChild(overlay);
  }

  GM_addValueChangeListener(CART_KEY, (id, oldVal, newVal) => {
    refreshCartLabel();
    if (overlay) {
      overlay.remove();
      overlay = renderCartOverlay();
      document.body.appendChild(overlay);
    }
  });

  async function main() {
    injectGlobalCartUI();

    if (location.pathname.includes('/dp/') || location.pathname.includes('/gp/product')) {
      try {
        await GME_Tools.waitForElement('#productTitle');
      } catch (err) {
        return;
      }
      injectProductPageUI();
    } else if (location.pathname.startsWith('/s')) {
      if (!document.querySelector('[data-component-type="s-search-result"]')) return;
      injectSearchUI();
    } else if (location.pathname.includes('/wishlist') || location.pathname.includes('/gp/registry')) {
      injectGiftListUI();
    } else if (location.pathname.includes('/cart/view')) {
      injectCartUI();
    }
  }

  function injectGlobalCartUI() {
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy GPT Cart';
    copyBtn.style.position = 'fixed';
    copyBtn.style.bottom = '20px';
    copyBtn.style.right = '20px';
    styleBtn(copyBtn);

    copyBtn.onclick = () => {
      GM_setClipboard(JSON.stringify(getCart(), null, 2));
      toast('GPT Cart copied to clipboard');
    };

    document.body.appendChild(copyBtn);

    cartBtn = document.createElement('button');
    cartBtn.textContent = getCartLabel();
    cartBtn.style.position = 'fixed';
    cartBtn.style.bottom = '60px';
    cartBtn.style.right = '20px';
    styleBtn(cartBtn);

    cartBtn.onclick = () => toggleCartOverlay();

    document.body.appendChild(cartBtn);
  }

  function injectProductPageUI() {
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add to GPT Cart';
    styleBtn(addBtn);

    addBtn.onclick = async () => {
      addBtn.disabled = true;
      try {
        const data = await gatherProductData();
        const cart = getCart();

        // Check for duplicates based on ASIN and title
        const isDuplicate = cart.some(item => item.asin === data.asin && item.title === data.title);

        if (isDuplicate) {
          toast('Item already in cart!');
        } else {
          cart.push(data);
          saveCart(cart);
          toast(`Added! Cart size: ${cart.length}`);
        }
      } catch (e) {
        console.error('GPT Cart error', e);
        toast('Failed to add item, check console.');
      } finally {
        addBtn.disabled = false;
      }
    };

    const containerSelectors = [
      '#rightCol',
      '#desktop_buybox',
      '#addToCart',
      '#centerCol',
    ];
    const host = containerSelectors
      .map((sel) => document.querySelector(sel))
      .find(Boolean) || document.body;
    host.prepend(addBtn);
  }

  function styleBtn(btn) {
    btn.style.padding = '8px 12px';
    btn.style.background = '#FF9900';
    btn.style.border = '1px solid #d38b05';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    btn.style.color = '#111';
    btn.style.fontWeight = 'bold';
    btn.style.fontSize = '13px';
    btn.style.margin = '4px 0';
    btn.style.zIndex = 9999;
  }

  function toast(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.position = 'fixed';
    div.style.bottom = '100px';
    div.style.right = '20px';
    div.style.background = 'rgba(0,0,0,0.8)';
    div.style.color = '#fff';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '4px';
    div.style.zIndex = 9999;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  function scrapeProduct() {
    const $ = (sel) => document.querySelector(sel);
    const text = (sel) => $(sel)?.textContent.trim() || null;

    let asin = $('input#ASIN')?.value || null;
    if (!asin) {
      const m = location.pathname.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
      if (m) asin = m[1];
    }

    const priceSelectors = [
      '.a-price .a-offscreen', // Prioritize the offscreen price which contains the full value
      '.a-price-whole',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.olp-padding-right .a-color-price',
      '#buyNew_noncbb .a-price',
      '#kindle-price',
    ];

    let priceText = priceSelectors.map(text).find(Boolean);
    let currency = null,
      price = null;
    if (priceText) {
      console.log('Original priceText:', priceText); // Debugging
      priceText = priceText.replace(/[^0-9.,]/g, ''); // Allow comma for thousands separator
      priceText = priceText.replace(/,/g, ''); // Remove commas for parseFloat
      const match = priceText.match(/([£€$]?)([\d.]+)/);
      console.log('Regex match:', match); // Debugging
      if (match && match[2]) {
        currency = match[1] || '$';
        price = parseFloat(match[2]);
      } else {
        // Fallback if regex fails, try to parse directly
        price = parseFloat(priceText);
        if (isNaN(price)) price = null;
        // Attempt to infer currency if not found by regex, default to '$'
        if (!currency) {
            if (priceText.includes('£')) currency = '£';
            else if (priceText.includes('€')) currency = '€';
            else currency = '$';
        }
      }
    }

    const listPriceText = text('#corePrice_desktop .a-text-price .a-offscreen');
    const listPrice = listPriceText
      ? parseFloat(listPriceText.replace(/[^0-9.]/g, ''))
      : null;

    const bulletEls = Array.from(
      document.querySelectorAll('#feature-bullets li span')
    );
    const bullets = bulletEls
      .map((e) => e.textContent.replace(/\\s+/g, ' ').trim())
      .filter(Boolean);

    const descSelectors = [
      '#productDescription',
      '#productDescription_feature_div',
    ];
    let description = descSelectors
      .map((sel) => document.querySelector(sel)?.innerText.trim())
      .find(Boolean);

    const detailBullets = {};
    document
      .querySelectorAll('[id*="detail-bullets"] li')
      .forEach((li) => {
        const labelSpan = li.querySelector('span.a-text-bold');
        const valueSpan = li.querySelector('span:last-child');
        if (labelSpan && valueSpan) {
          const key = labelSpan.textContent.replace(':', '').trim();
          const val = valueSpan.textContent.trim();
          if (key) detailBullets[key] = val;
        }
      });

    const wisely = { pros: [], cons: [], goodToKnow: [], features: [] };
    const wiselyRoot = document.querySelector('.frame');
    const wiselySections = wiselyRoot ? wiselyRoot.querySelectorAll('h3') : [];
    wiselySections.forEach((h3) => {
      const heading = h3.textContent.toLowerCase();
      let listItems = [];
      const parentDiv = h3.parentElement;
      if (parentDiv) {
        const liNodes = parentDiv.querySelectorAll('li');
        if (liNodes.length) {
          listItems = Array.from(liNodes).map((li) => li.textContent.trim());
        }
        if (!listItems.length) {
          const chips = parentDiv.querySelectorAll('div.inline-block');
          if (chips.length)
            listItems = Array.from(chips).map((d) => d.textContent.trim());
        }
      }

      if (heading.includes('pros')) wisely.pros = listItems;
      else if (heading.includes('cons')) wisely.cons = listItems;
      else if (heading.includes('good to know')) wisely.goodToKnow = listItems;
      else if (heading.includes('notable')) wisely.features = listItems;
    });

    if (
      wiselyRoot &&
      !wisely.pros.length &&
      !wisely.cons.length &&
      !wisely.goodToKnow.length &&
      !wisely.features.length
    ) {
      return new Promise((resolve) => {
        setTimeout(() => {
          const refreshed = scrapeProduct();
          resolve(refreshed);
        }, 1000);
      });
    }

    const starsText = $('#acrPopover')?.getAttribute('title') || '';
    const starsMatch = starsText.match(/([\\d.]+)\\s+out/);
    const stars = starsMatch ? parseFloat(starsMatch[1]) : null;

    const reviewsText = text('#acrCustomerReviewText');
    const reviewCount = reviewsText
      ? parseInt(reviewsText.replace(/[^0-9]/g, ''))
      : null;

    const techSpecs = {};
    const tables = [
      '#productDetails_techSpec_section_1',
      '#productDetails_detailBullets_sections1',
    ];
    for (const sel of tables) {
      const tbl = $(sel);
      if (!tbl) continue;
      tbl.querySelectorAll('tr').forEach((tr) => {
        const key = tr.querySelector('th')?.textContent.trim();
        const val = tr.querySelector('td')?.textContent.trim();
        if (key && val) techSpecs[key] = val;
      });
    }

    const img = $('#imgTagWrapperId img');
    const images = img ? [img.getAttribute('data-old-hires') || img.src] : [];

    const deliverySpan = $('#deliveryBlock_feature_div span[data-csa-c-type="element"]');
    const deliveryInfo = {
      time: deliverySpan?.getAttribute('data-csa-c-delivery-time') || null,
      price: deliverySpan?.getAttribute('data-csa-c-delivery-price') || null,
      condition: deliverySpan?.getAttribute('data-csa-c-delivery-condition') || null,
      cutoff: deliverySpan?.getAttribute('data-csa-c-delivery-cutoff') || null,
    };

    return {
      asin,
      url: location.href.split('?')[0],
      title: text('#productTitle'),
      brand: text('#bylineInfo') || text('#brand'),
      price,
      listPrice,
      currency,
      stars,
      reviewCount,
      bullets,
      description,
      detailBullets,
      wisely,
      techSpecs,
      images,
      addedAt: Date.now(),
      deliveryInfo,
    };
  }

  const fetchWiselyInsights = (asin) =>
    new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://shopwisely.ai/frame/product/api/insights',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        data: JSON.stringify({
          platform: { platform: 'tampermonkey', version: 'dev' },
          page: {
            site: 'amazon',
            domain: location.hostname,
            url: location.href.split('?')[0],
            title: document.title,
          },
          mainElements: { id: asin },
        }),
        onload: (res) => {
          try {
            const json = JSON.parse(res.responseText);
            resolve(json.response || json);
          } catch (e) {
            console.warn('Wisely response parse error', e);
            resolve(null);
          }
        },
        onerror: () => resolve(null),
      });
    });

  const fetchAmazonDetails = (asin) =>
    new Promise((resolve) => {
      const base = location.hostname.includes('amazon.')
        ? location.hostname
        : 'www.amazon.com';
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://${base}/dp/${asin}`,
        onload: (res) => {
          const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
          const $ = (sel) => doc.querySelector(sel);
          const text = (sel) => $(sel)?.textContent.trim() || null;

          const priceText = doc.querySelector('.a-price .a-offscreen')?.textContent.trim();
          const bullets = Array.from(doc.querySelectorAll('#feature-bullets li span'))
            .map((e) => e.textContent.replace(/\\s+/g, ' ').trim())
            .filter(Boolean);

          const images = [];
          const img = $('#imgTagWrapperId img');
          if (img) images.push(img.getAttribute('data-old-hires') || img.src);

          const deliverySpan = doc.querySelector('#deliveryBlock_feature_div span[data-csa-c-type="element"]');
          const deliveryInfo = {
            time: deliverySpan?.getAttribute('data-csa-c-delivery-time') || null,
            price: deliverySpan?.getAttribute('data-csa-c-delivery-price') || null,
            condition: deliverySpan?.getAttribute('data-csa-c-delivery-condition') || null,
            cutoff: deliverySpan?.getAttribute('data-csa-c-delivery-cutoff') || null,
          };

          resolve({
            title: text('#productTitle'),
            brand: text('#bylineInfo') || text('#brand'),
            price: priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) : null,
            currency: priceText ? priceText.trim().match(/[£€$]/)?.[0] || '$' : null,
            bullets,
            images,
            deliveryInfo,
          });
        },
        onerror: () => resolve(null),
      });
    });

  async function gatherProductData() {
    const start = Date.now();
    let data = scrapeProduct();

    const wiselyApi = await fetchWiselyInsights(data.asin);
    if (wiselyApi) {
      data.wisely = {
        pros: wiselyApi.userPros || [],
        cons: wiselyApi.userCons || [],
        goodToKnow: wiselyApi.warnings || [],
        features: wiselyApi.features || [],
      };
    }

    // Add delivery information from scrapeProduct
    data.deliveryInfo = data.deliveryInfo || scrapeProduct().deliveryInfo;

    while (
      !data.wisely.pros.length &&
      !data.wisely.cons.length &&
      !data.wisely.goodToKnow.length &&
      !data.wisely.features.length &&
      document.querySelector('.frame') &&
      Date.now() - start < 4000
    ) {
      await new Promise((r) => setTimeout(r, 400));
      data = scrapeProduct();
    }
    return data;
  }

  function createFixedButton(label, topPx) {
    const btn = document.createElement('button');
    btn.textContent = label;
    styleBtn(btn);
    btn.style.position = 'fixed';
    btn.style.top = topPx + 'px';
    btn.style.right = '20px';
    btn.style.zIndex = 9999;
    return btn;
  }

  function injectGiftListUI() {
    const addAllBtn = createFixedButton('➕ Add ALL gift-list items', 120);
    addAllBtn.onclick = async () => {
      addAllBtn.disabled = true;
      const liNodes = Array.from(document.querySelectorAll('li[data-itemid][data-reposition-action-params]'));
      const asins = liNodes
        .map((li) => {
          try {
            const params = JSON.parse(li.getAttribute('data-reposition-action-params'));
            const ext = params.itemExternalId || '';
            const match = ext.match(/ASIN:([A-Z0-9]{10})/);
            return match ? match[1] : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
      const count = await bulkAddByAsins(asins);
      toast(`Added ${count} gift items to GPT Cart`);
      addAllBtn.disabled = false;
    };
    document.body.appendChild(addAllBtn);
  }

  function injectCartUI() {
    const addAllBtn = createFixedButton('➕ Add ALL cart items', 120);
    addAllBtn.onclick = async () => {
      addAllBtn.disabled = true;
      const divs = Array.from(document.querySelectorAll('div[data-asin]'));
      const asins = divs.map((d) => d.getAttribute('data-asin')).filter((a) => a && a.length === 10);
      const count = await bulkAddByAsins(asins);
      toast(`Added ${count} cart items to GPT Cart`);
      addAllBtn.disabled = false;
    };
    document.body.appendChild(addAllBtn);
  }

  async function bulkAddByAsins(asins) {
    let added = 0;
    const currentCart = getCart(); // Fetch cart once at the beginning

    for (const asin of asins) {
      const amazon = await fetchAmazonDetails(asin);
      if (!amazon) continue; // Skip if Amazon details can't be fetched

      const wisely = await fetchWiselyInsights(asin);
      // Determine the title to use for comparison
      const itemTitle = amazon.title || (wisely ? wisely.product?.title : null) || asin;

      // Check for duplicates based on ASIN and title
      const isDuplicate = currentCart.some((i) => i.asin === asin && i.title === itemTitle);
      if (isDuplicate) {
        continue; // Skip if this specific item (ASIN + Title) is already in the cart
      }

      const item = {
        asin,
        url: `https://www.amazon.com/dp/${asin}`,
        title: itemTitle,
        brand: amazon.brand || (wisely ? wisely.product?.brand : null) || null,
        price: amazon.price || (wisely ? wisely.purchase?.price : null) || null,
        currency: amazon.currency || (wisely ? wisely.purchase?.currency : null) || '$',
        bullets: amazon.bullets.length ? amazon.bullets : (wisely && wisely.product?.description) ? wisely.product.description.split('\n').slice(1) : [],
        detailBullets: {},
        wisely: wisely
          ? {
              pros: wisely.userPros || [],
              cons: wisely.userCons || [],
              goodToKnow: wisely.warnings || [],
              features: wisely.features || [],
            }
          : { pros: [], cons: [], goodToKnow: [], features: [] },
        techSpecs: {},
        images: amazon.images.length ? amazon.images : (wisely && wisely.images) ? wisely.images.map((img) => img.src) : [],
        addedAt: Date.now(),
        deliveryInfo: amazon.deliveryInfo || null, // Add delivery info to bulk added items
      };
      currentCart.push(item);
      added++;
    }
    saveCart(currentCart); // Save the updated cart
    return added;
  }

  function injectSearchUI() {
    const addAllBtn = document.createElement('button');
    addAllBtn.textContent = '➕ Add ALL results to GPT Cart';
    styleBtn(addAllBtn);
    addAllBtn.style.position = 'fixed';
    addAllBtn.style.top = '80px';
    addAllBtn.style.right = '20px';
    addAllBtn.style.zIndex = 9999;

    addAllBtn.onclick = async () => {
      addAllBtn.disabled = true;
      const results = Array.from(
        document.querySelectorAll('[data-component-type="s-search-result"][data-asin]')
      );
      const asins = results.map((r) => r.getAttribute('data-asin')).filter(Boolean);
      let count = 0;
      for (const asin of asins) {
        const exists = getCart().some((i) => i.asin === asin);
        if (exists) continue;
        try {
          const amazon = await fetchAmazonDetails(asin);
          if (!amazon) continue;
          const wisely = await fetchWiselyInsights(asin);
          if (!wisely) continue;
          const item = {
            asin,
            url: `https://www.amazon.com/dp/${asin}`,
            title: amazon.title || wisely.product?.title || asin,
            brand: amazon.brand || wisely.product?.brand || null,
            price: amazon.price || wisely.purchase?.price || null,
            currency: amazon.currency || wisely.purchase?.currency || null,
            bullets:
              amazon.bullets.length
                ? amazon.bullets
                : wisely.product?.description?.split('\n').slice(1) || [],
            detailBullets: {},
            wisely: {
              pros: wisely.userPros || [],
              cons: wisely.userCons || [],
              goodToKnow: wisely.warnings || [],
              features: wisely.features || [],
            },
            techSpecs: {},
            images: amazon.images.length ? amazon.images : wisely.images?.map((img) => img.src) || [],
            addedAt: Date.now(),
            deliveryInfo: amazon.deliveryInfo || null, // Add delivery info to bulk added items
          };
          const cart = getCart();
          cart.push(item);
          saveCart(cart);
          count++;
        } catch (e) {
          console.warn('Add all failed for', asin, e);
        }
      }
      toast(`Added ${count} items to GPT Cart`);
      addAllBtn.disabled = false;
    };

    document.body.appendChild(addAllBtn);
  }

  main();
})();