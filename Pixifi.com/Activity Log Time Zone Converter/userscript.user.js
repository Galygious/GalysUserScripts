// ==UserScript==
// @name         Activity Log Time Zone Converter
// @namespace    http://your.namespace.com
// @version      0.1
// @description  Convert Activity Log times from Central Time to local time zone
// @match        https://www.pixifi.com/leads/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to convert Central Time to user's local time
    function convertTimeToLocal(element) {
        const timeElements = document.getElementsByClassName('activityTime');

        for (let timeEl of timeElements) {
            // Get the parent activity log entry
            const logEntry = timeEl.closest('.floatGrid');
            if (!logEntry) continue;

            // Get the date from activityDate (might be hidden)
            const dateEl = logEntry.querySelector('.activityDate');
            if (!dateEl) continue;

            const dateStr = dateEl.textContent.trim(); // e.g., "02/19/2025"
            const timeStr = timeEl.textContent.trim(); // e.g., "04:41PM"

            // Parse the date and time
            const [month, day, year] = dateStr.split('/');
            let [time, period] = timeStr.match(/(\d+:\d+)([AP]M)/i).slice(1);
            let [hours, minutes] = time.split(':');

            // Convert 12-hour to 24-hour format
            hours = parseInt(hours);
            if (period.toUpperCase() === 'PM' && hours !== 12) {
                hours += 12;
            } else if (period.toUpperCase() === 'AM' && hours === 12) {
                hours = 0;
            }

            // Create Date object assuming Central Time (CST/CDT)
            // We'll use America/Chicago as the source timezone
            const centralDate = new Date(`${year}-${month}-${day} ${hours}:${minutes}:00 -07:00`);

            // Convert to local time
            const localDate = new Date(centralDate.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));

            // Format the time back to 12-hour format
            const localHours = localDate.getHours();
            const localMinutes = localDate.getMinutes();
            const newPeriod = localHours >= 12 ? 'PM' : 'AM';
            const displayHours = localHours % 12 || 12;
            const formattedTime = `${displayHours}:${String(localMinutes).padStart(2, '0')}${newPeriod}`;

            // Update the time element
            timeEl.textContent = formattedTime;
        }
    }

    // Run the conversion when the page loads
    window.addEventListener('load', convertTimeToLocal);

    // Also run it immediately in case the content is already loaded
    convertTimeToLocal();
})();