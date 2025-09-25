// ==UserScript==
// @name         Staff Name Copier
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add Copy Name button to staff dropdown menus that copies photographer's first and last name from localStorage
// @author       You
// @match        https://www.pixifi.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to get photographer data from localStorage
    function getPhotographerData(staffElement) {
        // Extract the staff ID from the link
        const staffLink = staffElement.querySelector('a[href*="/admin/staff/"]');
        if (!staffLink) return null;

        const staffIdMatch = staffLink.href.match(/\/admin\/staff\/(\d+)\//);
        if (!staffIdMatch) return null;

        const staffId = staffIdMatch[1];
        console.log('Looking for photographer data for staff ID:', staffId);

        // Query all localStorage data where staffId matches, sorted by timestamp
        const matches = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('photographer_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data && data.staffId && data.staffId.toString() === staffId) {
                        matches.push({
                            data: data,
                            timestamp: data.timestamp || 0
                        });
                    }
                } catch (e) {
                    console.error('Error parsing photographer data:', e);
                }
            }
        }

        // Sort by timestamp (newest first) and pick the first one
        if (matches.length > 0) {
            matches.sort((a, b) => b.timestamp - a.timestamp);
            const bestMatch = matches[0].data;
            console.log('✅ Found photographer data:', bestMatch);
            return bestMatch;
        }

        console.log('❌ No photographer data found for staff ID:', staffId);
        return null;
    }

    // Function to copy text to clipboard
    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                console.log('Copied to clipboard:', text);
                // Show a brief notification
                showNotification(`Copied: ${text}`);
            }).catch(err => {
                console.error('Failed to copy:', err);
                fallbackCopyToClipboard(text);
            });
        } else {
            fallbackCopyToClipboard(text);
        }
    }

    // Fallback copy method for older browsers
    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            showNotification(`Copied: ${text}`);
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }

    // Function to show a brief notification
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #26C281;
            color: white;
            padding: 10px 15px;
            border-radius: 4px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }

    // Function to add copy name button to staff dropdown
    function addCopyNameButton(staffElement) {
        // Find the dropdown menu
        const dropdownMenu = staffElement.querySelector('.dropdown-menu');
        if (!dropdownMenu) return;

        // Get photographer data
        const photographerData = getPhotographerData(staffElement);
        
        if (!photographerData || !photographerData.firstName || !photographerData.lastName) {
            console.log('No photographer data found for staff element:', staffElement.id);
            return;
        }

        const fullName = `${photographerData.firstName} ${photographerData.lastName}`;
        
        // Create the copy name menu item
        const copyMenuItem = document.createElement('li');
        copyMenuItem.innerHTML = `
            <a href="javascript:void(0);" onclick="copyStaffName('${fullName.replace(/'/g, "\\'")}');">
                <i class="icon-copy"></i> Copy Name: ${fullName}
            </a>
        `;
        
        // Insert before the divider (if it exists) or at the end
        const divider = dropdownMenu.querySelector('.divider');
        if (divider) {
            dropdownMenu.insertBefore(copyMenuItem, divider);
        } else {
            dropdownMenu.appendChild(copyMenuItem);
        }
    }

    // Global function to copy staff name (called from onclick)
    window.copyStaffName = function(fullName) {
        copyToClipboard(fullName);
    };

    // Function to process all staff elements
    function processStaffElements() {
        const staffElements = document.querySelectorAll('#staffListing > div[id^="staff_"]');
        staffElements.forEach(staffElement => {
            // Check if we've already added the copy button
            if (staffElement.querySelector('.copy-name-added')) return;
            
            addCopyNameButton(staffElement);
            staffElement.classList.add('copy-name-added');
        });
    }

    // Initial processing
    processStaffElements();

    // Watch for changes to the staff listing (for dynamic content)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if it's a staff element
                        if (node.id && node.id.startsWith('staff_')) {
                            addCopyNameButton(node);
                            node.classList.add('copy-name-added');
                        }
                        // Check if it's a container that might have staff elements
                        const staffElements = node.querySelectorAll && node.querySelectorAll('#staffListing > div[id^="staff_"]');
                        if (staffElements) {
                            staffElements.forEach(staffElement => {
                                if (!staffElement.classList.contains('copy-name-added')) {
                                    addCopyNameButton(staffElement);
                                    staffElement.classList.add('copy-name-added');
                                }
                            });
                        }
                    }
                });
            }
        });
    });

    // Start observing
    const staffListing = document.getElementById('staffListing');
    if (staffListing) {
        observer.observe(staffListing, {
            childList: true,
            subtree: true
        });
    }

    // Also observe the entire document for page changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('Staff Name Copier script loaded');
})();
