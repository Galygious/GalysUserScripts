// ==UserScript==
// @name         Pixifi - Add Category Rework
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Fetch add-category form, inject a multi-select dropdown with a Cancel button, then associate + refresh. No success alert.
// @match        https://www.pixifi.com/admin/leads/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/select2/4.1.0-rc.0/js/select2.min.js
// @resource     select2CSS https://cdnjs.cloudflare.com/ajax/libs/select2/4.1.0-rc.0/css/select2.min.css
// @require      file://D:/Galydev/TamperMonkeyScripts/GME_Tools/GME_Tools.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. Inject Select2's CSS into the page
    const select2CSS = GM_getResourceText('select2CSS');
    GM_addStyle(select2CSS);

    console.log('[TM] Script loaded with Select2 and Cancel button.');

    const pixifi = new GME_Tools.PixifiAPI();

    /**
     * Extract lead ID from URL (e.g. /admin/leads/12345/).
     */
    function getLeadID() {
        const parts = window.location.pathname.split('/');
        const i = parts.indexOf('leads');
        if (i !== -1 && parts[i + 1]) {
            return parts[i + 1];
        }
        return null;
    }

    /**
     * Initialization: remove original onclick, add our own click logic.
     */
    function initScript(addButton) {
        console.log('[TM] Found the Add button:', addButton);
        addButton.removeAttribute('onclick'); // remove Pixifi's default behavior
        addButton.addEventListener('click', onAddButtonClick);
    }

    /**
     * On Add button click: fetch the "add category" form HTML, parse #newCategoryID,
     * then insert a custom form into #categories.
     */
    async function onAddButtonClick(e) {
        e.preventDefault();

        const leadID = getLeadID();
        if (!leadID) {
            console.warn('[TM] Could not determine lead ID.');
            return;
        }

        const clientID = 12295; // Hard-coded from your example
        const formHTML = await fetchAddCategoryFormHTML(clientID, leadID);
        if (!formHTML) return; // something went wrong or was alerted already

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formHTML;
        const fetchedSelect = tempDiv.querySelector('#newCategoryID');
        if (!fetchedSelect) {
            console.warn('[TM] #newCategoryID not found in the fetched HTML:', formHTML);
            return;
        }

        insertSelect2Form(fetchedSelect, clientID, leadID);
    }

    /**
     * Fetch the add-category form HTML from Pixifi, stripping "SUCCESS{|}" if needed.
     */
    async function fetchAddCategoryFormHTML(clientID, leadID) {
        try {
            return await pixifi.categories.getAddForm('lead', leadID, clientID);
        } catch (err) {
            console.error('[TM] fetchAddCategoryFormHTML error:', err);
            alert('Error fetching add-category form: ' + err.message);
            return null;
        }
    }

    /**
     * Insert a custom form in #categories with a Select2 multi-select and Cancel button.
     */
    function insertSelect2Form(fetchedSelect, clientID, leadID) {
        // Remove any previous form we inserted
        const oldForm = document.querySelector('#tmAddCategoryForm');
        if (oldForm) oldForm.remove();

        const catDiv = document.querySelector('#categories');
        if (!catDiv) {
            alert('Could not find #categories in DOM.');
            return;
        }

        // Create the form
        const form = document.createElement('form');
        form.id = 'tmAddCategoryForm';
        form.style.marginTop = '10px';

        // Label
        const label = document.createElement('label');
        label.textContent = 'Select Category(ies): ';
        label.style.marginRight = '5px';

        // Clone the fetched select, set up for multiple
        const clonedSelect = fetchedSelect.cloneNode(true);
        clonedSelect.id = 'tmClonedCategorySelect';
        clonedSelect.setAttribute('multiple', 'multiple'); // ensure multi-select
        clonedSelect.removeAttribute('size');             // let Select2 handle the UI

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-xs default';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.marginLeft = '5px';

        // Submit button
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'btn btn-xs green';
        submitBtn.textContent = 'Submit';

        // Build form
        form.appendChild(label);
        form.appendChild(clonedSelect);
        form.appendChild(submitBtn);
        form.appendChild(cancelBtn);

        catDiv.appendChild(form);
        console.log('[TM] Inserted form with Cancel button into #categories.');

        // Initialize Select2 on the cloned <select>
        $(clonedSelect).select2({
            placeholder: 'Select category(ies)...',
            allowClear: true,
            width: '300px'
        });

        // Cancel button => remove the form
        cancelBtn.addEventListener('click', () => {
            console.log('[TM] Cancel clicked. Removing form.');
            form.remove();
        });

        // On submit => do associate + refresh
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('[TM] Submitting category form...');

            submitBtn.disabled = true;
            cancelBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            try {
                // Gather selected categories from the Select2 widget
                const selectedValues = $(clonedSelect).val() || [];
                if (!selectedValues.length) {
                    alert('Please select at least one category.');
                    return;
                }
                const catIDs = selectedValues.join(',');

                // 1) Associate
                await associateCategories(clientID, leadID, catIDs);

                // 2) Refresh
                const refreshedHTML = await refreshCategoryListing(clientID, leadID);

                // 3) Update the DOM
                const listingEl = document.querySelector(`#categoryListing_${leadID}`);
                if (listingEl) {
                    listingEl.innerHTML = refreshedHTML;
                }

                // Remove the form (no success alert)
                form.remove();
                console.log('[TM] Categories added, form removed, no success alert displayed.');
            } catch (err) {
                console.error('[TM] Error in form submission:', err);
                alert(err.message);
            } finally {
                submitBtn.disabled = false;
                cancelBtn.disabled = false;
                submitBtn.textContent = 'Submit';
            }
        });
    }

    /**
     * Associate multiple categories with the lead.
     */
    async function associateCategories(clientID, leadID, catIDs) {
        console.log('[TM] associateCategories =>', catIDs);
        await pixifi.categories.associate('lead', leadID, catIDs, clientID);
    }

    /**
     * Refresh the category listing for this lead, stripping "SUCCESS{|}" if needed.
     */
    async function refreshCategoryListing(clientID, leadID) {
        return await pixifi.categories.refreshListing('lead', leadID, clientID);
    }

    // --- Start it up ---
    const addButtonSelector = 'a[onclick^="getAddObjectCategoryForm(\'lead\',"]';
    GME_Tools.waitForElement(addButtonSelector)
        .then(btn => {
            console.log('[TM] Found Add button with that selector:', btn);
            initScript(btn);
        })
        .catch(error => {
            console.error('[TM] Error waiting for Add button:', error);
        });
})();
