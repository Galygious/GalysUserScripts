// ==UserScript==
// @name         Pixifi Leads Page Options
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds more options to the leads page items per page selector
// @author       You
// @match        https://www.pixifi.com/admin/leads/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // State management
    const state = {
        isModifying: false,
        isInitialized: false,
        lastProcessedMutation: 0,
        mutationThrottle: 100, // Lower throttle for faster re-insert
    };

    // Debug logging function
    function debugLog(message, data = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[Pixifi Leads Options] ${timestamp} - ${message}`;
        if (data) {
            console.log(logMessage, data);
        } else {
            console.log(logMessage);
        }
    }

    // Debounce function to limit how often a function can be called
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Function to add new options to the select element
    function addNewOptions() {
        debugLog('addNewOptions called, isModifying:', state.isModifying);
        
        if (state.isModifying) {
            debugLog('Skipping addNewOptions due to isModifying flag');
            return;
        }
        state.isModifying = true;

        const selectElement = document.getElementById('itemsPerPage_lead');
        if (!selectElement) {
            debugLog('Select element not found');
            state.isModifying = false;
            return;
        }

        // Check if we've already added our options
        if (selectElement.querySelector('option[value="999999999"]')) {
            debugLog('Options already added');
            // Still try to add custom input in case it was removed
            addCustomEntryOption();
            state.isModifying = false;
            return;
        }

        debugLog('Adding new options to select element');
        // Create new options
        const newOptions = [
            { value: '250', text: '250' },
            { value: '500', text: '500' },
            { value: '999999999', text: 'All' }
        ];

        // Add new options to the select element
        newOptions.forEach(option => {
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.text = option.text;
            selectElement.appendChild(newOption);
        });

        // Add custom entry UI
        addCustomEntryOption();

        // Restore saved page length if it exists
        const savedPageLength = localStorage.getItem('pixifi_custom_page_length');
        if (savedPageLength) {
            debugLog('Restoring saved page length:', savedPageLength);
            // Check if option exists, if not create it
            let option = selectElement.querySelector('option[value="' + savedPageLength + '"]');
            if (!option) {
                option = document.createElement('option');
                option.value = savedPageLength;
                option.text = savedPageLength;
                selectElement.appendChild(option);
            }
            selectElement.value = savedPageLength;
            // Trigger change event
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Add change event listener to update pagination when items per page changes
        selectElement.addEventListener('change', function() {
            debugLog('Select element changed to:', this.value);
            localStorage.setItem('pixifi_custom_page_length', this.value);
            // Reset to first page when changing items per page
            if (window.changePage) {
                window.changePage('1');
            }
            // Always re-add custom input after a short delay (in case DOM is replaced)
            setTimeout(() => {
                addCustomEntryOption();
            }, 120);
        });

        state.isModifying = false;
        state.isInitialized = true;
        debugLog('Finished addNewOptions');
    }

    // Add forced visibility styles for custom input/button
    function addCustomInputStyles() {
        if (document.getElementById('pixifiCustomInputStyles')) return;
        const style = document.createElement('style');
        style.id = 'pixifiCustomInputStyles';
        style.textContent = `
            #customItemsPerPageInput, #customItemsPerPageInput + button {
                display: inline-block !important;
                position: relative !important;
                z-index: 10000 !important;
                background: #222 !important;
                color: #fff !important;
                border: 1px solid #888 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function addCustomEntryOption() {
        debugLog('addCustomEntryOption called');
        const selectElement = document.getElementById('itemsPerPage_lead');
        if (!selectElement) {
            debugLog('Select element not found in addCustomEntryOption');
            return;
        }

        // Remove any existing custom input/button
        const oldInput = document.getElementById('customItemsPerPageInput');
        if (oldInput) {
            if (oldInput.nextSibling && oldInput.nextSibling.tagName === 'BUTTON') {
                oldInput.nextSibling.remove();
            }
            oldInput.remove();
        }

        debugLog('Creating custom input elements');
        // Create input box
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.placeholder = 'Custom';
        input.id = 'customItemsPerPageInput';
        input.style.marginLeft = '8px';
        input.style.width = '70px';
        input.style.fontSize = '12px';
        input.style.padding = '2px 4px';

        // Create button
        const button = document.createElement('button');
        button.textContent = 'Set';
        button.type = 'button';
        button.style.marginLeft = '4px';
        button.style.fontSize = '12px';
        button.style.padding = '2px 6px';

        button.addEventListener('click', function() {
            const value = input.value.trim();
            if (!value || isNaN(value) || parseInt(value) < 1) {
                input.focus();
                input.select();
                return;
            }
            debugLog('Setting custom value:', value);
            // Check if option already exists
            let option = selectElement.querySelector('option[value="' + value + '"]');
            if (!option) {
                option = document.createElement('option');
                option.value = value;
                option.text = value;
                selectElement.appendChild(option);
            }
            selectElement.value = value;
            // Save the custom page length
            localStorage.setItem('pixifi_custom_page_length', value);
            // Trigger change event
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Insert after the .cmf-skinned-select container
        const skinnedContainer = selectElement.closest('.cmf-skinned-select');
        if (skinnedContainer && skinnedContainer.parentNode) {
            skinnedContainer.parentNode.insertBefore(input, skinnedContainer.nextSibling);
            input.parentNode.insertBefore(button, input.nextSibling);
            debugLog('Custom input elements added after skinned select');
        } else {
            // fallback: insert after select
            selectElement.parentNode.insertBefore(input, selectElement.nextSibling);
            input.parentNode.insertBefore(button, input.nextSibling);
            debugLog('Custom input elements added after select (fallback)');
        }
        addCustomInputStyles();
    }

    // Override the changePage function to handle custom page sizes
    function overrideChangePage() {
        if (window.changePage) {
            debugLog('Overriding changePage function');
            const originalChangePage = window.changePage;
            window.changePage = function(page) {
                debugLog('changePage called with page:', page);
                const selectElement = document.getElementById('itemsPerPage_lead');
                if (selectElement) {
                    const itemsPerPage = parseInt(selectElement.value);
                    const offset = (parseInt(page) - 1) * itemsPerPage;
                    debugLog('Calculated offset:', offset, 'for itemsPer page:', itemsPerPage);
                    
                    // Update the hidden input for offset
                    const offsetInput = document.querySelector('input[name="offset"]');
                    if (offsetInput) {
                        offsetInput.value = offset;
                    }

                    // Update the hidden input for limit
                    const limitInput = document.querySelector('input[name="limit"]');
                    if (limitInput) {
                        limitInput.value = itemsPerPage;
                    }
                }
                // Reset initialization flag when changing pages
                state.isInitialized = false;
                return originalChangePage.apply(this, arguments);
            };
        }
    }

    // Debounced version of our main function
    const debouncedAddOptions = debounce(() => {
        debugLog('Debounced addOptions triggered');
        addNewOptions();
        overrideChangePage();
    }, 250);

    // Create a MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
        if (state.isModifying) {
            debugLog('Skipping observer due to isModifying flag');
            return;
        }

        const now = Date.now();
        if (now - state.lastProcessedMutation < state.mutationThrottle) {
            debugLog('Skipping observer due to throttle');
            return;
        }

        // Only process if we see changes to the select element or its parent
        const relevantMutation = mutations.some(mutation => {
            const target = mutation.target;
            const isRelevant = target.id === 'itemsPerPage_lead' || 
                             target.contains(document.getElementById('itemsPerPage_lead'));
            if (isRelevant) {
                debugLog('Relevant mutation detected:', {
                    target: target.id || target.className,
                    type: mutation.type,
                    addedNodes: mutation.addedNodes.length,
                    removedNodes: mutation.removedNodes.length
                });
            }
            return isRelevant;
        });

        if (relevantMutation) {
            state.lastProcessedMutation = now;
            debugLog('Triggering debounced addOptions due to relevant mutation');
            debouncedAddOptions();
        }
    });

    // Start observing with more specific configuration
    const config = {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    };

    // Observe the .cmf-skinned-select container or fallback to .dataTables_wrapper or body
    let targetNode = document.querySelector('.cmf-skinned-select');
    if (!targetNode) targetNode = document.querySelector('.dataTables_wrapper');
    if (!targetNode) targetNode = document.body;
    debugLog('Starting observer on node:', targetNode.id || targetNode.className);
    observer.observe(targetNode.parentNode || targetNode, config);

    // Robust observer setup
    function robustObserve() {
        const comboDiv = document.getElementById('leadsChooseComboDIV');
        const observerTarget = comboDiv || document.body;
        debugLog('Robust observer on node:', observerTarget.id || observerTarget.className || observerTarget.nodeName);
        const observer = new MutationObserver(() => {
            // Only add if select and skinned container exist
            const select = document.getElementById('itemsPerPage_lead');
            const skinned = document.querySelector('.cmf-skinned-select');
            if (select && skinned) {
                addCustomEntryOption();
            }
        });
        observer.observe(observerTarget, { childList: true, subtree: true });
    }

    // Remove old observer setup and use robustObserve
    robustObserve();

    // Also run on initial page load
    window.addEventListener('load', () => {
        debugLog('Page loaded, running initial setup');
        addNewOptions();
        overrideChangePage();
    });

    // Reset initialization when the leadsDIV is replaced
    const leadsObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.target.id === 'leadsDIV' && 
                mutation.type === 'childList' && 
                mutation.removedNodes.length > 0) {
                debugLog('Leads DIV replaced, resetting initialization');
                state.isInitialized = false;
                break;
            }
        }
    });

    const leadsDiv = document.getElementById('leadsDIV');
    if (leadsDiv) {
        leadsObserver.observe(leadsDiv, {
            childList: true,
            subtree: false
        });
    }
})(); 