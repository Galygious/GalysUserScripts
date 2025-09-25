// ==UserScript==
// @name         CSV Email Sender
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Upload CSV with contact info and send templated emails to each contact
// @author       Your Name
// @match        https://www.pixifi.com/admin/leads/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      www.pixifi.com
// ==/UserScript==

(function() {
    'use strict';

    // ---- CONFIGURATION ----
    let TEMPLATES = {
        'SCHEDULE': 310037,
        'SESSIONS': 310037,
        'BOOKING': 310037,
        'RESERVE': 310037,
        'N/A': 310037, // Default template
    };
    let BRAND_IDS = {
        'BOOKING': '11473',
        'SCHEDULE': '18826',
        'RESERVE': '19647',
        'SESSIONS': '15793',
        'N/A': '11634', // Default to Support if brand not found
    };
    let CONCURRENCY_LIMIT = 5; // Limit simultaneous email sends
    let CLIENT_ID = '12295'; // Fixed client ID
    let DEFAULT_BRAND = 'N/A'; // Default brand when detection fails

    // ---- GLOBALS ----
    let csvData = [];
    let isProcessing = false;
    let configProfiles = {}; // Store configuration profiles
    let currentProfile = 'abandoned-resends'; // Current active profile name
    let isInterfaceVisible = false; // Track if the interface is currently visible
    let csvInterface = null; // Reference to the interface element

    // ---- STYLES ----
    GM_addStyle(`
        #csv-email-sender {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            background: white;
            border: 2px solid #007bff;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
            max-height: 80vh;
            overflow-y: auto;
        }
        #csv-email-sender h3 {
            margin: 0 0 15px 0;
            color: #007bff;
            text-align: center;
        }
        .csv-control-group {
            margin-bottom: 15px;
        }
        .csv-control-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #333;
        }
        .csv-control-group input, .csv-control-group select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .csv-control-group textarea {
            width: 100%;
            height: 80px;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            resize: vertical;
        }
        #csv-upload-btn, #csv-send-btn, #csv-close-btn {
            width: 100%;
            padding: 10px;
            margin: 5px 0;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        #csv-upload-btn {
            background-color: #28a745;
            color: white;
        }
        #csv-send-btn {
            background-color: #007bff;
            color: white;
        }
        #csv-close-btn {
            background-color: #dc3545;
            color: white;
        }
        #csv-upload-btn:hover, #csv-send-btn:hover {
            opacity: 0.8;
        }
        #csv-close-btn:hover {
            background-color: #c82333;
        }
        #csv-preview {
            margin-top: 15px;
            padding: 10px;
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
        }
        #csv-results {
            margin-top: 15px;
            padding: 10px;
            background-color: #fff;
            border: 1px solid #ccc;
            border-radius: 4px;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 12px;
        }
        .csv-status {
            margin-top: 10px;
            padding: 8px;
            border-radius: 4px;
            font-weight: bold;
        }
        .csv-status.success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .csv-status.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .csv-status.info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .csv-minimize-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #007bff;
        }
        .csv-minimized {
            width: 50px;
            height: 50px;
            overflow: hidden;
        }
        .csv-minimized #csv-content {
            display: none;
        }
        .csv-config-panel {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 15px;
            margin-top: 15px;
            display: none;
        }
        .csv-config-panel.show {
            display: block;
        }
        .csv-config-row {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            gap: 10px;
            flex-wrap: wrap;
        }
        .csv-config-row label {
            min-width: 80px;
            font-weight: bold;
            margin: 0;
        }
        .csv-config-row input {
            flex: 1;
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 3px;
        }
        .csv-config-toggle {
            background-color: #6c757d;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 10px;
        }
        .csv-config-toggle:hover {
            background-color: #5a6268;
        }
        .csv-profile-section {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 15px;
        }
        .csv-profile-section h5 {
            margin: 0 0 10px 0;
            color: #495057;
            font-size: 14px;
        }
        .csv-profile-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            margin-left: 5px;
            transition: all 0.2s;
        }
        .csv-profile-btn:hover {
            opacity: 0.8;
        }
        .csv-profile-btn.save {
            background-color: #28a745;
            color: white;
        }
        .csv-profile-btn.load {
            background-color: #17a2b8;
            color: white;
        }
        .csv-profile-btn.delete {
            background-color: #dc3545;
            color: white;
        }
        .csv-mode-btn {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #dee2e6;
            background-color: #f8f9fa;
            color: #495057;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        .csv-mode-btn:hover {
            background-color: #e9ecef;
        }
        .csv-mode-btn.active {
            background-color: #007bff;
            color: white;
            border-color: #007bff;
        }
        .csv-input-mode {
            margin-top: 10px;
        }
        .csv-tab-container {
            margin-bottom: 15px;
        }
        .csv-tab-buttons {
            display: flex;
            border-bottom: 2px solid #dee2e6;
            margin-bottom: 15px;
        }
        .csv-tab-btn {
            flex: 1;
            padding: 10px 15px;
            border: none;
            background-color: #f8f9fa;
            color: #495057;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.2s;
            border-bottom: 2px solid transparent;
        }
        .csv-tab-btn:hover {
            background-color: #e9ecef;
        }
        .csv-tab-btn.active {
            background-color: #007bff;
            color: white;
            border-bottom-color: #007bff;
        }
        .csv-tab-content {
            display: none;
        }
        .csv-tab-content.active {
            display: block;
        }
        .csv-bottom-buttons {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #dee2e6;
        }
    `);

    // ---- HELPER FUNCTIONS ----

    function getLeadIdFromUrl(url = null) {
        // Extract lead ID from URL like https://www.pixifi.com/admin/leads/12345
        const targetUrl = url || window.location.href;
        console.log(`🔍 Checking URL for lead ID: ${targetUrl}`);

        // Try multiple patterns to extract lead ID
        let leadMatch = targetUrl.match(/\/admin\/leads\/(\d+)/);
        if (!leadMatch) {
            // Try pattern with trailing slash
            leadMatch = targetUrl.match(/\/admin\/leads\/(\d+)\//);
        }
        if (!leadMatch) {
            // Try pattern with query parameters
            leadMatch = targetUrl.match(/\/admin\/leads\/(\d+)[\?#]/);
        }
        console.log(`🔍 Regex match result:`, leadMatch);

        if (leadMatch && leadMatch[1]) {
            console.log(`📍 Lead ID extracted from URL: ${leadMatch[1]}`);
            return leadMatch[1];
        }
        // Fallback to '0' if no lead ID found
        console.log(`⚠️ No lead ID found in URL: ${targetUrl}, using fallback '0'`);
        return '0';
    }

    function getLeadIdFromContact(contact) {
        // Extract lead ID from contact's profile link
        const profileLink = contact['event link'];
        if (profileLink && profileLink.trim()) {
            console.log(`🔗 Extracting lead ID from contact's profile link: ${profileLink}`);
            return getLeadIdFromUrl(profileLink);
        }
        console.log(`⚠️ No profile link found for ${contact.name}, using fallback '0'`);
        return '0';
    }

    function loadConfiguration() {
        const savedTemplates = GM_getValue('csv_templates', null);
        const savedBrandIds = GM_getValue('csv_brand_ids', null);
        const savedConcurrency = GM_getValue('csv_concurrency', null);
        const savedClientId = GM_getValue('csv_client_id', null);
        const savedDefaultBrand = GM_getValue('csv_default_brand', null);

        if (savedTemplates) TEMPLATES = savedTemplates;
        if (savedBrandIds) BRAND_IDS = savedBrandIds;
        if (savedConcurrency) CONCURRENCY_LIMIT = savedConcurrency;
        if (savedClientId) CLIENT_ID = savedClientId;
        if (savedDefaultBrand) DEFAULT_BRAND = savedDefaultBrand;
    }

    function saveConfiguration() {
        GM_setValue('csv_templates', TEMPLATES);
        GM_setValue('csv_brand_ids', BRAND_IDS);
        GM_setValue('csv_concurrency', CONCURRENCY_LIMIT);
        GM_setValue('csv_client_id', CLIENT_ID);
        GM_setValue('csv_default_brand', DEFAULT_BRAND);
    }

    function loadConfigProfiles() {
        const savedProfiles = GM_getValue('csv_config_profiles', {});
        configProfiles = savedProfiles || {};

        // Clean up any old "default" profile if it exists and is just a duplicate of abandoned-resends
        if (configProfiles['default'] && configProfiles['abandoned-resends']) {
            const defaultProfile = configProfiles['default'];
            const abandonedProfile = configProfiles['abandoned-resends'];

            // Check if default profile is essentially the same as abandoned-resends
            const isDuplicate = (
                defaultProfile.templates &&
                abandonedProfile.templates &&
                JSON.stringify(defaultProfile.templates) === JSON.stringify(abandonedProfile.templates) &&
                defaultProfile.brandIds &&
                abandonedProfile.brandIds &&
                JSON.stringify(defaultProfile.brandIds) === JSON.stringify(abandonedProfile.brandIds)
            );

            if (isDuplicate) {
                delete configProfiles['default'];
            }
        }

        // Ensure preset profiles exist
        if (!configProfiles['abandoned-resends']) {
            configProfiles['abandoned-resends'] = {
                name: 'Abandoned Resends',
                templates: {
                    'SCHEDULE': 310421,
                    'SESSIONS': 310421,
                    'BOOKING': 310421,
                    'RESERVE': 310421,
                    'N/A': 310421
                },
                brandIds: BRAND_IDS,
                concurrency: 5,
                clientId: CLIENT_ID,
                defaultBrand: DEFAULT_BRAND
            };
        }

        if (!configProfiles['regular-resends']) {
            configProfiles['regular-resends'] = {
                name: 'Regular Resends',
                templates: {
                    'SCHEDULE': 308509,
                    'SESSIONS': 308508,
                    'BOOKING': 308507,
                    'RESERVE': 299242,
                    'N/A': 243952
                },
                brandIds: BRAND_IDS,
                concurrency: 5,
                clientId: CLIENT_ID,
                defaultBrand: DEFAULT_BRAND
            };
        }

        // Save the cleaned up profiles
        saveConfigProfiles();

        return configProfiles;
    }

    function saveConfigProfiles() {
        GM_setValue('csv_config_profiles', configProfiles);
    }

    function saveCurrentAsProfile(profileName) {
        if (!profileName || profileName.trim() === '') {
            throw new Error('Profile name cannot be empty');
        }

        configProfiles[profileName] = {
            name: profileName,
            templates: { ...TEMPLATES },
            brandIds: { ...BRAND_IDS },
            concurrency: CONCURRENCY_LIMIT,
            clientId: CLIENT_ID,
            defaultBrand: DEFAULT_BRAND
        };

        saveConfigProfiles();
        currentProfile = profileName;
        showStatus(`Configuration saved as "${profileName}"`, 'success');
    }

    function loadProfile(profileName) {
        if (!configProfiles[profileName]) {
            throw new Error(`Profile "${profileName}" not found`);
        }

        const profile = configProfiles[profileName];
        TEMPLATES = { ...profile.templates };
        BRAND_IDS = { ...profile.brandIds };
        CONCURRENCY_LIMIT = profile.concurrency;
        CLIENT_ID = profile.clientId;
        DEFAULT_BRAND = profile.defaultBrand;

        currentProfile = profileName;
        saveConfiguration(); // Save as current config
        updateConfigInputs();
        updateProfileDropdown();
        showStatus(`Loaded configuration "${profileName}"`, 'success');
    }

    function deleteProfile(profileName) {
        const protectedProfiles = ['abandoned-resends', 'regular-resends'];
        if (protectedProfiles.includes(profileName)) {
            throw new Error('Cannot delete preset profiles');
        }

        if (!configProfiles[profileName]) {
            throw new Error(`Profile "${profileName}" not found`);
        }

        delete configProfiles[profileName];
        saveConfigProfiles();

        // If we deleted the current profile, switch to abandoned resends
        if (currentProfile === profileName) {
            loadProfile('abandoned-resends');
        }

        showStatus(`Profile "${profileName}" deleted`, 'success');
    }

    function getProfileNames() {
        return Object.keys(configProfiles).sort();
    }


    function updateConfigInputs() {
        // Update template inputs
        Object.keys(TEMPLATES).forEach(brand => {
            const input = document.getElementById(`template-${brand}`);
            if (input) input.value = TEMPLATES[brand];
        });

        // Update brand ID inputs
        Object.keys(BRAND_IDS).forEach(brand => {
            const input = document.getElementById(`brand-${brand}`);
            if (input) input.value = BRAND_IDS[brand];
        });

        // Update other inputs
        const concurrencyInput = document.getElementById('concurrency-limit');
        if (concurrencyInput) concurrencyInput.value = CONCURRENCY_LIMIT;

        const clientIdInput = document.getElementById('client-id');
        if (clientIdInput) clientIdInput.value = CLIENT_ID;

        const defaultBrandInput = document.getElementById('default-brand');
        if (defaultBrandInput) defaultBrandInput.value = DEFAULT_BRAND;
    }

    function updateProfileDropdown() {
        const profileSelect = document.getElementById('config-profile-select');
        if (!profileSelect) return; // UI not created yet

        // Clear existing options
        profileSelect.innerHTML = '';

        // Add all profile options
        const profileNames = getProfileNames();
        profileNames.forEach(profileName => {
            const option = document.createElement('option');
            option.value = profileName;
            option.textContent = configProfiles[profileName].name;
            if (profileName === currentProfile) {
                option.selected = true;
            }
            profileSelect.appendChild(option);
        });
    }

    function handleSaveProfile() {
        const profileNameInput = document.getElementById('new-profile-name');
        if (!profileNameInput) return; // UI not created yet

        const profileName = profileNameInput.value.trim();

        if (!profileName) {
            showStatus('Please enter a profile name', 'error');
            return;
        }

        try {
            saveCurrentAsProfile(profileName);
            updateProfileDropdown();
            profileNameInput.value = ''; // Clear input
        } catch (error) {
            showStatus(`Error saving profile: ${error.message}`, 'error');
        }
    }


    function handleDeleteProfile() {
        const profileSelect = document.getElementById('config-profile-select');
        if (!profileSelect) return; // UI not created yet

        const selectedProfile = profileSelect.value;

        if (!confirm(`Are you sure you want to delete the profile "${configProfiles[selectedProfile].name}"?`)) {
            return;
        }

        try {
            deleteProfile(selectedProfile);
            updateProfileDropdown();
        } catch (error) {
            showStatus(`Error deleting profile: ${error.message}`, 'error');
        }
    }

    function applyConfiguration() {
        // Update templates
        Object.keys(TEMPLATES).forEach(brand => {
            const input = document.getElementById(`template-${brand}`);
            if (input) {
                const value = parseInt(input.value.trim());
                if (!isNaN(value)) TEMPLATES[brand] = value;
            }
        });

        // Update brand IDs
        Object.keys(BRAND_IDS).forEach(brand => {
            const input = document.getElementById(`brand-${brand}`);
            if (input) {
                const value = input.value.trim();
                if (value) BRAND_IDS[brand] = value;
            }
        });

        // Update other settings
        const concurrencyInput = document.getElementById('concurrency-limit');
        if (concurrencyInput) {
            const value = parseInt(concurrencyInput.value.trim());
            if (!isNaN(value) && value > 0) CONCURRENCY_LIMIT = value;
        }

        const clientIdInput = document.getElementById('client-id');
        if (clientIdInput) {
            const value = clientIdInput.value.trim();
            if (value) CLIENT_ID = value;
        }

        const defaultBrandInput = document.getElementById('default-brand');
        if (defaultBrandInput) {
            const value = defaultBrandInput.value.trim();
            if (value && ['BOOKING', 'SCHEDULE', 'RESERVE', 'SESSIONS', 'N/A'].includes(value)) {
                DEFAULT_BRAND = value;
            }
        }

        saveConfiguration();
        showStatus('Configuration saved successfully!', 'success');
    }

    async function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV must have at least a header row and one data row');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Define column mappings to handle variations in header names
        const columnMappings = {
            'phone': ['phone'],
            'name': ['name'],
            'eventname': ['eventname', 'event name', 'event', 'session'],
            'event link': ['event link', 'eventlink', 'profile link', 'link'],
            'duedate': ['duedate', 'due date', 'date'],
            'email address': ['email address', 'emailaddress', 'email'],
            'location': ['location'],
            'brand': ['brand']
        };

        // Required columns (others are optional)
        const requiredColumns = ['phone', 'name', 'email address', 'brand'];

        // Map headers to standardized names
        const headerMap = {};
        const foundColumns = new Set();

        headers.forEach((header, index) => {
            for (const [standardName, variations] of Object.entries(columnMappings)) {
                if (variations.includes(header)) {
                    headerMap[index] = standardName;
                    foundColumns.add(standardName);
                    break;
                }
            }
        });

        // Check if all required columns are found
        const missingColumns = requiredColumns.filter(col => !foundColumns.has(col));
        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}. Found headers: ${headers.join(', ')}`);
        }

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    const standardName = headerMap[index];
                    if (standardName) {
                        row[standardName] = values[index];
                    }
                });

                // Add default values for missing optional columns
                if (!row.eventname) row.eventname = 'Session';
                if (!row.duedate) row.duedate = '';
                if (!row.location) row.location = '';
                if (!row['event link']) row['event link'] = '';

                // Use brand from CSV, validate it's a known brand
                const csvBrand = row.brand ? row.brand.toUpperCase() : DEFAULT_BRAND;
                if (['BOOKING', 'SCHEDULE', 'RESERVE', 'SESSIONS', 'N/A'].includes(csvBrand)) {
                    row.brand = csvBrand;
                } else {
                    console.warn(`Unknown brand "${csvBrand}" for ${row.name}, using default: ${DEFAULT_BRAND}`);
                    row.brand = DEFAULT_BRAND;
                }

                data.push(row);
            }
        }

        return data;
    }



    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch (e) {
            return dateString;
        }
    }

    function showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('csv-status');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `csv-status ${type}`;
        } else {
            // UI not created yet, log to console instead
            console.log(`[CSV Email Sender] ${type.toUpperCase()}: ${message}`);
        }
    }

    function updatePreview() {
        const previewDiv = document.getElementById('csv-preview');
        if (!previewDiv) return; // UI not created yet

        if (csvData.length === 0) {
            previewDiv.innerHTML = '<p>No CSV data loaded</p>';
            return;
        }

        const preview = csvData.slice(0, 5).map((row, index) => {
            return `${index + 1}. ${row.name} (${row['email address']}) - ${row.eventname} [${row.brand}] - Due: ${formatDate(row.duedate)}`;
        }).join('\n');

        // Count brands for summary
        const brandCounts = {};
        csvData.forEach(row => {
            brandCounts[row.brand] = (brandCounts[row.brand] || 0) + 1;
        });

        const brandSummary = Object.entries(brandCounts)
            .map(([brand, count]) => `${brand}: ${count}`)
            .join(', ');

        previewDiv.innerHTML = `<strong>Preview (first 5 rows):</strong>\n${preview}\n\n<strong>Total rows:</strong> ${csvData.length}\n<strong>Brands detected:</strong> ${brandSummary}`;
    }

    // ---- API FUNCTIONS ----

    async function fetchTemplateContent(templateId, leadId = '0') {
        return new Promise((resolve, reject) => {
            const body = new URLSearchParams({
                clientID: CLIENT_ID,
                emailTemplateID: templateId,
                objectType: 'lead',
                objectID: leadId, // Use provided lead ID
            });

            console.log(`📥 Fetching template content:`);
            console.log(`   Template ID: ${templateId}`);
            console.log(`   Lead ID: ${leadId}`);
            console.log(`   URL: https://www.pixifi.com/admin/data/applyEmailTemplateToObject/`);
            console.log(`   Body:`, Object.fromEntries(body));

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/data/applyEmailTemplateToObject/',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                data: body.toString(),
                onload: response => {
                    console.log(`📥 Template fetch response:`);
                    console.log(`   Status: ${response.status}`);
                    console.log(`   Response: "${response.responseText}"`);

                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const rawText = response.responseText;
                            // Handle the SUCCESS{|} prefix more robustly
                            const marker = 'SUCCESS{|}';
                            const jsonText = rawText.substring(rawText.indexOf(marker) + marker.length);
                            const data = JSON.parse(jsonText);

                            console.log(`   Parsed data:`, data);

                            if (data && data.subject && data.message) {
                                console.log(`✅ Template ${templateId} loaded successfully`);
                                resolve({
                                    id: templateId,
                                    subject: data.subject,
                                    message: data.message
                                });
                            } else {
                                console.log(`❌ Template ${templateId} is empty or malformed`);
                                reject(`Template ${templateId} is empty or has an unexpected format.`);
                            }
                        } catch (e) {
                            console.log(`❌ Failed to parse template ${templateId}:`, e);
                            reject(`Failed to parse template ${templateId}: ${e}. Response was: ${response.responseText}`);
                        }
                    } else {
                        console.log(`❌ HTTP error fetching template ${templateId}`);
                        reject(`Failed to fetch template ${templateId}: HTTP ${response.status}`);
                    }
                },
                onerror: error => {
                    console.log(`❌ Network error fetching template ${templateId}:`, error);
                    reject(`Network error fetching template ${templateId}: ${error}`);
                }
            });
        });
    }

    async function sendEmail(contact, template) {
        return new Promise((resolve, reject) => {
            const leadId = getLeadIdFromContact(contact);
            const body = new URLSearchParams({
                emailin_lead: 'ld.7c08cd0939a770f3@contactmystudio.com',
                brandID: BRAND_IDS[contact.brand] || BRAND_IDS['N/A'],
                recipientObj_lead: contact['email address'],
                responses: template.id,
                subject_lead: template.subject,
                message_lead: template.message,
                clientID: CLIENT_ID,
                objectType: 'lead',
                objectID: leadId, // Use lead ID from contact's profile link
            });

            console.log(`🚀 Sending email to ${contact.name} (${contact['email address']})`);
            console.log(`📧 Template ID: ${template.id}, Brand: ${contact.brand}, Brand ID: ${BRAND_IDS[contact.brand]}`);
            console.log(`🆔 Using Lead ID: ${leadId}`);
            console.log(`📝 Subject: ${template.subject}`);
            console.log(`🌐 URL: https://www.pixifi.com/admin/fn/email/sendNewObjectEmail/`);
            console.log(`📤 Request body:`, Object.fromEntries(body));

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/fn/email/sendNewObjectEmail/',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                data: body.toString(),
                onload: response => {
                    console.log(`📨 Email send response for ${contact.name}:`);
                    console.log(`   Status: ${response.status}`);
                    console.log(`   Response: "${response.responseText}"`);

                    if (response.status >= 200 && response.status < 300) {
                        const responseText = response.responseText.trim();

                        // Check for specific success patterns
                        if (responseText === 'SUCCESS' || responseText.startsWith('SUCCESS{|}') || responseText.includes('SUCCESS')) {
                            console.log(`✅ SUCCESS: Email sent to ${contact.name}`);
                            resolve(`SUCCESS: Email sent to ${contact.name} (${contact['email address']})`);
                        } else {
                            console.log(`❌ FAILED: Unexpected response format for ${contact.name}`);
                            reject(`FAILED to send to ${contact.name}: Unexpected response format - "${responseText}"`);
                        }
                    } else {
                        console.log(`❌ FAILED: HTTP error for ${contact.name}`);
                        reject(`FAILED to send to ${contact.name}: HTTP ${response.status} - ${response.responseText}`);
                    }
                },
                onerror: error => {
                    console.log(`❌ Network error sending to ${contact.name}:`, error);
                    reject(`FAILED to send to ${contact.name}: Network Error - ${error}`);
                }
            });
        });
    }

    // ---- UI FUNCTIONS ----

    function showInterface() {
        if (isInterfaceVisible) {
            return; // Already visible
        }

        if (!csvInterface) {
            createUI();
        } else {
            csvInterface.style.display = 'block';
        }
        
        isInterfaceVisible = true;
        console.log('CSV Email Sender interface shown');
    }

    function hideInterface() {
        if (!isInterfaceVisible || !csvInterface) {
            return; // Already hidden or doesn't exist
        }

        csvInterface.style.display = 'none';
        isInterfaceVisible = false;
        console.log('CSV Email Sender interface hidden');
    }

    function toggleInterface() {
        if (isInterfaceVisible) {
            hideInterface();
        } else {
            showInterface();
        }
    }

    function createUI() {
        const ui = document.createElement('div');
        ui.id = 'csv-email-sender';
        ui.style.display = 'none'; // Start hidden
        ui.innerHTML = `
            <button class="csv-minimize-btn" id="csv-minimize-btn">−</button>
            <div id="csv-content">
                <h3>CSV Email Sender</h3>

                <div class="csv-control-group">
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <button type="button" id="csv-mode-file" class="csv-mode-btn active">📁 File Upload</button>
                        <button type="button" id="csv-mode-paste" class="csv-mode-btn">📝 Manual Paste</button>
                    </div>

                    <div id="csv-file-mode" class="csv-input-mode">
                        <label for="csv-file-input">Upload CSV File:</label>
                        <input type="file" id="csv-file-input" accept=".csv" />
                    </div>

                    <div id="csv-paste-mode" class="csv-input-mode" style="display: none;">
                        <label for="csv-text-input">Paste CSV Content:</label>
                        <textarea id="csv-text-input" placeholder="Paste your CSV content here..." rows="8"></textarea>
                    </div>
                </div>

                <div class="csv-tab-container">
                    <div class="csv-tab-buttons">
                        <button type="button" id="csv-tab-custom" class="csv-tab-btn active">📝 Custom Message</button>
                        <button type="button" id="csv-tab-config" class="csv-tab-btn">⚙️ Templates & Config</button>
                    </div>

                    <div id="csv-tab-custom-content" class="csv-tab-content active">
                        <div class="csv-control-group">
                            <label>Template Selection:</label>
                            <div style="padding: 8px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; font-size: 12px;">
                                <strong>Brand-Based Templates:</strong><br>
                                • Templates are selected based on the BRAND column in your CSV<br>
                                • Valid brands: BOOKING, SCHEDULE, RESERVE, SESSIONS, N/A<br>
                                • See preview below for brand assignments
                            </div>
                        </div>

                        <div class="csv-control-group">
                            <label for="csv-custom-subject">Custom Subject (optional):</label>
                            <input type="text" id="csv-custom-subject" placeholder="Leave empty to use template subject" />
                        </div>

                        <div class="csv-control-group">
                            <label for="csv-custom-message">Custom Message (optional):</label>
                            <textarea id="csv-custom-message" placeholder="Leave empty to use template message. Use {{name}}, {{eventname}}, {{duedate}}, {{location}} for placeholders"></textarea>
                        </div>
                    </div>

                    <div id="csv-tab-config-content" class="csv-tab-content">
                        <h4 style="margin-top: 0; color: #495057;">Configuration Profiles</h4>
                        <div class="csv-config-row" style="margin-bottom: 15px;">
                            <label style="min-width: 100px;">Configuration:</label>
                            <select id="config-profile-select" style="flex: 1;">
                                <!-- Options will be populated dynamically -->
                            </select>
                            <button id="delete-profile-btn" class="csv-profile-btn csv-profile-btn.delete">Delete</button>
                        </div>
                        <div class="csv-config-row" style="margin-bottom: 15px;">
                            <label style="min-width: 100px;">Save As:</label>
                            <input type="text" id="new-profile-name" placeholder="Enter profile name" style="flex: 1;" />
                            <button id="save-profile-btn" class="csv-profile-btn csv-profile-btn.save">Save</button>
                        </div>

                        <h4 style="margin-top: 20px; color: #495057;">Template IDs</h4>
                        <div class="csv-config-row">
                            <label>BOOKING:</label>
                            <input type="number" id="template-BOOKING" placeholder="Template ID for BOOKING brand" />
                        </div>
                        <div class="csv-config-row">
                            <label>SCHEDULE:</label>
                            <input type="number" id="template-SCHEDULE" placeholder="Template ID for SCHEDULE brand" />
                        </div>
                        <div class="csv-config-row">
                            <label>RESERVE:</label>
                            <input type="number" id="template-RESERVE" placeholder="Template ID for RESERVE brand" />
                        </div>
                        <div class="csv-config-row">
                            <label>SESSIONS:</label>
                            <input type="number" id="template-SESSIONS" placeholder="Template ID for SESSIONS brand" />
                        </div>
                        <div class="csv-config-row">
                            <label>Default:</label>
                            <input type="number" id="template-N/A" placeholder="Template ID for Default brand" />
                        </div>

                        <h4 style="margin-top: 20px; color: #495057;">Brand IDs</h4>
                        <div class="csv-config-row">
                            <label>BOOKING:</label>
                            <input type="text" id="brand-BOOKING" placeholder="Brand ID for BOOKING" />
                        </div>
                        <div class="csv-config-row">
                            <label>SCHEDULE:</label>
                            <input type="text" id="brand-SCHEDULE" placeholder="Brand ID for SCHEDULE" />
                        </div>
                        <div class="csv-config-row">
                            <label>RESERVE:</label>
                            <input type="text" id="brand-RESERVE" placeholder="Brand ID for RESERVE" />
                        </div>
                        <div class="csv-config-row">
                            <label>SESSIONS:</label>
                            <input type="text" id="brand-SESSIONS" placeholder="Brand ID for SESSIONS" />
                        </div>
                        <div class="csv-config-row">
                            <label>Default:</label>
                            <input type="text" id="brand-N/A" placeholder="Brand ID for Default" />
                        </div>

                        <h4 style="margin-top: 20px; color: #495057;">Other Settings</h4>
                        <div class="csv-config-row">
                            <label>Concurrency:</label>
                            <input type="number" id="concurrency-limit" placeholder="Number of simultaneous emails (1-10)" min="1" max="10" />
                        </div>
                        <div class="csv-config-row">
                            <label>Client ID:</label>
                            <input type="text" id="client-id" placeholder="Pixifi Client ID" />
                        </div>
                        <div class="csv-config-row">
                            <label>Default Brand:</label>
                            <select id="default-brand">
                                <option value="N/A">N/A (Default)</option>
                                <option value="BOOKING">BOOKING</option>
                                <option value="SCHEDULE">SCHEDULE</option>
                                <option value="RESERVE">RESERVE</option>
                                <option value="SESSIONS">SESSIONS</option>
                            </select>
                        </div>

                        <button id="csv-save-config" style="background-color: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin-top: 10px;">
                            Save Configuration
                        </button>
                    </div>
                </div>

                <div id="csv-status" class="csv-status info" style="display: none;"></div>
                <div id="csv-preview"></div>
                <div id="csv-results" style="display: none;"></div>

                <div class="csv-bottom-buttons">
                    <button id="csv-send-btn" disabled>Send Emails</button>
                    <button id="csv-close-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(ui);
        csvInterface = ui; // Store reference to the interface
        attachEventListeners();

        // Initialize the profile dropdown
        updateProfileDropdown();
    }

    function attachEventListeners() {
        const fileInput = document.getElementById('csv-file-input');
        const textInput = document.getElementById('csv-text-input');
        const sendBtn = document.getElementById('csv-send-btn');
        const closeBtn = document.getElementById('csv-close-btn');
        const minimizeBtn = document.getElementById('csv-minimize-btn');
        const saveConfigBtn = document.getElementById('csv-save-config');
        const fileModeBtn = document.getElementById('csv-mode-file');
        const pasteModeBtn = document.getElementById('csv-mode-paste');
        const customTabBtn = document.getElementById('csv-tab-custom');
        const configTabBtn = document.getElementById('csv-tab-config');

        // Profile management buttons
        const saveProfileBtn = document.getElementById('save-profile-btn');
        const configProfileSelect = document.getElementById('config-profile-select');
        const deleteProfileBtn = document.getElementById('delete-profile-btn');

        // Auto-load CSV on file selection or text change
        fileInput.addEventListener('change', handleFileUpload);
        textInput.addEventListener('input', handleFileUpload);
        
        sendBtn.addEventListener('click', handleSendEmails);
        closeBtn.addEventListener('click', hideInterface);
        minimizeBtn.addEventListener('click', toggleMinimize);

        saveConfigBtn.addEventListener('click', applyConfiguration);
        fileModeBtn.addEventListener('click', () => setCsvInputMode('file'));
        pasteModeBtn.addEventListener('click', () => setCsvInputMode('paste'));
        
        // Tab switching
        customTabBtn.addEventListener('click', () => setActiveTab('custom'));
        configTabBtn.addEventListener('click', () => setActiveTab('config'));

        // Profile management event listeners
        saveProfileBtn.addEventListener('click', handleSaveProfile);
        configProfileSelect.addEventListener('change', (e) => {
            try {
                loadProfile(e.target.value);
                updateProfileDropdown(); // Update dropdown to reflect current selection
            } catch (error) {
                showStatus(`Error loading profile: ${error.message}`, 'error');
            }
        });
        deleteProfileBtn.addEventListener('click', handleDeleteProfile);
    }

    function setCsvInputMode(mode) {
        const fileModeBtn = document.getElementById('csv-mode-file');
        const pasteModeBtn = document.getElementById('csv-mode-paste');
        const fileMode = document.getElementById('csv-file-mode');
        const pasteMode = document.getElementById('csv-paste-mode');

        if (mode === 'file') {
            fileModeBtn.classList.add('active');
            pasteModeBtn.classList.remove('active');
            fileMode.style.display = 'block';
            pasteMode.style.display = 'none';
        } else if (mode === 'paste') {
            fileModeBtn.classList.remove('active');
            pasteModeBtn.classList.add('active');
            fileMode.style.display = 'none';
            pasteMode.style.display = 'block';
        }
    }

    function setActiveTab(tabName) {
        const customTabBtn = document.getElementById('csv-tab-custom');
        const configTabBtn = document.getElementById('csv-tab-config');
        const customTabContent = document.getElementById('csv-tab-custom-content');
        const configTabContent = document.getElementById('csv-tab-config-content');

        if (tabName === 'custom') {
            customTabBtn.classList.add('active');
            configTabBtn.classList.remove('active');
            customTabContent.classList.add('active');
            configTabContent.classList.remove('active');
        } else if (tabName === 'config') {
            customTabBtn.classList.remove('active');
            configTabBtn.classList.add('active');
            customTabContent.classList.remove('active');
            configTabContent.classList.add('active');
            // Update config inputs when switching to config tab
            updateConfigInputs();
            updateProfileDropdown();
        }
    }

    function toggleMinimize() {
        const container = document.getElementById('csv-email-sender');
        const content = document.getElementById('csv-content');
        const btn = document.getElementById('csv-minimize-btn');

        if (container.classList.contains('csv-minimized')) {
            container.classList.remove('csv-minimized');
            content.style.display = 'block';
            btn.textContent = '−';
        } else {
            container.classList.add('csv-minimized');
            content.style.display = 'none';
            btn.textContent = '+';
        }
    }

    function updateSendButton() {
        const sendBtn = document.getElementById('csv-send-btn');
        if (sendBtn) {
            sendBtn.disabled = !(csvData.length > 0);
        }
    }

    async function handleFileUpload() {
        const fileInput = document.getElementById('csv-file-input');
        const textInput = document.getElementById('csv-text-input');
        const fileMode = document.getElementById('csv-file-mode');
        const pasteMode = document.getElementById('csv-paste-mode');

        let csvText = '';

        // Check which mode is active
        if (fileMode.style.display !== 'none') {
            // File upload mode
            const file = fileInput.files[0];

            if (!file) {
                // Clear data if no file selected
                csvData = [];
                updatePreview();
                updateSendButton();
                return;
            }

            if (!file.name.toLowerCase().endsWith('.csv')) {
                showStatus('Please select a valid CSV file', 'error');
                return;
            }

            try {
                csvText = await file.text();
            } catch (error) {
                showStatus(`Error reading file: ${error.message}`, 'error');
                return;
            }
        } else {
            // Manual paste mode
            csvText = textInput.value.trim();

            if (!csvText) {
                // Clear data if no text
                csvData = [];
                updatePreview();
                updateSendButton();
                return;
            }
        }

        try {
            showStatus('Parsing CSV and detecting brands...', 'info');
            csvData = await parseCSV(csvText);
            updatePreview();
            updateSendButton();
            showStatus(`Successfully loaded ${csvData.length} contacts from CSV`, 'success');
        } catch (error) {
            showStatus(`Error parsing CSV: ${error.message}`, 'error');
            csvData = [];
            updatePreview();
            updateSendButton();
        }
    }

    async function handleSendEmails() {
        if (isProcessing) {
            showStatus('Already processing emails, please wait...', 'error');
            return;
        }

        if (csvData.length === 0) {
            showStatus('No CSV data loaded', 'error');
            return;
        }



        const customSubject = document.getElementById('csv-custom-subject').value.trim();
        const customMessage = document.getElementById('csv-custom-message').value.trim();
        const resultsDiv = document.getElementById('csv-results');
        const sendBtn = document.getElementById('csv-send-btn');

        isProcessing = true;
        sendBtn.disabled = true;
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = 'Starting email send process...\n';

        try {
            resultsDiv.innerHTML += `Processing ${csvData.length} contacts with automatic brand detection...\n\n`;

            let summary = {
                sent: 0,
                skipped: 0,
                failed: 0
            };

            // Process in controlled concurrency batches
            for (let i = 0; i < csvData.length; i += CONCURRENCY_LIMIT) {
                const batch = csvData.slice(i, i + CONCURRENCY_LIMIT);
                resultsDiv.innerHTML += `--- Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1} ---\n`;

                const tasks = batch.map(async contact => {
                    try {
                        if (!contact['email address'] || contact['email address'] === 'N/A') {
                            resultsDiv.innerHTML += `[SKIP] ${contact.name} has no email address.\n`;
                            summary.skipped++;
                            return;
                        }

                        // Fetch template for this specific contact's brand using their lead ID
                        const contactLeadId = getLeadIdFromContact(contact);
                        const template = await fetchTemplateContent(TEMPLATES[contact.brand], contactLeadId);

                        // Apply custom subject/message if provided
                        let finalSubject = template.subject;
                        let finalMessage = template.message;

                        if (customSubject) {
                            finalSubject = customSubject;
                        }
                        if (customMessage) {
                            finalMessage = customMessage
                                .replace(/\{\{name\}\}/g, contact.name || '')
                                .replace(/\{\{eventname\}\}/g, contact.eventname || '')
                                .replace(/\{\{duedate\}\}/g, formatDate(contact.duedate))
                                .replace(/\{\{location\}\}/g, contact.location || '')
                                .replace(/\{\{phone\}\}/g, contact.phone || '')
                                .replace(/\{\{event link\}\}/g, contact['event link'] || '');
                        }

                        const contactWithTemplate = {
                            ...template,
                            subject: finalSubject,
                            message: finalMessage
                        };

                        const result = await sendEmail(contact, contactWithTemplate);
                        resultsDiv.innerHTML += `[SUCCESS] ${result} [Brand: ${contact.brand}]\n`;
                        summary.sent++;

                    } catch (error) {
                        resultsDiv.innerHTML += `[ERROR] For ${contact.name}: ${error}\n`;
                        summary.failed++;
                    }
                });

                await Promise.all(tasks);
                // Yield to event loop to allow UI to update
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Final summary
            resultsDiv.innerHTML += `\n=== FINAL SUMMARY ===\n`;
            resultsDiv.innerHTML += `Emails sent: ${summary.sent}\n`;
            resultsDiv.innerHTML += `Skipped: ${summary.skipped}\n`;
            resultsDiv.innerHTML += `Failed: ${summary.failed}\n`;
            resultsDiv.innerHTML += `Total processed: ${csvData.length}\n`;

            showStatus(`Email send complete! Sent: ${summary.sent}, Skipped: ${summary.skipped}, Failed: ${summary.failed}`, 'success');

        } catch (error) {
            resultsDiv.innerHTML += `[CRITICAL ERROR] ${error}\n`;
            showStatus(`Email send failed: ${error}`, 'error');
        } finally {
            isProcessing = false;
            sendBtn.disabled = false;
        }
    }

    // ---- INITIALIZATION ----
    function init() {
        // Load saved configuration
        loadConfiguration();

        // Load configuration profiles (this also creates presets if they don't exist)
        loadConfigProfiles();

        // Load the default profile (abandoned resends)
        if (configProfiles['abandoned-resends']) {
            loadProfile('abandoned-resends');
        }

        // Test lead ID extraction immediately
        console.log(`🧪 Testing lead ID extraction on page load:`);
        const testLeadId = getLeadIdFromUrl();
        console.log(`🧪 Current lead ID: ${testLeadId}`);

        // Register Tampermonkey menu command
        GM_registerMenuCommand('Toggle CSV Email Sender', toggleInterface);

        // Wait for page to load and create the interface (starts hidden by default)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }
    }

    init();
})();
