// ==UserScript==
// @name         Pixifi Invoices - Full Override with Default Filters/Sorting
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Fully handle invoice loading with defaults and instant filter/sort response. No original script calls.
// @match        https://www.pixifi.com/admin/invoices/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Global variables
    let currentRunId = 0;
    let isLoading = false;
    let keepLoading = false;
    let currentPage = 1;
    let abortController = null;

    // Default sorting: balance ascending
    let section = "bal";
    let dir = "A";

    const invoiceContainer = document.querySelector('#invoicesDIV');
    if (!invoiceContainer) {
        console.log("No #invoicesDIV found. Cannot proceed.");
        return;
    }

    // Override the page's refreshInvoices function so original code doesn't interfere.
    window.refreshInvoices = function() {
        startNewLoad();
    };

    // Override changePage if it exists or if the page uses it.
    window.changePage = function(newPage) {
        currentPage = 1;
        startNewLoad();
    };

    // Override changeSort if it exists or if sorting function calls it.
    window.changeSort = function(newSection, newDir) {
        section = newSection;
        dir = newDir;
        currentPage = 1;
        startNewLoad();
    };

    // Add event listeners to filter elements so that any change restarts loading.
    addFilterListeners('#filterYear');
    addFilterListeners('#filterStatus', true); // multiple select
    addFilterListeners('#filterBrand', true);
    addFilterListeners('#dueDateStart');
    addFilterListeners('#dueDateEnd');
    addFilterListeners('#createdDateStart');
    addFilterListeners('#createdDateEnd');
    addFilterListeners('#filterType');
    addFilterListeners('#archiveType');

    function addFilterListeners(selector, isMultiple=false) {
        const el = document.querySelector(selector);
        if (el) {
            el.addEventListener('change', () => {
                startNewLoad();
            });
        }
    }

    function startNewLoad() {
        currentRunId++;
        let myRunId = currentRunId;

        // Abort any ongoing fetch
        if (abortController) {
            abortController.abort();
        }

        // Clear invoice container
        invoiceContainer.innerHTML = '';

        // Start loading from the first page
        loadAllPages(myRunId);
    }

    async function loadAllPages(runId) {
        if (isLoading) {
            // If something is still loading, it will be aborted by runId check
        }

        isLoading = true;
        keepLoading = true;
        currentPage = 1;

        // Load first page
        let firstPageRows = await loadPage(runId, currentPage);
        if (runId !== currentRunId || !keepLoading || !firstPageRows) {
            isLoading = false;
            return;
        }

        // Insert the first page rows into an empty container
        firstPageRows.forEach(r => invoiceContainer.appendChild(r));

        // Now load subsequent pages until no more
        while (keepLoading) {
            currentPage++;
            let moreRows = await loadPage(runId, currentPage);
            if (runId !== currentRunId || !keepLoading || !moreRows || moreRows.length === 0) {
                break;
            }
            moreRows.forEach(r => invoiceContainer.appendChild(r));
        }

        // Remove pagination if exists
        let paginationElement = document.querySelector('.pagination');
        if (paginationElement) {
            paginationElement.remove();
        }

        isLoading = false;
    }

    async function loadPage(runId, page) {
        if (runId !== currentRunId) return null;

        // Prepare parameters based on current filters
        let clientID = "12295";

        let year = getSingleValue('#filterYear');
        let statuses = getSelectedOptions('#filterStatus');
        let brands = getSelectedOptions('#filterBrand');
        let dueDateStart = getSingleValue('#dueDateStart');
        let dueDateEnd = getSingleValue('#dueDateEnd');
        let createdDateStart = getSingleValue('#createdDateStart');
        let createdDateEnd = getSingleValue('#createdDateEnd');
        let type = getSingleValue('#filterType');
        let archive = getSingleValue('#archiveType');

        const formBody = new URLSearchParams({
            clientID: clientID,
            page: page.toString(),
            section: section,
            dir: dir,
            statuses: statuses,
            brands: brands,
            year: year,
            dueDateStart: dueDateStart,
            dueDateEnd: dueDateEnd,
            createdDateStart: createdDateStart,
            createdDateEnd: createdDateEnd,
            type: type,
            archive: archive
        });

        abortController = new AbortController();

        let response;
        try {
            response = await fetch("https://www.pixifi.com/admin/fn/invoices/getInvoiceListing/", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                referrer: "https://www.pixifi.com/admin/invoices/",
                referrerPolicy: "strict-origin-when-cross-origin",
                body: formBody.toString(),
                method: "POST",
                mode: "cors",
                credentials: "include",
                signal: abortController.signal
            });
        } catch (e) {
            console.log("Fetch aborted or failed: " + e);
            return null;
        }

        if (!response.ok || runId !== currentRunId) return null;

        const text = await response.text();
        if (runId !== currentRunId) return null;

        let contentPart = text.split('SUCCESS{|}');
        if (!contentPart[1]) {
            return [];
        }

        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentPart[1].trim();
        let newRows = tempDiv.querySelectorAll('.gridRow');

        return Array.from(newRows);
    }

    function getSingleValue(selector) {
        const el = document.querySelector(selector);
        return el ? el.value : "";
    }

    function getSelectedOptions(selector) {
        const el = document.querySelector(selector);
        if (!el) return "";
        let selected = Array.from(el.options)
            .filter(o => o.selected)
            .map(o => o.value);
        return selected.join('||');
    }

    // Initially start loading once the page is ready, using the defaults from the page and our chosen sorting.
    startNewLoad();
})();
