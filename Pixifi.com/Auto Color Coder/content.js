// File: content.js

// =================================================================================
// Event Listeners
// =================================================================================
async function autoAssociateCategory(zipResponse) {
    // Trim the category text and ignore if it prompts for manual input.
    const categoryText = zipResponse.category.trim();
    if (categoryText === "Category not set. Please enter:") {
      console.log("No valid category received – skipping auto-association.");
      return;
    }
  
    // Mapping from category text (uppercased) to category ID based on your select options.
    const categoryMapping = {
      "NOT A CURRENT MARKET": "94979",
      "BAD ZIP CODE": "108748",
      "ATLANTA": "83301",
      "AUSTIN": "80461",
      "BOSTON": "85648",
      "BUFFALO": "121090",
      "CHARLOTTE": "90951",
      "CHICAGO": "80458",
      "COLORADO SPRINGS": "130273",
      "CONNECTICUT": "112270",
      "DALLAS": "80459",
      "DC": "83245",
      "DELAWARE": "90990",
      "DENVER": "80463",
      "DETROIT": "111595",
      "HOUSTON": "80462",
      "JACKSONVILLE": "110124",
      "KANSAS CITY": "80457",
      "LOS ANGELES": "80453",
      "LA SANTA BARBARA": "107581",
      "LOUISVILLE": "108711",
      "MARYLAND": "110239",
      "MANHATTAN": "110038",
      "MINNEAPOLIS": "100800",
      "NEW HAMPSHIRE": "92767",
      "NEW JERSEY - PA": "82434",
      "NEW JERSEY - NY": "117073",
      "NEW YORK": "109501",
      "NEW YORK - BROOKLYN/QUEENS": "118252",
      "NEW YORK - LONG ISLAND": "118251",
      "NEW YORK - WHITE PLAINS": "118253",
      "NEW YORK - BRONX/YONKERS": "118254",
      "ORANGE COUNTY": "80452",
      "ORLANDO": "82767",
      "PHILADELPHIA": "80464",
      "PHOENIX": "89966",
      "PORTLAND": "80466",
      "RALEIGH": "90882",
      "RHODE ISLAND": "90989",
      "RICHMOND": "107890",
      "RIVERSIDE": "107580",
      "SACRAMENTO": "83302",
      "SAN ANTONIO": "80460",
      "SAN DIEGO": "80451",
      "SAN FRANCISCO": "80454",
      "SF EAST BAY": "80455",
      "SF-SAN JOSE": "80456",
      "SEATTLE": "80465",
      "VEGAS": "113490",
      "VIRGINIA": "110237",
      "HRVA PENINSULA (WILLIAMSBURG/NEWPORT NEWS/HAMPTON) - EXPANSION": "90952",
      "HRVA SOUTHSIDE (NORFOLK/VA BEACH/CHESAPEAKE) - EXPANSION": "90953",
      "SERVER RESEND": "89887",
      "NAS75OFF": "89728",
      "DES MOINES (REFERRED TO SARAH)": "81486",
      "COMING SOON": "109353",
      "NEVER BOOK AGAIN": "116388",
      "OFFER EMAIL NOT OPENED": "111812",
      "#PHONE#": "104814"
    };
  
    // Convert the received category text to uppercase to match our mapping keys.
    const mappedCategoryID = categoryMapping[categoryText.toUpperCase()];
    if (!mappedCategoryID) {
      console.error("No matching category ID found for:", categoryText);
      return;
    }
    console.log(`Mapping "${categoryText}" to category ID ${mappedCategoryID}`);
  
    // Extract the lead ID from the URL (assumes a URL format like /admin/leads/12345/).
    const leadID = (function () {
      const parts = window.location.pathname.split('/');
      const leadIndex = parts.indexOf('leads');
      return (leadIndex !== -1 && parts[leadIndex + 1]) ? parts[leadIndex + 1] : null;
    })();
    if (!leadID) {
      console.error("Could not determine lead ID from the URL.");
      return;
    }
  
    // Use the hard-coded client ID from your userscript.
    const clientID = 12295;
  
    try {
      // 1. Associate the category with the lead.
      const associateRes = await fetch('https://www.pixifi.com/admin/fn/misc/associateObjectCategoryToItem/', {
        method: 'POST',
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest"
        },
        body: `clientID=${clientID}&categoryID=${encodeURIComponent(mappedCategoryID)}&objectType=lead&objectID=${encodeURIComponent(leadID)}`
      });
      const associateText = await associateRes.text();
      if (associateText.startsWith("ERROR{|}")) {
        const errorMessage = associateText.slice("ERROR{|}".length);
        throw new Error("Association failed: " + errorMessage);
      }
      console.log("Category associated successfully:", associateText);
  
      // 2. Refresh the category listing for the lead.
      const refreshRes = await fetch('https://www.pixifi.com/admin/fn/misc/refreshObjectCategoriesListing/', {
        method: 'POST',
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest"
        },
        body: `clientID=${clientID}&objectType=lead&objectID=${encodeURIComponent(leadID)}`
      });
      let refreshedHTML = await refreshRes.text();
      if (refreshedHTML.startsWith("SUCCESS{|}")) {
        refreshedHTML = refreshedHTML.slice("SUCCESS{|}".length);
        console.log("Stripped SUCCESS{|} from refreshed HTML.");
      }
  
      // 3. Update the category listing in the DOM if the element exists.
      const listingEl = document.getElementById(`categoryListing_${leadID}`);
      if (listingEl) {
        listingEl.innerHTML = refreshedHTML;
        console.log("Category listing refreshed on the page.");
      } else {
        console.warn(`Could not find element #categoryListing_${leadID} to update.`);
      }
    } catch (error) {
      console.error("Error during auto-associating category:", error);
    }
  }

// Listen for window messages from Tampermonkey script
window.addEventListener("message", (event) => {
    // Ensure the message is from the same origin
    if (event.origin !== window.location.origin) return;
  
    const { action } = event.data || {};
    if (action === "trigger-color-coding") {
        console.log("Received trigger-color-coding from webpage");
        
        // Forward the message to the background script
        chrome.runtime.sendMessage({ action: "trigger-color-coding" }, (response) => {
            console.log("Background script response:", response);
        });
    }
});

