// ==UserScript==
// @name         Email Sender Switcher
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Automatically switches the email sender to the EDITING EAST/CENTRAL SMP option
// @author       You
// @match        https://www.pixifi.com/admin/leads/[0-9]+
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Target value to select (EDITING EAST/CENTRAL SMP)
    const targetValue = '11634';

    // Function to change the selected option and trigger a click
    function changeSelectedOption(selectElement) {
        // Check if the select element already has the target value selected
        if (selectElement.value === targetValue) {
            console.log('Target option already selected');
            return;
        }

        console.log('Changing selected option to EDITING EAST/CENTRAL SMP');
        
        // Change the selected option
        selectElement.value = targetValue;
        
        // Update the selected attribute on options
        Array.from(selectElement.options).forEach(option => {
            option.selected = (option.value === targetValue);
        });
        
        // Dispatch change event
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Click the select element to update the UI
        selectElement.click();
        
        console.log('Email sender has been switched to EDITING EAST/CENTRAL SMP');
    }

    // Create a MutationObserver to watch for the select element
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'subtree') {
                const selectElement = document.getElementById('brandID');
                if (selectElement) {
                    // Check if the expected options are present
                    const hasTargetOption = Array.from(selectElement.options).some(option => option.value === targetValue);
                    
                    if (hasTargetOption) {
                        changeSelectedOption(selectElement);
                    }
                }
            }
        }
    });

    // Start observing the document with the configured parameters
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Also run on initial page load
    window.addEventListener('load', () => {
        const selectElement = document.getElementById('brandID');
        if (selectElement) {
            const hasTargetOption = Array.from(selectElement.options).some(option => option.value === targetValue);
            if (hasTargetOption) {
                changeSelectedOption(selectElement);
            }
        }
    });
})(); 