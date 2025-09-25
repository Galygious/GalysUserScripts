// Comprehensive debug script to capture ALL fetches used by the Lead Questionnaire Completion Checker
// Run this in the browser console on the Pixifi leads page

(function() {
    'use strict';
    
    const TARGET_LEAD_ID = '1664126';
    const CLIENT_ID = '12295';
    
    console.log(`[Debug] Starting comprehensive fetch capture for lead ID: ${TARGET_LEAD_ID}`);
    
    // Store all captured responses
    const capturedResponses = {
        getLeadsBody: null,
        getLeadsResponse: null,
        questionnaireListing: null,
        externalQuestionnaire: null,
        allFetches: []
    };
    
    // Function to log responses with clear formatting
    function logResponse(type, url, response, error = null) {
        console.group(`🔍 ${type} - ${url}`);
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Response:', response);
            console.log('Response length:', response.length);
            console.log('Response preview:', response.substring(0, 500) + '...');
        }
        console.groupEnd();
    }
    
    // 1. Install comprehensive fetch interceptor to capture ALL requests
    function installFetchInterceptor() {
        console.log('[Debug] Installing comprehensive fetch interceptor...');
        
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const [url, options] = args;
            
            // Capture all fetches
            const fetchInfo = {
                url: url,
                method: options?.method || 'GET',
                body: options?.body,
                timestamp: new Date().toISOString(),
                headers: options?.headers
            };
            
            capturedResponses.allFetches.push(fetchInfo);
            
            // Special handling for getLeads requests
            if (url.includes('/admin/fn/leads/getLeads/')) {
                console.log('[Debug] Intercepted getLeads request:', url);
                console.log('[Debug] Request body:', options?.body);
                capturedResponses.getLeadsBody = options?.body;
            }
            
            // Special handling for questionnaire requests
            if (url.includes('/admin/fn/quest/refreshQuestionnaireToObjectListing/')) {
                console.log('[Debug] Intercepted questionnaire listing request:', url);
                console.log('[Debug] Request body:', options?.body);
            }
            
            // Special handling for external questionnaire requests
            if (url.includes('questionnaires.pixifi.com/')) {
                console.log('[Debug] Intercepted external questionnaire request:', url);
            }
            
            return originalFetch.apply(this, arguments).then(response => {
                // Clone the response so we can read it multiple times
                const clonedResponse = response.clone();
                
                // Capture response for specific endpoints
                if (url.includes('/admin/fn/leads/getLeads/')) {
                    clonedResponse.text().then(text => {
                        capturedResponses.getLeadsResponse = text;
                        logResponse('GetLeads Response', url, text);
                    });
                }
                
                return response;
            });
        };
        
        console.log('[Debug] Comprehensive fetch interceptor installed');
    }
    
    // 2. Manually trigger the getLeads fetch to capture it
    async function triggerGetLeadsFetch() {
        console.log('[Debug] Triggering getLeads fetch to capture it...');
        
        // First, let's try to find any existing getLeads body from the page
        const performanceEntries = performance.getEntriesByType('resource');
        const getLeadsEntries = performanceEntries.filter(entry => 
            entry.name.includes('/admin/fn/leads/getLeads/')
        );
        
        if (getLeadsEntries.length > 0) {
            console.log('[Debug] Found getLeads requests in performance entries:', getLeadsEntries);
        }
        
        // Try to trigger a getLeads request by changing a filter or sorting
        console.log('[Debug] Please change a filter or sort on the leads page to trigger a getLeads request');
        console.log('[Debug] Or manually trigger the tool to capture the getLeads body');
    }
    
    // 3. Fetch questionnaire listing for the specific lead
    async function fetchQuestionnaireListing() {
        console.log(`[Debug] Fetching questionnaire listing for lead ${TARGET_LEAD_ID}...`);
        
        const body = `clientID=${CLIENT_ID}&objectType=lead&objectID=${TARGET_LEAD_ID}`;
        
        try {
            const response = await fetch("https://www.pixifi.com/admin/fn/quest/refreshQuestionnaireToObjectListing/", {
                method: 'POST',
                headers: { 
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 
                    'x-requested-with': 'XMLHttpRequest' 
                },
                body,
                credentials: 'include'
            });
            
            const html = await response.text();
            capturedResponses.questionnaireListing = html;
            
            logResponse('Questionnaire Listing', response.url, html);
            
            // Parse the response to find external questionnaire URL
            if (html.includes('SUCCESS{|}')) {
                const cleanListingHtml = html.split('SUCCESS{|}')[1];
                const listingDoc = new DOMParser().parseFromString(cleanListingHtml, 'text/html');
                const externalLinkElement = listingDoc.querySelector('a[href*="questionnaires.pixifi.com/"]');
                
                if (externalLinkElement) {
                    const externalQuestionnaireUrl = externalLinkElement.href;
                    console.log(`[Debug] Found external questionnaire URL: ${externalQuestionnaireUrl}`);
                    
                    // Fetch the external questionnaire
                    await fetchExternalQuestionnaire(externalQuestionnaireUrl);
                } else {
                    console.log('[Debug] No external questionnaire link found');
                }
            }
            
        } catch (error) {
            logResponse('Questionnaire Listing', 'https://www.pixifi.com/admin/fn/quest/refreshQuestionnaireToObjectListing/', null, error);
        }
    }
    
    // 4. Fetch external questionnaire
    async function fetchExternalQuestionnaire(url) {
        console.log(`[Debug] Fetching external questionnaire: ${url}`);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include'
            });
            
            const html = await response.text();
            capturedResponses.externalQuestionnaire = html;
            
            logResponse('External Questionnaire', url, html);
            
        } catch (error) {
            logResponse('External Questionnaire', url, null, error);
        }
    }
    
    // 5. Analyze the captured data
    function analyzeCapturedData() {
        console.group('📊 Analysis of Captured Data');
        
        console.log('All captured fetches:', capturedResponses.allFetches);
        console.log('Captured responses:', capturedResponses);
        
        // Analyze getLeads response
        if (capturedResponses.getLeadsResponse) {
            console.group('GetLeads Response Analysis');
            
            try {
                const clean = capturedResponses.getLeadsResponse.replace(/^SUCCESS\{\|\}\s*/, '');
                const doc = new DOMParser().parseFromString(clean, 'text/html');
                const rows = doc.querySelectorAll('.gridRow[id^="row_"]');
                
                console.log(`Found ${rows.length} lead rows in getLeads response`);
                
                // Look for our target lead
                const targetRow = Array.from(rows).find(row => row.id === `row_${TARGET_LEAD_ID}`);
                if (targetRow) {
                    console.log('Found target lead in getLeads response:', targetRow.outerHTML);
                } else {
                    console.log('Target lead not found in getLeads response');
                }
                
            } catch (error) {
                console.log('Error parsing getLeads response:', error);
            }
            
            console.groupEnd();
        }
        
        // Analyze questionnaire listing
        if (capturedResponses.questionnaireListing) {
            console.group('Questionnaire Listing Analysis');
            
            if (capturedResponses.questionnaireListing.includes('SUCCESS{|}')) {
                const cleanListingHtml = capturedResponses.questionnaireListing.split('SUCCESS{|}')[1];
                const listingDoc = new DOMParser().parseFromString(cleanListingHtml, 'text/html');
                
                // Find all questionnaire divs
                const questionnaireDivs = listingDoc.querySelectorAll('div[id^="questionnaire_"]');
                console.log(`Found ${questionnaireDivs.length} questionnaire(s)`);
                
                questionnaireDivs.forEach((div, index) => {
                    console.group(`Questionnaire ${index + 1}`);
                    console.log('Questionnaire ID:', div.id);
                    console.log('Questionnaire HTML:', div.outerHTML);
                    
                    // Check completion status
                    const completionStatusDiv = div.querySelectorAll('.floatGrid')[2];
                    if (completionStatusDiv) {
                        const hasCheck = completionStatusDiv.querySelector('.fa.fa-check');
                        console.log('Completion status div:', completionStatusDiv.outerHTML);
                        console.log('Has completion check:', !!hasCheck);
                    }
                    
                    console.groupEnd();
                });
            }
            
            console.groupEnd();
        }
        
        // Analyze external questionnaire
        if (capturedResponses.externalQuestionnaire) {
            console.group('External Questionnaire Analysis');
            
            const doc = new DOMParser().parseFromString(capturedResponses.externalQuestionnaire, 'text/html');
            
            // Find all form elements
            const formElements = doc.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea, select, input[type="checkbox"], input[type="radio"]');
            console.log(`Found ${formElements.length} form elements`);
            
            // Show all filled fields
            const filledFields = [];
            formElements.forEach(element => {
                if (element.tagName === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
                    if (element.checked) {
                        filledFields.push({
                            id: element.id,
                            name: element.name,
                            type: element.type,
                            value: element.checked,
                            label: getFieldLabel(element)
                        });
                    }
                } else if (element.value && element.value.trim() !== '') {
                    filledFields.push({
                        id: element.id,
                        name: element.name,
                        type: element.type || element.getAttribute('type'),
                        value: element.value,
                        label: getFieldLabel(element)
                    });
                }
            });
            
            console.log('Filled fields:', filledFields);
            console.groupEnd();
        }
        
        console.groupEnd();
    }
    
    // Helper function to get field label (copied from the original script)
    function getFieldLabel(element) {
        let parentItem = element.closest('.questionnaire-item');
        if (parentItem) {
            const titleDiv = parentItem.querySelector('.questionnaire-item__title');
            if (titleDiv) {
                return titleDiv.textContent.trim();
            }
        }
        
        let parentSection = element.closest('.questionnaire-section');
        if (parentSection) {
            const sectionTitleDiv = parentSection.querySelector('.questionnaire-section__title');
            if (sectionTitleDiv) {
                return sectionTitleDiv.textContent.trim();
            }
        }
        
        return null;
    }
    
    // 6. Function to manually trigger the tool to capture getLeads
    function triggerToolCapture() {
        console.log('[Debug] To capture the getLeads fetch, please:');
        console.log('1. Change a filter or sort on the leads page, OR');
        console.log('2. Run the Lead Questionnaire Checker tool');
        console.log('The fetch interceptor will capture the getLeads request automatically.');
    }
    
    // Main execution function
    async function runDebugCapture() {
        console.log('[Debug] Starting comprehensive debug capture process...');
        
        // Install fetch interceptor first
        installFetchInterceptor();
        
        // Trigger getLeads capture instructions
        triggerToolCapture();
        
        // Fetch questionnaire listing
        await fetchQuestionnaireListing();
        
        // Analyze the data
        analyzeCapturedData();
        
        console.log('[Debug] Debug capture complete!');
        console.log('[Debug] To capture the getLeads fetch, change a filter/sort or run the tool.');
        console.log('[Debug] All captured responses are stored in the `capturedResponses` object.');
        console.log('[Debug] All fetches are logged in `capturedResponses.allFetches`');
    }
    
    // Run the debug capture
    runDebugCapture();
    
    // Expose functions for manual use
    window.debugCapture = {
        capturedResponses,
        analyzeCapturedData,
        triggerToolCapture,
        fetchQuestionnaireListing: () => fetchQuestionnaireListing()
    };
    
})();
