// File: Auto_Color_Coder.user.js
// ==UserScript==
// @name         Auto Color Coder
// @namespace    http://tampermonkey.net/
// @version      1.23
// @description  Fixed issue with Connecticut ZIP codes being incorrectly assigned to the wrong brand.
// @match        https://www.pixifi.com/admin/leads*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      apis.usps.com
// @connect      api.zippopotam.us
// ==/UserScript==

(function () {
    'use strict';

/***********************************************************************
 *  AUTO COLOR CODER  LONG-LIFE HARDENING LAYER
 **********************************************************************/

 /***** 1.  Storage manager                                             */
 // Use GM_* for the growing sets; fall back to a purge-and-retry scheme
 const LS_SOFT_LIMIT   = 4.8 * 1024 * 1024;    // 95 % of 5 MB
 const LS_PREFIX_DONE  = 'acc_done_';
 const LS_PREFIX_ZIP   = 'acc_zip_';
 const LS_PREFIX_TINY  = 'tinymce-autosave-';
 const LS_PREFIX_PROGRESS = 'acc_progress_';   // Track processing progress
 const LS_PREFIX_ACTIVE = 'acc_active_';       // Track actively processing leads
 const LS_PREFIX_REGISTRY = 'acc_registry_';   // Global active leads registry
 const KEEP_DONE       = 10_000;               // keep 10k processed-lead flags
 const KEEP_TINY       = 150;                  // keep 150 newest drafts
 const KEEP_PROGRESS   = 5_000;                // keep 5k progress entries
 const KEEP_ACTIVE     = 1_000;                // keep 1k active lead entries
 const HEARTBEAT_INTERVAL = 1_000;             // Update timestamp every 1 second
 const STALE_THRESHOLD = 5_000;                // 5 seconds = stale/failed
 const ZIP_RING        = 1_000;                // ring buffer size

 async function gmGet(k, def = null) {
   return (await GM_getValue(k, def));
 }
 async function gmSet(k, v) {
   return GM_setValue(k, v);
 }
 /* purgeOldest(prefix, keep)  trims localStorage keys */
 function purgeOldest(prefix, keep) {
   const keys = Object.keys(localStorage)
     .filter(k => k.startsWith(prefix))
     .sort();                                // lexicographic ~= chronological
   if (keys.length > keep)
     keys.slice(0, keys.length - keep)
         .forEach(k => localStorage.removeItem(k));
 }
 /* safeLocalSet(k,v)  tries once, purges, retries, else bails */
 function safeLocalSet(k, v) {
   try { localStorage.setItem(k, v); return true; }
   catch (e) {
     if (e.name !== 'QuotaExceededError') throw e;
     // targeted purges
     purgeOldest(LS_PREFIX_TINY, KEEP_TINY);
     purgeOldest(LS_PREFIX_DONE, KEEP_DONE);
     purgeOldest(LS_PREFIX_PROGRESS, KEEP_PROGRESS);
     purgeOldest(LS_PREFIX_ACTIVE, KEEP_ACTIVE);
     // global purge if still heavy
     if (JSON.stringify(localStorage).length > LS_SOFT_LIMIT)
       console.warn('[ACC] localStorage near hard limit even after purge');
     try { localStorage.setItem(k, v); return true; }  // retry once
     catch { console.error('[ACC] Write skipped  quota still exceeded'); }
   }
   return false;
 }

 /***** Progress tracking for restart safety                            */
 // Processing steps that need to be tracked
 const PROCESSING_STEPS = {
   GEOCODE_AND_FIX: 'geocode_and_fix',
   CORRECT_NAMES: 'correct_names',
   SET_PRIORITY: 'set_priority',
   HANDLE_DUPLICATE: 'handle_duplicate',
   UPDATE_EVENT_NAME: 'update_event_name',
   UPDATE_STATUS: 'update_status',
   ADD_QUESTIONNAIRE: 'add_questionnaire'
 };

 async function getProcessingProgress(leadID) {
   const key = LS_PREFIX_PROGRESS + leadID;
   const progress = await gmGet(key);
   return progress ? JSON.parse(progress) : null;
 }

 async function updateProcessingProgress(leadID, step, completed = false, stateData = {}) {
   const key = LS_PREFIX_PROGRESS + leadID;
   const currentProgress = await getProcessingProgress(leadID) || {
     startTime: Date.now(),
     steps: {},
     state: {} // Store state variables for resumption
   };

   currentProgress.steps[step] = {
     completed: completed,
     timestamp: Date.now()
   };

   // Merge state data
   if (Object.keys(stateData).length > 0) {
     currentProgress.state = { ...currentProgress.state, ...stateData };
   }

   // Mark overall as completed if all steps are done
   if (completed && Object.keys(currentProgress.steps).length === Object.keys(PROCESSING_STEPS).length) {
     currentProgress.completed = true;
     currentProgress.endTime = Date.now();
   }

   await gmSet(key, JSON.stringify(currentProgress));
 }

 async function clearProcessingProgress(leadID) {
   const key = LS_PREFIX_PROGRESS + leadID;
   await GM_deleteValue(key);
 }

 async function getNextIncompleteStep(leadID) {
   const progress = await getProcessingProgress(leadID);
   if (!progress) return null;

   for (const step of Object.values(PROCESSING_STEPS)) {
     if (!progress.steps[step] || !progress.steps[step].completed) {
       return step;
     }
   }
   return null; // All steps completed
 }

 /***** Active lead monitoring and recovery system                  */
 let heartbeatTimer = null;

 async function registerActiveLead(leadID, url) {
   const key = LS_PREFIX_ACTIVE + leadID;
   const registryKey = LS_PREFIX_REGISTRY;

   // Register this lead as active
   const activeData = {
     leadID: leadID,
     url: url,
     registeredAt: Date.now(),
     lastHeartbeat: Date.now(),
     status: 'processing'
   };

   await gmSet(key, JSON.stringify(activeData));

   // Add to global registry
   const registry = JSON.parse(await gmGet(registryKey, '{}'));
   registry[leadID] = {
     registeredAt: Date.now(),
     url: url
   };
   await gmSet(registryKey, JSON.stringify(registry));

   console.log('[AutoColorCoder] Registered lead ' + leadID + ' as active');
 }

 async function unregisterActiveLead(leadID) {
   const key = LS_PREFIX_ACTIVE + leadID;
   const registryKey = LS_PREFIX_REGISTRY;

   // Remove from active tracking
   await GM_deleteValue(key);

   // Remove from global registry
   const registry = JSON.parse(await gmGet(registryKey, '{}'));
   delete registry[leadID];
   await gmSet(registryKey, JSON.stringify(registry));

   console.log('[AutoColorCoder] Unregistered lead ' + leadID + ' from active tracking');
 }

 async function updateHeartbeat(leadID) {
   const key = LS_PREFIX_ACTIVE + leadID;
   const activeData = await gmGet(key);
   if (!activeData) return false;

   const data = JSON.parse(activeData);
   data.lastHeartbeat = Date.now();
   await gmSet(key, JSON.stringify(data));

   return true;
 }

 async function startHeartbeat(leadID) {
   if (heartbeatTimer) {
     clearInterval(heartbeatTimer);
   }

   heartbeatTimer = setInterval(async () => {
     const success = await updateHeartbeat(leadID);
     if (!success) {
       console.log('[AutoColorCoder] Heartbeat failed for lead ' + leadID + ', stopping');
       stopHeartbeat();
     }
   }, HEARTBEAT_INTERVAL);

   console.log('[AutoColorCoder] Started heartbeat for lead ' + leadID);
 }

 async function stopHeartbeat() {
   if (heartbeatTimer) {
     clearInterval(heartbeatTimer);
     heartbeatTimer = null;
     console.log('[AutoColorCoder] Stopped heartbeat');
   }
 }

 async function getStaleLeads() {
   const registry = JSON.parse(await gmGet(LS_PREFIX_REGISTRY, '{}'));
   const staleLeads = [];

   for (const [leadID, data] of Object.entries(registry)) {
     const activeKey = LS_PREFIX_ACTIVE + leadID;
     const activeData = await gmGet(activeKey);

     if (!activeData) {
       // Lead not found in active tracking, consider it stale
       staleLeads.push({ leadID, ...data });
       continue;
     }

     const parsedData = JSON.parse(activeData);
     const timeSinceHeartbeat = Date.now() - parsedData.lastHeartbeat;

     if (timeSinceHeartbeat > STALE_THRESHOLD) {
       staleLeads.push({
         leadID,
         ...data,
         lastHeartbeat: parsedData.lastHeartbeat,
         timeSinceHeartbeat
       });
     }
   }

   return staleLeads;
 }

 async function recoverStaleLeads() {
   const staleLeads = await getStaleLeads();

   if (staleLeads.length === 0) {
    console.log('[AutoColorCoder] No stale leads found');
    return;
  }

  console.log('[AutoColorCoder] Found ' + staleLeads.length + ' stale leads to recover:');

  for (const lead of staleLeads) {
    const timeSince = lead.timeSinceHeartbeat ?
      Math.round(lead.timeSinceHeartbeat / 1000) + 's ago' : 'unknown';

    console.log('  - Lead ' + lead.leadID + ': ' + timeSince + ' (' + lead.url + ')');

    // Only recover if we're not already on this lead's page
    const currentLeadID = getObjectID();
    if (currentLeadID !== lead.leadID) {
      console.log('[AutoColorCoder] 🔄 Recovering lead ' + lead.leadID + '...');
       try {
        // Log stale lead for manual processing - don't disrupt current workflow
        console.warn(`[AutoColorCoder] ⚠️ STALE LEAD DETECTED: ${lead.leadID}`);
        console.warn(`[AutoColorCoder] 📍 URL: ${lead.url}`);
        console.warn(`[AutoColorCoder] ⏰ Last active: ${Math.round(lead.timeSinceHeartbeat / 1000)}s ago`);
        console.warn(`[AutoColorCoder] 💡 This lead needs manual attention - navigate to it to complete processing`);

        // Just clean up the tracking so it doesn't interfere
        await unregisterActiveLead(lead.leadID);
        await clearProcessingProgress(lead.leadID);

        console.log(`[AutoColorCoder] 🧹 Cleaned up tracking for stale lead ${lead.leadID} (ready for manual processing)`);
       } catch (error) {
         console.error('[AutoColorCoder] Failed to recover lead ' + lead.leadID + ':', error);
       }
     } else {
       console.log('[AutoColorCoder] Already on lead ' + lead.leadID + ', will resume processing');
     }
   }
 }
 /* House-keeping at load */
 purgeOldest(LS_PREFIX_TINY, KEEP_TINY);
 purgeOldest(LS_PREFIX_DONE, KEEP_DONE);
 purgeOldest(LS_PREFIX_PROGRESS, KEEP_PROGRESS);
 purgeOldest(LS_PREFIX_ACTIVE, KEEP_ACTIVE);

 /***** 2.  Network retry wrapper                                      */
 async function withRetry(fn, attempts = 4, baseDelay = 500) {
   for (let i = 0; i < attempts; i++) {
     try { return await fn(); }
     catch (e) {
       if (i === attempts - 1) throw e;
       const delay = baseDelay * 2 ** i + Math.random()*200;
       await new Promise(r => setTimeout(r, delay));
     }
   }
 }


 /***** 3.  Memory watchdog                                            */
// const BOOT_TS = Date.now();
// const MAX_TAB_AGE = 2 * 60 * 60 * 1000;     // 2 hours
 //setInterval(() => {
//   const age = Date.now() - BOOT_TS;
//   if (!window.closewindow && age > MAX_TAB_AGE) {
//     console.log('[ACC] page >2 h old, reloading to free memory');
//     location.reload();
//   }
//   if (typeof performance !== 'undefined' && performance.memory &&
//       typeof performance.memory.usedJSHeapSize === 'number' &&
//       performance.memory.usedJSHeapSize > 350_000_000) {
//     console.log('[ACC] heap >350 MB, reloading');
//     location.reload();
//   }
 //}, 30_000);
//*/

 /***** 4.  Global unhandled-promise guard                             */
 window.addEventListener('unhandledrejection', ev => {
   console.error('[ACC] Unhandled rejection:', ev.reason);
   // swallow so script keeps running
   ev.preventDefault?.();
 });

 /***** 5.  Helpers you'll call below                                  */
 function markLeadDone(id) {
   // stored twice: fast-lookup bit in localStorage, permanent log in GM_
   safeLocalSet(LS_PREFIX_DONE + id, '1');
   gmSet(LS_PREFIX_DONE + id, Date.now());
 }
 async function zipCache(zip, fetcher) {
   const key = LS_PREFIX_ZIP + zip;
   let cached = await gmGet(key);
   if (cached) return cached;

   const data = await fetcher();

   const slot = (await gmGet('_zip_ring_idx', 0)) % ZIP_RING;
   const ptrKey = '_zip_ptr_' + slot;             // tells us which real key sits in this slot
   const oldRealKey = await gmGet(ptrKey);
   if (oldRealKey && oldRealKey !== key) await GM_deleteValue(oldRealKey);

   await gmSet(key, data);                        // store the fresh result
   await gmSet(ptrKey, key);                      // remember which ZIP is in this slot
   await gmSet('_zip_ring_idx', slot + 1);        // advance the ring
   return data;
 }
/**********************************************************************/

    // Configuration with defaults
    let checkInterval = null;
    let statusUpdated = false;
    let fixingfields = false;
    let closewindow = GM_getValue('closewindow', true);
    let leadModified = false;
    let debugMode = GM_getValue('debugMode', false);
    // <ï¿½ Whether to automatically attach a questionnaire to the lead
    let addQuestionnaire = GM_getValue('addQuestionnaire', false);

    // Register menu commands
    GM_registerMenuCommand('Toggle Auto Close Window', function() {
        closewindow = !closewindow;
        GM_setValue('closewindow', closewindow);
        alert(`Auto Close Window is now ${closewindow ? 'enabled' : 'disabled'}`);
    });

    GM_registerMenuCommand('Toggle Debug Mode', function() {
        debugMode = !debugMode;
        GM_setValue('debugMode', debugMode);
        alert(`Debug Mode is now ${debugMode ? 'enabled' : 'disabled'}`);
    });

    // <ï¿½ Menu-command to toggle automatic questionnaire attachment
    GM_registerMenuCommand('Toggle Add Questionnaire', function () {
        addQuestionnaire = !addQuestionnaire;
        GM_setValue('addQuestionnaire', addQuestionnaire);
        alert(`Add Questionnaire is now ${addQuestionnaire ? 'enabled' : 'disabled'}`);
    });


    // Menu command to clear processing progress for current lead
    GM_registerMenuCommand('Clear Processing Progress', function() {
        if (!leadID) {
            alert('No lead ID found on this page.');
            return;
        }

        getProcessingProgress(leadID).then(progress => {
            if (!progress) {
                alert('No processing progress found for lead ' + leadID + '.');
                return;
            }

            const confirmClear = confirm(
                'Clear processing progress for lead ' + leadID + '?\n\n' +
                'Started: ' + new Date(progress.startTime).toLocaleString() + '\n' +
                'Steps completed: ' + Object.keys(progress.steps).length + '\n\n' +
                'This will allow the script to restart processing from the beginning.'
            );

            if (confirmClear) {
                clearProcessingProgress(leadID).then(() => {
                    alert('Processing progress cleared for lead ' + leadID + '. Refresh the page to restart processing.');
                }).catch(error => {
                    console.error('[AutoColorCoder] Failed to clear progress:', error);
                    alert('Error clearing processing progress.');
                });
            }
        }).catch(error => {
            console.error('[AutoColorCoder] Failed to get progress:', error);
            alert('Error retrieving processing progress.');
        });
    });

    // Menu command to check for and recover stale leads
    GM_registerMenuCommand('Check for Failed Leads', function() {
        console.log('[AutoColorCoder] 🔍 Checking for failed leads...');
        recoverStaleLeads().catch(error => {
            console.error('[AutoColorCoder] Recovery check failed:', error);
        });
    });


    // Menu command to show active leads status
    GM_registerMenuCommand('Show Active Leads Status', function() {
        gmGet(LS_PREFIX_REGISTRY, '{}').then(registryStr => {
            const registry = JSON.parse(registryStr);
            const activeLeads = Object.keys(registry);

            if (activeLeads.length === 0) {
                alert('No active leads currently being processed.');
                return;
            }

            let statusMessage = 'Active Leads: ' + activeLeads.length + '\n\n';

            // Process each lead
            const promises = activeLeads.map(leadID => {
                const activeKey = LS_PREFIX_ACTIVE + leadID;
                return gmGet(activeKey).then(activeData => {
                    if (activeData) {
                        const data = JSON.parse(activeData);
                        const timeSince = Math.round((Date.now() - data.lastHeartbeat) / 1000);
                        return 'Lead ' + leadID + ': ' + timeSince + 's ago\n';
                    } else {
                        return 'Lead ' + leadID + ': No active data\n';
                    }
                });
            });

            Promise.all(promises).then(messages => {
                statusMessage += messages.join('');
                alert(statusMessage);
            }).catch(error => {
                console.error('[AutoColorCoder] Failed to get active leads status:', error);
                alert('Error retrieving active leads status.');
            });
        }).catch(error => {
            console.error('[AutoColorCoder] Failed to get registry:', error);
            alert('Error retrieving registry data.');
        });
    });

    // Debug logging function
    function debugLog(...args) {
        if (debugMode) {
            console.log('[AutoColorCoder Debug]', ...args);
        }
    }

    // Check if we should run the script
    function shouldRunScript() {
        const currentPath = window.location.pathname;
        // Run only on individual lead pages, not the main leads listing
        return currentPath.match(/^\/admin\/leads\/\d+\/?$/);
    }

    // Check if we're on any Pixifi admin page where recovery might be useful
    function isOnPixifiAdminPage() {
        const currentPath = window.location.pathname;
        return currentPath.startsWith('/admin/');
    }

    // Recovery system that runs on any Pixifi admin page (fully automated)
    async function runRecoveryCheck() {
        if (!isOnPixifiAdminPage()) return;

        console.log('[AutoColorCoder] 🔍 Running automated recovery check on admin page...');
        await recoverStaleLeads();
    }

    // Configuration & Mappings
    const clientID = "12295";
    const leadID = getObjectID();

    const brandMappings = {
        BOOKING: ["DC", "MD", "VA", "NY", "NJ", "PA", "DE", "CT"],
        SCHEDULE: ["GA", "MA", "NH", "RI", "NC", "SC", "MI", "KY", "FL", "IL", "MN", "IN"],
        RESERVE: ["TX", "KS", "MO", "CO", "AZ", "NV", "OR", "WA"],
        SESSIONS: ["CA"],
    };

    // Connecticut ZIP code brand exceptions
    const ctZipBrandExceptions = {
        bookingMinZip: 6400, // 06400 and higher
        scheduleMaxZip: 6399 // 06399 and lower
    };

    const brandMapping = {
        11473: "BOOKING",
        15793: "SESSIONS",
        18826: "SCHEDULE",
        19647: "RESERVE",
        11634: "(EDITING) EAST/CENTRAL SMP",
        17159: "(EDITING) WEST SMP",
        14652: "Sweet Me Models",
        17956: "SMP JOBS",
        21064: "PC -SMP",
        17187: "ONBOARDING SMP",
        15121: "XXX DEFUNCT BRAND NAME XXX",
        17999: "Sweet Me Gift Cards",
        18626: "Sweet Me Staff Vacation Calendar",
        19691: "MELISSA TEST BRAND - DO NOT USE",
    };

    const timezoneMappings = {
        BOOKING: "(GMT-05:00) Eastern Time (US & Canada)",
        SCHEDULE: {
            default: "(GMT-05:00) Eastern Time (US & Canada)",
            exceptions: {
                IL: "(GMT-06:00) Central Time (US & Canada)",
                MN: "(GMT-06:00) Central Time (US & Canada)",
            },
        },
        RESERVE: {
            default: "(GMT-06:00) Central Time (US & Canada)",
            exceptions: {
                CO: "(GMT-07:00) Mountain Time (US & Canada)",
                AZ: "(GMT-07:00) Arizona",
                NV: "(GMT-08:00) Pacific Time (US & Canada); Tijuana",
                OR: "(GMT-08:00) Pacific Time (US & Canada); Tijuana",
            },
        },
        SESSIONS: "(GMT-08:00) Pacific Time (US & Canada); Tijuana",
    };

    const stateMapping = {
        "AL": 1,
        "AK": 2,
        "AZ": 3,
        "AR": 4,
        "CA": 5,
        "CO": 6,
        "CT": 7,
        "DE": 8,
        "DC": 9,
        "FL": 10,
        "GA": 11,
        "HI": 12,
        "ID": 13,
        "IL": 14,
        "IN": 15,
        "IA": 16,
        "KS": 17,
        "KY": 18,
        "LA": 19,
        "ME": 20,
        "MD": 21,
        "MA": 22,
        "MI": 23,
        "MN": 24,
        "MS": 25,
        "MO": 26,
        "MT": 27,
        "NE": 28,
        "NV": 29,
        "NH": 30,
        "NJ": 31,
        "NM": 32,
        "NY": 33,
        "NC": 34,
        "ND": 35,
        "OH": 36,
        "OK": 37,
        "OR": 38,
        "PA": 39,
        "RI": 40,
        "SC": 41,
        "SD": 42,
        "TN": 43,
        "TX": 44,
        "UT": 45,
        "VT": 46,
        "VA": 47,
        "WA": 48,
        "WV": 49,
        "WI": 50,
        "WY": 51,
        "PR": 52,
        "AA": 53,
        "AE": 56,
        "AF": 54,
        "CA-AF": 55,
        "ME-AF": 57,
        "AP": 58
    };

    const timezone_id_Mapping = {
        "(GMT-08:00) Pacific Time (US & Canada); Tijuana": "America/Los_Angeles",
        "(GMT-07:00) Arizona": "America/Phoenix",
        "(GMT-07:00) Mountain Time (US & Canada)": "America/Denver",
        "(GMT-06:00) Central Time (US & Canada)": "America/Chicago",
        "(GMT-05:00) Eastern Time (US & Canada)": "America/New_York",
    };

    // Utility: Wait for editable field to be ready
    function waitForEditable(selector, retries = 10) {
        return new Promise(resolve => {
            function check(remaining) {
                const el = $(selector).data('editable');
                if (el) resolve(el);
                else if (remaining > 0) setTimeout(() => check(remaining - 1), 500);
                else resolve(null);
            }
            check(retries);
        });
    }

    // At the top of the script, after DOM is ready, capture the initial notes value
    let initialNotesValue = '';
    function getInitialNotesValue() {
        const notesElement = document.getElementById('af_leadNotes');
        if (!notesElement) console.log('[AutoColorCoder] af_leadNotes element not found!');
        const notesEditable = notesElement && $(notesElement).data('editable');
        let notesValue = notesEditable && notesEditable.value;
        if (!notesValue || notesValue.trim() === '') {
            notesValue = notesElement && notesElement.textContent ? notesElement.textContent.trim() : '';
        }
        if (notesValue && notesValue.trim().toLowerCase() === 'empty') return '';
        return notesValue || '';
    }

    /**
     * Extract the lead object ID from the URL.
     * @returns {string|null} The lead ID or null if not found.
     */
    function getObjectID() {
        const match = window.location.href.match(/leads\/(\d+)/);
        return match ? match[1] : null;
    }

    /***** 0.  USPS API Token helper *****************************************/
    // Users must obtain an OAuth 2.0 access token from the USPS developer portal
    // and paste it once via the Tampermonkey menu.  We store it with GM_setValue
    // so follow-up page loads can reuse it.

    const USPS_TOKEN_KEY = 'usps_access_token';

    GM_registerMenuCommand('Set USPS API Token', async function () {
        const current = await GM_getValue(USPS_TOKEN_KEY, '');
        const token = prompt('Paste USPS OAuth "Bearer" token', current || '');
        if (token !== null) {
            await GM_setValue(USPS_TOKEN_KEY, token.trim());
            alert('USPS token saved.');
        }
    });

    /**
     * Fetch city/state for a ZIP using USPS Addresses 3.0 City-State endpoint.
     * Requires a valid OAuth bearer token saved under USPS_TOKEN_KEY.
     */
    async function fetchCityState(zipCode) {
        const zippoUrl = `https://api.zippopotam.us/us/${zipCode}`;

        // Helper  return city/state object if the JSON matches Zippopotam format
        const parseZippo = (j) => {
            if (j && j.places && j.places.length) {
                const place = j.places[0];
                return {
                    city: place["place name"],
                    state: place["state abbreviation"]
                };
            }
            return null;
        };

        /*
         * 1ï¿½  USPS City-State API (preferred). Automatically refreshes the
         *     OAuth token when needed. Falls back to Zippopotam on error.
         */
        try {
            const token = await getUspsAccessToken();
            if (token) {
                const apiUrl = `https://apis.usps.com/addresses/v3/city-state?ZIPCode=${zipCode}`;
                console.log(`[AutoColorCoder] ï¿½ USPS City-State GET ${apiUrl}`);
                const res = await gmFetch(apiUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
                console.log(`[AutoColorCoder] ï¿½ USPS status ${res.status}`);
                if (res.status === 200) {
                    const d = JSON.parse(res.responseText);
                    console.log('[AutoColorCoder] USPS payload:', d);
                    if (d && d.city && d.state) {
                        return { city: toTitleCase(d.city), state: d.state };
                    }
                } else if (res.status === 401 || res.status === 403) {
                    console.warn('[AutoColorCoder] USPS token invalid');
                    await GM_deleteValue(USPS_TOKEN_KEY); // force re-auth next time
                    console.warn('[AutoColorCoder] USPS token invalid (', res.status, '), will fall back.');
                } else {
                    console.warn('[AutoColorCoder] USPS API error:', res.status, res.statusText);
                }
            }
        } catch (e) {
            console.warn('[AutoColorCoder] USPS lookup failed:', e);
        }

        /*
         * 2ï¿½  Zippopotam.us  try ordinary fetch then GM_fetch.
         */
        try {
            const resp = await fetch(zippoUrl);
            console.log(`[AutoColorCoder] ï¿½ Zippopotam fetch ${zippoUrl}`);
            if (resp.ok) {
                const loc = parseZippo(await resp.json());
                console.log('[AutoColorCoder] ï¿½ Zippopotam OK', loc);
                if (loc) return loc;                     //  success via fetch()
            } else {
                console.warn('[AutoColorCoder] Zippopotam fetch non-OK:', resp.status);
            }
        } catch (e) {
            console.warn('[AutoColorCoder] Zippopotam network error (fetch):', e);
        }

        // = Retry with GM_fetch (CSP-free)
        try {
            const res = await gmFetch(zippoUrl, { headers: { 'Accept': 'application/json' } });
            console.log('[AutoColorCoder] ï¿½ Zippopotam gmFetch');
            if (res.status === 200) {
                const loc = parseZippo(JSON.parse(res.responseText));
                console.log('[AutoColorCoder] ï¿½ Zippopotam gmFetch OK', loc);
                if (loc) return loc;
            } else {
                console.warn('[AutoColorCoder] Zippopotam gmFetch non-OK:', res.status);
            }
        } catch (e) {
            console.warn('[AutoColorCoder] Zippopotam network error (gmFetch):', e);
        }

        return null;
    }

    /**
     * Preprocess a data-value string to ensure it can be parsed as JSON.
     * @param {string} dataValue
     * @returns {string} Preprocessed JSON string.
     */
    function preprocessDataValue(dataValue) {
        return dataValue
            .replace(/'/g, '"')
            .replace(/([{,])\s*([^":]+)\s*:/g, '$1"$2":');
    }

    /**
     * Determine the proper timezone string for a given state and brand.
     * @param {string} state - State abbreviation
     * @param {string} brand - Brand key
     * @returns {string|null} The timezone string or null if not found.
     */
    function getTimezoneForStateAndBrand(state, brand) {
        const brandData = timezoneMappings[brand];
        if (typeof brandData === "string") {
            return brandData;
        } else if (typeof brandData === "object") {
            if (brandData.exceptions && brandData.exceptions[state]) {
                return brandData.exceptions[state];
            }
            return brandData.default;
        }
        console.error("Timezone not found for brand and state:", brand, state);
        return null;
    }

    /**
     * Submit updates to Pixifi using a given URL and body.
     * @param {string} url - The endpoint URL
     * @param {URLSearchParams} bodyData - The data to send
     * @returns {Promise<boolean>} True if successful, false otherwise.
     */
    async function submitUpdate(url, bodyData) {
        try {
            const response = await withRetry(() => fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString()
            }));

            if (!response.ok) {
                console.error(`Failed to submit update: ${response.statusText}`);
                return false;
            }

            const text = await response.text();
            console.log("Update successful:", text);
            return true;
        } catch (error) {
            console.error("Error submitting update:", error);
            return false;
        }
    }

    /**
     * Set priority based on due date.
     */
    async function setPriorityBasedOnDueDate() {
        const dueDateElement = document.getElementById("questitem_8225")?.querySelector(".rightTitle");
        if (!dueDateElement) {
            console.error("Due date element not found for priority setting.");
            return;
        }

        const dueDateText = dueDateElement.textContent.trim();
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

        await changePriority(priority);
    }

    /**
     * Change the priority of the lead.
     * @param {string} priority - Priority level (1, 2, or 3)
     */
    async function changePriority(priority) {
        if (!clientID || !leadID) {
            console.error("Client ID or Lead ID is missing.");
            return;
        }

        try {
            const response = await withRetry(() => fetch("/admin/data/updateLeadPriority/", {
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
            }));

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

    /**
     * Update the priority display element on the page.
     * @param {string} newPriorityHtml
     */
    function updatePriorityDisplay(newPriorityHtml) {
        const currentPriorityDiv = document.getElementById("current_priority");
        if (currentPriorityDiv) {
            if (newPriorityHtml && newPriorityHtml.trim()) {
                try {
                    currentPriorityDiv.innerHTML = newPriorityHtml;
                    console.log("Priority updated successfully on the page.");
                } catch (domError) {
                    console.error("[AutoColorCoder] Failed to set priority HTML:", domError);
                    console.error("[AutoColorCoder] HTML content:", newPriorityHtml.substring(0, 200) + "...");
                }
            } else {
                console.warn("[AutoColorCoder] Priority HTML is empty");
            }
        } else {
            console.error("Failed to find the current priority div.");
        }
    }

    /**
     * Determine the appropriate status based on the due date and Manhattan flag.
     * @param {string} dueDateText
     * @param {boolean} isManhattan
     * @returns {string|null} The status ID or null if not determined.
     */
    function determineStatus(dueDateText, isManhattan) {
        const [month, day, year] = dueDateText.split("/");
        const dueDate = new Date(Date.UTC(year, month - 1, day));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

        console.log('Determining status:', { dueDate, todayUTC, isManhattan });

        if (dueDate <= todayUTC) {
            return isManhattan ? "18563" : "18561"; // Past due or today
        } else {
            return isManhattan ? "18564" : "18562"; // Future date
        }
    }

    /**
     * Handle duplicate clients by fetching events and possibly updating the event name.
     * @param {HTMLElement} duplicateBox
     */
    async function handleDuplicateClient(duplicateBox) {
        const clientLink = duplicateBox.querySelector("a[href*='/admin/clients/']");
        if (!clientLink) return '';

        const clientHref = clientLink.getAttribute('href');
        const matched = clientHref.match(/\/admin\/clients\/(\d+)\//);
        const existingClientID = matched ? matched[1] : null;

        if (!existingClientID) return '';

        console.log("Existing client found:", existingClientID);
        const eventsHTML = await fetchEventsForExistingClient(existingClientID);
        if (!eventsHTML) {
            console.error("No events returned for existing client.");
            return '';
        }

        console.log("Events fetched for client:", eventsHTML);
        const parsedEvents = parseEventsFromHTML(eventsHTML);
        const recentEvent = findMostRecentNonCanceledEvent(parsedEvents);

        if (recentEvent) {
            const staffHTML = await fetchStaffForEvent(recentEvent.id);
            if (staffHTML) {
                const photographerName = getPhotographerName(staffHTML);
                if (photographerName) {
                    console.log("Photographer found:", photographerName);
                    return photographerName;
                } else {
                    console.log("No photographer found for the most recent non-canceled event.");
                }
            } else {
                console.log("No staff listing fetched for event:", recentEvent.id);
            }
        } else {
            console.log("No non-canceled events found for this previous client. Prepending event name with 'NOT PC CNL'.");
            return 'NOT PC CNL';
        }
        return '';
    }

    /**
     * Fetch events for an existing client.
     * @param {string} existingClientID
     * @returns {Promise<string|null>} The HTML for events or null if not found.
     */
    async function fetchEventsForExistingClient(existingClientID) {
        const bodyData = new URLSearchParams({
            clientID: clientID,
            customerID: existingClientID
        });

        try {
            const response = await withRetry(() => fetch("https://www.pixifi.com/admin/fn/events/getEventsListingForClient/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            }));

            if (!response.ok) {
                console.error("Failed to fetch events for existing client:", response.statusText);
                return null;
            }

            const text = await response.text();
            const parts = text.split("SUCCESS{|}");
            if (parts.length > 1) {
                const eventsHTML = parts[1].trim();
                return eventsHTML;
            } else {
                console.error("Unexpected response format for events fetch:", text);
                return null;
            }

        } catch (error) {
            console.error("Error fetching events for existing client:", error);
            return null;
        }
    }

    /**
     * Parse events from the returned HTML string.
     * @param {string} eventsHTML
     * @returns {Array<{id: string, date: Date, canceled: boolean}>}
     */
    function parseEventsFromHTML(eventsHTML) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(eventsHTML, 'text/html');

        const eventDivs = doc.querySelectorAll('.normalThinRowStyle, .alternateThinRowStyleLight');
        const events = [];

        const monthMap = {
            Jan: 0,
            Feb: 1,
            Mar: 2,
            Apr: 3,
            May: 4,
            Jun: 5,
            Jul: 6,
            Aug: 7,
            Sep: 8,
            Oct: 9,
            Nov: 10,
            Dec: 11
        };

        eventDivs.forEach(div => {
            const link = div.querySelector('a[href*="/admin/events/"]');
            if (!link) return;

            const eventURL = link.getAttribute('href');
            const eventIDMatch = eventURL.match(/\/admin\/events\/(\d+)\//);
            const eventID = eventIDMatch ? eventIDMatch[1] : null;

            const monthEl = div.querySelector('.dateDisplay .month');
            const dayEl = div.querySelector('.dateDisplay .day');
            const yearEl = div.querySelector('.dateDisplay .year');
            if (!monthEl || !dayEl || !yearEl) return;

            const monthName = monthEl.textContent.trim();
            const day = parseInt(dayEl.textContent.trim(), 10);
            const year = parseInt(yearEl.textContent.trim(), 10);

            const month = monthMap[monthName] !== undefined ? monthMap[monthName] : null;
            if (month === null) return;

            const eventDate = new Date(year, month, day);

            const canceled = div.textContent.includes("SESSION CANCELED");
            events.push({
                id: eventID,
                date: eventDate,
                canceled
            });
        });

        return events;
    }

    /**
     * Find the most recent non-canceled event from a list of events.
     * @param {Array} events
     * @returns {Object|null} The most recent non-canceled event or null if none.
     */
    function findMostRecentNonCanceledEvent(events) {
        const nonCanceled = events.filter(e => !e.canceled);
        nonCanceled.sort((a, b) => b.date - a.date);
        return nonCanceled.length > 0 ? nonCanceled[0] : null;
    }

    /**
     * Fetch staff for a given event.
     * @param {string} eventID
     * @returns {Promise<string|null>} The staff HTML or null if not found.
     */
    async function fetchStaffForEvent(eventID) {
        if (!eventID) return null;

        const bodyData = new URLSearchParams({
            clientID: clientID,
            eventID: eventID,
            page: "1"
        });

        try {
            const response = await withRetry(() => fetch("https://www.pixifi.com/admin/fn/events/refreshEventStaffListing/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            }));

            if (!response.ok) {
                console.error("Failed to fetch staff listing:", response.statusText);
                return null;
            }

            const text = await response.text();
            const parts = text.split("SUCCESS{|}");
            if (parts.length > 1) {
                return parts[1].trim();
            }
            return null;
        } catch (error) {
            console.error("Error fetching staff for event:", error);
            return null;
        }
    }

    /**
     * Extract the photographer's name from the staff HTML.
     * @param {string} staffHTML
     * @returns {string|null} Photographer name or null if not found.
     */
    function getPhotographerName(staffHTML) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(staffHTML, 'text/html');
        const staffDivs = doc.querySelectorAll('[id^="staff_"]');

        for (const staffDiv of staffDivs) {
            const textContent = staffDiv.textContent.toLowerCase();
            if (textContent.includes("photographer")) {
                const strongEl = staffDiv.querySelector('strong');
                if (strongEl) {
                    return strongEl.textContent.trim();
                }
            }
        }
        return null;
    }

    /**
     * Update the event name element by prepending a given prefix and 'Notes' if there were original notes.
     * @param {string} prefix - The prefix to add to the event name (e.g., 'PC ...', 'NOT PC CNL', etc.)
     * @param {string} pcPart - The PC-specific part of the event name
     */
    async function updateEventName(prefix, pcPart = '') {
        console.log("fixing Event Name");
        console.log("Received prefix:", prefix, "Received pcPart:", pcPart);

        const eventNameElement = document.getElementById("af_leadCustomEventName");
        const notesEditable = await waitForEditable('[id=\"af_leadNotes\"]');
        const eventNameEditable = await waitForEditable('#af_leadCustomEventName');
        const notesElement = document.getElementById('af_leadNotes');
        if (!eventNameElement || !notesElement || !eventNameEditable) {
            console.log('[updateEventName] Missing one or more elements:', {eventNameElement, notesElement, eventNameEditable});
            return;
        }

        let currentEventName = eventNameElement.getAttribute("data-value") || eventNameElement.textContent.trim();
        if (currentEventName === "Empty") {
            currentEventName = "";
        }

        console.log('[updateEventName] currentEventName before stripping:', currentEventName);

        // 1ï¿½ Patch: Remove any leading "PC &" phrase (everything until the first double-space or end of line)
        currentEventName = currentEventName
            .replace(/^CCC MAN\s+/i, '')
            .replace(/^NOTES\s+/i, '')
            .replace(/^PC\s+.+?(?=\s{2,}|$)/i, '')
            .trim();
        console.log('[updateEventName] currentEventName after stripping:', currentEventName);

        // Build the new name: Combine the passed prefix, pcPart, and the stripped base name
        let prefixes = [];
        if (prefix) prefixes.push(prefix);
        if (pcPart) prefixes.push(pcPart);
        console.log('Prefixes to join:', prefixes);

        // Combine prefixes with the base name
        let newEventName = [...prefixes, currentEventName].filter(Boolean).join(' ');

        // Clean up any double spaces
        newEventName = newEventName.replace(/\s+/g, ' ').trim();

        console.log('[updateEventName] Setting event name to:', newEventName);

        // Only update if the event name is actually different
        const originalEventName = eventNameElement.getAttribute("data-value") || eventNameElement.textContent.trim();
        if (newEventName === originalEventName.replace(/^Empty$/,'')) {
            console.log('[updateEventName] Event name already correct, skipping update.');
            return;
        }

        eventNameEditable.setValue(newEventName);
        var bodyData = new URLSearchParams({
            name: "af_leadCustomEventName",
            value: newEventName,
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
                console.log("Event name successfully updated to:", newEventName);
                leadModified = true;
            } else {
                console.error("Failed to update event name:", response.statusText);
            }
        } catch (error) {
            console.error("Error attempting to update event name:", error);
        }

        // 2ï¿½ Patch: Improved PC note duplicate detection
        if (pcPart) { // Check if pcPart is not empty
            await assignStaffToLead(clientID, leadID, "20040", "3503");
            await refreshLeadStaffListing(clientID, leadID);
            let PCNote = `PHOTOGRAPHER: This is a previous client. You will receive an email from clients@sweetmephotography with helpful information from the previous session and a link to the previous order.`
            let currentNotes =
                (notesEditable && notesEditable.value) ||          // value once editable ready
                notesElement.textContent || '';                    // fallback to rendered text
            if (currentNotes && currentNotes.includes(PCNote)) {
                console.log("PC note already present. Skipping re-adding.");
            } else {
                // Sanitize initial notes to prevent HTML injection issues
                const sanitizedInitialNotes = initialNotesValue ? initialNotesValue.replace(/</g, '&lt;').replace(/>/g, '&gt;') : "";
                var previousnote = sanitizedInitialNotes ? sanitizedInitialNotes + "<br>" : "";
                var newnote = "<p>" + previousnote + PCNote + "</p>";
                if (notesEditable && notesEditable.value === (previousnote + PCNote)) {
                    console.log('[updateEventName] Notes already correct, skipping update.');
                } else {
                    if (notesEditable) notesEditable.setValue(previousnote + PCNote);
                    var bodyData2 = new URLSearchParams({
                        name: "af_leadNotes",
                        value: newnote,
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
                            body: bodyData2.toString(),
                            credentials: "include"
                        });
                        if (response.ok) {
                            console.log("Notes successfully updated with PC info.");
                            leadModified = true;
                        } else {
                            console.error("Failed to update event notes with PC info:", response.statusText);
                        }
                    } catch (error) {
                        console.error("Error attempting to update notes with PC info:", error);
                    }
                }
            }
        }
    }

    async function assignStaffToLead(clientID, leadID, staffID, roleID) {
        const bodyData = new URLSearchParams({
            clientID: clientID,
            leadID: leadID,
            staffID: staffID,
            roleID: roleID
        });

        try {
            const response = await withRetry(() => fetch("https://www.pixifi.com/admin/fn/leads/assignStaffToLead/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            }));

            if (response.ok) {
                console.log("Staff successfully assigned to lead.");
                leadModified = true;
            } else {
                console.error("Failed to assign staff to lead:", response.statusText);
            }
        } catch (error) {
            console.error("Error attempting to assign staff to lead:", error);
        }
    }

    async function refreshLeadStaffListing(clientID, leadID) {
        const bodyData = new URLSearchParams({
            clientID: clientID,
            leadID: leadID
        });

        try {
            const response = await withRetry(() => fetch("https://www.pixifi.com/admin/fn/leads/refreshLeadStaffListing/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: bodyData.toString(),
                credentials: "include"
            }));

            if (response.ok) {
                const text = await response.text();
                const [status, html] = text.split("{|}");

                if (status === "SUCCESS") {
                    const staffListingElement = document.getElementById("staffListing");
                    if (staffListingElement) {
                        if (html && html.trim()) {
                            try {
                                staffListingElement.innerHTML = html;
                                console.log("Lead staff listing successfully refreshed.");
                                leadModified = true;
                            } catch (domError) {
                                console.error("[AutoColorCoder] Failed to set staff listing HTML:", domError);
                                console.error("[AutoColorCoder] HTML content:", html.substring(0, 200) + "...");
                            }
                        } else {
                            console.warn("[AutoColorCoder] Staff listing HTML is empty");
                        }
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

    /**
     * Perform geocoding and update address, brand, timezone fields if needed.
     */
    async function geocodeAndFixFields() {
        console.log("geocodeAndFixFields")
        const addressElement = document.querySelector("a.editable-address");
        const brandElement = document.querySelector("a.editable-brand");
        const timezoneElement = document.querySelector("a.editable-timezone");
        if (!addressElement || !brandElement || !timezoneElement) {
            console.error("Required page elements for geocode not found.");
            return;
        }
        const dataValue = addressElement.getAttribute("data-value");
        if (!dataValue) {
            console.error("No data-value found in address field.");
            return;
        }
        let parsedValue;
        try {
            parsedValue = JSON.parse(preprocessDataValue(dataValue));
        } catch (error) {
            console.error("Error parsing data-value attribute:", error, dataValue);
            return;
        }
        // If already valid, skip geocode
        if (parsedValue.city && parsedValue.city !== "Not a valid Zip Code") {
            console.log("Address field is valid. Skipping geocode.");
            return;
        }
        // Geocode
        const zipCode = parsedValue.postal;
        const baseZipCode = zipCode.split('-')[0];
        console.log(`Running geocoder for ZIP code: ${baseZipCode}`);
        const location = await zipCache(baseZipCode, () => fetchCityState(baseZipCode));
        if (!location) {
            console.error("Could not fetch location for ZIP code:", baseZipCode);
            return;
        }
        console.log("Fetched location:", location);
        const stateId = stateMapping[location.state] || "";
        if (!stateId) {
            console.error("No state ID found for state:", location.state);
            return;
        }
        if (!leadID) {
            console.error("Unable to extract objectID from URL.");
            return;
        }
        // Update address
        const addressData = new URLSearchParams({
            name: "af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry{||}af_leadBrandID{||}af_leadTimezone",
            "value[address]": "",
            "value[address1]": "",
            "value[city]": location.city,
            "value[state]": stateId,
            "value[postal]": baseZipCode,
            "value[country]": "229",
            pk: "",
            clientID: clientID,
            objectID: leadID
        });
        if (!await submitUpdate("https://www.pixifi.com/admin/data/af/leaddata/", addressData)) {
            console.error("Failed to update address.");
            return;
        } else {
            leadModified = true;
        }
        addressElement.textContent = `${location.city}, ${location.state} ${baseZipCode}`;
        const addressEditable = await waitForEditable('[id="af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry"]');
        if (addressEditable) addressEditable.setValue({
            address: '',
            address1: '',
            city: location.city,
            state: stateId,
            postal: baseZipCode,
            country: '229'
        });
        // Update brand
        let brand = "BOOKING"; // Default to BOOKING as it's more common in the mappings

        if (location.state === "CT") {
            const zipNum = parseInt(baseZipCode, 10);
            if (zipNum >= ctZipBrandExceptions.bookingMinZip) {
                brand = "BOOKING";
            } else if (zipNum <= ctZipBrandExceptions.scheduleMaxZip) {
                brand = "SCHEDULE";
            }
            console.log(`CT ZIP ${baseZipCode} determined brand: ${brand}`);
        } else {
            for (const [brandKey, states] of Object.entries(brandMappings)) {
                if (states.includes(location.state)) { brand = brandKey; break; }
            }
        }

        const brandid = Object.keys(brandMapping).find(key => brandMapping[key] === brand);
        if (brandid) {
            const brandData = new URLSearchParams({
                name: "af_leadBrandID",
                "value[brandID]": brandid,
                pk: "",
                clientID: clientID,
                objectID: leadID
            });
            if (await submitUpdate("https://www.pixifi.com/admin/data/af/leaddata/", brandData)) {
                brandElement.textContent = brand;
                leadModified = true;
            }
        }
        // Update timezone
        const timezone = getTimezoneForStateAndBrand(location.state, brand);
        if (!timezone) {
            console.error(`Missing timezone for state: ${location.state}, brand: ${brand}`);
            return;
        }
        if (timezone && timezone_id_Mapping[timezone]) {
            const timezoneData = new URLSearchParams({
                name: "af_leadTimezone",
                "value[timezone]": timezone_id_Mapping[timezone],
                pk: "",
                clientID: clientID,
                objectID: leadID
            });
            if (await submitUpdate("https://www.pixifi.com/admin/data/af/leaddata/", timezoneData)) {
                timezoneElement.textContent = timezone;
                leadModified = true;
            }
        }
    }

    /**
     * Update the status of the lead based on due date.
     * @returns {Promise<boolean>} True if status was updated.
     */
    async function updateStatusOfLead() {
        console.log("=== Starting updateStatusOfLead ===");
        const dueDateElement = document.getElementById("questitem_8225")?.querySelector(".rightTitle");
        if (!dueDateElement) {
            console.error("Due date element not found for status update.");
            return false;
        }
        console.log("Due date found:", dueDateElement.textContent);

        const statusValue = determineStatus(dueDateElement.textContent.trim(), isLeadManhattan());
        console.log('Determined status value:', { statusValue, dueDate: dueDateElement.textContent.trim() });

        // Query event overview for current status
        let serverStatus = null;
        try {
            console.log('Fetching current server status...');
            const bodyData = new URLSearchParams({
                clientID: clientID,
                customerType: 'lead',
                customerID: leadID
            });
            const res = await withRetry(() => fetch('/admin/fn/events/getEventOverviewWindow/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                body: bodyData.toString(),
                credentials: 'include'
            }));
            if (res.ok) {
                const text = await res.text();
                console.log('Server response:', text);
                const parts = text.split('SUCCESS{|}');
                if (parts.length > 1) {
                    const html = parts[1];
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const statusDiv = doc.querySelector('div[id$="_status"]');
                    if (statusDiv && statusDiv.id) {
                        serverStatus = statusDiv.id.replace('_status', '');
                        console.log('Current server status:', serverStatus);
                    }
                }
            }
        } catch (e) {
            console.warn('Could not fetch event overview for status', e);
        }

        if (serverStatus && serverStatus === statusValue) {
            console.log('Server status matches desired status, skipping update.');
            statusUpdated = true;
            return false;
        }

        // Only update status if current status is one of the questionnaire statuses and differs from the desired status
        const currentStatusElem = document.querySelector("#current_status > div");
        if (currentStatusElem) {
            const currentStatusID = currentStatusElem.id.replace("_status", "");
            const manageableStatuses = ["13426", "18561", "18562", "18563", "18564"];

            console.log('Status comparison:', {
                current: currentStatusID,
                desired: statusValue,
                isManageable: manageableStatuses.includes(currentStatusID)
            });

            if (!manageableStatuses.includes(currentStatusID)) {
                console.log("Lead status progressed beyond questionnaire, skipping update.");
                statusUpdated = true;
                return false;
            }
            if (currentStatusID === statusValue) {
                console.log("Status already matches desired value, skipping update.");
                statusUpdated = true;
                return false;
            }
        }

        if (statusValue && !statusUpdated) {
            console.log('Updating status to:', statusValue);
            const statusData = new URLSearchParams({clientID: clientID, leadID: leadID, statusID: statusValue});
            const statusRes = await withRetry(() => fetch("https://www.pixifi.com/admin/fn/leads/updateStatusOfLead/", {
                method: "POST",
                headers: {"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With": "XMLHttpRequest"},
                body: statusData.toString()
            }));
            if (statusRes.ok) {
                let statusText = await statusRes.text();
                console.log('Status update response:', statusText);
                const cleanStatusText = statusText.replace("SUCCESS{|}\t", "").trim();
                if (cleanStatusText) {
                    try {
                        document.querySelector("div#current_status").innerHTML = cleanStatusText;
                        console.log("Status updated successfully to:", statusValue);
                    } catch (domError) {
                        console.error("[AutoColorCoder] Failed to set status HTML:", domError);
                        console.error("[AutoColorCoder] HTML content:", cleanStatusText.substring(0, 200) + "...");
                    }
                } else {
                    console.warn("[AutoColorCoder] Status text is empty after cleaning");
                }
                statusUpdated = true;
                leadModified = true;
                return true;
            } else {
                console.error("Failed to update status:", statusRes.statusText);
            }
        }
        return false;
    }

    // Manhattan detection utility
    function isLeadManhattan() {
        /* 1ï¿½ Status banner already set? */
        const banner =
            document.querySelector('#current_status div[id]')?.textContent || '';
        if (banner.toUpperCase().includes('MANHATTAN')) return true;

        /* 2ï¿½ Grab visible "City, ST" from the primary-address anchor            */
        const raw =
            document
                .querySelector(
                    '[id="af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry"]'
                )
                ?.textContent || '';
        const m = raw.match(/^\s*([^,]+),\s*([A-Z]{2})\b/i); // ï¿½ [full, city, state]
        if (m && m[2] === 'NY') {
            const city = m[1].trim().toLowerCase();
            if (city === 'new york' || city === 'new york city') return true;
        }

        /*If the editable hasn't rendered yet, parse its data-value JSON     */
        const dataVal =
            document
                .querySelector(
                    '[id="af_leadAddress{||}leadAddress1{||}leadCity{||}leadState{||}leadZip{||}leadCountry"]'
                )
                ?.getAttribute('data-value') || '';
        const cityMatch =
            dataVal.match(/["']city["']\s*:\s*["']([^"']+)["']/i) ||
            dataVal.match(/city:\s*'([^']+)'/i);
        const stateMatch =
            dataVal.match(/["']state["']\s*:\s*["']([^"']+)["']/i) ||
            dataVal.match(/state:\s*'([^']+)'/i);
        if (stateMatch && stateMatch[1] === 'NY') {
            const city = (cityMatch ? cityMatch[1] : '').trim().toLowerCase();
            if (city === 'new york' || city === 'new york city') return true;
        }
        return false;
    }

    /**
     * Corrects the casing of the lead's first and last name (Bride) to title case.
     */
    async function correctNameCasing() {
        debugLog("=== Starting correctNameCasing ===");
        const nameElementId = "af_leadBrideFirst{||}leadBrideLast";
        const nameElement = document.getElementById(nameElementId);

        if (!nameElement) {
            console.error(`[AutoColorCoder] Name element with ID '${nameElementId}' not found.`);
            return;
        }

        const dataValue = nameElement.getAttribute("data-value");
        if (dataValue === null || dataValue === undefined) { // Check for null or undefined explicitly
            console.error("[AutoColorCoder] No data-value found in name field or data-value is null/undefined.");
            return;
        }

        // dataValue is expected to be "FirstName{||}LastName" or "FirstName{||}"
        const nameParts = dataValue.split("{||}");
        const rawFirstName = (nameParts[0] || "").trim(); // Handle undefined part defensively
        const rawLastName = (nameParts[1] || "").trim();  // Handle undefined part defensively

        const correctedFirstName = toTitleCase(rawFirstName);
        const correctedLastName = toTitleCase(rawLastName);

        if (rawFirstName === correctedFirstName && rawLastName === correctedLastName) {
            debugLog("[AutoColorCoder] Names are already in correct title case:", rawFirstName, rawLastName);
            return;
        }

        debugLog(`[AutoColorCoder] Correcting names. From: "${rawFirstName} ${rawLastName}" To: "${correctedFirstName} ${correctedLastName}"`);

        const bodyData = new URLSearchParams({
            name: nameElementId,
            "value[field_1]": correctedFirstName,
            "value[field_2]": correctedLastName,
            pk: "",
            clientID: clientID, // Global variable from the script
            objectID: leadID    // Global variable from the script
        });

        const success = await submitUpdate("https://www.pixifi.com/admin/data/af/leaddata/", bodyData);

        if (success) {
            leadModified = true;
            nameElement.textContent = `${correctedFirstName} ${correctedLastName || ''}`.trim();
            nameElement.setAttribute('data-value', `${correctedFirstName}{||}${correctedLastName || ''}`);
            console.log("[AutoColorCoder] Successfully updated name casing for:", nameElementId);

            // Attempt to update the x-editable instance if it exists
            const editableInstance = $(nameElement).data('editable');
            if (editableInstance && typeof editableInstance.setValue === 'function') {
                try {
                    // For dualtext, x-editable might expect an object or separate values.
                    // The data-value format "FirstName{||}LastName" is specific.
                    // We've already updated data-value and textContent.
                    // A direct setValue might be tricky without knowing exact x-editable options for dualtext.
                    // The safest is to rely on the data-value update and textContent.
                    // If Pixifi re-reads this on some actions, it will pick up the new value.
                    // For now, we'll log if we find an instance but not call setValue to avoid potential errors.
                    debugLog("[AutoColorCoder] Editable instance found for name field. Manual text/data-value update applied.");
                } catch (e) {
                    console.warn("[AutoColorCoder] Error trying to interact with editable instance for name field:", e);
                }
            }

        } else {
            console.error("[AutoColorCoder] Failed to update name casing for:", nameElementId);
        }
    }

    /**
     * Main orchestrator: runs all steps in sequence with restart safety and active monitoring.
     * Can resume from any incomplete step after power outage or restart.
     */
    async function processLead() {
        console.log(`[AutoColorCoder] processLead invoked for leadID: ${leadID}`);

        // Check if lead was already fully processed
        const alreadyDone = await gmGet('acc_done_' + leadID);
        if (alreadyDone) {
            console.log(`[AutoColorCoder] Lead ${leadID} already fully processed (done flag present), skipping further processing.`);
            return;
        }

        // Immediately register this lead as active for monitoring
        const currentUrl = window.location.href;
        await registerActiveLead(leadID, currentUrl);
        await startHeartbeat(leadID);

        // Check for incomplete progress from previous interrupted session
        const progress = await getProcessingProgress(leadID);
        let resumeFromStep = null;

        if (progress && !progress.completed) {
            resumeFromStep = await getNextIncompleteStep(leadID);
            console.log(`[AutoColorCoder] 🔄 RESUME MODE: Found incomplete processing for lead ${leadID}`);
            console.log(`[AutoColorCoder] Resuming from step: ${resumeFromStep}`);
            console.log(`[AutoColorCoder] Progress started: ${new Date(progress.startTime).toLocaleString()}`);
            console.log(`[AutoColorCoder] Completed steps: ${Object.keys(progress.steps).filter(s => progress.steps[s].completed).join(', ')}`);
            console.log(`[AutoColorCoder] Saved state variables:`, progress.state || {});
        } else {
            console.log(`[AutoColorCoder] 🆕 FRESH START: Starting fresh processing for lead ${leadID}`);
        }

        console.log('=== Starting/Restarting processLead ===');

        // Initialize variables that may be needed by resumed processes
        let initialNotesValue = '';
        let pcPhotographer = '';
        let isDuplicateClient = false;
        let wasPC = false;
        let basePrefix = '';
        let pcPart = '';

        try {
            // Step 1: Initialize notes value (always needed)
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {
                initialNotesValue = getInitialNotesValue();
                console.log('[AutoColorCoder] initialNotesValue:', initialNotesValue);
                await updateProcessingProgress(leadID, PROCESSING_STEPS.GEOCODE_AND_FIX, false, { initialNotesValue });
            } else {
                // Load from progress if resuming later
                const existingProgress = await getProcessingProgress(leadID);
                if (existingProgress && existingProgress.state && existingProgress.state.initialNotesValue) {
                    initialNotesValue = existingProgress.state.initialNotesValue;
                    console.log('[AutoColorCoder] Loaded initialNotesValue from saved state:', initialNotesValue);
                } else {
                    initialNotesValue = getInitialNotesValue();
                    console.log('[AutoColorCoder] Re-initialized initialNotesValue:', initialNotesValue);
                }
            }

            // Step 2: Geocode and fix fields
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {
                console.log('[AutoColorCoder] Running geocode and fix fields...');
                await geocodeAndFixFields();
                await updateProcessingProgress(leadID, PROCESSING_STEPS.GEOCODE_AND_FIX, true);
                console.log('[AutoColorCoder] Geocode and fix fields completed');
            }

            // Step 3: Correct name casing
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.CORRECT_NAMES ||
                resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {
                console.log('[AutoColorCoder] Running name casing correction...');
                await correctNameCasing();
                await updateProcessingProgress(leadID, PROCESSING_STEPS.CORRECT_NAMES, true);
                console.log('[AutoColorCoder] Name casing correction completed');
            }

            // Step 4: Set priority based on due date
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.SET_PRIORITY ||
                resumeFromStep === PROCESSING_STEPS.CORRECT_NAMES ||
                resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {
                console.log('[AutoColorCoder] Running priority setting...');
                await setPriorityBasedOnDueDate();
                await updateProcessingProgress(leadID, PROCESSING_STEPS.SET_PRIORITY, true);
                console.log('[AutoColorCoder] Priority setting completed');
            }

            // Step 5: Handle duplicate client logic
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.HANDLE_DUPLICATE ||
                resumeFromStep === PROCESSING_STEPS.SET_PRIORITY ||
                resumeFromStep === PROCESSING_STEPS.CORRECT_NAMES ||
                resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {

                console.log('[AutoColorCoder] Running duplicate client detection...');

                // Load saved state if resuming from later step
                if (resumeFromStep && resumeFromStep !== PROCESSING_STEPS.HANDLE_DUPLICATE) {
                    const existingProgress = await getProcessingProgress(leadID);
                    if (existingProgress && existingProgress.state) {
                        isDuplicateClient = existingProgress.state.isDuplicateClient || false;
                        wasPC = existingProgress.state.wasPC || false;
                        pcPhotographer = existingProgress.state.pcPhotographer || '';
                        console.log('[AutoColorCoder] Loaded duplicate client state from saved progress:', {
                            isDuplicateClient, wasPC, pcPhotographer
                        });
                        await updateProcessingProgress(leadID, PROCESSING_STEPS.HANDLE_DUPLICATE, true, {
                            isDuplicateClient, wasPC, pcPhotographer
                        });
                        console.log('[AutoColorCoder] Duplicate client handling completed (loaded from state)');
                    } else {
                        // Re-run duplicate detection logic if no saved state
                        await runDuplicateDetectionLogic();
                    }
                } else {
                    // Run duplicate detection logic for fresh start or resuming from this step
                    await runDuplicateDetectionLogic();
                }

                async function runDuplicateDetectionLogic() {

                    // Re-run duplicate detection logic
                    const duplicateBox = document.getElementById("duplicateBox");

                    // Check if this is specifically a "Possible Duplicate Client" (not "Possible Duplicate Lead")
                    isDuplicateClient = false;
                    if (duplicateBox) {
                        // Check for indicators that this is a duplicate client (not duplicate lead)
                        const hasClientLink = duplicateBox.querySelector('a[href*="/admin/clients/"]');
                        const hasPrimaryClass = duplicateBox.classList.contains('note-primary');
                        const hasClientHeaderText = duplicateBox.textContent.includes('Possible Duplicate Client');

                        isDuplicateClient = !!(hasClientLink || hasPrimaryClass || hasClientHeaderText);
                        console.log("Duplicate box found - Client indicators:", {
                            hasClientLink: !!hasClientLink,
                            hasPrimaryClass,
                            hasClientHeaderText,
                            isDuplicateClient
                        });
                    }

                    if (isDuplicateClient) {
                        console.log("Possible duplicate CLIENT detected. Running PC logic...");
                        pcPhotographer = await handleDuplicateClient(duplicateBox);
                        console.log("PC logic result, photographer:", pcPhotographer);
                    } else if (duplicateBox) {
                        console.log("Possible duplicate LEAD detected. Skipping PC logic.");
                    }

                    // Apply PC logic only for duplicate clients
                    wasPC = isDuplicateClient;
                    console.log("PC status (duplicate client detected):", wasPC);

                    await updateProcessingProgress(leadID, PROCESSING_STEPS.HANDLE_DUPLICATE, true, {
                        isDuplicateClient,
                        wasPC,
                        pcPhotographer
                    });
                    console.log('[AutoColorCoder] Duplicate client handling completed');
                }
            }

            // Step 6: Update event name
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.UPDATE_EVENT_NAME ||
                resumeFromStep === PROCESSING_STEPS.HANDLE_DUPLICATE ||
                resumeFromStep === PROCESSING_STEPS.SET_PRIORITY ||
                resumeFromStep === PROCESSING_STEPS.CORRECT_NAMES ||
                resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {

                console.log('[AutoColorCoder] Running event name update...');

                // Re-build prefixes if resuming from earlier step
                if (!basePrefix) {
                    // Build the base prefix (CCC MAN, NOTES) in the correct order, using live Manhattan check
                    let basePrefixes = [];
                    if (isLeadManhattan()) {
                        basePrefixes.push('CCC MAN');
                        console.log("Adding CCC MAN to base prefix");
                    }
                    if (initialNotesValue && initialNotesValue !== '') {
                        basePrefixes.push('NOTES');
                        console.log("Adding NOTES to base prefix");
                    }
                    basePrefix = basePrefixes.join(' ');
                    console.log('Base prefix assembled:', basePrefix);

                    // NEW: Always instruct to check the prior session when PC applies
                    pcPart = wasPC ? 'PC - check previous session' : '';
                    console.log('PC part determined:', pcPart);
                }

                // Call updateEventName with base prefix and PC part separately
                console.log('Calling updateEventName with base prefix:', basePrefix, 'and PC part:', pcPart);
                await updateEventName(basePrefix, pcPart);

                await updateProcessingProgress(leadID, PROCESSING_STEPS.UPDATE_EVENT_NAME, true);
                console.log('[AutoColorCoder] Event name update completed');
            }

            // Step 7: Update status
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.UPDATE_STATUS ||
                resumeFromStep === PROCESSING_STEPS.UPDATE_EVENT_NAME ||
                resumeFromStep === PROCESSING_STEPS.HANDLE_DUPLICATE ||
                resumeFromStep === PROCESSING_STEPS.SET_PRIORITY ||
                resumeFromStep === PROCESSING_STEPS.CORRECT_NAMES ||
                resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {

                console.log('[AutoColorCoder] Running status update...');
                // Update status after all other changes
                await updateStatusOfLead();
                await updateProcessingProgress(leadID, PROCESSING_STEPS.UPDATE_STATUS, true);
                console.log('[AutoColorCoder] Status update completed');
            }

            // Step 8: Add questionnaire if needed
            if (!resumeFromStep || resumeFromStep === PROCESSING_STEPS.ADD_QUESTIONNAIRE ||
                resumeFromStep === PROCESSING_STEPS.UPDATE_STATUS ||
                resumeFromStep === PROCESSING_STEPS.UPDATE_EVENT_NAME ||
                resumeFromStep === PROCESSING_STEPS.HANDLE_DUPLICATE ||
                resumeFromStep === PROCESSING_STEPS.SET_PRIORITY ||
                resumeFromStep === PROCESSING_STEPS.CORRECT_NAMES ||
                resumeFromStep === PROCESSING_STEPS.GEOCODE_AND_FIX) {

                console.log('[AutoColorCoder] Running questionnaire attachment...');
                // Optionally attach questionnaire
                await addQuestionnaireIfNeeded();
                await updateProcessingProgress(leadID, PROCESSING_STEPS.ADD_QUESTIONNAIRE, true);
                console.log('[AutoColorCoder] Questionnaire attachment completed');
            }

            console.log('Process complete. Lead modified:', leadModified);

            // Mark as fully completed only if lead is in a final status (not actively managed)
            const currentStatusElem = document.querySelector("#current_status > div");
            const currentStatusID = currentStatusElem ? currentStatusElem.id.replace("_status", "") : null;
            const manageableStatuses = ["13426", "18561", "18562", "18563", "18564"];

            const isInFinalStatus = currentStatusID && !manageableStatuses.includes(currentStatusID);

            if (leadModified) {
                if (isInFinalStatus) {
                    // Only mark as done if the lead is in a final/non-manageable status
                    markLeadDone(leadID);
                    console.log(`[AutoColorCoder] ✅ Lead ${leadID} in final status (${currentStatusID}), marked as fully complete.`);
                } else {
                    console.log(`[AutoColorCoder] ✅ Lead ${leadID} processed but still in active status (${currentStatusID}), not marked as done.`);
                }

                await clearProcessingProgress(leadID);
                await stopHeartbeat();
                await unregisterActiveLead(leadID);
                console.log(`[AutoColorCoder] Cleaned up all tracking for lead ${leadID}.`);
            } else {
                console.log(`[AutoColorCoder] No changes were made to lead ${leadID}; 'done' flag not set.`);
                // Keep progress tracking for potential future changes
                await stopHeartbeat();
                await unregisterActiveLead(leadID);
                console.log(`[AutoColorCoder] ⚠️  Lead ${leadID} not modified, cleaned up active tracking but kept progress.`);
            }

            if (closewindow && leadModified) {
                console.log("[AutoColorCoder] Lead modified, closing window.");
                setTimeout(() => window.close(), 500);
            } else {
                console.log("[AutoColorCoder] Lead not modified, keeping window open.");
            }

        } catch (error) {
            console.error(`[AutoColorCoder] Error during processing of lead ${leadID}:`, error);
            // Stop heartbeat but don't clean up progress - allow retry on next page load
            await stopHeartbeat();
            throw error;
        }
    }

    // Orchestrator initialization
    async function initializeScript() {
        // Always run recovery check on any admin page
        await runRecoveryCheck();

        if (!shouldRunScript()) {
            debugLog('Not on an individual lead page, script will not run');
            return;
        }

        if (sessionStorage.getItem('acc_lock_' + leadID)) return;
        sessionStorage.setItem('acc_lock_' + leadID, '1');
        (async () => {
            try {
                debugLog('Starting script execution');
                await processLead();
            } catch (e) {
                console.error('Error in script execution:', e);
            } finally {
                sessionStorage.removeItem('acc_lock_' + leadID);
            }
        })();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript);
    } else {
        initializeScript();
    }

    function parseAddressData(dataValue) {
        try {
            // First replace all single quotes with double quotes, but handle empty strings properly
            const fixedJson = dataValue
                .replace(/'/g, '"')
                .replace(/:\s*""/g, ': ""')  // Fix empty strings
                .replace(/,\s*"/g, ',"')     // Fix spacing after commas
                .replace(/{\s*"/g, '{"');     // Fix spacing after opening brace
            console.log('Attempting to parse JSON:', fixedJson);
            return JSON.parse(fixedJson);
        } catch (e) {
            console.warn('JSON parse failed, trying alternate method');
            // Fallback: parse manually if JSON.parse fails
            try {
                const matches = dataValue.match(/{address:'(.*?)',address1:'(.*?)',city:\s*'(.*?)',state:\s*'(.*?)',postal:\s*'(.*?)',country:\s*'(.*?)'}/);
                if (matches) {
                    return {
                        address: matches[1],
                        address1: matches[2],
                        city: matches[3],
                        state: matches[4],
                        postal: matches[5],
                        country: matches[6]
                    };
                }
            } catch (e2) {
                console.warn('Both parsing methods failed:', e2);
            }
        }
        return null;
    }

    /***** helper: GM-based fetch (CORS-free) *****************************/
    function gmFetch(url, { method = 'GET', headers = {}, data = null } = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                url,
                method,
                headers,
                data,
                anonymous: true,
                onload: res => resolve(res),
                onerror: err => reject(err)
            });
        });
    }

    // Simple Title-Case converter (New York ï¿½ New York, SAN DIEGO ï¿½ San Diego)
    function toTitleCase(str) {
        return str
            .toLowerCase()
            .replace(/\b(\w)/g, c => c.toUpperCase());
    }

    /*****  Questionnaires *************************************************/
    const QUESTIONNAIRE_IDS = {
        nonManhattan: { here: 79438, advanced: 79439 },
        manhattan:    { here: 79458, advanced: 79457 }
    };

    /**
     * Check if the lead already has one or more questionnaires attached.
     * Returns true if at least one questionnaire entry is found.
     */
    async function hasExistingQuestionnaire() {
        if (!clientID || !leadID) return false;

        const bodyData = new URLSearchParams({
            clientID: clientID,
            objectType: 'lead',
            objectID: leadID
        });

        try {
            const resp = await withRetry(() => fetch('/admin/fn/quest/refreshQuestionnaireToObjectListing/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: bodyData.toString(),
                credentials: 'include'
            }));

            if (!resp.ok) {
                console.warn('[AutoColorCoder] Could not refresh questionnaire listing  status', resp.status);
                return false;
            }

            const txt = await resp.text();
            const parts = txt.split('SUCCESS{|}');
            if (parts.length < 2) return false;
            const html = parts[1];
            // Look for any questionnaire row
            return /id="questionnaire_\d+"/i.test(html);
        } catch (e) {
            console.error('[AutoColorCoder] Error checking existing questionnaires:', e);
            return false;
        }
    }

    /**
     * Attach the appropriate questionnaire template to the lead, if toggled on.
     * "Baby here" = due date today or in the past, otherwise advanced booking.
     */
    async function addQuestionnaireIfNeeded() {
        if (!addQuestionnaire) return;                     // feature disabled
        if (!clientID || !leadID) return;                  // safety-check

        // Skip if lead already has questionnaire(s)
        if (await hasExistingQuestionnaire()) {
            console.log('[AutoColorCoder] Lead already has questionnaire  skipping attach.');
            return;
        }

        // 1ï¿½ Determine Manhattan status
        const isManhattanLead = isLeadManhattan();

        // 2ï¿½ Determine "baby here" vs "advanced" from due-date field
        const dueDateElem = document.getElementById("questitem_8225")?.querySelector(".rightTitle");
        if (!dueDateElem) {
            console.warn('[AutoColorCoder] Cannot find due-date field  skipping questionnaire attach.');
            return;
        }
        const dueParts = dueDateElem.textContent.trim().split("/"); // mm/dd/yyyy
        if (dueParts.length !== 3) {
            console.warn('[AutoColorCoder] Unexpected due-date format:', dueDateElem.textContent);
            return;
        }
        const [mm, dd, yyyy] = dueParts.map(Number);
        const dueDate   = new Date(Date.UTC(yyyy, mm - 1, dd));
        const todayUTC  = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
        const babyHere  = (dueDate <= todayUTC);

        // 3ï¿½ Lookup template ID
        const ids = isManhattanLead ? QUESTIONNAIRE_IDS.manhattan : QUESTIONNAIRE_IDS.nonManhattan;
        const templateID = babyHere ? ids.here : ids.advanced;

        // 4ï¿½ Attempt to attach questionnaire
        const bodyData = new URLSearchParams({
            clientID:   clientID,
            templateID: templateID,
            objType:    'lead',
            objID:      leadID,
            brandID:    '19647',          // RESERVE brand (required by endpoint)
            customerID: '',
            sendEmail:  '0',
            responseID: '',
            recipients: '',
            responseSubject: '',
            responseMsg: '',
            responseType: 'questionnaire'
        });

        try {
            const resp = await withRetry(() => fetch('https://www.pixifi.com/admin/fn/quest/addQuestionnaireTemplateToObject/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: bodyData.toString(),
                credentials: 'include'
            }));

            if (resp.ok) {
                const txt = await resp.text();
                if (txt.startsWith('SUCCESS')) {
                    console.log('[AutoColorCoder] Questionnaire', templateID, 'successfully attached.');
                    leadModified = true;
                } else {
                    console.warn('[AutoColorCoder] Unexpected questionnaire response:', txt);
                }
            } else {
                console.error('[AutoColorCoder] Failed to attach questionnaire:', resp.status, resp.statusText);
            }
        } catch (e) {
            console.error('[AutoColorCoder] Network error while attaching questionnaire:', e);
        }
    }

    // ***** USPS OAuth 2.0 credentials (fill in or set via menu) *****
    const USPS_CLIENT_ID     = '';
    const USPS_CLIENT_SECRET = '';

    const USPS_CLIENT_ID_KEY     = 'usps_client_id';
    const USPS_CLIENT_SECRET_KEY = 'usps_client_secret';
    const USPS_TOKEN_EXP_KEY     = 'usps_token_exp'; // epoch-ms expiry

    // Menu command to set client-id/secret once (stored with GM)
    GM_registerMenuCommand('Set USPS Client Credentials', async () => {
        const curId  = await gmGet(USPS_CLIENT_ID_KEY, '');
        const curSec = await gmGet(USPS_CLIENT_SECRET_KEY, '');
        const id  = prompt('USPS consumer KEY (client_id)', curId || '');
        if (id === null) return;
        const sec = prompt('USPS consumer SECRET (client_secret)', curSec || '');
        if (sec === null) return;
        await gmSet(USPS_CLIENT_ID_KEY, id.trim());
        await gmSet(USPS_CLIENT_SECRET_KEY, sec.trim());
        alert('USPS client credentials saved.');
    });

    /**
     * Obtain a (cached) USPS OAuth access-token using the Client-Credentials flow.
     * Automatically refreshes when <5 min from expiry.
     */
    async function getUspsAccessToken() {
        let token   = await gmGet(USPS_TOKEN_KEY, '');
        const expMs = await gmGet(USPS_TOKEN_EXP_KEY, 0);

        // Return cached token if still valid for e5 min
        if (token && Date.now() < expMs - 5 * 60_000) return token;

        // Fetch fresh token using stored or hard-coded credentials
        const clientId  = USPS_CLIENT_ID  || await gmGet(USPS_CLIENT_ID_KEY,  '');
        const clientSec = USPS_CLIENT_SECRET || await gmGet(USPS_CLIENT_SECRET_KEY, '');
        if (!clientId || !clientSec) {
            console.error('[AutoColorCoder] USPS client credentials not set. Use "Set USPS Client Credentials" menu option.');
            return null;
        }

        const bodyJson = JSON.stringify({
            client_id:     clientId,
            client_secret: clientSec,
            grant_type:    'client_credentials'
        });

        try {
            const res = await gmFetch('https://apis.usps.com/oauth2/v3/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                data: bodyJson
            });
            if (res.status !== 200) {
                console.error('[AutoColorCoder] USPS token request failed:', res.status, res.statusText);
                return null;
            }
            const data = JSON.parse(res.responseText);
            if (data && data.access_token) {
                token = data.access_token;
                const expiresIn = Number(data.expires_in || 8 * 3600); // seconds
                await gmSet(USPS_TOKEN_KEY, token);
                await gmSet(USPS_TOKEN_EXP_KEY, Date.now() + expiresIn * 1000);
                return token;
            }
            console.error('[AutoColorCoder] Unexpected USPS token response:', data);
        } catch (e) {
            console.error('[AutoColorCoder] Network error acquiring USPS token:', e);
        }
        return null;
    }
})();