// Listen for messages from the extension (background script)
chrome.runtime.onMessage.addListener(
    async function(request, sender, sendResponse) {
        console.log("Message received:", request);
        
        if (request.action === "runColorCode") {
            try {
                await ColorCode();
                sendResponse({ status: "Completed" });
            } catch (error) {
                console.error("Error in runColorCode:", error);
                sendResponse({ status: "Error", message: error.message });
            }
        } else if (request.action === "runPaymentToBookingsPrep") {
            console.log("Starting Payment to Bookings Prep process.");
            try {
                const generatedString = await executeAllSteps();
                console.log("Process completed.");
                // Try to copy to clipboard
                try {
                    await navigator.clipboard.writeText(generatedString);
                    showSMPToast("Booking string copied to clipboard!");
                } catch (err) {
                    showSMPToast("Failed to copy booking string: " + err);
                }
                sendResponse({ status: "Completed", generatedString });
            } catch (error) {
                console.error("Error in runPaymentToBookingsPrep:", error);
                sendResponse({ status: "Error", message: error.message });
            }
        } else if (request.action === "runOpenLeads") {
            try {
                await openAllLeads();
                console.log("Opening leads...");
                sendResponse({ status: "Completed" });
            } catch (error) {
                console.error("Error in openLeads:", error);
                sendResponse({ status: "Error", message: error.message });
            }
        } else if (request.action === "processZipCode") {
            try {
                const result = await processZipCode();
                sendResponse({ status: "Completed", result });
            } catch (error) {
                console.error("Error in processZipCode:", error);
                sendResponse({ status: "Error", message: error.message });
            }
        } else if (request.action === "findAvailableDate") {
            try {
                const earliestDate = await findEarliestAvailableDate(request.startDate);
                sendResponse({ earliestDate });
            } catch (error) {
                console.error("Error in findAvailableDate:", error);
                sendResponse({ status: "Error", message: error.message });
            }
        } else if (request.action === 'toggleAutoOpenLeads') {
            chrome.storage.sync.set({ autoOpenLeadsEnabled: request.enabled }, function() {
                if (request.enabled) {
                    startAutoOpenLeadsPolling();
                    console.log('[Auto-Open New Leads] Enabled and started polling');
                } else {
                    stopAutoOpenLeadsPolling();
                    console.log('[Auto-Open New Leads] Disabled and stopped polling');
                }
            });
        } else if (request.action === 'getStaleLeadData') {
            // Collect data from the SAME storage that the main userscript uses
            const staleLeads = [];
            const now = Date.now();

            try {
                // Check for stale leads using the same patterns as the main userscript
                // The main userscript uses gmSet/gmGet (Tampermonkey storage), not localStorage
                // But we can check localStorage for the same keys since they're synced

                console.log(`[Stale Detection] 📊 Content script checking for stale leads...`);

                // Get all localStorage keys that match our patterns
                const allKeys = Object.keys(localStorage);
                const progressKeys = allKeys.filter(key => key.startsWith('acc_progress_'));
                const activeKeys = allKeys.filter(key => key.startsWith('acc_active_'));

                console.log(`[Stale Detection] 📁 Found ${progressKeys.length} progress entries, ${activeKeys.length} active entries`);

                // Check progress entries for stale processing (same logic as main userscript)
                for (const progressKey of progressKeys) {
                    const leadId = progressKey.replace('acc_progress_', '');
                    const progressData = localStorage.getItem(progressKey);

                    if (progressData) {
                        try {
                            const progress = JSON.parse(progressData);
                            const lastUpdate = Math.max(
                                ...Object.values(progress.steps).map(step => step.timestamp),
                                progress.startTime
                            );

                            const timeSinceUpdate = now - lastUpdate;
                            const staleThreshold = 30 * 1000; // 30 seconds (for testing) (same as main userscript)

                            if (timeSinceUpdate > staleThreshold && !progress.completed) {
                                staleLeads.push({
                                    leadId: leadId,
                                    type: 'progress_stale',
                                    lastUpdate: lastUpdate,
                                    timeStale: timeSinceUpdate,
                                    url: `${window.location.origin}/admin/leads/${leadId}/`
                                });
                                console.log(`[Stale Detection] 🎯 Found stale progress: ${leadId} (${Math.round(timeSinceUpdate/1000/60)}min old)`);
                            }
                        } catch (e) {
                            console.debug('[Stale Detection] Error parsing progress data for lead', leadId, e);
                        }
                    }
                }

                // Check active entries for missing heartbeats (same logic as main userscript)
                for (const activeKey of activeKeys) {
                    const leadId = activeKey.replace('acc_active_', '');
                    const activeData = localStorage.getItem(activeKey);

                    if (activeData) {
                        try {
                            const active = JSON.parse(activeData);
                            const timeSinceHeartbeat = now - active.lastHeartbeat;
                            const staleThreshold = 30 * 1000; // 30 seconds (for testing) (same as main userscript)

                            if (timeSinceHeartbeat > staleThreshold) {
                                staleLeads.push({
                                    leadId: leadId,
                                    type: 'heartbeat_stale',
                                    url: active.url,
                                    lastHeartbeat: active.lastHeartbeat,
                                    timeStale: timeSinceHeartbeat
                                });
                                console.log(`[Stale Detection] 💓 Found stale heartbeat: ${leadId} (${Math.round(timeSinceHeartbeat/1000/60)}min old)`);
                            }
                        } catch (e) {
                            console.debug('[Stale Detection] Error parsing active data for lead', leadId, e);
                        }
                    }
                }

                // DO NOT check completed leads - they're not stale!
                // Only check for truly stale leads: incomplete progress or missing heartbeats

                console.log(`[Stale Detection] ✅ Found ${staleLeads.length} truly stale leads`);
                if (staleLeads.length > 0) {
                    console.log(`[Stale Detection] 📋 Stale leads:`, staleLeads.map(lead => `${lead.leadId} (${lead.type})`));
                }

                sendResponse({ staleLeads: staleLeads });
            } catch (error) {
                console.error('[Stale Detection] Error collecting stale lead data:', error);
                sendResponse({ staleLeads: [] });
            }

            return true; // Required for async sendResponse
        }

        return true; // Keeps the message channel open for async sendResponse
    }
);

/**
 * Show a non-blocking toast/snackbar message at the bottom of the page.
 * @param {string} message
 */
function showSMPToast(message) {
    let toast = document.getElementById("smp-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "smp-toast";
        toast.style.position = "fixed";
        toast.style.left = "50%";
        toast.style.bottom = "30px";
        toast.style.transform = "translateX(-50%)";
        toast.style.background = "#323232";
        toast.style.color = "#fff";
        toast.style.padding = "12px 24px";
        toast.style.borderRadius = "4px";
        toast.style.fontSize = "16px";
        toast.style.zIndex = "9999";
        toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => {
        toast.style.opacity = "0";
    }, 2000);
}

// =================================================================================
// Global Variables
// =================================================================================

let hasCityAndState = false;
let autoOpenLeadsIntervalId = null;
const AUTO_OPEN_LEADS_INTERVAL_SECONDS = 30;
let openedLeadIdsThisSession = new Set();
let leadQueue = [];
let isProcessingQueue = false;

// =============================================================================
// Stale Detection in Content Script (runs every 5s with single-owner lock)
// =============================================================================

const STALE_CHECK_INTERVAL_MS = 5000;
const STALE_OWNER_KEY = 'staleDetectionOwner';
const STALE_OWNER_TIMEOUT_MS = STALE_CHECK_INTERVAL_MS * 4; // 4 intervals
let staleDetectionIntervalId = null;
let isStaleOwner = false;
const staleLeadLastOpenedAtMs = {}; // leadId -> timestamp
const STALE_REOPEN_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

