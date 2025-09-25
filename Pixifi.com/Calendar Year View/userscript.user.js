// File: tampermonkey/pixifi-calendar-year-view-complete.user.js

// ==UserScript==
// @name         Pixifi Calendar Year View (09/13/2025)
// @namespace    http://tampermonkey.net/
// @version      9.13.2025.1
// @description  Creates a rolling 12-month view with all functionality, adds a Filter Options button, Jump to Month navigation, modal styling adjustments, copies date to clipboard in mm/dd/yyyy format, and includes per-day interactions and photographer data caching/editing via left and right clicks.
// @match        https://www.pixifi.com/admin/events/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // **1. Guard to Prevent Multiple Executions**
    if (window.PixifiCalendarYearViewComplete) {
        console.log('Pixifi Calendar Year View script is already running.');
        return;
    }
    window.PixifiCalendarYearViewComplete = true;

    // **2. Ensure Dependencies are Loaded**
    if (typeof jQuery === 'undefined') {
        console.error('jQuery is required for this script to work.');
        return;
    }

    if (typeof moment === 'undefined') {
        console.error('Moment.js is required for this script to work.');
        return;
    }

    // **3. Inject Font Awesome if Not Present**
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
        faLink.integrity = 'sha512-Sf6DQGpQcbHzJQ5HwvUj3rj3tC+qmGiwvL4ql/mE4tF6S8yy+oF86T0zG+v0hUHE5s4hP/A8BbO+FQ+ZUs4MMA==';
        faLink.crossOrigin = 'anonymous';
        faLink.referrerPolicy = 'no-referrer';
        document.head.appendChild(faLink);
    }

    // **4. Consolidated and Enhanced CSS with Variables**
    const styles = document.createElement('style');
    styles.textContent = `
        :root {
            --primary-color: #3498db;
            --primary-hover: #2980b9;
            --active-color: #1abc9c;
            --background-color: #f9f9f9;
            --header-background: #2c3e50;
            --header-text: #ecf0f1;
            --tag-background: #34495e;
            --tag-hover: #3d566e;
            --modal-background: #1e3246;
            --modal-header-bg: #152736;
            --modal-section-bg: #2c4356;
            --modal-input-bg: #1a2a3a;
            --modal-border: #3a5269;
            --modal-text: #ffffff;
            --modal-text-secondary: #a0b7cc;
            --shadow-color: rgba(0, 0, 0, 0.1);
            --nav-bg-color: #ffffff;
            --nav-text-color: #2c3e50;
            --nav-hover-bg: #ecf0f1;
            --nav-active-bg: #3498db;
            --nav-active-text: #ffffff;
            --save-button-bg: #2196f3;
            --save-button-hover: #0d8aee;
            --nav-button-bg: #455a64;
            --nav-button-hover: #37474f;
            --exit-button-bg: #e57373;
            --exit-button-hover: #ef5350;
            --data-button-bg: #3a5269;
            --data-button-hover: #2c4356;
            --disabled-button-bg: #78909c;
        }

        /* Container for the entire Year View */
        .year-view-container {
            display: flex;
            flex-direction: column;
            gap: 40px;
            padding: 20px;
            background-color: var(--background-color);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin-left: 20px; /* Space for vertical nav */
        }

        /* Jump to Month Navigation - fixed sidebar */
        .jump-to-month-nav {
            position: fixed;
            top: 100px;
            left: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px 20px;
            width: 160px;
            background-color: var(--nav-bg-color);
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            z-index: 9999;
        }

        .jump-to-month-nav button {
            background-color: var(--nav-bg-color);
            color: var(--nav-text-color);
            border: 1px solid #bdc3c7;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s, color 0.3s;
            font-size: 14px;
            text-align: left;
        }

        .jump-to-month-nav button:hover {
            background-color: var(--nav-hover-bg);
        }

        .jump-to-month-nav button.active {
            background-color: var(--nav-active-bg);
            color: var(--nav-active-text);
            border-color: var(--nav-active-bg);
        }

        /* Force Filter button to bottom of nav (optional) */
        .jump-to-month-nav button.fc-filter-button {
            margin-top: auto; /* push this button to the bottom */
        }

        /* Wrapper for Month Title and Currently Viewing */
        .month-title-wrapper {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: flex-start;
            background: var(--header-background);
            color: var(--header-text);
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px var(--shadow-color);
        }

        /* Month Title Styling */
        .month-title {
            font-size: 28px;
            margin: 0;
            display: flex;
            align-items: center;
            font-weight: 600;
        }

        /* Currently Viewing Section Styling */
        .currentCalendarViewCustom {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 16px;
            color: #bdc3c7;
            margin-top: 10px;
        }

        .currentCalendarViewCustom span {
            background-color: var(--tag-background);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
            transition: background-color 0.3s;
        }

        .currentCalendarViewCustom span:hover {
            background-color: var(--tag-hover);
        }

        /* Month Section (FullCalendar) Styling */
        .month-section {
            height: 800px;
            border: 1px solid #dcdcdc;
            border-radius: 8px;
            overflow: hidden;
            background-color: #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        /* Event Background Styling */
        .fc-bgevent.fc-unavailable {
            background-color: rgba(231, 76, 60, 0.1);
        }

        /* Event Status Indicator Styling */
        .pxEventStatus {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
            margin-left: 5px;
            border: 1px solid #fff;
            box-shadow: 0 0 2px rgba(0,0,0,0.2);
            transition: transform 0.2s;
        }

        .pxEventStatus:hover {
            transform: scale(1.2);
        }

        /* Modal Window Styles */
        .modalWindow {
            background-color: var(--modal-background);
            color: var(--modal-text);
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 600px;
            position: fixed;
        }

        /* Modal Header */
        .modalHeader {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 15px;
            position: relative;
        }

        .modalHeader .leftTitle {
            font-size: 20px;
            font-weight: bold;
            text-align: center;
        }

        .modalHeader .rightTitle a {
            color: var(--modal-text);
            font-size: 20px;
            text-decoration: none;
            transition: color 0.3s;
            position: absolute;
            right: 0;
        }

        .modalHeader .rightTitle a:hover {
            color: #e74c3c;
        }

        /* Year and Filter Buttons */
        .fc-year-button, .fc-filter-button {
            background-color: var(--primary-color);
            color: #ffffff;
            border: none;
            padding: 1px 5px;
            cursor: pointer;
            transition: background-color 0.3s, transform 0.2s;
            font-size: 14px;
        }

        .fc-year-button:hover, .fc-filter-button:hover {
            background-color: var(--primary-hover);
        }

        .fc-year-button:active, .fc-filter-button:active {
            transform: scale(0.98);
        }

        .fc-year-button.fc-state-active, .fc-filter-button.fc-state-active {
            background-color: var(--active-color);
        }

        /* Our custom modal for Photographer Data */
        #photographerModalContainer {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none; /* hidden by default, will be set to flex when opened */
            justify-content: center;
            align-items: center;
            z-index: 99999;
            background-color: rgba(0, 0, 0, 0.5);
        }

        #photographerModal {
            width: 90%;
            max-width: 875px; /* Increased by 25% from 700px */
            background-color: var(--modal-background);
            color: var(--modal-text);
            border-radius: 10px; /* Increased by 25% from 8px */
            box-shadow: 0 6px 19px rgba(0, 0, 0, 0.3); /* Increased by 25% from 0 5px 15px */
            overflow: hidden;
            animation: modalFadeIn 0.3s ease-out;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Wizard counter */
        .wizard-counter {
            padding: 10px 20px;
            background-color: var(--modal-section-bg);
            font-size: 0.9rem;
            border-bottom: 1px solid var(--modal-border);
            display: none; /* Hidden by default, shown in wizard mode */
        }

        /* Photographer info container */
        .photographer-info-container {
            padding: 15px 20px;
            background-color: var(--modal-section-bg);
            border-bottom: 1px solid var(--modal-border);
        }

        .current-photographer {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }

        .info-label {
            margin-right: 8px;
            color: var(--modal-text-secondary);
        }

        .info-value {
            color: var(--modal-text);
        }

        .availability-info {
            font-size: 0.9rem;
            line-height: 1.4;
            min-height: 75px;
        }

        /* Storage key */
        .storage-key-container {
            padding: 10px 20px;
            background-color: rgba(255, 255, 255, 0.1);
            font-family: monospace;
            font-size: 0.85rem;
            margin: 15px 20px;
            border-radius: 4px;
            word-break: break-all;
        }

        /* Form container */
        .form-container {
            padding: 0 20px 15px;
        }

        /* Not a photographer option */
        .not-photographer-option {
            display: flex;
            align-items: center;
            padding: 10px;
            background-color: rgba(255, 99, 99, 0.2);
            border-radius: 4px;
            margin-bottom: 20px;
        }

        .not-photographer-option input[type="checkbox"] {
            margin-right: 10px;
            width: 18px;
            height: 18px;
        }

        .not-photographer-option label {
            font-weight: bold;
            cursor: pointer;
            margin-top: 0;
        }

        /* Form grid */
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }

        @media (max-width: 600px) {
            .form-grid {
                grid-template-columns: 1fr;
            }
        }

        .form-group {
            display: flex;
            flex-direction: column;
        }

        .form-group label {
            margin-bottom: 5px;
            font-size: 0.9rem;
        }

        /* Start times */
        .start-times-container {
            margin-bottom: 20px;
        }

        .start-times-label {
            display: block;
            margin-bottom: 10px;
            font-size: 0.9rem;
        }

        .start-times-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
            gap: 10px;
        }

        .time-input {
            display: flex;
            flex-direction: column;
        }

        .time-input label {
            font-size: 0.8rem;
            margin-bottom: 5px;
            color: var(--modal-text-secondary);
            text-align: center;
        }

        input[type="text"],
        #photographerModal input[type="text"] {
            padding: 10px;
            border: 1px solid var(--modal-border);
            border-radius: 4px;
            background-color: var(--modal-input-bg);
            color: var(--modal-text);
            font-size: 1rem;
            margin-bottom: 0;
            width: 100%;
        }

        input[type="text"]:focus {
            outline: none;
            border-color: #4d90fe;
            box-shadow: 0 0 0 2px rgba(77, 144, 254, 0.2);
        }

        /* Button container */
        .button-container {
            padding: 15px 20px;
            border-top: 1px solid var(--modal-section-bg);
            background-color: var(--modal-header-bg);
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        /* Navigation buttons (Previous, Save, Next) */
        .navigation-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 13px; /* Increased by 25% from 10px */
        }

        /* Data buttons (Export, Import, Start, Exit) */
        .data-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 13px; /* Increased by 25% from 10px */
        }

        /* Wizard controls */
        /* Removed #wizardControls selector as it's been integrated into the new design */

        /* Buttons */
        #photographerModal button {
            padding: 10px 20px; /* Increased by 25% from 8px 16px */
            border: none;
            border-radius: 5px; /* Increased by 25% from 4px */
            font-size: 1.125rem; /* Increased by 25% from 0.9rem */
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
            white-space: nowrap;
            margin-top: 0;
            margin-right: 0;
        }

        #photographerModal button:active {
            transform: translateY(1px);
        }

        /* Override close button style which is set already */
        #photographerModal .close-modal-btn {
            padding: 0 5px;
        }

        .save-btn {
            background-color: var(--save-button-bg);
            color: white;
        }

        .save-btn:hover {
            background-color: var(--save-button-hover);
        }

        .wizard-prev-btn, .wizard-next-btn {
            background-color: var(--nav-button-bg);
            color: white;
        }

        .wizard-prev-btn:hover, .wizard-next-btn:hover {
            background-color: var(--nav-button-hover);
        }

        .wizard-exit-btn {
            background-color: var(--exit-button-bg);
            color: white;
        }

        .wizard-exit-btn:hover {
            background-color: var(--exit-button-hover);
        }

        .export-btn, .import-btn, .wizard-btn, .wizard-toggle-btn {
            background-color: var(--data-button-bg);
            color: white;
        }

        .export-btn:hover, .import-btn:hover, .wizard-btn:hover, .wizard-toggle-btn:hover {
            background-color: var(--data-button-hover);
        }

        #photographerModal button:disabled {
            background-color: var(--disabled-button-bg);
            cursor: not-allowed;
            opacity: 0.7;
        }

        /* Hidden file input */
        #importFileInput {
            display: none;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            #photographerModal {
                width: 95%;
                max-height: 90vh;
                overflow-y: auto;
            }

            .navigation-buttons, .data-buttons {
                grid-template-columns: 1fr;
            }

            .year-view-container {
                padding: 10px;
                gap: 20px;
                margin-left: 0;
            }
            .month-section {
                height: 500px;
            }
            .month-title-wrapper {
                padding: 10px 15px;
            }
            .month-title {
                font-size: 20px;
            }
            .currentCalendarViewCustom {
                font-size: 12px;
            }
            /* Horizontal nav for small screens */
            .jump-to-month-nav {
                position: static;
                width: auto;
                flex-direction: row;
                flex-wrap: wrap;
            }
            .jump-to-month-nav button {
                flex: 1 1 30%;
                text-align: center;
            }
        }
    `;
    document.head.appendChild(styles);

    // Toast styles and helper function
    const toastStyles = document.createElement('style');
    toastStyles.textContent = `
        .pixifi-toast {
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
        .pixifi-toast.show {
            opacity: 1;
        }
    `;
    document.head.appendChild(toastStyles);

    // Utility: show a toast message for a short duration
    function showToast(message, duration = 3000, color = null) {
        const toast = document.createElement('div');
        toast.className = 'pixifi-toast';
        toast.textContent = message;
        if (color) {
            toast.style.backgroundColor = color;
        }
        document.body.appendChild(toast);
        // Ensure the element is in the DOM before triggering animation
        requestAnimationFrame(() => toast.classList.add('show'));
        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    }

    // Global variables for wizard mode
    let wizardMode = false;
    let currentWizardIndex = 0;
    let currentWizardPhotographer = null;
    let availablePhotographers = [];
    let staffInfoCache = null; // Cache for staff information
    let wizardShowAllMode = false; // Track whether we're showing all staff or just unprogrammed ones

    // Eagerly fetch staff information so it's available for key generation
    fetchStaffInfo().catch(e => console.error('Failed to pre-fetch staff info:', e));

    // -------------------------------------------------------------------------
    // cache avoiding redundant month fetches
    // -------------------------------------------------------------------------
    // Global memoization objects for month fetch & filter tracking
    // (declared here so they exist before any function executes)
    let _monthCache = Object.create(null);        // monthKey → filterHash
    let _lastGlobalFilterHash = '';              // hash of current global filter set

    // NOTE: _monthCache is reset only when filters change (inside
    // refreshAllMonths). See comments in that function.

    // -------------------------------------------------------------------------
    // FAST photographer key + micro-cache (replaces getPhotographerKey() cost)
    // -------------------------------------------------------------------------
    let currentPhotographerId  = $('#person_combo_calendar').val() || '';
    let currentPhotographerKey = 'photographer_none';
    const _photographerCache   = Object.create(null);

    function _updatePhotographerRefs() {
        const sel = document.getElementById('person_combo_calendar');
        if (!sel) return;

        // ID is safe to take directly from the <select> value (Selectize keeps it updated)
        currentPhotographerId = sel.value || '';

        // Resolve the display name from the OPTION that matches the current value
        let nameTxt = '';
        if (currentPhotographerId) {
            const opt = sel.querySelector(`option[value="${currentPhotographerId}"]`);
            nameTxt = opt ? opt.textContent.trim() : '';
        }

        // Fallback: legacy method
        if (!nameTxt && sel.selectedIndex >= 0) {
            nameTxt = sel.options[sel.selectedIndex].text.trim();
        }

        if (!nameTxt) {
            // Last-ditch fallback to the raw ID so key is unique
            nameTxt = currentPhotographerId || 'none';
        }

        // If staff info is available, append it to the name for a more specific key
        if (staffInfoCache && currentPhotographerId && staffInfoCache[currentPhotographerId] && staffInfoCache[currentPhotographerId].info) {
            nameTxt = `${nameTxt}_${staffInfoCache[currentPhotographerId].info}`;
        }

        // Sanitize the nameTxt for the key: replace any non-alphanumeric characters with underscores,
        // and remove leading/trailing underscores.
        currentPhotographerKey = 'photographer_' + nameTxt.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

        // Prime cache entry
        _photographerCache[currentPhotographerKey] =
            JSON.parse(localStorage.getItem(currentPhotographerKey) || 'null');
    }

    _updatePhotographerRefs();
    document.getElementById('person_combo_calendar')
            .addEventListener('change', _updatePhotographerRefs, {passive:true});

    function getPhotographerKey() {
        // Always refresh the cached refs so we stay in sync with the latest
        // selection (Selectize programmatic changes sometimes bypass the
        // change listener).
        _updatePhotographerRefs();
        return currentPhotographerKey;
    }

    function getPhotographerData() {
        _updatePhotographerRefs();
        return _photographerCache[currentPhotographerKey] || null;
    }

    // Helper: return latest saved entry (data + key) for a given staffId
    function findLatestEntryForStaffId(staffId) {
        if (!staffId) return null;
        let latest = null;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('photographer_')) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const data = JSON.parse(raw);
                if (!data || data.staffId !== staffId) continue;
                const ts = typeof data.updatedAt === 'number' ? data.updatedAt : (Date.parse(data.updatedAt || 0) || 0);
                if (!latest || ts > latest.ts) {
                    latest = { key, data, ts };
                }
            } catch (e) {
                // ignore parsing errors
            }
        }
        return latest;
    }

    // Helper: determine if a data object contains any time values
    function hasAnyTimeData(data) {
        if (!data || typeof data !== 'object') return false;
        const dr = (data && data.defaultRule) || {};
        return !!(
            data.sunStart || data.monStart || data.tueStart || data.wedStart ||
            data.thuStart || data.friStart || data.satStart ||
            dr.sunStart || dr.monStart || dr.tueStart || dr.wedStart ||
            dr.thuStart || dr.friStart || dr.satStart
        );
    }

    // Helper: sanitize name to storage key (current format)
    function _sanitizeKeyNameCurrent(name) {
        return 'photographer_' + name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
    }

    // Helper: legacy sanitizer (spaces to underscores only)
    function _sanitizeKeyNameLegacy(name) {
        return 'photographer_' + name.toLowerCase().replace(/\s+/g, '_');
    }

    // Helper: return possible key candidates for a photographer option
    function getKeyCandidatesForPhotographer(photographer) {
        const rawName = photographer && photographer.name ? photographer.name : '';
        const id = photographer && photographer.id ? photographer.id : '';
        const candidates = new Set();

        if (!rawName) return [];

        // Normalize display name: trim and collapse internal whitespace
        const name = rawName.trim().replace(/\s+/g, ' ');

        // Base candidates from display name
        candidates.add(_sanitizeKeyNameCurrent(name));
        candidates.add(_sanitizeKeyNameLegacy(name));
        // Also include legacy candidate from raw name (to preserve trailing underscores and original spacing quirks)
        candidates.add(_sanitizeKeyNameLegacy(rawName));
        // If raw name had trailing/leading whitespace, include a variant with a trailing underscore
        if (rawName !== rawName.trim()) {
            const legacyTrim = _sanitizeKeyNameLegacy(name);
            candidates.add(legacyTrim.endsWith('_') ? legacyTrim : legacyTrim + '_');
        }

        // If staff info is known, include variants with it appended
        if (staffInfoCache && id && staffInfoCache[id] && staffInfoCache[id].info) {
            const info = String(staffInfoCache[id].info).trim().replace(/\s+/g, ' ');
            const nameWithInfo = name + '_' + info;
            candidates.add(_sanitizeKeyNameCurrent(nameWithInfo));
            candidates.add(_sanitizeKeyNameLegacy(nameWithInfo));
            // Raw-name-with-info legacy variant
            const rawWithInfo = rawName + '_' + info;
            candidates.add(_sanitizeKeyNameLegacy(rawWithInfo));
            if (rawName !== rawName.trim()) {
                const legacyTrimInfo = _sanitizeKeyNameLegacy(nameWithInfo);
                candidates.add(legacyTrimInfo.endsWith('_') ? legacyTrimInfo : legacyTrimInfo + '_');
            }
        }

        return Array.from(candidates);
    }

    // Create a hidden container for our custom photographer modal
    const photographerModalContainer = document.createElement('div');
    photographerModalContainer.id = 'photographerModalContainer';
    photographerModalContainer.innerHTML = `
        <div id="photographerModal">
            <div class="modal-header">
                <h2>Photographer Data</h2>
                <button class="close-modal-btn" aria-label="Close Photographer Modal">&times;</button>
            </div>

            <div class="wizard-counter" id="wizardCounter"></div>

            <div class="photographer-info-container" id="PhotographerDataContainer">
                <div class="current-photographer">
                    <span class="info-label">Currently Viewing:</span>
                    <span class="info-value">
                        <strong>Select a photographer</strong>
                    </span>
                </div>
                <div class="availability-info">
                    <span class="info-value"></span>
                </div>
            </div>

            <div class="storage-key-container">
                <strong>Storage Key:</strong>
                <code id="currentKeyDisplay">No key selected</code>
            </div>

            <div class="form-container">
                <div class="not-photographer-option">
                    <input type="checkbox" id="notAPhotographer" />
                    <label for="notAPhotographer">Not a photographer - skip in wizard</label>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="photographerFirstName">First Name:</label>
                        <input type="text" id="photographerFirstName" autocomplete="off" />
                    </div>

                    <div class="form-group">
                        <label for="photographerLastName">Last Name:</label>
                        <input type="text" id="photographerLastName" autocomplete="off" />
                    </div>
                </div>

                <div class="start-times-container">
                    <label class="start-times-label">Start Times (MTWRFSU):</label>
                    <div class="start-times-grid">
                        <div class="time-input">
                            <label for="monStart">Mon</label>
                            <input type="text" id="monStart" placeholder="09:00" autocomplete="off" />
                        </div>
                        <div class="time-input">
                            <label for="tueStart">Tue</label>
                            <input type="text" id="tueStart" placeholder="09:00" autocomplete="off" />
                        </div>
                        <div class="time-input">
                            <label for="wedStart">Wed</label>
                            <input type="text" id="wedStart" placeholder="09:00" autocomplete="off" />
                        </div>
                        <div class="time-input">
                            <label for="thuStart">Thu</label>
                            <input type="text" id="thuStart" placeholder="09:00" autocomplete="off" />
                        </div>
                        <div class="time-input">
                            <label for="friStart">Fri</label>
                            <input type="text" id="friStart" placeholder="09:00" autocomplete="off" />
                        </div>
                        <div class="time-input">
                            <label for="satStart">Sat</label>
                            <input type="text" id="satStart" placeholder="09:00" autocomplete="off" />
                        </div>
                        <div class="time-input">
                            <label for="sunStart">Sun</label>
                            <input type="text" id="sunStart" placeholder="12:00" autocomplete="off" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="button-container">
                <div class="navigation-buttons">
                    <button class="wizard-prev-btn" id="wizardPrevBtn">Previous</button>
                    <button class="save-btn">Save</button>
                    <button class="wizard-next-btn" id="wizardNextBtn">Next</button>
                </div>

                <div class="data-buttons">
                    <button class="export-btn" id="exportAllData">Export All Data</button>
                    <button class="import-btn" id="importDataBtn">Import Data</button>
                    <button class="wizard-btn" id="startWizardBtn">Start Wizard</button>
                    <button class="toggle-btn" id="toggleViewBtn">Show All</button>
                    <button class="wizard-exit-btn" id="wizardExitBtn">Exit Wizard</button>
                    <input type="file" id="importFileInput" accept=".json" class="hidden" />
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(photographerModalContainer);


    // Update the modal styles to match the new V0 design
    const modalStyles = `
        /* Base styles */
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        /* Modal container */
        #photographerModalContainer {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none; /* Initially hidden */
            justify-content: center;
            align-items: center;
            z-index: 1000;
            background-color: rgba(0, 0, 0, 0.5);
        }

        /* Modal */
        #photographerModal {
            width: 90%;
            max-width: 875px; /* Increased from 700px by 25% */
            background-color: var(--modal-background);
            color: var(--modal-text);
            border-radius: 10px; /* Increased from 8px */
            box-shadow: 0 6px 19px rgba(0, 0, 0, 0.3); /* Increased shadow */
            overflow: hidden;
            animation: modalFadeIn 0.3s ease-out;
        }

        @keyframes modalFadeIn {
            from { opacity: 0; transform: translateY(-25px); } /* Increased from -20px */
            to { opacity: 1; transform: translateY(0); }
        }

        /* Modal header */
        .modal-header {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 19px 25px; /* Increased from 15px 20px */
            background-color: var(--modal-header-bg);
            border-bottom: 1px solid var(--modal-border);
            position: relative;
        }

        .modal-header h2 {
            font-size: 2.3rem; /* Increased further from 1.875rem */
            font-weight: 500;
            margin: 0;
            text-align: center;
        }

        .close-modal-btn {
            background: none;
            border: none;
            color: var(--modal-text);
            font-size: 2.3rem; /* Increased further from 1.875rem */
            cursor: pointer;
            padding: 0 6px; /* Increased from 0 5px */
            transition: color 0.2s;
            position: absolute;
            right: 19px;
            top: 50%;
            transform: translateY(-50%);
        }

        .close-modal-btn:hover {
            color: #ff6b6b;
        }

        /* Wizard counter */
        .wizard-counter {
            padding: 13px 25px; /* Increased from 10px 20px */
            background-color: var(--modal-section-bg);
            font-size: 1.4rem; /* Increased further from 0.9rem */
            border-bottom: 1px solid var(--modal-border);
            display: none; /* Only shown in wizard mode */
        }

        /* Photographer info container */
        .photographer-info-container {
            padding: 19px 25px; /* Increased from 15px 20px */
            background-color: var(--modal-section-bg);
            border-bottom: 1px solid var(--modal-border);
        }

        .current-photographer {
            display: flex;
            align-items: center;
            margin-bottom: 10px; /* Increased from 8px */
        }

        .info-label {
            margin-right: 10px; /* Increased from 8px */
            color: var(--modal-text-secondary);
            font-size: 1.4rem; /* Added font size */
        }

        .info-value {
            color: var(--modal-text);
            font-size: 1.4rem; /* Added font size */
        }

        .availability-info {
            font-size: 1.4rem; /* Increased further from 0.9rem */
            line-height: 1.5; /* Increased from 1.4 */
        }

        /* Storage key */
        .storage-key-container {
            padding: 13px 25px; /* Increased from 10px 20px */
            background-color: rgba(255, 255, 255, 0.1);
            font-family: monospace;
            font-size: 1.3rem; /* Increased further from 0.85rem */
            margin: 19px 25px; /* Increased from 15px 20px */
            border-radius: 5px; /* Increased from 4px */
            word-break: break-all;
        }

        /* Form container */
        .form-container {
            padding: 0 25px 19px; /* Increased from 0 20px 15px */
        }

        /* Not a photographer option */
        .not-photographer-option {
            display: flex;
            align-items: center;
            padding: 13px; /* Increased from 10px */
            background-color: rgba(255, 99, 99, 0.2);
            border-radius: 5px; /* Increased from 4px */
            margin-bottom: 19px; /* Increased from 15px */
        }

        .not-photographer-option input[type="checkbox"] {
            margin-right: 13px; /* Increased from 10px */
            width: 25px; /* Increased size */
            height: 25px; /* Increased size */
        }

        .not-photographer-option label {
            font-size: 1.4rem; /* Added font size */
        }

        /* Form grid */
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 19px; /* Increased from 15px */
            margin-bottom: 25px; /* Increased from 20px */
        }

        .form-group {
            display: flex;
            flex-direction: column;
        }

        .form-group label {
            margin-bottom: 6px; /* Increased from 5px */
            font-size: 1.4rem; /* Increased further from 0.9rem */
            color: var(--modal-text-secondary);
        }

        #photographerModal input[type="text"] {
            background-color: var(--modal-input-bg);
            border: 1px solid var(--modal-border);
            border-radius: 5px; /* Increased from 4px */
            padding: 12px 15px; /* Increased from 8px 12px */
            color: var(--modal-text);
            font-size: 1.4rem; /* Increased further from 0.9rem */
        }

        #photographerModal input[type="text"]:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.3); /* Increased from 2px */
        }

        /* Start times */
        .start-times-container {
            margin-bottom: 25px; /* Increased from 20px */
        }

        .start-times-label {
            display: block;
            margin-bottom: 13px; /* Increased from 10px */
            font-size: 1.4rem; /* Increased further from 0.9rem */
            color: var(--modal-text-secondary);
        }

        .start-times-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 10px; /* Increased from 8px */
        }

        .time-input {
            display: flex;
            flex-direction: column;
        }

        .time-input label {
            margin-bottom: 6px; /* Increased from 5px */
            font-size: 1.3rem; /* Increased further from 0.85rem */
            color: var(--modal-text-secondary);
            text-align: center;
        }

        .time-input input {
            padding: 10px 12px !important; /* Increased from 6px 8px */
            text-align: center;
            font-size: 1.3rem !important; /* Increased further from 0.85rem */
        }

        /* Button container */
        .button-container {
            padding: 19px 25px; /* Increased from 15px 20px */
            background-color: var(--modal-header-bg);
            border-top: 1px solid var(--modal-border);
        }

        .navigation-buttons {
            display: flex;
            justify-content: space-between;
            margin-bottom: 19px; /* Increased from 15px */
            gap: 13px; /* Increased from 10px */
        }

        .data-buttons {
            display: flex;
            justify-content: space-between;
            gap: 13px; /* Increased from 10px */
        }

        /* Button styling */
        #photographerModal button {
            border-radius: 5px; /* Increased from 4px */
            border: none;
            padding: 12px 24px; /* Increased further from 10px 20px */
            font-size: 1.4rem; /* Increased further from 1.125rem */
            cursor: pointer;
            transition: background-color 0.2s;
            white-space: nowrap;
            text-align: center;
            font-weight: 500;
        }

        #photographerModal button:hover {
            opacity: 0.9;
        }

        #photographerModal button:active {
            transform: translateY(1px);
        }

        /* Individual button styles */
        .save-btn {
            background-color: var(--save-button-bg);
            color: white;
            flex: 1;
        }

        .save-btn:hover {
            background-color: var(--save-button-hover);
        }

        .wizard-prev-btn,
        .wizard-next-btn {
            background-color: var(--nav-button-bg);
            color: white;
            flex: 1;
        }

        .wizard-prev-btn:hover,
        .wizard-next-btn:hover {
            background-color: var(--nav-button-hover);
        }

        .export-btn,
        .import-btn,
        .wizard-btn,
        .toggle-btn {
            background-color: var(--data-button-bg);
            color: white;
            flex: 1;
        }

        .export-btn:hover,
        .import-btn:hover,
        .wizard-btn:hover,
        .toggle-btn:hover {
            background-color: var(--data-button-hover);
        }

        .wizard-exit-btn {
            background-color: var(--exit-button-bg);
            color: white;
            flex: 1;
        }

        .wizard-exit-btn:hover {
            background-color: var(--exit-button-hover);
        }

        #photographerModal button:disabled {
            background-color: var(--disabled-button-bg);
            cursor: not-allowed;
            opacity: 0.7;
        }

        /* Hide file input */
        .hidden,
        #importFileInput {
            display: none;
        }

        /* Hide wizard exit button by default */
        #wizardExitBtn,
        #toggleViewBtn {
            display: none;
        }
    `;

    // Apply the modal styles
    const modalStyleEl = document.createElement('style');
    modalStyleEl.textContent = modalStyles;
    document.head.appendChild(modalStyleEl);

    // Add button listeners for the modal immediately after creating it
    try {
        document.getElementById('startWizardBtn').addEventListener('click', function() {
            console.log('Start Wizard button clicked');
            startPhotographerWizard();
        });

        document.getElementById('exportAllData').addEventListener('click', function() {
            console.log('Export button clicked');
            exportAllPhotographerData();
        });

        document.getElementById('importDataBtn').addEventListener('click', function() {
            console.log('Import button clicked');
            document.getElementById('importFileInput').click();
        });

        document.getElementById('importFileInput').addEventListener('change', function(e) {
            console.log('File selected for import');
            if(e.target.files.length > 0) {
                importPhotographerData(e.target.files[0]);
            }
        });

        // Wizard navigation buttons
        document.getElementById('wizardPrevBtn').addEventListener('click', function() {
            console.log('Previous button clicked');
            if(currentWizardIndex > 0) {
                // Save current data first before navigating
                savePhotographerData();
                currentWizardIndex--;
                loadPhotographerInWizard(currentWizardIndex);
            }
        });

        document.getElementById('wizardNextBtn').addEventListener('click', function() {
            console.log('Next button clicked');
            if(currentWizardIndex < availablePhotographers.length - 1) {
                // Save current data first
                savePhotographerData();
                currentWizardIndex++;
                loadPhotographerInWizard(currentWizardIndex);
            }
        });

        document.getElementById('wizardExitBtn').addEventListener('click', function() {
            console.log('Exit Wizard button clicked');
            wizardMode = false;
            currentWizardPhotographer = null;
            showWizardControls(false);
            closePhotographerModal();
        });

        // Close modal button
        document.querySelector('#photographerModal .close-modal-btn').addEventListener('click', function() {
            console.log('Close modal button clicked');
            closePhotographerModal();
        });

        // Save button
        document.querySelector('#photographerModal .save-btn').addEventListener('click', function() {
            console.log('Save button clicked');
            savePhotographerData();
        });

        // Toggle between Show All and Show Unfilled
        document.getElementById('toggleViewBtn').addEventListener('click', function() {
            console.log('Toggle View button clicked');
            wizardShowAllMode = !wizardShowAllMode;
            this.textContent = wizardShowAllMode ? 'Show Unfilled' : 'Show All';

            if (wizardMode) {
                // Reload the photographer list with the new filter setting
                if (wizardShowAllMode) {
                    getAllPhotographersEnhanced().then(all => {
                        availablePhotographers = all;
                        currentWizardIndex = 0;
                        loadPhotographerInWizard(currentWizardIndex);
                    });
                } else {
                    getUnprogrammedPhotographers().then(unprogrammed => {
                        availablePhotographers = unprogrammed;
                        currentWizardIndex = 0;
                        loadPhotographerInWizard(currentWizardIndex);
                    });
                }
            }
        });
    } catch(e) {
        console.error('Error setting up button event listeners:', e);

        // Use a MutationObserver as a fallback to ensure listeners get added
        const buttonObserver = new MutationObserver((mutations) => {
            const startWizardBtn = document.getElementById('startWizardBtn');
            if (startWizardBtn && !startWizardBtn._hasListener) {
                console.log('Adding listener to Start Wizard button via observer');
                startWizardBtn.addEventListener('click', function() {
                    console.log('Start Wizard button clicked (via observer)');
                    startPhotographerWizard();
                });
                startWizardBtn._hasListener = true;
            }
        });

        buttonObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Function to download object as JSON file
    function downloadObjectAsJson(exportObj, exportName){
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", exportName + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    // Export all photographer data
    function exportAllPhotographerData() {
        const allData = {};
        // Find all keys starting with "photographer_"
        for(let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if(key.startsWith('photographer_')) {
                try {
                    allData[key] = JSON.parse(localStorage.getItem(key));
                } catch(e) {
                    console.error(`Error parsing data for key ${key}:`, e);
                }
            }
        }

        if(Object.keys(allData).length === 0) {
            alert('No photographer data found to export.');
            return;
        }

        // Export with date in filename
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        downloadObjectAsJson(allData, `photographer_data_${dateStr}`);
    }

    // Import photographer data from file
    function importPhotographerData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                let importCount = 0;

                // Validate data structure
                if(typeof data !== 'object') {
                    throw new Error('Invalid data format. Expected an object.');
                }

                // Import each key
                for(const key in data) {
                    if(key.startsWith('photographer_') && typeof data[key] === 'object') {
                        localStorage.setItem(key, JSON.stringify(data[key]));
                        importCount++;
                    }
                }

                alert(`Successfully imported data for ${importCount} photographers.`);
            } catch(e) {
                console.error('Error importing data:', e);
                alert('Error importing data: ' + e.message);
            }
        };
        reader.readAsText(file);
    }

    // Get all available photographers from selection dropdown
    function getAllPhotographers() {
        const photographers = [];

        try {
            console.log('Starting photographer detection with direct DOM access');

            // Try to access the unfiltered select element directly from the page
            const personSelect = document.querySelector('#person_combo_calendar');

            if (personSelect) {
                console.log('Found person_combo_calendar select element, getting options');

                // Prefer Selectize instance if present; fall back to traditional select
                if (typeof $ !== 'undefined') {
                    const selectizeInstance = $(personSelect).data('selectize') || (($(personSelect)[0] && $(personSelect)[0].selectize) || null);
                    if (selectizeInstance) {
                        console.log('Using selectize to get options');
                        const optionsData = selectizeInstance.options || {};
                        console.log('Selectize options found:', Object.keys(optionsData).length);

                        for (const id in optionsData) {
                            if (!Object.prototype.hasOwnProperty.call(optionsData, id)) continue;
                            const option = optionsData[id] || {};
                            const name = option.name || option.text || option.label || '';
                            if (!id || id === 'none' || !name) continue;
                            if (name === 'All Staff' || name === 'No Staff Assigned') continue;

                            const key = 'photographer_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                            photographers.push({ id: id, name: name, key: key });
                        }

                        console.log('Processed photographers from Selectize:', photographers.length);
                    } else {
                        console.log('Selectize instance not found; using traditional select element options');
                        const options = personSelect.querySelectorAll('option');
                        console.log('Found option elements:', options.length);

                        options.forEach(option => {
                            const value = option.value;
                            const name = option.textContent.trim();
                            if (value && value !== 'none' && name !== 'All Staff' && name !== 'No Staff Assigned') {
                                const key = 'photographer_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                                photographers.push({ id: value, name: name, key: key });
                            }
                        });

                        console.log('Processed photographers from select options:', photographers.length);
                    }
                } else {
                    // Traditional select element
                    console.log('Using traditional select element options');
                    const options = personSelect.querySelectorAll('option');
                    console.log('Found option elements:', options.length);

                    options.forEach(option => {
                        const value = option.value;
                        const name = option.textContent.trim();

                        // Skip "All Staff" and "No Staff Assigned" options
                        if (value && value !== "none" && name !== "All Staff" && name !== "No Staff Assigned") {
                            // Create key using same sanitizer as elsewhere
                            const key = 'photographer_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

                            photographers.push({
                                id: value,
                                name: name,
                                key: key
                            });
                        }
                    });

                    console.log('Processed photographers from select options:', photographers.length);
                }
            } else {
                console.warn('#person_combo_calendar not found, trying direct option scraping');

                // Directly try to find all options in the page
                const allOptions = document.querySelectorAll('option');
                console.log('Found total options in page:', allOptions.length);

                // Filter options that look like photographer options (have values and aren't utility options)
                allOptions.forEach(option => {
                    const value = option.value;
                    const name = option.textContent.trim();

                    // Only include options that look like photographer entries
                    // They typically have numeric IDs and contain location markers like "ATL" or "PHL"
                    if ((value && /^\d+$/.test(value)) && (name && name.length > 0)) {
                        const key = 'photographer_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                        photographers.push({
                            id: value,
                            name: name,
                            key: key
                        });
                    }
                });

                console.log('Found photographers from direct page option scan:', photographers.length);
            }

            // Log keys that already exist in localStorage
            const existingKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('photographer_')) {
                    existingKeys.push(key);
                }
            }
            console.log('Existing photographer keys in localStorage:', existingKeys.length);
            console.log('Total photographers found:', photographers.length);

            // Check how many photographers are already programmed
            const programmed = photographers.filter(p => localStorage.getItem(p.key));
            console.log('Photographers with existing data:', programmed.length);
            console.log('Photographers without data:', photographers.length - programmed.length);
        } catch (error) {
            console.error('Error finding photographers:', error);
        }

        return photographers;
    }

    // Get all photographers including those in the dropdown - Promise-based approach
    function getAllPhotographersEnhanced() {
        return new Promise((resolve) => {
            // First try to get photographers directly
            let photographers = getAllPhotographers();

            // If we already found photographers, resolve immediately
            if (photographers.length > 0) {
                resolve(photographers);
                return;
            }

            // If we couldn't find photographers, try opening the filter panel and try again
            $('.navmenuEventsCalendar').offcanvas('show');

            // Wait for filter panel to open and try again
            setTimeout(() => {
                photographers = getAllPhotographers();
                if (photographers.length > 0) {
                    resolve(photographers);
                } else {
                    console.warn('Could not find photographers even after opening filter panel');
                    resolve([]);
                }
            }, 500);
        });
    }

    // Get photographers with no data
    function getUnprogrammedPhotographers() {
        return new Promise((resolve) => {
            getAllPhotographersEnhanced().then(allPhotographers => {
                console.log('Enhanced photographer search found:', allPhotographers.length, 'photographers');

                // First filter out staff marked as "not a photographer"
                const actualPhotographers = allPhotographers.filter(photographer => {
                    const data = localStorage.getItem(photographer.key);
                    if (!data) return true; // Keep unprogrammed photographers

                    try {
                        const parsed = JSON.parse(data);
                        // Filter out if marked as not a photographer
                        return !parsed.notAPhotographer;
                    } catch (e) {
                        console.warn('Failed to parse data for', photographer.name, e);
                        return true; // Keep if we can't parse the data
                    }
                });

                console.log('Actual photographers (excluding non-photographers):', actualPhotographers.length);

                // Then filter to find those without data or with empty time slots (prefer staffId matches)
                const unprogrammed = actualPhotographers.filter(photographer => {
                    // Prefer a direct staffId match (latest)
                    const latest = findLatestEntryForStaffId(photographer.id);
                    let dataString = latest ? JSON.stringify(latest.data) : null;
                    if (!dataString) {
                        // Fallback to any candidate key
                        const candidates = [photographer.key, ...getKeyCandidatesForPhotographer(photographer).filter(k => k !== photographer.key)];
                        for (const cand of candidates) {
                            const s = localStorage.getItem(cand);
                            if (s) { dataString = s; break; }
                        }
                    }

                    // No data at all
                    if (!dataString) {
                        console.log('No data for:', photographer.name, photographer.key);
                        return true;
                    }

                    try {
                        const data = JSON.parse(dataString);
                        const dr = (data && data.defaultRule) || {};

                        // Check if any time slots have data (either top-level or defaultRule)
                        const hasTimeData = (data.monStart || dr.monStart) ||
                                           (data.tueStart || dr.tueStart) ||
                                           (data.wedStart || dr.wedStart) ||
                                           (data.thuStart || dr.thuStart) ||
                                           (data.friStart || dr.friStart) ||
                                           (data.satStart || dr.satStart) ||
                                           (data.sunStart || dr.sunStart);

                        if (!hasTimeData) {
                            console.log('Has entry but all times blank for:', photographer.name, photographer.key);
                            return true;
                        }

                        console.log('Already has time data:', photographer.name, photographer.key);
                        return false;
                    } catch (e) {
                        console.warn('Failed to parse data for', photographer.name, e);
                        return true; // Keep if we can't parse the data
                    }
                });

                console.log('Unprogrammed photographers:', unprogrammed.length);
                resolve(unprogrammed);
            });
        });
    }

    // Function to extract staff information from response
    function extractStaffInfo(html) {
        // Remove SUCCESS{|} prefix
        const cleanHtml = html.replace(/^SUCCESS\{\|\}\s*/, '');

        // Create a temporary DOM parser
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');

        // Find all staff divs (they have IDs starting with 'staff_')
        const staffDivs = doc.querySelectorAll('div[id^="staff_"]');
        const staffInfo = {};

        staffDivs.forEach(div => {
            // Extract staff ID from the div's ID attribute
            const staffId = div.id.replace('staff_', '');

            // Find the name (in the strong tag inside the link)
            const nameEl = div.querySelector('.floatGrid a strong');
            const name = nameEl ? nameEl.textContent.trim() : 'Unknown';

            // Find the info section (span after <br> in the anchor)
            const infoSpan = div.querySelector('.floatGrid a br + span strong');
            const info = infoSpan ? infoSpan.textContent.trim() : '';

            staffInfo[staffId] = {
                id: staffId,
                name: name,
                info: info
            };
        });

        return staffInfo;
    }

    // Function to fetch staff information
    function fetchStaffInfo() {
        return new Promise((resolve, reject) => {
            // Check if we already have cached staff info
            if (staffInfoCache) {
                console.log('Using cached staff info');
                resolve(staffInfoCache);
                return;
            }

            console.log('Fetching staff information...');
            fetch("https://www.pixifi.com/admin/fn/staff/getStaffMainListing/", {
                "headers": {
                    "accept": "*/*",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                "body": "clientID=12295&view=active",
                "method": "POST",
                "credentials": "include"
            })
            .then(response => response.text())
            .then(html => {
                // Extract staff information
                const staffInfo = extractStaffInfo(html);
                console.log('Fetched info for', Object.keys(staffInfo).length, 'staff members');
                staffInfoCache = staffInfo; // Cache the result
                resolve(staffInfo);
            })
            .catch(error => {
                console.error('Error fetching staff data:', error);
                reject(error);
            });
        });
    }

    // Start the photographer wizard
    function startPhotographerWizard() {
        wizardMode = true;
        currentWizardPhotographer = null;

        // Show loading state in the modal
        openPhotographerModal(null);
        document.getElementById('wizardCounter').style.display = 'block';
        document.getElementById('wizardCounter').textContent = 'Loading photographers...';

        // First fetch staff info, then get photographers based on the show mode
        fetchStaffInfo()
        .then(() => {
            if (wizardShowAllMode) {
                return getAllPhotographersEnhanced();
            } else {
                return getUnprogrammedPhotographers();
            }
        })
        .then(photographers => {
            if (photographers.length === 0) {
                alert('No photographers found. Please check that the photographer dropdown has options.');
                wizardMode = false;
                currentWizardPhotographer = null;
                closePhotographerModal();
                return;
            }

            availablePhotographers = photographers;
            currentWizardIndex = 0;
            showWizardControls(true);
            loadPhotographerInWizard(currentWizardIndex);
        })
        .catch(error => {
            console.error('Error starting wizard:', error);
            alert('Error starting wizard. Please try again.');
            wizardMode = false;
            currentWizardPhotographer = null;
            closePhotographerModal();
        });
    }

    // Updated loadPhotographerInWizard function to work with promises
    function loadPhotographerInWizard(index) {
        const photographer = availablePhotographers[index];
        // Store the current photographer for save operations
        currentWizardPhotographer = photographer;

        // Update the dropdown selection
        const select = document.querySelector('#person_combo_calendar');
        if(select) {
            select.value = photographer.id;
            // Trigger change event to update filters
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
        } else {
            // If traditional select not found, try with selectize
            try {
                const staffLabels = Array.from(document.querySelectorAll('#filterContainerCalendar > ul > li > span'))
                    .filter(span => span.textContent.includes('Staff:'));

                if (staffLabels.length > 0) {
                    const staffLabel = staffLabels[0];
                    const listItem = staffLabel.closest('li');

                    if (listItem) {
                        // Try to update the selectize value
                        const selectizeControl = listItem.querySelector('.selectize-control');
                        if (selectizeControl && window.$) {
                            const selectizeInstance = $(selectizeControl).find('select').data('selectize');
                            if (selectizeInstance) {
                                selectizeInstance.setValue(photographer.id);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error setting photographer in selectize:', error);
            }
        }

        // Prefer loading by staffId (most recent), fall back to key candidates
        let prefillData = null;
        let matchedKey = null;
        const byStaff = findLatestEntryForStaffId(photographer.id);
        if (byStaff) {
            prefillData = byStaff.data;
            matchedKey = byStaff.key;
            console.log('Loaded by staffId for:', photographer.name, 'key:', matchedKey, prefillData);
        } else {
            const candidates = [photographer.key, ...getKeyCandidatesForPhotographer(photographer).filter(k => k !== photographer.key)];
            for (const cand of candidates) {
                const dataStr = localStorage.getItem(cand);
                if (!dataStr) continue;
                try {
                    prefillData = JSON.parse(dataStr);
                    matchedKey = cand;
                    console.log('Loading saved data for:', photographer.name, 'from key:', matchedKey, prefillData);
                    break;
                } catch(e) {
                    console.warn('Failed to parse localStorage for key', cand, e);
                }
            }
        }

        // Open the modal with the photographer's data and the correct key for wizard mode
        // If a legacy key was found, reuse it for subsequent saves in this wizard session
        if (matchedKey) {
            currentWizardPhotographer = Object.assign({}, photographer, { key: matchedKey });
        }

        openPhotographerModalInWizard(prefillData, currentWizardPhotographer);

        // Update wizard counter
        document.getElementById('wizardCounter').textContent = `${index + 1} of ${availablePhotographers.length}: ${photographer.name}`;

        // Update button states
        document.getElementById('wizardPrevBtn').disabled = index === 0;
        document.getElementById('wizardNextBtn').disabled = index === availablePhotographers.length - 1;
    }

    // New function specifically for opening the modal in wizard mode with correct key
    function openPhotographerModalInWizard(prefillData, photographer) {
        const modalContainer = document.getElementById('photographerModalContainer');
        const firstNameEl = document.getElementById('photographerFirstName');
        const lastNameEl = document.getElementById('photographerLastName');
        const monStartEl = document.getElementById('monStart');
        const tueStartEl = document.getElementById('tueStart');
        const wedStartEl = document.getElementById('wedStart');
        const thuStartEl = document.getElementById('thuStart');
        const friStartEl = document.getElementById('friStart');
        const satStartEl = document.getElementById('satStart');
        const sunStartEl = document.getElementById('sunStart');
        const notPhotographerEl = document.getElementById('notAPhotographer');

        // Display best-matching storage key (current key or legacy match)
        (function(){
            // Use the provided photographer.key (already adjusted in loader). If not present in storage, try a simple fallback scan.
            let displayKey = photographer.key;
            if (!localStorage.getItem(displayKey)) {
                const candidates = [photographer.key, ...getKeyCandidatesForPhotographer(photographer).filter(k => k !== photographer.key)];
                for (const cand of candidates) {
                    if (localStorage.getItem(cand)) { displayKey = cand; break; }
                }
            }
            document.getElementById('currentKeyDisplay').textContent = displayKey;
        })();

        // Try to get staff info from our cache
        let staffInfoContent = '';
        if (staffInfoCache && photographer.id) {
            const staffData = staffInfoCache[photographer.id];
            if (staffData && staffData.info) {
                staffInfoContent = staffData.info;
            }
        }

        // Set photographer info with staff info if available
        const photographerInfoHtml = `
            <div class="current-photographer">
                <span class="info-label">Currently Viewing:</span>
                <span class="info-value">
                    <strong>${photographer.name}</strong>
                </span>
            </div>
            <div class="availability-info">
                <span class="info-value">
                    ${staffInfoContent ?
                        `<strong>${staffInfoContent}</strong>` :
                        `<em style="color: rgba(255,255,255,0.6);">No schedule information available for this staff member.</em>`
                    }
                </span>
            </div>
        `;

        document.getElementById('PhotographerDataContainer').innerHTML = photographerInfoHtml;

        // Clear or prefill (supports top-level times with defaultRule fallback)
        const src = prefillData || {};
        const def = (src.defaultRule && typeof src.defaultRule === 'object') ? src.defaultRule : {};
        firstNameEl.value = src.firstName || '';
        lastNameEl.value = src.lastName || '';
        monStartEl.value = (src.monStart ?? def.monStart ?? '');
        tueStartEl.value = (src.tueStart ?? def.tueStart ?? '');
        wedStartEl.value = (src.wedStart ?? def.wedStart ?? '');
        thuStartEl.value = (src.thuStart ?? def.thuStart ?? '');
        friStartEl.value = (src.friStart ?? def.friStart ?? '');
        satStartEl.value = (src.satStart ?? def.satStart ?? '');
        sunStartEl.value = (src.sunStart ?? def.sunStart ?? '');
        notPhotographerEl.checked = !!src.notAPhotographer;

        // Explicitly set correct button visibility for wizard mode
        showWizardControls(true);

        modalContainer.style.display = 'flex'; // Changed to flex to center the modal
    }

    // Original openPhotographerModal for non-wizard use
    function openPhotographerModal(prefillData) {
        // Don't use this in wizard mode
        if (wizardMode) {
            console.warn('openPhotographerModal called in wizard mode - should use openPhotographerModalInWizard');
            return;
        }

        const modalContainer = document.getElementById('photographerModalContainer');
        const firstNameEl = document.getElementById('photographerFirstName');
        const lastNameEl = document.getElementById('photographerLastName');
        const monStartEl = document.getElementById('monStart');
        const tueStartEl = document.getElementById('tueStart');
        const wedStartEl = document.getElementById('wedStart');
        const thuStartEl = document.getElementById('thuStart');
        const friStartEl = document.getElementById('friStart');
        const satStartEl = document.getElementById('satStart');
        const sunStartEl = document.getElementById('sunStart');
        const notPhotographerEl = document.getElementById('notAPhotographer');

        // Display the current key
        const key = getPhotographerKey();
        document.getElementById('currentKeyDisplay').textContent = key;

        try {
            // Get currently viewing content from the calendar view
            var calendarViewData = document.querySelector('#eventCalendar > div > div.mws-panel-body.no-padding.no-border > div.year-view-container > div:nth-child(2) > div.month-title-wrapper > div.currentCalendarViewCustom');

            if (calendarViewData) {
                const currentlyViewingText = calendarViewData.textContent.trim();
                const currentPhotographerName = getSelectedText('#person_combo_calendar');

                const photographerInfoHtml = `
                    <div class="current-photographer">
                        <span class="info-label">Currently Viewing:</span>
                        <span class="info-value">
                            <strong>${currentPhotographerName || 'No photographer selected'}</strong>
                        </span>
                    </div>
                    <div class="availability-info">
                        <span class="info-value">${calendarViewData.innerHTML}</span>
                    </div>
                `;

                document.getElementById('PhotographerDataContainer').innerHTML = photographerInfoHtml;
            } else {
                const currentPhotographerName = getSelectedText('#person_combo_calendar');
                document.getElementById('PhotographerDataContainer').innerHTML = `
                    <div class="current-photographer">
                        <span class="info-label">Currently Viewing:</span>
                        <span class="info-value">
                            <strong>${currentPhotographerName || 'No photographer selected'}</strong>
                        </span>
                    </div>
                    <div class="availability-info">
                        <span class="info-value"></span>
                    </div>
                `;
            }
        } catch (e) {
            console.warn('Could not get photographer data for display in modal:', e);
            document.getElementById('PhotographerDataContainer').innerHTML = `
                <div class="current-photographer">
                    <span class="info-label">Currently Viewing:</span>
                    <span class="info-value">
                        <strong>No photographer selected</strong>
                    </span>
                </div>
                <div class="availability-info">
                    <span class="info-value"></span>
                </div>
            `;
        }

        // Clear or prefill (supports top-level times with defaultRule fallback)
        const src2 = prefillData || {};
        const def2 = (src2.defaultRule && typeof src2.defaultRule === 'object') ? src2.defaultRule : {};
        firstNameEl.value = src2.firstName || '';
        lastNameEl.value = src2.lastName || '';
        monStartEl.value = (src2.monStart ?? def2.monStart ?? '');
        tueStartEl.value = (src2.tueStart ?? def2.tueStart ?? '');
        wedStartEl.value = (src2.wedStart ?? def2.wedStart ?? '');
        thuStartEl.value = (src2.thuStart ?? def2.thuStart ?? '');
        friStartEl.value = (src2.friStart ?? def2.friStart ?? '');
        satStartEl.value = (src2.satStart ?? def2.satStart ?? '');
        sunStartEl.value = (src2.sunStart ?? def2.sunStart ?? '');
        notPhotographerEl.checked = !!src2.notAPhotographer;

        // Explicitly set correct button visibility for non-wizard mode
        showWizardControls(false);

        modalContainer.style.display = 'flex'; // Changed to flex to center the modal
    }

    function closePhotographerModal() {
        const modalContainer = document.getElementById('photographerModalContainer');
        modalContainer.style.display = 'none';

        // Reset wizard mode if active
        if(wizardMode) {
            wizardMode = false;
            currentWizardPhotographer = null;
            showWizardControls(false);
        }
    }

    // Show or hide wizard controls
    function showWizardControls(show) {
        document.getElementById('wizardCounter').style.display = show ? 'block' : 'none';

        // Show/hide the appropriate buttons in wizard mode
        document.getElementById('startWizardBtn').style.display = show ? 'none' : 'block';
        document.getElementById('wizardExitBtn').style.display = show ? 'block' : 'none';
        document.getElementById('toggleViewBtn').style.display = show ? 'block' : 'none'; // Only show toggle in wizard mode

        // In wizard mode, disable the Previous button at the start
        document.getElementById('wizardPrevBtn').disabled = currentWizardIndex <= 0;
    }

    function savePhotographerData() {
        // In wizard mode, use the current photographer's key directly
        const key = wizardMode && currentWizardPhotographer
            ? currentWizardPhotographer.key
            : getPhotographerKey();

        const mon = document.getElementById('monStart').value || '';
        const tue = document.getElementById('tueStart').value || '';
        const wed = document.getElementById('wedStart').value || '';
        const thu = document.getElementById('thuStart').value || '';
        const fri = document.getElementById('friStart').value || '';
        const sat = document.getElementById('satStart').value || '';
        const sun = document.getElementById('sunStart').value || '';

        const nowTs = Date.now();
        const dataObj = {
            firstName: document.getElementById('photographerFirstName').value || '',
            lastName: document.getElementById('photographerLastName').value || '',
            notAPhotographer: document.getElementById('notAPhotographer').checked,
            staffId: (wizardMode && currentWizardPhotographer ? currentWizardPhotographer.id : currentPhotographerId) || '',
            updatedAt: nowTs,
            // Store times at top-level for backwards compat with existing reads
            monStart: mon,
            tueStart: tue,
            wedStart: wed,
            thuStart: thu,
            friStart: fri,
            satStart: sat,
            sunStart: sun,
            // Also store in defaultRule for structured access
            defaultRule: {
                monStart: mon,
                tueStart: tue,
                wedStart: wed,
                thuStart: thu,
                friStart: fri,
                satStart: sat,
                sunStart: sun
            }
        };
        localStorage.setItem(key, JSON.stringify(dataObj));
        console.log('Saved photographer data for key:', key, dataObj);

        if(!wizardMode) {
            closePhotographerModal();
        }
    }

    // **5. Function to Apply Modal Styles (Existing)**
    function applyModalStyles() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.classList.add('modalWindow');
            modal.style.width = 'auto';
            modal.style.height = 'auto';
            modal.style.zIndex = '9999';
            modal.style.left = '50%';
            modal.style.top = '150px';
            modal.style.transform = 'translate(-50%, 0%)';

            // Add the missing modal elements
            const modalContent = modal.querySelector('#modalContent');
            if (modalContent && !modalContent.querySelector('.modalHeader')) {
                const modalHeader = document.createElement('div');
                modalHeader.className = 'modalHeader';
                modalHeader.innerHTML = `
                    <div class="leftTitle headerTitle"><i class="icon-calendar"></i> <strong>Event Info: </strong></div>
                    <div class="rightTitle"><a href="javascript:void(0);" onclick="cancelNewEvent();" aria-label="Close Modal"><span class="icon-cancel"></span></a></div>
                `;
                modalContent.prepend(modalHeader);
            }
        }
    }

    // **6. Helper Functions**
    function getSelectedText(selector) {
        const selectedOption = $(selector + ' option:selected');
        const text = selectedOption.length > 0 ? selectedOption.text().trim() : '';
        console.log(`Selected text for ${selector}:`, text);
        return text;
    }

    function getSelectedTexts(selector) {
        const selectedOptions = $(selector + ' option:selected');
        const texts = selectedOptions.map(function() {
            return $(this).text().trim();
        }).get();
        console.log(`Selected texts for ${selector}:`, texts);
        return texts;
    }

    function getCheckedLabelText(name) {
        const checkedInput = $(`input[name="${name}"]:checked`);
        if (checkedInput.length > 0) {
            const inputId = checkedInput.attr('id');
            if (inputId) {
                const label = $(`label[for="${inputId}"]`);
                if (label.length > 0) {
                    const text = label.text().trim();
                    console.log(`Checked label text for ${name}:`, text);
                    return text;
                }
            }
            // If labels are wrapped around inputs
            const parentLabel = checkedInput.closest('label');
            if (parentLabel.length > 0) {
                const text = parentLabel.text().replace(checkedInput.val(), '').trim();
                console.log(`Wrapped label text for ${name}:`, text);
                return text;
            }
        }
        console.log(`No checked input for ${name}.`);
        return '';
    }

    // **7. Function to Get Month Information**
    function getMonthInfo(startMonth, startYear, offset) {
        const date = moment([startYear, startMonth]).add(offset, 'months');

        // Retrieve and format filter texts
        const personFilterText = getSelectedText('#person_combo_calendar');
        let brands = getSelectedTexts('#brand_combo_calendar');
        brands = brands.filter(b => b !== "All").join(", ");
        const eventTypeFilterText = getSelectedText('#eventType_combo_calendar');
        const eventStatusFilterText = getSelectedText('#event_status_combo_calendar');
        const showLeadsFilterText = getCheckedLabelText('show_leads_calendar');
        const showBirthdaysFilterText = getCheckedLabelText('show_birthdays_calendar');
        const staffCategoryFilterText = getSelectedText('#eventStaffCategory_combo_calendar');

        const currentlyViewingHTML = `
            <span style="float: left;" id="Currently Viewing">Currently Viewing: </span>
            <span style="float: left;"></span>
            <span style="float: left;" id="personFilterText">a
                <strong>${personFilterText || 'All'}</strong>
            </span>
            <span style="float: left;margin-right: 10px;" id="brands">b
                <strong>${brands || 'All'}</strong>
            </span>
            <span style="float: left;margin-right: 10px;" id="eventTypeFilterText">c
                <strong>${eventTypeFilterText || 'All'}</strong>
            </span>
            <span style="float: left;margin-right: 10px;" id="eventStatusFilterText">d
                <strong>${eventStatusFilterText || 'All'}</strong>
            </span>
            <span style="float: left;margin-right: 10px;" id="showLeadsFilterText">e
                <strong>${showLeadsFilterText || 'All'}</strong>
            </span>
            <span style="float: left;margin-right: 10px;" id="showBirthdayFilterText">f
                <strong>${showBirthdaysFilterText || 'All'}</strong>
            </span>
            <span style="float: left;margin-right: 10px;" id="staffCategoryFilterText">g
                <strong>${staffCategoryFilterText || 'All'}</strong>
            </span>
        `;

        return {
            month: date.month() + 1, // moment months are 0-based
            year: date.year(),
            monthName: date.format('MMMM'),
            paddedMonth: ('0' + (date.month() + 1)).slice(-2),
            currentView: currentlyViewingHTML
        };
    }

    // --- one-liner debounce util  –––––––––––––––––––––––––––––––
    const debounce = (fn, wait = 250) => {
        let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait);};
    };

    // single shared debounced wrapper for IdleRefresh -- prevents
    // every 'change' handler from creating its own debounce timer.
    const debouncedIdleRefresh = debounce(IdleRefresh, 150);

    // --- ask the browser to run fn when the main thread is free  ––––
    const idle = fn => ('requestIdleCallback' in window)
        ? requestIdleCallback(fn, {timeout: 1200})   // give it ~1 s max
        : setTimeout(fn, 0);                         // fallback

    // global abort controller per refresh cycle
    let _calendarAborter = null;

    // **8. Initialize Filter Listeners**
    function initializeFilterListeners() {
        console.log('[YearView] Initializing filter listeners...');
        $("#person_combo_calendar").off('change').on('change', function() {
            console.log('[YearView] #person_combo_calendar CHANGED!');
            debouncedIdleRefresh();
        });
        $("#brand_combo_calendar, #eventType_combo_calendar, #event_status_combo_calendar, input[name=show_leads_calendar], input[name=show_birthdays_calendar], #eventStaffCategory_combo_calendar")
            .off('change').on('change', function() {
                console.log('[YearView] Other filter CHANGED!');
                debouncedIdleRefresh();
            });
    }

    function IdleRefresh() {
        // If you have a _updatePhotographerRefs() function, call it here. Otherwise, update any cache as needed.
        console.log('[YearView] IdleRefresh called.');
        // _updatePhotographerRefs(); // Uncomment if you have this function.
        idle(refreshAllMonths);        // heavy work runs later, UI stays free
    }

    // **9. Refresh All Months Based on Filters**
    function refreshAllMonths() {
        // kill whatever the previous filter change was doing
        if (_calendarAborter) { _calendarAborter.abort(); }
        _calendarAborter = new AbortController();
        const signal = _calendarAborter.signal;

        // NOTE: do NOT reset _monthCache here; it holds the last *successful*
        // request hash per month, letting us skip redundant calls while still
        // re-requesting if a previous attempt was aborted or failed. See
        // loadMonthEvents() for the logic.

        const yearView = document.querySelector('.year-view-container');
        if (yearView) {
            const currentMonth = moment().month();
            const currentYear = moment().year();
            const personFilter = $('#person_combo_calendar').val();

            // detect change in the *global* filter set (everything except month/year)
            const globalFilterObj = {
                person: personFilter,
                brands: $("#brand_combo_calendar").val(),
                type: $("#eventType_combo_calendar").val(),
                event_status: $("#event_status_combo_calendar").val(),
                show_leads: $("input[name=show_leads_calendar]:checked").val(),
                show_birthdays: $("input[name=show_birthdays_calendar]:checked").val(),
                staff_category: $("#eventStaffCategory_combo_calendar").val(),
                categories: $("#filterCategory").val(),
                categoryType: $("#category_filter_type").val()
            };
            const newGlobalHash = JSON.stringify(globalFilterObj);
            console.log(`[YearView] Global Hashes: New=${newGlobalHash}, Last=${_lastGlobalFilterHash}`);
            if (newGlobalHash !== _lastGlobalFilterHash) {
                console.log('[YearView] Global filters CHANGED, resetting _monthCache.');
                _monthCache = Object.create(null);      // filters changed; reset cache
                _lastGlobalFilterHash = newGlobalHash;
            } else {
                console.log('[YearView] Global filters UNCHANGED.');
            }

            if (personFilter) {
                console.log('[YearView] Looping through 12 months to load events...');
                for (let offset = 0; offset < 12; offset++) {
                    const monthInfo = getMonthInfo(currentMonth, currentYear, offset);
                    console.log(`[YearView] Calling loadMonthEvents for month ${monthInfo.month}-${monthInfo.year}`);
                    loadMonthEvents(`#month-${monthInfo.month}-${monthInfo.year}`, monthInfo.month, monthInfo.year, signal);
                }
            } else {
                console.warn('[YearView] No personFilter selected, skipping month load.');
            }
        }
        console.log('[YearView] refreshAllMonths finished.');
    }

    // **10. Add Year Button and Filter Options Button**
    function addYearButton() {
        const toolbar = document.querySelector('.fc-toolbar');
        if (!toolbar || document.querySelector('.fc-year-button')) return;

        const calendarMainDiv = document.getElementById('calendarMAINDIV');
        if (!calendarMainDiv || !calendarMainDiv.parentElement) {
            console.warn('calendarMAINDIV or its parent element not found.');
            return;
        }
        calendarMainDiv.parentElement.insertBefore(toolbar, calendarMainDiv);

        const yearButton = document.createElement('button');
        yearButton.type = 'button';
        yearButton.className = 'fc-year-button fc-button fc-state-default';
        yearButton.textContent = 'Year';
        yearButton.setAttribute('aria-label', 'Year View');

        yearButton.addEventListener('click', function() {
            toolbar.querySelectorAll('.fc-state-active').forEach(btn => {
                btn.classList.remove('fc-state-active');
            });
            yearButton.classList.add('fc-state-active');
            createYearView();
            $('.navmenuEventsCalendar').offcanvas('show');
        });

        toolbar.querySelectorAll('button:not(.fc-year-button):not(.fc-filter-button)').forEach(btn => {
            const originalClick = btn.onclick;
            btn.onclick = function(e) {
                if (originalClick) originalClick.call(this, e);
                yearButton.classList.remove('fc-state-active');
                const yearView = document.querySelector('.year-view-container');
                if (yearView) {
                    yearView.remove();
                    calendarMainDiv.style.display = '';
                }
            };
        });

        const buttonGroup = toolbar.querySelector('.fc-right .fc-button-group');
        if (buttonGroup) {
            buttonGroup.appendChild(yearButton);
        } else {
            console.warn('.fc-right .fc-button-group not found in toolbar.');
        }
    }

    // **12. MutationObserver to Watch for Calendar Initialization**
    const observer = new MutationObserver((mutations, obs) => {
        const buttonGroup = document.querySelector('.fc-right .fc-button-group');
        if (buttonGroup) {
            addYearButton();
            obs.disconnect();
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // **13. Function to Load Events for Each Month**
    function loadMonthEvents(monthContainer, monthNum, year, signal) {
        // Ensure we have the DOM element and mark it as loaded so the
        // IntersectionObserver doesn't schedule a duplicate fetch later.
        const elem = (typeof monthContainer === 'string')
                     ? document.querySelector(monthContainer)
                     : monthContainer;
        if (elem) {
            elem.dataset.loaded = '1';
        }

        let brands = $("#brand_combo_calendar").val();
        if(brands !== null && brands.length > 0) {
            if(brands.includes("All")) {
                brands = brands.filter(b => b !== "All").join("||");
            } else {
                brands = brands.join("||");
            }
        }

        const data = {
            clientID: '12295',
            person: $('#person_combo_calendar').val(),
            brands: brands,
            type: $("#eventType_combo_calendar").val(),
            event_status: $("#event_status_combo_calendar").val(),
            show_leads: $("input[name=show_leads_calendar]:checked").val(),
            show_birthdays: $("input[name=show_birthdays_calendar]:checked").val(),
            staff_category: $("#eventStaffCategory_combo_calendar").val(),
            categories: $("#filterCategory").val(),
            categoryType: $("#category_filter_type").val(),
            view: 'month',
            month: ('0' + monthNum).slice(-2),
            year: year.toString()
        };

        // --- Memoization guard: skip duplicate fetches for same month/filter ---
        const key = `${monthNum}-${year}`;

        // we keep two maps: successful cache & inflight requests
        window._monthInflight ??= Object.create(null);

        console.log(`[YearView] loadMonthEvents ${key}: Checking cache. Hash=${_lastGlobalFilterHash}`);
        console.log(`[YearView]   _monthCache[${key}]: ${_monthCache[key]}`);
        console.log(`[YearView]   _monthInflight[${key}]: ${window._monthInflight[key]}`);

        // Use the global filter hash for cache comparison (more stable)
        if (_monthCache[key] === _lastGlobalFilterHash) return;          // already loaded under this filter set
        if (window._monthInflight[key]) return;                          // already loading

        // mark as inflight to block dupes until we know outcome
        window._monthInflight[key] = true;

        const xhr = $.ajax({ type:'POST', url:'/admin/fn/events/getAllEventsJson/', data,
            success(response) {
                const results = response.split("{|}");
                if(results[0] === "SUCCESS") {
                    _monthCache[key] = _lastGlobalFilterHash;   // mark as successful
                    let events;
                    try {
                        events = $.JSON.decode(results[1]);
                    } catch (e) {
                        console.error('Failed to parse events JSON:', e);
                        return;
                    }
                    $(monthContainer).fullCalendar('removeEvents');
                    $(monthContainer).fullCalendar('addEventSource', events);
                    $(monthContainer).fullCalendar('rerenderEvents'); // local re-draw only, no network call

                    if(results.length > 2) {
                        const currentlyViewingHTML = results[2];
                        const monthWrapper = $(monthContainer).closest('.month-container').find('.month-title-wrapper');
                        const currentViewEl = monthWrapper.find('.currentCalendarViewCustom');
                        if(currentViewEl.length > 0) {
                            currentViewEl.html(currentlyViewingHTML);
                        } else {
                            console.warn('Currently Viewing element not found in monthContainer:', monthContainer);
                        }
                    }
                } else {
                    console.warn('Failed to load events:', results[0]);
                }
            },
            error(xhr, status) {
                if (status==='abort') return;
                console.error(status);
            },
            complete() { delete window._monthInflight[key]; }
        });
        if (signal) signal.addEventListener('abort', () => xhr.abort());
    }

    // **14. Single `createYearView` Function Incorporating Jump to Month**
    function createYearView() {
        const mainCalendar = document.getElementById('calendarMAINDIV');
        const existingYearView = document.querySelector('.year-view-container');

        if (existingYearView) {
            existingYearView.remove();
            mainCalendar.style.display = '';
            return;
        }

        const yearContainer = document.createElement('div');
        yearContainer.className = 'year-view-container';
        mainCalendar.style.display = 'none';
        mainCalendar.parentElement.appendChild(yearContainer);

        const currentMonth = moment().month();
        const currentYear = moment().year();

        // **1. Create Jump to Month Navigation**
        const pixifiJumpNav = document.createElement('div');
        pixifiJumpNav.className = 'jump-to-month-nav';
        yearContainer.appendChild(pixifiJumpNav);

        // **1b. Create the Filter Options button in the same nav**
        const newFilterButton = document.createElement('button');
        newFilterButton.type = 'button';
        newFilterButton.className = 'fc-myCustomButton-button fc-button fc-state-default fc-filter-button';
        newFilterButton.innerHTML = '<i class="fa fa-gears"></i> Filter Options';
        newFilterButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $('.navmenuEventsCalendar').offcanvas('show');
        });
        // Append the filter button to the nav container (will appear last, at bottom)
        pixifiJumpNav.appendChild(newFilterButton);

        // **2. Create 12 Months Starting from Current Month**
        const months = [];
        for (let offset = 0; offset < 12; offset++) {
            const monthInfo = getMonthInfo(currentMonth, currentYear, offset);
            months.push(monthInfo);
        }

        // **3. Generate Navigation Buttons (Month Jumps)**
        months.forEach((monthInfo, index) => {
            const navButton = document.createElement('button');
            navButton.textContent = `${monthInfo.month} - ${monthInfo.monthName}`;
            navButton.setAttribute('data-target', `month-${monthInfo.month}-${monthInfo.year}`);
            navButton.setAttribute('aria-label', `${monthInfo.monthName} ${monthInfo.year}`);

            if (index === 0) {
                navButton.classList.add('active');
            }

            navButton.addEventListener('click', function() {
                pixifiJumpNav.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                const targetId = this.getAttribute('data-target');
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    // Replace scrollIntoView with offset
                    const offset = 160;
                    const rect = targetElement.getBoundingClientRect();
                    const scrollTop = rect.top + window.pageYOffset - offset;
                    window.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                }
            });

            pixifiJumpNav.insertBefore(navButton, newFilterButton);
            // Insert each month button above the Filter Options button
        });

        // **4. Create Month Sections**
        months.forEach(monthInfo => {
            const monthContainer = document.createElement('div');
            monthContainer.className = 'month-container';
            monthContainer.style.marginBottom = '40px';

            const monthTitleWrapper = document.createElement('div');
            monthTitleWrapper.className = 'month-title-wrapper';
            monthTitleWrapper.style.position = 'relative';

            const monthTitle = document.createElement('div');
            monthTitle.className = 'month-title';
            monthTitle.textContent = `${monthInfo.month} - ${monthInfo.monthName} ${monthInfo.year}`;

            const currentViewEl = document.createElement('div');
            currentViewEl.className = 'currentCalendarViewCustom';

            monthTitleWrapper.appendChild(monthTitle);
            monthTitleWrapper.appendChild(currentViewEl);

            const monthSection = document.createElement('div');
            monthSection.className = 'month-section';
            monthSection.id = `month-${monthInfo.month}-${monthInfo.year}`;

            monthContainer.appendChild(monthTitleWrapper);
            monthContainer.appendChild(monthSection);
            yearContainer.appendChild(monthContainer);

            $(monthSection).fullCalendar({
                defaultDate: moment([monthInfo.year, monthInfo.month - 1, 1]),
                header: false,
                height: 800,
                defaultView: 'month',
                selectable: true,
                selectHelper: true,
                eventRender: function(eventObj, $el) {
                    // Store the timeout ID directly on the event element
                    let hideTimeoutId;

                    $el.popover({
                        title: eventObj.title,
                        trigger: 'manual', // Change trigger to manual
                        placement: 'top',
                        container: 'body',
                        html: true // Allow HTML content in popover (for status dots)
                    });

                    // Show popover on mouseenter
                    $el.on('mouseenter', function() {
                        clearTimeout(hideTimeoutId); // Clear any existing timeout
                        $el.popover('show');
                        // Set a timeout to hide the popover after 7 seconds if still visible
                        hideTimeoutId = setTimeout(function() {
                            $el.popover('hide');
                            // Additionally, remove the popover element from the DOM after hiding
                            const popoverId = $el.attr('aria-describedby');
                            if (popoverId) {
                                $('#' + popoverId).remove();
                            }
                        }, 7000); // 7 seconds
                    });

                    // Hide popover on mouseleave
                    $el.on('mouseleave', function() {
                        clearTimeout(hideTimeoutId); // Clear the timeout immediately
                        $el.popover('hide');
                        // Ensure the popover element is removed quickly on mouseleave
                        const popoverId = $el.attr('aria-describedby');
                        if (popoverId) {
                            $('#' + popoverId).remove();
                        }
                    });

                    if(eventObj.url !== null && eventObj.url !== undefined) {
                        let eventData;
                        try {
                            eventData = Base64.decode(eventObj.url);
                        } catch (e) {
                            console.error('Failed to decode event URL:', e);
                            eventData = '';
                        }
                        var eventArray = (eventData.charAt(0) === "{" ) ? $.JSON.decode(eventData) : '';
                    }

                    if(eventArray !== '' && eventArray !== undefined && eventArray !== null) {
                        if(eventArray.eventStatusID && eventArray.eventStatusID !== '0') {
                            $el.append('<div class="pxEventStatus" style="background-color: #' +
                                     eventArray.eventStatusBGColor + ';" data-toggle="popover" data-html="true" data-content="' +
                                     eventArray.eventStatusName + '" ></div>');
                        }
                    }
                },
                eventClick: function(event) {
                    console.log("clicked an event");
                    if(event.url && event.url.indexOf('http') > -1) {
                        window.open(event.url);
                        return false;
                    }
                    let eventData;
                    try {
                        eventData = Base64.decode(event.url);
                    } catch (e) {
                        console.error('Failed to decode event URL:', e);
                        return false;
                    }
                    let eventArray;
                    try {
                        eventArray = $.JSON.decode(eventData);
                    } catch (e) {
                        console.error('Failed to parse event data:', e);
                        return false;
                    }

                    if(eventArray.eventID) {
                        console.log('event has event id');
                        $.ajax({
                            type: "POST",
                            url: "/admin/fn/events/getEventOverviewWindow/",
                            data: {
                                clientID: '12295',
                                eventID: eventArray.eventID,
                                customerType: eventArray.customerType,
                                customerID: eventArray.customerID
                            },
                            success: function(response) {
                                var results = response.split("{|}");
                                if(results[0] === "SUCCESS") {
                                    if (typeof modal !== 'undefined' && typeof modal.open === 'function') {
                                        modal.open({content: results[1]});
                                    } else {
                                        console.warn('Modal function is not available.');
                                    }
                                    applyModalStyles();
                                } else {
                                    console.warn('Failed to load event overview:', results[0]);
                                }
                            },
                            error: function(xhr, status, error) {
                                console.error('AJAX error:', status, error);
                            }
                        });
                    } else{
                        console.log('event has no event id, must be a lead.');
                        console.log('event array: ', eventArray);
                        $.ajax({
                            type: "POST",
                            url: "/admin/fn/events/getEventOverviewWindow/",
                            data: {
                                clientID: '12295',
                                customerType: eventArray.customerType,
                                customerID: eventArray.customerID
                            },
                            success: function(response) {
                                var results = response.split("{|}");
                                if(results[0] === "SUCCESS") {
                                    if (typeof modal !== 'undefined' && typeof modal.open === 'function') {
                                        modal.open({content: results[1]});
                                    } else {
                                        console.warn('Modal function is not available.');
                                    }
                                    applyModalStyles();
                                } else {
                                    console.warn('Failed to load event overview:', results[0]);
                                }
                            },
                            error: function(xhr, status, error) {
                                console.error('AJAX error:', status, error);
                            }
                        });
                    }
                    return false;
                }
            });

            // Removed eager load; months now load lazily via IntersectionObserver.
        });

        // Patch: Lazy-load only the month(s) in view
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting && !e.target.dataset.loaded) {
                    const [_, m, y] = e.target.id.match(/month-(\d+)-(\d+)/);
                    loadMonthEvents(e.target, +m, +y, _calendarAborter?.signal);
                    e.target.dataset.loaded = 1;          // mark as done
                }
            });
        }, {rootMargin: '600px 0px'});   // preload a little early

        document.querySelectorAll('.month-section').forEach(m => io.observe(m));

        // **5. Highlight the Current Month in Navigation (Optional)**
        const today = moment();
        const currentMonthIndex = months.findIndex(m => m.month === (today.month() + 1) && m.year === today.year());
        if (currentMonthIndex !== -1) {
            const currentMonthButton = pixifiJumpNav.querySelectorAll('button')[currentMonthIndex];
            if (currentMonthButton) {
                pixifiJumpNav.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                currentMonthButton.classList.add('active');
            }
        }
        applyModalStyles();

        // Ensure filter listeners are active right after creating the year view
        initializeFilterListeners();
    }

    // **15. Hook into the Original clearCalendarFilter Function**
    if (typeof window.clearCalendarFilter === 'function') {
        const originalClearFilter = window.clearCalendarFilter;
        window.clearCalendarFilter = function(which) {
            originalClearFilter.apply(this, arguments);
            setTimeout(refreshAllMonths, 100);
        };
    } else {
        console.warn('window.clearCalendarFilter is not defined.');
    }

    // **16. Hook into Existing refreshEventsJSON Function**
    if (typeof window.refreshEventsJSON === 'function') {
        const originalRefresh = window.refreshEventsJSON;
        window.refreshEventsJSON = function(...args) {
            const yearView = document.querySelector('.year-view-container');
            if (yearView) {
                // Suppress the original multi-fetch logic entirely while in Year View.
                // Our own filter listeners already invoke refreshAllMonths via IdleRefresh,
                // so calling it again here would double-load every month.
                return;   // just swallow the call
            }
            return originalRefresh.apply(this, args);
        };
    } else {
        console.warn('window.refreshEventsJSON is not defined.');
    }

    // **17. Hook into Existing forceRefreshEventsJSON Function**
    if (typeof window.forceRefreshEventsJSON === 'function') {
        const originalForceRefresh = window.forceRefreshEventsJSON;
        window.forceRefreshEventsJSON = function(...args) {
            const yearView = document.querySelector('.year-view-container');
            if (yearView) {
                // Suppress the original behaviour for the same reason as above.
                return;
            }
            return originalForceRefresh.apply(this, args);
        };
    } else {
        console.warn('window.forceRefreshEventsJSON is not defined.');
    }

    // **18. Modify the Existing Filter Button to Work with Year View**
    const navmenuEventsCalendar = $('.navmenuEventsCalendar').data('offcanvas');
    if (navmenuEventsCalendar && navmenuEventsCalendar.options && typeof navmenuEventsCalendar.options.onShown === 'function') {
        const originalFilterClick = navmenuEventsCalendar.options.onShown;
        navmenuEventsCalendar.options.onShown = function() {
            if (originalFilterClick) {
                originalFilterClick.apply(this, arguments);
            }
            initializeFilterListeners();
        };
    } else {
        console.warn('navmenuEventsCalendar or its onShown option is not defined.');
    }

    // **19. Modify Clicking/Right-Clicking a Day to Include Photographer Data Caching**
    // Left-click: if no cached info, show modal for input. If cached, copy to clipboard.
    // Right-click: show modal prefilled with current data (edit).
    $(document).on('click', 'td.fc-day-number', function (e) {
        e.stopImmediatePropagation();
        const iso = this.dataset.date;                 // "2025-05-01"
        if (!iso) return;
        const fmt = iso.slice(5,7)+'/'+iso.slice(8)+'/'+iso.slice(0,4);   // 05/01/2025
        const data = getPhotographerData();

        console.log('--- Day Click Debug ---');
        console.log('Clicked ISO date:', iso);
        const dateObj = moment(iso); // Use moment.js to parse the date
        console.log('Parsed Date Object (Moment):', dateObj.toDate()); // Log the underlying Date object from Moment
        const dayIndex = dateObj.day(); // Use moment.js .day() to get the day of the week
        console.log('Day Index (0=Sun, 6=Sat):', dayIndex);
        console.log('Current Photographer Key:', currentPhotographerKey); // Access the global variable
        console.log('Retrieved Photographer Data:', data);

        if (!data) return openPhotographerModal(null);

        const startTimes = ['sunStart','monStart','tueStart','wedStart',
                            'thuStart','friStart','satStart'];
        const dayStart = getDayStart(data, iso);

        console.log('Resolved Day Start Key:', startTimes[dayIndex]);
        console.log('Value to be copied (dayStart):', dayStart);
        console.log('------------------------');

        if (!dayStart.trim()) return openPhotographerModal(data);

        try {
            const payload = [data.firstName, data.lastName, dayStart, fmt, currentPhotographerId].join(',');
            localStorage.setItem('dateInfo', payload);
            showToast('Saved to local data');
        } catch (e) {
            console.warn('Failed saving dateInfo to localStorage:', e);
            showToast('Save failed', 3000, '#c0392b');
        }
    });

    // Right-click a day -> bring up modal with prefilled data for editing
    $(document).on('contextmenu', 'td.fc-day-number', function(e) {
        e.preventDefault(); // Prevent the default context menu
        const photographerData = getPhotographerData();
        openPhotographerModal(photographerData);
    });

    const menuobserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === "attributes" && mutation.attributeName === "class") {
                let menu = mutation.target;
                if (!menu.classList.contains("in")) {
                    console.log("Detected removal of 'in' class. Reapplying...");
                    menu.classList.add("in"); // Re-add the 'in' class
                }
            }
        });
    });

    menuobserver.observe(document.querySelector('.navmenuEventsCalendar'), {
        attributes: true,
        attributeFilter: ['class']
    });

    // Utility: get start time accounting for seasonal override
    function getDayStart(data, iso) {
        if (!data) return '';
        const defaultRule = data.defaultRule || {
            monStart: data.monStart || '', tueStart: data.tueStart || '', wedStart: data.wedStart || '',
            thuStart: data.thuStart || '', friStart: data.friStart || '', satStart: data.satStart || '', sunStart: data.sunStart || ''
        };
        let times = defaultRule;
        if (data.overrideRule && data.overrideRule.effectiveFrom && moment(iso).isSameOrAfter(moment(data.overrideRule.effectiveFrom))) {
            times = data.overrideRule;
        }
        const keys = ['sunStart','monStart','tueStart','wedStart','thuStart','friStart','satStart'];
        const dow = moment(iso).day();
        return times[keys[dow]] || '';
    }

})();
