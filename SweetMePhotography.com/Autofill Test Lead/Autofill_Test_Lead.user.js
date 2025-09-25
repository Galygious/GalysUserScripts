// ==UserScript==
// @name         Autofill Test Lead
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Autofill form fields with test lead data
// @author       You
// @match        *://sweetmephotography.com/inquiry-form/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function getCurrentDate() {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
        const day = String(today.getDate()).padStart(2, '0');
        const year = today.getFullYear();
        return `${month}/${day}/${year}`;
    }

    // Wait for the form to load (use MutationObserver for dynamic forms if needed)
    window.addEventListener('load', function() {
        try {
            // Fill the "Name" field
            document.querySelector('#input_1_1').value = "Test Lead";
            // Fill the "Email" field
            document.querySelector('#input_1_3').value = "test@sweetmephotography.com";
            // Fill the "Zip Code" field
            document.querySelector('#input_1_6').value = "12345";
            // Fill the "Baby's Due Date or Birth Date" field
            document.querySelector('#input_1_8').value = getCurrentDate(); // Format: MM/DD/YYYY
            // Fill the "Phone" field
            document.querySelector('#input_1_7').value = "1234567890";
            // Fill the "Comments" field
            document.querySelector('#input_1_9').value = "This is a test lead.";

            // Trigger input events for fields
            ['input_1_1', 'input_1_3', 'input_1_6', 'input_1_8', 'input_1_7', 'input_1_9'].forEach(function(id) {
                const field = document.querySelector(`#${id}`);
                if (field) {
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });

            console.log("Form autofilled successfully!");
        } catch (e) {
            console.error("Error autofilling form:", e);
        }
    });
})();
