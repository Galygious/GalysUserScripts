// ==UserScript==
// @name         SMPT - Client Info Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Gathers client name, email, and booked on date for events.
// @match        https://www.pixifi.com/admin/*
// @license      GPL
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Debug function to log messages to console with prefix
    function debugLog(message) {
        console.log(`[SMPT-ClientInfoExtractor] ${message}`);
    }

    // Initial debugging message to verify script is loaded
    debugLog('Script loaded');

    /**
     * Define the client info extractor tool.
     */
    const clientInfoExtractorTool = {
        name: 'Client Info Extractor',
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
            startDateText.id = 'smptClientInfoStartDateText';
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
            startDatePicker.id = 'smptClientInfoStartDate';
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
            endDateText.id = 'smptClientInfoEndDateText';
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
            endDatePicker.id = 'smptClientInfoEndDate';
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

            // "Get Info" button
            const getInfoButton = document.createElement('button');
            Object.assign(getInfoButton.style, {
                padding: '8px 12px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginTop: '5px'
            });
            getInfoButton.textContent = 'Get Client Info';

            // Status element to display results or loading
            const statusElement = document.createElement('div');
            statusElement.id = 'smptClientInfoStatus';
            statusElement.style.marginTop = '8px';
            statusElement.style.fontSize = '14px';

            // Add event listener to the "Get Info" button
            getInfoButton.addEventListener('click', async () => {
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
                    statusElement.textContent = 'Getting client info...';
                    statusElement.style.color = '#007bff';


                    const clientData = await getClientInfo(formattedStartDate, formattedEndDate);

                    if (clientData.length === 0) {
                        statusElement.textContent = 'No events found for the selected date range.';
                        statusElement.style.color = '#dc3545';
                        return;
                    }

                    // Build table header
                    let tableHtml = `<table style='border-collapse:collapse; width: 100%;'>`;
                    tableHtml += `<tr><th style='border:1px solid #ccc;padding:4px;'>Client Name</th><th style='border:1px solid #ccc;padding:4px;'>Client Email</th><th style='border:1px solid #ccc;padding:4px;'>Booked On</th></tr>`;

                    clientData.forEach(client => {
                        tableHtml += `<tr>`;
                        tableHtml += `<td style='border:1px solid #ccc;padding:4px;'>${client.name}</td>`;
                        tableHtml += `<td style='border:1px solid #ccc;padding:4px;'>${client.email}</td>`;
                        tableHtml += `<td style='border:1px solid #ccc;padding:4px;'>${client.bookedOn}</td>`;
                        tableHtml += `</tr>`;
                    });

                    tableHtml += `</table>`;

                    statusElement.innerHTML = tableHtml;
                    statusElement.style.color = '#28a745';

                } catch (error) {
                    statusElement.textContent = `Error: ${error.message}`;
                    statusElement.style.color = '#dc3545';
                    console.error('Client info extractor error:', error);
                }
            });

            // Append button and status element
            toolContainer.appendChild(getInfoButton);
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

    async function getClientInfo(startDate, endDate) {
        debugLog(`Getting client info from ${startDate} to ${endDate}`);
        // Convert YYYY-MM-DD to MM/DD/YYYY for the API request
        const formatDateForRequest = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${month}/${day}/${year}`;
        };
        const startDateFormatted = formatDateForRequest(startDate);
        const endDateFormatted = formatDateForRequest(endDate);
        const encodedStartDate = encodeURIComponent(startDateFormatted);
        const encodedEndDate = encodeURIComponent(endDateFormatted);

        const requestBody = `clientID=12295&page=1&customFieldFilters=item_17417-score%3D%26item_15670%3D%26item_15926%3D%26item_13517%3D%26item_11969%3D%26item_11721%3D%26item_13804%3D%26item_8223%3D%26item_11970%3D%26item_16898%3D%26item_8229%3D%26item_11722%3D%26item_14924%3D%26item_11723%3D%26item_18389%3D%26item_10203%3D%26item_8220%3D%26item_12940%3D%26item_14099%3D%26item_18556%3D%26item_11971%3D%26item_15158%3D%26item_15168%3D%26item_15113%3D%26item_15160%3D%26item_15123%3D%26item_15162%3D%26item_15165%3D%26item_15119%3D%26item_15120%3D%26item_15121%3D%26item_15163%3D%26item_15669%3D%26item_18714%3D%26item_18715%3D%26item_18716%3D%26item_18717%3D%26item_18718%3D%26item_18719%3D%26item_18720%3D%26item_18721%3D&numPerPage=150&person=&status=B&event_status=376%7C%7C374%7C%7C375%7C%7C4532%7C%7C4557%7C%7C1910%7C%7C1911%7C%7C1917%7C%7C1912%7C%7C1913%7C%7C1915%7C%7C1919%7C%7C5058%7C%7C1920%7C%7C3072%7C%7C3073%7C%7C3245%7C%7C5795%7C%7C5796%7C%7C5797%7C%7C5267%7C%7C3495%7C%7C3528%7C%7C4236%7C%7C3529%7C%7C5407%7C%7C5408%7C%7C4652%7C%7C4994%7C%7C3452%7C%7C3453%7C%7C3454%7C%7C5530%7C%7C5531%7C%7C5006%7C%7C5007%7C%7C5008%7C%7C5009%7C%7C5533%7C%7C5534%7C%7C5535%7C%7C5640%7C%7C3455%7C%7C5757%7C%7C5055%7C%7C5756%7C%7C3539%7C%7C5216%7C%7C5565%7C%7C5854%7C%7C5056%7C%7C5152%7C%7C5153%7C%7C4235%7C%7C3538%7C%7C5374%7C%7C4303%7C%7C5150%7C%7C5114%7C%7C6117%7C%7C5057%7C%7C5062%7C%7C5116%7C%7C5151%7C%7C5115%7C%7C5061%7C%7C5220%7C%7C5221%7C%7C5222%7C%7C5856%7C%7C5257%7C%7C5258%7C%7C5561%7C%7C5562%7C%7C5563%7C%7C5630%7C%7C6170%7C%7C6227%7C%7C6281&view=alltime&brands=none%7C%7C11473%7C%7C15793%7C%7C18826%7C%7C19647%7C%7C11634%7C%7C17159%7C%7C17956%7C%7C21064%7C%7C17187%7C%7C15121%7C%7C17999%7C%7C18626%7C%7C19691&type=&bookedOnStart=${encodedStartDate}&bookedOnEnd=${encodedEndDate}&eventDateStart=&eventDateEnd=`;
        const response = await fetch("https://www.pixifi.com/admin/fn/events/getEventsListing/", {
            method: "POST",
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: requestBody,
        });

        if (!response.ok) {
            debugLog(`API request failed with status ${response.status}`);
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.text();
        debugLog(`Response data length: ${data.length} characters`);

        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const eventDivs = Array.from(doc.querySelectorAll('div[id$="_event"]'));

        const clientInfoPromises = eventDivs.map(async (eventDiv) => {
            const eventId = eventDiv.id.replace('_event', '');
            const clientNameElem = eventDiv.querySelector('a > div.floatGrid:nth-of-type(4)');
            const bookedOnElem = eventDiv.querySelector('a > div.floatGrid:nth-of-type(2)');

            const clientName = clientNameElem ? clientNameElem.textContent.trim() : 'N/A';
            const bookedOn = bookedOnElem ? bookedOnElem.textContent.trim() : 'N/A';

            const email = await getClientEmail(eventId);

            return {
                name: clientName,
                email: email,
                bookedOn: bookedOn,
            };
        });

        return Promise.all(clientInfoPromises);
    }


    async function getClientEmail(eventId) {
        debugLog(`Fetching email for event ID: ${eventId}`);
        const response = await fetch("https://www.pixifi.com/admin/fn/email/getObjectEmailSendForm/", {
            method: "POST",
            headers: {
                "accept": "*/*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: `clientID=12295&objectType=event&objectID=${eventId}`,
        });

        if (!response.ok) {
            debugLog(`Failed to get email form for event ${eventId}. Status: ${response.status}`);
            return 'Email not found';
        }

        const html = await response.text();
        const scriptContentMatch = html.match(/<script type="text\/javascript">\s*\$\(function\(\) {[\s\S]*?options: (\[[\s\S]*?\]),/);

        if (scriptContentMatch && scriptContentMatch[1]) {
            try {
                // It's not perfect JSON, so we need to clean it up.
                // This is risky and might break if the format changes.
                const optionsStr = scriptContentMatch[1]
                    .replace(/<i class='icon-ID-card'><\/i>/g, '') // remove icons
                    .replace(/(\w+):/g, '"$1":') // quote keys
                    .replace(/'/g, '"'); // replace single quotes with double

                const options = JSON.parse(optionsStr);

                const client = options.find(o => o.name && !o.name.includes('(staff)'));
                return client ? client.email : 'Email not found in options';
            } catch (e) {
                console.error('Error parsing selectize options:', e);
                // Fallback to regex if JSON parsing fails
            }
        }

        // Fallback regex if the above fails
        const emailMatch = html.match(/{email: "([^"]+)", name: "((?!staff).)*?"}/);
        if (emailMatch && emailMatch[1]) {
            return emailMatch[1];
        }


        return 'Email not found (parsing failed)';
    }

    /*************************************************************************/
    /* Attempt to register our tool with the SMPT if it exists              */
    /*************************************************************************/
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function tryRegisterClientInfoExtractorTool() {
        if (window.SMPT && typeof window.SMPT.registerTool === 'function') {
            debugLog('SMPT found, registering Client Info Extractor tool');
            window.SMPT.registerTool(clientInfoExtractorTool);
        } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            debugLog(`SMPT not found, retry attempt ${attempts}/${MAX_ATTEMPTS}`);
            setTimeout(tryRegisterClientInfoExtractorTool, 500);
        } else {
            debugLog('Max retry attempts reached. SMPT not found.');
            console.warn('Sweet Me Photography Tools not found. The Client Info Extractor Tool will not be registered.');
        }
    }

    tryRegisterClientInfoExtractorTool();
})();