function updateStaleOwnerHeartbeat() {
    if (isStaleOwner) {
        chrome.storage.local.set({ [STALE_OWNER_KEY]: { id: myAutoOpenTabId, ts: Date.now() } });
    }
}

function claimStaleOwnership(callback) {
    if (window.location.pathname !== '/admin/leads/') {
        callback(false);
        return;
    }
    chrome.storage.local.get([STALE_OWNER_KEY], data => {
        const ownerData = data[STALE_OWNER_KEY];
        const now = Date.now();
        if (!ownerData || !ownerData.id || (now - ownerData.ts) > STALE_OWNER_TIMEOUT_MS) {
            chrome.storage.local.set({ [STALE_OWNER_KEY]: { id: myAutoOpenTabId, ts: now } }, () => {
                isStaleOwner = true;
                console.debug('[Stale Detection] Ownership claimed by this tab:', myAutoOpenTabId);
                callback(true);
            });
        } else if (ownerData.id === myAutoOpenTabId) {
            isStaleOwner = true;
            callback(true);
        } else {
            isStaleOwner = false;
            callback(false);
        }
    });
}

function releaseStaleOwnership() {
    if (!isStaleOwner) return;
    chrome.storage.local.get([STALE_OWNER_KEY], data => {
        if (data[STALE_OWNER_KEY] && data[STALE_OWNER_KEY].id === myAutoOpenTabId) {
            chrome.storage.local.remove(STALE_OWNER_KEY, () => {
                console.debug('[Stale Detection] Ownership released by this tab');
            });
        }
    });
}

function findStaleLeadsFromLocal() {
    const staleLeads = [];
    const now = Date.now();

    try {
        const allKeys = Object.keys(localStorage);
        const progressKeys = allKeys.filter(key => key.startsWith('acc_progress_'));
        const activeKeys = allKeys.filter(key => key.startsWith('acc_active_'));

        // progress-based stale (incomplete and old)
        for (const progressKey of progressKeys) {
            const leadId = progressKey.replace('acc_progress_', '');
            const progressData = localStorage.getItem(progressKey);
            if (!progressData) continue;
            try {
                const progress = JSON.parse(progressData);
                const lastUpdate = Math.max(
                    ...Object.values(progress.steps || {}).map(step => step.timestamp || 0),
                    progress.startTime || 0
                );
                const timeSinceUpdate = now - lastUpdate;
                const staleThreshold = 5 * 60 * 1000; // 5 minutes
                if (timeSinceUpdate > staleThreshold && !progress.completed) {
                    staleLeads.push({
                        leadId,
                        type: 'progress_stale',
                        lastUpdate,
                        timeStale: timeSinceUpdate,
                        url: `${window.location.origin}/admin/leads/${leadId}/`
                    });
                }
            } catch {}
        }

        // heartbeat-based stale (missing/old heartbeat)
        for (const activeKey of activeKeys) {
            const leadId = activeKey.replace('acc_active_', '');
            const activeData = localStorage.getItem(activeKey);
            if (!activeData) continue;
            try {
                const active = JSON.parse(activeData);
                const timeSinceHeartbeat = now - (active.lastHeartbeat || 0);
                const staleThreshold = 5 * 60 * 1000; // 5 minutes
                if (timeSinceHeartbeat > staleThreshold) {
                    staleLeads.push({
                        leadId,
                        type: 'heartbeat_stale',
                        url: active.url || `${window.location.origin}/admin/leads/${leadId}/`,
                        lastHeartbeat: active.lastHeartbeat,
                        timeStale: timeSinceHeartbeat
                    });
                }
            } catch {}
        }
    } catch (e) {
        console.error('[Stale Detection] Error scanning localStorage:', e);
    }

    return staleLeads;
}

async function processStaleLeadsFromContent() {
    if (!isStaleOwner) return;

    updateStaleOwnerHeartbeat();

    const staleLeads = findStaleLeadsFromLocal();
    if (staleLeads.length === 0) return;

    // Open at most one per tick; respect backoff per lead
    const now = Date.now();
    const lead = staleLeads[0];
    const lastOpened = staleLeadLastOpenedAtMs[lead.leadId] || 0;
    if (now - lastOpened < STALE_REOPEN_BACKOFF_MS) return;

    staleLeadLastOpenedAtMs[lead.leadId] = now;
    const leadUrl = lead.url || `${window.location.origin}/admin/leads/${lead.leadId}/`;
    console.log(`[Stale Detection] 🚑 Recovering stale lead ${lead.leadId} via background open: ${leadUrl}`);
    chrome.runtime.sendMessage({ action: 'openLeadTab', url: leadUrl, leadId: lead.leadId }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Stale Detection] Background openLeadTab error:', chrome.runtime.lastError.message);
        } else {
            console.log('[Stale Detection] Background response:', response);
        }
    });
}

function startStaleDetectionPollingContent() {
    if (staleDetectionIntervalId) return;
    if (window.location.pathname !== '/admin/leads/') return;

    claimStaleOwnership((owned) => {
        if (!owned) return;
        staleDetectionIntervalId = setInterval(processStaleLeadsFromContent, STALE_CHECK_INTERVAL_MS);
        // run immediately
        processStaleLeadsFromContent();
    });
}

function stopStaleDetectionPollingContent(releaseOwner = true) {
    if (staleDetectionIntervalId) {
        clearInterval(staleDetectionIntervalId);
        staleDetectionIntervalId = null;
    }
    if (releaseOwner) {
        releaseStaleOwnership();
        isStaleOwner = false;
    }
}

// ================================================================================
// Single-Owner Lock for Auto-Open Leads (shared across all windows)
// ================================================================================

const OWNER_KEY = 'autoOpenLeadsOwner';
const OWNER_TIMEOUT_MS = AUTO_OPEN_LEADS_INTERVAL_SECONDS * 1000 * 4; // owner considered stale after 4 intervals
const myAutoOpenTabId = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
let isAutoOpenOwner = false;

function updateOwnerHeartbeat() {
    if (isAutoOpenOwner) {
        chrome.storage.local.set({ [OWNER_KEY]: { id: myAutoOpenTabId, ts: Date.now() } });
    }
}

function claimAutoOpenOwnership(callback) {
    // Guard: only the main Leads list page should attempt to claim ownership
    if (window.location.pathname !== '/admin/leads/') {
        console.debug('[Auto-Open New Leads] Not on /admin/leads/, skip ownership claim.');
        callback(false);
        return;
    }
    chrome.storage.local.get([OWNER_KEY], data => {
        const ownerData = data[OWNER_KEY];
        const now = Date.now();
        if (!ownerData || !ownerData.id || (now - ownerData.ts) > OWNER_TIMEOUT_MS) {
            // No owner or owner is stale → claim ownership
            chrome.storage.local.set({ [OWNER_KEY]: { id: myAutoOpenTabId, ts: now } }, () => {
                isAutoOpenOwner = true;
                console.debug('[Auto-Open New Leads] Ownership claimed by this tab:', myAutoOpenTabId);
                callback(true);
            });
        } else if (ownerData.id === myAutoOpenTabId) {
            // We already own it
            isAutoOpenOwner = true;
            callback(true);
        } else {
            // Another tab owns it
            isAutoOpenOwner = false;
            callback(false);
        }
    });
}

