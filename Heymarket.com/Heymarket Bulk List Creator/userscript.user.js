// ==UserScript==
// @name         Heymarket Bulk List Tool
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automate creation of Haymarket lists from phone numbers with automatic grouping by brand
// @author       You
// @match        https://app.heymarket.com/*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js
// @require      https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js
// @resource     select2CSS https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        MAX_PHONES_PER_LIST: 49,
        TAG_ID: 196925,
        TEAM_ID: 64149,
        API_URL: 'https://api-prod-client.heymarket.com/v2/list/create',
        SCHEDULE_API_URL: 'https://api-prod-client.heymarket.com/v2/schedule/create',
        TEMPLATES_API_URL: 'https://api-prod-client.heymarket.com/v2/templates/fetch',
        LISTS_API_URL: 'https://api-prod-client.heymarket.com/v4/lists/fetch',
        INBOX_IDS: {
            'BOOKING': 80071,
            'SCHEDULE': 80158,
            'RESERVE': 80157,
            'SESSIONS': 80159
        },
        BRAND_NAMES: {
            'BOOKING': 'Lauren',
            'SCHEDULE': 'Jasmon',
            'RESERVE': 'Kailee',
            'SESSIONS': 'Heather'
        },
        BRAND_ORDER: ['BOOKING', 'SCHEDULE', 'RESERVE', 'SESSIONS'],
    };

    // Global flag to track if script is active
    let isScriptActive = false;

    // Security token capture
    let CAPTURED_TOKEN = null;

    // Intercept XMLHttpRequest to capture security token
    (function() {
        const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (header && header.toLowerCase() === 'x-emb-security-token' && !CAPTURED_TOKEN) {
                CAPTURED_TOKEN = value;
                console.log('🎯 Security token captured:', value.substring(0, 20) + '...');
            }
            return originalSetRequestHeader.apply(this, arguments);
        };
    })();

    // Generate UUID v4
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Generate local_id using our UUID function
    function generateLocalId() {
        return generateUUID();
    }

    // Format phone number to 11-digit format with leading 1
    function formatPhoneNumber(phone) {
        if (!phone) return null;

        // Remove all non-digit characters
        const cleaned = phone.replace(/\D/g, '');

        // If it's 10 digits, add leading 1
        if (cleaned.length === 10) {
            return '1' + cleaned;
        }

        // If it's 11 digits and starts with 1, return as is
        if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return cleaned;
        }

        // If it's 11 digits but doesn't start with 1, assume it needs 1 prepended
        if (cleaned.length === 11 && !cleaned.startsWith('1')) {
            return '1' + cleaned;
        }

        // For any other length, try to make it work by adding 1 if needed
        if (cleaned.length > 11) {
            // If too long, try to extract the last 10 digits and add 1
            const last10 = cleaned.slice(-10);
            return '1' + last10;
        }

        // If less than 10 digits, return null (invalid)
        if (cleaned.length < 10) {
            return null;
        }

        return cleaned;
    }

    // Validate phone number (must be 11 digits starting with 1)
    function isValidPhoneNumber(phone) {
        if (!phone) return false;
        const cleaned = formatPhoneNumber(phone);
        if (!cleaned) return false;

        // Must be exactly 11 digits starting with 1, and area code can't start with 0 or 1
        return /^1[2-9]\d{9}$/.test(cleaned);
    }

    // Parse CSV data with brand information
    function parseCSVData(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        const brandGroups = {};

        lines.forEach((line, index) => {
            if (index === 0) return; // Skip header row

            const parts = line.split(',').map(part => part.trim());
            if (parts.length >= 5) { // Name, Profile Link, Email, Phone, Brand
                const phone = formatPhoneNumber(parts[3]);
                const brand = parts[4];

                if (isValidPhoneNumber(phone) && brand) {
                    if (!brandGroups[brand]) {
                        brandGroups[brand] = [];
                    }
                    brandGroups[brand].push(phone);
                }
            }
        });

        return brandGroups;
    }

    // Group phone numbers by brand with max 49 per list
    function groupPhoneNumbersByBrand(brandGroups) {
        const result = [];

        Object.keys(brandGroups).forEach(brand => {
            const phones = brandGroups[brand];

            // Split this brand's phones into chunks of 49
            for (let i = 0; i < phones.length; i += CONFIG.MAX_PHONES_PER_LIST) {
                const chunk = phones.slice(i, i + CONFIG.MAX_PHONES_PER_LIST);
                result.push({
                    brand: brand,
                    phones: chunk,
                    count: chunk.length,
                    chunkNumber: Math.floor(i / CONFIG.MAX_PHONES_PER_LIST) + 1,
                    totalChunks: Math.ceil(phones.length / CONFIG.MAX_PHONES_PER_LIST)
                });
            }
        });

        return result;
    }

    // Combine contacts across brands into 49-contact groups while preserving brand separation
    function combineContactsIntoGroups(brandGroups) {
        const combinedGroups = [];
        const brandOrder = CONFIG.BRAND_ORDER;

        // Sort brands by priority order
        const sortedBrands = brandOrder.filter(brand => brandGroups[brand] && brandGroups[brand].length > 0);

        if (sortedBrands.length === 0) {
            return combinedGroups;
        }

        // Create a pool of contacts from all brands, maintaining brand information
        const contactPool = [];
        sortedBrands.forEach(brand => {
            brandGroups[brand].forEach(phone => {
                contactPool.push({ phone: phone, brand: brand });
            });
        });

        // Combine contacts into groups of exactly 49
        let currentGroup = [];
        let groupNumber = 1;

        for (let i = 0; i < contactPool.length; i++) {
            currentGroup.push(contactPool[i]);

            // When we reach 49 contacts or run out of contacts, create a group
            if (currentGroup.length === CONFIG.MAX_PHONES_PER_LIST || i === contactPool.length - 1) {
                // Group contacts by brand within this combined group
                const brandBreakdown = {};
                currentGroup.forEach(contact => {
                    if (!brandBreakdown[contact.brand]) {
                        brandBreakdown[contact.brand] = [];
                    }
                    brandBreakdown[contact.brand].push(contact.phone);
                });

                combinedGroups.push({
                    groupNumber: groupNumber,
                    totalContacts: currentGroup.length,
                    brandBreakdown: brandBreakdown,
                    // For display purposes, show the primary brand (first in order)
                    primaryBrand: Object.keys(brandBreakdown)[0],
                    allContacts: currentGroup.map(c => c.phone)
                });

                currentGroup = [];
                groupNumber++;
            }
        }

        return combinedGroups;
    }

    // Generate automatic title based on brand and dates
    function generateTitle(brand, startDate, endDate, titleSuffix = 'Resends') {
        const today = new Date();
        const todayFormatted = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

        if (startDate && endDate) {
            return `${brand} ${titleSuffix} - ${todayFormatted} - ${startDate}-${endDate}`;
        } else if (startDate) {
            return `${brand} ${titleSuffix} - ${todayFormatted} - ${startDate}`;
        } else {
            return `${brand} ${titleSuffix} - ${todayFormatted}`;
        }
    }

    // Fetch templates from a specific date cursor
    async function fetchTemplatesWithDate(date = null, inboxId = null) {
        const securityToken = window.SECURITY_TOKEN || CAPTURED_TOKEN || '';

        if (!securityToken) {
            console.error('❌ No security token available for fetching templates');
            return { success: false, error: 'No security token available' };
        }

        const payload = {
            team_id: CONFIG.TEAM_ID,
            inbox_ids: inboxId ? [inboxId] : Object.values(CONFIG.INBOX_IDS),
            order: "updated",
            page: 0, // Always 0 for date-based pagination
            ascending: null,
            filter: "ALL",
            archived: false,
            date: date // null for first request, then use last template's date
        };

        return new Promise((resolve) => {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', CONFIG.TEMPLATES_API_URL, true);

                xhr.setRequestHeader('accept', 'application/json, text/plain, */*');
                xhr.setRequestHeader('content-type', 'application/json;charset=UTF-8');
                xhr.setRequestHeader('x-emb-security-token', securityToken);

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const result = JSON.parse(xhr.responseText);
                                resolve({ success: true, data: result });
                            } catch (e) {
                                resolve({ success: false, error: 'Invalid JSON response' });
                            }
                        } else {
                            resolve({ success: false, error: `HTTP ${xhr.status}: ${xhr.statusText}` });
                        }
                    }
                };

                xhr.onerror = function() {
                    resolve({ success: false, error: 'Network error' });
                };

                xhr.send(JSON.stringify(payload));

            } catch (error) {
                console.error('Error fetching templates:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }

    // Legacy function for backward compatibility
    async function fetchTemplatesPage(page, inboxId = null) {
        // Convert page-based call to date-based call
        return await fetchTemplatesWithDate(null, inboxId);
    }

    // Fetch all templates from Heymarket with date-based pagination
    async function fetchAllTemplates(inboxId = null) {
        const allTemplates = [];
        const seenTemplateIds = new Set();
        let currentDate = null; // Start with null for first request
        let hasMoreTemplates = true;
        let duplicateCount = 0;
        let requestCount = 0;

        console.log('🔄 Fetching all templates with date-based pagination...');

        while (hasMoreTemplates) {
            requestCount++;
            const dateStr = currentDate ? currentDate : 'initial';
            console.log(`📄 Fetching batch ${requestCount} (date: ${dateStr})...`);

            const result = await fetchTemplatesWithDate(currentDate, inboxId);

            if (!result.success) {
                console.error(`❌ Failed to fetch batch ${requestCount}:`, result.error);
                return { success: false, error: result.error };
            }

            // Check if we got an empty response (reached the end)
            if (!result.data || Object.keys(result.data).length === 0) {
                hasMoreTemplates = false;
                console.log(`✅ Empty response received, stopping pagination`);
                break;
            }

            const templates = result.data.templates || [];

            if (templates.length === 0) {
                hasMoreTemplates = false;
                console.log(`✅ No templates found in batch ${requestCount}, stopping pagination`);
            } else {
                let newTemplatesInThisBatch = 0;
                let lastTemplateDate = null;

                // Process each template and find the last date for next request
                templates.forEach(template => {
                    if (!seenTemplateIds.has(template.id)) {
                        seenTemplateIds.add(template.id);
                        allTemplates.push(template);
                        newTemplatesInThisBatch++;
                    } else {
                        duplicateCount++;
                    }

                    // Keep track of the last template's updated date for next request
                    if (template.updated) {
                        lastTemplateDate = template.updated;
                    }
                });

                console.log(`📄 Batch ${requestCount}: Found ${templates.length} templates (${newTemplatesInThisBatch} new, ${templates.length - newTemplatesInThisBatch} duplicates) - Total unique: ${allTemplates.length}`);

                // If we got no new templates, we've reached the end
                if (newTemplatesInThisBatch === 0) {
                    hasMoreTemplates = false;
                    console.log(`✅ All templates in batch ${requestCount} were duplicates, stopping pagination`);
                } else {
                    // Set the date for the next request to the last template's date
                    currentDate = lastTemplateDate;

                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }

        console.log(`✅ Fetched ${allTemplates.length} unique templates across ${requestCount} requests (${duplicateCount} duplicates encountered)`);
        return {
            success: true,
            data: {
                templates: allTemplates,
                total_requests: requestCount,
                total_templates: allTemplates.length,
                duplicates_found: duplicateCount
            }
        };
    }

    // Legacy function for backward compatibility
    async function fetchTemplates(inboxId = null) {
        return await fetchAllTemplates(inboxId);
    }

    // Parse existing lists from the current page DOM
    function parseListsFromDOM() {
        const lists = [];
        const listRows = document.querySelectorAll('.ant-table-row[data-row-key]');

        listRows.forEach(row => {
            const listId = row.getAttribute('data-row-key');
            const nameElement = row.querySelector('.lists_list-name__mC6WK');
            const contactsElement = row.querySelector('.lists_column-contact-number__sCaZ0');

            if (listId && nameElement && contactsElement) {
                const name = nameElement.textContent.trim();
                const contactsText = contactsElement.textContent.trim();
                const contactCount = parseInt(contactsText.match(/(\d+)/)?.[1] || '0');

                // Try to detect brand from the list name
                let detectedBrand = null;
                for (const brand of CONFIG.BRAND_ORDER) {
                    if (name.toUpperCase().includes(brand)) {
                        detectedBrand = brand;
                        break;
                    }
                }

                lists.push({
                    id: listId,
                    name: name,
                    contactCount: contactCount,
                    brand: detectedBrand,
                    selected: false
                });
            }
        });

        return lists;
    }

    // Fetch lists from Heymarket API
    async function fetchLists() {
        const securityToken = window.SECURITY_TOKEN || CAPTURED_TOKEN || '';

        if (!securityToken) {
            console.error('❌ No security token available for fetching lists');
            return { success: false, error: 'No security token available' };
        }

        const payload = {
            team_id: CONFIG.TEAM_ID,
            order: "updated",
            page: 0,
            ascending: false,
            filter: "ALL",
            archived: false,
            date: null
        };

        return new Promise((resolve) => {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', CONFIG.LISTS_API_URL, true);

                xhr.setRequestHeader('accept', 'application/json, text/plain, */*');
                xhr.setRequestHeader('content-type', 'application/json;charset=UTF-8');
                xhr.setRequestHeader('x-emb-security-token', securityToken);

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const result = JSON.parse(xhr.responseText);
                                resolve({ success: true, data: result });
                            } catch (e) {
                                resolve({ success: false, error: 'Invalid JSON response' });
                            }
                        } else {
                            resolve({ success: false, error: `HTTP ${xhr.status}: ${xhr.statusText}` });
                        }
                    }
                };

                xhr.onerror = function() {
                    resolve({ success: false, error: 'Network error' });
                };

                xhr.send(JSON.stringify(payload));

            } catch (error) {
                console.error('Error fetching lists:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }

    // Create scheduled broadcast for a list
    async function createScheduledBroadcast(listId, brand, executeAt, messageTemplate) {
        const securityToken = window.SECURITY_TOKEN || CAPTURED_TOKEN || '';

        if (!securityToken) {
            console.error('❌ No security token available for scheduling broadcast');
            return { success: false, error: 'No security token available' };
        }

        const inboxId = CONFIG.INBOX_IDS[brand];
        const brandName = CONFIG.BRAND_NAMES[brand];

        // Replace template variables
        let messageText = messageTemplate
            .replace(/\{areamanager\}/gi, brandName)
            .replace(/\{brand\}/gi, brand)
            .replace(/\{name\}/gi, brandName);

        const payload = {
            name: null,
            local_id: generateUUID(),
            inbox_id: inboxId,
            execute_at: executeAt.toISOString(),
            team_id: CONFIG.TEAM_ID,
            content: {
                text: messageText
            },
            list_id: parseInt(listId), // Convert to number
            exclude: []
        };

        return new Promise((resolve) => {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', CONFIG.SCHEDULE_API_URL, true);

                xhr.setRequestHeader('accept', 'application/json, text/plain, */*');
                xhr.setRequestHeader('content-type', 'application/json;charset=UTF-8');
                xhr.setRequestHeader('x-emb-security-token', securityToken);

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const result = JSON.parse(xhr.responseText);
                                resolve({ success: true, data: result, brand: brand, executeAt: executeAt });
                            } catch (e) {
                                resolve({ success: false, error: 'Invalid JSON response', brand: brand });
                            }
                        } else {
                            resolve({ success: false, error: `HTTP ${xhr.status}: ${xhr.statusText}`, brand: brand });
                        }
                    }
                };

                xhr.onerror = function() {
                    resolve({ success: false, error: 'Network error', brand: brand });
                };

                xhr.send(JSON.stringify(payload));

            } catch (error) {
                console.error('Error creating scheduled broadcast:', error);
                resolve({ success: false, error: error.message, brand: brand });
            }
        });
    }

    // Create list in Haymarket
    async function createList(phoneGroup, title, startDate, endDate) {
        // Create members object
        const members = {};
        phoneGroup.phones.forEach(phone => {
            members[phone] = {};
        });

        const payload = {
            title: title,
            local_id: generateLocalId(),
            members: members,
            tags: [{ tag_id: CONFIG.TAG_ID }],
            team_id: CONFIG.TEAM_ID
        };

        return new Promise((resolve) => {
            try {
                // Get the security token - try multiple sources
                let securityToken = window.SECURITY_TOKEN || CAPTURED_TOKEN || '';

                if (!securityToken) {
                    console.error('❌ No security token available. Please navigate around Heymarket (like viewing lists or contacts) to generate API calls, then try again.');
                    resolve({ success: false, error: 'No security token available - please navigate around Heymarket first', title: title });
                    return;
                }

                console.log('✅ Security token found:', securityToken.substring(0, 10) + '...');

                const xhr = new XMLHttpRequest();
                xhr.open('POST', CONFIG.API_URL, true);

                // Set only safe headers - browser will add security headers automatically
                xhr.setRequestHeader('accept', 'application/json, text/plain, */*');
                xhr.setRequestHeader('content-type', 'application/json;charset=UTF-8');
                xhr.setRequestHeader('x-emb-security-token', securityToken);

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const result = JSON.parse(xhr.responseText);
                                resolve({ success: true, data: result, title: title });
                            } catch (e) {
                                resolve({ success: false, error: 'Invalid JSON response', title: title });
                            }
                        } else {
                            resolve({ success: false, error: `HTTP ${xhr.status}: ${xhr.statusText}`, title: title });
                        }
                    }
                };

                xhr.onerror = function() {
                    resolve({ success: false, error: 'Network error', title: title });
                };

                xhr.send(JSON.stringify(payload));

            } catch (error) {
                console.error('Error creating list:', error);
                resolve({ success: false, error: error.message, title: title });
            }
        });
    }

    // Create and inject the UI
    function createUI() {
        // Remove existing UI if it exists
        const existing = document.getElementById('bulk-list-creator');
        if (existing) {
            existing.remove();
            isScriptActive = false; // Reset flag when removing existing UI
        }

        const container = document.createElement('div');
        container.id = 'bulk-list-creator';
        container.innerHTML = `
            <div class="bulk-list-creator-container">
                <h3>Bulk List Creator</h3>

                <div class="mode-section">
                    <label>Mode:</label>
                    <div class="mode-buttons">
                        <button type="button" id="mode-create" class="btn btn-mode active">📝 Create Lists</button>
                        <button type="button" id="mode-existing" class="btn btn-mode">📋 Use Existing Lists</button>
                    </div>
                </div>

                <div id="create-mode-content">
                    <div class="input-section">
                        <label for="phone-input">Enter CSV data (Name, Profile Link, Email, Phone, Brand):</label>
                        <textarea id="phone-input" placeholder="Paste your CSV data here...&#10;Example:&#10;Name,Profile Link,Email,Phone,Brand&#10;John Doe,https://...,john@email.com,6155452860,Brand A&#10;Jane Smith,https://...,jane@email.com,7143106091,Brand B"></textarea>
                    </div>
                </div>

                <div id="existing-mode-content" style="display: none;">
                    <div class="existing-lists-section">
                        <div class="lists-header">
                            <label>Select Lists to Send Broadcasts:</label>
                            <div class="lists-controls">
                                <button type="button" id="scan-lists-btn" class="btn btn-secondary">🔍 Scan Page</button>
                                <button type="button" id="fetch-lists-btn" class="btn btn-secondary">📡 Fetch Lists</button>
                                <button type="button" id="select-all-lists" class="btn btn-secondary">☑️ All</button>
                                <button type="button" id="select-none-lists" class="btn btn-secondary">☐ None</button>
                            </div>
                        </div>
                        <div id="existing-lists-container">
                            <p class="lists-placeholder">Click "Scan Page" to find lists on the current page, or "Fetch Lists" to load from API.</p>
                        </div>
                    </div>
                </div>



                <div class="title-section">
                    <label for="list-title-suffix">List Title Suffix:</label>
                    <input type="text" id="list-title-suffix" value="Resends" placeholder="e.g., Resends, Follow-ups, Reminders" maxlength="50">
                    <small style="color: #6c757d; font-size: 12px;">This will appear in list titles as: "{Brand} {Suffix} - {Date}"</small>
                </div>

                <div class="date-section">
                    <label for="start-date">Start Date (MM/DD):</label>
                    <input type="text" id="start-date" placeholder="08/30" maxlength="5">

                    <label for="end-date">End Date (MM/DD):</label>
                    <input type="text" id="end-date" placeholder="08/31" maxlength="5">
                </div>

                <div class="schedule-section">
                    <label>
                        <input type="checkbox" id="schedule-broadcasts"> Schedule Broadcasts
                    </label>

                    <div id="schedule-options" style="display: none; margin-top: 10px;">
                        <label for="start-time">Start Time (HH:MM):</label>
                        <input type="time" id="start-time" value="14:00">

                        <div class="template-section">
                            <label for="template-selector">Select Template:</label>
                            <select id="template-selector" style="width: 100%;">
                                <option value="">Loading templates...</option>
                            </select>
                            <button type="button" id="load-templates-btn" class="btn btn-secondary">🔄 Load Templates</button>
                        </div>

                        <label for="message-template">Message Template:</label>
                        <textarea id="message-template" placeholder="Hi! This is {areamanager} from Sweet Me Photography...&#10;&#10;Available variables:&#10;{areamanager} - Area manager name (Lauren, Jasmon, etc.)&#10;{brand} - Brand name (BOOKING, SCHEDULE, etc.)&#10;{name} - Same as {areamanager}">Hi! This is {areamanager} from Sweet Me Photography, just following up on your interest in a newborn session. Dates are booking quickly, so please complete the reservation form in the email I sent to secure your spot. I'm happy to answer any questions or look into alternate dates. Thanks!</textarea>
                    </div>
                </div>

                <div class="action-section">
                    <button id="parse-btn" class="btn btn-primary">Parse & Preview</button>
                    <button id="dry-run-btn" class="btn btn-info" disabled>Dry Run Schedule</button>
                    <button id="create-btn" class="btn btn-success" disabled>Create Lists</button>
                    <button id="send-btn" class="btn btn-success" disabled style="display: none;">Send Broadcasts</button>
                    <button id="remove-btn" class="btn btn-danger">Remove UI</button>
                </div>

                <div id="preview-section" class="preview-section" style="display: none;">
                    <h4>Preview (${CONFIG.MAX_PHONES_PER_LIST} contacts per list max):</h4>
                    <div id="preview-content"></div>
                </div>

                <div id="progress-section" class="progress-section" style="display: none;">
                    <h4>Creating Lists...</h4>
                    <div id="progress-content"></div>
                </div>

                <div id="results-section" class="results-section" style="display: none;">
                    <h4>Results:</h4>
                    <div id="results-content"></div>
                </div>
            </div>
        `;

        // Insert after the first h1 or at the top of the page
        const firstH1 = document.querySelector('h1');
        if (firstH1) {
            firstH1.parentNode.insertBefore(container, firstH1.nextSibling);
        } else {
            document.body.insertBefore(container, document.body.firstChild);
        }

        // Add event listeners
        setupEventListeners();

        // Mark as active
        isScriptActive = true;
        console.log('✅ Bulk List Creator UI activated!');
    }

    // Setup event listeners
    function setupEventListeners() {
        const parseBtn = document.getElementById('parse-btn');
        const createBtn = document.getElementById('create-btn');
        const removeBtn = document.getElementById('remove-btn');

        // Parse phone numbers
        parseBtn.addEventListener('click', handleParseCSV);

        // Dry run schedule
        const dryRunBtn = document.getElementById('dry-run-btn');
        dryRunBtn.addEventListener('click', handleDryRun);

        // Create lists
        createBtn.addEventListener('click', handleCreateLists);

        // Remove UI
        removeBtn.addEventListener('click', () => {
            const container = document.getElementById('bulk-list-creator');
            if (container) {
                container.remove();
                isScriptActive = false;
                console.log('🗑️ Bulk List Creator UI removed');
            }
        });

        // Auto-format dates
        ['start-date', 'end-date'].forEach(id => {
            const input = document.getElementById(id);
            input.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length >= 2) {
                    value = value.slice(0, 2) + '/' + value.slice(2, 4);
                }
                e.target.value = value;
            });
        });

        // Schedule checkbox toggle
        const scheduleCheckbox = document.getElementById('schedule-broadcasts');
        const scheduleOptions = document.getElementById('schedule-options');

        scheduleCheckbox.addEventListener('change', function() {
            scheduleOptions.style.display = this.checked ? 'block' : 'none';
            if (this.checked) {
                loadTemplates();
            }
        });

        // Template selector functionality with Select2
        const templateSelector = document.getElementById('template-selector');
        const messageTemplate = document.getElementById('message-template');

        // Store all templates for searching
        window.allTemplates = [];
        window.templateSelect2Instance = null;

        // Initialize Select2 (libraries loaded via @require)
        function initializeSelect2() {
            try {
                window.templateSelect2Instance = $(templateSelector).select2({
                    placeholder: 'Search and select a template...',
                    allowClear: true,
                    width: '100%',
                    templateResult: formatTemplateOption,
                    templateSelection: formatTemplateSelection,
                    escapeMarkup: function(markup) { return markup; }
                });

                // Handle template selection
                $(templateSelector).on('select2:select', function(e) {
                    const selectedData = e.params.data;
                    if (selectedData && selectedData.content) {
                        messageTemplate.value = selectedData.content;
                    }
                });

                console.log('✅ Select2 initialized for template selector');
            } catch (error) {
                console.error('❌ Failed to initialize Select2:', error);
            }
        }

        // Format template options in dropdown
        function formatTemplateOption(template) {
            if (!template.id) {
                return template.text;
            }

            const content = template.content || '';
            const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;

            return $(`
                <div class="select2-template-option">
                    <div class="select2-template-name">${template.text}</div>
                    <div class="select2-template-preview">${preview}</div>
                </div>
            `);
        }

        // Format selected template
        function formatTemplateSelection(template) {
            return template.text || template.id;
        }

        // Initialize Select2 when DOM is ready (libraries already loaded via @require)
        initializeSelect2();

        // Load templates button
        document.getElementById('load-templates-btn').addEventListener('click', loadTemplates);

        // Mode switching
        document.getElementById('mode-create').addEventListener('click', () => switchMode('create'));
        document.getElementById('mode-existing').addEventListener('click', () => switchMode('existing'));

        // Existing lists functionality
        document.getElementById('scan-lists-btn').addEventListener('click', scanPageForLists);
        document.getElementById('fetch-lists-btn').addEventListener('click', fetchAndDisplayLists);
        document.getElementById('select-all-lists').addEventListener('click', () => toggleAllLists(true));
        document.getElementById('select-none-lists').addEventListener('click', () => toggleAllLists(false));
        document.getElementById('send-btn').addEventListener('click', handleSendBroadcasts);
    }

    // Load templates from Heymarket
    async function loadTemplates() {
        const templateSelector = document.getElementById('template-selector');
        const loadBtn = document.getElementById('load-templates-btn');

        // Show loading state
        loadBtn.disabled = true;
        loadBtn.textContent = '⏳ Loading...';

        try {
            const result = await fetchTemplates();

            if (result.success && result.data) {
                console.log("Templates fetch result: ", result);

                // Debug: Check template structure
                if (result.data.templates && result.data.templates.length > 0) {
                    console.log("First template structure:", result.data.templates[0]);

                    // Check for templates without names
                    const templatesWithoutNames = result.data.templates.filter(t => !t.name);
                    if (templatesWithoutNames.length > 0) {
                        console.warn(`Found ${templatesWithoutNames.length} templates without names:`, templatesWithoutNames.slice(0, 3));
                    }
                }

                // Sort templates by name and store globally (handle templates without names)
                const templates = result.data.templates.sort((a, b) => {
                    const nameA = a.name || `Unnamed Template ${a.id}`;
                    const nameB = b.name || `Unnamed Template ${b.id}`;
                    return nameA.localeCompare(nameB);
                });
                window.allTemplates = templates;

                // Clear existing options
                templateSelector.innerHTML = '<option value="">Select a template...</option>';

                // Add templates to select
                templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.id;
                    option.textContent = template.name || `Unnamed Template ${template.id}`;
                    option.dataset.content = template.content.text;
                    templateSelector.appendChild(option);
                });

                // Refresh Select2 if it's initialized
                if (window.templateSelect2Instance) {
                    // Destroy and recreate to ensure proper data binding
                    window.templateSelect2Instance.select2('destroy');

                    window.templateSelect2Instance = $(templateSelector).select2({
                        placeholder: 'Search and select a template...',
                        allowClear: true,
                        width: '100%',
                        templateResult: function(template) {
                            if (!template.id) {
                                return template.text;
                            }

                            const option = templateSelector.querySelector(`option[value="${template.id}"]`);
                            const content = option ? option.dataset.content || '' : '';
                            const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
                            const templateName = template.text || `Unnamed Template ${template.id}`;
                            return $(`
                                <div class="select2-template-option">
                                    <div class="select2-template-name">${templateName}</div>
                                    <div class="select2-template-preview">${preview}</div>
                                </div>
                            `);
                        },
                        templateSelection: function(template) {
                            return template.text || template.id;
                        },
                        escapeMarkup: function(markup) { return markup; }
                    });

                    // Re-attach event handler
                    $(templateSelector).on('select2:select', function(e) {
                        const selectedOption = templateSelector.querySelector(`option[value="${e.params.data.id}"]`);
                        if (selectedOption && selectedOption.dataset.content) {
                            document.getElementById('message-template').value = selectedOption.dataset.content;
                        }
                    });
                }

                console.log(`✅ Loaded ${templates.length} templates across ${result.data.total_requests} requests`);
            } else {
                templateSelector.innerHTML = '<option value="">Failed to load templates</option>';
                console.error('Failed to load templates:', result.error);
            }
        } catch (error) {
            templateSelector.innerHTML = '<option value="">Error loading templates</option>';
            console.error('Error loading templates:', error);
        }

        // Reset button state
        loadBtn.disabled = false;
        loadBtn.textContent = '🔄 Load Templates';
    }

    // Switch between create and existing modes
    function switchMode(mode) {
        const createModeBtn = document.getElementById('mode-create');
        const existingModeBtn = document.getElementById('mode-existing');
        const createModeContent = document.getElementById('create-mode-content');
        const existingModeContent = document.getElementById('existing-mode-content');
        const parseBtn = document.getElementById('parse-btn');
        const createBtn = document.getElementById('create-btn');
        const sendBtn = document.getElementById('send-btn');

        if (mode === 'create') {
            createModeBtn.classList.add('active');
            existingModeBtn.classList.remove('active');
            createModeContent.style.display = 'block';
            existingModeContent.style.display = 'none';
            parseBtn.style.display = 'inline-block';
            createBtn.style.display = 'inline-block';
            sendBtn.style.display = 'none';
        } else {
            existingModeBtn.classList.add('active');
            createModeBtn.classList.remove('active');
            existingModeContent.style.display = 'block';
            createModeContent.style.display = 'none';
            parseBtn.style.display = 'none';
            createBtn.style.display = 'none';
            sendBtn.style.display = 'inline-block';
        }

        // Reset buttons
        createBtn.disabled = true;
        sendBtn.disabled = true;
    }

    // Scan current page for lists
    function scanPageForLists() {
        const lists = parseListsFromDOM();
        displayExistingLists(lists);
        console.log(`🔍 Found ${lists.length} lists on current page`);
    }

    // Fetch and display lists from API
    async function fetchAndDisplayLists() {
        const fetchBtn = document.getElementById('fetch-lists-btn');
        fetchBtn.disabled = true;
        fetchBtn.textContent = '⏳ Fetching...';

        try {
            const result = await fetchLists();
            if (result.success && result.data) {
                const lists = result.data.map(list => ({
                    id: list.id,
                    name: list.title,
                    contactCount: list.member_count || 0,
                    brand: detectBrandFromName(list.title),
                    selected: false
                }));
                displayExistingLists(lists);
                console.log(`📡 Fetched ${lists.length} lists from API`);
            } else {
                alert('Failed to fetch lists: ' + result.error);
            }
        } catch (error) {
            alert('Error fetching lists: ' + error.message);
        }

        fetchBtn.disabled = false;
        fetchBtn.textContent = '📡 Fetch Lists';
    }

    // Helper function to detect brand from list name
    function detectBrandFromName(name) {
        for (const brand of CONFIG.BRAND_ORDER) {
            if (name.toUpperCase().includes(brand)) {
                return brand;
            }
        }
        return null;
    }

    // Display existing lists with checkboxes
    function displayExistingLists(lists) {
        const container = document.getElementById('existing-lists-container');

        if (lists.length === 0) {
            container.innerHTML = '<p class="lists-placeholder">No lists found.</p>';
            return;
        }

        let html = '<div class="lists-grid">';
        lists.forEach((list, index) => {
            const brandClass = list.brand ? `brand-${list.brand.toLowerCase()}` : 'brand-unknown';
            html += `
                <div class="list-item ${brandClass}">
                    <label class="list-checkbox">
                        <input type="checkbox" data-list-id="${list.id}" data-list-index="${index}">
                        <div class="list-info">
                            <div class="list-name">${list.name}</div>
                            <div class="list-details">
                                ${list.contactCount} contacts
                                ${list.brand ? `• ${list.brand}` : ''}
                            </div>
                        </div>
                    </label>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

        // Store lists for later use
        window.existingLists = lists;

        // Add change listeners to checkboxes
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', updateSendButtonState);
        });

        updateSendButtonState();
    }

    // Toggle all lists selection
    function toggleAllLists(select) {
        const checkboxes = document.querySelectorAll('#existing-lists-container input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = select;
        });
        updateSendButtonState();
    }

    // Update send button state based on selections
    function updateSendButtonState() {
        const checkboxes = document.querySelectorAll('#existing-lists-container input[type="checkbox"]:checked');
        const sendBtn = document.getElementById('send-btn');
        const scheduleCheckbox = document.getElementById('schedule-broadcasts');

        sendBtn.disabled = checkboxes.length === 0 || (scheduleCheckbox.checked && !document.getElementById('message-template').value.trim());
    }

    // Handle sending broadcasts to existing lists
    async function handleSendBroadcasts() {
        const checkboxes = document.querySelectorAll('#existing-lists-container input[type="checkbox"]:checked');
        const scheduleCheckbox = document.getElementById('schedule-broadcasts');

        if (checkboxes.length === 0) {
            alert('Please select at least one list.');
            return;
        }

        if (scheduleCheckbox.checked) {
            const messageTemplate = document.getElementById('message-template').value.trim();
            const startTime = document.getElementById('start-time').value;

            if (!messageTemplate) {
                alert('Please enter a message template for scheduled broadcasts.');
                return;
            }

            if (!startTime) {
                alert('Please set a start time for scheduling.');
                return;
            }

            await handleScheduledBroadcasts(checkboxes, messageTemplate, startTime);
        } else {
            alert('Immediate broadcasts not yet implemented. Please enable scheduling.');
        }
    }

    // Handle scheduled broadcasts for existing lists
    async function handleScheduledBroadcasts(checkboxes, messageTemplate, startTime) {
        const selectedLists = Array.from(checkboxes).map(checkbox => {
            const listIndex = parseInt(checkbox.dataset.listIndex);
            return window.existingLists[listIndex];
        });

        // Sort lists by brand order and size
        const sortedLists = selectedLists.sort((a, b) => {
            const brandOrderA = CONFIG.BRAND_ORDER.indexOf(a.brand);
            const brandOrderB = CONFIG.BRAND_ORDER.indexOf(b.brand);

            if (brandOrderA !== brandOrderB) {
                return brandOrderA - brandOrderB;
            }

            return b.contactCount - a.contactCount; // Larger lists first within same brand
        });

        const scheduleTimes = calculateScheduleTimesForLists(sortedLists, startTime);

        const progressSection = document.getElementById('progress-section');
        const progressContent = document.getElementById('progress-content');
        const resultsSection = document.getElementById('results-section');

        // Show progress
        progressSection.style.display = 'block';
        resultsSection.style.display = 'none';
        document.getElementById('send-btn').disabled = true;

        const results = [];

        for (let i = 0; i < sortedLists.length; i++) {
            const list = sortedLists[i];
            const executeAt = scheduleTimes[i];

            progressContent.innerHTML = `
                <div class="progress-item">
                    Scheduling broadcast ${i + 1} of ${sortedLists.length}: "${list.name}" (${list.contactCount} contacts) for ${executeAt.toLocaleString()}
                </div>
            `;

            const result = await createScheduledBroadcast(list.id, list.brand, executeAt, messageTemplate);
            results.push({
                ...result,
                listName: list.name,
                contactCount: list.contactCount
            });

            // Add delay to avoid rate limiting
            if (i < sortedLists.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Show results
        displayBroadcastResults(results);

        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';
        document.getElementById('send-btn').disabled = false;
    }

    // Calculate schedule times for existing lists
    function calculateScheduleTimesForLists(lists, startTime) {
        const times = [];
        const [hours, minutes] = startTime.split(':').map(Number);

        let currentTime = new Date();
        currentTime.setHours(hours, minutes, 0, 0);

        // If the specified time is in the past, add 5 minutes buffer for immediate start
        const now = new Date();
        if (currentTime <= now) {
            currentTime.setMinutes(currentTime.getMinutes() + 5);
        }

        lists.forEach((list, index) => {
            times.push(new Date(currentTime));

            // Add 30 minutes for next broadcast
            currentTime.setMinutes(currentTime.getMinutes() + 30);
        });

        return times;
    }

    // Display broadcast results
    function displayBroadcastResults(results) {
        const resultsContent = document.getElementById('results-content');

        let html = '<div class="results-summary">';
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        html += `<p><strong>Broadcasts:</strong> ${successful} scheduled, ${failed} failed</p>`;

        results.forEach((result, index) => {
            const statusClass = result.success ? 'success' : 'error';
            const statusText = result.success ? '✓ Broadcast Scheduled' : '✗ Scheduling Failed';

            html += `
                <div class="result-item ${statusClass}">
                    <strong>${result.listName}</strong> (${result.contactCount} contacts) - ${statusText}
                    ${!result.success ? `<br><small>Error: ${result.error}</small>` : ''}
                    ${result.success && result.executeAt ? `<br><small>📅 Scheduled for ${result.executeAt.toLocaleString()}</small>` : ''}
                </div>
            `;
        });

        html += '</div>';
        resultsContent.innerHTML = html;
    }

    // Handle CSV data parsing
    function handleParseCSV() {
        const csvText = document.getElementById('phone-input').value.trim();
        if (!csvText) {
            alert('Please enter CSV data first.');
            return;
        }

        const brandGroups = parseCSVData(csvText);
        if (Object.keys(brandGroups).length === 0) {
            alert('No valid CSV data found. Expected format: Name, Profile Link, Email, Phone, Brand');
            return;
        }

        // Use combined grouping for optimal 49-contact distribution
        const combinedGroups = combineContactsIntoGroups(brandGroups);
        displayPreview(combinedGroups);

        // Store both formats for different use cases
        window.bulkListGroups = combinedGroups;
        window.originalBrandGroups = brandGroups;

        // Enable create and dry run buttons
        document.getElementById('create-btn').disabled = false;
        document.getElementById('dry-run-btn').disabled = false;
    }

    // Handle dry run to show detailed schedule breakdown
    function handleDryRun() {
        if (!window.bulkListGroups || window.bulkListGroups.length === 0) {
            alert('Please parse CSV data first.');
            return;
        }

        const startTime = document.getElementById('start-time').value;
        if (!startTime) {
            alert('Please set a start time for the dry run.');
            return;
        }

        // Calculate schedule times
        const scheduleTimes = calculateScheduleTimes(window.bulkListGroups, startTime);

        // Display detailed dry run results
        displayDryRunResults(window.bulkListGroups, scheduleTimes, startTime);
    }

    // Display preview
    function displayPreview(groups) {
        const previewSection = document.getElementById('preview-section');
        const previewContent = document.getElementById('preview-content');

        // Calculate total contacts across all groups
        const totalContacts = groups.reduce((sum, group) => sum + group.totalContacts, 0);
        const totalGroups = groups.length;

        let html = '';
        html += `<div class="preview-summary">
            <strong>${totalGroups} broadcast groups will be created</strong> with ${totalContacts} total contacts (${CONFIG.MAX_PHONES_PER_LIST} contacts per group max)
        </div>`;

        // Show breakdown by brand
        const brandSummary = {};
        groups.forEach(group => {
            Object.keys(group.brandBreakdown).forEach(brand => {
                if (!brandSummary[brand]) {
                    brandSummary[brand] = 0;
                }
                brandSummary[brand] += group.brandBreakdown[brand].length;
            });
        });

        html += '<div class="brand-summary">';
        Object.keys(brandSummary).forEach(brand => {
            html += `<div class="brand-item">
                <strong>${brand}</strong>: ${brandSummary[brand]} contacts
            </div>`;
        });
        html += '</div>';

        // Show detailed group preview with brand breakdown
        html += '<div class="schedule-breakdown">';
        html += '<h4>📅 Broadcast Schedule Breakdown:</h4>';

        groups.forEach((group, index) => {
            const brandBreakdownText = Object.keys(group.brandBreakdown)
                .map(brand => `${group.brandBreakdown[brand].length} ${brand}`)
                .join(' + ');

            html += `
                <div class="schedule-group">
                    <div class="schedule-header">
                        <strong>Group ${group.groupNumber}:</strong> ${brandBreakdownText} (${group.totalContacts} total)
                    </div>
                    <div class="schedule-details">
                        Will send separate broadcasts to each brand's inbox
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // Show sample contacts for first group
        if (groups.length > 0) {
            const firstGroup = groups[0];
            html += `
                <div class="group-preview">
                    <h5>Sample Contacts (Group 1):</h5>
                    <div class="contacts-preview">
                        ${firstGroup.allContacts.slice(0, 5).join(', ')}
                        ${firstGroup.allContacts.length > 5 ? `... and ${firstGroup.allContacts.length - 5} more` : ''}
                    </div>
                </div>
            `;
        }

        previewContent.innerHTML = html;
        previewSection.style.display = 'block';
    }

    // Display detailed dry run results
    function displayDryRunResults(groups, scheduleTimes, startTime) {
        const resultsSection = document.getElementById('results-section');
        const resultsContent = document.getElementById('results-content');

        let html = '<div class="dry-run-results">';
        html += '<h4>🔍 Dry Run Results - Broadcast Schedule</h4>';
        html += `<p><strong>Starting at:</strong> ${startTime} | <strong>Total Groups:</strong> ${groups.length}</p>`;

        // Summary statistics
        const totalContacts = groups.reduce((sum, group) => sum + group.totalContacts, 0);
        const brandStats = {};
        groups.forEach(group => {
            Object.keys(group.brandBreakdown).forEach(brand => {
                if (!brandStats[brand]) brandStats[brand] = 0;
                brandStats[brand] += group.brandBreakdown[brand].length;
            });
        });

        html += '<div class="dry-run-summary">';
        html += `<div><strong>Total Contacts:</strong> ${totalContacts}</div>`;
        html += `<div><strong>Brands Involved:</strong> ${Object.keys(brandStats).join(', ')}</div>`;
        html += `<div><strong>Duration:</strong> ${groups.length * 30} minutes (${groups.length} × 30min intervals)</div>`;
        html += '</div>';

        // Detailed schedule breakdown
        html += '<div class="schedule-timeline">';
        html += '<h5>📅 Detailed Schedule:</h5>';

        groups.forEach((group, index) => {
            const executeTime = scheduleTimes[index];
            const brandBreakdownText = Object.keys(group.brandBreakdown)
                .map(brand => `${group.brandBreakdown[brand].length} ${brand}`)
                .join(' + ');

            html += `
                <div class="timeline-item">
                    <div class="timeline-time">${executeTime.toLocaleTimeString()}</div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <strong>Group ${group.groupNumber}:</strong> ${brandBreakdownText} (${group.totalContacts} contacts)
                        </div>
                        <div class="timeline-details">
                            ${Object.keys(group.brandBreakdown).map(brand => {
                                const inboxId = CONFIG.INBOX_IDS[brand];
                                const brandName = CONFIG.BRAND_NAMES[brand];
                                return `📨 ${brand} (${group.brandBreakdown[brand].length} contacts) → ${brandName}'s inbox`;
                            }).join('<br>')}
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // Brand distribution summary
        html += '<div class="brand-distribution">';
        html += '<h5>📊 Brand Distribution Summary:</h5>';
        Object.keys(brandStats).forEach(brand => {
            const percentage = ((brandStats[brand] / totalContacts) * 100).toFixed(1);
            html += `<div class="brand-stat">
                <strong>${brand}:</strong> ${brandStats[brand]} contacts (${percentage}%)
            </div>`;
        });
        html += '</div>';

        html += '</div>';

        resultsContent.innerHTML = html;
        resultsSection.style.display = 'block';

        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Sort groups by brand order and size (full lists first, then partials)
    function sortGroupsForScheduling(groups) {
        return groups.sort((a, b) => {
            // First sort by brand order
            const brandOrderA = CONFIG.BRAND_ORDER.indexOf(a.brand);
            const brandOrderB = CONFIG.BRAND_ORDER.indexOf(b.brand);

            if (brandOrderA !== brandOrderB) {
                return brandOrderA - brandOrderB;
            }

            // Within same brand, full lists (49 contacts) first, then partials
            if (a.count !== b.count) {
                if (a.count === CONFIG.MAX_PHONES_PER_LIST) return -1;
                if (b.count === CONFIG.MAX_PHONES_PER_LIST) return 1;
                return b.count - a.count; // Larger partials first
            }

            return 0;
        });
    }

    // Calculate schedule times starting from base time
    function calculateScheduleTimes(groups, startTime) {
        const times = [];
        const [hours, minutes] = startTime.split(':').map(Number);

        let currentTime = new Date();
        currentTime.setHours(hours, minutes, 0, 0);

        // If the specified time is in the past, add 5 minutes buffer for immediate start
        const now = new Date();
        if (currentTime <= now) {
            currentTime.setMinutes(currentTime.getMinutes() + 5);
        }

        groups.forEach((group, index) => {
            times.push(new Date(currentTime));

            // Add 30 minutes for next broadcast
            currentTime.setMinutes(currentTime.getMinutes() + 30);
        });

        return times;
    }

    // Handle list creation with combined groups
    async function handleCreateLists() {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const titleSuffix = document.getElementById('list-title-suffix').value.trim() || 'Resends';
        const shouldSchedule = document.getElementById('schedule-broadcasts').checked;

        if (!window.bulkListGroups) {
            alert('Please parse CSV data first.');
            return;
        }

        const groups = window.bulkListGroups;
        const progressSection = document.getElementById('progress-section');
        const progressContent = document.getElementById('progress-content');
        const resultsSection = document.getElementById('results-section');
        const resultsContent = document.getElementById('results-content');

        // Show progress
        progressSection.style.display = 'block';
        resultsSection.style.display = 'none';
        document.getElementById('create-btn').disabled = true;

        const results = [];
        let messageTemplate = '';

        if (shouldSchedule) {
            const startTime = document.getElementById('start-time').value;
            messageTemplate = document.getElementById('message-template').value;

            if (!messageTemplate.trim()) {
                alert('Please enter a message template for scheduled broadcasts.');
                document.getElementById('create-btn').disabled = false;
                return;
            }
        }

        // Calculate total operations for progress tracking
        let totalOperations = 0;
        groups.forEach(group => {
            totalOperations += Object.keys(group.brandBreakdown).length;
            if (shouldSchedule) {
                totalOperations += Object.keys(group.brandBreakdown).length; // + scheduling operations
            }
        });

        let operationCount = 0;

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const brandsInGroup = Object.keys(group.brandBreakdown);

            // Calculate schedule time for this group (30 minutes apart)
            let scheduleTime = null;
            if (shouldSchedule) {
                const startTime = document.getElementById('start-time').value;
                const [hours, minutes] = startTime.split(':').map(Number);
                scheduleTime = new Date();
                scheduleTime.setHours(hours, minutes, 0, 0);

                // If the specified time is in the past, add 5 minutes buffer
                const now = new Date();
                if (scheduleTime <= now) {
                    scheduleTime.setMinutes(scheduleTime.getMinutes() + 5);
                }

                // Add 30 minutes for each group
                scheduleTime.setMinutes(scheduleTime.getMinutes() + (i * 30));
            }

            // Process each brand in this group
            for (let j = 0; j < brandsInGroup.length; j++) {
                const brand = brandsInGroup[j];
                const brandContacts = group.brandBreakdown[brand];

                operationCount++;
                const progressPercent = Math.round((operationCount / totalOperations) * 100);

                progressContent.innerHTML = `
                    <div class="progress-item">
                        Group ${group.groupNumber}: Creating list for ${brand} (${brandContacts.length} contacts) - ${progressPercent}% complete
                        ${shouldSchedule ? `(scheduled for ${scheduleTime.toLocaleString()})` : ''}
                    </div>
                `;

                // Create phone group object for this brand
                const brandPhoneGroup = {
                    brand: brand,
                    phones: brandContacts,
                    count: brandContacts.length
                };

                // Generate title for this brand
                const listTitle = generateTitle(brand, startDate, endDate, titleSuffix);

                // Create list for this brand
                const listResult = await createList(brandPhoneGroup, listTitle, startDate, endDate);

                if (listResult.success && shouldSchedule) {
                    operationCount++;
                    // Schedule broadcast for this brand's list
                    const listId = listResult.data.id;
                    const scheduleResult = await createScheduledBroadcast(
                        listId,
                        brand,
                        scheduleTime,
                        messageTemplate
                    );

                    results.push({
                        ...listResult,
                        groupNumber: group.groupNumber,
                        brand: brand,
                        scheduled: scheduleResult.success,
                        scheduleError: scheduleResult.success ? null : scheduleResult.error,
                        executeAt: scheduleTime,
                        contactCount: brandContacts.length
                    });
                } else {
                    results.push({
                        ...listResult,
                        groupNumber: group.groupNumber,
                        brand: brand,
                        contactCount: brandContacts.length
                    });
                }

                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Show results
        displayCombinedResults(results, shouldSchedule);

        // Hide progress, show results
        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';
        document.getElementById('create-btn').disabled = false;
    }

    // Display results
    function displayResults(results, includeScheduling = false) {
        const resultsContent = document.getElementById('results-content');

        let html = '<div class="results-summary">';
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        if (includeScheduling) {
            const scheduled = results.filter(r => r.scheduled).length;
            const scheduleFailures = results.filter(r => r.success && !r.scheduled).length;
            html += `<p><strong>Lists:</strong> ${successful} created, ${failed} failed</p>`;
            html += `<p><strong>Broadcasts:</strong> ${scheduled} scheduled, ${scheduleFailures} schedule failures</p>`;
        } else {
            html += `<p><strong>Summary:</strong> ${successful} successful, ${failed} failed</p>`;
        }

        results.forEach((result, index) => {
            const statusClass = result.success ? 'success' : 'error';
            const statusText = result.success ? '✓ List Created' : '✗ List Failed';

            let scheduleInfo = '';
            if (includeScheduling && result.success) {
                if (result.scheduled) {
                    scheduleInfo = `<br><small>📅 Broadcast scheduled for ${result.executeAt.toLocaleString()}</small>`;
                } else if (result.scheduleError) {
                    scheduleInfo = `<br><small style="color: #dc3545;">⚠️ Schedule failed: ${result.scheduleError}</small>`;
                }
            }

            html += `
                <div class="result-item ${statusClass}">
                    <strong>${result.title}</strong> - ${statusText}
                    ${!result.success ? `<br><small>Error: ${result.error}</small>` : ''}
                    ${scheduleInfo}
                </div>
            `;
        });

        html += '</div>';
        resultsContent.innerHTML = html;
    }

    // Display results for combined groups
    function displayCombinedResults(results, includeScheduling = false) {
        const resultsContent = document.getElementById('results-content');

        let html = '<div class="results-summary">';
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const totalContacts = results.reduce((sum, r) => sum + (r.contactCount || 0), 0);

        if (includeScheduling) {
            const scheduled = results.filter(r => r.scheduled).length;
            const scheduleFailures = results.filter(r => r.success && !r.scheduled).length;
            html += `<p><strong>Lists:</strong> ${successful} created, ${failed} failed</p>`;
            html += `<p><strong>Broadcasts:</strong> ${scheduled} scheduled, ${scheduleFailures} schedule failures</p>`;
            html += `<p><strong>Total Contacts:</strong> ${totalContacts}</p>`;
        } else {
            html += `<p><strong>Summary:</strong> ${successful} successful, ${failed} failed (${totalContacts} total contacts)</p>`;
        }

        html += '</div>';

        // Group results by group number
        const groupedResults = {};
        results.forEach(result => {
            const groupNum = result.groupNumber || 1;
            if (!groupedResults[groupNum]) {
                groupedResults[groupNum] = [];
            }
            groupedResults[groupNum].push(result);
        });

        // Display results grouped by broadcast group
        Object.keys(groupedResults).sort((a, b) => parseInt(a) - parseInt(b)).forEach(groupNum => {
            const groupResults = groupedResults[groupNum];

            html += `<div class="group-results">
                <h5>📦 Group ${groupNum} Results:</h5>`;

            groupResults.forEach((result, index) => {
                const statusClass = result.success ? 'success' : 'error';
                const statusText = result.success ? '✓ List Created' : '✗ List Failed';

                let scheduleInfo = '';
                if (includeScheduling && result.success) {
                    if (result.scheduled) {
                        scheduleInfo = `<br><small>📅 Broadcast scheduled for ${result.executeAt.toLocaleString()}</small>`;
                    } else if (result.scheduleError) {
                        scheduleInfo = `<br><small style="color: #dc3545;">⚠️ Schedule failed: ${result.scheduleError}</small>`;
                    }
                }

                html += `
                    <div class="result-item ${statusClass}">
                        <strong>${result.brand}</strong> (${result.contactCount} contacts) - ${statusText}
                        ${!result.success ? `<br><small>Error: ${result.error}</small>` : ''}
                        ${scheduleInfo}
                    </div>
                `;
            });

            html += '</div>';
        });

        html += '</div>';
        resultsContent.innerHTML = html;
    }

    // Load Select2 CSS from resource (bypasses CSP)
    function loadSelect2CSS() {
        try {
            const select2CSS = GM_getResourceText('select2CSS');
            GM_addStyle(select2CSS);
            console.log('✅ Select2 CSS loaded from resource');
        } catch (error) {
            console.error('❌ Failed to load Select2 CSS:', error);
        }
    }

    // Load Select2 CSS on script initialization
    loadSelect2CSS();

    // Add CSS styles
    GM_addStyle(`
        #bulk-list-creator {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            position: relative;
            z-index: 9999;
        }

        .bulk-list-creator-container h3 {
            margin-top: 0;
            color: #495057;
            border-bottom: 2px solid #007bff;
            padding-bottom: 10px;
        }

        .input-section, .title-section, .date-section, .schedule-section, .action-section, .mode-section, .existing-lists-section {
            margin-bottom: 20px;
        }

        .input-section label, .title-section label, .date-section label, .schedule-section label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #495057;
        }

        .title-section input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 14px;
            margin-bottom: 5px;
        }

        .title-section small {
            display: block;
            margin-top: 5px;
        }

        .schedule-section input[type="checkbox"] {
            margin-right: 8px;
        }

        .schedule-section input[type="time"], .schedule-section textarea, .schedule-section select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 14px;
            margin-bottom: 10px;
        }

        .schedule-section textarea {
            min-height: 80px;
            font-family: inherit;
            resize: vertical;
        }

        .template-section {
            margin-bottom: 15px;
        }

        .template-section select {
            margin-bottom: 5px;
        }

        /* Select2 custom styling */
        .select2-container--default .select2-selection--single {
            height: 38px;
            border: 1px solid #ced4da;
            border-radius: 4px;
        }

        .select2-container--default .select2-selection--single .select2-selection__rendered {
            line-height: 36px;
            padding-left: 12px;
        }

        .select2-container--default .select2-selection--single .select2-selection__arrow {
            height: 36px;
        }

        .select2-dropdown {
            border: 1px solid #ced4da;
            border-radius: 4px;
        }

        .select2-template-option {
            padding: 8px 0;
        }

        .select2-template-name {
            font-weight: 600;
            color: #495057;
            margin-bottom: 4px;
        }

        .select2-template-preview {
            font-size: 12px;
            color: #6c757d;
            line-height: 1.3;
        }

        .select2-container--default .select2-results__option--highlighted[aria-selected] {
            background-color: #007bff;
        }

        .select2-container {
            z-index: 9999 !important;
        }

        .select2-dropdown {
            z-index: 10000 !important;
        }

        .btn-secondary {
            background: #6c757d;
            color: white;
            font-size: 12px;
            padding: 5px 10px;
        }

        .btn-secondary:hover {
            background: #545b62;
        }

        .btn-secondary:disabled {
            background: #6c757d;
            opacity: 0.6;
        }

        .mode-section label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
        }

        .mode-buttons {
            display: flex;
            gap: 10px;
        }

        .btn-mode {
            background: #f8f9fa;
            color: #495057;
            border: 2px solid #dee2e6;
            padding: 10px 15px;
            font-size: 14px;
            font-weight: 600;
        }

        .btn-mode:hover {
            background: #e9ecef;
            border-color: #adb5bd;
        }

        .btn-mode.active {
            background: #007bff;
            color: white;
            border-color: #007bff;
        }

        .btn-mode.active:hover {
            background: #0056b3;
            border-color: #0056b3;
        }

        .lists-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            flex-wrap: wrap;
            gap: 10px;
        }

        .lists-controls {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
        }

        .lists-placeholder {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 4px;
        }

        .lists-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 10px;
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 10px;
            background: #f8f9fa;
        }

        .list-item {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 0;
            transition: all 0.2s;
        }

        .list-item:hover {
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .list-checkbox {
            display: block;
            padding: 12px;
            margin: 0;
            cursor: pointer;
            width: 100%;
        }

        .list-checkbox input[type="checkbox"] {
            margin-right: 10px;
            transform: scale(1.2);
        }

        .list-info {
            display: inline-block;
            vertical-align: top;
            width: calc(100% - 30px);
        }

        .list-name {
            font-weight: 600;
            color: #495057;
            font-size: 14px;
            line-height: 1.3;
            margin-bottom: 4px;
        }

        .list-details {
            font-size: 12px;
            color: #6c757d;
        }

        .brand-booking { border-left: 4px solid #28a745; }
        .brand-schedule { border-left: 4px solid #ffc107; }
        .brand-reserve { border-left: 4px solid #17a2b8; }
        .brand-sessions { border-left: 4px solid #dc3545; }
        .brand-unknown { border-left: 4px solid #6c757d; }

        #phone-input {
            width: 100%;
            min-height: 120px;
            padding: 10px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
        }

        #list-title {
            width: 100%;
            padding: 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 14px;
        }

        .date-section {
            display: flex;
            gap: 20px;
        }

        .date-section > div {
            flex: 1;
        }

        .date-section input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 14px;
        }

        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-right: 10px;
            transition: all 0.2s;
        }

        .btn-primary {
            background: #007bff;
            color: white;
        }

        .btn-primary:hover {
            background: #0056b3;
        }

        .btn-success {
            background: #28a745;
            color: white;
        }

        .btn-success:hover {
            background: #1e7e34;
        }

        .btn-danger {
            background: #dc3545;
            color: white;
        }

        .btn-danger:hover {
            background: #c82333;
        }

        .btn-info {
            background: #17a2b8;
            color: white;
        }

        .btn-info:hover {
            background: #138496;
        }

        .btn-info:disabled {
            background: #17a2b8;
            opacity: 0.6;
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .preview-section, .progress-section, .results-section {
            margin-top: 20px;
            padding: 15px;
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 4px;
        }

        .group-preview {
            margin-bottom: 15px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
        }

        .group-preview h5 {
            margin: 0 0 8px 0;
            color: #495057;
        }

        .contacts-preview {
            font-size: 12px;
            color: #6c757d;
            font-family: monospace;
        }

        .preview-summary {
            font-size: 14px;
            color: #6c757d;
            margin-bottom: 15px;
            padding: 10px;
            background: #e9ecef;
            border-radius: 4px;
        }

        .brand-summary {
            margin-top: 15px;
            padding: 10px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
        }

        .brand-item {
            font-size: 13px;
            color: #495057;
            margin-bottom: 5px;
        }

        .progress-item {
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin-bottom: 10px;
        }

        .result-item {
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 4px;
            border-left: 4px solid;
        }

        .result-item.success {
            background: #d4edda;
            border-left-color: #28a745;
            color: #155724;
        }

        .result-item.error {
            background: #f8d7da;
            border-left-color: #dc3545;
            color: #721c24;
        }

        .results-summary {
            margin-bottom: 15px;
            padding: 10px;
            background: #e9ecef;
            border-radius: 4px;
        }

        .group-results {
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
        }

        .group-results h5 {
            margin-top: 0;
            margin-bottom: 10px;
            color: #495057;
            font-size: 16px;
        }

        .dry-run-results {
            margin-bottom: 20px;
        }

        .dry-run-results h4 {
            color: #17a2b8;
            margin-bottom: 15px;
            border-bottom: 2px solid #17a2b8;
            padding-bottom: 10px;
        }

        .dry-run-summary {
            background: #d1ecf1;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            border-left: 4px solid #17a2b8;
        }

        .dry-run-summary > div {
            margin-bottom: 5px;
            font-weight: 600;
        }

        .schedule-timeline {
            margin-bottom: 20px;
        }

        .schedule-timeline h5 {
            color: #495057;
            margin-bottom: 15px;
            font-size: 16px;
        }

        .timeline-item {
            display: flex;
            margin-bottom: 15px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 4px solid #007bff;
        }

        .timeline-time {
            font-weight: bold;
            color: #007bff;
            min-width: 80px;
            font-size: 14px;
            padding-right: 15px;
        }

        .timeline-content {
            flex: 1;
        }

        .timeline-header {
            font-size: 14px;
            margin-bottom: 8px;
            color: #495057;
        }

        .timeline-details {
            font-size: 12px;
            color: #6c757d;
            line-height: 1.4;
        }

        .brand-distribution {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #dee2e6;
        }

        .brand-distribution h5 {
            margin-top: 0;
            margin-bottom: 15px;
            color: #495057;
        }

        .brand-stat {
            margin-bottom: 8px;
            padding: 8px;
            background: white;
            border-radius: 4px;
            font-size: 14px;
        }

        .schedule-breakdown {
            margin-top: 20px;
            padding: 15px;
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 4px;
        }

        .schedule-breakdown h4 {
            margin-top: 0;
            color: #856404;
        }

        .schedule-group {
            margin-bottom: 15px;
            padding: 12px;
            background: white;
            border-radius: 4px;
            border-left: 4px solid #ffc107;
        }

        .schedule-header {
            font-size: 14px;
            margin-bottom: 5px;
            color: #495057;
        }

        .schedule-details {
            font-size: 12px;
            color: #6c757d;
            font-style: italic;
        }
    `);

    // Register Tampermonkey menu command
    GM_registerMenuCommand('🎯 Activate Bulk List Creator', function() {
        const existing = document.getElementById('bulk-list-creator');
        if (!existing) {
            createUI();
            console.log('🚀 Bulk List Creator activated via Tampermonkey menu!');
        } else {
            console.log('⚠️ Bulk List Creator is already active');
        }
    });

    // Register Tampermonkey menu command to remove UI
    GM_registerMenuCommand('🗑️ Remove Bulk List Creator UI', function() {
        const container = document.getElementById('bulk-list-creator');
        if (container) {
            container.remove();
            isScriptActive = false;
            console.log('🗑️ Bulk List Creator UI removed via Tampermonkey menu');
        } else {
            console.log('⚠️ No UI to remove');
        }
    });

    // Test function to validate combined logic with user's example data
    function testCombinedLogic() {
        console.log('🧪 Testing combined contact logic...');

        // User's example data
        const testBrandGroups = {
            'BOOKING': Array(33 + 49).fill().map((_, i) => `booking${i + 1}@example.com`), // 82 contacts
            'RESERVE': Array(49 + 5).fill().map((_, i) => `reserve${i + 1}@example.com`),  // 54 contacts
            'SCHEDULE': Array(39 + 49).fill().map((_, i) => `schedule${i + 1}@example.com`), // 88 contacts
            'SESSIONS': Array(17).fill().map((_, i) => `sessions${i + 1}@example.com`)    // 17 contacts
        };

        console.log('📊 Input data:', {
            BOOKING: testBrandGroups.BOOKING.length,
            RESERVE: testBrandGroups.RESERVE.length,
            SCHEDULE: testBrandGroups.SCHEDULE.length,
            SESSIONS: testBrandGroups.SESSIONS.length,
            TOTAL: Object.values(testBrandGroups).reduce((sum, arr) => sum + arr.length, 0)
        });

        const combinedGroups = combineContactsIntoGroups(testBrandGroups);

        console.log('📦 Combined groups result:');
        combinedGroups.forEach(group => {
            console.log(`  Group ${group.groupNumber}: ${group.totalContacts} contacts`);
            Object.keys(group.brandBreakdown).forEach(brand => {
                console.log(`    ${brand}: ${group.brandBreakdown[brand].length} contacts`);
            });
        });

        // Expected breakdown from user:
        // 49 booking, 30 min
        // 33 booking + 16 schedule, 30 min
        // 49 schedule, 30 min
        // 23 schedule + 26 reserve, 30 min
        // 28 reserve + 17 sessions, done

        console.log('✅ Test completed');
        return combinedGroups;
    }

    // Make test function globally available for debugging
    window.testCombinedLogic = testCombinedLogic;

    console.log('🎯 Heymarket Bulk List Creator script loaded!');
    console.log('💡 Use Tampermonkey menu to activate the UI when ready.');
    console.log('🧪 Run testCombinedLogic() in console to test the combined logic');
})();