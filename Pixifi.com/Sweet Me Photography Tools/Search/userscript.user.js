// ==UserScript==
// @name         SMPT - Search
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  A standalone script that registers a Lead/Client search tool with the Sweet Me Photography Tools window, displaying Clients, Archived Clients, Leads, and Archived Leads in order.
// @match        https://www.pixifi.com/admin/*
// @license      GPL
// @grant        none
// @downloadURL  https://update.greasyfork.org/scripts/523685/SMPT%20-%20Search.user.js
// @updateURL    https://update.greasyfork.org/scripts/523685/SMPT%20-%20Search.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // Store the original leads filter data to restore after search
    let originalLeadsBody = null;

    // ---- Debug function to log messages to console with prefix ----
    function debugLog(message) {
        console.log(`[SMPTSearch] ${message}`);
    }

    // ---- INTERCEPT XMLHttpRequest TO CAPTURE LEADS FILTER DATA ----
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
                    originalLeadsBody = body; // capture the most recent body containing current filters
                    debugLog('Captured original leads filter data');
                }
            } catch (e) {
                debugLog(`XHR interception error: ${e}`);
            }
            return origSend.apply(this, arguments);
        };
    })();

    // ---- FUNCTION TO TRIGGER REFRESH AND CAPTURE FILTERS ----
    async function captureCurrentFilters() {
        debugLog('Capturing current leads filters...');
        
        // Try to find refreshLeads function and call it to capture current filters
        let refreshFunction = null;
        if (typeof window.refreshLeads === 'function') {
            refreshFunction = window.refreshLeads;
            debugLog('Found refreshLeads() on window object');
        } else if (typeof refreshLeads === 'function') {
            refreshFunction = refreshLeads;
            debugLog('Found refreshLeads() in global scope');
        }
        
        if (refreshFunction) {
            debugLog('Calling refreshLeads() to capture current filter data...');
            try {
                refreshFunction();
                // Wait a moment for the request to be captured
                await new Promise(resolve => setTimeout(resolve, 500));
                debugLog('Successfully captured current filter data');
                return true;
            } catch (error) {
                debugLog(`Error calling refreshLeads(): ${error}`);
                return false;
            }
        } else {
            debugLog('refreshLeads() function not found, skipping filter capture');
            return false;
        }
    }

    // ---- FUNCTION TO RESTORE ORIGINAL FILTERS ----
    async function restoreOriginalFilters() {
        if (!originalLeadsBody) {
            debugLog('No original leads filter data to restore');
            return;
        }

        debugLog('Restoring original leads filters...');
        
        try {
            const response = await fetch("https://www.pixifi.com/admin/fn/leads/getLeads/", {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-requested-with': 'XMLHttpRequest'
                },
                body: originalLeadsBody,
                credentials: 'include'
            });

            if (response.ok) {
                const html = await response.text();
                // Update the leads table with the original filter results
                if (html.includes('SUCCESS{|}')) {
                    const cleanHtml = html.split('SUCCESS{|}')[1];
                    const leadsTable = document.querySelector('#leadListingGrid');
                    if (leadsTable) {
                        leadsTable.innerHTML = cleanHtml;
                        debugLog('Successfully restored original leads view');
                    }
                }
            } else {
                debugLog(`Failed to restore original view: HTTP ${response.status}`);
            }
        } catch (error) {
            debugLog(`Error restoring original filters: ${error}`);
        }
    }

    /**
     * Define the search tool.
     */
    const mySearchTool = {
        name: 'Search Tool',
        // Match any page under pixifi.com
        domainRegex: /https:\/\/www\.pixifi\.com/,

        render(parentContainer) {
            const searchQueryInput = document.createElement('input');
            Object.assign(searchQueryInput.style, {
                width: '200px',
                marginBottom: '5px',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                display: 'block'
            });
            searchQueryInput.type = 'text';
            searchQueryInput.placeholder = 'Search Query';

            // Create a container for the button and spinner
            const buttonContainer = document.createElement('div');
            buttonContainer.style.position = 'relative';
            buttonContainer.style.display = 'inline-block';
            buttonContainer.style.width = '100%';

            const searchButton = document.createElement('button');
            Object.assign(searchButton.style, {
                display: 'block',
                width: '100%',
                padding: '5px 10px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold',
                textAlign: 'center'
            });
            searchButton.textContent = 'Search';

            // Create the loading spinner (hidden initially)
            const spinner = document.createElement('div');
            spinner.id = 'smptSearchSpinner';
            spinner.innerHTML = `
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .spinner {
                        border: 2px solid rgba(255,255,255,0.3);
                        border-radius: 50%;
                        border-top: 2px solid white;
                        width: 12px;
                        height: 12px;
                        animation: spin 1s linear infinite;
                        display: inline-block;
                        vertical-align: middle;
                        margin-right: 5px;
                    }
                </style>
                <div class="spinner"></div> Searching...
            `;
            Object.assign(spinner.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#007bff',
                color: 'white',
                borderRadius: '3px',
                fontSize: '12px'
            });

            // Status text area to show results summary
            const statusText = document.createElement('div');
            statusText.id = 'smptSearchStatus';
            Object.assign(statusText.style, {
                marginTop: '5px',
                fontSize: '12px',
                color: '#666',
                display: 'none'
            });

            searchButton.addEventListener('click', async () => {
                const searchQuery = searchQueryInput.value.trim();
                if (searchQuery) {
                    // Show spinner, hide button text
                    spinner.style.display = 'flex';
                    statusText.style.display = 'none';
                    searchButton.disabled = true;

                    try {
                        // Step 1: Capture current filters (only on leads page)
                        const isLeadsPage = window.location.pathname.includes('/admin/leads/');
                        if (isLeadsPage) {
                            debugLog('On leads page - capturing current filters before search');
                            await captureCurrentFilters();
                        }

                        // Step 2: Perform the search
                        const resultCount = await searchAllCategories(searchQuery);

                        // Step 3: Restore original filters (only on leads page)
                        if (isLeadsPage) {
                            debugLog('Search completed - restoring original filters');
                            await restoreOriginalFilters();
                        }

                        // Show result count if available
                        if (resultCount !== undefined) {
                            statusText.textContent = `Found ${resultCount} results`;
                            statusText.style.color = resultCount > 0 ? '#28a745' : '#dc3545';
                            statusText.style.display = 'block';
                        }
                    } catch (error) {
                        console.error('Search error:', error);
                        statusText.textContent = 'Search failed: ' + error.message;
                        statusText.style.color = '#dc3545';
                        statusText.style.display = 'block';
                    } finally {
                        // Hide spinner, restore button text
                        spinner.style.display = 'none';
                        searchButton.disabled = false;
                    }
                } else {
                    alert('Please enter a Search Query.');
                }
            });

            // Allow pressing Enter in the input field to trigger search
            searchQueryInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    searchButton.click();
                }
            });

            buttonContainer.appendChild(searchButton);
            buttonContainer.appendChild(spinner);

            parentContainer.appendChild(searchQueryInput);
            parentContainer.appendChild(buttonContainer);
            parentContainer.appendChild(statusText);
        }
    };

    /*************************************************************************/
    /*         HELPER #1: Show a modal that lists possible results           */
    /*************************************************************************/
    function showSelectionModal(items) { // items: Array of { category, text, element }
        // Create the modal container
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            borderRadius: '10px',
            boxShadow: '0px 4px 6px rgba(0,0,0,0.3)',
            zIndex: '2000',
            fontFamily: 'Arial, sans-serif',
            width: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
        });

        // Create modal header
        const modalHeader = document.createElement('div');
        Object.assign(modalHeader.style, {
            padding: '10px 20px',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: '0' // Prevent shrinking when content scrolls
        });

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Select a Result';
        modalTitle.style.margin = '0';
        modalTitle.style.fontSize = '18px';

        const closeButton = document.createElement('button');
        closeButton.textContent = '✖'; // Unicode multiplication sign as a close icon
        Object.assign(closeButton.style, {
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            lineHeight: '1',
            padding: '0',
            color: '#aaa'
        });
        closeButton.setAttribute('aria-label', 'Close Modal');

        closeButton.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Append title and close button to header
        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);

        // Create modal content
        const modalContent = document.createElement('div');
        Object.assign(modalContent.style, {
            padding: '20px',
            overflowY: 'auto',
            flexGrow: '1' // Allow content to grow and take available space
        });

        // Define the order and labels for sections
        const sections = [
            { key: 'clients', label: 'Clients', items: [] },
            { key: 'archivedClients', label: 'Archived Clients', items: [] },
            { key: 'leads', label: 'Leads', items: [] },
            { key: 'archivedLeads', label: 'Archived Leads', items: [] },
        ];

        // Categorize items into sections
        items.forEach(item => {
            switch (item.category) {
                case 'clients':
                    sections[0].items.push(item);
                    break;
                case 'archivedClients':
                    sections[1].items.push(item);
                    break;
                case 'leads':
                    sections[2].items.push(item);
                    break;
                case 'archivedLeads':
                    sections[3].items.push(item);
                    break;
                default:
                    break;
            }
        });

        // Build the modal content
        sections.forEach(section => {
            if (section.items.length > 0) {
                // Create section header
                const sectionHeader = document.createElement('h4');
                sectionHeader.textContent = `${section.label} (${section.items.length})`;
                sectionHeader.style.marginTop = '15px';
                sectionHeader.style.marginBottom = '10px';
                modalContent.appendChild(sectionHeader);

                // Create list container
                const list = document.createElement('ul');
                Object.assign(list.style, {
                    listStyle: 'none',
                    padding: '0',
                    margin: '0'
                });

                // Populate list items
                section.items.forEach(item => {
                    const listItem = document.createElement('li');
                    listItem.style.marginBottom = '10px';

                    const button = document.createElement('button');
                    Object.assign(button.style, {
                        width: '100%',
                        padding: '10px',
                        textAlign: 'left',
                        backgroundColor: '#f9f9f9',
                        border: '1px solid #ddd',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    });
                    button.textContent = item.text;
                    button.setAttribute('data-url', item.element.getAttribute('href'));

                    // Add hover effect
                    button.addEventListener('mouseover', () => {
                        button.style.backgroundColor = '#e6f7ff';
                        button.style.borderColor = '#1890ff';
                    });
                    button.addEventListener('mouseout', () => {
                        button.style.backgroundColor = '#f9f9f9';
                        button.style.borderColor = '#ddd';
                    });

                    // Click event to open link
                    button.addEventListener('click', () => {
                        const absoluteLink = new URL(item.element.getAttribute('href'), window.location.origin).href;
                        window.open(absoluteLink, '_blank');
                    });

                    listItem.appendChild(button);
                    list.appendChild(listItem);
                });

                modalContent.appendChild(list);
            }
        });

        // Assemble the modal
        modal.appendChild(modalHeader);
        modal.appendChild(modalContent);

        // Append modal to the body
        document.body.appendChild(modal);
    }

    /*************************************************************************/
    /* HELPER #1B: Create a modal that can be updated incrementally          */
    /*************************************************************************/
    function createDynamicResultsModal() {
        // If a previous modal is still open, remove it
        const existing = document.getElementById('smptDynamicModal');
        if (existing) existing.remove();

        // Re‑use styles and structure similar to showSelectionModal
        const modal = document.createElement('div');
        modal.id = 'smptDynamicModal';
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            borderRadius: '10px',
            boxShadow: '0px 4px 6px rgba(0,0,0,0.3)',
            zIndex: '2000',
            fontFamily: 'Arial, sans-serif',
            width: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
        });

        const modalHeader = document.createElement('div');
        Object.assign(modalHeader.style, {
            padding: '10px 20px',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: '0'
        });

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Search Results (0)';
        modalTitle.style.margin = '0';
        modalTitle.style.fontSize = '18px';

        const closeButton = document.createElement('button');
        closeButton.textContent = '✖';
        Object.assign(closeButton.style, {
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            lineHeight: '1',
            padding: '0',
            color: '#aaa'
        });
        closeButton.setAttribute('aria-label', 'Close Modal');
        closeButton.addEventListener('click', () => modal.remove());

        modalHeader.appendChild(modalTitle);

        // Searching indicator (spinner + text)
        const searchingHolder = document.createElement('div');
        Object.assign(searchingHolder.style, {
            display: 'none',
            alignItems: 'center',
            marginLeft: 'auto'
        });

        const spinnerEl = document.createElement('div');
        Object.assign(spinnerEl.style, {
            border: '2px solid rgba(0,0,0,0.1)',
            borderRadius: '50%',
            borderTop: '2px solid #1890ff',
            width: '12px',
            height: '12px',
            animation: 'smptSpin 1s linear infinite',
            marginRight: '6px'
        });

        const searchingText = document.createElement('span');
        searchingText.textContent = 'Searching…';
        searchingText.style.fontSize = '12px';

        searchingHolder.appendChild(spinnerEl);
        searchingHolder.appendChild(searchingText);
        modalHeader.appendChild(searchingHolder);

        // Keyframes for spinner once
        if (!document.getElementById('smptSpinnerKeyframes')) {
            const style = document.createElement('style');
            style.id = 'smptSpinnerKeyframes';
            style.textContent = '@keyframes smptSpin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}';
            document.head.appendChild(style);
        }

        modalHeader.appendChild(closeButton);

        const modalContent = document.createElement('div');
        Object.assign(modalContent.style, {
            padding: '20px',
            overflowY: 'auto',
            flexGrow: '1'
        });

        // Section map for easy adding
        const sectionsConfig = {
            clients: 'Clients',
            archivedClients: 'Archived Clients',
            leads: 'Leads',
            archivedLeads: 'Archived Leads'
        };
        const sectionsMap = {};

        for (const [key, label] of Object.entries(sectionsConfig)) {
            const header = document.createElement('h4');
            header.textContent = `${label} (0)`;
            header.style.marginTop = '15px';
            header.style.marginBottom = '10px';
            header.style.display = 'none'; // hidden until first item

            const list = document.createElement('ul');
            Object.assign(list.style, {
                listStyle: 'none',
                padding: '0',
                margin: '0'
            });
            list.style.display = 'none';

            modalContent.appendChild(header);
            modalContent.appendChild(list);

            sectionsMap[key] = { header, list, count: 0 };
        }

        modal.appendChild(modalHeader);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        function addItem(category, link) {
            const section = sectionsMap[category];
            if (!section) return;

            const listItem = document.createElement('li');
            listItem.style.marginBottom = '10px';
            const button = document.createElement('button');
            Object.assign(button.style, {
                width: '100%',
                padding: '10px',
                textAlign: 'left',
                backgroundColor: '#f9f9f9',
                border: '1px solid #ddd',
                borderRadius: '5px',
                cursor: 'pointer'
            });
            button.textContent = link.textContent.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#e6f7ff';
                button.style.borderColor = '#1890ff';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#f9f9f9';
                button.style.borderColor = '#ddd';
            });
            const absoluteLink = new URL(link.getAttribute('href'), window.location.origin).href;
            button.addEventListener('click', () => window.open(absoluteLink, '_blank'));

            listItem.appendChild(button);
            section.list.appendChild(listItem);

            section.count += 1;
            section.header.textContent = `${sectionsConfig[category]} (${section.count})`;
            section.header.style.display = 'block';
            section.list.style.display = 'block';
        }

        let total = 0;
        function incrementTotal(n = 1) {
            total += n;
            modalTitle.textContent = `Search Results (${total})`;
        }

        return {
            addItem(category, link) {
                addItem(category, link);
                incrementTotal();
            },
            setSearching(active) {
                searchingHolder.style.display = active ? 'flex' : 'none';
            },
            finalize() {
                if (total === 0) {
                    modalContent.innerHTML = '<p style="color:#dc3545">No results found.</p>';
                }
                this.setSearching(false);
            }
        };
    }

    /*************************************************************************/
    /* HELPER #2: Check if a string might be a phone number, ignoring punctuation */
    /*************************************************************************/
    function isPhoneNumberLike(query) {
        // Strip out parentheses, spaces, and dashes
        const digits = query.replace(/[\(\)\s\-]/g, '');
        // A simple check: if it's 10 or 11 digits, call it a "phone number"
        return /^\d{10,11}$/.test(digits);
    }

    /*************************************************************************/
    /* HELPER #3: Generate all standard phone number variants from digits   */
    /*************************************************************************/
    function getPhoneNumberVariants(rawQuery) {
        // 1) Strip to just digits
        const digits = rawQuery.replace(/\D/g, '');
        // Because we might have 10 or 11 digits, handle that
        // For example: 10-digit => 1234567890
        // or 11-digit => 11234567890
        // If 11-digit, we assume the first digit might be a leading country code (1).
        // You may or may not want that logic. This is just an example.

        // In this example, we'll assume we want to handle 10-digit only:
        // If the user typed 11 digits, but the leading digit is "1," we'll strip it to 10 for the variants below.
        let phone10 = digits;
        if (digits.length === 11 && digits.startsWith('1')) {
            phone10 = digits.substring(1);
        }

        // If it's not exactly 10 at this point, just return [digits] or handle differently
        if (phone10.length !== 10) {
            return [digits];
        }

        // phone10 is now something like "1234567890"
        // Generate the possible variations. Examples:
        // 1. (123) 456-7890
        // 2. (123) 4567890
        // 3. (123)4567890
        // 4. 1234567890
        // 5. 123 456-7890
        // 6. 123 4567890
        // 7. 123 456 7890
        // ...
        // You can generate as many as you need:

        const area = phone10.substring(0, 3);   // 123
        const prefix = phone10.substring(3, 6); // 456
        const line = phone10.substring(6);      // 7890

        return [
            `(${area}) ${prefix}-${line}`,
            `(${area}) ${prefix}${line}`,
            `(${area})${prefix}${line}`,
            `${area}${prefix}${line}`,
            `${area} ${prefix}-${line}`,
            `${area} ${prefix}${line}`,
            `${area} ${prefix} ${line}`,
            // ...add any other permutations you want
        ];
    }

    /*************************************************************************/
    /* HELPER #4: Make a POST call to lead-search or client-search           */
    /*************************************************************************/
    // Modified to accept an 'archived' parameter
    async function getLeads(searchQuery, archived = 'unarchived') {
        try {
            const bodyParams = new URLSearchParams({
                clientID: "12295",
                page: 1,
                section: "id",
                searchQuery,
                dir: "D",
                viewFilter: "all" // Adjust if 'archived' needs to affect 'viewFilter'
            });

            // If 'archived' is a valid parameter for leads, include it
            // Note: Adjust the parameter name and value based on actual API requirements
            if (archived === 'archived') {
                bodyParams.append('archived', 'true'); // Example parameter
            } else {
                bodyParams.append('archived', 'false'); // Example parameter
            }

            const response = await fetch("https://www.pixifi.com/admin/fn/leads/getLeads/", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
                },
                referrer: "https://www.pixifi.com/admin/leads/",
                body: bodyParams.toString(),
                method: "POST"
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");

            const leadLinks = [...doc.querySelectorAll('a[href^="/admin/leads/"]')]
                .filter(link => {
                    const txt = link.textContent
                        .replace(/\u00A0/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    return txt.length > 0;
                })
                .filter((link, index, self) => {
                    const href = link.getAttribute('href');
                    return (
                        index === self.findIndex(otherLink => otherLink.getAttribute('href') === href)
                    );
                });

            return leadLinks;
        } catch (error) {
            console.error('getLeads Error:', error);
            // Return an empty array so that the caller can handle "nothing found"
            return [];
        }
    }

    async function getClients(searchQuery, archived = 'unarchived') {
        try {
            const bodyParams = new URLSearchParams({
                clientID: "12295",
                page: 1,
                searchQuery,
                section: "name",
                dir: "A",
                archived: archived, // 'unarchived' or 'archived'
                card: "all"
            });

            const response = await fetch("https://www.pixifi.com/admin/fn/clients/getClientListing/", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
                },
                referrer: "https://www.pixifi.com/admin/clients/",
                body: bodyParams.toString(),
                method: "POST"
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");

            const clientLinks = [...doc.querySelectorAll('a[href^="/admin/clients/"]')]
                .filter(link => {
                    const txt = link.textContent
                        .replace(/\u00A0/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    return txt.length > 0;
                })
                .filter(link => !link.getAttribute('href').startsWith('/admin/clients/delete/'))
                .filter((link, index, self) => {
                    const href = link.getAttribute('href');
                    return (
                        index === self.findIndex(otherLink => otherLink.getAttribute('href') === href)
                    );
                });

            return clientLinks;
        } catch (error) {
            console.error('getClients Error:', error);
            return [];
        }
    }

    /*************************************************************************/
    /* MAIN SEARCH FLOW:  Search Clients, Archived Clients, Leads, Archived Leads, then phone expansions     */
    /*************************************************************************/
    async function searchAllCategories(searchQuery) {
        console.log(`Initiating search for query: ${searchQuery}`);

        // Create dynamic modal early so we can stream results
        const modal = createDynamicResultsModal();

        const deduped = new Set();
        function pushResults(category, links) {
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (deduped.has(href)) return;
                deduped.add(href);
                modal.addItem(category, link);
            });
        }

        // Helper to launch a single category search
        async function runCategory(searchFn, query, categoryLabel) {
            try {
                const links = await searchFn(query);
                pushResults(categoryLabel, links);
                return links.length;
            } catch (err) {
                console.error('Search error for', categoryLabel, err);
                return 0;
            }
        }

        modal.setSearching(true);

        // Build variant queue with special priority: digits first, formatted second, others by length
        let variants;
        if (isPhoneNumberLike(searchQuery)) {
            const digits = searchQuery.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); // strip and remove leading 1
            if (digits.length === 10) {
                const area = digits.substring(0,3);
                const prefix = digits.substring(3,6);
                const line   = digits.substring(6);
                const formatted = `(${area}) ${prefix}-${line}`;

                // Gather every generated variant plus the original query
                const all = new Set([
                    searchQuery,
                    ...getPhoneNumberVariants(searchQuery)
                ]);

                // Start with digits variant
                variants = [digits];

                // Add formatted variant if present and different
                if (formatted !== digits) variants.push(formatted);

                // Add the rest sorted by length ascending, skipping existing ones
                const rest = Array.from(all).filter(v => !variants.includes(v)).sort((a,b)=>a.length-b.length);
                variants.push(...rest);
            } else {
                // fallback to previous behaviour if digits not 10
                variants = Array.from(new Set([searchQuery, ...getPhoneNumberVariants(searchQuery)])).sort((a,b)=>a.length-b.length);
            }
        } else {
            variants = [searchQuery];
        }

        // Helper that walks through variants for a given category until it finds results
        async function runQueue(searchFn, label) {
            for (const variant of variants) {
                const found = await runCategory(searchFn, variant, label);
                if (found > 0) break;
            }
        }

        // Unarchived: run clients and leads queues in parallel, wait for both to finish
        await Promise.all([
            runQueue(q => getClients(q, 'unarchived'), 'clients'),
            runQueue(q => getLeads(q,   'unarchived'), 'leads')
        ]);

        // Archived: run clients and leads queues in parallel
        await Promise.all([
            runQueue(q => getClients(q, 'archived'), 'archivedClients'),
            runQueue(q => getLeads(q,   'archived'), 'archivedLeads')
        ]);

        modal.setSearching(false);
        modal.finalize();
        return deduped.size;
    }

    /**
     * Deduplicate items based on their href attribute.
     * Maintains the order and keeps the first occurrence.
     */
    function deduplicateByHref(items) {
        const seen = new Set();
        return items.filter(item => {
            const href = item.element.getAttribute('href');
            if (seen.has(href)) {
                return false;
            }
            seen.add(href);
            return true;
        });
    }

    /*************************************************************************/
    /* Attempt to register our tool with the SMPT if it exists              */
    /*************************************************************************/
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function tryRegisterSearchTool() {
        if (window.SMPT && typeof window.SMPT.registerTool === 'function') {
            window.SMPT.registerTool(mySearchTool);
        } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            setTimeout(tryRegisterSearchTool, 500);
        } else {
            console.warn('Sweet Me Photography Tools not found. The Search Tool will not be registered.');
        }
    }

    tryRegisterSearchTool();
})();