function releaseAutoOpenOwnership() {
    if (!isAutoOpenOwner) return;
    chrome.storage.local.get([OWNER_KEY], data => {
        if (data[OWNER_KEY] && data[OWNER_KEY].id === myAutoOpenTabId) {
            chrome.storage.local.remove(OWNER_KEY, () => {
                console.debug('[Auto-Open New Leads] Ownership released by this tab');
            });
        }
    });
}

// React to ownership changes from other tabs
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[OWNER_KEY]) return;

    const newVal = changes[OWNER_KEY].newValue;

    if (isAutoOpenOwner) {
        // We thought we owned it, but key changed or removed → stop
        if (!newVal || (newVal.id && newVal.id !== myAutoOpenTabId)) {
            console.debug('[Auto-Open New Leads] Ownership lost to another tab. Stopping polling.');
            stopAutoOpenLeadsPolling(false); // false → do not try to release again
        }
    } else {
        // We are not owner; if key removed we can attempt to claim
        if (!newVal && window.location.pathname === '/admin/leads/') {
            console.debug('[Auto-Open New Leads] Ownership key removed. Attempting to claim.');
            claimAutoOpenOwnership(success => {
                if (success) {
                    startAutoOpenLeadsPolling();
                }
            });
        }
    }
});

// Release ownership when tab is closed / reloaded
window.addEventListener('beforeunload', () => {
    releaseAutoOpenOwnership();
});

// =================================================================================
// Main Functions
// =================================================================================

async function ColorCode() {
    try {
        console.log("Starting color coding process");
        
        await clickZip();
        if (!hasCityAndState) {
            await monitorAutoFill();
        }

        await setPriorityBasedOnDueDate();
        await updateLeadStatus();

        console.log("Color coding process completed");
        return { status: "Completed" };
    } catch (error) {
        console.error("Error in ColorCode:", error);
        return { status: "Error", message: error.message };
    }
}

async function openAllLeads() {
    const leadsDiv = document.getElementById("leadsDIV");
    const leadLinks = leadsDiv.querySelectorAll('a[href^="/admin/leads/"]');

    const openedTabs = new Set();
    const originalWindow = window;

    for (const leadLink of leadLinks) {
        if (!openedTabs.has(leadLink.href)) {
            openedTabs.add(leadLink.href);
            window.open(leadLink.href, "_blank");
            originalWindow.focus();
        }
    }
}

// Implement the process to prepare from payment to bookings
async function executeAllSteps() {
    try {
        await clickEstimatesQuotes();
        const invoiceNumber = await getInvoiceNumber();

        await clickLeadInfo();
        const babysLastName = await getBabysLastName();
        const eventDate = await getEventDate();
        const categoryCode = await getCategoryCode();

        let newEventName = `${invoiceNumber}${babysLastName}${eventDate}${categoryCode}`.toUpperCase();

        // Check for the possible duplicate client box
        const duplicateBoxExists = document.querySelector("#duplicateBox") !== null;
        if (duplicateBoxExists) {
            newEventName = `PC ${newEventName}`;
        }

        // alert(`${newEventName}`);
        return newEventName;
    } catch (error) {
        console.error("Error during execution of all steps:", error);
        throw error;
    }
}

// =================================================================================
// Helper Functions Related to Color Coding
// =================================================================================

async function updateLeadStatus() {
    try {
        const addressElement = await waitForElementWithComplexId(
            "af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry",
            5000
        );

        console.log("Address element found:", addressElement);

        const fullAddressText = await waitForAddressToUpdate(
            "af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry"
        );
        console.log("Full address text:", fullAddressText);

        const addressText = addressElement.textContent.trim();
        const [cityState] = addressText
            .split("\n")
            .map(s => s.trim())
            .filter(Boolean);
        const [city, stateZip] = cityState.split(", ");
        const [state] = stateZip.split(" ");

        await updateBrand(state);
        const brand = getBrandForState(state);
        const timezone = getTimezoneForStateAndBrand(state, brand);
        await updateTimezone(timezone);
        console.log("Timezone updated to:", timezone);

        // Check if it's Manhattan (NYC)
        const isManhattan = city.toLowerCase() === "new york" && state.toLowerCase() === "ny";

        // Check due date
        const dueDateElement = document.getElementById("questitem_8225")
            ? document.getElementById("questitem_8225").querySelector(".rightTitle")
            : null;
        if (!dueDateElement) {
            throw new Error("Due date element not found.");
        }

        const dueDateText = dueDateElement.textContent.trim();
        const [month, day, year] = dueDateText.split("/");
        const dueDate = new Date(Date.UTC(year, month - 1, day));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

        let statusValue;
        if (dueDate <= todayUTC) {
            statusValue = isManhattan ? "18563" : "18561";
        } else {
            statusValue = isManhattan ? "18564" : "18562";
        }

        await clickAndUpdateLeadStatus(statusValue);
    } catch (error) {
        console.error("Error updating lead status:", error);
    }
}

async function processZipCode() {
    const zipElement = document.querySelector(
        '#af_leadAddress\\{\\|\\|\\}leadAddress1\\{\\|\\|\\}leadCity\\{\\|\\|\\}leadState\\{\\|\\|\\}leadZip\\{\\|\\|\\}leadCountry'
    );

    if (!zipElement) {
        throw new Error("Zip code element not found on the page");
    }

    const dataValue = zipElement.getAttribute("data-value");
    const regex = /postal:\s*'(\d+)'/;
    const match = regex.exec(dataValue);

    if (!match || !match[1]) {
        throw new Error("Zip code not found in data-value");
    }

    const zipCode = match[1];
    console.log("Zip code extracted:", zipCode);

    // Send zip code to the Python server
    const response = await fetch("http://localhost:9696/lookup-zipcode", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ zip_code: zipCode }),
    });

    const result = await response.json();
    console.log("Response from server:", result);
    console.log("Auto-associating category...");
    await autoAssociateCategory(result);

    return result;
}

async function clickZip() {
    try {
        const zipElement = await waitForElementWithComplexId(
            "af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry",
            5000
        );

        const elementText = zipElement.textContent || "";
        hasCityAndState = /.*,.*\d{5}/.test(elementText);

        if (!hasCityAndState) {
            zipElement.click();
            console.log("ZIP code clicked, waiting for the field to appear.");
            await waitForElement("#state");
            console.log("State field appeared!");
        } else {
            console.log("Form already filled. Not clicking.");
        }
    } catch (error) {
        console.error("Error in clickZip:", error);
        throw error;
    }
}

