// Trigger content script execution when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

// Listen for messages from content scripts and handle actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Enable async sendResponse
  let asyncSendResponse = false;

  // Handle any runtime errors
  if (chrome.runtime.lastError) {
    console.warn('[Background Script] Runtime error:', chrome.runtime.lastError.message);
  }

  if (request.action === "changePriority" && sender.tab) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      function: changePriorityOnPage,
      args: [request.priority]
    });
    sendResponse({ status: "ok", message: "Priority change executed" });
  } else if (request.action === "runColorCode" && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { action: "runColorCode" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error in runColorCode:", chrome.runtime.lastError.message);
        sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: "Completed", response });
      }
    });
    asyncSendResponse = true;
  } else if (request.action === "processZipCode" && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { action: "processZipCode" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error in processZipCode:", chrome.runtime.lastError.message);
        sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: "Completed", response });
      }
    });
    asyncSendResponse = true;
  } else if (request.action === "runPaymentToBookingsPrep" && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { action: "runPaymentToBookingsPrep" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error in runPaymentToBookingsPrep:", chrome.runtime.lastError.message);
        sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: "Completed", response });
      }
    });
    asyncSendResponse = true;
  } else if (request.action === "findAvailableDate" && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { action: "findAvailableDate", startDate: request.startDate }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error in findAvailableDate:", chrome.runtime.lastError.message);
        sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: "Completed", response });
      }
    });
    asyncSendResponse = true;
  } else if (request.action === 'toggleAutoOpenLeads' && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { action: 'toggleAutoOpenLeads', enabled: request.enabled });
    sendResponse({ status: 'Completed' });
  } else if (request.action === 'triggerStaleDetection' && sender.tab) {
    console.log('[Stale Detection] 🔧 Manual trigger received - running stale detection check...');
    checkForStaleLeads();
    sendResponse({ status: 'Completed', message: 'Stale detection check triggered' });
  } else if (request.action === 'openLeadTab' && sender.tab) {
    asyncSendResponse = true; // Will send response asynchronously

    console.log(`[Background Script] Creating tab for lead ${request.leadId} at ${request.url}`);

    try {
      chrome.tabs.create({ url: request.url, active: true }, (newTab) => {
        if (chrome.runtime.lastError) {
          console.error(`[Background Script] Failed to create tab for lead ${request.leadId}:`, chrome.runtime.lastError.message);
          sendResponse({ status: 'Error', message: chrome.runtime.lastError.message });
          return;
        }

        console.log(`[Background Script] Successfully created tab ${newTab.id} for lead ${request.leadId}`);

        // Wait for the tab to finish loading (optional, can be removed if not needed)
        const loadListener = (tabId, changeInfo, tab) => {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            console.log(`[Background Script] Tab loaded for lead: ${request.leadId}`);
            chrome.tabs.onUpdated.removeListener(loadListener);
          }
        };
        chrome.tabs.onUpdated.addListener(loadListener);

        // Wait for the tab to be closed
        const closeListener = (closedTabId, removeInfo) => {
          if (closedTabId === newTab.id) {
            console.log(`[Background Script] Tab closed for lead: ${request.leadId}`);
            chrome.tabs.onRemoved.removeListener(closeListener);
            // Send confirmation back to the content script that the tab was closed
            try {
              chrome.tabs.sendMessage(sender.tab.id, { action: 'leadTabClosed', status: 'Completed', leadId: request.leadId }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error("[Background Script] Error sending tab closed confirmation:", chrome.runtime.lastError.message);
                } else {
                  console.log("[Background Script] Tab closed confirmation sent.", response);
                }
                // Always send response to avoid hanging
                sendResponse({ status: 'Completed', tabId: newTab.id });
              });
            } catch (msgError) {
              console.error("[Background Script] Exception sending tab closed message:", msgError);
              sendResponse({ status: 'Completed', tabId: newTab.id });
            }
          }
        };
        chrome.tabs.onRemoved.addListener(closeListener);

        // Send immediate response that tab was created successfully
        sendResponse({ status: 'Completed', tabId: newTab.id });
      });
    } catch (createError) {
      console.error(`[Background Script] Exception creating tab for lead ${request.leadId}:`, createError);
      sendResponse({ status: 'Error', message: createError.message });
    }
  }

  return asyncSendResponse; // Indicate if sendResponse will be called asynchronously
});

// Handle keyboard shortcuts via commands
chrome.commands.onCommand.addListener((command) => {
  console.log(`Command received: ${command}`);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      console.log(`Sending message to tab: ${tabs[0].id}`);

      if (command === "trigger-color-coding") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "runColorCode" });
      } else if (command === "open-all-leads") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "runOpenLeads" });
      } else if (command === "trigger_zip_code_extraction") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "processZipCode" });
      } else if (command === "trigger-payment-to-bookings-prep") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "runPaymentToBookingsPrep" });
      }
    }
  });
});

