// ==UserScript==
// @name         Heymarket Data Scraper
// @namespace    http://tampermonkey.net/
// @version      5.2
// @description  Scrapes Heymarket list and conversation data and sends it to Google Sheets with seamless redirect-based Google OAuth authentication.
// @match        https://app.heymarket.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_download
// @grant        window.close
// @grant        window.focus
// @connect      api-prod-client.heymarket.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *.google.com
// @connect      *.googleusercontent.com
// @connect      accounts.google.com
// @connect      oauth2.googleapis.com
// @run-at       document-start
// ==/UserScript==

// ⚡ CRITICAL: Intercept network requests IMMEDIATELY before anything else
let SECURITY_TOKEN = null;
let AUTO_RESUME_SCRAPING = GM_getValue('auto_resume_scraping', false); // Track if we should auto-resume after auth (persisted)

console.log('🔍 AUTO_RESUME_SCRAPING loaded from storage:', AUTO_RESUME_SCRAPING);

// Intercept fetch requests at the very start
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const [url, options] = args;

        // Check if this is a Heymarket API request
        if (url && typeof url === 'string' && url.includes('api-prod-client.heymarket.com')) {
            // Extract token from request headers
            if (options && options.headers) {
                const headers = options.headers;
                const token = headers['x-emb-security-token'] || headers['X-Emb-Security-Token'] ||
                             headers['x-emb-security-token'.toLowerCase()] || headers['X-EMB-SECURITY-TOKEN'];
                if (token && !SECURITY_TOKEN) {
                    SECURITY_TOKEN = token;
                    console.log('🎯 Security token intercepted from fetch:', token.substring(0, 20) + '...');
                }
            }
        }

        return originalFetch.apply(this, args);
    };
})();

// Intercept XMLHttpRequest at the very start
(function() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (header && header.toLowerCase() === 'x-emb-security-token' && !SECURITY_TOKEN) {
            SECURITY_TOKEN = value;
            console.log('🎯 Security token intercepted from XHR:', value.substring(0, 20) + '...');
        }
        return originalSetRequestHeader.apply(this, arguments);
    };

    // Also intercept the send method to catch any late headers
    XMLHttpRequest.prototype.send = function(data) {
        // Check if URL is Heymarket API
        if (this._url && this._url.includes('api-prod-client.heymarket.com')) {
            console.log('📡 Heymarket API request detected:', this._url);
        }
        return originalSend.apply(this, arguments);
    };

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url; // Store URL for later reference
        return originalOpen.apply(this, arguments);
    };
})();

// Also try to intercept any existing tokens from global objects
(function checkGlobalToken() {
    // Try multiple times in case objects load later
    let attempts = 0;
    const maxAttempts = 50;

    function searchForToken() {
        attempts++;

        // Check various global objects for tokens
        const searchTargets = [
            window.localStorage,
            window.sessionStorage,
            window.__NUXT__,
            window.__INITIAL_STATE__,
            window.APP_CONFIG,
            window.authConfig,
            window.apiConfig
        ];

        for (const target of searchTargets) {
            if (target && typeof target === 'object') {
                const str = JSON.stringify(target);
                const tokenMatch = str.match(/[a-zA-Z0-9]{40,}/g);
                if (tokenMatch && !SECURITY_TOKEN) {
                    // Look for likely security tokens (long alphanumeric strings)
                    for (const match of tokenMatch) {
                        if (match.length >= 40 && /^[a-zA-Z0-9]+$/.test(match)) {
                            SECURITY_TOKEN = match;
                            console.log('🔍 Potential security token found in global object:', match.substring(0, 20) + '...');
                            return;
                        }
                    }
                }
            }
        }

        if (attempts < maxAttempts && !SECURITY_TOKEN) {
            setTimeout(searchForToken, 100);
        }
    }

    // Start searching immediately and then periodically
    searchForToken();
})();