async function monitorAutoFill() {
    try {
        await waitForElement("#state", 5000);
        console.log("City and State inputs are available.");

        const stateSelect = document.querySelector("#state");
        if (!stateSelect) {
            throw new Error("State select element not found");
        }

        stateSelect.addEventListener("change", () => {
            console.log("State change detected:", stateSelect.value);
        });

        console.log("Change event listener attached to the state select element.");
        await pollForSelectChange("#state", "#city", 100, 5000);
    } catch (error) {
        console.error("An error occurred while monitoring autofill:", error);
    }
}

async function setPriorityBasedOnDueDate() {
    const dueDateText = document.getElementById("questitem_8225")
        .querySelector(".rightTitle")
        .textContent.trim();
    const [month, day, year] = dueDateText.split("/");
    const dueDate = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    const timeDiff = dueDate - todayUTC;
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    let priority;
    if (daysDiff < 1) {
        priority = "3"; // High Priority
    } else if (daysDiff <= 30) {
        priority = "2"; // Medium Priority
    } else {
        priority = "1"; // Low Priority
    }

    changePriority(priority);
}

// =================================================================================
// Brand and Timezone Functions
// =================================================================================

const brandMappings = {
    BOOKING: ["DC", "MD", "VA", "NY", "NJ", "PA", "DE", "CT"],
    SCHEDULE: ["GA", "MA", "NH", "RI", "NC", "SC", "MI", "KY", "FL", "IL", "MN"],
    RESERVE: ["TX", "KS", "MO", "CO", "AZ", "NV", "OR", "WA"],
    SESSIONS: ["CA"],
};

const timezoneMappings = {
    BOOKING: "(GMT-05:00) Eastern Time (US &amp; Canada)",
    SCHEDULE: {
        default: "(GMT-05:00) Eastern Time (US &amp; Canada)",
        exceptions: {
            IL: "(GMT-06:00) Central Time (US &amp; Canada)",
            MN: "(GMT-06:00) Central Time (US &amp; Canada)",
        },
    },
    RESERVE: {
        default: "(GMT-06:00) Central Time (US &amp; Canada)",
        exceptions: {
            CO: "(GMT-07:00) Mountain Time (US &amp; Canada)",
            AZ: "(GMT-07:00) Arizona",
            NV: "(GMT-08:00) Pacific Time (US &amp; Canada); Tijuana",
            OR: "(GMT-08:00) Pacific Time (US &amp; Canada); Tijuana",
        },
    },
    SESSIONS: "(GMT-08:00) Pacific Time (US &amp; Canada); Tijuana",
};

async function updateBrand(state) {
    try {
        const targetBrand = getBrandForState(state);
        if (!targetBrand) {
            throw new Error("Unable to determine brand for state: " + state);
        }

        const brandField = document.getElementById("af_leadBrandID");
        if (!brandField) {
            throw new Error("Brand field not found.");
        }
        brandField.click();
        console.log("Brand field clicked.");

        const editableContainer = await waitForElement(".rightTitle .editable-container select", 5000);

        console.log("Available brand options:");
        [...editableContainer.options].forEach(option => console.log(`"${option.textContent.trim()}"`));

        const brandOption = [...editableContainer.options].find(
            option => option.textContent.trim() === targetBrand
        );
        if (!brandOption) {
            throw new Error(`Brand option not found: "${targetBrand}"`);
        }

        editableContainer.value = brandOption.value;
        editableContainer.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForConditionOrTimeout(() => editableContainer.value === brandOption.value, 5000);

        const saveButton = brandField.nextElementSibling.querySelector(".editable-submit");
        saveButton.click();
        console.log("Save button clicked for brand.");
        console.log("Brand update completed.");
    } catch (error) {
        console.error("Error updating brand:", error.message);
    }
}

function getBrandForState(state) {
    for (const [brand, states] of Object.entries(brandMappings)) {
        if (states.includes(state)) {
            return brand;
        }
    }
    console.error("State not found in any brand mapping:", state);
    return null;
}

function getTimezoneForStateAndBrand(state, brand) {
    const brandMapping = timezoneMappings[brand];
    if (typeof brandMapping === "string") {
        return brandMapping;
    } else if (typeof brandMapping === "object" && brandMapping.exceptions && brandMapping.exceptions[state]) {
        return brandMapping.exceptions[state];
    } else if (typeof brandMapping === "object") {
        return brandMapping.default;
    }

    console.error("Timezone not found for brand and state:", brand, state);
    return null;
}

async function updateTimezone(timezone) {
    try {
        const zoneField = document.getElementById("af_leadTimezone");
        if (!zoneField) {
            throw new Error("Timezone field not found.");
        }

        zoneField.click();
        console.log("Timezone field clicked.");

        const dropdownContainer = await waitForSiblingSpan(zoneField.id, 5000);
        const zoneDropdown = dropdownContainer.querySelector("select");
        if (!zoneDropdown) {
            throw new Error("Timezone dropdown not found.");
        }

        const decodedTimezone = decodeHtmlEntities(timezone);

        const targetOption = Array.from(zoneDropdown.options).find(
            option => decodeHtmlEntities(option.textContent.trim()) === decodedTimezone
        );
        if (!targetOption) {
            throw new Error(`Timezone option "${decodedTimezone}" not found.`);
        }

        zoneDropdown.value = targetOption.value;
        zoneDropdown.dispatchEvent(new Event("change", { bubbles: true }));

        console.log(zoneDropdown.options[zoneDropdown.selectedIndex].text, decodedTimezone);
        await waitForConditionOrTimeout(
            () => zoneDropdown.options[zoneDropdown.selectedIndex].text === decodedTimezone,
            5000
        );

        await new Promise(resolve => setTimeout(resolve, 250));
        await clickSaveButtonAndWaitForElement(() => waitForElement("#af_leadTimezone", 5000));
        console.log(`Timezone updated to: ${decodedTimezone}`);
    } catch (error) {
        console.error("Error updating timezone:", error);
    }
}

// =================================================================================
// Priority/Status Update Functions
// =================================================================================

function extractClientId() {
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
        if (script.textContent.includes("changeLeadType")) {
            const match = script.textContent.match(/clientID: '(\d+)'/);
            return match ? match[1] : null;
        }
    }
    return null;
}

function extractLeadId() {
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
        if (script.textContent.includes("changeLeadType")) {
            const match = script.textContent.match(/leadID: '(\d+)'/);
            return match ? match[1] : null;
        }
    }
    return null;
}