// ================================================================================
// Stale Lead Detection & Recovery System (Background Polling)
// ================================================================================

const STALE_DETECTION_INTERVAL_SECONDS = 5;
const STALE_LEAD_OWNER_KEY = 'staleDetectionOwner';
const STALE_LEAD_TIMEOUT_MS = STALE_DETECTION_INTERVAL_SECONDS * 1000 * 4; // 4 intervals
const myStaleDetectionTabId = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
let isStaleDetectionOwner = false;
let staleDetectionIntervalId = null;

// Single-owner lock for stale detection (prevents multiple tabs from polling)
function updateStaleDetectionHeartbeat() {
  if (isStaleDetectionOwner) {
    chrome.storage.local.set({ [STALE_LEAD_OWNER_KEY]: { id: myStaleDetectionTabId, ts: Date.now() } });
  }
}

function claimStaleDetectionOwnership(callback) {
  chrome.storage.local.get([STALE_LEAD_OWNER_KEY], data => {
    const ownerData = data[STALE_LEAD_OWNER_KEY];
    const now = Date.now();

    if (!ownerData || !ownerData.id || (now - ownerData.ts) > STALE_LEAD_TIMEOUT_MS) {
      // No owner or owner is stale → claim ownership
      chrome.storage.local.set({ [STALE_LEAD_OWNER_KEY]: { id: myStaleDetectionTabId, ts: now } }, () => {
        isStaleDetectionOwner = true;
        console.log('[Stale Detection] Ownership claimed by background script:', myStaleDetectionTabId);
        callback(true);
      });
    } else if (ownerData.id === myStaleDetectionTabId) {
      // We already own it
      isStaleDetectionOwner = true;
      callback(true);
    } else {
      // Another instance owns it
      isStaleDetectionOwner = false;
      callback(false);
    }
  });
}

function releaseStaleDetectionOwnership() {
  if (!isStaleDetectionOwner) return;
  chrome.storage.local.get([STALE_LEAD_OWNER_KEY], data => {
    if (data[STALE_LEAD_OWNER_KEY] && data[STALE_LEAD_OWNER_KEY].id === myStaleDetectionTabId) {
      chrome.storage.local.remove(STALE_LEAD_OWNER_KEY, () => {
        console.log('[Stale Detection] Ownership released by background script');
      });
    }
  });
}

// React to ownership changes from other instances
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STALE_LEAD_OWNER_KEY]) return;

  const newVal = changes[STALE_LEAD_OWNER_KEY].newValue;

  if (isStaleDetectionOwner) {
    if (!newVal || newVal.id !== myStaleDetectionTabId) {
      // We lost ownership
      console.log('[Stale Detection] Lost ownership to another instance');
      isStaleDetectionOwner = false;
      stopStaleDetectionPolling();
    }
  }
});

// Detect stale leads by requesting data from content scripts
async function detectStaleLeads() {
  return new Promise((resolve, reject) => {
    try {
      // Find active Pixifi tabs
      chrome.tabs.query({ url: '*://*.pixifi.com/*' }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error('[Stale Detection] Error querying tabs:', chrome.runtime.lastError.message);
          resolve([]);
          return;
        }

        if (tabs.length === 0) {
          console.log('[Stale Detection] No Pixifi tabs found');
          resolve([]);
          return;
        }

        console.log(`[Stale Detection] Found ${tabs.length} Pixifi tabs to query`);

        const staleLeads = [];
        let completedRequests = 0;

        // Request stale lead data from each Pixifi tab
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'getStaleLeadData' }, (response) => {
            completedRequests++;

            if (chrome.runtime.lastError) {
              console.debug(`[Stale Detection] Tab ${tab.id} not ready:`, chrome.runtime.lastError.message);
            } else if (response && response.staleLeads) {
              console.log(`[Stale Detection] Tab ${tab.id} returned ${response.staleLeads.length} stale leads`);
              staleLeads.push(...response.staleLeads);
            } else {
              console.debug(`[Stale Detection] Tab ${tab.id} returned no stale leads or invalid response`);
            }

            // Resolve when all tabs have responded
            if (completedRequests === tabs.length) {
              console.log(`[Stale Detection] ✅ Collected data from ${tabs.length} tabs, found ${staleLeads.length} total stale leads`);
              resolve(staleLeads);
            }
          });
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (completedRequests < tabs.length) {
            console.log(`[Stale Detection] ⏰ Timeout waiting for responses, collected ${staleLeads.length} stale leads from ${completedRequests}/${tabs.length} tabs`);
            resolve(staleLeads);
          }
        }, 5000);
      });
    } catch (error) {
      console.error('[Stale Detection] Error detecting stale leads:', error);
      resolve([]);
    }
  });
}

