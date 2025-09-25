// File: tampermonkey-scripts/convertLeadButton.js

// ==UserScript==
// @name         Convert Lead Button
// @namespace    https://www.pixifi.com/
// @version      1.2
// @description  Adds a button to convert leads and redirect to the event page, with a confirmation prompt to prevent accidental conversions
// @match        https://www.pixifi.com/admin/leads/*
// @exclude      https://www.pixifi.com/admin/leads/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Helper function to get the lead ID from the URL
    function getLeadID() {
        const urlMatch = window.location.pathname.match(/\/leads\/(\d+)\//);
        return urlMatch ? urlMatch[1] : null;
    }

    // Add a button to the page inside the specified list
    function addButton() {
        const leadID = getLeadID();
        if (!leadID) {
            console.error('Lead ID not found!');
            return;
        }

        const ulElement = document.querySelector('ul.ui-tabs-nav.ui-helper-reset.ui-helper-clearfix.ui-widget-header.ui-corner-all');
        if (!ulElement) {
            console.error('Target list element not found!');
            return;
        }

        const listItem = document.createElement('li');
        const button = document.createElement('button');

        // Ensures button doesn't act as a default form submission button
        button.setAttribute('type', 'button');
        button.innerText = 'Convert Lead';
        button.style.padding = '5px 10px';
        button.style.backgroundColor = '#007bff';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';

        button.addEventListener('click', async (event) => {
            // Prevent any default action that might cause a page refresh
            event.preventDefault();

            // Confirmation to avoid accidental lead conversion
            const userConfirmed = confirm(
                'Are you sure you want to convert this lead? This process is irreversible.'
            );
            if (!userConfirmed) {
                return;
            }

            try {
                const response = await fetch("https://www.pixifi.com/admin/fn/leads/convertLead/", {
                    headers: {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9",
                        "cache-control": "no-cache",
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "pragma": "no-cache",
                        "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "sec-fetch-dest": "empty",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-site": "same-origin",
                        "x-requested-with": "XMLHttpRequest"
                    },
                    referrer: `https://www.pixifi.com/admin/leads/${leadID}/`,
                    referrerPolicy: "strict-origin-when-cross-origin",
                    body: `clientID=12295&leadID=${leadID}&workID=`,
                    method: "POST",
                    mode: "cors",
                    credentials: "include"
                });

                const text = await response.text();
                if (text.startsWith('SUCCESS{|}')) {
                    const eventID = text.split('{|}')[1];
                    if (eventID) {
                        window.location.href = `https://www.pixifi.com/admin/events/${eventID}`;
                    } else {
                        alert('Event ID not found in response.');
                    }
                } else {
                    alert('Failed to convert lead. Response: ' + text);
                }
            } catch (error) {
                alert('An error occurred: ' + error.message);
            }
        });

        listItem.appendChild(button);
        ulElement.appendChild(listItem);
    }

    // Initialize the script
    addButton();
})();