async function changePriority(priority) {
    const clientID = extractClientId();
    const leadID = extractLeadId();

    if (!clientID || !leadID) {
        console.error("Client ID or Lead ID is missing.");
        return;
    }

    try {
        const response = await fetch("/admin/data/updateLeadPriority/", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: new URLSearchParams({
                clientID: clientID,
                leadID: leadID,
                priority: priority,
            }),
            credentials: "include",
        });

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const data = await response.text();
        const results = data.split("{|}");

        if (results[0] === "SUCCESS") {
            console.log("Priority updated successfully:", results[1]);
            updatePriorityDisplay(results[1]);
        } else {
            console.error("Error updating priority:", results[1]);
        }
    } catch (error) {
        console.error("Error making request to change priority:", error);
    }
}

function updatePriorityDisplay(newPriorityHtml) {
    const currentPriorityDiv = document.getElementById("current_priority");
    if (currentPriorityDiv) {
        currentPriorityDiv.innerHTML = newPriorityHtml;
        console.log("Priority updated successfully on the page.");
    } else {
        console.error("Failed to find the current priority div.");
    }
}

async function clickAndUpdateLeadStatus(statusValue) {
    try {
        const statusDiv = document.getElementById("13426_status");
        if (!statusDiv) throw new Error("Status div not found");
        statusDiv.click();

        const dropdown = await waitForElement("#newLeadStatusToSwitchTo", 5000);

        const optionToSelect = [...dropdown.options].find(option => option.value === statusValue);
        if (!optionToSelect) throw new Error("Desired option not found in dropdown");

        dropdown.value = statusValue;
        dropdown.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForConditionOrTimeout(() => dropdown.value === statusValue, 5000);

        const saveButton = await waitForElement("#status_div .btn.blue", 5000);
        saveButton.click();
        console.log("Status save button clicked.");
        await waitForConditionOrTimeout(() => true, 5000);

        console.log("Lead status updated successfully.");
    } catch (error) {
        console.error("Error clicking and updating lead status:", error.message);
    }
}

// =================================================================================
// Functions for Payment to Bookings Prep
// =================================================================================

async function clickEstimatesQuotes() {
    document.querySelector('a[href="#invoicesTab"]').click();
    console.log("Estimates/Quotes clicked");
    await waitForElement('div[id^="row_"] .floatGrid a[data-toggle="popover"]', 5000);
}

