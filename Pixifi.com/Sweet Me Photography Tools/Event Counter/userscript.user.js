// ==UserScript==
// @name         SMPT - Event Counter
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Counts booked events between two dates in Pixifi
// @match        https://www.pixifi.com/admin/*
// @license      GPL
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Debug function to log messages to console with prefix
    function debugLog(message) {
        console.log(`[SMPT-EventCounter] ${message}`);
    }

    // Initial debugging message to verify script is loaded
    debugLog('Script loaded');

    /**
     * Define the event counter tool.
     */
    const eventCounterTool = {
        name: 'Event Counter',
        // Match any page under pixifi.com
        domainRegex: /https:\/\/www\.pixifi\.com/,

        render(parentContainer) {
            debugLog('Render method called');
            // Create container for the date inputs and button
            const toolContainer = document.createElement('div');
            toolContainer.style.display = 'flex';
            toolContainer.style.flexDirection = 'column';
            toolContainer.style.gap = '5px';

            // Start date input with label
            const startDateLabel = document.createElement('label');
            startDateLabel.textContent = 'Start Date:';
            startDateLabel.style.fontSize = '12px';
            toolContainer.appendChild(startDateLabel);

            // Create date input wrapper for start date
            const startDateWrapper = document.createElement('div');
            startDateWrapper.style.display = 'flex';
            startDateWrapper.style.gap = '5px';
            startDateWrapper.style.marginBottom = '5px';
            startDateWrapper.style.position = 'relative';

            // Text input for manually entering the date
            const startDateText = document.createElement('input');
            startDateText.type = 'text';
            startDateText.id = 'smptEventCounterStartDateText';
            startDateText.placeholder = 'MM/DD/YYYY';
            startDateText.value = getCurrentDate();
            Object.assign(startDateText.style, {
                width: '100%',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '3px'
            });

            // Calendar button wrapper for start date
            const startDateBtnWrapper = document.createElement('div');
            startDateBtnWrapper.style.position = 'relative';
            startDateBtnWrapper.style.display = 'inline-block';

            // Calendar icon button
            const startDateCalendarBtn = document.createElement('button');
            startDateCalendarBtn.innerHTML = '&#128197;'; // Calendar emoji
            Object.assign(startDateCalendarBtn.style, {
                padding: '0 8px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '3px',
                cursor: 'pointer',
                position: 'relative',
                zIndex: 1
            });
            // Date input for the date picker (overlayed, transparent, only over button)
            const startDatePicker = document.createElement('input');
            startDatePicker.type = 'date';
            startDatePicker.id = 'smptEventCounterStartDate';
            Object.assign(startDatePicker.style, {
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                zIndex: 2,
                cursor: 'pointer',
            });
            // When button is clicked, focus the date input
            startDateCalendarBtn.addEventListener('click', () => {
                startDatePicker.focus();
                startDatePicker.click();
            });
            // Sync the text input when date is selected from picker
            startDatePicker.addEventListener('change', () => {
                const [year, month, day] = startDatePicker.value.split('-');
                startDateText.value = `${month}/${day}/${year}`;
            });
            // Add button and input to wrapper
            startDateBtnWrapper.appendChild(startDateCalendarBtn);
            startDateBtnWrapper.appendChild(startDatePicker);
            // Add components to the row
            startDateWrapper.appendChild(startDateText);
            startDateWrapper.appendChild(startDateBtnWrapper);
            toolContainer.appendChild(startDateWrapper);

            // End date input with label
            const endDateLabel = document.createElement('label');
            endDateLabel.textContent = 'End Date:';
            endDateLabel.style.fontSize = '12px';
            toolContainer.appendChild(endDateLabel);

            // Create date input wrapper for end date
            const endDateWrapper = document.createElement('div');
            endDateWrapper.style.display = 'flex';
            endDateWrapper.style.gap = '5px';
            endDateWrapper.style.marginBottom = '5px';
            endDateWrapper.style.position = 'relative';

            // Text input for manually entering the date
            const endDateText = document.createElement('input');
            endDateText.type = 'text';
            endDateText.id = 'smptEventCounterEndDateText';
            endDateText.placeholder = 'MM/DD/YYYY';
            endDateText.value = getCurrentDate();
            Object.assign(endDateText.style, {
                width: '100%',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '3px'
            });

            // Calendar button wrapper for end date
            const endDateBtnWrapper = document.createElement('div');
            endDateBtnWrapper.style.position = 'relative';
            endDateBtnWrapper.style.display = 'inline-block';
            // Calendar icon button
            const endDateCalendarBtn = document.createElement('button');
            endDateCalendarBtn.innerHTML = '&#128197;'; // Calendar emoji
            Object.assign(endDateCalendarBtn.style, {
                padding: '0 8px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '3px',
                cursor: 'pointer',
                position: 'relative',
                zIndex: 1
            });
            // Date input for the date picker (overlayed, transparent, only over button)
            const endDatePicker = document.createElement('input');
            endDatePicker.type = 'date';
            endDatePicker.id = 'smptEventCounterEndDate';
            Object.assign(endDatePicker.style, {
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                zIndex: 2,
                cursor: 'pointer',
            });
            // When button is clicked, focus the date input
            endDateCalendarBtn.addEventListener('click', () => {
                endDatePicker.focus();
                endDatePicker.click();
            });
            // Sync the text input when date is selected from picker
            endDatePicker.addEventListener('change', () => {
                const [year, month, day] = endDatePicker.value.split('-');
                endDateText.value = `${month}/${day}/${year}`;
            });
            // Add button and input to wrapper
            endDateBtnWrapper.appendChild(endDateCalendarBtn);
            endDateBtnWrapper.appendChild(endDatePicker);
            // Add components to the row
            endDateWrapper.appendChild(endDateText);
            endDateWrapper.appendChild(endDateBtnWrapper);
            toolContainer.appendChild(endDateWrapper);

            // Count button
            const countButton = document.createElement('button');
            Object.assign(countButton.style, {
                padding: '8px 12px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginTop: '5px'
            });
            countButton.textContent = 'Count Events';

            // Status element to display results or loading
            const statusElement = document.createElement('div');
            statusElement.id = 'smptEventCounterStatus';
            statusElement.style.marginTop = '8px';
            statusElement.style.fontSize = '14px';

            // Add event listener to the count button
            countButton.addEventListener('click', async () => {
                // Get dates from text fields
                const startDateStr = startDateText.value;
                const endDateStr = endDateText.value;

                // Validate inputs
                if (!startDateStr || !endDateStr) {
                    alert('Please enter both start and end dates.');
                    return;
                }

                // Convert the MM/DD/YYYY text to YYYY-MM-DD format for the API
                try {
                    const formattedStartDate = formatDateForApi(startDateStr);
                    const formattedEndDate = formatDateForApi(endDateStr);

                    // Show loading state
                    statusElement.textContent = 'Counting events...';
                    statusElement.style.color = '#007bff';

                    // Brand definitions
                    const BRAND_MAP = {
                        'Booking': '11473',
                        'Schedule': '18826',
                        'Reserve': '19647',
                        'Sessions': '15793',
                    };
                    const ALL_BRANDS = [
                        'none','11473','15793','18826','19647','11634','17159','17956','21064','17187','15121','17999','18626','19691'
                    ];
                    const NAMED_BRANDS = Object.values(BRAND_MAP);
                    const OTHER_BRANDS = ALL_BRANDS.filter(b => !NAMED_BRANDS.includes(b));

                    // Prepare fetches for each brand
                    const fetches = [
                        ...Object.entries(BRAND_MAP).map(([brand, id]) => ({ brand, ids: [id] })),
                        { brand: 'Other', ids: OTHER_BRANDS }
                    ];

                    // Run all fetches in parallel
                    const results = await Promise.all(
                        fetches.map(f => countEvents(formattedStartDate, formattedEndDate, f.ids))
                    );

                    // Determine if we need to show the Error column and Other row
                    const hasErrors = results.some(r => r.errorCount > 0);
                    const otherIndex = fetches.findIndex(f => f.brand === 'Other');
                    const hasOther = otherIndex !== -1 && (results[otherIndex].hereCount > 0 || results[otherIndex].advancedCount > 0 || results[otherIndex].errorCount > 0);

                    // Build table header
                    let tableHtml = `<table style='border-collapse:collapse;'>`;
                    tableHtml += `<tr><th style='border:1px solid #ccc;padding:4px;'>Brand</th><th style='border:1px solid #ccc;padding:4px;'>Here</th><th style='border:1px solid #ccc;padding:4px;'>Adva</th>`;
                    if (hasErrors) tableHtml += `<th style='border:1px solid #ccc;padding:4px;'>Error</th>`;
                    tableHtml += `</tr>`;

                    let totalHere = 0, totalAdva = 0, totalError = 0;
                    fetches.forEach((f, i) => {
                        // Only show 'Other' row if it has data
                        if (f.brand === 'Other' && !hasOther) return;
                        const r = results[i];
                        totalHere += r.hereCount;
                        totalAdva += r.advancedCount;
                        totalError += r.errorCount;
                        tableHtml += `<tr><td style='border:1px solid #ccc;padding:4px;'>${f.brand}</td><td style='border:1px solid #ccc;padding:4px;'>${r.hereCount}</td><td style='border:1px solid #ccc;padding:4px;'>${r.advancedCount}</td>`;
                        if (hasErrors) tableHtml += `<td style='border:1px solid #ccc;padding:4px;'>${r.errorCount}</td>`;
                        tableHtml += `</tr>`;
                    });
                    const grandTotal = totalHere + totalAdva + (hasErrors ? totalError : 0);
                    tableHtml += `<tr style='font-weight:bold;background:#f0f0f0;'><td style='border:1px solid #ccc;padding:4px;'>Total</td><td style='border:1px solid #ccc;padding:4px;'>${totalHere}</td><td style='border:1px solid #ccc;padding:4px;'>${totalAdva}</td>`;
                    if (hasErrors) tableHtml += `<td style='border:1px solid #ccc;padding:4px;'>${totalError}</td>`;
                    tableHtml += `</tr>`;
                    tableHtml += `<tr style='font-weight:bold;background:#e0e0e0;'><td colspan='${hasErrors ? 4 : 3}' style='border:1px solid #ccc;padding:4px;text-align:right;'>Complete Total: ${grandTotal}</td></tr>`;
                    tableHtml += `</table>`;

                    // Show error links if any
                    let errorLinksHtml = '';
                    results.forEach((r, i) => {
                        if (r.errorCount > 0 && r.errorLinks.length > 0) {
                            errorLinksHtml += `<br><b>${fetches[i].brand} Errors:</b><br>` + r.errorLinks.map(l => `- <a href='${l}' target='_blank'>${l}</a>`).join('<br>');
                        }
                    });

                    statusElement.innerHTML = tableHtml + errorLinksHtml;
                    statusElement.style.color = '#28a745';
                } catch (error) {
                    statusElement.textContent = `Error: ${error.message}`;
                    statusElement.style.color = '#dc3545';
                    console.error('Event counter error:', error);
                }
            });

            // Append button and status element
            toolContainer.appendChild(countButton);
            toolContainer.appendChild(statusElement);

            // Append the tool container to the parent
            parentContainer.appendChild(toolContainer);
            debugLog('Tool rendered to container');
        }
    };

    /**
     * Format a date object to MM/DD/YYYY string
     */
    function formatDateForDisplay(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    /**
     * Get current date formatted as MM/DD/YYYY
     */
    function getCurrentDate() {
        const today = new Date();
        return formatDateForDisplay(today);
    }

    /**
     * Convert MM/DD/YYYY to YYYY-MM-DD format for the API
     */
    function formatDateForApi(dateStr) {
        // Check if the input is in MM/DD/YYYY format
        const dateParts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!dateParts) {
            throw new Error('Please enter dates in MM/DD/YYYY format');
        }

        const [, month, day, year] = dateParts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    /**
     * Count events between two dates by making a fetch request
     * @param {string} startDate - YYYY-MM-DD format
     * @param {string} endDate - YYYY-MM-DD format
     * @param {string[]} brands - Array of brand IDs to include in the request
     * @returns {Promise<object>} - Object with counts and error links
     */
    async function countEvents(startDate, endDate, brands) {
        debugLog(`Counting events from ${startDate} to ${endDate} for brands: ${brands.join(',')}`);
        // Convert YYYY-MM-DD to MM/DD/YYYY for the API request
        const formatDateForRequest = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${month}/${day}/${year}`;
        };
        const startDateFormatted = formatDateForRequest(startDate);
        const endDateFormatted = formatDateForRequest(endDate);
        const encodedStartDate = encodeURIComponent(startDateFormatted);
        const encodedEndDate = encodeURIComponent(endDateFormatted);
        // Encode brands for the request
        const brandsParam = brands.join('%7C%7C');
        // Use the new fetch body (already brand-filtered)
        const requestBody = `clientID=12295&page=1&customFieldFilters=item_17417-score%3D%26item_15670%3D%26item_15926%3D%26item_13517%3D%26item_11969%3D%26item_11721%3D%26item_13804%3D%26item_8223%3D%26item_11970%3D%26item_16898%3D%26item_8229%3D%26item_11722%3D%26item_14924%3D%26item_11723%3D%26item_18389%3D%26item_10203%3D%26item_8220%3D%26item_12940%3D%26item_14099%3D%26item_18556%3D%26item_11971%3D%26item_15158%3D%26item_15168%3D%26item_15113%3D%26item_15160%3D%26item_15123%3D%26item_15162%3D%26item_15165%3D%26item_15119%3D%26item_15120%3D%26item_15121%3D%26item_15163%3D%26item_15669%3D%26item_18714%3D%26item_18715%3D%26item_18716%3D%26item_18717%3D%26item_18718%3D%26item_18719%3D%26item_18720%3D%26item_18721%3D&numPerPage=150&person=&status=B&event_status=376%7C%7C374%7C%7C375%7C%7C4532%7C%7C4557%7C%7C1910%7C%7C1911%7C%7C1917%7C%7C1912%7C%7C1913%7C%7C1915%7C%7C1919%7C%7C5058%7C%7C1920%7C%7C3072%7C%7C3073%7C%7C3245%7C%7C5795%7C%7C5796%7C%7C5797%7C%7C5267%7C%7C3495%7C%7C3528%7C%7C4236%7C%7C3529%7C%7C5407%7C%7C5408%7C%7C4652%7C%7C4994%7C%7C3452%7C%7C3453%7C%7C3454%7C%7C5530%7C%7C5531%7C%7C5006%7C%7C5007%7C%7C5008%7C%7C5009%7C%7C5533%7C%7C5534%7C%7C5535%7C%7C5640%7C%7C3455%7C%7C5757%7C%7C5055%7C%7C5756%7C%7C3539%7C%7C5216%7C%7C5565%7C%7C5854%7C%7C5056%7C%7C5152%7C%7C5153%7C%7C4235%7C%7C3538%7C%7C5374%7C%7C4303%7C%7C5150%7C%7C5114%7C%7C6117%7C%7C5057%7C%7C5062%7C%7C5116%7C%7C5151%7C%7C5115%7C%7C5061%7C%7C5220%7C%7C5221%7C%7C5222%7C%7C5856%7C%7C5257%7C%7C5258%7C%7C5561%7C%7C5562%7C%7C5563%7C%7C5630%7C%7C6170%7C%7C6227%7C%7C6281&view=alltime&brands=${brandsParam}&type=&bookedOnStart=${encodedStartDate}&bookedOnEnd=${encodedEndDate}&eventDateStart=&eventDateEnd=`;
        const response = await fetch("https://www.pixifi.com/admin/fn/events/getEventsListing/", {
            method: "POST",
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-requested-with": "XMLHttpRequest"
            },
            referrer: "https://www.pixifi.com/admin/events/",
            referrerPolicy: "strict-origin-when-cross-origin",
            body: requestBody,
            mode: "cors",
            credentials: "include"
        });
        if (!response.ok) {
            debugLog(`API request failed with status ${response.status}`);
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.text();
        debugLog(`Response data length: ${data.length} characters`);
        // Parse the HTML response to count Here, Advanced, and Error sessions
        let hereCount = 0;
        let advancedCount = 0;
        let errorCount = 0;
        let errorLinks = [];
        // Use a DOMParser to parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        // Find all event containers by id ending with _event
        const eventDivs = Array.from(doc.querySelectorAll('div[id$="_event"]'));
        for (const eventDiv of eventDivs) {
            // Find the status div inside the event
            const statusDiv = eventDiv.querySelector('div.roundedTagMed[title]');
            // Find the event link
            const linkElem = eventDiv.querySelector('a[href^="/admin/events/"]');
            const eventLink = linkElem ? linkElem.href : null;
            if (statusDiv) {
                const statusTitle = statusDiv.getAttribute('title');
                if (statusTitle === 'SESSION GOOD TO GO!') {
                    hereCount++;
                } else if (statusTitle === 'WAITING FOR BABY TO ARRIVE') {
                    advancedCount++;
                } else {
                    errorCount++;
                    if (eventLink) errorLinks.push(eventLink);
                }
            } else {
                errorCount++;
                if (eventLink) errorLinks.push(eventLink);
            }
        }
        debugLog(`Here: ${hereCount}, Advanced: ${advancedCount}, Errors: ${errorCount}`);
        return { hereCount, advancedCount, errorCount, errorLinks };
    }

    /*************************************************************************/
    /* Attempt to register our tool with the SMPT if it exists              */
    /*************************************************************************/
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function tryRegisterEventCounterTool() {
        if (window.SMPT && typeof window.SMPT.registerTool === 'function') {
            debugLog('SMPT found, registering Event Counter tool');
            window.SMPT.registerTool(eventCounterTool);
        } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            debugLog(`SMPT not found, retry attempt ${attempts}/${MAX_ATTEMPTS}`);
            setTimeout(tryRegisterEventCounterTool, 500);
        } else {
            debugLog('Max retry attempts reached. SMPT not found.');
            console.warn('Sweet Me Photography Tools not found. The Event Counter Tool will not be registered.');
        }
    }

    tryRegisterEventCounterTool();
})();