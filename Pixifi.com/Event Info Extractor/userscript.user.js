// ==UserScript==
// @name         Event Info Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extracts event information from Pixifi client preview modal and copies to clipboard as CSV
// @match        https://www.pixifi.com/admin/events/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Guard to prevent multiple executions
    if (window.EventInfoExtractor) {
        console.log('Event Info Extractor script is already running.');
        return;
    }
    window.EventInfoExtractor = true;

    // CSS for the extract button
    const styles = document.createElement('style');
    styles.textContent = `
        .extract-info-btn {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
            margin: 5px 0;
            display: inline-block;
            text-decoration: none;
        }
        
        .extract-info-btn:hover {
            background-color: #2980b9;
        }
        
        .extract-info-btn:active {
            transform: translateY(1px);
        }
        
        .extract-info-btn.success {
            background-color: #27ae60;
        }
        
        .extract-info-btn.error {
            background-color: #e74c3c;
        }
        
        .toast-message {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 14px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            z-index: 10000;
        }
        
        .toast-message.show {
            opacity: 1;
        }
    `;
    document.head.appendChild(styles);

    // Utility: show a toast message
    function showToast(message, duration = 3000, color = null) {
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        if (color) {
            toast.style.backgroundColor = color;
        }
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.add('show'));
        
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    }

    // Function to get photographer data from localStorage (from the calendar year view script)
    function getPhotographerDataByStaffId(staffId) {
        // Look through localStorage for photographer data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('photographer_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    // The data structure from the calendar script has firstName and lastName
                    if (data && data.firstName && data.lastName) {
                        return data;
                    }
                } catch (e) {
                    console.warn('Failed to parse photographer data for key:', key, e);
                }
            }
        }
        return null;
    }

    // Function to extract staff information from the staff listing response
    function extractStaffInfo(html) {
        console.log('Extracting staff info from HTML:', html.substring(0, 1000)); // Log first 1000 chars
        
        const cleanHtml = html.replace(/^SUCCESS\{\|\}\s*/, '');
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');
        
        const staffInfo = {};
        const staffDivs = doc.querySelectorAll('div[id^="staff_"]');
        
        console.log('Found staff divs:', staffDivs.length);
        
        staffDivs.forEach((div, index) => {
            const staffId = div.id.replace('staff_', '');
            console.log(`Processing staff div ${index + 1}:`, div.outerHTML);
            
            const nameEl = div.querySelector('.floatGrid a strong');
            const name = nameEl ? nameEl.textContent.trim() : 'Unknown';
            
            // Look for role information - it appears after <br> tags
            const roleElements = div.querySelectorAll('.floatGrid br + span strong');
            let role = '';
            if (roleElements.length > 0) {
                role = roleElements[0].textContent.trim();
            }
            
            // Also look for additional info that might contain "Photographer" or "NEWBORN"
            const allText = div.textContent;
            if (allText.toLowerCase().includes('photographer')) {
                role = 'Photographer';
            }
            if (allText.toLowerCase().includes('newborn')) {
                role = 'NEWBORN Photographer';
            }
            
            staffInfo[staffId] = {
                id: staffId,
                name: name,
                role: role
            };
            
            console.log(`Staff ${staffId}:`, { name, role, allText: allText.substring(0, 200) });
        });
        
        console.log('Final staff info:', staffInfo);
        return staffInfo;
    }

    // Store captured staff listing data
    let capturedStaffData = null;
    let staffDataPromise = null;
    let staffDataResolve = null;
    let staffDataReject = null;

    // Function to get event staff listing - try to use captured data first
    function getEventStaffListing(eventId) {
        return new Promise((resolve, reject) => {
            // First, check if staff data is already in the DOM
            const domStaffData = extractStaffInfoFromDOM();
            if (domStaffData) {
                console.log('Using staff data from existing DOM elements');
                capturedStaffData = domStaffData;
                resolve(domStaffData);
                return;
            }

            // If we already have captured data, use it
            if (capturedStaffData) {
                console.log('Using captured staff data');
                resolve(capturedStaffData);
                return;
            }

            // If there's already a pending request, wait for it
            if (staffDataPromise) {
                console.log('Waiting for existing staff data request');
                staffDataPromise.then(resolve).catch(reject);
                return;
            }

            // Create a new promise that we can resolve when we capture the data
            staffDataPromise = new Promise((res, rej) => {
                staffDataResolve = res;
                staffDataReject = rej;
            });

            // Set a timeout in case we don't capture the data
            const timeout = setTimeout(() => {
                console.log('No staff data found, making fallback request');
                makeFallbackStaffRequest(eventId).then(resolve).catch(reject);
            }, 2000); // Reduced timeout to 2 seconds since we check DOM first

            // Listen for the captured data
            staffDataPromise.then((data) => {
                clearTimeout(timeout);
                resolve(data);
            }).catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    // Fallback function to make our own request if needed
    function makeFallbackStaffRequest(eventId) {
        return new Promise((resolve, reject) => {
            // Get the client ID from the page
            let clientId = '12295'; // fallback
            const clientIdMatch = window.location.pathname.match(/\/admin\/events\/\d+\/\?clientID=(\d+)/);
            if (clientIdMatch) {
                clientId = clientIdMatch[1];
            } else {
                // Try to get from URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                const urlClientId = urlParams.get('clientID');
                if (urlClientId) {
                    clientId = urlClientId;
                }
            }
            
            console.log('Using client ID for staff request:', clientId);
            
            fetch("https://www.pixifi.com/admin/fn/events/refreshEventStaffListing/", {
                "headers": {
                    "accept": "*/*",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                "body": `clientID=${clientId}&eventID=${eventId}&page=1`,
                "method": "POST",
                "credentials": "include"
            })
            .then(response => response.text())
            .then(html => {
                console.log('Staff listing response:', html.substring(0, 500)); // Log first 500 chars for debugging
                const staffInfo = extractStaffInfo(html);
                resolve(staffInfo);
            })
            .catch(error => {
                console.error('Error fetching staff listing:', error);
                reject(error);
            });
        });
    }

    // Function to extract staff info from existing DOM elements
    function extractStaffInfoFromDOM() {
        const staffInfo = {};
        const staffDivs = document.querySelectorAll('div[id^="staff_"]');
        
        if (staffDivs.length > 0) {
            console.log('Found existing staff elements in DOM:', staffDivs.length);
            
            staffDivs.forEach(div => {
                const staffId = div.id.replace('staff_', '');
                const nameEl = div.querySelector('.floatGrid a strong');
                const name = nameEl ? nameEl.textContent.trim() : 'Unknown';
                
                // Look for role information - it appears after <br> tags
                const roleElements = div.querySelectorAll('.floatGrid br + span strong');
                let role = '';
                if (roleElements.length > 0) {
                    role = roleElements[0].textContent.trim();
                }
                
                // Also look for additional info that might contain "Photographer" or "NEWBORN"
                const allText = div.textContent;
                if (allText.toLowerCase().includes('photographer')) {
                    role = 'Photographer';
                }
                if (allText.toLowerCase().includes('newborn')) {
                    role = 'NEWBORN Photographer';
                }
                
                staffInfo[staffId] = {
                    id: staffId,
                    name: name,
                    role: role
                };
            });
            
            console.log('Extracted staff info from DOM:', staffInfo);
            return staffInfo;
        }
        
        return null;
    }

    // Intercept fetch requests to capture staff listing data
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        const options = args[1] || {};
        
        // Check if this is a staff listing request
        if (typeof url === 'string' && url.includes('refreshEventStaffListing')) {
            console.log('Intercepting staff listing request');
            
            return originalFetch.apply(this, args).then(response => {
                // Clone the response so we can read it without consuming it
                const clonedResponse = response.clone();
                
                clonedResponse.text().then(html => {
                    try {
                        const staffInfo = extractStaffInfo(html);
                        console.log('Captured staff data:', staffInfo);
                        capturedStaffData = staffInfo;
                        
                        // Resolve any pending promises
                        if (staffDataResolve) {
                            staffDataResolve(staffInfo);
                            staffDataResolve = null;
                            staffDataReject = null;
                        }
                    } catch (error) {
                        console.warn('Failed to parse captured staff data:', error);
                        if (staffDataReject) {
                            staffDataReject(error);
                            staffDataResolve = null;
                            staffDataReject = null;
                        }
                    }
                }).catch(error => {
                    console.warn('Failed to read captured staff response:', error);
                    if (staffDataReject) {
                        staffDataReject(error);
                        staffDataResolve = null;
                        staffDataReject = null;
                    }
                });
                
                return response;
            });
        }
        
        // For all other requests, proceed normally
        return originalFetch.apply(this, args);
    };

    // Function to extract client information from the modal
    function extractClientInfo() {
        const clientInfo = {};
        
        // Look for elements within the client preview modal specifically
        const modal = document.querySelector('#globalClientPreviewDialog');
        if (!modal) {
            console.warn('Client preview modal not found for data extraction');
            return clientInfo;
        }
        
        // Extract client name - use getElementById to avoid CSS selector issues
        const nameEl = modal.querySelector('[id*="af_custBrideFirst"][id*="custBrideLast"]');
        if (nameEl) {
            const nameValue = nameEl.getAttribute('data-value');
            if (nameValue) {
                const [firstName, lastName] = nameValue.split('{||}');
                clientInfo.name = `${firstName} ${lastName}`.trim();
            }
        }
        
        // Extract phone numbers
        const phoneEls = modal.querySelectorAll('#af_custBridePhone, #af_custBrideMobilePhone');
        const phones = [];
        phoneEls.forEach(el => {
            const phoneValue = el.getAttribute('data-value');
            if (phoneValue) {
                phones.push(phoneValue);
            }
        });
        clientInfo.phone = phones.join('; ');
        
        // Extract email
        const emailEl = modal.querySelector('#af_custBrideEmail');
        if (emailEl) {
            clientInfo.email = emailEl.getAttribute('data-value') || '';
        }
        
        // Extract zip code - use attribute selector to avoid CSS selector issues
        const addressEl = modal.querySelector('[id*="af_custAddress"][id*="custAddress1"][id*="custCity"][id*="custState"][id*="custZip"][id*="custCountry"]');
        if (addressEl) {
            const addressValue = addressEl.getAttribute('data-value');
            console.log('Raw address data-value:', addressValue);
            if (addressValue) {
                try {
                    const addressData = JSON.parse(addressValue);
                    console.log('Parsed address data:', addressData);
                    // Only extract the zipcode for location field
                    clientInfo.location = addressData.postal || '';
                    clientInfo.zipCode = addressData.postal || '';
                } catch (e) {
                    console.warn('Failed to parse address data:', e);
                    console.warn('Raw address value that failed to parse:', addressValue);
                    
                    // Try to extract zipcode from the displayed text as fallback
                    const addressText = addressEl.textContent.trim();
                    console.log('Address text content:', addressText);
                    
                    // Look for zipcode pattern in the text (5 digits)
                    const zipMatch = addressText.match(/\b\d{5}\b/);
                    if (zipMatch) {
                        const zipcode = zipMatch[0];
                        clientInfo.location = zipcode;
                        clientInfo.zipCode = zipcode;
                        console.log('Extracted zipcode from text:', zipcode);
                    }
                }
            }
        }
        
        console.log('Extracted client info:', clientInfo);
        return clientInfo;
    }

    // Function to extract event information from the main page
    function extractEventInfo() {
        const eventInfo = {};
        
        // Get event link (current page URL)
        eventInfo.eventLink = window.location.href;
        
        // Extract event name
        const eventNameEl = document.querySelector('#af_eventName');
        if (eventNameEl) {
            eventInfo.eventName = eventNameEl.getAttribute('data-value') || eventNameEl.textContent.trim();
        }
        
        // Extract due date (event date) - try multiple selectors
        let eventDateEl = document.querySelector('#questitem_8225 .rightTitle');
        if (!eventDateEl) {
            // Try alternative selectors for event date
            eventDateEl = document.querySelector('[id*="questitem"][id*="8225"] .rightTitle');
        }
        if (!eventDateEl) {
            // Try looking for any questitem with "DUE DATE" or "BIRTH DATE" in the description
            const questItems = document.querySelectorAll('[id^="questitem_"]');
            for (const item of questItems) {
                const descEl = item.querySelector('[id^="item_"][id$="_desc"]');
                if (descEl && (descEl.textContent.toLowerCase().includes('due date') || descEl.textContent.toLowerCase().includes('birth date'))) {
                    const rightTitleEl = item.querySelector('.rightTitle');
                    if (rightTitleEl) {
                        eventDateEl = rightTitleEl;
                        break;
                    }
                }
            }
        }
        if (eventDateEl) {
            eventInfo.dueDate = eventDateEl.textContent.trim();
        }
        
        // Get event ID from URL
        const eventIdMatch = window.location.pathname.match(/\/admin\/events\/(\d+)\//);
        if (eventIdMatch) {
            eventInfo.eventId = eventIdMatch[1];
        }
        
        return eventInfo;
    }

    // Function to find photographer from staff listing
    function findPhotographer(staffInfo) {
        for (const staffId in staffInfo) {
            const staff = staffInfo[staffId];
            if (staff.role && staff.role.toLowerCase().includes('photographer')) {
                return staff;
            }
        }
        return null;
    }

    // Function to find newborn photographer (specific role)
    function findNewbornPhotographer(staffInfo) {
        for (const staffId in staffInfo) {
            const staff = staffInfo[staffId];
            if (staff.role && staff.role.toLowerCase().includes('newborn')) {
                return staff;
            }
        }
        return null;
    }

    // Main function to extract all information
    async function extractEventInformation() {
        try {
            const button = document.querySelector('.extract-info-btn');
            if (button) {
                button.textContent = 'Extracting...';
                button.classList.add('success');
            }
            
            // Check if the modal is visible
            const modal = document.querySelector('#globalClientPreviewDialog');
            if (!modal || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true') {
                showToast('Please open the client preview modal first', 3000, '#f39c12');
                if (button) {
                    button.textContent = 'Extract Info';
                    button.classList.remove('success');
                }
                return;
            }
            
            // Extract client info from modal
            const clientInfo = extractClientInfo();
            
            // Extract event info from main page
            const eventInfo = extractEventInfo();
            
            // Get staff listing if we have an event ID
            let photographer = null;
            let newbornPhotographer = null;
            
            if (eventInfo.eventId) {
                try {
                    const staffInfo = await getEventStaffListing(eventInfo.eventId);
                    console.log('Staff info retrieved:', staffInfo);
                    
                    photographer = findPhotographer(staffInfo);
                    newbornPhotographer = findNewbornPhotographer(staffInfo);
                    
                                         console.log('Found photographer:', photographer);
                     console.log('Found newborn photographer:', newbornPhotographer);
                     
                     // Note: We're using the name directly from the DOM, not from localStorage
                     // to avoid getting incorrect names from cached data
                } catch (e) {
                    console.warn('Failed to get staff listing:', e);
                }
            }
            
                         // Create CSV string - use the name directly from the DOM
             const photographerName = photographer ? photographer.name : '';
             const newbornPhotographerName = newbornPhotographer ? newbornPhotographer.name : '';
            
            const csvData = [
                clientInfo.phone || '',
                clientInfo.name || '',
                eventInfo.eventName || '',
                eventInfo.eventLink || '',
                eventInfo.dueDate || '',
                clientInfo.email || '',
                clientInfo.zipCode || '',
                '',
                photographerName,
                newbornPhotographerName
            ].join(',');
            
            // Copy to clipboard with fallback for when document is not focused
            try {
                await navigator.clipboard.writeText(csvData);
            } catch (clipboardError) {
                console.warn('Clipboard API failed, trying fallback method:', clipboardError);
                
                // Fallback: create a temporary textarea element
                const textarea = document.createElement('textarea');
                textarea.value = csvData;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '-9999px';
                document.body.appendChild(textarea);
                
                // Select and copy
                textarea.select();
                textarea.setSelectionRange(0, 99999); // For mobile devices
                
                try {
                    document.execCommand('copy');
                    console.log('Fallback clipboard method successful');
                } catch (execError) {
                    console.error('Fallback clipboard method also failed:', execError);
                    throw new Error('Failed to copy to clipboard. Please copy manually: ' + csvData);
                } finally {
                    document.body.removeChild(textarea);
                }
            }
            
            if (button) {
                button.textContent = 'Extract Info ✓';
                setTimeout(() => {
                    button.textContent = 'Extract Info';
                    button.classList.remove('success');
                }, 2000);
            }
            
            showToast('Event information copied to clipboard!', 3000, '#27ae60');
            
            console.log('Extracted data:', {
                clientInfo,
                eventInfo,
                photographer,
                newbornPhotographer,
                csvData
            });
            
        } catch (error) {
            console.error('Error extracting event information:', error);
            
            const button = document.querySelector('.extract-info-btn');
            if (button) {
                button.textContent = 'Error!';
                button.classList.add('error');
                setTimeout(() => {
                    button.textContent = 'Extract Info';
                    button.classList.remove('error');
                }, 2000);
            }
            
            showToast('Failed to extract information', 3000, '#e74c3c');
        }
    }

    // Function to add the extract button to the actions section
    function addExtractButton() {
        // Look specifically for the client preview modal
        const modal = document.querySelector('#globalClientPreviewDialog');
        if (!modal) {
            console.log('Client preview modal not found');
            return;
        }
        
        // Find the actions container within the modal
        const actionsContainer = modal.querySelector('.portlet-body');
        if (actionsContainer && !modal.querySelector('.extract-info-btn')) {
            const extractButton = document.createElement('a');
            extractButton.href = 'javascript:void(0);';
            extractButton.className = 'btn btn-default btn-md extract-info-btn';
            extractButton.innerHTML = '<span class="icon-download"></span> Extract Info';
            extractButton.addEventListener('click', extractEventInformation);
            
            // Insert at the beginning of the actions container
            actionsContainer.insertBefore(extractButton, actionsContainer.firstChild);
            
            console.log('Extract button added to client preview modal actions container');
        }
    }

    // Observer to watch for modal content changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if this is the client preview modal
                        if (node.id === 'globalClientPreviewDialog') {
                            console.log('Client preview modal detected');
                            addExtractButton();
                        }
                        // Also check if the modal is added as a child of another element
                        if (node.querySelector && node.querySelector('#globalClientPreviewDialog')) {
                            console.log('Client preview modal found within added node');
                            addExtractButton();
                        }
                    }
                });
            }
        });
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Also try to add the button immediately if the modal is already present
    setTimeout(addExtractButton, 1000);
    
    // Check periodically for the modal to ensure the button gets added
    const checkInterval = setInterval(() => {
        const modal = document.querySelector('#globalClientPreviewDialog');
        if (modal && !modal.querySelector('.extract-info-btn')) {
            console.log('Modal found, adding button');
            addExtractButton();
        }
    }, 2000);
    
    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkInterval), 30000);

    console.log('Event Info Extractor script loaded successfully');
})();