async function getInvoiceNumber() {
    try {
        const invoiceLinks = await waitForElements('div.floatGrid a[href*="/admin/invoices/"]', 5000);
        for (const link of invoiceLinks) {
            if (link.hasAttribute("data-content")) {
                const invoiceNumber = link.getAttribute("data-content").trim();
                console.log("Invoice Number from data-content:", invoiceNumber);
                return invoiceNumber;
            }
        }
        throw new Error("Invoice number not found.");
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function clickLeadInfo() {
    document.querySelector('a[href="#leadInfoTab"]').click();
    console.log("Lead Info clicked");
    await waitForElement('div[id^="questitem_"] .rightTitle', 5000);
}

async function getBabysLastName() {
    try {
        await waitForElement("div#customFieldsDIV", 5000);

        const customFieldsDIV = document.querySelector("div#customFieldsDIV");
        const questItems = customFieldsDIV.querySelectorAll('div[id^="questitem_"]');
        let babysLastName = null;

        questItems.forEach(item => {
            const descText = item.querySelector(".leftTitle > span").textContent.trim();
            if (descText.toLowerCase() === "baby's last name") {
                const lastNameText = item.querySelector(".rightTitle").textContent.trim();
                babysLastName = lastNameText;
            }
        });

        if (!babysLastName) {
            throw new Error("Baby's Last Name not found.");
        }

        console.log("Baby's Last Name:", babysLastName);
        return babysLastName;
    } catch (error) {
        console.error(error);
        return "";
    }
}

async function getEventDate() {
    const eventDateElement = await waitForElement('a[id="af_leadEventDate"]', 5000);
    const eventDateRaw = eventDateElement.textContent.trim();
    const eventDate = eventDateRaw.replace(/\//g, "").slice(0, 4) + eventDateRaw.slice(8);
    console.log("Event Date:", eventDate);
    return eventDate;
}

async function getCategoryCode() {
    try {
        const staffMembers = document.querySelectorAll('div[id^="staff_"]');
        const categoryCodes = [];

        staffMembers.forEach(member => {
            const roleText = member.innerText || "";
            if (roleText.includes("Photographer")) {
                const strongTag = member.querySelector("strong");
                if (strongTag) {
                    const textContent = strongTag.textContent.trim();
                    const categoryCode = textContent.split(" ")[0].split("/")[0];
                    console.log("Found Photographer Category Code:", categoryCode);
                    categoryCodes.push(categoryCode);
                }
            }
        });

        if (categoryCodes.length > 0) {
            console.log("All Photographer Category Codes:", categoryCodes);
            return categoryCodes;
        } else {
            throw new Error("No photographer category codes found.");
        }
    } catch (error) {
        console.error("Failed to find photographer category codes:", error);
        return [];
    }
}

// =================================================================================
// Element Waiting and Condition Checking Helpers
// =================================================================================

function waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
            } else if (Date.now() - startTime >= timeout) {
                reject(`Element ${selector} not found after ${timeout}ms`);
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function waitForElements(selector, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                resolve(elements);
            } else if (Date.now() - startTime >= timeout) {
                reject(new Error(`Elements ${selector} not found after ${timeout}ms`));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function waitForElementWithComplexId(id, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const element = document.getElementById(id);
            if (element) {
                resolve(element);
            } else if (Date.now() - startTime >= timeout) {
                reject(`Element with ID ${id} not found after ${timeout}ms`);
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function waitForConditionOrTimeout(conditionCheckFunction, timeout = 5000) {
    const startTime = Date.now();

    return new Promise(resolve => {
        const intervalCheck = setInterval(() => {
            if (conditionCheckFunction()) {
                console.log("Condition met.");
                clearInterval(intervalCheck);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                console.log("Condition not met within timeout.");
                clearInterval(intervalCheck);
                resolve(false);
            }
        }, 100);
    });
}

function waitForAddressToUpdate(elementId, timeout = 10000) {
    const regex = /\w+, \w{2} +\d{5}/;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkAddress = () => {
            const element = document.getElementById(elementId);
            if (element && regex.test(element.textContent.trim())) {
                resolve(element.textContent.trim());
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Address did not update to full format within ${timeout}ms.`));
            } else {
                setTimeout(checkAddress, 100);
            }
        };
        checkAddress();
    });
}

// =================================================================================
// Miscellaneous Helpers
// =================================================================================

function decodeHtmlEntities(text) {
    const textArea = document.createElement("textarea");
    textArea.innerHTML = text;
    return textArea.value;
}

async function waitForSiblingSpan(referenceId, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            const referenceElement = document.getElementById(referenceId);
            const siblingSpan = referenceElement ? referenceElement.nextElementSibling : null;
            if (siblingSpan && siblingSpan.tagName.toLowerCase() === "span") {
                resolve(siblingSpan);
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Timeout waiting for sibling span of #${referenceId}`));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

async function clickSaveButtonAndWaitForElement(waitForElementFunction) {
    return new Promise(async (resolve, reject) => {
        const saveButton = document.querySelector("button.btn.blue.btn-xs.editable-submit");
        if (saveButton) {
            saveButton.click();
            console.log("Save button clicked.");
            try {
                await waitForElementFunction();
                resolve();
            } catch (error) {
                reject(error);
            }
        } else {
            console.error("Save button not found.");
            reject(new Error("Save button not found."));
        }
    });
}

function simulateTabPress(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.focus();
        console.log(`Focused on ${selector}`);

        const tabKeyEvent = new KeyboardEvent("keyup", { key: "Tab", keyCode: 9, which: 9 });
        element.dispatchEvent(tabKeyEvent);
        console.log(`Tab key press simulated on ${selector}`);
    } else {
        console.error(`Element not found for selector: ${selector}`);
    }
}

function pollForSelectChange(stateSelector, citySelector, interval = 100, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const stateElement = document.querySelector(stateSelector);
        const cityElement = document.querySelector(citySelector);
        let lastStateValue = stateElement ? stateElement.value : null;
        let lastCityValue = cityElement ? cityElement.value : null;

        const checkChange = async () => {
            const currentStateValue = document.querySelector(stateSelector)?.value;
            const currentCityValue = document.querySelector(citySelector)?.value;

            if (currentStateValue !== lastStateValue && currentCityValue !== lastCityValue) {
                console.log("Detected change via polling:", currentStateValue, currentCityValue);
                try {
                    await clickSaveButtonAndWaitForElement(() =>
                        waitForElementWithComplexId(
                            "af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry",
                            5000
                        )
                    );
                    resolve();
                } catch (error) {
                    reject(error);
                }
            } else if (Date.now() - startTime > timeout) {
                reject(new Error("Timeout reached without detecting changes."));
            } else {
                setTimeout(checkChange, interval);
            }
        };

        checkChange();
        simulateTabPress("#postal");
    });
}

// =================================================================================
// Available Date Finder Functions
// =================================================================================

async function findEarliestAvailableDate(startDateStr) {
    const dateStatusMap = {};
    const dateObjMap = {};

    const weekRows = document.querySelectorAll(".fc-row.fc-week");
    weekRows.forEach((weekRow) => {
        const dateCells = weekRow.querySelectorAll(".fc-day[data-date]");
        const dateByColumnIndex = [];

        dateCells.forEach((cell) => {
            const dateStr = cell.getAttribute("data-date");
            if (cell.classList.contains("fc-other-month")) return;

            const dateObj = { dateStr, cell, status: "available" };
            dateObjMap[dateStr] = dateObj;
        });

        const childDivs = weekRow.querySelectorAll("div");
        childDivs.forEach((childDiv) => {
            if (childDiv.classList.contains("fc-content-skeleton")) {
                const headerCells = childDiv.querySelectorAll("thead td[data-date]");
                headerCells.forEach((headerCell, index) => {
                    const dateStr = headerCell.getAttribute("data-date");
                    dateByColumnIndex[index] = dateStr;
                });

                const tbodyRows = childDiv.querySelectorAll("tbody tr");
                tbodyRows.forEach(row => {
                    const cells = row.children;
                    for (let colIndex = 0; colIndex < cells.length; colIndex++) {
                        const cell = cells[colIndex];
                        const dateStr = dateByColumnIndex[colIndex];
                        if (!dateStr) continue;

                        const dateObj = dateObjMap[dateStr];
                        if (!dateObj || dateObj.status === "unavailable") continue;

                        let eventContainers = [];
                        if (cell.classList.contains("fc-event-container")) {
                            eventContainers.push(cell);
                        } else {
                            eventContainers = Array.from(cell.querySelectorAll(".fc-event-container"));
                        }

                        eventContainers.forEach(eventContainer => {
                            const eventElement = eventContainer.querySelector("a.fc-day-grid-event");
                            if (eventElement) {
                                const eventClasses = eventElement.classList;
                                const eventTitleElem = eventElement.querySelector(".fc-title");
                                const eventTitle = eventTitleElem ? eventTitleElem.textContent.trim() : "";
                                const normalizedTitle = eventTitle.toLowerCase();

                                if (eventClasses.contains("pxLead")) {
                                    // Leads do not change availability
                                } else if (eventClasses.contains("pxEvent")) {
                                    if (
                                        normalizedTitle.includes("do not book") ||
                                        normalizedTitle.includes("holiday") ||
                                        normalizedTitle.includes("unavailable")
                                    ) {
                                        dateObj.status = "unavailable";
                                    } else {
                                        dateObj.status = "booked";
                                    }
                                } else {
                                    dateObj.status = "booked";
                                }
                            }
                        });
                    }
                });
            }

            if (childDiv.classList.contains("fc-bgevent-skeleton")) {
                const bgEventRows = childDiv.querySelectorAll("table tbody tr");
                bgEventRows.forEach(bgEventRow => {
                    let colIndex = 0;
                    const cells = bgEventRow.children;
                    for (let i = 0; i < cells.length; i++) {
                        const cell = cells[i];
                        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
                        const isUnavailable = cell.classList.contains("fc-bgevent") && cell.classList.contains("fc-unavailable");

                        for (let j = 0; j < colspan; j++) {
                            const position = colIndex + j;
                            const dateStr = dateByColumnIndex[position];
                            if (dateStr) {
                                const dateObj = dateObjMap[dateStr];
                                if (isUnavailable && dateObj) {
                                    dateObj.status = "unavailable";
                                }
                            }
                        }
                        colIndex += colspan;
                    }
                });
            }
        });

        Object.values(dateObjMap).forEach(dateObj => {
            const dateStr = dateObj.dateStr;
            if (dateStr >= startDateStr) {
                dateStatusMap[dateStr] = { dateStr, status: dateObj.status };
            }
        });
    });

    const availableDates = Object.values(dateStatusMap)
        .filter(d => d.status === "available")
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    return availableDates.length > 0 ? availableDates[0].dateStr : null;
}

async function fetchLeadsForAutoOpen() {
    const body = "clientID=12295&page=1&section=id&person=&statuses=18561%7C%7C18562%7C%7C18563%7C%7C18564%7C%7C13426&brands=11473%7C%7C15793%7C%7C18826%7C%7C19647&viewFilter=&eventType=&readUnread=&dir=D&referralSource=&firstContactStart=&firstContactEnd=&view=all&eventDateStart=&eventDateEnd=&categories=&numPerPage=20&categoryType=any&customFieldFilters=item_17258%3D%26item_17417-score%3D%26item_15670%3D%26item_15926%3D%26item_13517%3D%26item_11969%3D%26item_11721%3D%26item_13804%3D%26item_8223%3D%26item_11970%3D%26item_16898%3D%26item_8229%3D%26item_11722%3D%26item_14924%3D%26item_11723%3D%26item_18389%3D%26item_10203%3D%26item_8220%3D%26item_12940%3D%26item_14099%3D%26item_18556%3D%26item_11971%3D%26item_15158%3D%26item_15168%3D%26item_15113%3D%26item_15160%3D%26item_15123%3D%26item_15162%3D%26item_15165%3D%26item_15119%3D%26item_15120%3D%26item_15121%3D%26item_15163%3D%26item_15669%3D%26item_18714%3D%26item_18715%3D%26item_18716%3D%26item_18717%3D%26item_18718%3D%26item_18719%3D%26item_18720%3D%26item_18721%3D&priority=0";
    const response = await fetch("https://www.pixifi.com/admin/fn/leads/getLeads/", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        },
        body: body,
        credentials: "include"
    });
    return response.text();
}

function parseLeadIdsForAutoOpen(html) {
    const ids = [];
    const regex = /<div id=\"row_(\d+)\"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        ids.push(match[1]);
    }
    return ids;
}

async function checkForNewLeadsAndOpen() {
    if (window.location.pathname !== '/admin/leads/') {
        console.debug('[Auto-Open New Leads] Not on /admin/leads/, skipping check.');
        return;
    }
    try {
        const html = await fetchLeadsForAutoOpen();
        const leadIds = parseLeadIdsForAutoOpen(html);
        if (leadIds.length > 0) {
            const newLeadIds = leadIds.filter(id => !openedLeadIdsThisSession.has(id));
            if (newLeadIds.length > 0) {
                console.debug('[Auto-Open New Leads] Found new leads:', newLeadIds);
                // Add new leads to the queue and start processing if not already
                leadQueue.push(...newLeadIds);
                if (!isProcessingQueue) {
                    processLeadQueue();
                }
            }
        }
    } catch (e) {
        console.error('Auto-Open New Leads error:', e);
    }
}

async function processLeadQueue() {
    if (isProcessingQueue || leadQueue.length === 0) {
        return;
    }
    isProcessingQueue = true;
    console.log('[Auto-Open New Leads] Starting queue processing. Queue size:', leadQueue.length);

    while (leadQueue.length > 0) {
        const leadId = leadQueue.shift(); // Get the next lead ID from the front of the queue

        if (!openedLeadIdsThisSession.has(leadId)) {
            const leadUrl = window.location.origin + `/admin/leads/${leadId}/`;
            console.debug('[Auto-Open New Leads] Attempting to open tab for lead:', leadId, leadUrl);

            // Send message to background script to open the tab and wait for it to be closed
            await new Promise((resolve, reject) => {
                function onTabClosed(msg) {
                    if (msg && msg.action === 'leadTabClosed' && msg.leadId === leadId) {
                        console.debug(`[Auto-Open New Leads] Tab closed for lead: ${leadId}`);
                        openedLeadIdsThisSession.add(leadId);
                        chrome.runtime.onMessage.removeListener(onTabClosed);
                        resolve();
                    }
                }
                chrome.runtime.onMessage.addListener(onTabClosed);
                chrome.runtime.sendMessage({
                    action: 'openLeadTab',
                    url: leadUrl,
                    leadId: leadId // Include leadId for tracking if needed
                }, (response) => {
                    if (!response || response.status !== 'Completed') {
                        console.error(`[Auto-Open New Leads] Failed to open or load tab for lead: ${leadId}`, response);
                        chrome.runtime.onMessage.removeListener(onTabClosed);
                        reject(new Error('Failed to open or load tab'));
                    }
                });
            });
        } else {
            console.debug(`[Auto-Open New Leads] Lead ${leadId} already opened in this session, skipping.`);
        }
    }

    isProcessingQueue = false;
    console.log('[Auto-Open New Leads] Finished queue processing.');
}

let autoOpenLastTick = 0;
const AUTO_OPEN_WATCHDOG_INTERVAL_MS = 30000; // 30s
const AUTO_OPEN_ALLOWED_SILENCE_MS = AUTO_OPEN_LEADS_INTERVAL_SECONDS * 1000 * 3; // 3 intervals
let autoOpenWatchdogId = null;

function startAutoOpenLeadsPolling() {
    if (autoOpenLeadsIntervalId) return;
    if (window.location.pathname !== '/admin/leads/') {
        console.debug('[Auto-Open New Leads] Not on /admin/leads/, polling not started.');
        return;
    }

    claimAutoOpenOwnership((owned) => {
        if (!owned) {
            console.debug('[Auto-Open New Leads] Another tab is already the owner. Polling not started.');
            return;
        }

        // At this point we are owner
        autoOpenLeadsIntervalId = setInterval(() => {
            updateOwnerHeartbeat();
            autoOpenLastTick = Date.now();
            checkForNewLeadsAndOpen();
        }, AUTO_OPEN_LEADS_INTERVAL_SECONDS * 1000);

        // Run immediately
        updateOwnerHeartbeat();
        autoOpenLastTick = Date.now();
        checkForNewLeadsAndOpen();
    });
}

function startAutoOpenWatchdog() {
    if (autoOpenWatchdogId) return;
    autoOpenWatchdogId = setInterval(() => {
        // Only the owner watches
        if (!isAutoOpenOwner) return;
        const now = Date.now();
        if (!autoOpenLastTick) return; // not started yet
        if (now - autoOpenLastTick > AUTO_OPEN_ALLOWED_SILENCE_MS) {
            console.warn('[Auto-Open New Leads] Watchdog detected silence, restarting polling...');
            stopAutoOpenLeadsPolling(false);
            startAutoOpenLeadsPolling();
        }
    }, AUTO_OPEN_WATCHDOG_INTERVAL_MS);
}

function stopAutoOpenLeadsPolling(releaseOwner = true) {
    if (autoOpenLeadsIntervalId) {
        clearInterval(autoOpenLeadsIntervalId);
        autoOpenLeadsIntervalId = null;
        console.log('Auto-Open New Leads stopped.');
    }

    if (autoOpenWatchdogId) {
        clearInterval(autoOpenWatchdogId);
        autoOpenWatchdogId = null;
    }

    if (releaseOwner) {
        releaseAutoOpenOwnership();
        isAutoOpenOwner = false;
    }
}

// On page load, check if auto-open is enabled and start polling if so
chrome.storage.sync.get({ autoOpenLeadsEnabled: true }, function(result) {
    if (result.autoOpenLeadsEnabled) {
        startAutoOpenLeadsPolling();
    }
    // Always start stale detection (owner lock prevents duplicates)
    startStaleDetectionPollingContent();
    // Start watchdog to keep auto-open polling healthy
    startAutoOpenWatchdog();
});

// Manual testing: Add console command to trigger stale detection
// Usage: In browser console: triggerStaleDetection()
window.triggerStaleDetection = function() {
    console.log('🔧 Manual stale detection trigger...');
    chrome.runtime.sendMessage({ action: 'triggerStaleDetection' }, (response) => {
        console.log('Manual stale detection response:', response);
    });
};
