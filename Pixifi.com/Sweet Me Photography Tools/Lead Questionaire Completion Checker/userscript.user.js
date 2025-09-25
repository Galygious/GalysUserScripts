// ==UserScript==
// @name         SMPT - Lead Questionnaire Completion Checker
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Checks completion status of questionnaires for leads based on current Pixifi filters.
// @match        https://www.pixifi.com/admin/leads/
// @license      GPL
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      www.pixifi.com
// @connect      questionnaires.pixifi.com
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    let lastGetLeadsBody = null; // stores the latest captured body for /getLeads/
    const CLIENT_ID = '12295'; // Define CLIENT_ID at a higher scope

    // Store lead data globally (or in a persistent scope) for sorting
    let categorizedLeads = {
        completed: [],
        abandoned: [],
        notStarted: [],
        booking: []
    };

    // Preference for abandoned check, default to true
    let enableAbandonedCheck = GM_getValue('enableAbandonedCheck', true); // Load saved preference, default to true

    // ---- Debug function to log messages to console with prefix ----
    function debugLog(message) {
        console.log(`[LeadQChecker] ${message}`);
    }

    // Initial debugging message to verify script is loaded
    debugLog('Script loaded: SMPT - Lead Questionnaire Completion Checker');

    // ---- INTERCEPT XMLHttpRequest TO CAPTURE CURRENT FILTER POST BODY ----
    (function interceptGetLeadsXHR() {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._pixifiURL = url;
            return origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            try {
                if (this._pixifiURL && this._pixifiURL.includes('/admin/fn/leads/getLeads/') && typeof body === 'string') {
                    lastGetLeadsBody = body; // capture the most recent body containing current filters
                }
            } catch (e) {
                debugLog(`XHR interception error: ${e}`);
            }
            return origSend.apply(this, arguments);
        };
    })();

    // ---- FETCH ALL LEADS USING THE CAPTURED BODY ----
    function fetchAllLeadsWithCurrentFilters() {
        return new Promise((resolve, reject) => {
            // If we don't have a captured body yet, try to trigger refreshLeads() to get one
            if (!lastGetLeadsBody) {
                debugLog('No getLeads request captured yet, attempting to trigger refreshLeads()...');
                
                // Check if refreshLeads function exists and call it
                let refreshFunction = null;
                
                // Try multiple ways to find the refreshLeads function
                if (typeof window.refreshLeads === 'function') {
                    refreshFunction = window.refreshLeads;
                    debugLog('Found refreshLeads() on window object');
                } else if (typeof refreshLeads === 'function') {
                    refreshFunction = refreshLeads;
                    debugLog('Found refreshLeads() in global scope');
                } else if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.refreshLeads === 'function') {
                    refreshFunction = unsafeWindow.refreshLeads;
                    debugLog('Found refreshLeads() on unsafeWindow object');
                }
                
                if (refreshFunction) {
                    debugLog('Calling refreshLeads() to capture the request body...');
                    
                    // Update progress bar to show refresh is happening
                    const progressText = document.getElementById('progress-text');
                    if (progressText) {
                        progressText.textContent = 'Refreshing leads data...';
                    }
                    
                    try {
                        refreshFunction();
                    } catch (error) {
                        debugLog(`Error calling refreshLeads(): ${error}`);
                        return reject(`Error calling refreshLeads(): ${error}`);
                    }
                    
                    // Wait a bit for the request to be captured, then try again
                    setTimeout(() => {
                        if (lastGetLeadsBody) {
                            debugLog('Successfully captured getLeads body after refreshLeads() call');
                            
                            // Update progress bar to show fetching
                            const progressText = document.getElementById('progress-text');
                            if (progressText) {
                                progressText.textContent = 'Fetching all leads data...';
                            }
                            
                            // Now make the actual request with the captured body
                            const body = lastGetLeadsBody
                                .replace(/(^|&)page=\d+/i, '$1page=1')
                                .replace(/(^|&)numPerPage=\d+/i, '$1numPerPage=999999999');

                            GM_xmlhttpRequest({
                                method: 'POST',
                                url: 'https://www.pixifi.com/admin/fn/leads/getLeads/',
                                headers: {
                                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'x-requested-with': 'XMLHttpRequest'
                                },
                                data: body,
                                onload: r => (r.status === 200 ? resolve(r.responseText) : reject('HTTP ' + r.status)),
                                onerror: reject
                            });
                        } else {
                            reject('refreshLeads() was called but no getLeads request was captured. Please change a filter or sort manually.');
                        }
                    }, 1000); // Wait 1 second for the request to be captured
                    
                    return;
                } else {
                    debugLog('refreshLeads() function not found in window, global scope, or unsafeWindow');
                    return reject('No getLeads request captured yet and refreshLeads() function not found – change a sort/filter first.');
                }
            }

            const body = lastGetLeadsBody
                .replace(/(^|&)page=\d+/i, '$1page=1')
                .replace(/(^|&)numPerPage=\d+/i, '$1numPerPage=999999999');

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/fn/leads/getLeads/',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-requested-with': 'XMLHttpRequest'
                },
                data: body,
                onload: r => (r.status === 200 ? resolve(r.responseText) : reject('HTTP ' + r.status)),
                onerror: reject
            });
        });
    }

    // ---- PARSE THE ROWS RETURNED BY GETLEADS ----
    function parseLeadRows(html) {
        const clean = html.replace(/^SUCCESS\{\|\}\s*/, '');
        const doc = new DOMParser().parseFromString(clean, 'text/html');
        const rows = doc.querySelectorAll('.gridRow[id^="row_"]');
        return Array.from(rows).map(extractLeadData).filter(Boolean);
    }

    /**
     * Extracts lead data from a row element.
     * @param {HTMLElement} rowElement - The lead row div.
     * @returns {object|null} - An object with leadId, email, firstName, lastName, phone, and priority, or null if data is missing.
     */
    function extractLeadData(rowElement) {
        try {
            const leadIdMatch = rowElement.id.match(/row_(\d+)/);
            if (!leadIdMatch) return null;
            const leadId = leadIdMatch[1];

            // Check if this lead has "** BOOKING **" status - we'll categorize it separately
            // The booking status is in the 5th floatGrid div (after checkbox, status, name, date)
            const floatGrids = rowElement.querySelectorAll('.floatGrid');
            let isBooking = false;
            if (floatGrids.length >= 5) {
                const bookingStatusDiv = floatGrids[4]; // 5th div (0-indexed)
                if (bookingStatusDiv && bookingStatusDiv.textContent.trim() === '** BOOKING **') {
                    isBooking = true;
                    debugLog(`Found booking lead ${leadId} - will categorize as booking`);
                }
            }

            // Get email from the compose email onclick attribute
            const emailLink = rowElement.querySelector('a[onclick*="composeNewObjectEmail"]');
            const email = emailLink ? emailLink.getAttribute('onclick').match(/,'([^']*@[^']*)'[^)]*\)/)[1] : '';

            // Get name from the strong tag within the third floatGrid div
            const nameDiv = rowElement.querySelector('.floatGrid[style*="width: 185px"]');
            const nameElement = nameDiv ? nameDiv.querySelector('strong') : null;
            let firstName = '', lastName = '';

            if (nameElement) {
                const fullName = nameElement.textContent.trim();
                const nameParts = fullName.split(' ');
                firstName = (nameParts[0] || '').trim();
                lastName = (nameParts.slice(1).join(' ') || '').trim();
            }

            // Get phone from tel: link
            const phoneLink = rowElement.querySelector('a[href^="tel:"]');
            let phone = '';
            if (phoneLink) {
                const rawPhone = phoneLink.getAttribute('href').replace(/[^0-9]/g, '');
                if (rawPhone.length >= 10) {
                    phone = rawPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3').trim();
                } else {
                    phone = rawPhone.trim();
                }
            }

            // Check priority based on the circle icon's class
            const priorityIcon = rowElement.querySelector('i.fa.fa-circle[title]');
            let priority = 'advanced';
            if (priorityIcon && priorityIcon.classList.contains('font-red-flamingo')) {
                priority = 'baby_here';
            }

            // Extract Brand information
            const brandSpan = rowElement.querySelector('.floatGrid[style*="width: 185px"] .smallText');
            const brand = brandSpan ? brandSpan.textContent.trim() : '';

            return { leadId, email, firstName, lastName, phone, priority, brand, isBooking };
        } catch (error) {
            debugLog(`Error extracting data from row: ${error}`);
            return null;
        }
    }

    /**
     * Renders a table of leads for a given category.
     * @param {Array<object>} leads - Array of lead objects.
     * @param {string} categoryTitle - Title for the category (e.g., "Completed Questionnaires").
     * @param {string} tableIdSuffix - Suffix for the table ID (e.g., "completed").
     * @returns {string} HTML string for the table.
     */
    function renderLeadsTable(leads, categoryTitle, tableIdSuffix) {
        if (leads.length === 0) {
            // Special message for abandoned questionnaires when the check is disabled
            let noResultsMessage = `No leads with ${categoryTitle.toLowerCase()} found.`;
            if (tableIdSuffix === 'abandoned' && !enableAbandonedCheck) {
                noResultsMessage = 'Abandoned check is disabled. Enable the "Enable Abandoned Check" option and rerun to find abandoned questionnaires.';
            }
            
            return `<div class="category-section">
                <div class="category-header collapsed" data-category="${tableIdSuffix}">
                    <span class="category-toggle">
                        <i class="fa fa-chevron-right" id="toggle-${tableIdSuffix}"></i>
                        <strong>${categoryTitle}:</strong> 0 leads
                    </span>
                    <div class="copy-dropdown">
                        <button class="copy-dropdown-btn">Copy ▼</button>
                        <div class="copy-dropdown-menu">
                            <div class="copy-option" data-category="${tableIdSuffix}" data-format="slack">Slack</div>
                            <div class="copy-option" data-category="${tableIdSuffix}" data-format="csv">CSV</div>
                        </div>
                    </div>
                </div>
                <div class="category-content" id="content-${tableIdSuffix}" style="display: none;">
                    <div class="no-results">${noResultsMessage}</div>
                </div>
            </div>`;
        }

        let tableHtml = `
            <div class="category-section">
                <div class="category-header collapsed" data-category="${tableIdSuffix}">
                    <span class="category-toggle">
                        <i class="fa fa-chevron-right" id="toggle-${tableIdSuffix}"></i>
                        <strong>${categoryTitle}:</strong> ${leads.length} leads
                    </span>
                    <div class="copy-dropdown">
                        <button class="copy-dropdown-btn">Copy ▼</button>
                        <div class="copy-dropdown-menu">
                            <div class="copy-option" data-category="${tableIdSuffix}" data-format="slack">Slack</div>
                            <div class="copy-option" data-category="${tableIdSuffix}" data-format="csv">CSV</div>
                        </div>
                    </div>
                </div>
                <div class="category-content" id="content-${tableIdSuffix}" style="display: none;">
                    <div class="table-container">
                        <table class="leads-table" id="leads-table-${tableIdSuffix}">
                            <thead>
                                <tr>
                                    <th data-sort-key="firstName">First Name</th>
                                    <th data-sort-key="lastName">Last Name</th>
                                    <th data-sort-key="email">Email</th>
                                    <th data-sort-key="phone">Phone</th>
                                    <th data-sort-key="brand">Brand</th>
                                </tr>
                            </thead>
                            <tbody>`;

        leads.forEach(lead => {
            tableHtml += `<tr>
                <td><a href="/admin/leads/${lead.leadId}/" target="_blank">${lead.firstName || ''}</a></td>
                <td>${lead.lastName || ''}</td>
                <td><a href="/admin/leads/${lead.leadId}/" target="_blank">${lead.email || ''}</a></td>
                <td>${lead.phone || ''}</td>
                <td>${lead.brand || ''}</td>
            </tr>`;
        });

        tableHtml += `</tbody></table></div></div></div>`;
        return tableHtml;
    }

    // --- Main Lead Processing Function ---
    async function processLeadsForQuestionnaires() {
        const resultsDiv = document.getElementById('lead-questionnaire-results');
        const checkButton = document.getElementById('lead-questionnaire-checker-btn');

        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <h4>Processing Leads...</h4>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <div class="progress-text" id="progress-text">Fetching lead data...</div>
                </div>`;
        }
        if (checkButton) checkButton.disabled = true;

        debugLog('processLeadsForQuestionnaires initiated.');

        // Check if lastGetLeadsBody is available before proceeding
        if (!lastGetLeadsBody) {
            const errorMessage = 'Attempting to automatically refresh leads data...';
            debugLog(errorMessage);
            // Update the progress text instead of replacing the entire progress bar
            const progressText = document.getElementById('progress-text');
            if (progressText) {
                progressText.textContent = errorMessage;
            }
            // Don't return here - let the fetchAllLeadsWithCurrentFilters function handle the refresh
        }

        try {
            const rawHTML = await fetchAllLeadsWithCurrentFilters();
            const allLeads = parseLeadRows(rawHTML);
            debugLog(`Fetched ${allLeads.length} leads.`);

            const leadsWithCompletedQuestionnaires = [];
            const leadsWithIncompleteQuestionnaires = [];
            const leadsWithAbandonedQuestionnaires = [];
            const bookingLeads = [];

            // Separate booking leads from questionnaire processing leads
            const nonBookingLeads = allLeads.filter(lead => !lead.isBooking);
            const bookingLeadsOnly = allLeads.filter(lead => lead.isBooking);
            
            bookingLeads.push(...bookingLeadsOnly);
            debugLog(`Found ${bookingLeadsOnly.length} booking leads and ${nonBookingLeads.length} non-booking leads`);

            const totalLeads = nonBookingLeads.length;
            let processedLeads = 0;

            const updateProgress = (current, total, text) => {
                const percentage = Math.round((current / total) * 100);
                const progressFill = document.getElementById('progress-fill');
                const progressText = document.getElementById('progress-text');

                if (progressFill) {
                    progressFill.style.width = `${percentage}%`;
                }
                if (progressText) {
                    progressText.textContent = `${text} (${current}/${total}) - ${percentage}%`;
                }
            };

            // Use parallel processing for better performance (only for non-booking leads)
            const results = await processLeadsInParallel(nonBookingLeads, updateProgress);
            categorizedLeads.completed = results.completed;
            categorizedLeads.abandoned = results.abandoned;
            categorizedLeads.notStarted = results.notStarted;
            categorizedLeads.booking = bookingLeads;

            debugLog('Leads with completed questionnaires:', categorizedLeads.completed);
            debugLog('Leads with incomplete questionnaires:', categorizedLeads.notStarted);
            debugLog('Leads with abandoned questionnaires:', categorizedLeads.abandoned);
            debugLog('Booking leads:', categorizedLeads.booking);

            let output = `
                <div class="results-header">
                    <h4>Lead Questionnaire Status Results</h4>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa fa-times close-results" title="Close Results"></i>
                    </div>
                </div>`;

            output += renderLeadsTable(categorizedLeads.completed, "Completed Questionnaires", "completed");
            output += renderLeadsTable(categorizedLeads.abandoned, "Abandoned Questionnaires", "abandoned");
            output += renderLeadsTable(categorizedLeads.notStarted, "Not Started Questionnaires", "notStarted");
            output += renderLeadsTable(categorizedLeads.booking, "Booking Leads", "booking");

            resultsDiv.innerHTML = output;
            resultsDiv.style.color = '#333';

            const closeBtn = resultsDiv.querySelector('.close-results');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    resultsDiv.style.display = 'none';
                    debugLog('Results display hidden.');
                });
            }

            // Attach sort event listeners after rendering
            attachSortListeners();
            // Attach copy button listeners after rendering
            attachCopyButtonListeners();
            // Attach collapse/expand listeners after rendering
            attachToggleListeners();

        } catch (error) {
            debugLog(`Error during lead processing: ${error}`); // Log the full error object
            if (resultsDiv) {
                resultsDiv.innerHTML = `<h4 class="error">An unexpected error occurred</h4><p>Error: ${error instanceof Error ? error.message : error}</p><p>Check the console (F12) for more details.</p>`;
                resultsDiv.style.color = '#dc3545';
            }
        } finally {
            if (checkButton) checkButton.disabled = false;
        }
    }

    /**
     * Process leads in parallel batches with concurrency control
     * @param {Array} allLeads - Array of all leads to process
     * @param {Function} updateProgress - Progress update callback
     * @returns {Promise<Object>} - Object containing categorized leads
     */
    async function processLeadsInParallel(allLeads, updateProgress) {
        const BATCH_SIZE = 8; // Process 8 leads concurrently - good balance of speed and server respect
        const totalLeads = allLeads.length;
        let processedLeads = 0;

        const leadsWithCompletedQuestionnaires = [];
        const leadsWithIncompleteQuestionnaires = [];
        const leadsWithAbandonedQuestionnaires = [];

        // First pass: Check completion status in parallel batches
        updateProgress(0, totalLeads, 'Checking questionnaire completion status...');

        for (let i = 0; i < allLeads.length; i += BATCH_SIZE) {
            const batch = allLeads.slice(i, i + BATCH_SIZE);

            const completionPromises = batch.map(async (lead) => {
                try {
                    const hasCompleted = await checkLeadForCompletedQuestionnaire(lead.leadId);
                    return { lead, hasCompleted };
                } catch (error) {
                    debugLog(`Error checking completion for lead ${lead.leadId}: ${error}`);
                    return { lead, hasCompleted: false };
                }
            });

            const completionResults = await Promise.all(completionPromises);

            completionResults.forEach(({ lead, hasCompleted }) => {
                processedLeads++;
                updateProgress(processedLeads, totalLeads, `Checked completion: ${lead.firstName || 'lead'} ${lead.lastName || ''}`);

                if (hasCompleted) {
                    leadsWithCompletedQuestionnaires.push(lead);
                } else {
                    leadsWithIncompleteQuestionnaires.push(lead);
                }
            });
        }

        // Second pass: Check abandonment status for incomplete leads if enabled
        if (enableAbandonedCheck && leadsWithIncompleteQuestionnaires.length > 0) {
            updateProgress(processedLeads, totalLeads, 'Checking for abandoned questionnaires...');

            const incompleteLeads = [...leadsWithIncompleteQuestionnaires];
            leadsWithIncompleteQuestionnaires.length = 0; // Clear the array

            let abandonmentProcessed = 0;

            for (let i = 0; i < incompleteLeads.length; i += BATCH_SIZE) {
                const batch = incompleteLeads.slice(i, i + BATCH_SIZE);

                const abandonmentPromises = batch.map(async (lead) => {
                    try {
                        const isAbandoned = await checkLeadForAbandonedQuestionnaire(lead.leadId);
                        return { lead, isAbandoned };
                    } catch (error) {
                        debugLog(`Error checking abandonment for lead ${lead.leadId}: ${error}`);
                        return { lead, isAbandoned: false };
                    }
                });

                const abandonmentResults = await Promise.all(abandonmentPromises);

                abandonmentResults.forEach(({ lead, isAbandoned }) => {
                    abandonmentProcessed++;
                    const totalProgress = processedLeads + abandonmentProcessed;
                    const totalToProcess = totalLeads + incompleteLeads.length; // Completion + abandonment checks

                    updateProgress(totalProgress, totalToProcess, `Checked abandonment: ${lead.firstName || 'lead'} ${lead.lastName || ''}`);

                    if (isAbandoned) {
                        leadsWithAbandonedQuestionnaires.push(lead);
                    } else {
                        leadsWithIncompleteQuestionnaires.push(lead);
                    }
                });
            }
        }

        return {
            completed: leadsWithCompletedQuestionnaires,
            abandoned: leadsWithAbandonedQuestionnaires,
            notStarted: leadsWithIncompleteQuestionnaires
        };
    }

    /**
     * Check if a lead has an abandoned questionnaire
     * @param {string} leadId - The ID of the lead
     * @returns {Promise<boolean>} - True if questionnaire is abandoned, false otherwise
     */
    async function checkLeadForAbandonedQuestionnaire(leadId) {
        try {
            const questionnaireListingBody = `clientID=${CLIENT_ID}&objectType=lead&objectID=${leadId}`;
            const questionnaireListingHtml = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://www.pixifi.com/admin/fn/quest/refreshQuestionnaireToObjectListing/',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'x-requested-with': 'XMLHttpRequest'
                    },
                    data: questionnaireListingBody,
                    onload: r => (r.status === 200 ? resolve(r.responseText) : reject(`HTTP ${r.status}`)),
                    onerror: reject
                });
            });

            if (!questionnaireListingHtml.includes('SUCCESS{|}')) {
                debugLog(`Failed to get questionnaire listing for lead ${leadId}`);
                return false;
            }

            const cleanListingHtml = questionnaireListingHtml.split('SUCCESS{|}')[1];
            const listingDoc = new DOMParser().parseFromString(cleanListingHtml, 'text/html');
            const externalLinkElement = listingDoc.querySelector('a[href*="questionnaires.pixifi.com/"]');

            if (!externalLinkElement) {
                debugLog(`No external questionnaire link found for lead ${leadId}`);
                return false;
            }

            const externalQuestionnaireUrl = externalLinkElement.href;
            debugLog(`Found external questionnaire URL for lead ${leadId}: ${externalQuestionnaireUrl}`);

            const questionnaireHtml = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: externalQuestionnaireUrl,
                    onload: r => (r.status === 200 ? resolve(r.responseText) : reject(`HTTP ${r.status}`)),
                    onerror: reject
                });
            });

            return isQuestionnairePartiallyFilled(questionnaireHtml);
        } catch (error) {
            debugLog(`Error during questionnaire fetching for lead ${leadId}: ${error}`);
            return false;
        }
    }

    /**
     * Fetches questionnaires for a specific lead and checks for completion.
     * @param {string} leadId - The ID of the lead.
     * @returns {Promise<boolean>} - True if any questionnaire is completed, false otherwise.
     */
    async function checkLeadForCompletedQuestionnaire(leadId) {
        // CLIENT_ID is now defined at the top of processLeadsForQuestionnaires
        const body = `clientID=${CLIENT_ID}&objectType=lead&objectID=${leadId}`;

        try {
            const res = await fetch("https://www.pixifi.com/admin/fn/quest/refreshQuestionnaireToObjectListing/", {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
                body,
                credentials: 'include'
            });
            const html = await res.text();

            if (!html.includes('SUCCESS{|}')) {
                debugLog(`Failed to get questionnaires for lead ${leadId}: ${html.substring(0, 100)}...`);
                return false;
            }

            const htmlContent = html.split('SUCCESS{|}')[1];
            const doc = new DOMParser().parseFromString(htmlContent, 'text/html');

            const questionnaireDivs = doc.querySelectorAll('div[id^="questionnaire_"]');

            for (const div of questionnaireDivs) {
                // A questionnaire is completed if its third floatGrid div (index 2) contains a span with class 'fa fa-check'
                const completionStatusDiv = div.querySelectorAll('.floatGrid')[2];
                if (completionStatusDiv && completionStatusDiv.querySelector('.fa.fa-check')) {
                    debugLog(`Lead ${leadId} has a completed questionnaire.`);
                    return true;
                }
            }

            debugLog(`Lead ${leadId} has no completed questionnaires.`);
            return false;

        } catch (error) {
            debugLog(`Error fetching questionnaires for lead ${leadId}: ${error}`);
            return false;
        }
    }

    /**
     * Helper function to get the text label associated with a form element.
     * It traverses up to find the closest questionnaire-item or questionnaire-section and extracts the title.
     * @param {HTMLElement} element - The form element (input, textarea, select).
     * @returns {string|null} The trimmed text content of the label, or null if not found.
     */
    function getFieldLabel(element) {
        let parentItem = element.closest('.questionnaire-item');
        if (parentItem) {
            const titleDiv = parentItem.querySelector('.questionnaire-item__title');
            if (titleDiv) {
                return titleDiv.textContent.trim();
            }
        }

        // If not directly inside a questionnaire-item with a title, check for section title (e.g., Location of Session)
        let parentSection = element.closest('.questionnaire-section');
        if (parentSection) {
            const sectionTitleDiv = parentSection.querySelector('.questionnaire-section__title');
            if (sectionTitleDiv) {
                return sectionTitleDiv.textContent.trim();
            }
        }

        return null; // No identifiable label found
    }

    /**
     * Checks if a questionnaire has any fields filled out (abandoned).
     * It entirely ignores specific system-populated fields based on their text labels.
     * @param {string} htmlContent - The HTML content of the questionnaire.
     * @returns {boolean} - True if any field *not* in the ignored list is filled/changed, false otherwise.
     */
    function isQuestionnairePartiallyFilled(htmlContent) {
        debugLog('Entering isQuestionnairePartiallyFilled');
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        const formElements = doc.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea, select, input[type="checkbox"], input[type="radio"]');

        // Define text labels of fields that should be *entirely ignored* when checking for abandonment.
        // These are fields that are always pre-filled by the system (either with lead data or location data).
        // Any value in these fields does NOT indicate user interaction for abandonment purposes.
        const labelsToAlwaysIgnoreForAbandonment = new Set([
            "Full Name of Parent or Guardian",
            "Cell Phone Number",
            "Zip/Postal Code",
            "City/Town",
            "State/Province",
            "Country"
        ]);

        for (const element of formElements) {
            const fieldId = element.id || element.name; // Keep ID for logging, but logic relies on label
            const fieldLabel = getFieldLabel(element); // Get the static label

            debugLog(`Checking field: ${fieldId}, Label: "${fieldLabel}", Tag: ${element.tagName}, Type: ${element.type || element.getAttribute('type')}, Value: "${element.value}", Checked: ${element.checked}`);

            // 1. If this field's label is in our list of ignored labels, skip it immediately.
            if (fieldLabel && labelsToAlwaysIgnoreForAbandonment.has(fieldLabel)) {
                debugLog(`Skipping ignored system-populated field based on label: ${fieldLabel} (${fieldId})`);
                continue;
            }

            // 2. For all *other* fields, check if they contain any user input.
            if (element.tagName === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
                // For checkboxes/radios, any checked state in a non-ignored field indicates user interaction.
                if (element.checked) {
                    debugLog(`Found checked checkbox/radio indicating abandoned: ${fieldId} (Label: "${fieldLabel}")`);
                    return true;
                }
            } else if (element.tagName === 'SELECT') {
                const currentValue = element.value;
                const defaultEmptyValues = ["", "--", "-- choose one --"];

                // If it's not a default empty value, it indicates abandonment.
                if (!defaultEmptyValues.includes(currentValue)) {
                    debugLog(`Found non-default selected option indicating abandoned: ${fieldId} = ${currentValue} (Label: "${fieldLabel}")`);
                    return true;
                }
            } else if (element.value !== undefined) { // For text inputs and textareas
                const trimmedValue = element.value.trim();

                // If it has any non-empty value, it indicates abandonment.
                if (trimmedValue !== "") {
                    debugLog(`Found non-empty text/textarea field indicating abandoned: ${fieldId} = "${trimmedValue}" (Label: "${fieldLabel}")`);
                    return true;
                }
            }
        }

        // If we reach here, no user-filled fields (outside of the ignored system-populated fields) were found.
        debugLog('No user-filled fields found outside of the ignored system-populated fields. Not abandoned.');
        return false;
    }

    /**
     * Attaches click event listeners to table headers for sorting.
     */
    function attachSortListeners() {
        document.querySelectorAll('.leads-table th[data-sort-key]').forEach(header => {
            header.style.cursor = 'pointer'; // Indicate sortable
            header.innerHTML += ' <span class="sort-indicator"></span>'; // Add a span for the indicator

            header.addEventListener('click', function() {
                const sortKey = this.dataset.sortKey;
                const tableId = this.closest('table').id; // e.g., leads-table-completed
                const category = tableId.replace('leads-table-', ''); // e.g., completed

                let currentSortDirection = this.dataset.sortDirection || 'asc';
                const newSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';

                // Remove indicators from other headers in the same table
                this.closest('table').querySelectorAll('th .sort-indicator').forEach(indicator => {
                    indicator.textContent = '';
                });

                // Set new sort direction on clicked header
                this.dataset.sortDirection = newSortDirection;
                this.querySelector('.sort-indicator').textContent = newSortDirection === 'asc' ? ' ▲' : ' ▼';

                sortLeads(category, sortKey, newSortDirection);
            });
        });
    }

    /**
     * Sorts the leads array for a given category and re-renders the table.
     * @param {string} category - The category of leads to sort (e.g., 'completed', 'abandoned', 'notStarted').
     * @param {string} sortKey - The key to sort by (e.g., 'firstName', 'brand').
     * @param {string} sortDirection - 'asc' for ascending, 'desc' for descending.
     */
    function sortLeads(category, sortKey, sortDirection) {
        let leadsToSort = categorizedLeads[category];

        leadsToSort.sort((a, b) => {
            const valA = (a[sortKey] || '').toString().toLowerCase();
            const valB = (b[sortKey] || '').toString().toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        // Re-render the specific table with sorted data
        const tableContainer = document.getElementById(`leads-table-${category}`).closest('.table-container');
        if (tableContainer) {
            // Preserve the header with its sort indicators
            const headerHtml = tableContainer.querySelector('thead').outerHTML;
            const newBodyHtml = categorizedLeads[category].map(lead => `<tr>
                <td><a href="/admin/leads/${lead.leadId}/" target="_blank">${lead.firstName || ''}</a></td>
                <td>${lead.lastName || ''}</td>
                <td><a href="/admin/leads/${lead.leadId}/" target="_blank">${lead.email || ''}</a></td>
                <td>${lead.phone || ''}</td>
                <td>${lead.brand || ''}</td>
            </tr>`).join('');
            tableContainer.querySelector('tbody').innerHTML = newBodyHtml;
        }
    }

    /**
     * Copies the content of a specified lead table to the clipboard in a Slack-friendly format.
     * @param {string} category - The category of leads ('completed', 'abandoned', 'notStarted').
     * @param {string} format - The format to copy ('slack' or 'csv').
     */
    function copyTableToClipboard(category, format = 'slack') {
        const leads = categorizedLeads[category];
        if (!leads || leads.length === 0) {
            debugLog(`No leads in category ${category} to copy.`);
            GM_setClipboard(''); // Clear clipboard or set empty
            return;
        }

        if (format === 'csv') {
            copyTableAsCSV(leads);
        } else {
            copyTableAsSlack(leads);
        }
    }

    /**
     * Copies leads data as CSV format.
     * @param {Array} leads - Array of lead objects.
     */
    function copyTableAsCSV(leads) {
        const headers = ['Name', 'Profile Link', 'Email', 'Phone', 'Brand'];
        const csvRows = [headers.join(',')];

        leads.forEach(lead => {
            const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
            const profileLink = `https://www.pixifi.com/admin/leads/${lead.leadId}/`;
            const email = lead.email || '';
            const phone = lead.phone || '';
            const brand = lead.brand || '';

            // Escape CSV values that contain commas or quotes
            const escapeCSV = (value) => {
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            };

            const row = [
                escapeCSV(fullName),
                escapeCSV(profileLink),
                escapeCSV(email),
                escapeCSV(phone),
                escapeCSV(brand)
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');
        GM_setClipboard(csvContent);
        debugLog('Copied table as CSV to clipboard.');
    }

    /**
     * Copies leads data as Slack format.
     * @param {Array} leads - Array of lead objects.
     */
    function copyTableAsSlack(leads) {
        // Determine max lengths for each content field
        let maxNameLen = 'Name'.length;
        let maxEmailLen = 'Email'.length;
        let maxPhoneLen = 'Phone'.length;
        let maxBrandLen = 'Brand'.length;

        // "Profile" link text length is fixed for display alignment
        const PROFILE_DISPLAY_TEXT = ' Pixifi ';
        const PROFILE_DISPLAY_TEXT_LEN = PROFILE_DISPLAY_TEXT.length;

        leads.forEach(lead => {
            const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
            maxNameLen = Math.max(maxNameLen, fullName.length);
            maxEmailLen = Math.max(maxEmailLen, (lead.email || '').length);
            maxPhoneLen = Math.max(maxPhoneLen, (lead.phone || '').length);
            maxBrandLen = Math.max(maxBrandLen, (lead.brand || '').length);
        });

        // Ensure header also fits within max lengths (already accounted for above)
        // No need to check again since we started with header lengths

        const lines = [];

        // Construct the header line - everything in backticks except the profile link
        let headerLine =
            `\`| ${'Name'.padEnd(maxNameLen)} | Links | ${'Email'.padEnd(maxEmailLen)} | ${'Phone'.padEnd(maxPhoneLen)} | ${'Brand'.padEnd(maxBrandLen)} |\``;
        lines.push(headerLine);


        leads.forEach(lead => {
            const profileLink = `https://www.pixifi.com/admin/leads/${lead.leadId}/`;

            // Data row construction - everything in backticks except the profile link
            const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
            const nameContent = fullName.padEnd(maxNameLen);
            const emailContent = (lead.email || '').padEnd(maxEmailLen);
            const phoneContent = (lead.phone || '').padEnd(maxPhoneLen);
            const brandContent = (lead.brand || '').padEnd(maxBrandLen);

            let row =
                `\`| ${nameContent} |\`` +
                `[${PROFILE_DISPLAY_TEXT}](${profileLink})` +
                `\`| ${emailContent} | ${phoneContent} | ${brandContent} |\``;
            lines.push(row);
        });

        const textToCopy = lines.join('\n');
        GM_setClipboard(textToCopy);
        debugLog(`Copied table as Slack format to clipboard.`);
    }

    /**
     * Attaches click event listeners to category toggle buttons.
     */
    function attachToggleListeners() {
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', function(e) {
                // Don't toggle if clicking on copy dropdown
                if (e.target.closest('.copy-dropdown')) {
                    return;
                }
                
                const category = this.dataset.category;
                const contentDiv = document.getElementById(`content-${category}`);
                const toggleIcon = document.getElementById(`toggle-${category}`);
                
                if (contentDiv && toggleIcon) {
                    if (contentDiv.style.display === 'none') {
                        // Expand
                        contentDiv.style.display = 'block';
                        toggleIcon.className = 'fa fa-chevron-down';
                        this.classList.remove('collapsed');
                        this.classList.add('expanded');
                    } else {
                        // Collapse
                        contentDiv.style.display = 'none';
                        toggleIcon.className = 'fa fa-chevron-right';
                        this.classList.remove('expanded');
                        this.classList.add('collapsed');
                    }
                }
            });
            
            // Add cursor pointer style
            header.style.cursor = 'pointer';
        });
    }

    /**
     * Attaches click event listeners to copy buttons.
     */
    function attachCopyButtonListeners() {
        // Handle dropdown button clicks
        document.querySelectorAll('.copy-dropdown-btn').forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const dropdown = this.closest('.copy-dropdown');
                const menu = dropdown.querySelector('.copy-dropdown-menu');

                // Close other dropdowns first
                document.querySelectorAll('.copy-dropdown-menu').forEach(otherMenu => {
                    if (otherMenu !== menu) {
                        otherMenu.style.display = 'none';
                    }
                });

                // Toggle current dropdown
                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
            });
        });

        // Handle copy option clicks
        document.querySelectorAll('.copy-option').forEach(option => {
            option.addEventListener('click', function() {
                const category = this.dataset.category;
                const format = this.dataset.format;
                copyTableToClipboard(category, format);

                // Provide feedback
                const originalText = this.textContent;
                this.textContent = 'Copied!';
                setTimeout(() => {
                    this.textContent = originalText;
                }, 1500);

                // Close dropdown
                this.closest('.copy-dropdown-menu').style.display = 'none';
            });
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', function() {
            document.querySelectorAll('.copy-dropdown-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        });
    }

    /**
     * Define the Lead Questionnaire Checker tool.
     */
    const leadQuestionnaireCheckerTool = {
        name: 'Lead Q Status',
        domainRegex: /https:\/\/www\.pixifi\.com\/admin\/.*/,

        render(parentContainer) {
            debugLog('Render method called for Lead Q Status tool.');
            // Create container
            const toolContainer = document.createElement('div');
            toolContainer.style.display = 'flex';
            toolContainer.style.flexDirection = 'column';
            toolContainer.style.gap = '10px';
            toolContainer.style.padding = '10px';
            toolContainer.style.border = '1px solid #eee';
            toolContainer.style.borderRadius = '5px';
            toolContainer.style.backgroundColor = '#fff';

            // Create button
            const button = document.createElement('button');
            button.id = 'lead-questionnaire-checker-btn';
            button.textContent = 'Check Lead Questionnaire Status';
            Object.assign(button.style, {
                padding: '8px 12px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold'
            });
            button.addEventListener('click', processLeadsForQuestionnaires);
            toolContainer.appendChild(button);

            // Create checkbox for abandoned check toggle
            const abandonedCheckToggleDiv = document.createElement('div');
            abandonedCheckToggleDiv.style.display = 'flex';
            abandonedCheckToggleDiv.style.alignItems = 'center';
            abandonedCheckToggleDiv.style.gap = '5px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'toggle-abandoned-check';
            checkbox.checked = enableAbandonedCheck; // Set initial state
            checkbox.addEventListener('change', function() {
                enableAbandonedCheck = this.checked;
                GM_setValue('enableAbandonedCheck', enableAbandonedCheck); // Save preference
                debugLog(`Abandoned check toggled: ${enableAbandonedCheck}`);
            });

            const label = document.createElement('label');
            label.htmlFor = 'toggle-abandoned-check';
            label.textContent = 'Enable Abandoned Check';
            Object.assign(label.style, {
                fontSize: '14px',
                color: '#555'
            });

            abandonedCheckToggleDiv.appendChild(checkbox);
            abandonedCheckToggleDiv.appendChild(label);
            toolContainer.appendChild(abandonedCheckToggleDiv);


            const resultsDiv = document.createElement('div');
            resultsDiv.id = 'lead-questionnaire-results';
            resultsDiv.style.marginTop = '10px';
            resultsDiv.style.display = 'none'; // Hidden by default
            toolContainer.appendChild(resultsDiv);

            parentContainer.appendChild(toolContainer);
            debugLog('Tool UI appended to master container.');

            // Apply global styles (can be injected once or with each tool)
            GM_addStyle(`
                #lead-questionnaire-results {
                    padding: 20px;
                    border: none;
                    background-color: #f8f9fa;
                    color: #333;
                    width: calc(100% - 20px);
                    box-sizing: border-box;
                    border-radius: 8px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                #lead-questionnaire-results h4 {
                    margin: 0 0 20px 0;
                    color: #333;
                    font-size: 18px;
                    font-weight: 600;
                    border-bottom: 2px solid #dee2e6;
                    padding-bottom: 10px;
                }

                .results-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .close-results {
                    cursor: pointer;
                    color: #6c757d;
                    transition: color 0.2s;
                    font-size: 18px;
                    padding: 5px;
                }

                .close-results:hover {
                    color: #333;
                }

                .category-section {
                    margin-bottom: 25px;
                }

                .category-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding: 10px 15px;
                    background-color: #e9ecef;
                    border-radius: 6px;
                    border-left: 4px solid #007bff;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }

                .category-header:hover {
                    background-color: #dee2e6;
                }

                .category-header.collapsed {
                    margin-bottom: 0;
                }

                .category-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .category-toggle i {
                    transition: transform 0.2s;
                }

                .category-content {
                    margin-bottom: 25px;
                }

                .category-title {
                    font-size: 16px;
                    color: #495057;
                }

                .copy-dropdown {
                    position: relative;
                    display: inline-block;
                }

                .copy-dropdown-btn {
                    padding: 6px 12px;
                    background-color: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: background-color 0.2s;
                }

                .copy-dropdown-btn:hover {
                    background-color: #218838;
                }

                .copy-dropdown-menu {
                    display: none;
                    position: absolute;
                    background-color: #f9f9f9;
                    min-width: 160px;
                    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
                    z-index: 1000;
                    border-radius: 4px;
                    margin-top: 5px;
                }

                .copy-dropdown-menu div {
                    color: #333;
                    padding: 12px 16px;
                    text-decoration: none;
                    display: block;
                    cursor: pointer;
                }

                .copy-dropdown-menu div:hover {
                    background-color: #f1f1f1;
                }

                .no-results {
                    padding: 15px;
                    background-color: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 4px;
                    color: #856404;
                    font-style: italic;
                }

                .table-container {
                    background-color: #ffffff;
                    border-radius: 6px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    max-height: 400px;
                    overflow-y: auto;
                }

                .leads-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0;
                }

                .leads-table th {
                    background-color: #f1f3f4;
                    padding: 12px 15px;
                    text-align: left;
                    font-weight: 600;
                    color: #333;
                    border-bottom: 2px solid #dee2e6;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .leads-table td {
                    padding: 10px 15px;
                    border-bottom: 1px solid #f1f3f4;
                    color: #495057;
                }

                .leads-table tr:hover {
                    background-color: #f8f9fa;
                }

                .leads-table a {
                    color: #007bff;
                    text-decoration: none;
                }

                .leads-table a:hover {
                    text-decoration: underline;
                }

                .loading {
                    text-align: center;
                    padding: 40px 20px;
                    color: #6c757d;
                    font-style: italic;
                }

                .error {
                    color: #dc3545;
                    font-weight: 600;
                    padding: 15px;
                    background-color: #f8d7da;
                    border: 1px solid #f5c6cb;
                    border-radius: 4px;
                    margin: 15px 0;
                }

                .progress-container {
                    margin: 20px 0;
                }

                .progress-bar {
                    width: 100%;
                    height: 20px;
                    background-color: #e9ecef;
                    border-radius: 10px;
                    overflow: hidden;
                    margin-bottom: 10px;
                    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #007bff 0%, #0056b3 100%);
                    width: 0%;
                    transition: width 0.3s ease-in-out;
                    border-radius: 10px;
                }

                .progress-text {
                    text-align: center;
                    font-size: 14px;
                    color: #495057;
                    font-weight: 500;
                    margin-top: 5px;
                }
            `);
        }
    };

    /*************************************************************************/
    /* Attempt to register our tool with the SMPT if it exists              */
    /*************************************************************************/
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function tryRegisterLeadQCheckerTool() {
        debugLog(`Attempting to register tool with SMPT (attempt ${attempts + 1}/${MAX_ATTEMPTS})... Current unsafeWindow.SMPT: typeof=${typeof unsafeWindow.SMPT}, value=${unsafeWindow.SMPT}`);
        if (unsafeWindow.SMPT && typeof unsafeWindow.SMPT.registerTool === 'function') {
            debugLog('SMPT found, registering Lead Questionnaire Checker tool');
            unsafeWindow.SMPT.registerTool(leadQuestionnaireCheckerTool);
        } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            debugLog(`SMPT not found (attempt ${attempts}/${MAX_ATTEMPTS}), retrying in 500ms...`);
            setTimeout(tryRegisterLeadQCheckerTool, 500);
        } else {
            debugLog('Max retry attempts reached. SMPT not found. The Lead Questionnaire Checker Tool will not be registered.');
            console.warn('Sweet Me Photography Tools not found. The Lead Questionnaire Checker Tool will not be registered.');
        }
    }

    tryRegisterLeadQCheckerTool();

})();