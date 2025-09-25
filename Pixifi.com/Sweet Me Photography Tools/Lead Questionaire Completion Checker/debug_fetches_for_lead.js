// Debug script to capture all fetches for lead ID "1664126"
// Run this in the browser console on the Pixifi leads page

(function() {
    'use strict';
    
    const TARGET_LEAD_ID = '1664126';
    const CLIENT_ID = '12295';
    
    console.log(`[Debug] Starting fetch capture for lead ID: ${TARGET_LEAD_ID}`);
    
    // Store all captured responses
    const capturedResponses = {
        questionnaireListing: null,
        externalQuestionnaire: null,
        getLeadsBody: null
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
    
    // 1. First, let's capture the current getLeads body if available
    async function captureGetLeadsBody() {
        console.log('[Debug] Attempting to capture getLeads body...');
        
        // Check if we can find any recent getLeads requests
        const performanceEntries = performance.getEntriesByType('resource');
        const getLeadsEntries = performanceEntries.filter(entry => 
            entry.name.includes('/admin/fn/leads/getLeads/')
        );
        
        if (getLeadsEntries.length > 0) {
            console.log('[Debug] Found getLeads requests in performance entries:', getLeadsEntries);
        } else {
            console.log('[Debug] No getLeads requests found in performance entries');
        }
        
        // Try to intercept the next getLeads request
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const [url, options] = args;
            if (url.includes('/admin/fn/leads/getLeads/')) {
                console.log('[Debug] Intercepted getLeads request:', url);
                console.log('[Debug] Request body:', options?.body);
                capturedResponses.getLeadsBody = options?.body;
            }
            return originalFetch.apply(this, args);
        };
        
        console.log('[Debug] Fetch interceptor installed');
    }
    
    // 2. Fetch questionnaire listing for the specific lead
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
    
    // 3. Fetch external questionnaire
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
    
    // 4. Analyze the captured data
    function analyzeCapturedData() {
        console.group('📊 Analysis of Captured Data');
        
        console.log('Captured responses:', capturedResponses);
        
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
    
    // Main execution function
    async function runDebugCapture() {
        console.log('[Debug] Starting debug capture process...');
        
        // Install fetch interceptor
        captureGetLeadsBody();
        
        // Fetch questionnaire listing
        await fetchQuestionnaireListing();
        
        // Analyze the data
        analyzeCapturedData();
        
        console.log('[Debug] Debug capture complete! Check the console groups above for detailed analysis.');
        console.log('[Debug] All captured responses are stored in the `capturedResponses` object for further inspection.');
    }
    
    // Run the debug capture
    runDebugCapture();
    
})();
