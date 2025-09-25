// ==UserScript==
// @name         Older Baby Button
// @namespace    http://tampermonkey.net/
// @version      2025-02-25
// @description  Create a button that copies formatted lead info to clipboard if age is at least 12 weeks.
// @author       You
// @match        https://www.pixifi.com/admin/leads/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixifi.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Helper function to calculate age in weeks and days from a given birth date.
    function calculateAge(birthDate) {
        const currentDate = new Date();
        const diffMs = currentDate - birthDate; // Difference in milliseconds
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const weeks = Math.floor(diffDays / 7);
        const days = diffDays % 7;
        return { diffDays, weeks, days };
    }

    function init() {
        // Retrieve the birthdate from #questitem_8225 > div.rightTitle (as text content, expected format: MM/DD/YYYY)
        const birthEl = document.querySelector('#questitem_8225 > div.rightTitle');
        if (!birthEl || !birthEl.textContent.trim()) {
            console.error("Birthdate element or text not found.");
            return;
        }
        const birthdateStr = birthEl.textContent.trim();
        const parts = birthdateStr.split('/');
        if (parts.length !== 3) {
            console.error("Birthdate format is not MM/DD/YYYY");
            return;
        }
        const month = parseInt(parts[0], 10) - 1; // JavaScript months are zero-indexed
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        const birthDate = new Date(year, month, day);

        // Calculate age
        const { diffDays, weeks, days } = calculateAge(birthDate);

        // Only show the button if the age is 12 weeks (84 days) or greater.
        //if (diffDays < 84) {
        //    return;
        //}

        // Retrieve the zipcode from #leadZip
        const zipEl = document.querySelector('#leadZip');
        const zipcode = zipEl ? zipEl.value : "";

        // Get the current URL (the link)
        const currentURL = window.location.href;

        // Build the desired string
        const outputString = `@Jennifer ${currentURL} OB - ${zipcode} - ${birthdateStr} - ${weeks} weeks and ${days} days`;

        // Find the container where the button should be placed.
        const container = document.querySelector('#questitem_8228 > div.rightTitle');
        if (!container) {
            console.error("Target container not found.");
            return;
        }

        // Create the button and set type="button" to prevent form submission.
        const btn = document.createElement('button');
        btn.type = "button";
        btn.textContent = "Copy Info";
        btn.style.marginLeft = "10px";

        // Append the button to the container
        container.appendChild(btn);

        // When the button is clicked, copy the output string to the clipboard.
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            navigator.clipboard.writeText(outputString).then(() => {
                console.log("Copied to clipboard: " + outputString);
                alert("Copied info to clipboard!");
            }).catch(err => {
                console.error("Error copying to clipboard: ", err);
            });
        });
    }

    // Run the script when the window loads.
    window.addEventListener('load', init);
})();
