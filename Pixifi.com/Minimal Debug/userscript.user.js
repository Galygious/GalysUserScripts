// ==UserScript==
// @name         Pixifi - Minimal Debug
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Checks if Tampermonkey is running and if it can find the "Add" button
// @match        https://www.pixifi.com/admin/leads/*
// @grant        none
// @require      file://D:/Galydev/TamperMonkeyScripts/GME_Tools/GME_Tools.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Immediately log so we know the script loaded at all
    console.log('[TM-DEBUG] Script loaded and running.');

    // We wait for the Add button that has the inline onclick
    const addButtonSelector = 'a[onclick^="getAddObjectCategoryForm(\'lead\',"]';

    // Log that we are waiting for the Add button to appear
    console.log('[TM-DEBUG] Waiting for Add button:', addButtonSelector);

    GME_Tools.waitForElement(addButtonSelector)
        .then((addButton) => {
            console.log('[TM-DEBUG] Found Add button:', addButton);

            // Remove any inline onclick
            addButton.removeAttribute('onclick');
            console.log('[TM-DEBUG] Removed original onclick.');

            // Add a new click handler that just logs to console
            addButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('[TM-DEBUG] Add button clicked!');
            });
        })
        .catch(error => {
            console.error('[TM-DEBUG]', error);
        });
})();
