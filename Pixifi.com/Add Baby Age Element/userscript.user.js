// ==UserScript==
// @name         Add Baby Age Element
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Calculate and display baby's age on the event date on Pixifi lead pages.
// @author       You
// @match        https://www.pixifi.com/admin/leads/*
// @exclude      https://www.pixifi.com/admin/leads
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to parse date strings (MM/DD/YYYY) into Date objects
    function parseDate(dateStr) {
        if (!dateStr || dateStr.toLowerCase() === 'empty') {
            console.error("Date string is invalid or empty:", dateStr);
            return null;
        }
        const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!parts) {
            console.error("Could not parse date string:", dateStr);
            return null;
        }
        // Note: parts[1] is month, parts[2] is day, parts[3] is year
        // JavaScript Date months are 0-indexed (0 = January)
        return new Date(parts[3], parts[1] - 1, parts[2]);
    }

    // Function to calculate age difference between two dates
    function calculateAge(birthDate, eventDate) {
        if (!(birthDate instanceof Date) || !(eventDate instanceof Date) || isNaN(birthDate) || isNaN(eventDate)) {
            return "Error: Invalid Dates";
        }

        if (eventDate < birthDate) {
            return "Error: Negative Age";
        }

        // Calculate total difference in days first for simplicity
        const msPerDay = 1000 * 60 * 60 * 24;
        let totalDays = Math.floor((eventDate.getTime() - birthDate.getTime()) / msPerDay);

        if (totalDays < 21) { // If less than 3 weeks (0-20 days)
             return `${totalDays} day${totalDays !== 1 ? 's' : ''}`;
        }

        // --- Calculate Years, Weeks, Days --- 

        let years = eventDate.getFullYear() - birthDate.getFullYear();
        let tempBirthDate = new Date(birthDate);
        tempBirthDate.setFullYear(birthDate.getFullYear() + years);

        // Adjust years if the anniversary hasn't occurred yet in the event year
        if (tempBirthDate > eventDate) {
            years--;
            tempBirthDate.setFullYear(birthDate.getFullYear() + years);
        }

        // Calculate the remaining days after accounting for full years
        let remainingMs = eventDate.getTime() - tempBirthDate.getTime();
        let remainingTotalDays = Math.floor(remainingMs / msPerDay);

        let weeks = Math.floor(remainingTotalDays / 7);
        let days = remainingTotalDays % 7;

        // --- Build the age string --- 
        let ageParts = [];
        if (years > 0) {
            ageParts.push(`${years} year${years > 1 ? 's' : ''}`);
        }
        if (weeks > 0) {
            ageParts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
        }
        if (days > 0) {
            ageParts.push(`${days} day${days > 1 ? 's' : ''}`);
        }
         // Should not happen based on initial totalDays check, but as a fallback:
        if (ageParts.length === 0 && totalDays === 0) {
             return "0 days";
        }

        return ageParts.join(' ');
    }

    // Function to create and inject the age element
    function displayBabyAge() {
        const eventDateElement = document.querySelector("#af_leadEventDate");
        const birthDateElement = document.querySelector("#questitem_8225 > div.rightTitle"); // Assuming this is the birth date
        const targetContainer = document.querySelector("#leadEvents > div.portlet-body");

        if (!eventDateElement || !birthDateElement || !targetContainer) {
            console.error("Required elements not found. Waiting...");
            // Optional: Implement a more robust waiting mechanism if elements load asynchronously
            setTimeout(displayBabyAge, 500); // Retry after 500ms
            return;
        }

        const eventDateStr = eventDateElement.textContent.trim();
        const birthDateStr = birthDateElement.textContent.trim();

        const eventDate = parseDate(eventDateStr);
        const birthDate = parseDate(birthDateStr);

        let ageDisplay = "Error: Could not calculate"; // Default error
        if (eventDate && birthDate) {
            ageDisplay = calculateAge(birthDate, eventDate);
        } else if (!eventDate) {
             ageDisplay = "Error: Invalid Event Date";
        } else if (!birthDate) {
             ageDisplay = "Error: Invalid Birth Date";
        }

        // Check if our element already exists to prevent duplicates on redraws
        if (document.getElementById("eventDateAgeElement")) {
            // Update existing element
             document.querySelector("#eventDateAgeElement .rightTitle span").textContent = ageDisplay;
             console.log("Updated existing Event Date Age element.");
        } else {
            // Create the new element
            const ageDiv = document.createElement('div');
            ageDiv.className = 'normalThinRowStyle';
            ageDiv.id = 'eventDateAgeElement'; // Add an ID for easy updating/checking

            ageDiv.innerHTML = `
                <div class="leftTitle">Event Date Age:</div>
                <div class="rightTitle"><span>${ageDisplay}</span></div>
                <div class="clearSmall"></div><br style="clear: both;">
            `;

            // Find the last existing normalThinRowStyle div
            const existingRows = targetContainer.querySelectorAll('.normalThinRowStyle');
            if (existingRows.length > 0) {
                const lastRow = existingRows[existingRows.length - 1];
                lastRow.insertAdjacentElement('afterend', ageDiv);
                console.log("Added Event Date Age element after the last existing row.");
            } else {
                // Fallback: Append to the container if no existing rows are found
                targetContainer.appendChild(ageDiv);
                console.log("Added Event Date Age element (appended as no existing rows found).");
            }
        }

        // --- Calculate and Display Event Notice --- 
        let noticeDisplay = "Error: Invalid Event Date";
        if (eventDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set today to midnight

            const eventDateMidnight = new Date(eventDate);
            eventDateMidnight.setHours(0, 0, 0, 0); // Set event date to midnight

            const msPerDay = 1000 * 60 * 60 * 24;
            const dayDiff = Math.floor((eventDateMidnight.getTime() - today.getTime()) / msPerDay);

            if (dayDiff < 0) {
                noticeDisplay = "Past";
            } else if (dayDiff === 0) {
                noticeDisplay = "Today";
            } else {
                noticeDisplay = `${dayDiff} day${dayDiff !== 1 ? 's' : ''}`;
            }
        }

        // Check if notice element exists
        let noticeElement = document.getElementById("eventNoticeElement");
        if (noticeElement) {
            // Update existing notice element
            noticeElement.querySelector(".rightTitle span").textContent = noticeDisplay;
            console.log("Updated existing Event Notice element.");
        } else {
            // Create the new notice element
            noticeElement = document.createElement('div');
            noticeElement.className = 'normalThinRowStyle';
            noticeElement.id = 'eventNoticeElement';
            noticeElement.innerHTML = `
                <div class="leftTitle">Event Notice:</div>
                <div class="rightTitle"><span>${noticeDisplay}</span></div>
                <div class="clearSmall"></div><br style="clear: both;">
            `;

            // Insert the notice element after the age element
            const ageElement = document.getElementById("eventDateAgeElement");
            if (ageElement && ageElement.parentNode) {
                 ageElement.insertAdjacentElement('afterend', noticeElement);
                 console.log("Added Event Notice element.");
            } else {
                // Fallback: if age element wasn't found (shouldn't happen if code runs linearly)
                // Try inserting after last row or appending
                 const existingRows = targetContainer.querySelectorAll('.normalThinRowStyle');
                 if (existingRows.length > 0) {
                    const lastRow = existingRows[existingRows.length - 1];
                    lastRow.insertAdjacentElement('afterend', noticeElement);
                    console.log("Added Event Notice element after last row (fallback).");
                 } else {
                    targetContainer.appendChild(noticeElement);
                    console.log("Added Event Notice element (appended as fallback).");
                 }
            }
        }

    }

    // Run the script after the page is likely loaded
    // Using MutationObserver might be more robust if the target elements load very late
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', displayBabyAge);
    } else {
        // DOMContentLoaded has already fired
        // Use a small timeout to ensure dependent elements from other scripts might be ready
        setTimeout(displayBabyAge, 500);
    }

    // --- Optional: Re-run on changes if needed ---
    // If the event date or birth date can change dynamically (e.g., via AJAX),
    // you might need a MutationObserver to watch for changes and re-run displayBabyAge.
    // Example: Observe changes in the event date element's text content.
    const eventDateElementForObserver = document.querySelector("#af_leadEventDate");
    if (eventDateElementForObserver) {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    console.log("Event date changed, recalculating age...");
                    setTimeout(displayBabyAge, 100); // Add a small delay
                }
            });
        });
        observer.observe(eventDateElementForObserver, { childList: true, characterData: true, subtree: true });
        console.log("Observer attached to event date element.");
    }


})();
