// ==UserScript==
// @name         Pixifi Lead Email Read Status Checker
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Checks read status of emails sent to leads on the Pixifi leads page and categorizes them.
// @author       Your Name
// @match        https://www.pixifi.com/admin/leads/
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      www.pixifi.com
// ==/UserScript==

(function() {
    'use strict';

    // ---- NEW CONSTANTS AND GLOBALS ----
    const CONCURRENCY_LIMIT = 25; // limit simultaneous communication item fetches
    let lastGetLeadsBody = null; // stores the latest captured body for /getLeads/

    // Tampermonkey Storage Keys
    const STORAGE_KEY_LEADS = 'pixifi_lead_checker_unread_leads';
    const STORAGE_KEY_INDEX = 'pixifi_lead_checker_next_index';

    // Global variables to persist state across function calls and potentially across sessions
    let unreadLeadsList = [];
    let nextUnreadLeadIndex = 0;

    // Flag that tells other scripts/watchdogs we are busy and the page should not reload
    unsafeWindow.leadCheckerBusy = false;

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
                console.warn('[LeadChecker] XHR interception error:', e);
            }
            return origSend.apply(this, arguments);
        };
    })();

    // ---- FETCH ALL LEADS USING THE CAPTURED BODY ----
    function fetchAllLeadsWithCurrentFilters() {
        return new Promise((resolve, reject) => {
            if (!lastGetLeadsBody) {
                return reject('No getLeads request captured yet – change a sort/filter first.');
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

    // --- Styles for Button and Results ---
    GM_addStyle(`
        #lead-checker-btn {
            margin-left: 10px;
            display: inline-block;
            padding: 5px 10px;
            font-size: 12px;
            line-height: 1.5;
            height: auto;
            vertical-align: middle;
        }

        /* Improved results display styling */
        #lead-checker-results {
            display: none;
            margin: 15px;
            padding: 25px;
            border: none;
            background-color: #222;
            color: #333;
            white-space: pre-wrap;
            word-wrap: break-word;
            width: 100%;
            box-sizing: border-box;
            border-radius: 10px;
            background-color: #f4f8f9;
        }
        #lead-checker-results-container {
            display: none;
            margin: 10px 0;
            padding: 0;
            width: 100%;
            position: relative;
            clear: both;
            border-radius: 10px;
            background-color: transparent;
        }
        #lead-checker-results h4 {
            margin-top: 0;
            margin-bottom: 20px;
            color: #333;
            font-size: 20px;
            font-weight: bold;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        #lead-checker-results ul {
            list-style-type: none;
            padding-left: 0;
            margin: 20px 0;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
        }
        #lead-checker-results li {
            margin-bottom: 12px;
            color: #555;
            flex: 0 0 48%;
            padding: 8px;
            background-color: #fff;
            border-radius: 5px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        #lead-checker-results li strong {
            color: #000;
            font-weight: bold;
            font-size: 16px;
            display: inline-block;
            margin-left: 5px;
        }
        #lead-checker-results .loading {
            font-style: italic;
            color: #666;
            margin: 15px 0;
        }
        #lead-checker-results .error {
            color: #e74c3c;
            font-weight: bold;
            padding: 10px;
            background-color: #fde8e7;
            border-radius: 5px;
            margin-top: 15px;
        }
        #lead-checker-results .unread-emails {
            margin-top: 20px;
            max-height: 150px;
            overflow-y: auto;
            border: 1px solid #ddd;
            padding: 15px;
            background-color: #fff;
            color: #333;
            border-radius: 5px;
            line-height: 1.5;
        }
        /* Add a section for unread emails */
        .unread-emails-section {
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
        .unread-emails-title {
            color: #333;
            font-weight: bold;
            margin-bottom: 15px;
            font-size: 16px;
        }
        .unread-leads-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            background-color: #fff;
            border-radius: 5px;
            overflow: hidden;
        }

        .unread-leads-table th {
            background-color: #f5f5f5;
            padding: 12px;
            text-align: left;
            font-weight: bold;
            color: #333;
            border-bottom: 2px solid #ddd;
        }

        .unread-leads-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #eee;
            color: #555;
        }

        .unread-leads-table tr:hover {
            background-color: #f9f9f9;
        }

        .unread-leads-table-container {
            margin-top: 20px;
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 5px;
        }

        .copy-csv-btn {
            cursor: pointer;
            color: #666;
            transition: color 0.2s;
            margin-left: auto;
            padding-left: 8px;
        }

        .copy-csv-btn:hover {
            color: #333;
        }

        /* Update the phone header and copy button styling */
        .unread-leads-table th.phone-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .results-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }

        .close-results {
            cursor: pointer;
            color: #666;
            transition: color 0.2s;
            font-size: 20px;
            padding: 5px;
        }

        .close-results:hover {
            color: #333;
        }

        /* Remove the border-bottom from the h4 since it's now in results-header */
        #lead-checker-results h4 {
            margin: 0;
            border-bottom: none;
            padding-bottom: 0;
        }
    `);

    // --- Helper Functions ---

    /**
     * Fetches communication items for a specific lead.
     * @param {string} leadId - The ID of the lead.
     * @returns {Promise<string>} - Resolves with the HTML response text or rejects on error.
     */
    function fetchCommunicationItems(leadId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://www.pixifi.com/admin/fn/comm/getCommunicationItems/",
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin",
                    "x-requested-with": "XMLHttpRequest",
                    // Referrer might not be strictly necessary but included based on original fetch
                    "Referer": `https://www.pixifi.com/admin/leads/${leadId}/`
                },
                data: `clientID=12295&objectType=lead&objectID=${leadId}`,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(`Fetch failed for lead ${leadId}: ${response.status} ${response.statusText}`);
                    }
                },
                onerror: function(error) {
                    reject(`Network error for lead ${leadId}: ${error}`);
                },
                ontimeout: function() {
                    reject(`Request timed out for lead ${leadId}`);
                }
            });
        });
    }

    /**
     * Checks if any email sent to the lead's specific email address has been read.
     * @param {string} htmlResponse - The HTML response from fetchCommunicationItems.
     * @param {string} leadEmail - The email address of the lead.
     * @returns {boolean} - True if a read email to the lead was found, false otherwise.
     */
    function checkReadStatus(htmlResponse, leadEmail, leadId) { // Added leadId for logging
        if (!htmlResponse || !leadEmail) return false;

        // Remove the "SUCCESS{|}" prefix
        const htmlContent = htmlResponse.replace(/^SUCCESS\{\|\}\s*/, '');
        if (!htmlContent.trim()) {
             console.log(`Lead ${leadId} (${leadEmail}): No communication items found.`);
             return false; // No communication items
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const communicationItems = doc.querySelectorAll('.gridRow[id*="_commitem"]');
        // console.log(`Lead ${leadId} (${leadEmail}): Found ${communicationItems.length} communication items.`);

        for (const item of communicationItems) {
            // --- Find the "Sent To:" email more reliably ---
            const potentialSentToDivs = item.querySelectorAll('.floatGrid');
            let sentToEmail = null;
            for (const div of potentialSentToDivs) {
                // Check the text content directly for "Sent To:"
                if (div.textContent.includes('Sent To:')) {
                    const emailTag = div.querySelector('b');
                    if (emailTag) {
                        sentToEmail = emailTag.textContent.trim();
                        // console.log(`Lead ${leadId} (${leadEmail}): Found potential 'Sent To:' div with email: ${sentToEmail}`);
                        break; // Found the email in this item, stop checking divs within this item
                    }
                }
            }
            // --- End of finding "Sent To:" email ---

            // Now check if the found email matches the lead's email
            if (sentToEmail && sentToEmail.toLowerCase() === leadEmail.toLowerCase()) {
                 // console.log(`Lead ${leadId} (${leadEmail}): Matched email ${sentToEmail}. Checking read status...`);
                // Check if this specific communication item block contains the read indicator
                const readStatusDiv = item.querySelector('.microDetail'); // Look for the details div
                if (readStatusDiv && readStatusDiv.querySelector('.icon-envelope-letter')) { // Check for the opened icon within it
                    console.log(`Lead ${leadId} (${leadEmail}): Found READ email item.`);
                    return true; // Found a read email sent to this lead
                } else {
                     console.log(`Lead ${leadId} (${leadEmail}): Found email item, but NOT marked as read.`);
                     // Continue checking other communication items for this lead, maybe another one was read
                }
            } else if (sentToEmail) {
                 // console.log(`Lead ${leadId} (${leadEmail}): Found email item sent to ${sentToEmail}, but doesn't match lead email.`);
            }
        }

        console.log(`Lead ${leadId} (${leadEmail}): No matching READ email found in any communication items.`);
        return false; // No read email found for this lead's address after checking all items
    }

    /**
     * Extracts lead data from a row element.
     * @param {HTMLElement} rowElement - The lead row div.
     * @returns {object|null} - An object with leadId, email, and priority, or null if data is missing.
     */
    function extractLeadData(rowElement) {
        try {
            const leadIdMatch = rowElement.id.match(/row_(\d+)/);
            if (!leadIdMatch) return null;
            const leadId = leadIdMatch[1];

            // Get email from the compose email onclick attribute
            const emailLink = rowElement.querySelector('a[onclick*="composeNewObjectEmail"]');
            if (!emailLink) return null;
            const onclickAttr = emailLink.getAttribute('onclick');
            const emailMatch = onclickAttr.match(/,'([^']*@[^']*)'[^)]*\)/);
            if (!emailMatch) return null;
            const email = emailMatch[1];

            // Get name from the strong tag within the third floatGrid div
            const nameDiv = rowElement.querySelector('.floatGrid[style*="width: 185px"]');
            const nameElement = nameDiv ? nameDiv.querySelector('strong') : null;
            let firstName = '', lastName = '';

            if (nameElement) {
                const fullName = nameElement.textContent.trim();
                const nameParts = fullName.split(' ');
                firstName = nameParts[0] || '';
                // Join all remaining parts for last name
                lastName = nameParts.slice(1).join(' ') || '';
            }

            // Get phone from tel: link
            const phoneLink = rowElement.querySelector('a[href^="tel:"]');
            let phone = '';
            if (phoneLink) {
                // Extract numbers only and format
                const rawPhone = phoneLink.getAttribute('href')
                    .replace(/[^0-9]/g, ''); // Remove all non-numeric characters

                // Format with spaces after 3rd and 6th characters
                if (rawPhone.length >= 10) {
                    phone = rawPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
                } else {
                    phone = rawPhone; // Fallback if phone number is incomplete
                }
            }

            // Check priority based on the circle icon's class
            const priorityIcon = rowElement.querySelector('i.fa.fa-circle[title]');
            let priority = 'advanced';
            if (priorityIcon && priorityIcon.classList.contains('font-red-flamingo')) {
                priority = 'baby_here';
            }

            return { leadId, email, firstName, lastName, phone, priority };
        } catch (error) {
            console.error("Error extracting data from row:", error);
            return null;
        }
    }

    // Add this function outside of runLeadCheck (near the other helper functions)
    function copyTableAsCSV() {
        // Get all the rows
        const rows = document.querySelectorAll('.unread-leads-table tbody tr');
        let csvContent = 'First Name,Last Name,Email,Phone\n';

        // Convert table data to CSV
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const rowData = Array.from(cells).map(cell => {
                // Escape quotes and wrap in quotes to handle commas in data
                return '"' + cell.textContent.replace(/"/g, '""') + '"';
            });
            csvContent += rowData.join(',') + '\n';
        });

        // Copy to clipboard
        navigator.clipboard.writeText(csvContent)
            .then(() => {
                alert('CSV copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy CSV:', err);
                alert('Failed to copy CSV. Please check console for details.');
            });
    }

    // --- Main Execution ---

    // Declare these variables in the scope of runLeadCheck so they persist between clicks
    // let unreadLeadsList = [];
    // let nextUnreadLeadIndex = 0;

    /**
     * Renders the lead check results in the UI.
     * @param {object} stats - Statistics object for read/unread leads.
     * @param {Array} unreadLeads - Array of unread lead data.
     * @param {number} currentNextIndex - The index of the next lead to open.
     */
    function renderResults(stats, unreadLeads, currentNextIndex) {
        const resultsDiv = document.getElementById('lead-checker-results');
        if (!resultsDiv) return;

        let output = `
            <div class="results-header">
                <h4>Lead Email Status Results</h4>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button id="copyReportBtn" class="btn btn-default btn-sm" type="button" style="padding: 4px 8px;">
                        <i class="fa fa-file-text-o"></i> Copy Report
                    </button>
                    <i class="fa fa-times close-results" title="Close Results"></i>
                </div>
            </div>`;

        // Stats in a grid layout
        output += `<ul>`;
        output += `<li>Baby Here - Read: <strong>${stats.baby_here_read}</strong></li>`;
        output += `<li>Baby Here - Unread: <strong>${stats.baby_here_unread}</strong></li>`;
        output += `<li>Advanced Baby - Read: <strong>${stats.advanced_read}</strong></li>`;
        output += `<li>Advanced Baby - Unread: <strong>${stats.advanced_unread}</strong></li>`;
        output += `</ul>`;

        // Unread emails section (table and open button)
        output += renderUnreadLeadsSection(unreadLeads, currentNextIndex);

        // Error message
        if (stats.errorCount > 0) {
            output += `<p class="error">Encountered errors processing ${stats.errorCount} leads. Check the console (F12) for details.</p>`;
        }

        resultsDiv.innerHTML = output;

        // Attach event listeners after rendering
        attachResultEventListeners(stats);
    }

    /**
     * Renders the unread leads table and the "Open Next" button.
     * @param {Array} unreadLeads - Array of unread lead data.
     * @param {number} currentNextIndex - The index of the next lead to open.
     * @returns {string} HTML string for the unread leads section.
     */
    function renderUnreadLeadsSection(unreadLeads, currentNextIndex) {
        let sectionOutput = `<div class="unread-emails-section">`;
        if (unreadLeads.length > 0) {
            sectionOutput += `<div class="unread-emails-title">Unread Lead Emails (${unreadLeads.length})</div>`;
            sectionOutput += `<div class="unread-leads-table-container">`;
            sectionOutput += `<table class="unread-leads-table">`;
            sectionOutput += `<thead>
                <tr>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Email</th>
                    <th class="phone-header">Phone <i class="fa fa-file-text-o copy-csv-btn" title="Copy as CSV"></i></th>
                </tr>
            </thead><tbody>`; // Add tbody here

            unreadLeads.forEach(lead => {
                sectionOutput += `<tr>
                    <td><a href="/admin/leads/${lead.leadId}/#communicationTab" target="_blank">${lead.firstName || ''}</a></td>
                    <td>${lead.lastName || ''}</td>
                    <td><a href="/admin/leads/${lead.leadId}/#communicationTab" target="_blank">${lead.email || ''}</a></td>
                    <td>${lead.phone || ''}</td>
                </tr>`;
            });

            sectionOutput += `</tbody></table></div>`;

            // Add "Open Next 10" button below the table
            const remainingCount = unreadLeads.length - currentNextIndex;
            const numberToOpen = Math.min(10, remainingCount);
            const buttonText = remainingCount > 0
                ? `<span class="icon-envelope-letter"></span> Open Next ${numberToOpen} Outstanding Leads (${remainingCount} total)`
                : 'All Leads Opened';
            const isDisabled = remainingCount === 0;

            sectionOutput += `
                <div style="margin-top: 15px; text-align: center;">
                    <button id="openNextLeadsBtn" class="btn blue btn-sm" type="button" style="padding: 8px 16px;" ${isDisabled ? 'disabled' : ''}>
                        ${buttonText}
                    </button>
                </div>
            `;
        } else {
            sectionOutput += `<div class="unread-emails-title">No unread lead emails found.</div>`;
        }
        sectionOutput += `</div>`;
        return sectionOutput;
    }

    /**
     * Attaches event listeners to the results display elements.
     * @param {object} stats - Statistics object needed for copy report button.
     */
    function attachResultEventListeners(stats) {
        // Add event listener for the copy report button
        const copyReportBtn = document.getElementById('copyReportBtn');
        if (copyReportBtn) {
            copyReportBtn.addEventListener('click', () => {
                // Get the date range
                const startDate = document.getElementById('firstContactStart')?.value || 'N/A';
                const endDate = document.getElementById('firstContactEnd')?.value || 'N/A';

                // Calculate total leads and percentages
                const totalLeads = stats.baby_here_read + stats.baby_here_unread + stats.advanced_read + stats.advanced_unread;
                const babyHereReadPercent = ((stats.baby_here_read / totalLeads) * 100).toFixed(2);
                const babyHereUnreadPercent = ((stats.baby_here_unread / totalLeads) * 100).toFixed(2);
                const advancedReadPercent = ((stats.advanced_read / totalLeads) * 100).toFixed(2);
                const advancedUnreadPercent = ((stats.advanced_unread / totalLeads) * 100).toFixed(2);

                // Generate the report text
                const reportText = `=== Lead Email Status Report ===\nStart Date: ${startDate}\nEnd Date: ${endDate}\nTotal Leads: ${totalLeads}\nBaby Here - Read: ${stats.baby_here_read} (${babyHereReadPercent}%)\nBaby Here - Unread: ${stats.baby_here_unread} (${babyHereUnreadPercent}%)\nAdvanced - Read: ${stats.advanced_read} (${advancedReadPercent}%)\nAdvanced - Unread: ${stats.advanced_unread} (%)`;

                // Copy to clipboard
                navigator.clipboard.writeText(reportText)
                    .then(() => {
                        alert('Report copied to clipboard!');
                    })
                    .catch(err => {
                        console.error('Failed to copy report:', err);
                        alert('Failed to copy report. Please check console for details.');
                    });
            });
        }

        // Add event listener for the "Open Next" button
        const openNextBtn = document.getElementById('openNextLeadsBtn');
        if (openNextBtn) {
            openNextBtn.addEventListener('click', () => {
                const totalUnread = unreadLeadsList.length;
                if (nextUnreadLeadIndex >= totalUnread) {
                    return; // Should already be disabled, but double-check
                }

                const endIndex = Math.min(nextUnreadLeadIndex + 10, totalUnread);
                console.log(`Opening leads from index ${nextUnreadLeadIndex} to ${endIndex - 1}`);

                for (let i = nextUnreadLeadIndex; i < endIndex; i++) {
                    const lead = unreadLeadsList[i];
                    console.log(`Attempting to open tab for lead ID: ${lead.leadId}`); // Added troubleshooting log
                    const newWindow = window.open(`/admin/leads/${lead.leadId}/#communicationTab`, '_blank');

                    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                        console.warn(`[LeadChecker] Pop-up blocked for lead ID: ${lead.leadId}. Please ensure pop-ups are allowed for www.pixifi.com.`);
                    }
                }

                nextUnreadLeadIndex = endIndex; // Update the index for the next click
                GM_setValue(STORAGE_KEY_INDEX, nextUnreadLeadIndex); // Save updated index

                // Update button text and state
                const remainingCount = totalUnread - nextUnreadLeadIndex;
                const numberToOpen = Math.min(10, remainingCount);

                if (remainingCount > 0) {
                    openNextBtn.innerHTML = `<span class="icon-envelope-letter"></span> Open Next ${numberToOpen} Outstanding Leads (${remainingCount} total)`;
                } else {
                    openNextBtn.innerHTML = 'All Leads Opened';
                    openNextBtn.disabled = true;
                }
            });
        }

        // Add event listener to the copy button after the table is created
        const copyBtn = document.querySelector('#lead-checker-results .copy-csv-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', copyTableAsCSV);
        }

        // Add close button functionality
        const closeBtn = document.querySelector('#lead-checker-results .close-results');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                const container = document.getElementById('lead-checker-results-container');
                const resultsDiv = document.getElementById('lead-checker-results');
                if (container) container.style.display = 'none';
                if (resultsDiv) resultsDiv.style.display = 'none';
                GM_deleteValue(STORAGE_KEY_LEADS); // Clear saved leads
                GM_deleteValue(STORAGE_KEY_INDEX); // Clear saved index
                unreadLeadsList = []; // Clear in-memory state as well
                nextUnreadLeadIndex = 0;
            });
        }
    }

    function runLeadCheck() {
        // Reset state variables each time the check runs
        unreadLeadsList = []; // Clear in-memory list
        nextUnreadLeadIndex = 0; // Reset in-memory index
        GM_deleteValue(STORAGE_KEY_LEADS); // Clear saved leads from previous session
        GM_deleteValue(STORAGE_KEY_INDEX); // Clear saved index from previous session

        unsafeWindow.leadCheckerBusy = true;

        // Show the container and results div
        const container = document.getElementById('lead-checker-results-container');
        const resultsDiv = document.getElementById('lead-checker-results');

        if (container) container.style.display = 'block';
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<h4>Processing Leads...</h4><div class="loading">Fetching data for all leads. This may take a moment...</div>';
        }

        document.getElementById('lead-checker-btn').disabled = true;

        // ---- NEW: retrieve leads via API instead of DOM ----
        fetchAllLeadsWithCurrentFilters()
            .then(rawHTML => {
                const allLeads = parseLeadRows(rawHTML);
                console.log(`[LeadChecker] Retrieved ${allLeads.length} leads from API.`);

                const results = [];
                // Process in controlled concurrency batches
                const processBatch = (index) => {
                    if (index >= allLeads.length) {
                        return Promise.resolve();
                    }
                    const slice = allLeads.slice(index, index + CONCURRENCY_LIMIT);
                    const tasks = slice.map(leadData => {
                        return fetchCommunicationItems(leadData.leadId)
                            .then(htmlResponse => {
                                const hasRead = checkReadStatus(htmlResponse, leadData.email, leadData.leadId);
                                results.push({ ...leadData, hasRead, error: null });
                            })
                            .catch(error => {
                                console.error(`Error processing lead ${leadData.leadId}:`, error);
                                results.push({ ...leadData, hasRead: false, error: String(error) });
                            });
                    });
                    return Promise.all(tasks).then(() => {
                        // Yield to event loop allowing GC
                        return new Promise(res => setTimeout(res, 0)).then(() => processBatch(index + CONCURRENCY_LIMIT));
                    });
                };

                return processBatch(0).then(() => results);
            })
            .then(results => {
                console.log("All fetches completed. Processing results:", results);
                const stats = {
                    baby_here_read: 0,
                    baby_here_unread: 0,
                    advanced_read: 0,
                    advanced_unread: 0,
                    errorCount: 0,
                };
                const unreadLeads = [];

                results.forEach(result => {
                    if (result.error) {
                        stats.errorCount++;
                        return;
                    }

                    if (result.priority === 'baby_here') {
                        if (result.hasRead) {
                            stats.baby_here_read++;
                        } else {
                            stats.baby_here_unread++;
                            unreadLeads.push(result);
                        }
                    } else { // advanced
                        if (result.hasRead) {
                            stats.advanced_read++;
                        } else {
                            stats.advanced_unread++;
                            unreadLeads.push(result);
                        }
                    }
                });

                // Store unread leads globally and save to Tampermonkey storage
                unreadLeadsList = [...unreadLeads]; // Create a copy
                nextUnreadLeadIndex = 0; // Always reset to 0 for a new scan
                GM_setValue(STORAGE_KEY_LEADS, JSON.stringify(unreadLeadsList));
                GM_setValue(STORAGE_KEY_INDEX, nextUnreadLeadIndex);

                // Display Results using the new render function
                renderResults(stats, unreadLeadsList, nextUnreadLeadIndex);

            })
            .catch(overallError => {
                 console.error("An unexpected error occurred during processing:", overallError);
                 const resultsDiv = document.getElementById('lead-checker-results');
                 if (resultsDiv) {
                     resultsDiv.innerHTML = `<h4 class="error">An unexpected error occurred</h4><p>${overallError}</p><p>Check the console (F12) for more details.</p>`;
                 }
            })
            .finally(() => {
                document.getElementById('lead-checker-btn').disabled = false;
                unsafeWindow.leadCheckerBusy = false;
            });
    }

    // --- Inject Button and Results Area ---
    async function init() { // Made init async
        // Try to load saved state first
        try {
            const savedLeadsJson = await GM_getValue(STORAGE_KEY_LEADS, '[]');
            const savedIndex = await GM_getValue(STORAGE_KEY_INDEX, 0);

            const loadedLeads = JSON.parse(savedLeadsJson);

            if (loadedLeads.length > 0 && savedIndex < loadedLeads.length) {
                unreadLeadsList = loadedLeads;
                nextUnreadLeadIndex = savedIndex;

                // Reconstruct stats for display (approximate if full scan not done)
                const stats = {
                    baby_here_read: 0,
                    baby_here_unread: 0,
                    advanced_read: 0,
                    advanced_unread: 0,
                    errorCount: 0,
                };

                loadedLeads.forEach(lead => {
                    if (lead.priority === 'baby_here') {
                        stats.baby_here_unread++; // Assume unread if loaded from list
                    } else {
                        stats.advanced_unread++;
                    }
                });

                console.log(`[LeadChecker] Loaded ${loadedLeads.length} unread leads from previous session. Next to open: ${nextUnreadLeadIndex}`);

                // Show container and render results based on loaded data
                const container = document.getElementById('lead-checker-results-container');
                const resultsDiv = document.getElementById('lead-checker-results');
                if (container) container.style.display = 'block';
                if (resultsDiv) {
                    resultsDiv.style.display = 'block';
                    renderResults(stats, unreadLeadsList, nextUnreadLeadIndex);
                }
            } else {
                console.log("[LeadChecker] No previous unread leads found or all were opened.");
                // Optionally clear values if they somehow got into a bad state
                GM_deleteValue(STORAGE_KEY_LEADS);
                GM_deleteValue(STORAGE_KEY_INDEX);
            }
        } catch (e) {
            console.error("[LeadChecker] Error loading saved state:", e);
            // Clear potentially corrupted saved data
            GM_deleteValue(STORAGE_KEY_LEADS);
            GM_deleteValue(STORAGE_KEY_INDEX);
        }

        // Try to find the rightTitle div containing the Batch Update button
        const batchUpdateBtn = document.querySelector('a#batchUpdateBtn.btn.blue.btn-sm');

        if (batchUpdateBtn && batchUpdateBtn.parentNode) {
            // Found the container with the Batch Update button
            const targetArea = batchUpdateBtn.parentNode; // This should be the div.rightTitle

            // Create the button with styling to match the other buttons
            const button = document.createElement('a'); // Using <a> to match the existing button style
            button.id = 'lead-checker-btn';
            button.href = 'javascript:void(0);';
            button.className = 'btn blue btn-sm'; // Match "Batch Update Leads" button class
            button.innerHTML = '<span class="icon-envelope-letter"></span> Check Lead Email Status'; // Add an icon like other buttons
            button.addEventListener('click', runLeadCheck);

            // Insert button into the rightTitle div, after the Batch Update button
            targetArea.appendChild(button);
            console.log("Button placed in rightTitle next to Batch Update button");
        } else {
            // Fallback - look for the leftTitle div
            const leftTitleDiv = document.querySelector('.leftTitle:not(:empty)');

            if (leftTitleDiv) {
                // Create the button with styling to match the other buttons in leftTitle
                const button = document.createElement('a'); // Using <a> to match the existing button style
                button.id = 'lead-checker-btn';
                button.href = 'javascript:void(0);';
                button.className = 'btn btn-default btn-sm'; // Match filter options button class
                button.innerHTML = '<span class="fa fa-envelope"></span> Check Lead Email Status';
                button.style.marginLeft = '10px';
                button.addEventListener('click', runLeadCheck);

                // Insert button into the leftTitle div
                leftTitleDiv.appendChild(button);

                console.log("Button placed in leftTitle div");
            } else {
                // Last resort - create a floating button
                console.error("Could not find rightTitle or leftTitle to insert button.");

                const floatingButton = document.createElement('div');
                floatingButton.style.position = 'fixed';
                floatingButton.style.top = '80px';
                floatingButton.style.right = '20px';
                floatingButton.style.zIndex = '9999';
                document.body.appendChild(floatingButton);

                const button = document.createElement('a');
                button.id = 'lead-checker-btn';
                button.href = 'javascript:void(0);';
                button.className = 'btn blue btn-sm';
                button.innerHTML = '<span class="icon-envelope"></span> Check Lead Email Status';
                button.addEventListener('click', runLeadCheck);

                floatingButton.appendChild(button);

                console.log("Created floating button as fallback");
            }
        }

        // Create a container for the results div first
        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'lead-checker-results-container';
        resultsContainer.style.display = 'none';

        // Create the results div inside the container
        const resultsDiv = document.createElement('div');
        resultsDiv.id = 'lead-checker-results';

        // Add the results div to its container
        resultsContainer.appendChild(resultsDiv);

        // Find the best place to insert the container
        const headerDiv = document.querySelector('#header.tableHeaderDIV');
        if (headerDiv && headerDiv.parentNode) {
            // Insert the container before the header div
            headerDiv.parentNode.insertBefore(resultsContainer, headerDiv);
            console.log("Results container placed before table header");
        } else {
            // Fallback - try to find another good insertion point
            const tabContent = document.querySelector('.tab-content');
            if (tabContent) {
                // Insert after any existing elements in the tab content area but before the listing
                const errorLeads = document.getElementById('errorLeads');
                if (errorLeads && errorLeads.parentNode) {
                    errorLeads.parentNode.insertBefore(resultsContainer, errorLeads.nextSibling);
                    console.log("Results container placed after errorLeads");
                } else {
                    tabContent.appendChild(resultsContainer);
                    console.log("Results container appended to tab-content");
                }
            } else {
                // Last resort - append to body
                document.body.appendChild(resultsContainer);
                console.log("Results container appended to body (fallback)");
            }
        }

        console.log("Lead Checker script initialized.");
    }

    // Wait for the page to be fully loaded before initializing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();