(function() {
    'use strict';

    const TEAM_ID = 64149;
    const MAX_CONVERSATION_MESSAGES = 20;
    const GOOGLE_SCRIPT_ID = "AKfycbzfOem8exv5LUzaHPHjBbizCFEl4Mx700YLg4XgWwIqsOP1BwUMvyxdim2w2iEdMvYF";

    // Google Apps Script configuration
    const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/" + GOOGLE_SCRIPT_ID + "/exec";

    // Google OAuth configuration
    const GOOGLE_CLIENT_ID = "221842260905-nidbveovs3vjft1oc42rf4a3aeamdafo.apps.googleusercontent.com";

    // OAuth token management with Tampermonkey storage
    function getStoredToken() {
        return GM_getValue('google_oauth_token', null);
    }

    function setStoredToken(token) {
        GM_setValue('google_oauth_token', token);
    }

    function clearStoredToken() {
        GM_setValue('google_oauth_token', null);
    }

    // Debug function to check stored token status
    function debugTokenStorage() {
        const token = getStoredToken();
        const authCallback = GM_getValue('auth_callback', 'not_set');
        const authState = GM_getValue('auth_state', 'not_set');

        console.log('🔍 DEBUG: Token Storage Status');
        console.log('  - Stored Token:', token ? token.substring(0, 50) + '... (length: ' + token.length + ')' : 'NULL');
        console.log('  - Auth Callback:', authCallback);
        console.log('  - Auth State:', authState);
        console.log('  - Security Token:', SECURITY_TOKEN ? SECURITY_TOKEN.substring(0, 20) + '...' : 'NULL');
    }

    // Make debug function available globally for testing
    window.debugTokenStorage = debugTokenStorage;

    // Version check - this should log immediately when script loads
    console.log('🚀 Heymarket Data Scraper v5.2 loaded successfully');
    console.log('🔧 Debug function available: window.debugTokenStorage()');
    console.log('🔄 Now includes automatic token expiration handling');

    async function promptForOAuthToken() {
        let savedToken = getStoredToken();

        console.log('🔍 Checking for stored OAuth token...');

        // Check main storage first
        if (savedToken) {
            console.log('📦 Found stored token in main storage:', savedToken.substring(0, 50) + '...');
        } else {
            // Fallback: Check if token is still in auth_callback storage
            console.log('📭 No token in main storage, checking auth_callback storage...');
            const authCallbackToken = GM_getValue('auth_callback', null);
            if (authCallbackToken && authCallbackToken !== 'pending' && authCallbackToken !== 'error' && authCallbackToken.startsWith('eyJ')) {
                console.log('🔄 Found token in auth_callback storage, transferring to main storage');
                savedToken = authCallbackToken;
                setStoredToken(savedToken);
                // Clean up the auth callback
                GM_setValue('auth_callback', 'pending');
            }
        }

        if (savedToken) {
            console.log('📦 Using token:', savedToken.substring(0, 50) + '... (length: ' + savedToken.length + ')');

            // For now, let's trust tokens that look like valid JWTs without network validation
            // This prevents network issues from invalidating good tokens
            if (savedToken.startsWith('eyJ') && savedToken.length > 100) {
                console.log('✅ Using saved OAuth token (format looks valid)');
                return savedToken;
            }

            // Only validate if the token format looks suspicious
            console.log('🔍 Token format looks unusual, validating...');
            const isValid = await validateToken(savedToken);
            if (isValid) {
                console.log('✅ Using saved OAuth token (validated)');
                return savedToken;
            } else {
                console.log('❌ Saved token is invalid, clearing it');
                clearStoredToken();
            }
        } else {
            console.log('📭 No stored token found in either location');
        }

        // Start Google OAuth flow
        console.log('🔐 Starting Google OAuth authentication...');
        const token = await authenticateWithGoogle();

        if (token) {
            console.log('🎯 Received new token from auth flow:', token.substring(0, 50) + '...');

            // For new tokens, always try to validate but don't fail if validation fails
            try {
                const isValid = await validateToken(token);
                if (isValid) {
                    console.log('✅ New token validated successfully');
                } else {
                    console.log('⚠️ Token validation failed, but proceeding anyway (might be network issue)');
                }
            } catch (error) {
                console.log('⚠️ Token validation threw error, but proceeding anyway:', error.message);
            }

            setStoredToken(token);
            console.log('✅ OAuth authentication successful');
            return token;
        }

        return null;
    }

    async function authenticateWithGoogle() {
        return new Promise((resolve, reject) => {
            // Create a special auth URL that will handle the OAuth flow and return to Heymarket
            const currentUrl = window.location.href;
            const state = Math.random().toString(36).substring(2, 15);

            // Store the callback info for when we return
            GM_setValue('auth_state', state);
            GM_setValue('auth_callback', 'pending');
            GM_setValue('return_url', currentUrl);

            // Build OAuth URL that redirects to our auth page
            const authUrl = new URL('https://galygious.github.io/SMP_Broadcast_Reports_Test/');
            authUrl.searchParams.append('userscript_auth', 'true');
            authUrl.searchParams.append('state', state);
            authUrl.searchParams.append('return_url', encodeURIComponent(currentUrl));

            console.log('🔐 Redirecting to Google authentication...');

            // Show user what's happening
            const shouldProceed = confirm(`🔐 Google Authentication Required

This will redirect you to sign in with Google and then return you back to this page.

Click OK to proceed with authentication.`);

            if (!shouldProceed) {
                reject(new Error('Authentication cancelled by user'));
                return;
            }

            // Set up a listener for when we return
            const checkInterval = setInterval(() => {
                const authResult = GM_getValue('auth_callback', 'pending');
                if (authResult !== 'pending') {
                    clearInterval(checkInterval);

                    if (authResult && authResult.startsWith('eyJ')) {
                        // Success! We got a token
                        GM_setValue('auth_callback', 'pending'); // Reset for next time
                        console.log('✅ Authentication successful');
                        resolve(authResult);
                    } else {
                        // Error or cancellation
                        console.log('❌ Authentication failed');
                        reject(new Error('Authentication failed or cancelled'));
                    }
                }
            }, 1000);

            // Redirect to auth page
            window.location.href = authUrl.toString();
        });
    }

    // Check if we're returning from authentication
    function checkForAuthReturn() {
        const urlParams = new URLSearchParams(window.location.search);
        const isAuthReturn = urlParams.get('userscript_auth_return');
        const token = urlParams.get('token');
        const state = urlParams.get('state');

        if (isAuthReturn && token && state) {
            const expectedState = GM_getValue('auth_state', '');

            console.log('🔍 Auth return details:');
            console.log('  - Token:', token.substring(0, 50) + '... (length: ' + token.length + ')');
            console.log('  - State:', state);
            console.log('  - Expected State:', expectedState);

            if (state === expectedState) {
                // Valid auth return - store the token in BOTH places for redundancy
                console.log('✅ Auth return detected, storing token in auth_callback');
                GM_setValue('auth_callback', token);

                // ALSO store directly in the main token storage as a backup
                console.log('💾 Also storing token directly in main storage');
                setStoredToken(token);

                // Clean up URL parameters
                const cleanUrl = window.location.href.split('?')[0];
                window.history.replaceState({}, document.title, cleanUrl);

                // Debug: Verify storage worked
                setTimeout(() => {
                    console.log('🔍 Verifying token storage after auth return:');
                    debugTokenStorage();
                }, 500);

                // Auto-resume scraping if it was initiated before auth redirect
                console.log('🔍 Checking AUTO_RESUME_SCRAPING flag:', AUTO_RESUME_SCRAPING);
                if (AUTO_RESUME_SCRAPING) {
                    console.log('🔄 Authentication successful! Auto-resuming scraping process...');

                    // Update button text to show we're auto-starting
                    const button = document.getElementById('heymarket-scraper-button');
                    if (button) {
                        button.innerText = '🔄 Authentication successful! Starting scrape...';
                        button.style.backgroundColor = '#17a2b8';
                        button.disabled = true; // Prevent manual clicks during auto-start
                    }

                    // Auto-resume the scraping process after a short delay
                    setTimeout(() => {
                        console.log('🚀 Auto-starting fetchLists() after successful authentication...');
                        fetchLists();
                        AUTO_RESUME_SCRAPING = false; // Reset the flag
                        GM_setValue('auto_resume_scraping', false); // Clear from storage
                        console.log('✅ AUTO_RESUME_SCRAPING flag reset to false');
                    }, 1500); // Give user time to see the success message
                } else {
                    console.log('ℹ️ AUTO_RESUME_SCRAPING is false, not auto-resuming');
                }

                return true;
            } else {
                console.log('❌ Invalid auth state');
                GM_setValue('auth_callback', 'error');
                // Clear auto-resume flag on auth failure
                AUTO_RESUME_SCRAPING = false;
                GM_setValue('auto_resume_scraping', false);
            }
        }

        return false;
    }



    async function validateToken(token) {
        try {
            console.log('🔍 Validating token with Google Apps Script...');

            // Quick validation by trying to verify access
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: GOOGLE_APPS_SCRIPT_URL,
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8'
                    },
                    data: JSON.stringify({
                        userToken: token,
                        action: 'verifyAccess'
                    }),
                    onload: (resp) => {
                        console.log('📡 Token validation response status:', resp.status);
                        console.log('📡 Token validation response text:', resp.responseText);

                        if (resp.status === 200) {
                            try {
                                const parsed = JSON.parse(resp.responseText);
                                resolve(parsed);
                            } catch (e) {
                                console.error('Failed to parse validation response:', resp.responseText);
                                reject(new Error('Failed to parse response'));
                            }
                        } else {
                            reject(new Error(`HTTP ${resp.status}: ${resp.responseText}`));
                        }
                    },
                    onerror: (error) => {
                        console.error('Network error during token validation:', error);
                        reject(error);
                    }
                });
            });

            const isValid = response.ok === true;
            console.log('🎯 Token validation result:', isValid ? 'VALID' : 'INVALID');
            return isValid;
        } catch (error) {
            console.error('❌ Token validation error:', error);
            console.log('🔄 Treating validation failure as network issue, not token issue');
            return false;
        }
    }



    function extractSecurityToken() {
        // Method 1: Try to find token in localStorage
        try {
            const heymarketData = localStorage.getItem('heymarket') || localStorage.getItem('auth') || localStorage.getItem('token');
            if (heymarketData) {
                const parsed = JSON.parse(heymarketData);
                if (parsed.token || parsed.security_token || parsed.authToken) {
                    return parsed.token || parsed.security_token || parsed.authToken;
                }
            }
        } catch (e) {
            console.log("Could not extract token from localStorage:", e);
        }

        // Method 2: Try to find token in sessionStorage
        try {
            const sessionData = sessionStorage.getItem('heymarket') || sessionStorage.getItem('auth') || sessionStorage.getItem('token');
            if (sessionData) {
                const parsed = JSON.parse(sessionData);
                if (parsed.token || parsed.security_token || parsed.authToken) {
                    return parsed.token || parsed.security_token || parsed.authToken;
                }
            }
        } catch (e) {
            console.log("Could not extract token from sessionStorage:", e);
        }

        // Method 3: Try to extract from global window objects
        try {
            if (window.heymarket && window.heymarket.token) {
                return window.heymarket.token;
            }
            if (window.app && window.app.token) {
                return window.app.token;
            }
            if (window.auth && window.auth.token) {
                return window.auth.token;
            }
        } catch (e) {
            console.log("Could not extract token from window objects:", e);
        }

        // Method 4: Try to find in page's script tags or meta tags
        try {
            const scripts = document.querySelectorAll('script');
            for (let script of scripts) {
                if (script.textContent.includes('security-token') || script.textContent.includes('auth-token')) {
                    const tokenMatch = script.textContent.match(/["']([A-Za-z0-9+/=]{30,})["']/);
                    if (tokenMatch) {
                        return tokenMatch[1];
                    }
                }
            }
        } catch (e) {
            console.log("Could not extract token from scripts:", e);
        }

        // Method 5: Try to inspect network requests (last resort)
        console.warn("Could not extract security token from storage or scripts.");
        console.log("💡 To manually get the token:");
        console.log("1. Open DevTools (F12) → Network tab");
        console.log("2. Perform any action in Heymarket (like viewing a contact)");
        console.log("3. Look for requests to api-prod-client.heymarket.com");
        console.log("4. Check request headers for 'x-emb-security-token'");
        console.log("5. Copy that value and update the userscript");

        return null;
    }

    async function checkIfDateAlreadyExported(sheetDate, userToken, isRetry = false) {
        try {
            console.log(`Checking if data for ${sheetDate} has already been exported...`);

            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: GOOGLE_APPS_SCRIPT_URL,
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8'
                    },
                    data: JSON.stringify({
                        userToken: userToken,
                        action: 'getSheetNames'
                    }),
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const result = JSON.parse(response.responseText);
                                resolve(result);
                            } catch (e) {
                                reject(new Error("Failed to parse response from Google Apps Script"));
                            }
                        } else {
                            reject(new Error(`Google Apps Script request failed with status: ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`Network error when checking sheets: ${error.statusText}`));
                    }
                });
            });

            // Check if this is a token expiration error
            if (response.error && response.error.includes('Invalid or expired token')) {
                console.log('🔄 Token expired while checking sheets, attempting to refresh...');

                if (!isRetry) {
                    clearStoredToken();
                    const newToken = await promptForOAuthToken();
                    if (newToken) {
                        console.log('✅ Got new token, retrying sheet check...');
                        return await checkIfDateAlreadyExported(sheetDate, newToken, true);
                    }
                }

                console.warn("Token refresh failed, continuing with export");
                return false;
            }

            // Check if any sheet name starts with the broadcast date
            const sheetNames = response.sheetNames || [];
            return sheetNames.some(name => name.startsWith(sheetDate));
        } catch (error) {
            console.warn("Could not check existing sheets:", error);

            // Check if this is a token error and we haven't retried yet
            if (error.message.includes('Invalid or expired token') && !isRetry) {
                console.log('🔄 Detected token error in sheet check, attempting refresh...');
                clearStoredToken();

                const newToken = await promptForOAuthToken();
                if (newToken) {
                    console.log('✅ Got new token, retrying sheet check...');
                    return await checkIfDateAlreadyExported(sheetDate, newToken, true);
                }
            }

            return false; // Continue with export if check fails
        }
    }

    // Mapping of inbox_id to brand name
    const BRAND_MAP = {
        '80071': 'BOOKING',
        '80158': 'SCHEDULE',
        '80157': 'RESERVE',
        '80159': 'SESSIONS'
    };

    let allData = [];
    let listData = [];
    let processedLists = new Set();
    let totalReportsToProcess = 0;
    let reportsProcessed = 0;

    function formatPhoneNumber(number) {
        // Remove leading '1' and format as ' (XXX) XXX-XXXX'
        const cleaned = ('' + number).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{1})(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `1 (${match[2]}) ${match[3]}-${match[4]}`;
        }
        return number;
    }

    // A simple CSV utility
    function arrayToCSV(data, headers) {
        let csvContent = "";
        if (headers) {
            csvContent += headers.join(",") + "\n";
        }
        data.forEach(row => {
            let rowString = row.map(cell => {
                if (typeof cell === 'string') {
                    // Escape double quotes and enclose in double quotes
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(",");
            csvContent += rowString + "\n";
        });
        return csvContent;
    }

    async function sendToGoogleSheets(userToken, sheetDate, isRetry = false) {
        if (allData.length === 0) {
            console.log("No data to send to Google Sheets.");
            return;
        }

        // Prepare headers
        const headers = ["Brand", "Fname", "Lname", "Number", "Initial Send Time", "Failed", "Response", "Response Time (Central)", "Conversation ID"];
        for (let i = 1; i <= MAX_CONVERSATION_MESSAGES; i++) {
            headers.push(`Message ${i}`);
        }

        // Create 2D array for Google Sheets (headers + data)
        const values = [headers, ...allData];

        try {
            console.log("Sending data to Google Sheets...");

            // Use GM_xmlhttpRequest for the POST request
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: GOOGLE_APPS_SCRIPT_URL,
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8'
                    },
                    data: JSON.stringify({
                        userToken: userToken,
                        action: 'appendData',
                        sheetDate: sheetDate,
                        values: values
                    }),
                    onload: (response) => {
                        console.log("Google Apps Script response status:", response.status);
                        console.log("Google Apps Script response:", response.responseText);

                        if (response.status === 200) {
                            try {
                                const result = JSON.parse(response.responseText);
                                resolve(result);
                            } catch (e) {
                                console.error("Failed to parse Google Apps Script response:", response.responseText);
                                reject(new Error("Failed to parse response from Google Apps Script"));
                            }
                        } else {
                            console.error("Google Apps Script error response:", response.responseText);
                            reject(new Error(`Google Apps Script request failed with status: ${response.status} - ${response.responseText}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`Network error when sending to Google Sheets: ${error.statusText}`));
                    }
                });
            });

            if (response.ok) {
                console.log(`✅ Data successfully sent to Google Sheets! Sheet name: ${response.sheetName}`);
                console.log(`📊 Sent ${allData.length} rows of data to Google Sheets`);

                // Update button to show success
                const button = document.getElementById('heymarket-scraper-button');
                if (button) {
                    button.innerText = '✅ Success! Data sent to Sheets';
                    button.style.backgroundColor = '#28a745';
                    button.disabled = false;

                    // Reset to normal state after 5 seconds
                    setTimeout(() => {
                        if (SECURITY_TOKEN) {
                            button.innerText = '✅ Run Heymarket Scraper (Token Ready)';
                            button.style.backgroundColor = '#28a745';
                        } else {
                            button.innerText = '⏳ Run Heymarket Scraper (Waiting for Token)';
                            button.style.backgroundColor = '#ffc107';
                        }
                    }, 5000);
                }

                // Show success message to user
                alert(`Success! Data for ${sheetDate} sent to Google Sheets.\nSheet: ${response.sheetName}\nRows: ${allData.length}`);
            } else {
                // Check if this is a token expiration error
                if (response.error && response.error.includes('Invalid or expired token')) {
                    console.log('🔄 Token expired, attempting to refresh...');

                    if (!isRetry) {
                        // Clear the expired token
                        clearStoredToken();

                        // Get a new token
                        const newToken = await promptForOAuthToken();
                        if (newToken) {
                            console.log('✅ Got new token, retrying send to Google Sheets...');
                            // Retry with the new token
                            return await sendToGoogleSheets(newToken, sheetDate, true);
                        } else {
                            throw new Error("Failed to refresh expired token");
                        }
                    } else {
                        throw new Error("Token refresh failed - still getting expired token error");
                    }
                } else {
                    throw new Error(`Google Apps Script error: ${response.error || 'Unknown error'}`);
                }
            }
        } catch (error) {
            console.error("❌ Failed to send data to Google Sheets:", error);

            // Check if this is a token error and we haven't retried yet
            if (error.message.includes('Invalid or expired token') && !isRetry) {
                console.log('🔄 Detected token error, attempting refresh...');
                clearStoredToken();

                const newToken = await promptForOAuthToken();
                if (newToken) {
                    console.log('✅ Got new token, retrying send to Google Sheets...');
                    return await sendToGoogleSheets(newToken, sheetDate, true);
                }
            }

            alert(`Failed to send data to Google Sheets: ${error.message}\n\nA CSV file will be downloaded as a backup.`);

            // Fallback: still offer CSV download
            console.log("Offering CSV download as fallback...");
            downloadCSVFallback();
        }
    }

    function downloadCSVFallback() {
        if (allData.length === 0) {
            console.log("No data to download.");
            return;
        }

        const headers = ["Brand", "Fname", "Lname", "Number", "Initial Send Time", "Failed", "Response", "Response Time (Central)", "Conversation ID"];
        for (let i = 1; i <= MAX_CONVERSATION_MESSAGES; i++) {
            headers.push(`Message ${i}`);
        }

        const csv = arrayToCSV(allData, headers);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "heymarket_data_fallback.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("Fallback CSV download initiated.");
    }

    async function fetchWithToken(url, options) {
        options.headers = options.headers || {};
        options.headers['x-emb-security-token'] = SECURITY_TOKEN;
        options.headers['content-type'] = 'application/json;charset=UTF-8';
        options.method = options.method || 'POST';

        // Use GM_xmlhttpRequest for cross-origin requests
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method,
                url: url,
                headers: options.headers,
                data: options.body,
                onload: (response) => {
                    if (response.status === 200) {
                        try {
                            const json = JSON.parse(response.responseText);
                            resolve(json);
                        } catch (e) {
                            reject(new Error("Failed to parse JSON response."));
                        }
                    } else {
                        reject(new Error(`Request failed with status: ${response.status}`));
                    }
                },
                onerror: (error) => {
                    reject(new Error(`Network error: ${error.statusText}`));
                }
            });
        });
    }

    function updateButtonForScrapingStart() {
        const button = document.getElementById('heymarket-scraper-button');
        if (button) {
            button.innerText = '🔄 Scraping in progress...';
            button.style.backgroundColor = '#17a2b8';
            button.disabled = false; // Re-enable button but show it's working
        }
    }

    async function fetchLists() {
        // Update button to show scraping has started
        updateButtonForScrapingStart();

        // Try to use intercepted token first, then fall back to extraction
        if (!SECURITY_TOKEN) {
            console.log("🔍 No token intercepted yet, trying manual extraction...");
            SECURITY_TOKEN = extractSecurityToken();
        }

        if (!SECURITY_TOKEN) {
            alert("❌ Could not extract security token from Heymarket session.\n\nPlease:\n1. Make sure you're logged into Heymarket\n2. Navigate around the Heymarket interface to trigger some API calls\n3. Refresh the page if needed\n4. Try running the script again");

            // Reset button state on error
            const button = document.getElementById('heymarket-scraper-button');
            if (button && button.disabled) {
                button.disabled = false;
                button.innerText = '❌ Error - Try Again';
                button.style.backgroundColor = '#dc3545';
            }
            return;
        }
        console.log("✅ Security token available:", SECURITY_TOKEN.substring(0, 20) + '...');

        // Get OAuth token from secure storage
        const userToken = await promptForOAuthToken();
        if (!userToken) {
            alert("❌ OAuth token is required to save data to Google Sheets.");

            // Reset button state on error
            const button = document.getElementById('heymarket-scraper-button');
            if (button && button.disabled) {
                button.disabled = false;
                button.innerText = '❌ Error - Try Again';
                button.style.backgroundColor = '#dc3545';
            }
            return;
        }

        // We'll check for existing data after we determine the broadcast date
        // This happens in fetchBroadcasts() now

        console.log("Fetching lists...");
        const url = "https://api-prod-client.heymarket.com/v4/lists/fetch";
        const body = {
            filter: "MY",
            archived: false,
            ascending: false,
            order: "updated",
            team_id: TEAM_ID,
            type: "lists",
            resetLocalList: true,
            date: new Date().toISOString()
        };

        try {
            const response = await fetchWithToken(url, { body: JSON.stringify(body) });
            listData = response.lists;
            console.log(`Found ${listData.length} lists.`);
            await fetchBroadcasts(response.broadcasts, userToken);
        } catch (error) {
            console.error("Error fetching lists:", error);

            // Reset button state on error
            const button = document.getElementById('heymarket-scraper-button');
            if (button) {
                button.disabled = false;
                button.innerText = '❌ Error - Try Again';
                button.style.backgroundColor = '#dc3545';
            }
        }
    }

    async function fetchBroadcasts(broadcasts, userToken) {
        console.log("Processing broadcasts...");

        // Extract dates from broadcasts to determine the sheet date
        const broadcastDates = broadcasts.map(b => new Date(b.date)).filter(date => !isNaN(date));
        const earliestDate = broadcastDates.length > 0 ? new Date(Math.min(...broadcastDates)) : new Date();
        const sheetDate = earliestDate.toISOString().slice(0, 10); // YYYY-MM-DD format

        console.log(`Broadcasts date range: ${broadcastDates.length > 0 ? 'earliest=' + sheetDate : 'no valid dates, using today'}`);

        // Check if this date's data has already been exported
        const alreadyExported = await checkIfDateAlreadyExported(sheetDate, userToken);
        if (alreadyExported) {
            const overwrite = confirm(`⚠️ Data for ${sheetDate} has already been exported to Google Sheets.\n\nDo you want to OVERWRITE the existing data?\n\nClick OK to overwrite, or Cancel to abort.`);
            if (!overwrite) {
                console.log("Export cancelled by user - data already exists for this date.");
                alert("Export cancelled. Data already exists for this date.");
                return;
            }
            console.log(`User chose to overwrite existing data for ${sheetDate}`);
        }

        const reportPromises = broadcasts.map(b => processBroadcast(b));
        totalReportsToProcess = reportPromises.length;
        await Promise.all(reportPromises);
        console.log("All broadcasts processed. Sending to Google Sheets.");
        await sendToGoogleSheets(userToken, sheetDate);
    }

    async function processBroadcast(broadcast) {
        if (processedLists.has(broadcast.id)) {
            console.log(`Skipping broadcast ${broadcast.id} as it's already been processed.`);
            return;
        }
        processedLists.add(broadcast.id);

        console.log(`Fetching report for broadcast ID: ${broadcast.id}`);
        const url = "https://api-prod-client.heymarket.com/v2/broadcast/report";
        const body = {
            list_id: broadcast.list_id,
            broadcast_id: broadcast.id,
            team_id: TEAM_ID
        };

        const brand = BRAND_MAP[broadcast.inbox_id] || 'Unknown Brand';

        try {
            const report = await fetchWithToken(url, { body: JSON.stringify(body) });
            const listInfo = listData.find(l => l.id === broadcast.list_id) || {};

            const contactPromises = report.contacts.map(contact => processContact(contact, brand, listInfo, broadcast.date));
            const results = await Promise.all(contactPromises);
            allData = allData.concat(results);
            reportsProcessed++;
            console.log(`Processed ${reportsProcessed} of ${totalReportsToProcess} reports.`);
        } catch (error) {
            console.error(`Error fetching report for broadcast ${broadcast.id}:`, error);
        }
    }

    async function processContact(contact, brand, listInfo, initialSendTime) {
        const number = formatPhoneNumber(contact.target);
        const contactInfo = listInfo.targets?.[contact.target] || {};
        const fname = contactInfo.f || "N/A";
        const lname = contactInfo.l || "N/A";
        const failed = contact.status === "failed" ? "X" : "";
        const hasResponse = contact.response_time !== "0001-01-01T00:00:00Z" ? "X" : "";
        const responseTime = hasResponse === "X" ? new Date(contact.response_time).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : "";

        let conversation = [];
        if (hasResponse === "X" && contact.conversation_id) {
            conversation = await fetchConversation(contact.conversation_id);
        }

        const row = [
            brand,
            fname,
            lname,
            number,
            new Date(initialSendTime).toLocaleString('en-US', { timeZone: 'America/Chicago' }),
            failed,
            hasResponse,
            responseTime,
            contact.conversation_id || ""
        ];

        // Add conversation messages
        for (let i = 0; i < MAX_CONVERSATION_MESSAGES; i++) {
            row.push(conversation[i] || "");
        }

        return row;
    }

    async function fetchConversation(conversationId) {
        const url = "https://api-prod-client.heymarket.com/v2/messages/fetch";
        const body = {
            parent_id: conversationId,
            team_id: TEAM_ID,
            date: new Date().toISOString(),
            filter: "ALL",
            ascending: false,
            type: "messages"
        };
        const messages = [];

        try {
            const response = await fetchWithToken(url, { body: JSON.stringify(body) });
            const conversationMessages = response.messages
                .filter(m => m.type === 'text')
                .reverse()
                .map(m => {
                    const direction = m.sender === m.target ? "-> You" : "You ->";
                    return `${direction}: ${m.text}`;
                });
            messages.push(...conversationMessages);
        } catch (error) {
            console.error(`Error fetching conversation ${conversationId}:`, error);
        }
        return messages;
    }

    function createUI() {
        // Check if button already exists to prevent duplicates
        const existingButton = document.getElementById('heymarket-scraper-button');
        if (existingButton) {
            console.log('Button already exists, updating it instead of creating a new one');
            updateExistingButton(existingButton);
            return;
        }

        // Wait for DOM to be ready
        function waitForBody(callback) {
            if (document.body) {
                callback();
            } else {
                console.log('Waiting for document.body to be available...');
                setTimeout(() => waitForBody(callback), 100);
            }
        }

        waitForBody(() => {
            const button = document.createElement('button');
            button.id = 'heymarket-scraper-button'; // Add ID to prevent duplicates

            // Update button text based on token status
            function updateButtonText() {
                // If button is disabled (auto-starting), don't change the text
                if (button.disabled) {
                    return;
                }

                if (SECURITY_TOKEN) {
                    button.innerText = '✅ Run Heymarket Scraper (Token Ready)';
                    button.style.backgroundColor = '#28a745';
                } else {
                    button.innerText = '⏳ Run Heymarket Scraper (Waiting for Token)';
                    button.style.backgroundColor = '#ffc107';
                }
            }

            updateButtonText();

            // Check for token every 2 seconds and update button
            setInterval(updateButtonText, 2000);

            Object.assign(button.style, {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: '10000',
                padding: '10px 20px',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
            });

            button.addEventListener('click', (event) => {
                // Prevent event bubbling to avoid triggering other click handlers (like header fold/unfold)
                event.stopPropagation();

                console.log("🔥 BUTTON CLICKED - Starting Heymarket data scrape...");
                console.log("🔍 Current SECURITY_TOKEN:", SECURITY_TOKEN ? SECURITY_TOKEN.substring(0, 20) + '...' : 'NULL');

                // Set flag to auto-resume if auth is needed (persist across page reloads)
                AUTO_RESUME_SCRAPING = true;
                GM_setValue('auto_resume_scraping', true);

                // Run debug function to see token status
                debugTokenStorage();

                allData = []; // Clear previous data
                processedLists = new Set();
                reportsProcessed = 0;
                totalReportsToProcess = 0;

                console.log("🚀 About to call fetchLists()...");
                fetchLists();
            });

            document.body.appendChild(button);
            console.log('✅ Heymarket scraper button created successfully');
        });
    }

    function updateExistingButton(button) {
        // Update existing button text based on token status
        function updateButtonText() {
            // If button is disabled (auto-starting), don't change the text
            if (button.disabled) {
                return;
            }

            if (SECURITY_TOKEN) {
                button.innerText = '✅ Run Heymarket Scraper (Token Ready)';
                button.style.backgroundColor = '#28a745';
            } else {
                button.innerText = '⏳ Run Heymarket Scraper (Waiting for Token)';
                button.style.backgroundColor = '#ffc107';
            }
        }

        updateButtonText();

        // Clear any existing intervals and set a new one
        if (button.updateInterval) {
            clearInterval(button.updateInterval);
        }
        button.updateInterval = setInterval(updateButtonText, 2000);

        // CRITICAL: Ensure the button has a click handler
        // Remove any existing click handlers first
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        // Add the click handler to the new button
        newButton.addEventListener('click', (event) => {
            // Prevent event bubbling to avoid triggering other click handlers (like header fold/unfold)
            event.stopPropagation();

            console.log("🔥 BUTTON CLICKED (existing button) - Starting Heymarket data scrape...");
            console.log("🔍 Current SECURITY_TOKEN:", SECURITY_TOKEN ? SECURITY_TOKEN.substring(0, 20) + '...' : 'NULL');

            // Set flag to auto-resume if auth is needed
            AUTO_RESUME_SCRAPING = true;

            // Run debug function to see token status
            debugTokenStorage();

            allData = []; // Clear previous data
            processedLists = new Set();
            reportsProcessed = 0;
            totalReportsToProcess = 0;

            console.log("🚀 About to call fetchLists()...");
            fetchLists();
        });

        // Continue the update interval on the new button
        newButton.updateInterval = setInterval(updateButtonText, 2000);
    }

    // Always ensure UI is created, regardless of auth status
    function initializeUI() {
        // Check if we're returning from authentication
        const isAuthReturn = checkForAuthReturn();

        if (isAuthReturn) {
            console.log('✅ Returned from authentication, waiting a moment then creating UI...');
            // Wait a bit for the page to settle after auth return
            setTimeout(() => {
                createUI();
            }, 1000);
        } else {
            // Normal page load, create UI immediately (with DOM ready check)
            createUI();
        }
    }

    // Initialize the UI
    initializeUI();

    // Also create UI when the page fully loads as a fallback
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(createUI, 500); // Small delay to ensure everything is ready
        });
    }

    // Final fallback - ensure UI exists after a delay
    setTimeout(() => {
        const existingButton = document.getElementById('heymarket-scraper-button');
        if (!existingButton) {
            console.log('🔄 Final fallback: Creating UI after delay...');
            createUI();
        }
    }, 3000);
})();