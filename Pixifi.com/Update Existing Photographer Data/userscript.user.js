// ==UserScript==
// @name         Update Existing Photographer Data
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Update existing photographer data to include staff IDs based on the selectize dropdown
// @author       You
// @match        https://www.pixifi.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Mapping of photographer names to staff IDs (from selectize dropdown)
    const staffIdMapping = {
        // Format: "First Last": staffId
        "Rachel Wood": 15143,
        "Estefania Polanco": 23946,
        "Erin Larson": 16994,
        "Think North": 14274,
        "Tedra Schaefer": 24704,
        // Add more mappings as needed
    };

    function updateExistingPhotographerData() {
        let updatedCount = 0;

        console.log('Starting photographer data update...');

        // Look through all localStorage keys for photographer data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('photographer_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data && data.firstName && data.lastName && !data.staffId) {
                        const fullName = `${data.firstName} ${data.lastName}`;
                        const staffId = staffIdMapping[fullName];

                        if (staffId) {
                            data.staffId = staffId;
                            data.timestamp = data.timestamp || new Date().toISOString();

                            localStorage.setItem(key, JSON.stringify(data));
                            updatedCount++;
                            console.log(`Updated ${fullName} with staff ID ${staffId}`);
                        } else {
                            console.log(`No staff ID mapping found for ${fullName}`);
                        }
                    }
                } catch (e) {
                    console.error('Error updating photographer data:', e);
                }
            }
        }

        console.log(`Updated ${updatedCount} photographer records`);
        alert(`Updated ${updatedCount} photographer records with staff IDs`);
    }

    // Add update button to the page
    function addUpdateButton() {
        const updateButton = document.createElement('button');
        updateButton.textContent = 'Update Photographer Data';
        updateButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #26C281;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;

        updateButton.addEventListener('click', updateExistingPhotographerData);
        document.body.appendChild(updateButton);

        // Remove button after 30 seconds
        setTimeout(() => {
            if (updateButton.parentNode) {
                updateButton.parentNode.removeChild(updateButton);
            }
        }, 30000);
    }

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addUpdateButton);
    } else {
        addUpdateButton();
    }

    console.log('Photographer Data Updater loaded');
})();