// Process stale leads by opening recovery tabs
async function processStaleLeads(staleLeads) {
  if (staleLeads.length === 0) return;

  console.log(`[Stale Detection] Found ${staleLeads.length} stale leads to process`);

  // Process only one stale lead at a time to avoid overwhelming
  const staleLead = staleLeads[0]; // Take the first one
  console.log(`[Stale Detection] Processing first stale lead: ${staleLead.leadId} (${staleLead.type})`);

  try {
    let leadUrl;

    if (staleLead.url) {
      // Use the stored URL from active tracking
      leadUrl = staleLead.url;
    } else {
      // Construct URL from lead ID
      leadUrl = `https://www.pixifi.com/admin/leads/${staleLead.leadId}/`;
    }

    console.log(`[Stale Detection] Opening recovery tab for stale lead ${staleLead.leadId} at ${leadUrl}`);

    // Create tab in background (don't steal focus)
    try {
      console.log(`[Stale Detection] Creating recovery tab for lead ${staleLead.leadId}...`);
      const newTab = await chrome.tabs.create({
        url: leadUrl,
        active: false
      });

      if (chrome.runtime.lastError) {
        console.error(`[Stale Detection] Failed to create tab for lead ${staleLead.leadId}:`, chrome.runtime.lastError.message);
        return;
      }

      console.log(`[Stale Detection] ✅ Successfully created tab ${newTab.id} for lead ${staleLead.leadId}`);

      // Monitor the tab and clean up when it closes
      const tabCloseListener = (tabId) => {
        if (tabId === newTab.id) {
          console.log(`[Stale Detection] Recovery tab closed for lead ${staleLead.leadId}`);
          chrome.tabs.onRemoved.removeListener(tabCloseListener);
        }
      };

      chrome.tabs.onRemoved.addListener(tabCloseListener);

      // Wait a bit before processing the next one
      setTimeout(() => {
        console.log(`[Stale Detection] Ready to process next stale lead`);
      }, 5000);

    } catch (tabError) {
      console.error(`[Stale Detection] Exception creating tab for lead ${staleLead.leadId}:`, tabError);
    }

  } catch (error) {
    console.error(`[Stale Detection] Error processing stale lead ${staleLead.leadId}:`, error);
    if (leadUrl) {
      console.error(`[Stale Detection] Failed URL: ${leadUrl}`);
    }
  }
}

// Main stale detection polling function
async function checkForStaleLeads() {
  try {
    console.log('[Stale Detection] 🔍 POLLING ACTIVE: Checking for stale leads... (every 5 seconds)');

    const staleLeads = await detectStaleLeads();

    if (staleLeads.length > 0) {
      console.log(`[Stale Detection] 📋 FOUND ${staleLeads.length} stale leads:`,
        staleLeads.map(lead => `${lead.leadId} (${lead.type})`));
      await processStaleLeads(staleLeads);
    } else {
      console.log('[Stale Detection] ✅ No stale leads found this poll');
    }
  } catch (error) {
    console.error('[Stale Detection] Error in checkForStaleLeads:', error);
  }
}

// Start stale detection polling
function startStaleDetectionPolling() {
  if (staleDetectionIntervalId) return;

  claimStaleDetectionOwnership((owned) => {
    if (!owned) {
      console.log('[Stale Detection] Another instance is already the owner. Polling not started.');
      return;
    }

    console.log('[Stale Detection] Starting polling every', STALE_DETECTION_INTERVAL_SECONDS, 'seconds');

    // Start polling
    staleDetectionIntervalId = setInterval(() => {
      updateStaleDetectionHeartbeat();
      checkForStaleLeads();
    }, STALE_DETECTION_INTERVAL_SECONDS * 1000);

    // Run immediately
    updateStaleDetectionHeartbeat();
    checkForStaleLeads();
  });
}

// Stop stale detection polling
function stopStaleDetectionPolling(releaseOwner = true) {
  if (staleDetectionIntervalId) {
    clearInterval(staleDetectionIntervalId);
    staleDetectionIntervalId = null;
    console.log('[Stale Detection] Polling stopped.');
  }

  if (releaseOwner) {
    releaseStaleDetectionOwnership();
    isStaleDetectionOwner = false;
  }
}

// Auto-start stale detection on extension load
console.log('[Stale Detection] 🚀 BACKGROUND SCRIPT LOADED - Starting stale detection polling...');
startStaleDetectionPolling();

// Handle extension context invalidation by checking periodically
setInterval(() => {
  // If we lose ownership unexpectedly, try to reclaim it
  if (isStaleDetectionOwner && !staleDetectionIntervalId) {
    console.log('[Stale Detection] Detected ownership loss, attempting to restart...');
    startStaleDetectionPolling();
  }
}, 30000); // Check every 30 seconds

// Handle runtime errors in the main message listener (already exists above)

// Function to change priority (executed in the context of the webpage)
function changePriorityOnPage(priority) {
  if (typeof changePriority === "function") {
    changePriority(priority); // Call the function that exists on the webpage
  } else {
    console.error("changePriority function not found on the webpage.");
  }
}
