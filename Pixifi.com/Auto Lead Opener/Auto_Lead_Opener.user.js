// ==UserScript==
// @name         Auto Lead Opener
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically opens new Pixifi leads in new tabs at a configurable interval.
// @match        https://www.pixifi.com/admin/leads/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // === CONFIGURATION ===
    // Interval in seconds between checks (user can change this value)
    let CHECK_INTERVAL_SECONDS = 30;

    // =====================

    let lastLeadIds = new Set();
    let intervalId = null;

    // Helper to fetch leads
    async function fetchLeads() {
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

    // Helper to parse lead IDs from HTML response
    function parseLeadIds(html) {
        const ids = [];
        const regex = /<div id="row_(\d+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            ids.push(match[1]);
        }
        return ids;
    }

    // Main polling function
    async function checkForNewLeads() {
        try {
            const html = await fetchLeads();
            const leadIds = parseLeadIds(html);
            const newLeads = leadIds.filter(id => !lastLeadIds.has(id));
            if (newLeads.length > 0) {
                newLeads.forEach(id => {
                    window.open(`/admin/leads/${id}/`, '_blank');
                });
            }
            lastLeadIds = new Set(leadIds);
        } catch (e) {
            console.error('Auto Lead Opener error:', e);
        }
    }

    // Initial population of lastLeadIds
    (async function init() {
        const html = await fetchLeads();
        lastLeadIds = new Set(parseLeadIds(html));
        intervalId = setInterval(checkForNewLeads, CHECK_INTERVAL_SECONDS * 1000);
        console.log(`Auto Lead Opener started. Checking every ${CHECK_INTERVAL_SECONDS} seconds.`);
    })();

})(); 