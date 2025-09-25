// ==UserScript==
// @name         Assign Photographer Button
// @namespace    http://tampermonkey.net/
// @version      2025-02-03
// @description  Assign photographer to lead and update event details
// @author       You
// @match        https://www.pixifi.com/admin/leads/*/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixifi.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --------------------------------------------------------------------------
    // Global Variables / Setup
    // --------------------------------------------------------------------------
    const leadID = getObjectID();
    const clientID = "12295";  // Your client ID

    // --------------------------------------------------------------------------
    // Existing & Simplified Functions
    // --------------------------------------------------------------------------

    // Assign staff (photographer) to the lead.
    async function assignStaffToLead(clientID, leadID, staffID, roleID) {
        const bodyData = new URLSearchParams({
            clientID: clientID,
            leadID: leadID,
            staffID: staffID,
            roleID: roleID
        });

        try {
            const response = await fetch("https://www.pixifi.com/admin/fn/leads/assignStaffToLead/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            });
            if (response.ok) {
                console.log("Staff successfully assigned to lead.");
            } else {
                console.error("Failed to assign staff to lead:", response.statusText);
            }
        } catch (error) {
            console.error("Error attempting to assign staff to lead:", error);
        }
    }

    // Refresh the lead's staff listing.
    async function refreshLeadStaffListing(clientID, leadID) {
        const bodyData = new URLSearchParams({
            clientID: clientID,
            leadID: leadID
        });

        try {
            const response = await fetch("https://www.pixifi.com/admin/fn/leads/refreshLeadStaffListing/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            });

            if (response.ok) {
                const text = await response.text();
                const [status, html] = text.split("{|}");
                if (status === "SUCCESS") {
                    const staffListingElement = document.getElementById("staffListing");
                    if (staffListingElement) {
                        staffListingElement.innerHTML = html;
                        console.log("Lead staff listing successfully refreshed.");
                    } else {
                        console.error("Staff listing element not found.");
                    }
                } else {
                    console.error("Failed to refresh lead staff listing: unexpected response format.");
                }
            } else {
                console.error("Failed to refresh lead staff listing:", response.statusText);
            }
        } catch (error) {
            console.error("Error attempting to refresh lead staff listing:", error);
        }
    }

    // --------------------------------------------------------------------------
    // Update the Event Name by appending timestamp info, only if no similar timestamp exists.
    // --------------------------------------------------------------------------
    async function updateEventName(newAddition) {
        console.log("Attempting to update event name, checking for existing timestamp signature...");
        const eventNameElement = document.getElementById("af_leadCustomEventName");
        if (!eventNameElement) {
            console.error("Could not find the event name element.");
            return;
        }

        let currentEventName = eventNameElement.getAttribute("data-value") || eventNameElement.textContent.trim();
        if (currentEventName === "Empty") {
            currentEventName = "";
        }

        // Regex to find a timestamp like "MM/DD FUT AM/PM SH", "MM/DD BAD # AM/PM SH" or "MM/DD NO # AM/PM SH" anywhere in the string
        // Uses word boundaries (\b) to avoid matching parts of other words. Case-insensitive (i).
        const timestampRegex = /\b\d{2}\/\d{2} (?:FUT|BAD #|NO #) (?:AM|PM) SH\b/i;
        const match = currentEventName.match(timestampRegex);

        let finalEventName;
        let needsUpdate = false;

        if (match) {
            // If any timestamp pattern is found anywhere, do not update.
            console.log(`Existing timestamp signature found: "${match[0]}". No update needed for event name.`);
            needsUpdate = false;
            finalEventName = currentEventName; // Keep original name
        } else {
            // No timestamp pattern found, proceed with appending.
            console.log("No existing timestamp signature found. Appending new addition:", newAddition);
            finalEventName = (currentEventName + " " + newAddition).trim();
            needsUpdate = true;
        }

        if (!needsUpdate) {
            return; // Exit if no update is required
        }

        console.log("Final event name will be:", finalEventName);

        // Update the event name on the page via the editable plugin.
        $('#af_leadCustomEventName').data('editable').setValue(finalEventName);
        eventNameElement.textContent = finalEventName;

        // Prepare the data for the back end update.
        const bodyData = new URLSearchParams({
            name: "af_leadCustomEventName",
            value: finalEventName,
            pk: "",
            clientID: clientID,
            objectID: leadID
        });

        try {
            const response = await fetch("https://www.pixifi.com/admin/data/af/leaddata/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            });
            if (response.ok) {
                console.log("Event name successfully updated to:", finalEventName);
            } else {
                console.error("Failed to update event name:", response.statusText);
            }
        } catch (error) {
            console.error("Error attempting to update event name:", error);
        }
    }

    // --------------------------------------------------------------------------
    // Generic function to update any lead field on the server.
    // --------------------------------------------------------------------------
    async function updateLeadField(fieldName, value, arrayoption) {
        const keyName = `value[${arrayoption}]`;
        console.log(`Updating ${fieldName} to:`, value);
        const bodyData = new URLSearchParams({
            name: fieldName,
            [keyName]: value,
            pk: "",
            clientID: clientID,
            objectID: leadID
        });

        try {
            const response = await fetch("https://www.pixifi.com/admin/data/af/leaddata/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            });
            if (response.ok) {
                console.log(`${fieldName} successfully updated.`);
            } else {
                console.error(`Failed to update ${fieldName}:`, response.statusText);
            }
        } catch (error) {
            console.error(`Error updating ${fieldName}:`, error);
        }
    }

    // --------------------------------------------------------------------------
    // Helper: Format time for DOM display
    // Converts a 24-hour "HH:MM" string to "H:MM:AM/PM"
    // --------------------------------------------------------------------------
    function formatTimeForDOM(timeStr) {
        let [hourStr, minuteStr] = timeStr.split(":");
        let hour = parseInt(hourStr, 10);
        let period = hour >= 12 ? "PM" : "AM";
        if (hour === 0) {
            hour = 12;
        } else if (hour > 12) {
            hour = hour - 12;
        }
        return `${hour}:${minuteStr}:${period}`;
    }

    // --------------------------------------------------------------------------
    // Update local DOM elements for Event Date and Event Start Time
    // --------------------------------------------------------------------------
    function updateLocalEventDate(newEventDate) {
        console.log("Updating local event date to:", newEventDate);
        const eventDateElement = document.getElementById("af_leadEventDate");
        if (!eventDateElement) {
            console.error("Could not find the event date element.");
            return;
        }
        // Update via the editable plugin...
        $('#af_leadEventDate').data('editable').setValue(newEventDate);
        // ...and update the element's text content directly.
        eventDateElement.textContent = newEventDate;
    }

    function updateLocalEventTimeStart(newStartTime) {
        const formattedTime = formatTimeForDOM(newStartTime);
        console.log("Updating local event start time to:", formattedTime);
        const eventTimeElement = document.getElementById("af_leadEventTimeStart");
        if (!eventTimeElement) {
            console.error("Could not find the event start time element.");
            return;
        }
        // Update via the editable plugin...
        $('#af_leadEventTimeStart').data('editable').setValue(formattedTime);
        // ...and update the element's text content directly.
        eventTimeElement.textContent = formattedTime;
    }

    // --------------------------------------------------------------------------
    // Utility: Extract leadID from the URL.
    // --------------------------------------------------------------------------
    function getObjectID() {
        const match = window.location.href.match(/leads\/(\d+)/);
        return match ? match[1] : null;
    }

    // --------------------------------------------------------------------------
    // Remove a specific staff member from the lead using their staffLinkID.
    // Derived from the Remove All Staff script.
    // --------------------------------------------------------------------------
    async function removeSpecificStaff(clientID, leadID, staffLinkIDToRemove) {
        console.log(`Attempting to remove staff with staffLinkID: ${staffLinkIDToRemove}`);
        const url = "https://www.pixifi.com/admin/fn/leads/removeStaffFromLead/";
        const headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest"
        };
        const body = `clientID=${clientID}&leadID=${leadID}&staffLinkID=${staffLinkIDToRemove}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: body,
                credentials: "include"
            });

            if (response.ok) {
                console.log(`Successfully removed staff with staffLinkID: ${staffLinkIDToRemove}`);
                 // Optionally remove the element from the DOM immediately
                 const staffElementToRemove = document.querySelector(`#staff_${staffLinkIDToRemove}`);
                 if (staffElementToRemove) {
                    staffElementToRemove.remove();
                 }
                return true; // Indicate success
            } else {
                console.error(`Failed to remove staff with staffLinkID: ${staffLinkIDToRemove}. Status: ${response.statusText}`);
                return false; // Indicate failure
            }
        } catch (error) {
            console.error(`Error removing staff with staffLinkID: ${staffLinkIDToRemove}`, error);
            return false; // Indicate failure
        }
    }

    // --------------------------------------------------------------------------
    // Get details (staffId and staffLinkId) of the currently assigned photographer.
    // Returns { staffId: string, staffLinkId: string } or null if no photographer is assigned.
    // --------------------------------------------------------------------------
    function getAssignedPhotographerDetails() {
        const staffListingElement = document.getElementById("staffListing");
        if (!staffListingElement) {
            console.warn("#staffListing element not found. Cannot determine assigned photographer.");
            return null;
        }

        // Find all staff divs
        const staffDivs = staffListingElement.querySelectorAll("div[id^='staff_']");
        if (staffDivs.length === 0) {
            // Check for common placeholder text indicating no staff.
            const listingContent = staffListingElement.textContent.trim();
            const isEmpty = listingContent === "" || listingContent.includes("No staff assigned");
            if (isEmpty) {
                 console.log("Staff listing indicates no staff assigned.");
            } else {
                 console.warn("Staff listing not empty, but no divs found with id starting 'staff_'.");
            }
            return null;
        }

        // Iterate through staff divs to find the photographer
        for (const staffDiv of staffDivs) {
            // Check if this staff member is a photographer (look for the text "Photographer")
            // Making the check case-insensitive and ensuring it's likely part of a role description.
            const isPhotographer = /photographer/i.test(staffDiv.textContent);

            if (isPhotographer) {
                console.log("Found a staff member identified as a Photographer:", staffDiv.id);
                const staffLinkIdMatch = staffDiv.id.match(/^staff_(\d+)$/);
                const staffLinkId = staffLinkIdMatch ? staffLinkIdMatch[1] : null;

                if (!staffLinkId) {
                    console.warn("Found photographer div, but could not extract staffLinkId from ID:", staffDiv.id);
                    continue; // Skip this div and check the next one
                }

                // Now try to find the actual staff ID (e.g., 22012) for comparison
                let staffId = null;

                // Attempt 1: Look for data-staffid attribute within the div
                const staffIdElement = staffDiv.querySelector('[data-staffid]');
                if (staffIdElement && staffIdElement.dataset.staffid) {
                    staffId = staffIdElement.dataset.staffid;
                } else {
                    // Attempt 2: Look for a link like /admin/staff/ID/ within the div
                    const staffLink = staffDiv.querySelector('a[href*="/admin/staff/"]');
                    if (staffLink) {
                        const staffIdMatch = staffLink.href.match(/\/staff\/(\d+)/);
                        if (staffIdMatch && staffIdMatch[1]) {
                            staffId = staffIdMatch[1];
                        }
                    }
                }

                if (staffId) {
                    console.log(`Extracted photographer details: staffId (${staffId}), staffLinkId (${staffLinkId})`);
                    return { staffId, staffLinkId }; // Found the photographer and their details
                } else {
                    console.warn(`Found photographer div (staffLinkId ${staffLinkId}), but could not extract the comparable staffId. Check DOM structure inside #staff_${staffLinkId}. Skipping this entry.`);
                    // Continue checking other staff in case there's another entry for a photographer?
                    // Or should we assume failure here? Let's continue for now.
                    continue;
                }
            }
        }

        // If the loop finishes without finding a photographer
        console.log("No staff member identified as a 'Photographer' was found in the listing.");
        return null;
    }

    // --------------------------------------------------------------------------
    // Main Handler: Process Clipboard Data & Update the Lead
    // --------------------------------------------------------------------------
    async function handlePhotographerAssignment() {
        // Disable button to prevent double clicks during processing
        btn.disabled = true;
        let photographerAssignedOrRefreshed = false; // Flag to track if assignment/refresh happened
        try {
            // --- Read and parse clipboard data first ---
            const clipboardText = await navigator.clipboard.readText();
            console.log("Clipboard text:", clipboardText);
            const parts = clipboardText.split(",");
            if (parts.length < 5) {
                console.error("Clipboard data is incomplete. Expected format: FirstName,LastName,StartTime,EventDate,PhotographerID");
                alert("Clipboard error: Data is incomplete. Check format.");
                return; // Exit early
            }
            const [firstName, lastName, startTime, eventDate, clipboardPhotographerID] = parts.map(item => item.trim());
            console.log("Parsed clipboard data:", { firstName, lastName, startTime, eventDate, clipboardPhotographerID });

            // --- Check current assignment status ---
            const currentDetails = getAssignedPhotographerDetails();
            console.log("Current assigned photographer details:", currentDetails);

            // --- Construct the Event Name addition (always needed if we proceed) ---
            // Moved this up as it's needed before potential early exit if only details are updated
            const now = new Date();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const currentHour = now.getHours();
            const period = currentHour >= 12 ? "PM" : "AM";

            // Determine the appropriate phone label based on the bride's mobile phone number
            const phoneElement = document.getElementById("af_leadBrideMobilePhone");
            let phoneLabel = "FUT"; // default
            if (phoneElement) {
                const phoneRaw = phoneElement.getAttribute("data-value") || phoneElement.textContent || "";
                const digitsOnly = phoneRaw.replace(/\D/g, "");
                if (!digitsOnly) {
                    phoneLabel = "NO #";
                } else if (digitsOnly.startsWith("1")) {
                    phoneLabel = "BAD #";
                }
            } else {
                phoneLabel = "NO #"; // fallback if element not found
            }

            const eventNameAddition = `${mm}/${dd} ${phoneLabel} ${period} SH`;
            console.log("Event name addition/update value:", eventNameAddition);

            // --- Update Lead Event Details (Name, Date, Time) ---
            // These are updated regardless of assignment status, unless an error occurs later.
            await updateEventName(eventNameAddition);
            await updateLeadField('af_leadEventDate', eventDate, 'date');
            await updateLeadField('af_leadEventTimeStart', formatTimeForDOM(startTime), 'time');
            updateLocalEventDate(eventDate);
            updateLocalEventTimeStart(startTime);

            // --- Decide on Staff Assignment Action ---
            if (currentDetails === null) {
                // Case 1: No one assigned -> Assign new photographer
                console.log("No photographer currently assigned. Proceeding with assignment.");
                const PHOTOGRAPHER_ROLE_ID = "444"; // Ensure this is correct
                await assignStaffToLead(clientID, leadID, clipboardPhotographerID, PHOTOGRAPHER_ROLE_ID);
                photographerAssignedOrRefreshed = true; // Mark for refresh
            } else {
                // Case 2: Someone is assigned
                if (currentDetails.staffId === clipboardPhotographerID) {
                    // Case 2a: Same photographer -> Details already updated, do nothing else.
                    console.log("Clipboard photographer matches assigned photographer. Event details updated. No staff changes needed.");
                    // No assignment, no refresh needed
                } else {
                    // Case 2b: Different photographer -> Remove existing, then assign new.
                    console.log(`Different photographer assigned (ID: ${currentDetails.staffId}). Attempting removal...`);
                    const removed = await removeSpecificStaff(clientID, leadID, currentDetails.staffLinkId);

                    if (removed) {
                        console.log(`Successfully removed old photographer (staffLinkID: ${currentDetails.staffLinkId}). Assigning new photographer (ID: ${clipboardPhotographerID})...`);
                        const PHOTOGRAPHER_ROLE_ID = "444"; // Ensure this is correct
                        await assignStaffToLead(clientID, leadID, clipboardPhotographerID, PHOTOGRAPHER_ROLE_ID);
                        photographerAssignedOrRefreshed = true; // Mark for refresh
                    } else {
                        console.error(`Failed to remove existing photographer (staffLinkID: ${currentDetails.staffLinkId}). Aborting assignment of new photographer.`);
                        alert(`Error: Failed to remove the currently assigned photographer (Link ID: ${currentDetails.staffLinkId}). Cannot assign the new one. Please check manually.`);
                        return; // Exit early after removal failure
                    }
                }
            }

            // --- Refresh Staff Listing (only if assignment happened) ---
            if (photographerAssignedOrRefreshed) {
                console.log("Refreshing staff listing...");
                await refreshLeadStaffListing(clientID, leadID);
            } else {
                console.log("No staff assignment changes made, skipping refresh.");
            }

            console.log("Photographer assignment process finished.");

        } catch (error) {
            console.error("Error handling photographer assignment:", error);
            alert("An error occurred during the assignment process. Check console logs.");
        } finally {
            // Ensure the button is re-enabled whether success or failure
            btn.disabled = false;
        }
    }

    // --------------------------------------------------------------------------
    // UI: Add a Button to Trigger the Process
    // --------------------------------------------------------------------------
    const btn = document.createElement("button");
    btn.textContent = "Assign Photographer";
    btn.style.position = "fixed";
    btn.style.top = "10px";
    btn.style.right = "10px";
    btn.style.zIndex = "9999";
    btn.addEventListener("click", handlePhotographerAssignment);
    document.body.appendChild(btn);

})();
