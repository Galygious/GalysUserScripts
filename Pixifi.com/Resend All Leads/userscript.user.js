// ==UserScript==
// @name         Pixifi Lead Email Sender
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Sends templated emails to leads based on their due date and location.
// @author       Your Name
// @match        https://www.pixifi.com/admin/leads/
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      www.pixifi.com
// ==/UserScript==

(function() {
    'use strict';

    // ---- CONFIGURATION ----
    const TEMPLATES = {
        'SCHEDULE': 308509,
        'SESSIONS': 308508,
        'BOOKING': 308507,
        'RESERVE': 299242,
        'N/A': 243952, // Default to unpersonalized follow-up if brand not found for template
    };
    const BRAND_IDS = {
        'BOOKING': '11473',
        'SCHEDULE': '18826',
        'RESERVE': '19647',
        'SESSIONS': '15793',
        'N/A': '11634', // Default to Support if brand not found
    };
    const CONCURRENCY_LIMIT = 5; // Limit simultaneous email sends

    // ---- GLOBALS ----
    let lastGetLeadsBody = null; // Stores the latest captured body for /getLeads/
    unsafeWindow.leadSenderBusy = false; // Flag to prevent page reloads during operation

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
                    lastGetLeadsBody = body;
                }
            } catch (e) {
                console.warn('[LeadSender] XHR interception error:', e);
            }
            return origSend.apply(this, arguments);
        };
    })();

    // ---- STYLES ----
    GM_addStyle(`
        #email-sender-btn {
            margin-left: 10px;
        }
        #email-sender-controls {
            display: none;
            margin: 15px;
            padding: 20px;
            background-color: #f4f8f9;
            border: 1px solid #ddd;
            border-radius: 10px;
            width: 100%;
            box-sizing: border-box;
        }
        #email-sender-controls .control-group {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        #email-sender-controls label {
            margin: 0 10px;
            font-weight: normal;
        }
        #email-sender-results {
            margin-top: 15px;
            padding: 15px;
            background-color: #fff;
            border: 1px solid #ccc;
            border-radius: 5px;
            max-height: 400px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    `);

    // ---- API/HELPER FUNCTIONS ----

    function fetchAllLeadsWithCurrentFilters() {
        return new Promise((resolve, reject) => {
            if (!lastGetLeadsBody) {
                return reject('No lead filter request captured. Please apply a filter first.');
            }
            const body = lastGetLeadsBody
                .replace(/(^|&)page=\d+/i, '$1page=1')
                .replace(/(^|&)numPerPage=\d+/i, '$1numPerPage=999999999');
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/fn/leads/getLeads/',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                data: body,
                onload: r => (r.status === 200 ? resolve(r.responseText) : reject('HTTP ' + r.status)),
                onerror: reject
            });
        });
    }

    function parseLeadRows(html) {
        const clean = html.replace(/^SUCCESS\{\|\}\s*/, '');
        const doc = new DOMParser().parseFromString(clean, 'text/html');
        const rows = doc.querySelectorAll('.gridRow[id^="row_"]');
        return Array.from(rows).map(extractLeadData).filter(Boolean);
    }

    function extractLeadData(rowElement) {
        try {
            const leadIdMatch = rowElement.id.match(/row_(\d+)/);
            if (!leadIdMatch) return null;

            const emailLink = rowElement.querySelector('a[onclick*="composeNewObjectEmail"]');
            if (!emailLink) return null;
            const onclickAttr = emailLink.getAttribute('onclick');
            const emailMatch = onclickAttr.match(/,'([^']*@[^']*)'[^)]*\)/);

            const nameDiv = rowElement.querySelector('.floatGrid[style*="width: 185px"]');
            const nameElement = nameDiv ? nameDiv.querySelector('strong') : null;

            // Determine if baby is here based on the red circle icon
            const priorityIcon = rowElement.querySelector('i.fa.fa-circle[title]');
            const isBabyHere = priorityIcon && priorityIcon.classList.contains('font-red-flamingo');

            // Extract brand
            const brandSpan = rowElement.querySelector('.floatGrid[style*="width: 185px"] .smallText');
            const brand = brandSpan ? brandSpan.textContent.trim().toUpperCase() : 'N/A';

            return {
                leadId: leadIdMatch[1],
                email: emailMatch ? emailMatch[1] : 'N/A',
                name: nameElement ? nameElement.textContent.trim() : 'N/A',
                isBabyHere: isBabyHere,
                brand: brand // Add brand to the returned lead data
            };
        } catch (error) {
            console.error("Error extracting data from row:", rowElement, error);
            return null;
        }
    }

    function fetchTemplateContent(templateId, leadId) {
        return new Promise((resolve, reject) => {
            const body = new URLSearchParams({
                clientID: '12295',
                emailTemplateID: templateId,
                objectType: 'lead',
                objectID: leadId,
            });

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/data/applyEmailTemplateToObject/',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                data: body.toString(),
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const rawText = response.responseText;
                            // Handle the SUCCESS{|} prefix more robustly
                            const marker = 'SUCCESS{|}';
                            const jsonText = rawText.substring(rawText.indexOf(marker) + marker.length);
                            const data = JSON.parse(jsonText);

                            if (data && data.subject && data.message) {
                                resolve({ subject: data.subject, message: data.message });
                            } else {
                                reject(`Template ${templateId} is empty or has an unexpected format.`);
                            }
                        } catch (e) {
                            reject(`Failed to parse template ${templateId}: ${e}. Response was: ${response.responseText}`);
                        }
                    } else {
                        reject(`Failed to fetch template ${templateId}: HTTP ${response.status}`);
                    }
                },
                onerror: error => reject(`Network error fetching template ${templateId}: ${error}`),
            });
        });
    }

    function sendEmail(lead, template) {
        return new Promise((resolve, reject) => {
            const body = new URLSearchParams({
                emailin_lead: 'ld.7c08cd0939a770f3@contactmystudio.com', // From EmailSendFetch.txt
                brandID: BRAND_IDS[lead.brand] || BRAND_IDS['N/A'], // Use dynamic brand ID or default
                recipientObj_lead: lead.email,
                responses: template.id,
                subject_lead: template.subject,
                message_lead: template.message,
                clientID: '12295', // From EmailSendFetch.txt
                objectType: 'lead',
                objectID: lead.leadId,
            });

            console.log(`Preparing to send email to ${lead.name} (${lead.email}) with template ${template.id}`);

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/fn/email/sendNewObjectEmail/',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                data: body.toString(),
                onload: response => {
                    if (response.status >= 200 && response.status < 300 && response.responseText.includes('SUCCESS')) {
                        resolve(`SUCCESS: Email sent to ${lead.name} (${lead.email})`);
                    } else {
                        reject(`FAILED to send to ${lead.name}: ${response.statusText} - ${response.responseText}`);
                    }
                },
                onerror: error => reject(`FAILED to send to ${lead.name}: Network Error - ${error}`),
            });
        });
    }


    // ---- MAIN EXECUTION ----
    async function runEmailSender() {
        const isDryRun = document.getElementById('sender-dry-run').checked;
        const executeBtn = document.getElementById('sender-execute-btn');
        const resultsDiv = document.getElementById('email-sender-results');

        executeBtn.disabled = true;
        unsafeWindow.leadSenderBusy = true;
        resultsDiv.innerHTML = `Starting... (Dry Run: ${isDryRun})\n`;

        try {
            resultsDiv.innerHTML += 'Fetching all leads with current filters...\n';
            const rawHTML = await fetchAllLeadsWithCurrentFilters();
            const allLeads = parseLeadRows(rawHTML);
            resultsDiv.innerHTML += `Found ${allLeads.length} leads to process.\n\n`;

            if (allLeads.length === 0) {
                return;
            }

            let summary = {
                sent: 0,
                skipped: 0,
                failed: 0,
                sentByBrand: {} // Initialize object to store counts per brand
            };

            // Process in controlled concurrency batches
            for (let i = 0; i < allLeads.length; i += CONCURRENCY_LIMIT) {
                const batch = allLeads.slice(i, i + CONCURRENCY_LIMIT);
                resultsDiv.innerHTML += `--- Processing batch ${i / CONCURRENCY_LIMIT + 1} ---\n`;

                const tasks = batch.map(async lead => {
                    try {
                        // Determine template based on brand
                        const templateId = TEMPLATES[lead.brand] || TEMPLATES['N/A'];

                        if (!lead.email || lead.email === 'N/A') {
                            resultsDiv.innerHTML += `[SKIP] Lead ${lead.name} (${lead.leadId}) has no email address.\n`;
                            summary.skipped++;
                            return;
                        }

                        if (isDryRun) {
                            resultsDiv.innerHTML += `[DRY RUN] Would send email to ${lead.name} (${lead.email}) [Brand: ${lead.brand}] using template ${templateId}.\n`;
                            summary.sent++;
                            summary.sentByBrand[lead.brand] = (summary.sentByBrand[lead.brand] || 0) + 1; // Tally by brand
                            return;
                        }

                        // Fetch the template content first
                        const template = await fetchTemplateContent(templateId, lead.leadId);
                        template.id = templateId; // Add id for sending

                        // Now send the email with the fetched content
                        const result = await sendEmail(lead, template);
                        resultsDiv.innerHTML += `[SUCCESS] ${result} [Brand: ${lead.brand}]\n`;
                        summary.sent++;
                        summary.sentByBrand[lead.brand] = (summary.sentByBrand[lead.brand] || 0) + 1; // Tally by brand

                    } catch (error) {
                        resultsDiv.innerHTML += `[ERROR] For lead ${lead.name}: ${error}\n`;
                        summary.failed++;
                    }
                });

                await Promise.all(tasks);
                // Yield to event loop to allow UI to update
                await new Promise(res => setTimeout(res, 100));
            }

            resultsDiv.innerHTML += `\n--- PROCESSING COMPLETE ---\n`;
            resultsDiv.innerHTML += `Total Processed: ${allLeads.length}\n`;
            resultsDiv.innerHTML += `Sent/Dry Run: ${summary.sent}\n`;
            resultsDiv.innerHTML += `Skipped (no email): ${summary.skipped}\n`;
            resultsDiv.innerHTML += `Failed: ${summary.failed}\n`;
            resultsDiv.innerHTML += `\nTotals by Brand:\n`;
            for (const brand in summary.sentByBrand) {
                resultsDiv.innerHTML += `  ${brand}: ${summary.sentByBrand[brand]}\n`;
            }

        } catch (error) {
            console.error('[LeadSender] A critical error occurred:', error);
            resultsDiv.innerHTML += `\n[CRITICAL ERROR] ${error}. Check console (F12) for details.`;
        } finally {
            executeBtn.disabled = false;
            unsafeWindow.leadSenderBusy = false;
        }
    }

    // ---- UI INITIALIZATION ----
    function init() {
        const batchUpdateBtn = document.querySelector('a#batchUpdateBtn.btn.blue.btn-sm');
        if (!batchUpdateBtn || !batchUpdateBtn.parentNode) {
            console.error("[LeadSender] Could not find a place to insert the button.");
            return;
        }

        const targetArea = batchUpdateBtn.parentNode;

        // Create the main button
        const button = document.createElement('a');
        button.id = 'email-sender-btn';
        button.href = 'javascript:void(0);';
        button.className = 'btn green btn-sm';
        button.innerHTML = '<span class="fa fa-paper-plane"></span> Send Follow-up Emails';
        targetArea.appendChild(button);

        // Create the controls panel
        const controlsPanel = document.createElement('div');
        controlsPanel.id = 'email-sender-controls';
        controlsPanel.innerHTML = `
            <div class="control-group">
                <input type="checkbox" id="sender-dry-run" checked>
                <label for="sender-dry-run"><strong>Dry Run</strong> (Log actions without sending emails)</label>
            </div>
            <button id="sender-execute-btn" class="btn blue btn-sm" type="button">Start Sending</button>
            <div id="email-sender-results">Results will appear here...</div>
        `;

        // Insert controls panel before the leads table
        const headerDiv = document.querySelector('#header.tableHeaderDIV');
        if (headerDiv && headerDiv.parentNode) {
            headerDiv.parentNode.insertBefore(controlsPanel, headerDiv);
        } else {
            document.body.appendChild(controlsPanel); // fallback
        }

        // --- Event Listeners ---
        button.addEventListener('click', () => {
            controlsPanel.style.display = controlsPanel.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('sender-execute-btn').addEventListener('click', runEmailSender);

        console.log("Lead Email Sender script initialized.");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(); 