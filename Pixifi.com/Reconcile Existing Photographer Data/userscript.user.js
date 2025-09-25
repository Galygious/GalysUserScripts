// ==UserScript==
// @name         Reconcile Existing Photographer Data
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Update existing photographer data to include staff IDs and timestamps for compatibility with new system
// @author       You
// @match        https://www.pixifi.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- Helpers ------------------------------------------------------------
    function normalizeText(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/\([^)]*\)/g, ' ')         // remove parens content
            .replace(/[^a-z0-9]+/g, ' ')         // non-alphanumerics → space
            .replace(/\s+/g, ' ')               // collapse spaces
            .trim();
    }

    function simplifyDisplayName(display) {
        // Take last segment after ▶ if present, strip parens, collapse spaces
        const raw = String(display || '');
        const seg = raw.includes('▶') ? raw.split('▶').pop() : raw;
        return normalizeText(seg);
    }

    function getStaffListFromPage() {
        const list = [];
        try {
            const sel = document.querySelector('#person_combo_calendar');
            if (!sel) return list;

            // Try Selectize first
            if (typeof window.$ !== 'undefined') {
                const $sel = window.$(sel);
                const selectize = $sel.data('selectize') || ($sel[0] && $sel[0].selectize) || null;
                if (selectize && selectize.options) {
                    for (const id in selectize.options) {
                        if (!Object.prototype.hasOwnProperty.call(selectize.options, id)) continue;
                        if (!id || id === 'none') continue;
                        const opt = selectize.options[id] || {};
                        const display = opt.name || opt.text || opt.label || '';
                        const simple = simplifyDisplayName(display);
                        if (!simple) continue;
                        list.push({ id: String(id), display, simple });
                    }
                    return list;
                }
            }

            // Fallback to native <option>s
            const options = sel.querySelectorAll('option');
            options.forEach(o => {
                const id = o.value;
                if (!id || id === 'none') return;
                const display = (o.textContent || '').trim();
                const simple = simplifyDisplayName(display);
                if (!simple) return;
                list.push({ id: String(id), display, simple });
            });
        } catch (e) {
            console.warn('Failed to read staff list:', e);
        }
        return list;
    }

    // Function to reconcile existing photographer data with staff IDs
    function reconcileExistingData() {
        console.log('Starting data reconciliation...');
        let updatedCount = 0;
        let foundKeys = [];
        const updatedKeys = [];
        
        // Build staff list from the live page only
        const staffList = getStaffListFromPage();
        if (staffList.length === 0) {
            alert('No staff list detected. Open the calendar page with the Staff dropdown visible, then click Reconcile again.');
            return;
        }

        // First, list all photographer keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('photographer_')) {
                foundKeys.push(key);
            }
        }

        console.log('Found photographer keys:', foundKeys);

        // Look through all localStorage keys for photographer data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('photographer_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data && data.staffId) {
                        console.log(`⏭️  Already has staffId: ${key} (ID: ${data.staffId})`);
                        // Ensure updatedAt field exists for new system
                        if (!('updatedAt' in data)) {
                            data.updatedAt = Date.now();
                            localStorage.setItem(key, JSON.stringify(data));
                        }
                        continue;
                    }

                    if (data) {
                        // Build matching signals
                        const dataFullName = normalizeText(`${data.firstName || ''} ${data.lastName || ''}`);
                        const keyNameSimple = normalizeText(key.replace('photographer_', '').replace(/_/g, ' '));

                        // Try exact full-name contain (first + last) against live staff simple
                        let matches = staffList.filter(s => {
                            // Prefer last token + first token match when we can derive them
                            const tokens = s.simple.split(' ');
                            const last = tokens[tokens.length - 1] || '';
                            const first = tokens[0] || '';
                            const keyHas = keyNameSimple.includes(first) && keyNameSimple.includes(last);
                            const dataHas = dataFullName && dataFullName.includes(first) && dataFullName.includes(last);
                            return keyHas || dataHas;
                        });

                        // If ambiguous or zero, try last-name-only unique match
                        if (matches.length !== 1) {
                            const lastName = (dataFullName.split(' ').pop() || '').trim();
                            if (lastName) {
                                const lnMatches = staffList.filter(s => s.simple.endsWith(' ' + lastName) || s.simple === lastName || s.simple.includes(' ' + lastName + ' '));
                                if (lnMatches.length === 1) {
                                    matches = lnMatches;
                                }
                            }
                        }

                        // If still none, fall back to any include of staff simple inside keyNameSimple
                        if (matches.length !== 1) {
                            const includeMatches = staffList.filter(s => keyNameSimple.includes(s.simple));
                            if (includeMatches.length === 1) {
                                matches = includeMatches;
                            }
                        }

                        if (matches.length === 1) {
                            const matched = matches[0];
                            data.staffId = parseInt(matched.id, 10);
                            data.updatedAt = Date.now();
                            localStorage.setItem(key, JSON.stringify(data));
                            updatedCount++;
                            updatedKeys.push(`${key} -> ${matched.id} (${matched.display})`);
                            console.log(`✅ Updated ${key} with staff ID ${matched.id} for ${matched.display}`);
                        } else if (matches.length > 1) {
                            console.warn(`⚠️  Ambiguous match for ${key} (${dataFullName || keyNameSimple}). Candidates:`, matches.map(m => `${m.id}:${m.display}`));
                        } else {
                            console.warn(`❌ No match found for ${key} (${dataFullName || keyNameSimple})`);
                        }
                    }
                } catch (e) {
                    console.error('❌ Error reconciling data for key:', key, e);
                }
            }
        }

        console.log(`🎉 Reconciliation complete! Updated ${updatedCount} photographer records`);
        if (updatedKeys.length) {
            console.log('Updated entries:\n' + updatedKeys.join('\n'));
        }
        alert(`✅ Reconciliation complete!\n\nUpdated: ${updatedCount} records\nTotal found: ${foundKeys.length}`);
    }

    // Function to show current data status
    function showDataStatus() {
        let totalPhotographers = 0;
        let withStaffId = 0;
        let withoutStaffId = 0;
        let details = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('photographer_')) {
                totalPhotographers++;
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data) {
                        if (data.staffId) {
                            withStaffId++;
                            details.push(`✅ ${key} (ID: ${data.staffId})`);
                        } else {
                            withoutStaffId++;
                            details.push(`❌ ${key} (needs staff ID)`);
                        }
                    }
                } catch (e) {
                    details.push(`⚠️  ${key} (parse error)`);
                }
            }
        }

        const summary = `📊 Photographer Data Status:\n\nTotal: ${totalPhotographers}\n✅ With Staff ID: ${withStaffId}\n❌ Need Staff ID: ${withoutStaffId}\n\n${details.join('\n')}`;

        console.log(summary);
        alert(summary);
    }

    // Add buttons to the page
    function addControlButtons() {
        // Status button
        const statusButton = document.createElement('button');
        statusButton.textContent = 'Check Data Status';
        statusButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: Arial, sans-serif;
            font-size: 12px;
        `;

        // Reconcile button
        const reconcileButton = document.createElement('button');
        reconcileButton.textContent = 'Reconcile Data';
        reconcileButton.style.cssText = `
            position: fixed;
            top: 40px;
            right: 10px;
            z-index: 10000;
            background: #e67e22;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: Arial, sans-serif;
            font-size: 12px;
        `;

        statusButton.addEventListener('click', showDataStatus);
        reconcileButton.addEventListener('click', reconcileExistingData);

        document.body.appendChild(statusButton);
        document.body.appendChild(reconcileButton);

        // Remove buttons after 5 minutes
        setTimeout(() => {
            if (statusButton.parentNode) {
                statusButton.parentNode.removeChild(statusButton);
            }
            if (reconcileButton.parentNode) {
                reconcileButton.parentNode.removeChild(reconcileButton);
            }
        }, 300000);
    }

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addControlButtons);
    } else {
        addControlButtons();
    }

    console.log('🔧 Reconcile Existing Photographer Data script loaded');
    console.log('📋 Click the buttons in the top-right corner to check status and reconcile data');
})();
