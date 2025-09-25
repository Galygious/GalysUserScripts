// ==UserScript==
// @name         SMPT - Heatmap
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  A standalone script that registers a Lead/Client Heatmap tool with the Sweet Me Photography Tools window, displaying Clients, Archived Clients, Leads, and Archived Leads in order.
// @match        https://www.pixifi.com/admin/*
// @license      GPL
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @connect      raw.githubusercontent.com
// @connect      www.google.com
// @grant        unsafeWindow
// @downloadURL  https://update.greasyfork.org/scripts/523685/SMPT%20-%20Heatmap.user.js
// @updateURL    https://update.greasyfork.org/scripts/523685/SMPT%20-%20Heatmap.meta.js
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Define the Heatmap tool.
     */
    const myHeatmapTool = {
        name: 'Heatmap Tool',
        // Match any page under pixifi.com
        domainRegex: /https:\/\/www\.pixifi\.com/,

        render(parentContainer) {
            // Add Leaflet dependencies
            if (!document.getElementById('leaflet-css')) {
                const leafletCSS = document.createElement('link');
                leafletCSS.id = 'leaflet-css';
                leafletCSS.rel = 'stylesheet';
                leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                leafletCSS.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
                leafletCSS.crossOrigin = '';
                document.head.appendChild(leafletCSS);
            }
            
            if (!document.getElementById('leaflet-js')) {
                const leafletJS = document.createElement('script');
                leafletJS.id = 'leaflet-js';
                leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                leafletJS.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
                leafletJS.crossOrigin = '';
                document.head.appendChild(leafletJS);
            }
            
            if (!document.getElementById('leaflet-heat-js')) {
                const leafletHeatJS = document.createElement('script');
                leafletHeatJS.id = 'leaflet-heat-js';
                leafletHeatJS.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
                document.head.appendChild(leafletHeatJS);
            }
            
            // Create container for all controls
            const controlsContainer = document.createElement('div');
            Object.assign(controlsContainer.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            });
            
            // ---- Photographer Selection ----
            const photographerLabel = document.createElement('label');
            photographerLabel.textContent = 'Photographer:';
            photographerLabel.style.fontSize = '12px';
            
            const photographerSelect = document.createElement('select');
            photographerSelect.id = 'heatmap-photographer';
            Object.assign(photographerSelect.style, {
                width: '100%',
                padding: '5px',
                marginTop: '2px',
                border: '1px solid #ccc',
                borderRadius: '3px'
            });
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "All Photographers";
            photographerSelect.appendChild(defaultOption);
            
            // Photographer selection section
            const photographerSection = document.createElement('div');
            photographerSection.appendChild(photographerLabel);
            photographerSection.appendChild(photographerSelect);
            controlsContainer.appendChild(photographerSection);
            
            // ---- Date Range Selection ----
            // Start date
            const startDateLabel = document.createElement('label');
            startDateLabel.textContent = 'Start Date:';
            startDateLabel.style.fontSize = '12px';
            
            const startDateInput = document.createElement('input');
            startDateInput.type = 'date';
            startDateInput.id = 'heatmap-start-date';
            Object.assign(startDateInput.style, {
                width: '100%',
                padding: '5px',
                marginTop: '2px',
                border: '1px solid #ccc',
                borderRadius: '3px'
            });
            // Set default to 30 days ago
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            startDateInput.value = formatDateForInput(thirtyDaysAgo);
            
            // End date
            const endDateLabel = document.createElement('label');
            endDateLabel.textContent = 'End Date:';
            endDateLabel.style.fontSize = '12px';
            
            const endDateInput = document.createElement('input');
            endDateInput.type = 'date';
            endDateInput.id = 'heatmap-end-date';
            Object.assign(endDateInput.style, {
                width: '100%',
                padding: '5px',
                marginTop: '2px',
                border: '1px solid #ccc',
                borderRadius: '3px'
            });
            // Set default to today
            endDateInput.value = formatDateForInput(new Date());
            
            // Date range section
            const dateSection = document.createElement('div');
            dateSection.appendChild(startDateLabel);
            dateSection.appendChild(startDateInput);
            dateSection.appendChild(document.createElement('br'));
            dateSection.appendChild(endDateLabel);
            dateSection.appendChild(endDateInput);
            controlsContainer.appendChild(dateSection);
            
            // Create a container for the button and spinner
            const buttonContainer = document.createElement('div');
            buttonContainer.style.position = 'relative';
            buttonContainer.style.display = 'inline-block';
            buttonContainer.style.width = '100%';
            buttonContainer.style.marginTop = '5px';

            const heatmapButton = document.createElement('button');
            Object.assign(heatmapButton.style, {
                display: 'block',
                width: '100%',
                padding: '8px 10px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold',
                textAlign: 'center'
            });
            heatmapButton.textContent = 'Generate Heatmap';

            // Create the loading spinner (hidden initially)
            const spinner = document.createElement('div');
            spinner.id = 'smptHeatmapSpinner';
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
                <div class="spinner"></div> Processing...
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
            statusText.id = 'smptHeatmapStatus';
            Object.assign(statusText.style, {
                marginTop: '5px',
                fontSize: '12px',
                color: '#666',
                display: 'none'
            });
            
            // Map container
            const mapContainer = document.createElement('div');
            mapContainer.id = 'heatmap-map';
            Object.assign(mapContainer.style, {
                width: '100%',
                height: '300px',
                marginTop: '10px',
                display: 'none',
                border: '1px solid #ccc'
            });
            
            // Container for map action buttons
            const mapActionsContainer = document.createElement('div');
            mapActionsContainer.style.display = 'none';
            mapActionsContainer.style.marginTop = '10px';
            mapActionsContainer.style.textAlign = 'center';
            
            // Fullscreen view button
            const fullscreenBtn = document.createElement('button');
            Object.assign(fullscreenBtn.style, {
                padding: '5px 10px',
                backgroundColor: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                marginRight: '10px',
                fontSize: '12px'
            });
            fullscreenBtn.textContent = 'View Fullscreen';
            fullscreenBtn.onclick = () => openMapInFullscreen(mapContainer);
            
            // Export as image button
            const exportBtn = document.createElement('button');
            Object.assign(exportBtn.style, {
                padding: '5px 10px',
                backgroundColor: '#17a2b8',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '12px'
            });
            exportBtn.textContent = 'Export as Image';
            exportBtn.onclick = () => exportMapAsImage(mapContainer);
            
            // When button is clicked, generate the heatmap
            heatmapButton.addEventListener('click', async () => {
                const photographerId = photographerSelect.value;
                const startDate = startDateInput.value;
                const endDate = endDateInput.value;
                
                if (!startDate || !endDate) {
                    alert('Please select both start and end dates.');
                    return;
                }
                
                // Show spinner and hide status
                spinner.style.display = 'flex';
                statusText.style.display = 'none';
                mapContainer.style.display = 'none';
                mapActionsContainer.style.display = 'none';
                heatmapButton.disabled = true;
                
                try {
                    // Test local server connection first
                    const serverTest = await testLocalServer();
                    if (!serverTest.success) {
                        console.warn('Local server test failed:', serverTest.message);
                        // Show warning but continue with fallback coordinates
                        statusText.textContent = `Warning: ${serverTest.message} Using fallback coordinates.`;
                        statusText.style.color = '#ff9900';
                        statusText.style.display = 'block';
                    } else {
                        console.log('Local server test successful:', serverTest.message);
                    }
                    
                    // Fetch and process the data
                    const result = await generateHeatmap(photographerId, startDate, endDate, mapContainer);
                    
                    // Show the map container if we have results
                    if (result.count > 0) {
                        mapContainer.style.display = 'block';
                        mapActionsContainer.style.display = 'block'; // Show actions buttons
                        // Only update status message if it's not already showing the server warning
                        if (!serverTest.success) {
                            statusText.textContent += ` ${result.message}`;
                        } else {
                            statusText.textContent = result.message || `Displayed ${result.count} sessions on the map.`;
                        statusText.style.color = '#28a745';
                        }
                    } else {
                        mapContainer.style.display = 'none';
                        mapActionsContainer.style.display = 'none';
                        if (!serverTest.success) {
                            statusText.textContent += ` ${result.message}`;
                        } else {
                            statusText.textContent = result.message || 'No sessions found in the selected date range.';
                        statusText.style.color = '#dc3545';
                        }
                    }
                    statusText.style.display = 'block';
                } catch (error) {
                    console.error('Heatmap error:', error);
                    statusText.textContent = 'Error: ' + error.message;
                    statusText.style.color = '#dc3545';
                    statusText.style.display = 'block';
                    mapContainer.style.display = 'none';
                    mapActionsContainer.style.display = 'none';
                } finally {
                    // Hide spinner, restore button
                    spinner.style.display = 'none';
                    heatmapButton.disabled = false;
                }
            });

            buttonContainer.appendChild(heatmapButton);
            buttonContainer.appendChild(spinner);
            
            // Add all components to parent container
            controlsContainer.appendChild(buttonContainer);
            controlsContainer.appendChild(statusText);
            controlsContainer.appendChild(mapContainer);
            controlsContainer.appendChild(mapActionsContainer);
            parentContainer.appendChild(controlsContainer);
            
            // Load photographers list when tool renders
            loadPhotographers(photographerSelect);
        }
    };
    
    /**
     * Format a date object to YYYY-MM-DD format for input fields
     */
    function formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }
    
    /**
     * Load photographers from Pixifi API and populate the dropdown
     */
    async function loadPhotographers(selectElement) {
        try {
            // Using the staff listing API instead of photographers API
            const response = await fetch("https://www.pixifi.com/admin/fn/staff/getStaffMainListing/", {
                method: "POST",
                headers: {
                    "accept": "*/*",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                body: "clientID=12295&view=active",
                credentials: "include"
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch photographers: ${response.statusText}`);
            }
            
            const text = await response.text();
            
            // The response format is: SUCCESS{|} followed by HTML
            if (!text.startsWith('SUCCESS{|}')) {
                throw new Error('Invalid response format from server');
            }
            
            // Extract the HTML part after SUCCESS{|}
            const htmlData = text.substring(text.indexOf('{|}')+3);
            
            // Parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlData, 'text/html');
            
            // Find all staff divs
            const staffDivs = doc.querySelectorAll('div[id^="staff_"]');
            
            // Clear existing options except the first "All Photographers" option
            while (selectElement.options.length > 1) {
                selectElement.remove(1);
            }
            
            // Process each staff entry
            const photographers = [];
            
            staffDivs.forEach(div => {
                try {
                    // Get staff ID from div
                    const staffId = div.id.replace('staff_', '');
                    
                    // Get name from the strong element
                    const nameElement = div.querySelector('.floatGrid strong');
                    
                    if (nameElement) {
                        // Extract the name and position
                        let fullText = nameElement.textContent.trim();
                        
                        // Format is typically: "number Name (Position)"
                        // Extract the name part
                        let name = fullText;
                        
                        // Remove any leading numbers and spaces
                        name = name.replace(/^\d+\s+/, '');
                        
                        // Remove position in parentheses if present
                        const positionIndex = name.lastIndexOf('(');
                        if (positionIndex > 0) {
                            name = name.substring(0, positionIndex).trim();
                        }
                        
                        // Only add actual photographers - look for specific roles or categories
                        // This might need adjustment based on your specific categorization
                        const isPhotographer = fullText.includes('Photographer') || 
                                               fullText.includes('CHICAGO') || 
                                               fullText.includes('Commission');
                        
                        if (isPhotographer) {
                            photographers.push({
                                id: staffId,
                                name: name
                            });
                        }
                    }
                } catch (err) {
                    console.error('Error parsing staff entry:', err);
                }
            });
            
            // Sort photographers by name
            photographers.sort((a, b) => a.name.localeCompare(b.name));
            
            // Add photographers to dropdown
            photographers.forEach(photographer => {
                const option = document.createElement('option');
                option.value = photographer.id;
                option.textContent = photographer.name;
                selectElement.appendChild(option);
            });
            
            // If we couldn't find any photographers with our filter, fall back to showing all staff
            if (photographers.length === 0) {
                console.warn('No photographers found, showing all staff instead');
                
                // Clear again
                while (selectElement.options.length > 1) {
                    selectElement.remove(1);
                }
                
                // Add all staff 
                staffDivs.forEach(div => {
                    try {
                        const staffId = div.id.replace('staff_', '');
                        const nameElement = div.querySelector('.floatGrid strong');
                        
                        if (nameElement) {
                            let fullText = nameElement.textContent.trim();
                            let name = fullText.replace(/^\d+\s+/, '');
                            
                            const positionIndex = name.lastIndexOf('(');
                            if (positionIndex > 0) {
                                name = name.substring(0, positionIndex).trim();
                            }
                            
                            const option = document.createElement('option');
                            option.value = staffId;
                            option.textContent = name;
                            selectElement.appendChild(option);
                        }
                    } catch (err) {
                        console.error('Error parsing staff entry (fallback):', err);
                    }
                });
            }
            
            console.log(`Loaded ${selectElement.options.length - 1} photographers/staff members`);
            
        } catch (error) {
            console.error('Error loading photographers:', error);
            
            // Add a default option to indicate error
            const errorOption = document.createElement('option');
            errorOption.value = "";
            errorOption.textContent = "Error loading photographers";
            errorOption.disabled = true;
            selectElement.appendChild(errorOption);
        }
    }
    
    /**
     * Fetch sessions from the Pixifi API
     */
    async function fetchSessionData(photographerId, startDate, endDate) {
        console.log(`Fetching session data from ${startDate} to ${endDate}`);
        
        // Parse start and end dates
        const startDateTime = new Date(startDate);
        const endDateTime = new Date(endDate);
        
        console.log(`Parsed date range: ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);
        
        // Generate all month/year combinations in the date range
        const monthYearCombinations = [];
        const currentDate = new Date(startDateTime);
        
        while (currentDate <= endDateTime) {
            const year = currentDate.getFullYear();
            // getMonth() is 0-indexed, so add 1 to get 1-12 format
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            
            monthYearCombinations.push({ year, month });
            
            // Move to the next month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        console.log(`Generated ${monthYearCombinations.length} month/year combinations for API requests:`);
        console.log(monthYearCombinations.map(c => `${c.month}/${c.year}`).join(', '));
        
        // Collect all events across all month/year combinations
        let allEvents = [];
        let monthEventsCount = {}; // Track events per month for debugging
        
        for (const { year, month } of monthYearCombinations) {
            // Build request parameters for this month/year
        const params = new URLSearchParams({
            clientID: "12295",
            person: photographerId || "",
            brands: "none||11473||15793||18826||19647||11634||17159||14652||17956||21064||17187||15121||17999||18626||19691",
            type: "",
            event_status: "",
            staff_category: "",
            categories: "",
            categoryType: "any",
            view: "month",
                month: month,
                year: year
            });
            
            console.log(`Fetching sessions for ${month}/${year}`);
            
            try {
                // Fetch the data for this month/year
        const response = await fetch("https://www.pixifi.com/admin/fn/events/getAllEventsJson/", {
            method: "POST",
            headers: {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "accept": "*/*"
                    },
            body: params.toString(),
            credentials: "include"
        });
        
        if (!response.ok) {
                    console.error(`API request failed for ${month}/${year}: ${response.status}`);
                    continue; // Skip this month but continue with others
                }
                
                // Extract the response content
                const text = await response.text();
                
                // Handle the response format
                // The response format is: SUCCESS{|}<JSON data>{|}<HTML>
                // Extract the JSON data
                const parts = text.split("{|}");
                if (parts.length < 2 || parts[0] !== "SUCCESS") {
                    console.error(`Invalid response format for ${month}/${year}`);
                    continue;
                }
                
                const jsonData = parts[1];
                const events = JSON.parse(jsonData);
                
                // Filter out "Unavailable" events
                const realEvents = events.filter(event => event.title !== "Unavailable" && event.id !== "");
                
                console.log(`Received ${events.length} total events, ${realEvents.length} real events for ${month}/${year}`);
                monthEventsCount[`${month}/${year}`] = realEvents.length;
                
                // Add to the collection
                allEvents = allEvents.concat(realEvents);
            } catch (error) {
                console.error(`Error fetching data for ${month}/${year}:`, error);
                // Continue with the next month/year
            }
        }
        
        console.log(`Total events across all months: ${allEvents.length}`);
        console.log(`Events per month:`, monthEventsCount);
        
        // Check for duplicates by ID
        const uniqueIds = new Set();
        const duplicateIds = new Set();
        
        allEvents.forEach(event => {
            if (uniqueIds.has(event.id)) {
                duplicateIds.add(event.id);
        } else {
                uniqueIds.add(event.id);
            }
        });
        
        console.log(`Found ${duplicateIds.size} duplicate event IDs`);
        if (duplicateIds.size > 0) {
            console.log(`First 5 duplicate IDs: ${Array.from(duplicateIds).slice(0, 5).join(', ')}`);
        }
        
        // Filter events by date range
        const filteredEvents = allEvents.filter(event => {
            try {
                // Get the event date as YYYY-MM-DD string first
                const eventDateStr = event.start.split('T')[0];
                
                // Create date objects with the date parts only (no time component)
                const eventDate = new Date(eventDateStr);
                
                // Set time to midnight for clean date comparison (without time components)
                eventDate.setHours(0, 0, 0, 0);
                
                // Create date objects for range limits with time set to start/end of day
                const rangeStart = new Date(startDate);
                rangeStart.setHours(0, 0, 0, 0);
                
                const rangeEnd = new Date(endDate);
                rangeEnd.setHours(23, 59, 59, 999);
                
                // Use inclusive range for both start and end dates
                const isInRange = eventDate >= rangeStart && eventDate <= rangeEnd;
                
                if (!isInRange) {
                    console.log(`Event outside range: ${event.title} on ${eventDateStr}`);
                }
                
                return isInRange;
            } catch (error) {
                console.error('Error parsing event date:', error, event);
                return false;
            }
        });
        
        console.log(`Filtered to ${filteredEvents.length} events in the exact date range`);
        
        // Deduplicate events by ID before processing
        const eventMap = new Map();
        filteredEvents.forEach(event => {
            eventMap.set(event.id, event);
        });
        
        // Convert back to array
        const uniqueEvents = Array.from(eventMap.values());
        console.log(`Deduplicated events: ${filteredEvents.length} → ${uniqueEvents.length} (removed ${filteredEvents.length - uniqueEvents.length} duplicates)`);
        
        // Extract session data from the events
        const sessions = [];
        let urlDecodeErrors = 0;
        
        uniqueEvents.forEach(event => {
            try {
                // Skip events without a URL (which contains the event details)
                if (!event.url) {
                    console.log(`Event has no URL: ${event.id} - ${event.title}`);
                    return;
                }
                
                // Extract session details from the event URL
                // The URL is base64-encoded JSON with event details
                const decodedData = decodeURIComponent(event.url);
                const jsonStr = atob(decodedData);
                const eventData = JSON.parse(jsonStr);
                
                // Skip events without a client ID
                if (!eventData.customerID) {
                    console.log(`Event has no customer ID: ${event.id} - ${event.title}`);
                    return;
                }
                
                // Create a format-friendly date from the event start time
                const eventDate = new Date(event.start);
                const formattedDate = eventDate.toISOString().split('T')[0];
                
                sessions.push({
                    id: eventData.eventID,
                    name: eventData.eventName,
                    date: formattedDate,
                    clientId: eventData.customerID,
                    clientName: eventData.customerName
                });
            } catch (error) {
                console.error('Error processing event:', error, event);
                urlDecodeErrors++;
            }
        });
        
        console.log(`Session extraction summary:
        - ${uniqueEvents.length} unique events in date range
        - ${sessions.length} sessions with client IDs
        - ${urlDecodeErrors} URL decode errors`);
        
        // Now fetch client data to get zip codes
        const sessionsWithZip = await fetchClientZipCodes(sessions);
        
        // Print ALL sessions with full details for debugging
        console.log('COMPLETE SESSION LIST:');
        console.log(sessionsWithZip);
        
        return sessionsWithZip;
    }

    /**
     * Fetch client data to extract zip codes
     */
    async function fetchClientZipCodes(sessions) {
        console.log(`Fetching zip codes for ${sessions.length} clients`);

        const clientCache = {}; // Cache to avoid duplicate requests
        const sessionsWithZip = [];
        let successCount = 0;
        let failCount = 0;

        // Process in batches to avoid overwhelming the server
        const batchSize = 5;
        const batches = Math.ceil(sessions.length / batchSize);

        for (let i = 0; i < batches; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, sessions.length);
            const batch = sessions.slice(start, end);

            console.log(`Processing batch ${i+1}/${batches} (${batch.length} sessions)`);

            // Process each session in the batch concurrently
            const promises = batch.map(async (session) => {
                try {
                    const clientId = session.clientId;

                    // Check cache first
                    if (clientCache[clientId]) {
                        console.log(`Using cached zip code ${clientCache[clientId].zipCode} for client ${clientId}`);
                        return {
                            ...session,
                            zipCode: clientCache[clientId].zipCode
                        };
                    }

                    console.log(`Fetching data for client ${clientId}`);

                    // Fetch client page
                    const response = await fetch(`https://www.pixifi.com/admin/clients/${clientId}/`, {
                        method: "GET",
                        headers: {
                            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                            "cache-control": "max-age=0",
                            "sec-fetch-dest": "document",
                            "sec-fetch-mode": "navigate",
                            "sec-fetch-site": "same-origin"
                        },
                        credentials: "include"
                    });

                    if (!response.ok) {
                        console.error(`Failed to fetch client ${clientId}: ${response.status}`);
                        failCount++;
                        return null;
                    }

                    const html = await response.text();
                    console.log(`Received client page for ${clientId} (${html.length} bytes)`);

                    // Extract zip code from HTML
                    // Look for the pattern: data-value="{address:'....',postal: 'XXXXX',
                    const zipRegex = /data-value="\{.*?postal:\s*['"](\d{5})['"].*?\}"/i;
                    const zipMatch = html.match(zipRegex);

                    if (zipMatch && zipMatch[1]) {
                        const zipCode = zipMatch[1];
                        console.log(`Found zip code ${zipCode} for client ${clientId}`);

                        // Cache the result
                        clientCache[clientId] = { zipCode };

                        successCount++;
                        return {
                            ...session,
                            zipCode
                        };
                        } else {
                        console.warn(`No zip code found in client page for ${clientId}`);

                        // Try an alternative pattern
                        const altZipRegex = /custZip.*?>(\d{5})</i;
                        const altMatch = html.match(altZipRegex);

                        if (altMatch && altMatch[1]) {
                            const zipCode = altMatch[1];
                            console.log(`Found zip code ${zipCode} with alternative pattern for client ${clientId}`);

                            // Cache the result
                            clientCache[clientId] = { zipCode };

                            successCount++;
                            return {
                                ...session,
                                zipCode
                            };
                        }

                        failCount++;
                        return null;
                    }
                } catch (error) {
                    console.error(`Error fetching client ${session.clientId}:`, error);
                    failCount++;
                    return null;
                }
            });

            // Wait for all promises in this batch to resolve
            const results = await Promise.all(promises);

            // Add valid results to the final array
            results.forEach(result => {
                if (result) {
                    sessionsWithZip.push(result);
                }
            });

            // Add a small delay between batches to be kind to the server
            if (i < batches - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`Client zip code fetch summary:
        - ${sessions.length} input sessions
        - ${successCount} successful zip lookups
        - ${failCount} failed zip lookups
        - ${sessionsWithZip.length} sessions with zip codes`);

        return sessionsWithZip;
    }
    
    /**
     * Convert MM/DD/YYYY to MM/DD/YYYY format for the API
     */
    function formatDateForAPI(dateStr) {
        // The date string from the input will be in YYYY-MM-DD format
        // Convert to MM/DD/YYYY format for the API
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
    }
    
    /**
     * Geocode a zip code to lat/lng coordinates using local service
     */
    async function geocodeZipCode(zipCode) {
        // Use the local geocoding endpoint on port 5000 (test server)
        const localEndpoint = 'http://localhost:5000/geocode-zip';

        // Check if we've already detected a server failure
        if (window.localServerFailed) {
            console.log(`Local server previously failed, using fallback coordinates for ${zipCode}`);
            return getFallbackCoordinates(zipCode);
        }

        try {
            console.log(`Attempting to geocode ${zipCode} using local endpoint: ${localEndpoint}`);

            // Use GM_xmlhttpRequest to bypass CORS
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    console.log(`Using GM_xmlhttpRequest to bypass CORS for ${zipCode}`);

                    // Set a timeout for the request
                    const timeoutId = setTimeout(() => {
                        console.error(`Request timed out for ${zipCode}`);
                        window.localServerFailed = true;
                        resolve(getFallbackCoordinates(zipCode));
                    }, 3000); // 3 second timeout

                    GM_xmlhttpRequest({
                method: 'GET',
                        url: `${localEndpoint}?zip=${zipCode}`,
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        onload: function(response) {
                            clearTimeout(timeoutId);
                            console.log(`Response for ${zipCode}: status=${response.status}, text=${response.responseText ? response.responseText.substring(0, 100) : "empty"}`);

                            if (response.status >= 200 && response.status < 300) {
                                try {
                                    const data = JSON.parse(response.responseText);
                if (data.lat && data.lng) {
                    console.log(`Successfully geocoded ${zipCode} using local endpoint:`, data);
                                        resolve({ lat: data.lat, lng: data.lng });
                                    } else {
                                        console.error(`Local endpoint returned invalid data for ${zipCode}:`, data);
                                        resolve(getFallbackCoordinates(zipCode));
                                    }
                                } catch (e) {
                                    console.error(`Error parsing JSON from local endpoint:`, e);
                                    console.error(`Response text:`, response.responseText);
                                    resolve(getFallbackCoordinates(zipCode));
                }
            } else {
                                // Log response for debugging
                                console.error(`Local endpoint returned status ${response.status} for ${zipCode}`);
                                console.error(`Response text:`, response.responseText);

                                // Mark server as failed if we get consistent 404s
                                if (response.status === 404) {
                                    console.warn(`Endpoint ${localEndpoint} not found. Check if your Flask server is running and the endpoint is correct.`);
                                    window.localServerFailed = true;
                                }

                                resolve(getFallbackCoordinates(zipCode));
                            }
                        },
                        onerror: function(error) {
                            clearTimeout(timeoutId);
                            console.error(`GM_xmlhttpRequest error for ${zipCode}:`, error);
                            console.warn(`This could be a CORS issue. Check if your Flask server has CORS properly configured.`);
                            window.localServerFailed = true;
                            resolve(getFallbackCoordinates(zipCode));
                        },
                        ontimeout: function() {
                            clearTimeout(timeoutId);
                            console.error(`GM_xmlhttpRequest timed out for ${zipCode}`);
                            window.localServerFailed = true;
                            resolve(getFallbackCoordinates(zipCode));
                        }
                    });
                } else {
                    // Fallback to hardcoded coordinates if GM_xmlhttpRequest is not available
                    console.log(`GM_xmlhttpRequest not available, using fallback for ${zipCode}`);
                    resolve(getFallbackCoordinates(zipCode));
                }
            });
        } catch (error) {
            console.error(`Error in geocodeZipCode for ${zipCode}:`, error);
            return getFallbackCoordinates(zipCode);
        }
    }

    /**
     * Get fallback coordinates for common zip codes or a default
     */
    function getFallbackCoordinates(zipCode) {
        // Fallback coordinates for common zip codes
        const fallbackMap = {
            // Dallas area
            '75001': { lat: 32.9678, lng: -96.8891 }, // Addison
            '75033': { lat: 33.1471, lng: -96.8945 }, // Frisco
            '75034': { lat: 33.1471, lng: -96.8945 }, // Frisco
            '75035': { lat: 33.1471, lng: -96.8945 }, // Frisco
            '75036': { lat: 33.1471, lng: -96.8945 }, // Frisco
            '75078': { lat: 33.2928, lng: -96.9471 }, // Prosper
            '75093': { lat: 33.0247, lng: -96.8081 }, // Plano
            '76227': { lat: 33.292, lng: -96.9879 },  // Aubrey

            // Houston area
            '77001': { lat: 29.7604, lng: -95.3698 }, // Houston

            // Austin area
            '78701': { lat: 30.2672, lng: -97.7431 }, // Austin

            // San Antonio area
            '78201': { lat: 29.4241, lng: -98.5012 }, // San Antonio
        };

        if (fallbackMap[zipCode]) {
            console.log(`Using fallback coordinates for zip ${zipCode}:`, fallbackMap[zipCode]);
            return fallbackMap[zipCode];
        }

        // If no specific fallback for this zip code, use a default Texas location
        console.log(`No specific fallback for ${zipCode}, using Dallas as default`);
        return { lat: 32.7767, lng: -96.7970 }; // Default to Dallas
    }
    
    /**
     * Process the session data and prepare for heatmap visualization
     */
    async function processSessionDataForHeatmap(sessions) {
        console.log(`Processing ${sessions.length} sessions for heatmap`);
        const geoPoints = [];
        const zipCache = {};
        let successfulPoints = 0;
        let failedPoints = 0;

        // Create lists to track zip codes for debugging
        const successfulZips = [];
        const failedZips = [];
        const allSessionZips = [];
        
        // Process each session and get coordinates
        for (const session of sessions) {
            try {
                const zipCode = session.zipCode;
                allSessionZips.push(zipCode);
                let coordinates;
                
                console.log(`Processing session ${session.id} with zip code ${zipCode}`);
                
                // Check cache first to avoid duplicate geocoding requests
                if (zipCache[zipCode]) {
                    console.log(`Using cached coordinates for zip ${zipCode}`);
                    coordinates = zipCache[zipCode];
                } else {
                    console.log(`Geocoding zip code ${zipCode}`);
                    coordinates = await geocodeZipCode(zipCode);
                    if (coordinates) {
                        console.log(`Geocoded ${zipCode} to coordinates:`, coordinates);
                        zipCache[zipCode] = coordinates;
                    } else {
                        console.warn(`Failed to geocode zip code ${zipCode}`);
                        failedPoints++;
                        failedZips.push(zipCode);
                    }
                }
                
                if (coordinates) {
                    // Format for Leaflet.heat: [lat, lng, intensity]
                    geoPoints.push([coordinates.lat, coordinates.lng, 1]);
                    successfulPoints++;
                    successfulZips.push(zipCode);
                }
            } catch (error) {
                failedPoints++;
                failedZips.push(session.zipCode);
                console.error(`Error processing session ${session.id}:`, error);
            }
        }
        
        // Count unique zip codes
        const uniqueAllZips = [...new Set(allSessionZips)].length;
        const uniqueSuccessfulZips = [...new Set(successfulZips)].length;
        const uniqueFailedZips = [...new Set(failedZips)].length;

        console.log(`Heatmap generation summary:
        - ${sessions.length} input sessions with ${uniqueAllZips} unique zip codes
        - ${successfulPoints} successful geocodes (${uniqueSuccessfulZips} unique zip codes)
        - ${failedPoints} failed geocodes (${uniqueFailedZips} unique zip codes)
        - ${geoPoints.length} data points for heatmap`);

        // Log details about successful and failed zip codes
        console.log("Successfully geocoded zip codes:", successfulZips.join(", "));
        console.log("Failed to geocode zip codes:", failedZips.join(", "));

        if (geoPoints.length > 0) {
            console.log('Sample data point:', geoPoints[0]);
        } else {
            console.warn('No heatmap data points were generated. Check previous errors for details.');
        }

        // For testing, if no points were generated but we have sessions, create a dummy point
        if (geoPoints.length === 0 && sessions.length > 0) {
            console.log('Adding fallback test point to prevent empty map');
            // Dallas coordinates as a fallback
            geoPoints.push([32.7767, -96.7970, 1]);
        }
        
        return geoPoints;
    }
    
    /**
     * Display the heatmap using Leaflet.js
     */
    function displayHeatmap(mapContainer, heatmapData) {
        // Store map instance in a global variable to properly clean it up
        if (window.currentHeatmap) {
            console.log('Removing existing map instance');
            window.currentHeatmap.remove();
            window.currentHeatmap = null;
        }

        // Clear previous map if it exists
        mapContainer.innerHTML = '';
        
        // Ensure the container is visible and has dimensions
        mapContainer.style.display = 'block';
        
        // Optionally force a reflow to ensure dimensions are applied
        void mapContainer.offsetWidth;
        
        console.log('Creating new map instance');
        // Create a new map
        const map = L.map(mapContainer).setView([32.7767, -96.7970], 7); // Default to Dallas area

        // Store the map instance for cleanup later
        window.currentHeatmap = map;
        
        // Add the base tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        try {
            // Process data for markers
            const coordinateGroups = {};
            let uniqueCoordinateCount = 0;
            
            // Group coordinates that are at the same location
            heatmapData.forEach(point => {
                const key = `${point[0]},${point[1]}`;
                if (!coordinateGroups[key]) {
                    coordinateGroups[key] = [];
                    uniqueCoordinateCount++;
                }
                coordinateGroups[key].push(point);
            });
            
            console.log(`Found ${uniqueCoordinateCount} unique coordinate groups from ${heatmapData.length} total points`);

            // Function to create heat layer with retry limit
            let heatLayerRetries = 0;
            const MAX_HEAT_RETRIES = 10; // Limit retries to avoid infinite loop
            
            function createHeatLayer(heatRadius) {
                // Check if heat layer function exists
                if (typeof L.heatLayer !== 'function') {
                    heatLayerRetries++;
                    if (heatLayerRetries > MAX_HEAT_RETRIES) {
                        console.error(`L.heatLayer still not available after ${MAX_HEAT_RETRIES} retries. Heat layer disabled.`);
                        return null;
                    }
                    
                    console.warn(`L.heatLayer not available yet. Retry ${heatLayerRetries}/${MAX_HEAT_RETRIES}...`);
                    setTimeout(() => createHeatLayer(heatRadius), 500); // Retry after delay
                    return null;
                }

                console.log('Creating heat layer with radius:', heatRadius);
                
                // Remove existing heat layer if any
                if (window.currentHeatLayer) {
                    try {
                        map.removeLayer(window.currentHeatLayer);
                    } catch (removeError) {
                        console.warn('Could not remove previous heat layer:', removeError);
                    }
                }

                try {
                    const heatLayer = L.heatLayer(heatmapData, {
                        radius: heatRadius,
                        blur: 15,
                        maxZoom: 10,
                        gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
                    });

                    heatLayer.addTo(map);
                    window.currentHeatLayer = heatLayer; // Store reference to the current layer
                    return heatLayer;
                } catch (heatmapError) {
                    console.error('Could not add heatmap layer:', heatmapError);
                    window.currentHeatLayer = null;
                    return null;
                }
            }

            // Create size control panel in the top-right corner
            const sizeControlDiv = document.createElement('div');
            Object.assign(sizeControlDiv.style, {
                position: 'absolute',
                top: '10px',
                right: '10px',
                backgroundColor: 'white',
                padding: '10px',
                borderRadius: '4px',
                boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
                width: '220px',
                zIndex: '1000'
            });
            
            // Heat radius control
            const heatRadiusContainer = document.createElement('div');
            heatRadiusContainer.style.marginBottom = '10px';
            
            const heatRadiusLabel = document.createElement('label');
            heatRadiusLabel.textContent = 'Heat radius: ';
            heatRadiusLabel.style.fontSize = '12px';
            heatRadiusLabel.style.fontWeight = 'bold';
            heatRadiusLabel.style.display = 'block';
            heatRadiusLabel.style.marginBottom = '3px';
            
            const heatRadiusValue = document.createElement('span');
            heatRadiusValue.textContent = '25';
            heatRadiusValue.style.fontSize = '12px';
            heatRadiusValue.style.marginLeft = '5px';
            
            const heatRadiusSlider = document.createElement('input');
            heatRadiusSlider.type = 'range';
            heatRadiusSlider.min = '5';
            heatRadiusSlider.max = '50';
            heatRadiusSlider.value = '25';
            heatRadiusSlider.style.width = '100%';
            heatRadiusSlider.id = 'heatmap-heat-radius';
            
            heatRadiusContainer.appendChild(heatRadiusLabel);
            heatRadiusLabel.appendChild(heatRadiusValue);
            heatRadiusContainer.appendChild(heatRadiusSlider);
            
            // Marker radius control
            const markerRadiusContainer = document.createElement('div');
            
            const markerRadiusLabel = document.createElement('label');
            markerRadiusLabel.textContent = 'Marker radius: ';
            markerRadiusLabel.style.fontSize = '12px';
            markerRadiusLabel.style.fontWeight = 'bold';
            markerRadiusLabel.style.display = 'block';
            markerRadiusLabel.style.marginBottom = '3px';
            
            const markerRadiusValue = document.createElement('span');
            markerRadiusValue.textContent = '8';
            markerRadiusValue.style.fontSize = '12px';
            markerRadiusValue.style.marginLeft = '5px';
            
            const markerRadiusSlider = document.createElement('input');
            markerRadiusSlider.type = 'range';
            markerRadiusSlider.min = '2';
            markerRadiusSlider.max = '15';
            markerRadiusSlider.value = '8';
            markerRadiusSlider.style.width = '100%';
            markerRadiusSlider.id = 'heatmap-marker-radius';
            
            markerRadiusContainer.appendChild(markerRadiusLabel);
            markerRadiusLabel.appendChild(markerRadiusValue);
            markerRadiusContainer.appendChild(markerRadiusSlider);
            
            // Add controls to the container
            sizeControlDiv.appendChild(heatRadiusContainer);
            sizeControlDiv.appendChild(markerRadiusContainer);
            
            // Add the control div to the map container
            mapContainer.appendChild(sizeControlDiv);
            
            // Create zone control panel
            const zoneControlDiv = document.createElement('div');
            Object.assign(zoneControlDiv.style, {
                position: 'absolute',
                top: '10px',
                left: '10px',
                backgroundColor: 'white',
                padding: '10px',
                borderRadius: '4px',
                boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
                maxWidth: '220px',
                zIndex: '1000',
                maxHeight: '300px', // Initial max height
                overflow: 'hidden', // Hide overflow initially
                transition: 'max-height 0.3s ease' // Smooth transition
            });
            zoneControlDiv.classList.add('collapsed'); // Start collapsed
            zoneControlDiv.style.maxHeight = '35px'; // Height for just the header

            // Header for zones (clickable toggle)
            const zoneHeader = document.createElement('div');
            zoneHeader.innerHTML = 'Photographer Zones <span class="toggle-icon">+</span>'; // Add toggle icon
            Object.assign(zoneHeader.style, {
                fontWeight: 'bold',
                marginBottom: '5px',
                cursor: 'pointer'
            });
            zoneControlDiv.appendChild(zoneHeader);

            // Container for the zone checkboxes (initially hidden by maxHeight)
            const zonesContainer = document.createElement('div');
            zonesContainer.style.overflowY = 'auto'; // Enable scrolling when expanded
            zonesContainer.style.maxHeight = 'calc(300px - 40px)'; // Max height calculation

            // Loading message
            const loadingMsg = document.createElement('div');
            loadingMsg.textContent = 'Loading zones...';
            loadingMsg.style.fontSize = '12px';
            loadingMsg.style.fontStyle = 'italic';
            zonesContainer.appendChild(loadingMsg);
            zoneControlDiv.appendChild(zonesContainer);

            // Toggle functionality
            zoneHeader.addEventListener('click', () => {
                zoneControlDiv.classList.toggle('collapsed');
                const icon = zoneHeader.querySelector('.toggle-icon');
                if (zoneControlDiv.classList.contains('collapsed')) {
                    zoneControlDiv.style.maxHeight = '35px'; // Collapse to header height
                    icon.textContent = '+';
                } else {
                    zoneControlDiv.style.maxHeight = '300px'; // Expand
                    icon.textContent = '-';
                }
            });

            // Add zone control to map
            mapContainer.appendChild(zoneControlDiv);
            
            // Add controls for fullscreen and export
            const controlDiv = document.createElement('div');
            Object.assign(controlDiv.style, {
                position: 'absolute',
                bottom: '10px',
                right: '10px', 
                zIndex: '1000',
                display: 'flex',
                gap: '10px'
            });
            
            // Fullscreen button
            const fullscreenBtn = document.createElement('button');
            Object.assign(fullscreenBtn.style, {
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '14px'
            });
            fullscreenBtn.textContent = 'View Fullscreen';
            fullscreenBtn.onclick = () => openMapInFullscreen(mapContainer);
            
            // Export as image button
            const exportBtn = document.createElement('button');
            Object.assign(exportBtn.style, {
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '14px'
            });
            exportBtn.textContent = 'Export as Image';
            exportBtn.onclick = () => exportMapAsImage(mapContainer);
            
            // Add buttons to control div
            controlDiv.appendChild(fullscreenBtn);
            controlDiv.appendChild(exportBtn);
            
            // Add control div to map container
            mapContainer.appendChild(controlDiv);
            
            // Store layer groups for zones
            const zoneLayerGroups = {};
            
            // Function to create markers with proper grouping and jittering for overlaps
            function createMarkers(markerRadius) {
                // Create feature group for all markers
                const markerGroup = L.featureGroup();
                
                // Select different colors for multiple markers at the same location
                const markerColors = ['red', 'blue', 'green', 'purple', 'orange', 'yellow', 'brown', 'pink', 'teal', 'lime'];
                
                // Track markers added to calculate bounds later
                let markersAdded = 0;
                
                // Create markers for each coordinate group
                Object.entries(coordinateGroups).forEach(([coordKey, points], groupIndex) => {
                    const [lat, lng] = coordKey.split(',').map(Number);
                    
                    // If there's only one point at this location, add a simple marker
                    if (points.length === 1) {
                        const marker = L.circleMarker([lat, lng], {
                            radius: markerRadius,
                            fillColor: markerColors[0], 
                            color: '#000',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                        
                        // Create popup with information
                        const popupContent = points[0][2] ? points[0][2] : `Session at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        marker.bindPopup(popupContent);
                        
                        // Add to marker group
                        markerGroup.addLayer(marker);
                        markersAdded++;
                    } 
                    // For multiple points at the same location, create a spiral pattern
                    else {
                        // Create a popup showing count of overlapping sessions
                        const mainMarker = L.circleMarker([lat, lng], {
                            radius: markerRadius + 2, // Slightly larger to indicate multiple
                            fillColor: 'red', 
                            color: '#000',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                        
                        // Create a popup with count of sessions at this location
                        mainMarker.bindPopup(`${points.length} sessions at this location`);
                        markerGroup.addLayer(mainMarker);
                        markersAdded++;
                        
                        // Add individual markers in a spiral pattern around the main point
                        const spiralAngleStep = (Math.PI * 2) / points.length;
                        const spiralDistanceStep = markerRadius / 2;
                        
                        points.forEach((point, idx) => {
                            // Skip the first point (already represented by main marker)
                            if (idx === 0) return;
                            
                            // Calculate spiral coordinates
                            const angle = idx * spiralAngleStep;
                            const distance = spiralDistanceStep * (idx + 1) * 0.01; // Convert to degrees approx
                            
                            // Create offset coordinates
                            const offsetLat = lat + (Math.sin(angle) * distance);
                            const offsetLng = lng + (Math.cos(angle) * distance);
                            
                            // Create marker with appropriate color
                            const marker = L.circleMarker([offsetLat, offsetLng], {
                                radius: markerRadius,
                                fillColor: markerColors[idx % markerColors.length],
                                color: '#000',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.8
                            });
                            
                            // Create popup with information
                            const popupContent = point[2] ? point[2] : `Session ${idx+1} at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                            marker.bindPopup(popupContent);
                            
                            // Add to marker group
                            markerGroup.addLayer(marker);
                            markersAdded++;
                        });
                    }
                });
                
                console.log(`Added ${markersAdded} markers to the map`);
                
                // Add marker group to map
                markerGroup.addTo(map);
                
                // Fit map to show all markers
                if (markerGroup.getLayers().length > 0) {
                    map.fitBounds(markerGroup.getBounds(), { padding: [50, 50] });
                }
                
                return markerGroup;
            }
            
            // Initial creation of marker and heat layers
            const markerGroup = createMarkers(parseInt(markerRadiusSlider.value));
            createHeatLayer(parseInt(heatRadiusSlider.value)); // Initial call

            // Fit map to show all markers
            setTimeout(() => {
                map.invalidateSize();
                if (markerGroup && markerGroup.getLayers().length > 0) {
                     try {
                        map.fitBounds(markerGroup.getBounds(), { padding: [50, 50] });
                     } catch (fitBoundsError) {
                         console.warn('Error fitting map bounds:', fitBoundsError);
                     }
                }
            }, 100);

            // Add event listeners for heat radius slider
            heatRadiusSlider.addEventListener('input', function() {
                heatRadiusValue.textContent = this.value;
                createHeatLayer(parseInt(this.value)); // Call on slider change
            });
            
            // Add event listeners for marker radius slider
            markerRadiusSlider.addEventListener('input', function() {
                markerRadiusValue.textContent = this.value;
                
                // Remove previous markers
                map.eachLayer(layer => {
                    if (layer instanceof L.CircleMarker) {
                        map.removeLayer(layer);
                    }
                });
                
                // Create new markers with updated radius
                createMarkers(parseInt(this.value));
            });
            
            // Load and add zones
            loadZonesFromKML()
                .then(zones => {
                    // This block executes when loadZonesFromKML() succeeds
                    console.log('Zones loaded, updating UI', zones);
                    zonesContainer.innerHTML = ''; // Clear loading message

                    if (!zones || zones.length === 0) {
                        const noZonesMsg = document.createElement('div');
                        noZonesMsg.textContent = 'No zones found';
                        noZonesMsg.style.fontSize = '12px';
                        noZonesMsg.style.fontStyle = 'italic';
                        zonesContainer.appendChild(noZonesMsg);
                        mapContainer.dataset.zonesData = JSON.stringify([]);
                        return; // Exit the .then() callback
                    }

                    // Store zones data on the map container for fullscreen access
                    mapContainer.dataset.zonesData = JSON.stringify(zones);

                    // Add checkboxes for each zone to the zonesContainer
                    zones.forEach(zone => {
                        const zoneContainer = document.createElement('div');
                        zoneContainer.style.marginBottom = '5px';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `zone-${zone.name.replace(/\s+/g, '-')}`;
                        checkbox.style.marginRight = '5px';

                        const label = document.createElement('label');
                        label.htmlFor = checkbox.id;
                        label.textContent = zone.name;
                        label.style.fontSize = '12px';

                        const colorIndicator = document.createElement('span');
                        colorIndicator.style.display = 'inline-block';
                        colorIndicator.style.width = '12px';
                        colorIndicator.style.height = '12px';
                        colorIndicator.style.backgroundColor = zone.color;
                        colorIndicator.style.marginLeft = '5px';
                        colorIndicator.style.border = '1px solid #000';

                        zoneContainer.appendChild(checkbox);
                        zoneContainer.appendChild(label);
                        zoneContainer.appendChild(colorIndicator);
                        zonesContainer.appendChild(zoneContainer);

                        const zoneLayerGroups = {}; // Ensure this is defined if needed here or move scope
                        checkbox.addEventListener('change', () => {
                            if (checkbox.checked) {
                                const zoneLayer = L.polygon(zone.coordinates, {
                                    color: zone.color,
                                    fillOpacity: 0.2,
                                    weight: 2
                                });
                                zoneLayer.bindTooltip(zone.name);
                                zoneLayer.addTo(map);
                                zoneLayerGroups[zone.name] = zoneLayer;
                            } else {
                                if (zoneLayerGroups[zone.name]) {
                                    map.removeLayer(zoneLayerGroups[zone.name]);
                                    delete zoneLayerGroups[zone.name];
                                }
                            }
                        });
                    });
                    // End of successful zone processing
                })
                .catch(error => {
                    // This single .catch handles errors from loadZonesFromKML() OR the .then() block above
                    console.error("Error loading or processing zones:", error);
                    zonesContainer.innerHTML = '<div style="font-size:12px; font-style:italic; color:red;">Error loading zones.</div>';
                    mapContainer.dataset.zonesData = JSON.stringify([]); // Store empty array on error
                });

            return map;
        } catch (error) {
            console.error('Error in displayHeatmap:', error);
            // Create a minimal fallback display if there's an error
            try {
                // Simple marker placement as fallback
                heatmapData.forEach(point => {
                    L.marker([point[0], point[1]]).addTo(map);
                });
                
                if (heatmapData.length > 0) {
                    try {
                        const bounds = L.latLngBounds(heatmapData.map(p => [p[0], p[1]]));
                        map.fitBounds(bounds, { padding: [50, 50] });
                    } catch (e) {
                        console.warn('Could not fit bounds:', e);
                    }
                }
            } catch (fallbackError) {
                console.error('Fallback display failed:', fallbackError);
            }
        }

        return map;
    }
    
    /**
     * Main function to generate the heatmap
     */
    async function generateHeatmap(photographerId, startDate, endDate, mapContainer) {
        console.log('Starting heatmap generation with:', { photographerId, startDate, endDate });
        
        try {
        // 1. Fetch session data
        const sessions = await fetchSessionData(photographerId, startDate, endDate);
        console.log(`fetchSessionData returned ${sessions.length} sessions`);
        
        if (sessions.length === 0) {
            console.warn('No sessions found, returning early');
                return { count: 0, message: "No sessions found with zip codes in the selected date range." };
        }
        
        // 2. Process the data for heatmap
        const heatmapData = await processSessionDataForHeatmap(sessions);
        console.log(`processSessionDataForHeatmap returned ${heatmapData.length} data points`);
        
        // 3. Display the heatmap
        if (heatmapData.length > 0) {
            console.log('Displaying heatmap with data points');
            displayHeatmap(mapContainer, heatmapData);
                return {
                    count: heatmapData.length,
                    message: `Found ${sessions.length} sessions with ${heatmapData.length} valid locations.`
                };
        } else {
            console.warn('No heatmap data points generated despite having sessions');
                return {
                    count: 0,
                    message: "Found sessions, but couldn't geocode any locations. Check console for details."
                };
            }
        } catch (error) {
            console.error('Error generating heatmap:', error);
            return {
                count: 0,
                error: error.message,
                message: "Error generating heatmap: " + error.message
            };
        }
    }
    
    /**
     * This is the function called by the click handler
     * It's referenced in the original code but was missing
     */
    async function HeatmapAllCategories(query) {
        alert("This feature has been replaced. Please use the date range and photographer filters to generate a heatmap.");
        return 0;
    }

    /*************************************************************************/
    /* Attempt to register our tool with the SMPT if it exists              */
    /*************************************************************************/
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function tryRegisterHeatmapTool() {
        // Use unsafeWindow to access page's variables when using @grant
        const targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

        if (targetWindow.SMPT && typeof targetWindow.SMPT.registerTool === 'function') {
            console.log('Registering Heatmap Tool with Sweet Me Photography Tools');
            targetWindow.SMPT.registerTool(myHeatmapTool);
        } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            console.log(`Attempt ${attempts}/${MAX_ATTEMPTS} to register with SMPT...`);
            setTimeout(tryRegisterHeatmapTool, 500);
        } else {
            console.warn('Sweet Me Photography Tools not found after multiple attempts. The Heatmap Tool will not be registered.');
        }
    }

    // Wait a moment before trying to register to ensure SMPT has loaded
    setTimeout(tryRegisterHeatmapTool, 1000);

    /**
     * Test the local geocoding server connection
     */
    async function testLocalServer() {
        const localEndpoint = 'http://localhost:5000/geocode-zip';
        const testZip = '75001'; // Use a known test zip code

        console.log(`Testing connection to local server at ${localEndpoint}`);

        // Test with GM_xmlhttpRequest
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${localEndpoint}?zip=${testZip}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    onload: function(response) {
                        console.log(`Server test response: status=${response.status}, text=${response.responseText ? response.responseText.substring(0, 100) : "empty"}`);
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('Server test successful:', data);
                                resolve({
                                    success: true,
                                    message: `Server responded with status ${response.status}`,
                                    data: data
                                });
                            } catch (e) {
                                console.error('Server returned invalid JSON:', e);
                                resolve({
                                    success: false,
                                    message: `Server returned invalid JSON: ${e.message}`,
                                    error: e
                                });
                            }
                        } else {
                            // Try another endpoint with no parameters as a fallback
                            console.log(`Server test failed with status ${response.status}, trying root endpoint...`);
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: 'http://localhost:5000/',
                                onload: function(rootResponse) {
                                    console.log(`Root endpoint response: status=${rootResponse.status}`);
                                    if (rootResponse.status >= 200 && rootResponse.status < 300) {
                                        resolve({
                                            success: false,
                                            message: `Server root endpoint is working (${rootResponse.status}), but geocode-zip endpoint returned ${response.status}`,
                                        });
                                    } else {
                                        resolve({
                                            success: false,
                                            message: `Server is not responding on root endpoint (${rootResponse.status}) or geocode-zip endpoint (${response.status})`,
                                        });
                                    }
                                },
                                onerror: function() {
                                    resolve({
                                        success: false,
                                        message: `Cannot connect to server at all. Check if the server is running.`,
                                    });
                                }
                            });
                        }
                    },
                    onerror: function() {
                        console.error('Server test failed with connection error');
                        resolve({
                            success: false,
                            message: 'Connection to server failed. Check if the server is running.'
                        });
                    }
                });
            });
        } else {
            return {
                success: false,
                message: 'GM_xmlhttpRequest is not available. Cannot test server connection.'
            };
        }
    }

    /**
     * Open the map in a new window for fullscreen viewing
     */
    function openMapInFullscreen(mapContainer) {
        // Create a new window/tab
        const newWindow = window.open('', '_blank', 'width=1000,height=800');
        
        if (!newWindow) {
            alert("Popup blocked! Please allow popups for this site to use the fullscreen feature.");
            return;
        }

        // Get current slider values with fallbacks
        let currentHeatRadius = '25';
        let currentMarkerRadius = '8';

        try {
            const heatSlider = document.querySelector('#heatmap-heat-radius');
            const markerSlider = document.querySelector('#heatmap-marker-radius');

            if (heatSlider) currentHeatRadius = heatSlider.value;
            if (markerSlider) currentMarkerRadius = markerSlider.value;
        } catch (e) {
            console.warn('Could not get current slider values:', e);
        }

        // Get map data including points
        const mapData = extractMapData();
        const mapDataStr = JSON.stringify(mapData);

        // Get PREVIOUSLY loaded zones data from the map container's dataset
        const zonesDataStr = mapContainer.dataset.zonesData || '[]';
        console.log("Passing zones to fullscreen:", zonesDataStr);

        // Create HTML content for the new window
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Session Heatmap - Fullscreen View</title>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <style>
                    body { 
                        margin: 0; 
                        padding: 0; 
                        font-family: Arial, sans-serif;
                    }
                    #map {
                        width: 100%;
                        height: 94vh;
                    }
                    .header {
                        background-color: #333;
                        color: white;
                        padding: 10px;
                        text-align: center;
                        height: 6vh;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .title {
                        font-size: 18px;
                        font-weight: bold;
                    }
                    .export-btn {
                        padding: 5px 10px;
                        background-color: #28a745;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    .control-panel {
                        position: absolute;
                        top: 70px;
                        right: 10px;
                        background: white;
                        padding: 10px;
                        border-radius: 4px;
                        z-index: 1000;
                        width: 220px;
                        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
                    }
                    .slider-container {
                        margin-bottom: 10px;
                    }
                    .slider-label {
                        display: block;
                        font-size: 12px;
                        font-weight: bold;
                        margin-bottom: 3px;
                    }
                    .slider {
                        width: 100%;
                    }
                    .slider-value {
                        font-size: 12px;
                        margin-left: 5px;
                    }
                    .zone-panel {
                        position: absolute;
                        top: 70px;
                        left: 10px;
                        background: white;
                        padding: 10px;
                        border-radius: 4px;
                        z-index: 1000;
                        max-width: 220px;
                        max-height: 300px; /* Expanded max height */
                        overflow: hidden; /* Hide overflow */
                        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
                        transition: max-height 0.3s ease;
                    }
                    .zone-panel.collapsed {
                        max-height: 35px; /* Height for just the header */
                    }
                    .zone-header {
                        font-weight: bold;
                        margin-bottom: 5px;
                        cursor: pointer;
                    }
                    .zones-list-container {
                         max-height: calc(300px - 40px);
                         overflow-y: auto;
                    }
                    .zone-container {
                        margin-bottom: 5px;
                    }
                    .color-indicator {
                        display: inline-block;
                        width: 12px;
                        height: 12px;
                        margin-left: 5px;
                        border: 1px solid #000;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">Session Heatmap - Fullscreen View</div>
                    <button class="export-btn" onclick="exportMap()">Export as Image</button>
                </div>
                <div id="map"></div>
                
                <div class="control-panel">
                    <div class="slider-container">
                        <label class="slider-label">
                            Heat radius: <span id="heat-radius-value">${currentHeatRadius}</span>
                        </label>
                        <input type="range" id="heat-radius-slider" class="slider" 
                               min="5" max="50" value="${currentHeatRadius}">
                    </div>
                    <div class="slider-container">
                        <label class="slider-label">
                            Marker radius: <span id="marker-radius-value">${currentMarkerRadius}</span>
                        </label>
                        <input type="range" id="marker-radius-slider" class="slider" 
                               min="2" max="15" value="${currentMarkerRadius}">
                    </div>
                </div>
                
                <div class="zone-panel collapsed" id="zone-panel">
                    <div class="zone-header" id="zone-header">
                        Photographer Zones <span class="toggle-icon">+</span>
                    </div>
                    <div class="zones-list-container" id="zones-container">
                        <!-- Zones will be added here -->
                    </div>
                </div>
                
                <!-- Load scripts BEFORE initialization code -->
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
                
                <script>
                    // Data placeholder that will be filled when document is ready
                    let mapData = null;
                    let zonesData = null;
                    
                    // Store references to layers
                    const layerRefs = {
                        markerGroup: null,
                        heatLayer: null,
                        zones: {}
                    };
                    
                    // Function to export map as image
                    function exportMap() {
                        alert('To save the map as an image:\\n1. Right-click on the map\\n2. Select "Save image as..."\\n3. Choose a location and filename');
                    }
                    
                    // Function to create markers
                    function createMarkers(markerRadius, data) {
                        // Remove existing marker group if any
                        if (layerRefs.markerGroup) {
                            map.removeLayer(layerRefs.markerGroup);
                        }
                        
                        // Create a feature group to hold all markers
                        const markerGroup = L.featureGroup();
                        const markerColors = ['red', 'blue', 'green', 'purple', 'orange', 'yellow', 'brown', 'pink', 'teal', 'lime'];
                        
                        data.points.forEach((point, index) => {
                            const color = markerColors[index % markerColors.length];
                            
                            const marker = L.circleMarker([point.lat, point.lng], {
                                radius: markerRadius,
                                fillColor: color,
                                color: '#000',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.8
                            });
                            
                            marker.bindPopup(point.label || 'Point ' + (index + 1));
                            markerGroup.addLayer(marker);
                        });
                        
                        markerGroup.addTo(map);
                        
                        // Store reference to the marker group
                        layerRefs.markerGroup = markerGroup;
                        
                        // Fit map to show all markers
                        if (markerGroup.getLayers().length > 0) {
                            map.fitBounds(markerGroup.getBounds(), { padding: [50, 50] });
                        }
                        
                        return markerGroup;
                    }
                    
                    // Function to create heat layer
                    function createHeatLayer(heatRadius, data) {
                        // Check if heat layer function exists
                        if (typeof L.heatLayer !== 'function') {
                            console.error('Could not add heatmap layer, using markers only: L.heatLayer is not a function');
                            return null;
                        }
                        
                        // Remove existing heat layer if any
                        if (layerRefs.heatLayer) {
                            map.removeLayer(layerRefs.heatLayer);
                        }
                        
                        // Try to add the heatmap layer
                        try {
                            // Prepare heat data based on format
                            let heatData;
                            
                            // Check if data is already formatted as points array or needs conversion
                            if (Array.isArray(data.points)) {
                                // Format from extractMapData (object with lat/lng properties)
                                heatData = data.points.map(p => [p.lat, p.lng, 1]);
                            } else if (Array.isArray(data)) {
                                // Format from heatmapData (array of arrays)
                                heatData = data.map(p => [p[0], p[1], 1]);
                            } else {
                                console.error('Unrecognized data format for heat layer');
                                return null;
                            }
                            
                            const heatLayer = L.heatLayer(heatData, {
                                radius: heatRadius,
                                blur: 15,
                                maxZoom: 10,
                                gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
                            });
                            
                            heatLayer.addTo(map);
                            
                            // Store reference to the heat layer
                            layerRefs.heatLayer = heatLayer;
                            
                            return heatLayer;
                        } catch (e) {
                            console.error('Error adding heatmap layer:', e);
                            return null;
                        }
                    }
                    
                    // Function to add zone controls
                    function addZoneControls(zones) {
                        const zonesContainer = document.getElementById('zones-container');
                        zonesContainer.innerHTML = ''; // Clear potential previous content
                        
                        if (!zones || zones.length === 0) {
                            zonesContainer.innerHTML = '<div style="font-size:12px; font-style:italic;">No zones found</div>';
                            return;
                        }
                        
                        // Add checkboxes for each zone
                        zones.forEach(zone => {
                            const zoneContainer = document.createElement('div');
                            zoneContainer.className = 'zone-container';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.id = 'zone-' + zone.name.replace(/\\s+/g, '-');
                            checkbox.style.marginRight = '5px';
                            
                            const label = document.createElement('label');
                            label.htmlFor = checkbox.id;
                            label.textContent = zone.name;
                            label.style.fontSize = '12px';
                            
                            // Create color indicator
                            const colorIndicator = document.createElement('span');
                            colorIndicator.className = 'color-indicator';
                            colorIndicator.style.backgroundColor = zone.color;
                            
                            zoneContainer.appendChild(checkbox);
                            zoneContainer.appendChild(label);
                            zoneContainer.appendChild(colorIndicator);
                            zonesContainer.appendChild(zoneContainer);
                            
                            // Add event listener for checkbox
                            checkbox.addEventListener('change', () => {
                                if (checkbox.checked) {
                                    // Add zone to map
                                    const zoneLayer = L.polygon(zone.coordinates, {
                                        color: zone.color,
                                        fillOpacity: 0.2,
                                        weight: 2
                                    });
                                    
                                    zoneLayer.bindTooltip(zone.name);
                                    zoneLayer.addTo(map);
                                    
                                    // Store the layer
                                    layerRefs.zones[zone.name] = zoneLayer;
                                } else {
                                    // Remove zone from map
                                    if (layerRefs.zones[zone.name]) {
                                        map.removeLayer(layerRefs.zones[zone.name]);
                                        delete layerRefs.zones[zone.name];
                                    }
                                }
                            });
                        });

                        // Setup toggle for zone panel
                        const zonePanel = document.getElementById('zone-panel');
                        const zoneHeader = document.getElementById('zone-header');
                        const toggleIcon = zoneHeader.querySelector('.toggle-icon');

                        zoneHeader.addEventListener('click', () => {
                            zonePanel.classList.toggle('collapsed');
                            toggleIcon.textContent = zonePanel.classList.contains('collapsed') ? '+' : '-';
                        });
                    }
                    
                    // Function to initialize the map with data
                    function initializeMap() {
                        if (!mapData || !zonesData) {
                            console.error('Map data not available. Please wait for data loading.');
                            return;
                        }
                        
                        console.log('Initializing map with data');
                        
                        // Initialize the map
                        window.map = L.map('map').setView([32.7767, -96.7970], 7);
                        
                        // Add the base tile layer
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }).addTo(map);
                        
                        // Get slider values with fallbacks
                        let heatRadiusValue = 25;
                        let markerRadiusValue = 8;
                        
                        try {
                            const heatSlider = document.getElementById('heat-radius-slider');
                            const markerSlider = document.getElementById('marker-radius-slider');
                            
                            if (heatSlider && heatSlider.value) {
                                heatRadiusValue = parseInt(heatSlider.value);
                            }
                            
                            if (markerSlider && markerSlider.value) {
                                markerRadiusValue = parseInt(markerSlider.value);
                            }
                        } catch(e) {
                            console.warn('Error getting slider values:', e);
                        }
                        
                        // Create the markers immediately
                        createMarkers(markerRadiusValue, mapData);
                        
                        // Create heat layer if possible
                        if (typeof L.heatLayer === 'function') {
                            createHeatLayer(heatRadiusValue, mapData);
                        } else {
                            console.warn('Heatmap disabled: Leaflet heat plugin not available');
                            alert('Heatmap layer is disabled because the plugin could not be loaded. Markers will still be shown.');
                        }
                        
                        // Add event listeners for sliders
                        const heatSlider = document.getElementById('heat-radius-slider');
                        const markerSlider = document.getElementById('marker-radius-slider');
                        
                        if (heatSlider) {
                            heatSlider.addEventListener('input', function() {
                                const valueDisplay = document.getElementById('heat-radius-value');
                                if (valueDisplay) valueDisplay.textContent = this.value;
                                
                                // Only create heat layer if the plugin is available
                                if (typeof L.heatLayer === 'function') {
                                    createHeatLayer(parseInt(this.value), mapData);
                                } else {
                                    console.warn('Cannot update heat layer: plugin not available');
                                }
                            });
                        }
                        
                        if (markerSlider) {
                            markerSlider.addEventListener('input', function() {
                                const valueDisplay = document.getElementById('marker-radius-value');
                                if (valueDisplay) valueDisplay.textContent = this.value;
                                createMarkers(parseInt(this.value), mapData);
                            });
                        }
                        
                        // Add zone controls using the passed data
                        addZoneControls(zonesData);
                    }
                    
                    // Function to load data from parent window
                    function loadMapData(mapDataStr, zonesDataStr) {
                        console.log("Received map data in fullscreen window");
                        try {
                            // Parse data
                            mapData = JSON.parse(mapDataStr);
                            zonesData = JSON.parse(zonesDataStr);
                            
                            // Initialize the map once data is loaded
                            initializeMap();
                        } catch (error) {
                            console.error('Error loading map data:', error);
                            alert('Error loading map data: ' + error.message);
                        }
                    }
                    
                    // Make loadMapData available globally
                    window.loadMapData = loadMapData;
                    
                    // Document ready check
                    document.addEventListener('DOMContentLoaded', function() {
                        console.log('Fullscreen view document ready');
                    });
                </script>
            </body>
            </html>
            `;

        // Write the HTML to the new window
        newWindow.document.open();
        newWindow.document.write(html);
        newWindow.document.close();

        // Use a more reliable way to detect when the window is fully loaded
        function tryPassData() {
            try {
                if (typeof newWindow.loadMapData === 'function') {
                    console.log('loadMapData function found, passing data');
                    newWindow.loadMapData(mapDataStr, zonesDataStr);
                    return true;
                } else {
                    console.log('loadMapData function not found yet, waiting...');
                    return false;
                }
            } catch (e) {
                console.error('Error checking loadMapData:', e);
                return false;
            }
        }

        // First try to pass data immediately
        const immediate = tryPassData();
        
        if (!immediate) {
            // If immediate attempt fails, wait for the load event
            newWindow.addEventListener('load', function() {
                console.log('Fullscreen window load event fired');
                
                // Try again after the load event
                const afterLoad = tryPassData();
                
                if (!afterLoad) {
                    // If still not successful, try one more time after a delay
                    setTimeout(function() {
                        console.log('Final attempt to pass data after delay');
                        if (!tryPassData()) {
                            newWindow.alert('Could not initialize map. Please try refreshing the page.');
                        }
                    }, 1000);
                }
            });
        }
    }
    
    /**
     * Extract data from the current map for transfer to fullscreen view
     */
    function extractMapData() {
        if (!window.currentHeatmap) {
            throw new Error('Map is not initialized');
        }
        
        const map = window.currentHeatmap;
        const data = {
            points: []
        };
        
        // Extract markers and their details
        map.eachLayer(layer => {
            // Check if it's a marker/circle marker
            if (layer instanceof L.CircleMarker) {
                const latlng = layer.getLatLng();
                const popup = layer._popup;
                
                data.points.push({
                    lat: latlng.lat,
                    lng: latlng.lng,
                    label: popup ? popup._content : null
                });
            }
        });
        
        return data;
    }
    
    /**
     * Export the map as an image
     */
    function exportMapAsImage(mapContainer) {
        alert('To save the current map view as an image:\n1. Right-click on the map\n2. Select "Save image as..."\n3. Choose a location and filename');
    }

    /**
     * Parse KML data for zones using GM_xmlhttpRequest to bypass CORS
     */
    async function loadZonesFromKML() {
        console.log('Loading photographer zones from KML...');
        const kmlUrl = 'https://www.google.com/maps/d/u/0/kml?forcekml=1&mid=1Um5MwoUL24WWALpw_AiuOB17dEE';
        console.log(`Fetching KML data from Google Maps: ${kmlUrl}`);

        if (typeof GM_xmlhttpRequest === 'undefined') {
            console.error('GM_xmlhttpRequest is not available. Cannot fetch KML data.');
            return getHardcodedZones(); // Fallback to empty array
        }

        try {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: kmlUrl,
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            console.log(`Successfully loaded KML data (${response.responseText.length} bytes)`);
                            resolve(parseKMLContent(response.responseText));
                        } else {
                            console.error(`Failed to fetch KML data: Status ${response.status}`);
                            reject(new Error(`Failed to fetch KML data: Status ${response.status}`));
                        }
                    },
                    onerror: function(error) {
                        console.error('GM_xmlhttpRequest error fetching KML:', error);
                        reject(new Error(`GM_xmlhttpRequest error: ${error.statusText || 'Unknown error'}`));
                    },
                    ontimeout: function() {
                        console.error('GM_xmlhttpRequest timed out fetching KML');
                        reject(new Error('GM_xmlhttpRequest timed out'));
                    }
                });
            });
        } catch (error) {
            console.error('Error loading zones from KML:', error);
            console.log('Using backup zone data due to KML loading error');
            return getHardcodedZones(); // Fallback to empty array
        }
    }
    
    /**
     * Parse KML content to extract zones
     */
    function parseKMLContent(kmlText) {
        // Parse the KML data
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlText, 'text/xml');
        
        // Handle parsing errors
        if (kml.querySelector('parsererror')) {
            console.error('XML parsing error:', kml.querySelector('parsererror').textContent);
            return getHardcodedZones();
        }
        
        // Get namespace if available
        const namespace = kml.documentElement.namespaceURI;
        const nsResolver = namespace ? 
            function(prefix) { return prefix === 'kml' ? namespace : null; } : 
            null;
        
        // Extract Placemarks (zones)
        const placemarks = kml.getElementsByTagName('Placemark');
        console.log(`Found ${placemarks.length} placemarks in KML data`);
        
        const zones = [];
        const styles = {};
        
        // First process all the styles
        const styleElements = kml.getElementsByTagName('Style');
        for (let i = 0; i < styleElements.length; i++) {
            const style = styleElements[i];
            const styleId = style.getAttribute('id');
            if (styleId) {
                const polyStyle = style.getElementsByTagName('PolyStyle')[0];
                if (polyStyle) {
                    const colorElement = polyStyle.getElementsByTagName('color')[0];
                    if (colorElement && colorElement.textContent) {
                        styles[styleId] = colorElement.textContent;
                    }
                }
            }
        }
        
        console.log(`Processed ${Object.keys(styles).length} styles`);
        
        // Process each placemark
        for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            const nameElement = placemark.getElementsByTagName('name')[0];
            const name = nameElement ? nameElement.textContent : `Zone ${i+1}`;
            
            // Check if the placemark has polygon data
            const polygons = placemark.getElementsByTagName('Polygon');
            if (polygons.length > 0) {
                for (let p = 0; p < polygons.length; p++) {
                    const polygon = polygons[p];
                    
                    // First try the standard format
                    let coordinatesElement = polygon.getElementsByTagName('coordinates')[0];
                    
                    // If that fails, look deeper for the coordinates
                    if (!coordinatesElement) {
                        const outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
                        if (outerBoundary) {
                            const linearRing = outerBoundary.getElementsByTagName('LinearRing')[0];
                            if (linearRing) {
                                coordinatesElement = linearRing.getElementsByTagName('coordinates')[0];
                            }
                        }
                    }
                    
                    if (coordinatesElement && coordinatesElement.textContent) {
                        const coordinates = coordinatesElement.textContent;
                        
                        // Parse coordinates - KML format is lon,lat,alt but Leaflet uses [lat, lng]
                        const coordArray = coordinates.trim().split(/\s+/).map(coord => {
                            const parts = coord.split(',');
                            const lng = parseFloat(parts[0]);
                            const lat = parseFloat(parts[1]);
                            return [lat, lng]; // Leaflet uses [lat, lng] format
                        });
                        
                        // Skip invalid polygons
                        if (coordArray.length < 3) {
                            console.log(`Skipping polygon with insufficient coordinates (${coordArray.length}) for ${name}`);
                            continue;
                        }
                        
                        // Get style information (color)
                        let color = '#3388ff'; // Default blue
                        
                        // Try to get style from styleUrl
                        const styleUrlElement = placemark.getElementsByTagName('styleUrl')[0];
                        if (styleUrlElement && styleUrlElement.textContent) {
                            let styleId = styleUrlElement.textContent.replace('#', '');
                            
                            // Handle StyleMap indirection
                            const styleMap = kml.getElementById(styleId) || 
                                            kml.querySelector(`StyleMap[id="${styleId}"]`);
                            
                            if (styleMap) {
                                // Get the normal style from the StyleMap
                                const pairs = styleMap.getElementsByTagName('Pair');
                                for (let pair of pairs) {
                                    const key = pair.getElementsByTagName('key')[0];
                                    if (key && key.textContent === 'normal') {
                                        const url = pair.getElementsByTagName('styleUrl')[0];
                                        if (url) {
                                            styleId = url.textContent.replace('#', '');
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // Now get the actual color from the style
                            if (styles[styleId]) {
                                // KML colors are in AABBGGRR format, convert to #RRGGBB
                                const kmlColor = styles[styleId];
                                if (kmlColor && kmlColor.length === 8) {
                                    const a = kmlColor.substr(0, 2);
                                    const b = kmlColor.substr(2, 2);
                                    const g = kmlColor.substr(4, 2);
                                    const r = kmlColor.substr(6, 2);
                                    color = `#${r}${g}${b}`;
                                }
                            }
                        }
                        
                        // Try to get region from name
                        let region = name;
                        if (name.includes('—')) {
                            region = name.split('—')[0].trim();
                        } else if (name.includes('-')) {
                            region = name.split('-')[0].trim();
                        } else if (name.includes(':')) {
                            region = name.split(':')[0].trim();
                        }
                        
                        // Only include polygons we're interested in - those with DAL, HOU, etc. in the name
                        const targetRegions = ['DAL', 'DFW', 'HOU', 'SAN', 'DEN', 'ATL', 'PHX', 'LA', 'SD', 'TX'];
                        if (targetRegions.some(r => name.includes(r) || region.includes(r))) {
                            zones.push({
                                name,
                                region,
                                coordinates: coordArray,
                                color
                            });
                        }
                    }
                }
            }
        }
        
        console.log(`Processed ${zones.length} zones with coordinates`);
        
        // Group zones by region
        const groupedZones = {};
        zones.forEach(zone => {
            if (!groupedZones[zone.region]) {
                groupedZones[zone.region] = [];
            }
            groupedZones[zone.region].push(zone);
        });
        
        // Log regions found
        console.log(`Found ${Object.keys(groupedZones).length} regions:`, Object.keys(groupedZones));
        
        // If no zones found through standard parsing, use hardcoded zones as backup
        if (zones.length === 0) {
            console.log('No zones found in KML data, using backup zone data');
            return getHardcodedZones();
        }
        
        return zones;
    }
    
    /**
     * Get empty zones array when KML loading fails
     */
    function getHardcodedZones() {
        console.log('No KML data available - zones will not be displayed');
        return [];
    }
})();
