// ==UserScript==
// @name         SMPT - Photographer Questionnaire Tool
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Sends photographer questionnaires for events in Pixifi
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
        name: 'Photographer Questionnaire',
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
                    const eventIDs = [];
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
                        if (r.eventIDs) {
                            eventIDs.push(...r.eventIDs);
                        }
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

                    // After showing results, create Send Questionnaires button if not already
                    let sendBtn = document.getElementById('smptSendPhotogQBtn');
                    if (!sendBtn) {
                        sendBtn = document.createElement('button');
                        sendBtn.id = 'smptSendPhotogQBtn';
                        sendBtn.textContent = 'Send Photographer Questionnaires';
                        Object.assign(sendBtn.style, {
                            padding: '8px 12px',
                            backgroundColor: '#28a745',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            marginTop: '10px'
                        });
                        statusElement.parentElement.insertBefore(sendBtn, statusElement.nextSibling);

                        sendBtn.addEventListener('click', async () => {
                            sendBtn.disabled = true;
                            sendBtn.textContent = 'Sending...';
                            try {
                                await sendPhotographerQuestionnaires(eventIDs, statusElement);
                                sendBtn.textContent = 'Done!';
                            } catch (err) {
                                console.error(err);
                                statusElement.innerHTML += `<br><span style='color:red;'>${err.message}</span>`;
                                sendBtn.textContent = 'Error';
                            }
                        });
                    }
                } catch (error) {
                    statusElement.textContent = `Error: ${error.message}`;
                    statusElement.style.color = '#dc3545';
                    console.error('Event counter error:', error);
                }
            });
            
            // Append button and status element
            toolContainer.appendChild(countButton);
            
            // Add testing section for single event
            const testingSection = document.createElement('div');
            testingSection.style.marginTop = '15px';
            testingSection.style.padding = '10px';
            testingSection.style.border = '1px solid #ddd';
            testingSection.style.borderRadius = '3px';
            testingSection.style.backgroundColor = '#f9f9f9';
            
            const testingLabel = document.createElement('label');
            testingLabel.textContent = 'Test Single Event:';
            testingLabel.style.fontSize = '12px';
            testingLabel.style.fontWeight = 'bold';
            testingLabel.style.display = 'block';
            testingLabel.style.marginBottom = '5px';
            testingSection.appendChild(testingLabel);
            
            const testEventWrapper = document.createElement('div');
            testEventWrapper.style.display = 'flex';
            testEventWrapper.style.gap = '5px';
            testEventWrapper.style.marginBottom = '5px';
            
            const testEventInput = document.createElement('input');
            testEventInput.type = 'text';
            testEventInput.id = 'smptTestEventID';
            testEventInput.placeholder = 'Enter Event ID (e.g., 1140759)';
            Object.assign(testEventInput.style, {
                flex: '1',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '3px'
            });
            
            const testEventButton = document.createElement('button');
            testEventButton.textContent = 'Test Event';
            Object.assign(testEventButton.style, {
                padding: '5px 10px',
                backgroundColor: '#ffc107',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold'
            });
            
            testEventWrapper.appendChild(testEventInput);
            testEventWrapper.appendChild(testEventButton);
            testingSection.appendChild(testEventWrapper);
            
            // Test event button click handler
            testEventButton.addEventListener('click', async () => {
                const eventID = testEventInput.value.trim();
                if (!eventID) {
                    alert('Please enter an Event ID to test.');
                    return;
                }
                
                testEventButton.disabled = true;
                testEventButton.textContent = 'Testing...';
                
                try {
                    // Clear previous status
                    statusElement.innerHTML = `<strong>Testing Event ID: ${eventID}</strong>`;
                    statusElement.style.color = '#007bff';
                    
                    // Run the photographer questionnaire process on this single event
                    await sendPhotographerQuestionnaires([eventID], statusElement);
                    
                    statusElement.innerHTML += `<br><br><strong style="color: #28a745;">Test completed for Event ID: ${eventID}</strong>`;
                } catch (error) {
                    statusElement.innerHTML += `<br><br><strong style="color: #dc3545;">Test failed for Event ID: ${eventID}</strong><br>Error: ${error.message}`;
                    console.error('Test event error:', error);
                } finally {
                    testEventButton.disabled = false;
                    testEventButton.textContent = 'Test Event';
                }
            });
            
            toolContainer.appendChild(testingSection);
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
        const requestBody = `clientID=12295&page=1&customFieldFilters=item_17417-score%3D%26item_15670%3D%26item_15926%3D%26item_13517%3D%26item_11969%3D%26item_11721%3D%26item_13804%3D%26item_8223%3D%26item_11970%3D%26item_16898%3D%26item_8229%3D%26item_11722%3D%26item_14924%3D%26item_11723%3D%26item_18389%3D%26item_10203%3D%26item_8220%3D%26item_12940%3D%26item_14099%3D%26item_18556%3D%26item_11971%3D%26item_15158%3D%26item_15168%3D%26item_15113%3D%26item_15160%3D%26item_15123%3D%26item_15162%3D%26item_15165%3D%26item_15119%3D%26item_15120%3D%26item_15121%3D%26item_15163%3D%26item_15669%3D%26item_18714%3D%26item_18715%3D%26item_18716%3D%26item_18717%3D%26item_18718%3D%26item_18719%3D%26item_18720%3D%26item_18721%3D&numPerPage=150&person=&status=B&event_status=376%7C%7C374%7C%7C375%7C%7C4532%7C%7C4557%7C%7C1910%7C%7C1911%7C%7C1917%7C%7C1912%7C%7C1913%7C%7C1915%7C%7C1919%7C%7C5058%7C%7C1920%7C%7C3072%7C%7C3073%7C%7C3245%7C%7C5795%7C%7C5796%7C%7C5797%7C%7C5267%7C%7C3495%7C%7C3528%7C%7C4236%7C%7C3529%7C%7C5407%7C%7C5408%7C%7C4652%7C%7C4994%7C%7C3452%7C%7C3453%7C%7C3454%7C%7C5530%7C%7C5531%7C%7C5006%7C%7C5007%7C%7C5008%7C%7C5009%7C%7C5533%7C%7C5534%7C%7C5535%7C%7C5640%7C%7C3455%7C%7C5757%7C%7C5055%7C%7C5756%7C%7C3539%7C%7C5216%7C%7C5565%7C%7C5854%7C%7C5056%7C%7C5152%7C%7C5153%7C%7C4235%7C%7C3538%7C%7C5374%7C%7C4303%7C%7C5150%7C%7C5114%7C%7C6117%7C%7C5057%7C%7C5062%7C%7C5116%7C%7C5151%7C%7C5115%7C%7C5061%7C%7C5220%7C%7C5221%7C%7C5222%7C%7C5856%7C%7C5257%7C%7C5258%7C%7C5561%7C%7C5562%7C%7C5563%7C%7C5630%7C%7C6170%7C%7C6227%7C%7C6281&view=alltime&brands=${brandsParam}&type=&bookedOnStart=&bookedOnEnd=&eventDateStart=${encodedStartDate}&eventDateEnd=${encodedEndDate}`;
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
        let eventIDs = [];
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
            if (eventLink) {
                const eventID = eventLink.match(/\/admin\/events\/(\d+)/)[1];
                if (eventID) {
                    eventIDs.push(eventID);
                }
            }
        }
        debugLog(`Here: ${hereCount}, Advanced: ${advancedCount}, Errors: ${errorCount}`);
        return { hereCount, advancedCount, errorCount, errorLinks, eventIDs };
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

    /*******************************************************************/
    /* Helper section for photographer questionnaires                  */
    /*******************************************************************/
    const PHOTOG_Q_TEMPLATE_ID = '73699';
    const PHOTOG_EMAIL_TEMPLATE_ID = '251825';
    const CLIENT_ID = '12295';

    const brandMapping = {
        11473: "BOOKING",
        15793: "SESSIONS",
        18826: "SCHEDULE",
        19647: "RESERVE",
        11634: "(EDITING) EAST/CENTRAL SMP",
        17159: "(EDITING) WEST SMP",
        14652: "Sweet Me Models",
        17956: "SMP JOBS",
        21064: "PC -SMP",
        17187: "ONBOARDING SMP",
        15121: "XXX DEFUNCT BRAND NAME XXX",
        17999: "Sweet Me Gift Cards",
        18626: "Sweet Me Staff Vacation Calendar",
        19691: "MELISSA TEST BRAND - DO NOT USE",
    };

    const brandNameToId = Object.fromEntries(Object.entries(brandMapping).map(([id, name]) => [name.trim(), id]));

    async function sendPhotographerQuestionnaires(eventIDs, statusEl) {
        for (let i = 0; i < eventIDs.length; i++) {
            const eid = eventIDs[i];
            statusEl.innerHTML += `<br>Processing event ${eid}...`;
            
            try {
                // 1) Remove all auto-reminders for questionnaires
                await removeAutoReminders(eid);
                statusEl.innerHTML += `<br>&nbsp;&nbsp;Removed auto-reminders for ${eid}`;
                
                // 2) Check existing questionnaires and delete photographer ones
                await cleanupExistingQuestionnaires(eid);
                statusEl.innerHTML += `<br>&nbsp;&nbsp;Cleaned up existing questionnaires for ${eid}`;
                
                // 3) Get event overview to discover event name & brand & date
                const overview = await getEventOverview(eid);
                const { eventName, brandName, eventDate } = overview;
                const brandID = brandNameToId[brandName.trim()] || '';
                
                // 4) Add photographer questionnaire
                const newQuestionnaireID = await addPhotographerQuestionnaire(eid, brandID);
                statusEl.innerHTML += `<br>&nbsp;&nbsp;Added questionnaire ${newQuestionnaireID} for ${eid}`;
                
                // 5) Get photographer emails
                const emails = await getPhotographerEmails(eid);
                if (!emails.length) {
                    statusEl.innerHTML += `<br>&nbsp;&nbsp;No photographer email found for ${eid}. Skipping email.`;
                    continue;
                }
                
                // 6) Get the questionnaire link for the newly added questionnaire
                const questionnaireLink = await getQuestionnaireLink(eid, newQuestionnaireID);
                
                // 7) Determine if session is today
                const isToday = isSessionToday(eventDate);
                
                // 8) Send email now if today, otherwise let system handle it automatically
                if (isToday) {
                    await sendPhotographerEmailNow(eid, brandID, emails, eventName, eventDate, questionnaireLink);
                    statusEl.innerHTML += `<br>&nbsp;&nbsp;Sent email immediately for ${eid}`;
                } else {
                    statusEl.innerHTML += `<br>&nbsp;&nbsp;Session is future date - leaving email to automatic system for ${eid}`;
                }
                
                statusEl.innerHTML += `<br>&nbsp;&nbsp;Done with ${eid}`;
            } catch (error) {
                statusEl.innerHTML += `<br>&nbsp;&nbsp;Error processing ${eid}: ${error.message}`;
                console.error(`Error processing event ${eid}:`, error);
            }
        }
    }

    async function removeAutoReminders(eventID) {
        const body = `clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}&questionnaires=yes`;
        const res = await fetch("https://www.pixifi.com/admin/data/removeAllRemindersFromObject/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
        const text = await res.text();
        if (!text.startsWith('SUCCESS')) throw new Error(`Failed to remove reminders for ${eventID}`);
        return true;
    }

    async function cleanupExistingQuestionnaires(eventID) {
        // Get existing questionnaires
        const body = `clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}`;
        const res = await fetch("https://www.pixifi.com/admin/fn/quest/refreshQuestionnaireToObjectListing/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
        const html = await res.text();
        
        if (!html.includes('SUCCESS{|}')) throw new Error(`Failed to get questionnaires for ${eventID}`);
        
        const htmlContent = html.split('SUCCESS{|}')[1];
        
        // Find photographer questionnaires to delete
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        const questionnaireDivs = doc.querySelectorAll('div[id^="questionnaire_"]');
        
        for (const div of questionnaireDivs) {
            const titleDiv = div.querySelector('div.floatGrid');
            if (titleDiv && titleDiv.textContent.includes('PHOTOGRAPHER SESSION INFO QUESTIONNAIRE')) {
                const questionnaireID = div.id.replace('questionnaire_', '');
                await deleteQuestionnaire(eventID, questionnaireID);
            }
        }
        return true;
    }

    async function deleteQuestionnaire(eventID, questionnaireID) {
        const res = await fetch(`https://www.pixifi.com/admin/fn/quest/deleteQuestionnaireFromObject/?clientID=${CLIENT_ID}&questionnaireID=${questionnaireID}&objType=event&objID=${eventID}`, {
            method: 'GET',
            headers: { 'x-requested-with': 'XMLHttpRequest' },
            credentials: 'include'
        });
        // Note: This endpoint doesn't return a specific success message, just hope it worked
        return true;
    }

    async function addPhotographerQuestionnaire(eventID, brandID) {
        const body = `clientID=${CLIENT_ID}&templateID=${PHOTOG_Q_TEMPLATE_ID}&objType=event&objID=${eventID}&brandID=${brandID}&customerID=&sendEmail=0&responseID=&recipients=&responseSubject=&responseMsg=&responseType=questionnaire`;
        const res = await fetch("https://www.pixifi.com/admin/fn/quest/addQuestionnaireTemplateToObject/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
        const text = await res.text();
        if (!text.startsWith('SUCCESS')) throw new Error(`Failed to add questionnaire to ${eventID}`);
        
        // Extract questionnaire ID from response like "SUCCESS{|}1084079"
        const questionnaireID = text.split('SUCCESS{|}')[1];
        return questionnaireID;
    }

    async function getQuestionnaireLink(eventID, questionnaireID) {
        // Refresh questionnaire listing to get the link
        const body = `clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}`;
        const res = await fetch("https://www.pixifi.com/admin/fn/quest/refreshQuestionnaireToObjectListing/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
        const html = await res.text();
        
        if (!html.includes('SUCCESS{|}')) throw new Error(`Failed to get questionnaire link for ${eventID}`);
        
        const htmlContent = html.split('SUCCESS{|}')[1];
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        
        // Find the specific questionnaire div
        const questionnaireDiv = doc.querySelector(`div[id="questionnaire_${questionnaireID}"]`);
        if (!questionnaireDiv) throw new Error(`Could not find questionnaire ${questionnaireID} in listing`);
        
        // Find the external link
        const linkElement = questionnaireDiv.querySelector('a[href*="questionnaires.pixifi.com"]');
        if (!linkElement) throw new Error(`Could not find questionnaire link for ${questionnaireID}`);
        
        return linkElement.href;
    }

    function isSessionToday(eventDate) {
        const today = new Date();
        const todayStr = formatDateForDisplay(today);
        
        // Convert eventDate (which might be in format like "04/30/2025") to MM/DD/YYYY
        let eventDateFormatted = eventDate;
        if (eventDate.includes('/')) {
            const parts = eventDate.split('/');
            if (parts.length === 3) {
                // If it's M/D/YYYY or MM/DD/YYYY format, ensure MM/DD/YYYY
                eventDateFormatted = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
            }
        }
        
        return todayStr === eventDateFormatted;
    }

    function formatEventDateLong(eventDate) {
        // Convert eventDate to long format like "Wednesday, May 21st, 2025"
        try {
            const parts = eventDate.split('/');
            if (parts.length !== 3) return eventDate;
            
            const month = parseInt(parts[0]);
            const day = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            
            const date = new Date(year, month - 1, day);
            
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            
            const dayName = dayNames[date.getDay()];
            const monthName = monthNames[date.getMonth()];
            
            // Add ordinal suffix to day
            const ordinal = (day) => {
                if (day > 3 && day < 21) return day + 'th';
                switch (day % 10) {
                    case 1: return day + 'st';
                    case 2: return day + 'nd';
                    case 3: return day + 'rd';
                    default: return day + 'th';
                }
            };
            
            return `${dayName}, ${monthName} ${ordinal(day)}, ${year}`;
        } catch (error) {
            return eventDate; // Return original if parsing fails
        }
    }

    async function sendPhotographerEmailNow(eventID, brandID, emails, eventName, eventDate, questionnaireLink) {
        const emailDetails = await buildPhotographerEmail(eventID, brandID, emails, eventName, eventDate, questionnaireLink);
        
        const body = `emailin_event=${encodeURIComponent(emailDetails.emailIn)}&brandID=${brandID}&recipientObj_event=${encodeURIComponent(emails.join(','))}&cc_event=&bcc_event=&responses=${PHOTOG_EMAIL_TEMPLATE_ID}&subject_event=${encodeURIComponent(emailDetails.subject)}&message_event=${encodeURIComponent(emailDetails.message)}&clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}`;
        
        await fetch("https://www.pixifi.com/admin/fn/email/sendNewObjectEmail/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
    }

    async function sendPhotographerEmailLater(eventID, brandID, emails, eventName, eventDate, questionnaireLink) {
        const emailDetails = await buildPhotographerEmail(eventID, brandID, emails, eventName, eventDate, questionnaireLink);
        
        // Format date for scheduling (MM/DD/YYYY format)
        const scheduleDate = encodeURIComponent(eventDate);
        const scheduleTime = encodeURIComponent('6:00:AM');
        
        const body = `emailin_event=${encodeURIComponent(emailDetails.emailIn)}&brandID=${brandID}&recipientObj_event=${encodeURIComponent(emails.join(','))}&cc_event=&bcc_event=&responses=${PHOTOG_EMAIL_TEMPLATE_ID}&subject_event=${encodeURIComponent(emailDetails.subject)}&message_event=${encodeURIComponent(emailDetails.message)}&clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}&dateType=custom&dateInput=${scheduleDate}&timeInput=${scheduleTime}`;
        
        await fetch("https://www.pixifi.com/admin/fn/email/sendNewObjectEmailLater/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
    }

    async function buildPhotographerEmail(eventID, brandID, emails, eventName, eventDate, questionnaireLink) {
        // Get the emailin_event value
        const res = await fetch("https://www.pixifi.com/admin/fn/email/getObjectEmailSendForm/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body: `clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}`,
            credentials: 'include'
        });
        const html = await res.text();
        const emailInMatch = html.match(/id="emailin_event"[^>]*value="([^"]+)"/);
        const emailIn = emailInMatch ? emailInMatch[1] : '';
        
        // Get photographer first name from emails
        let photographerFirstName = 'Photographer';
        if (emails.length > 0) {
            // Extract first name from email or use a default
            const email = emails[0];
            photographerFirstName = email.split('@')[0].split('.')[0];
            photographerFirstName = photographerFirstName.charAt(0).toUpperCase() + photographerFirstName.slice(1);
        }
        
        const eventDateLong = formatEventDateLong(eventDate);
        const subject = `QUESTIONNAIRE FOR SESSION $ ${eventName} ON ${eventDateLong}`;
        
        const message = `<p><span style="font-family: helvetica, arial, sans-serif; font-size: 12pt;">Hi ${photographerFirstName},</span></p>
<p><span style="font-size: 12pt; font-family: helvetica, arial, sans-serif;">Please click the dark blue link below titled "PHOTOGRAPHER SESSION INFO QUESTIONNAIRE" to complete your final task for SESSION ID: $ ${eventName} photographed ${eventDateLong}. </span></p>
<p><strong><span style="font-size: 12pt; font-family: helvetica, arial, sans-serif;">Please complete before midnight on the day of the session.</span></strong></p>
<p><span style="font-size: 12pt; font-family: helvetica, arial, sans-serif;"><span style="font-family: arial, helvetica, sans-serif; font-size: 12pt; color: #000000;">REMINDER:&nbsp; If the client ID has "PC" in front of it this indicates it is a Previous Client who has used us before. please do NOT include the PC in the file name when uploading.</span></span></p>
<table border="0" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td align="center">
<table border="0" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="-webkit-border-radius: 3px; -moz-border-radius: 3px; border-radius: 3px; padding: 15px 25px;" align="center" bgcolor="#33cccc"><center><span style="font-family: helvetica, arial, sans-serif; font-size: 14pt;"><strong><span style="color: #ffffff;"><a class="emailLink" style="color: #ffffff;" href="${questionnaireLink}" target="_blank" rel="noopener">PHOTOGRAPHER SESSION INFO QUESTIONNAIRE</a><br /></span></strong></span></center></td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
<p><span style="font-family: helvetica, arial, sans-serif; font-size: 12pt;">Thank you!</span></p>
<p><span style="font-family: helvetica, arial, sans-serif; font-size: 12pt;">Sweet Me Photography</span></p>
<p>&nbsp;</p>`;
        
        return { emailIn, subject, message };
    }

    async function getEventOverview(eventID) {
        const body = `clientID=${CLIENT_ID}&eventID=${eventID}&customerType=client&customerID=`;
        const res = await fetch("https://www.pixifi.com/admin/fn/events/getEventOverviewWindow/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        
        // Event Name
        let eventName = '';
        const eventAnchor = doc.querySelector('a.btn');
        if (eventAnchor) {
            eventName = eventAnchor.textContent.trim().replace(/^\$\s*/, '');
        }
        
        // Brand name (inside rightTitle after Brand:)
        let brandName = '';
        const brandDiv = Array.from(doc.querySelectorAll('div.leftTitle')).find(d => d.textContent.includes('Brand:'));
        if (brandDiv) {
            const right = brandDiv.nextElementSibling;
            if (right) brandName = right.textContent.trim();
        }
        
        // Event date
        let eventDate = '';
        const dateDiv = Array.from(doc.querySelectorAll('div.leftTitle')).find(d => d.textContent.includes('Event Date'));
        if (dateDiv) {
            const right = dateDiv.nextElementSibling;
            if (right) eventDate = right.textContent.trim();
        }
        
        return { eventName, brandName, eventDate };
    }

    async function getPhotographerEmails(eventID) {
        // 1) refresh staff listing to get photographer names
        const body = `clientID=${CLIENT_ID}&eventID=${eventID}&page=1`;
        const res = await fetch("https://www.pixifi.com/admin/fn/events/refreshEventStaffListing/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body,
            credentials: 'include'
        });
        const html = await res.text();
        console.log(`[DEBUG] Staff listing HTML length: ${html.length}`);
        
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const staffBlocks = doc.querySelectorAll('div[id^="staff_"]');
        console.log(`[DEBUG] Found ${staffBlocks.length} staff blocks`);
        
        const photographerNames = [];
        staffBlocks.forEach((bl, index) => {
            console.log(`[DEBUG] Staff block ${index}:`, bl.textContent.substring(0, 200));
            if (bl.textContent.includes('Photographer')) {
                const strong = bl.querySelector('strong');
                if (strong) {
                    const name = strong.textContent.trim();
                    photographerNames.push(name);
                    console.log(`[DEBUG] Found photographer: ${name}`);
                }
            }
        });
        console.log(`[DEBUG] Total photographer names found: ${photographerNames.length}`, photographerNames);

        // 2) get email send form to map names to addresses
        const res2 = await fetch("https://www.pixifi.com/admin/fn/email/getObjectEmailSendForm/", {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body: `clientID=${CLIENT_ID}&objectType=event&objectID=${eventID}`,
            credentials: 'include'
        });
        const html2 = await res2.text();
        console.log(`[DEBUG] Email form HTML length: ${html2.length}`);
        
        const doc2 = new DOMParser().parseFromString(html2, 'text/html');
        const optionEls = doc2.querySelectorAll('script');
        let jsonStr = '';
        optionEls.forEach(s => {
            const m = s.textContent.match(/options:\s*\[(.*?)\]/s);
            if (m) jsonStr = `[${m[1]}]`;
        });
        console.log(`[DEBUG] JSON string found: ${jsonStr.length > 0 ? 'Yes' : 'No'}`);
        console.log(`[DEBUG] Raw JSON string (first 500 chars):`, jsonStr.substring(0, 500));
        
        let options = [];
        try { 
            options = JSON.parse(jsonStr); 
            console.log(`[DEBUG] Parsed ${options.length} email options:`, options.map(o => `${o.name} - ${o.email}`));
        } catch (e) { 
            console.log(`[DEBUG] Failed to parse email options:`, e.message);
            console.log(`[DEBUG] Trying alternative parsing method...`);
            
            // Try to extract email options using a different method
            const emailPattern = /{email:\s*"([^"]+)",\s*name:\s*"([^"]+)"}/g;
            let match;
            while ((match = emailPattern.exec(jsonStr)) !== null) {
                options.push({
                    email: match[1],
                    name: match[2]
                });
            }
            console.log(`[DEBUG] Alternative parsing found ${options.length} options:`, options.map(o => `${o.name} - ${o.email}`));
        }
        
        const emails = [];
        photographerNames.forEach(namePart => {
            console.log(`[DEBUG] Looking for email for photographer: ${namePart}`);
            const opt = options.find(o => o.name && o.name.toLowerCase().includes(namePart.toLowerCase()));
            if (opt) {
                emails.push(opt.email);
                console.log(`[DEBUG] Found matching email: ${opt.email} for ${namePart}`);
            } else {
                console.log(`[DEBUG] No email found for ${namePart}`);
            }
        });
        
        const uniqueEmails = [...new Set(emails)];
        console.log(`[DEBUG] Final unique emails:`, uniqueEmails);
        return uniqueEmails;
    }
})(); 