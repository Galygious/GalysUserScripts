// File: tampermonkey/removeAllStaff.js

// ==UserScript==
// @name         Remove All Staff from Lead
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a "Remove All" button to remove all staff members from a lead, with a confirmation to prevent accidental removal.
// @match        https://www.pixifi.com/admin/leads/*
// @exclude      https://www.pixifi.com/admin/leads/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const clientID = "12295"; // Static client ID

    // Function to extract lead ID from the URL
    function getLeadIDFromURL() {
        const match = window.location.pathname.match(/\/leads\/(\d+)\//);
        return match ? match[1] : null;
    }

    // Function to remove all staff
    async function removeAllStaff(clientID, leadID) {
        const staffListing = document.querySelector("#staffListing");

        if (!staffListing) {
            console.error("Staff listing not found on the page.");
            return;
        }

        const staffDivs = staffListing.querySelectorAll("div[id^='staff_']");
        const staffIDs = Array.from(staffDivs).map(div => div.id.split('_')[1]);

        if (staffIDs.length === 0) {
            alert("No staff found to remove.");
            return;
        }

        const url = "https://www.pixifi.com/admin/fn/leads/removeStaffFromLead/";
        const headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest"
        };

        for (const staffLinkID of staffIDs) {
            const body = `clientID=${clientID}&leadID=${leadID}&staffLinkID=${staffLinkID}`;

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: headers,
                    body: body,
                    credentials: "include"
                });

                if (response.ok) {
                    console.log(`Successfully removed staff ID: ${staffLinkID}`);
                    document.querySelector(`#staff_${staffLinkID}`).remove();
                } else {
                    console.error(`Failed to remove staff ID: ${staffLinkID}`);
                }
            } catch (error) {
                console.error(`Error removing staff ID: ${staffLinkID}`, error);
            }
        }

        alert("All staff removal requests completed.");
    }

    // Add "Remove All" button
    function addRemoveAllButton() {
        const actionsDiv = document.querySelector("#staff .portlet-title .actions");

        if (!actionsDiv) {
            console.error("Actions div not found.");
            return;
        }

        const removeAllButton = document.createElement("a");
        removeAllButton.href = "javascript:;";
        removeAllButton.className = "btn btn-circle btn-danger btn-sm";
        removeAllButton.innerHTML = '<i class="fa fa-times font-red"></i> Remove All';

        removeAllButton.addEventListener("click", (event) => {
            // Prevent any default behavior that could cause page refresh
            event.preventDefault();

            // Confirmation prompt to avoid accidental removal
            const userConfirmed = confirm(
                "Are you sure you want to remove all staff from this lead? This process is irreversible."
            );
            if (!userConfirmed) {
                return;
            }

            const leadID = getLeadIDFromURL();
            if (!leadID) {
                alert("Lead ID not found in the URL.");
                return;
            }

            removeAllStaff(clientID, leadID);
        });

        actionsDiv.appendChild(removeAllButton);
    }

    // Initialize the script
    const leadID = getLeadIDFromURL();
    if (leadID) {
        addRemoveAllButton();
    } else {
        console.error("Lead ID not found. Script will not run.");
    }
})();
