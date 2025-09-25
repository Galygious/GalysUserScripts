// File: pixifi/leadsFilterPresets.user.js

// ==UserScript==
// @name         Leads Page Preset Filters
// @namespace    https://example.com
// @version      1.0.8
// @description  Adds "Preset Filters" dropdown & modal manager to leads page. Now supports .data('editable') fields.
// @match        https://www.pixifi.com/admin/leads/
// @match        https://www.pixifi.com/admin/leads/#
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// ==/UserScript==

console.log('TamperMonkey script loaded: Leads Page Preset Filters.user.js');

(function() {
    'use strict';

    // Create a global persistent session state for the archived status
    window.pixifiPresetArchivedState = {
        value: null,
        inProgress: false,
        enforceCount: 0
    };

    /*************************************************************
     *  HELPER: If an element has .data('editable'), get/set its value
     *************************************************************/
    function setEditableValue($el, newVal, isMultiple) {
        const editableObj = $el.data('editable');
        if (editableObj && typeof editableObj.setValue === 'function') {
            // Uses the custom 'editable' approach
            editableObj.setValue(newVal);
        } else {
            // Fallback to standard .val() + .change()
            if (isMultiple) {
                $el.val(Array.isArray(newVal) ? newVal : []).change();
            } else {
                $el.val(newVal).change();
            }
        }
    }

    function getEditableValue($el, isMultiple) {
        const editableObj = $el.data('editable');
        if (editableObj && typeof editableObj.value !== 'undefined') {
            // Uses the custom 'editable' approach
            return editableObj.value;
        } else {
            // Fallback to standard .val()
            let val = $el.val();
            if (isMultiple && !Array.isArray(val)) {
                val = val ? [val] : [];
            }
            return val;
        }
    }

    /*************************************************************
     *  1. HELPER: GETTING / SETTING FILTER FORM STATE
     *************************************************************/
    function getCurrentFilterSettings() {
        // Grab all fields using getEditableValue to handle .data('editable') or normal .val()
        const filterSettings = {
            // Main filter fields
            filterStatus: getEditableValue($('#filterStatus'), true),
            priorityCombo: getEditableValue($('#priorityCombo'), false),
            filterBrand: getEditableValue($('#filterBrand'), true),
            staffVal: getEditableValue($('#filterStaffCombo'), false),
            readUnreadCombo: getEditableValue($('#readUnreadCombo'), false),
            archivedStatus: getEditableValue($('#viewFilterCombo'), false),
            filterEventType: getEditableValue($('#filterEventType'), false),
            referralSourceCombo: getEditableValue($('#referralSourceCombo'), false),
            filterCategory: getEditableValue($('#filterCategory'), true),
            category_filter_type: getEditableValue($('#category_filter_type'), false),

            // Date fields
            firstContactStart: $('#firstContactStart').val(),
            firstContactEnd: $('#firstContactEnd').val(),
            eventDateStart: $('#eventDateStart').val(),
            eventDateEnd: $('#eventDateEnd').val(),
        };

        // Get custom field values - these are dynamic so we need to find all of them
        $('#objectListingCustomFieldFilters input, #objectListingCustomFieldFilters select').each(function() {
            const $el = $(this);
            const id = $el.attr('id');

            // Only process elements with an ID that follows the pattern 'item_XXXXX'
            if (id && id.match(/^item_\d+$/)) {
                // For checkboxes in a group (same name with [])
                if ($el.attr('type') === 'checkbox' && $el.attr('name') && $el.attr('name').endsWith('[]')) {
                    // Get all checked values for this group
                    const name = $el.attr('name').replace('[]', '');
                    if (!filterSettings[name]) {
                        const checkedValues = [];
                        $(`input[name="${$el.attr('name')}"]:checked`).each(function() {
                            checkedValues.push($(this).val());
                        });
                        filterSettings[name] = checkedValues;
                    }
                }
                // For single checkboxes (yes/no type)
                else if ($el.attr('type') === 'checkbox') {
                    filterSettings[id] = $el.prop('checked') ? '1' : '0';
                }
                // For all other inputs and selects
                else {
                    filterSettings[id] = $el.val();
                }
            }
        });

        return filterSettings;
    }

    function applyFilterSettings(settings) {
        if (!settings) return;

        // Store the archived status value to our global state for persistence
        if (settings.archivedStatus !== undefined) {
            window.pixifiPresetArchivedState.value = settings.archivedStatus;
            // Reset enforce count when applying new settings
            window.pixifiPresetArchivedState.enforceCount = 0;
        }

        // Block refreshLeads from being called multiple times during the settings application
        window._blockRefreshLeads = true;

        try {
            // First, ensure the filter panel is visible to ensure DOM elements are accessible
            if (!$('#filterContainer').hasClass('in')) {
                $('#filterOptionsBtn').click();

                // Give the panel time to open before trying to set values
                setTimeout(() => {
                    applyFilterSettingsInternal(settings);
                }, 300);
                return;
            }

            // Apply settings immediately if panel is already open
            applyFilterSettingsInternal(settings);
        } catch (e) {
            console.error("Error applying filter settings:", e);
            window._blockRefreshLeads = false;
        }
    }

    function applyFilterSettingsInternal(settings) {
        try {
            // Store archived status in multiple places to ensure it persists
            if (settings.archivedStatus !== undefined) {
                window._presetArchivedStatus = settings.archivedStatus;
                window.pixifiPresetArchivedState.value = settings.archivedStatus;
            }

            // Apply values to jQuery UI multiselect widgets
            if (settings.filterStatus && Array.isArray(settings.filterStatus)) {
                applyMultiselectValue('#filterStatus', settings.filterStatus);
            }

            if (settings.filterBrand && Array.isArray(settings.filterBrand)) {
                applyMultiselectValue('#filterBrand', settings.filterBrand);
            }

            if (settings.filterCategory && Array.isArray(settings.filterCategory)) {
                applyMultiselectValue('#filterCategory', settings.filterCategory);
            }

            // Apply main filter fields (for non-multiselect fields)
            setEditableValue($('#priorityCombo'), settings.priorityCombo || '', false);

            // Handle the staffVal field which can be ddSlick or editable
            if (settings.staffVal !== undefined) {
                if ($('#filterStaffCombo').data('editable')) {
                    setEditableValue($('#filterStaffCombo'), settings.staffVal, false);
                } else {
                    // Try to use ddslick
                    try {
                        $('#filterStaffCombo').ddslick('select', { value: settings.staffVal });
                    } catch (e) {
                        console.warn('Error setting ddSlick value:', e);
                        // Fallback - directly set value and trigger change
                        $('#filterStaffCombo .dd-selected-value').val(settings.staffVal).trigger('change');
                    }
                }
            }

            // Apply the archived status view filter - this needs special handling
            if (settings.archivedStatus !== undefined) {
                // First try to set through standard method
                setEditableValue($('#viewFilterCombo'), settings.archivedStatus || '', false);

                // The skinned dropdown CSS might be affected, so also update that
                // Note that the CSS field text needs to match exactly what's shown in the UI
                // This ensures the UI is updated correctly
                const viewFilterText = settings.archivedStatus === "archived" ? "Only Archived Leads" :
                                       settings.archivedStatus === "all" ? "All Active and Archived Leads" :
                                       "Active Leads";
                $('.cmf-skinned-text').filter(function() {
                    return $(this).parent().next('#viewFilterCombo').length > 0;
                }).text(viewFilterText);

                // Use direct DOM manipulation to ensure both the value and display are updated
                $('#viewFilterCombo').val(settings.archivedStatus || '');

                // Try to trigger proper events
                $('#viewFilterCombo')
                    .trigger('change')
                    .trigger('input')
                    .trigger('blur')
                    .trigger('focus')
                    .trigger('blur');
            }

            // Apply other main filter fields
            setEditableValue($('#readUnreadCombo'), settings.readUnreadCombo || '', false);
            setEditableValue($('#filterEventType'), settings.filterEventType || '', false);
            setEditableValue($('#referralSourceCombo'), settings.referralSourceCombo || '', false);

            if (settings.category_filter_type) {
                setEditableValue($('#category_filter_type'), settings.category_filter_type, false);
            }

            // Set date fields
            if (settings.firstContactStart) $('#firstContactStart').val(settings.firstContactStart);
            if (settings.firstContactEnd) $('#firstContactEnd').val(settings.firstContactEnd);
            if (settings.eventDateStart) $('#eventDateStart').val(settings.eventDateStart);
            if (settings.eventDateEnd) $('#eventDateEnd').val(settings.eventDateEnd);

            // Apply custom field values
            for (const key in settings) {
                if (key.startsWith('item_')) {
                    const $el = $(`#${key}`);

                    if ($el.length) {
                        // Handle different input types
                        if ($el.attr('type') === 'checkbox') {
                            if (settings[key] === '1') {
                                $el.prop('checked', true).change();

                                // If it's a jQuery UI button or similar, update its appearance
                                if ($el.hasClass('ibutton-container') || $el.parent().hasClass('ibutton-container')) {
                                    // This might need plugin-specific code like .button('toggle')
                                    if (typeof $el.iButton === 'function') {
                                        $el.iButton('toggle', true);
                                    }
                                }
                            } else {
                                $el.prop('checked', false).change();
                                if (typeof $el.iButton === 'function') {
                                    $el.iButton('toggle', false);
                                }
                            }
                        }
                        // For checkbox groups
                        else if (key.match(/^item_\d+$/) && Array.isArray(settings[key])) {
                            // Uncheck all checkboxes in this group first
                            $(`input[name="${key}[]"]`).prop('checked', false);

                            // Check only the ones in our settings
                            for (const val of settings[key]) {
                                $(`input[name="${key}[]"][value="${val}"]`).prop('checked', true);
                            }

                            // Trigger change event on the first checkbox to notify any listeners
                            $(`input[name="${key}[]"]`).first().change();
                        }
                        // For select and other inputs
                        else {
                            $el.val(settings[key]).change();
                        }
                    }
                }
            }

            // Force the refresh of multiselect widgets UI
            refreshMultiselectWidgets();

            // Clean up any skinned select elements that need refreshing
            refreshSkinnedSelects();

            // Set a flag to block any refreshLeads calls not initiated by us
            window.pixifiPresetArchivedState.inProgress = true;

            // Finally refresh the leads
            window._blockRefreshLeads = false;

            // Use our direct refresh method that enforces the archived status
            forceLeadsRefresh();

            // Set a repeating scheduled task to enforce the filter
            scheduleFilterEnforcement();
        } catch (e) {
            console.error("Error in applyFilterSettingsInternal:", e);
            window._blockRefreshLeads = false;
            window.pixifiPresetArchivedState.inProgress = false;
            refreshLeads();
        }
    }

    // Force a refresh of leads by directly calling the AJAX request
    function forceLeadsRefresh(isEnforcementRefresh = false) {
        try {
            // Set a global flag to indicate we're in the middle of a refresh
            window.pixifiPresetArchivedState.inProgress = true;

            // If this is an enforcement refresh, increment the counter
            if (isEnforcementRefresh) {
                window.pixifiPresetArchivedState.enforceCount++;

                // Only allow up to 5 enforcement refreshes to prevent infinite loops
                if (window.pixifiPresetArchivedState.enforceCount > 5) {
                    console.log("Reached maximum enforcement attempts, stopping");
                    window.pixifiPresetArchivedState.inProgress = false;
                    return;
                }
            } else {
                // Reset counter for new refreshes
                window.pixifiPresetArchivedState.enforceCount = 0;
            }

            // Get current page
            const currentPage = $('#page').val() || 1;

            // Create an object with all filter parameters
            const data = {
                page: currentPage,
                pagesize: $('#pageSize').val() || 25,
                view: window.pixifiPresetArchivedState.value !== null ?
                      window.pixifiPresetArchivedState.value :
                      ($('#viewFilterCombo').val() || ""),
                status: $('#filterStatus').val() || [],
                priority: $('#priorityCombo').val() || "",
                brand: $('#filterBrand').val() || [],
                staff: $('#filterStaffCombo').hasClass('dd-container') ?
                    $('.dd-selected-value', $('#filterStaffCombo')).val() :
                    $('#filterStaffCombo').val(),
                readUnread: $('#readUnreadCombo').val() || "",
                eventType: $('#filterEventType').val() || "",
                referral: $('#referralSourceCombo').val() || "",
                category: $('#filterCategory').val() || [],
                categoryFilterType: $('#category_filter_type').val() || "any",
                date_sort: $('#date_sort').val() || 0,
                date_sort_dir: $('#date_sort_dir').val() || "D",

                // Date ranges
                firstContactStart: $('#firstContactStart').val() || "",
                firstContactEnd: $('#firstContactEnd').val() || "",
                eventDateStart: $('#eventDateStart').val() || "",
                eventDateEnd: $('#eventDateEnd').val() || "",
            };

            // Custom field filters
            let customFieldFilters = "";
            $('#objectListingCustomFieldFilters input, #objectListingCustomFieldFilters select').each(function() {
                const $el = $(this);
                const id = $el.attr('id');

                if (id && id.match(/^item_\d+$/)) {
                    if ($el.attr('type') === 'checkbox') {
                        if ($el.prop('checked')) {
                            customFieldFilters += `${id}=1&`;
                        } else {
                            customFieldFilters += `${id}=0&`;
                        }
                    } else {
                        customFieldFilters += `${id}=${encodeURIComponent($el.val())}&`;
                    }
                }
            });

            data.customFieldFilters = customFieldFilters;

            // Show loading indicator with status message for debugging
            const viewModeText = data.view === "archived" ? "Only Archived Leads" :
                                data.view === "all" ? "All Active and Archived Leads" :
                                "Active Leads Only";

            const loadingHTML = `<div style="margin: 20px auto; text-align: center;">
                                    <span class="fa fa-refresh fa-spin fa-3x"></span>
                                    <p>Loading leads (${viewModeText})...</p>
                                </div>`;
            $('#leads-table tbody').html(loadingHTML);

            // Make a direct AJAX call
            $.ajax({
                url: '/admin/leads/list_leads/',
                type: 'POST',
                data: data,
                success: function(response) {
                    $('#leads-table tbody').html(response);

                    // Check if there are archived leads when there shouldn't be
                    const hasArchivedLeads = $('#leads-table tr.lead-row.archived-lead').length > 0;

                    if (window.pixifiPresetArchivedState.value === "" && hasArchivedLeads) {
                        console.log("Detected archived leads when they should be filtered out, enforcing filter");
                        // Wait a moment then enforce the filter again
                        setTimeout(() => {
                            if (!window.pixifiPresetArchivedState.inProgress) {
                                forceLeadsRefresh(true);
                            }
                        }, 250);
                    } else {
                        window.pixifiPresetArchivedState.inProgress = false;
                    }

                    // Update any pagination or counters
                    updateLeadCount();
                },
                error: function() {
                    $('#leads-table tbody').html('<tr><td colspan="10">Error loading leads. Please try again.</td></tr>');
                    window.pixifiPresetArchivedState.inProgress = false;
                }
            });
        } catch (e) {
            console.error("Error in forceLeadsRefresh:", e);
            window.pixifiPresetArchivedState.inProgress = false;
            // Fall back to standard refresh
            refreshLeads();
        }
    }

    // Set up a monitor to ensure our filter setting persists
    function scheduleFilterEnforcement() {
        // Clear any existing timers
        if (window._filterEnforcementTimer) {
            clearTimeout(window._filterEnforcementTimer);
        }

        // Only set up enforcement if we have a specific archived value to enforce
        if (window.pixifiPresetArchivedState.value !== null) {
            // Check now, and set up recurring checks
            monitorAndEnforceFilter();

            // Schedule periodic checks for the next 5 seconds
            window._filterEnforcementTimer = setTimeout(() => {
                monitorAndEnforceFilter();

                // Set up additional check after a longer delay
                setTimeout(monitorAndEnforceFilter, 1000);
            }, 500);
        }
    }

    // Check and enforce our filter setting if needed
    function monitorAndEnforceFilter() {
        // Only proceed if we're not already refreshing and have a value to enforce
        if (!window.pixifiPresetArchivedState.inProgress &&
            window.pixifiPresetArchivedState.value !== null) {

            const currentViewFilterValue = $('#viewFilterCombo').val();

            // If the view filter has changed from our setting, enforce it
            if (currentViewFilterValue !== window.pixifiPresetArchivedState.value) {
                console.log(`Filter changed from ${window.pixifiPresetArchivedState.value} to ${currentViewFilterValue}, enforcing`);

                // Update the UI element
                $('#viewFilterCombo').val(window.pixifiPresetArchivedState.value);

                // Update the skinned text display
                const viewFilterText = window.pixifiPresetArchivedState.value === "archived" ? "Only Archived Leads" :
                                      window.pixifiPresetArchivedState.value === "all" ? "All Active and Archived Leads" :
                                      "Active Leads";

                $('.cmf-skinned-text').filter(function() {
                    return $(this).parent().next('#viewFilterCombo').length > 0;
                }).text(viewFilterText);

                // Force a refresh with our setting
                forceLeadsRefresh(true);
            }

            // Also check the results to see if we need to enforce
            const hasArchivedLeads = $('#leads-table tr.lead-row.archived-lead').length > 0;

            if (window.pixifiPresetArchivedState.value === "" && hasArchivedLeads) {
                console.log("Detected archived leads when they should be filtered out, enforcing filter");
                forceLeadsRefresh(true);
            }
        }
    }

    // Update the lead count display
    function updateLeadCount() {
        try {
            const leadCount = $('#leads-table tbody tr').length;
            const countDisplay = $('#lead-count');
            if (countDisplay.length) {
                countDisplay.text(leadCount);
            }
        } catch (e) {
            console.warn("Error updating lead count:", e);
        }
    }

    // Function to properly apply values to jQuery UI multiselect widgets
    function applyMultiselectValue(selector, values) {
        const $el = $(selector);
        if (!$el.length) return;

        // First, set the underlying select's values
        $el.val(values);

        // Try to find the multiselect widget for this element
        const $multiselectWidget = $(`.ui-multiselect-menu[id^="ui-multiselect-${selector.substring(1)}"]`);

        if ($multiselectWidget.length) {
            // Update the checkboxes in the multiselect widget
            $multiselectWidget.find('input[type="checkbox"]').each(function() {
                const $checkbox = $(this);
                const value = $checkbox.val();
                const shouldBeChecked = values.includes(value);

                // Only change if needed to avoid triggering unnecessary events
                if ($checkbox.prop('checked') !== shouldBeChecked) {
                    $checkbox.prop('checked', shouldBeChecked);
                }
            });
        }

        // Update the displayed text in the multiselect button
        const $multiselectButton = $(`a.ui-multiselect[aria-owns="ui-multiselect-${selector.substring(1)}-menu"]`);
        if ($multiselectButton.length) {
            if (values.length > 0) {
                $multiselectButton.find('span:last').text(`${values.length} selected`);
            } else {
                $multiselectButton.find('span:last').text('Filter by Status...');
            }
        }

        // Also try to call the multiselect('refresh') method if it exists
        try {
            $el.multiselect('refresh');
        } catch (e) {
            console.warn('Multiselect refresh failed, continuing with DOM updates:', e);
        }

        // Ensure the change event fires
        $el.trigger('change');
    }

    // Refresh skinned select elements that need special handling
    function refreshSkinnedSelects() {
        // Get all skinned selects and update their text to match the selected option
        $('.cmf-skinned-select').each(function() {
            const $skinSelect = $(this);
            const $select = $skinSelect.find('select');
            const $display = $skinSelect.find('.cmf-skinned-text');

            if ($select.length && $display.length) {
                const selectedOption = $select.find('option:selected');
                if (selectedOption.length) {
                    $display.text(selectedOption.text());
                }
            }
        });
    }

    // Function to refresh all multiselect widgets
    function refreshMultiselectWidgets() {
        try {
            // The site explicitly calls these refreshes when filter fields change
            $("#filterStatus").multiselect('refresh');
            $("#filterBrand").multiselect('refresh');

            // Also try to refresh category if needed
            try {
                $("#filterCategory").multiselect('refresh');
            } catch(e) {
                console.warn('Error refreshing filterCategory:', e);
            }
        } catch(e) {
            console.warn('Error refreshing multiselect widgets:', e);
        }
    }

    // Monkey patch the page's refreshLeads function to add our blocker
    function patchRefreshLeads() {
        if (typeof window.refreshLeads === 'function') {
            const originalRefreshLeads = window.refreshLeads;
            window.refreshLeads = function(...args) {
                if (window._blockRefreshLeads) return;

                // Check if we have an archived status to enforce
                if (window.pixifiPresetArchivedState.value !== null &&
                    !window.pixifiPresetArchivedState.inProgress) {
                    console.log("Intercepting refreshLeads call to enforce archived status");
                    forceLeadsRefresh();
                    return;
                }

                // If we're already in the middle of our own refresh, don't interfere
                if (window.pixifiPresetArchivedState.inProgress) {
                    return;
                }

                // Otherwise, call the original
                originalRefreshLeads.apply(this, args);

                // Check after the refresh to ensure our filter is still applied
                setTimeout(monitorAndEnforceFilter, 100);
            };
        }
    }

    // Patch AJAX send to ensure our archived status is used
    function patchAjaxSend() {
        $(document).ajaxSend((event, xhr, settings) => {
            // Only intercept lead list requests
            if (settings.url && settings.url.includes('/admin/leads/list_leads/')) {
                // If we have an active filter value and we're not in the middle of our own request
                if (window.pixifiPresetArchivedState.value !== null &&
                    !window.pixifiPresetArchivedState.inProgress) {

                    // Parse the data
                    if (typeof settings.data === 'string') {
                        const urlParams = new URLSearchParams(settings.data);
                        urlParams.set('view', window.pixifiPresetArchivedState.value);
                        settings.data = urlParams.toString();
                        console.log("Modified AJAX request:", settings.data);
                    } else if (typeof settings.data === 'object') {
                        settings.data.view = window.pixifiPresetArchivedState.value;
                    }
                }
            }
        });

        // Also monitor AJAX responses
        $(document).ajaxComplete((event, xhr, settings) => {
            // Only check lead list responses
            if (settings.url && settings.url.includes('/admin/leads/list_leads/')) {
                // Wait a moment then check if our filter is still applied
                setTimeout(monitorAndEnforceFilter, 50);
            }
        });
    }

    /*************************************************************
     *  2. STORING FILTER PRESETS IN TAMPERMONKEY GM STORAGE
     *************************************************************/
    const STORAGE_KEY = 'customFilterPresets_v2'; // Updated version for expanded fields

    function loadPresets() {
        try {
            return JSON.parse(GM_getValue(STORAGE_KEY, '[]'));
        } catch(e) {
            return [];
        }
    }

    function savePresets(presets) {
        GM_setValue(STORAGE_KEY, JSON.stringify(presets));
    }

    /*************************************************************
     *  3. INJECTING THE 'PRESET FILTERS' DROPDOWN
     *************************************************************/
    function injectPresetFiltersDropdown() {
        // We find the container that holds the "Filter Options" button:
        const $leftTitle = $('.leftTitle').first();
        if (!$leftTitle.length) {
            console.warn("Could not find .leftTitle container!");
            return;
        }

        // Build the dropdown HTML
        const dropdownHtml = `
            <div class="btn-group" style="margin-left: 5px;" id="presetFiltersDropdown">
              <button type="button" class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown">
                Preset Filters <span class="caret"></span>
              </button>
              <ul class="dropdown-menu" id="presetFiltersMenu" role="menu">
                <!-- Dynamic items go here -->
              </ul>
            </div>
        `;
        // Insert it right after the #filterOptionsBtn or anywhere inside .leftTitle
        const $filterOptionsBtn = $('#filterOptionsBtn');
        if ($filterOptionsBtn.length) {
            $filterOptionsBtn.after(dropdownHtml);
        } else {
            // fallback: just append to .leftTitle
            $leftTitle.append(dropdownHtml);
        }

        // Populate the dropdown from our saved presets
        refreshPresetFiltersMenu();
    }

    function refreshPresetFiltersMenu() {
        const $menu = $('#presetFiltersMenu');
        if (!$menu.length) return;

        $menu.empty();

        const presets = loadPresets();

        // Add an <li> for each preset
        presets.forEach((preset, idx) => {
            const $li = $(`
                <li>
                  <a href="javascript:void(0);" style="padding:5px 15px;">
                    ${escapeHtml(preset.presetName)}
                  </a>
                </li>
            `);
            $li.on('click', () => {
                // Ensure the filter options panel is open first, then apply settings
                if (!$('#filterContainer').hasClass('in')) {
                    // If filter panel isn't open, click the filter options button then apply settings after a delay
                    $('#filterOptionsBtn').click();
                    setTimeout(() => {
                        applyFilterSettings(preset.data);
                    }, 500); // Allow time for panel to open
                } else {
                    // Filter panel is already open, apply immediately
                    applyFilterSettings(preset.data);
                }
            });
            $menu.append($li);
        });

        // Add a divider + "Manage..."
        $menu.append('<li role="separator" class="divider"></li>');
        const $manageLi = $('<li><a href="javascript:void(0);">Manage Saved Filters...</a></li>');
        $manageLi.on('click', () => {
            showManageFiltersModal();
        });
        $menu.append($manageLi);
    }

    /*************************************************************
     *  4. MANAGE FILTERS MODAL
     *************************************************************/
    function injectManageFiltersModal() {
        // If you already have your own modal system, adapt as needed.
        // Below is a typical Bootstrap modal structure:
        const modalHtml = `
            <div class="modal fade" id="manageFiltersModal" tabindex="-1" role="dialog" aria-labelledby="manageFiltersModalLabel">
              <div class="modal-dialog" role="document">
                <div class="modal-content" style="background: #fff;">
                  <div class="modal-header">
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                      <span aria-hidden="true" style="color:#F00">&times;</span>
                    </button>
                    <h4 class="modal-title" id="manageFiltersModalLabel">Manage Saved Filters</h4>
                  </div>
                  <div class="modal-body">
                    <!-- "Create New" from current filter state: -->
                    <button class="btn btn-success" id="createNewFilterBtn" style="margin-bottom: 10px;">
                      Create New Filter from Current Settings
                    </button>
                    <div id="savedFiltersList"></div>
                  </div>
                </div>
              </div>
            </div>
        `;
        $('body').append(modalHtml);

        // Hook up "Create New Filter from Current Settings"
        $('#createNewFilterBtn').on('click', () => {
            // Check if filter panel is open - if not, alert user
            if (!$('#filterContainer').hasClass('in')) {
                alert("Please open the Filter Options panel first, then create a preset.");
                $('#filterOptionsBtn').click();
                return;
            }

            const name = prompt("Enter a name for this new preset filter:");
            if(!name) return;

            const currentData = getCurrentFilterSettings();
            const allPresets = loadPresets();
            allPresets.push({
                presetName: name,
                createdAt: Date.now(),
                data: currentData
            });
            savePresets(allPresets);
            alert("New filter saved!");
            renderSavedFiltersList();
            refreshPresetFiltersMenu();
        });
    }

    function showManageFiltersModal() {
        renderSavedFiltersList();
        // If using Bootstrap, show it:
        $('#manageFiltersModal').modal('show');
    }

    function renderSavedFiltersList() {
        const $container = $('#savedFiltersList');
        $container.empty();

        const presets = loadPresets();
        if (!presets.length) {
            $container.html('<p>No saved filters yet!</p>');
            return;
        }

        // For each preset, show a small panel with "Overwrite" + "Delete"
        presets.forEach((preset, idx) => {
            const $item = $(`
                <div style="border:1px solid #ccc; padding:5px; margin-bottom:5px;">
                  <strong>${escapeHtml(preset.presetName)}</strong><br/>
                  <button class="btn btn-xs btn-info">Save Current Filter Settings (Overwrite)</button>
                  <button class="btn btn-xs btn-danger">Delete</button>
                </div>
            `);

            // Overwrite
            $item.find('.btn-info').on('click', () => {
                // Check if filter panel is open - if not, alert user
                if (!$('#filterContainer').hasClass('in')) {
                    alert("Please open the Filter Options panel first, then update the preset.");
                    $('#filterOptionsBtn').click();
                    return;
                }

                if (!confirm(`Overwrite preset "${preset.presetName}" with current filter settings?`)) return;
                const all = loadPresets();
                all[idx].data = getCurrentFilterSettings();
                savePresets(all);
                alert("Preset updated!");
                refreshPresetFiltersMenu();
            });

            // Delete
            $item.find('.btn-danger').on('click', () => {
                if (!confirm(`Delete preset "${preset.presetName}"?`)) return;
                const all = loadPresets();
                all.splice(idx,1);
                savePresets(all);
                alert("Preset deleted.");
                renderSavedFiltersList();
                refreshPresetFiltersMenu();
            });

            $container.append($item);
        });
    }

    /*************************************************************
     *  5. UTILITY
     *************************************************************/
    function escapeHtml(str) {
        return (str || '').toString()
            .replace(/&/g,"&amp;")
            .replace(/</g,"&lt;")
            .replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;")
            .replace(/'/g,"&#039;");
    }

    /*************************************************************
     *  6. INIT ON PAGE LOAD
     *************************************************************/
    $(function(){
        // Set up a reset button
        $('<button>')
            .addClass('btn btn-xs btn-default')
            .text('Reset Filter State')
            .css({ position: 'fixed', bottom: '10px', right: '10px', zIndex: 9999 })
            .on('click', function() {
                window.pixifiPresetArchivedState.value = null;
                alert('Filter state reset. Page will reload.');
                window.location.reload();
            })
            .appendTo('body');

        // --- Custom Per-Page Input Injection ---
        // Wait for the page size dropdown to exist, with polling for dynamic loads
        function injectCustomPageSizeInput() {
            const $dropdown = $('#itemsPerPage_lead');
            if ($dropdown.length && !$dropdown.data('customInputInjected')) {
                // Create input and button
                const $input = $('<input type="number" min="1" step="1" placeholder="Custom" style="width:60px; margin-left:8px;" title="Enter custom leads per page and press Enter or click Set">');
                const $btn = $('<button type="button" class="btn btn-xs btn-info" style="margin-left:4px;">Set</button>');
                $input.on('keydown', function(e) {
                    if (e.key === 'Enter') {
                        $btn.click();
                    }
                });
                $btn.on('click', function() {
                    let val = parseInt($input.val(), 10);
                    if (!isNaN(val) && val > 0) {
                        // Add option if not present
                        if ($dropdown.find('option[value="'+val+'"]').length === 0) {
                            $dropdown.append($('<option>', { value: val, text: val }));
                        }
                        $dropdown.val(val);
                        $dropdown.trigger('change');
                        // Update skinned text if present
                        const $skin = $dropdown.closest('.cmf-skinned-select').find('.cmf-skinned-text');
                        if ($skin.length) $skin.text(val);
                    } else {
                        alert('Please enter a valid positive number.');
                    }
                });
                $dropdown.after($input).after($btn);
                $dropdown.data('customInputInjected', true);
            }
        }
        // Poll for up to 10 seconds after page load
        let injectTries = 0;
        function pollInjectCustomPageSizeInput() {
            injectCustomPageSizeInput();
            injectTries++;
            if (!$('#itemsPerPage_lead').data('customInputInjected') && injectTries < 100) {
                setTimeout(pollInjectCustomPageSizeInput, 100);
            }
        }
        pollInjectCustomPageSizeInput();
        $(document).ajaxComplete(injectCustomPageSizeInput);
        // --- End Custom Per-Page Input Injection ---

        // Patch the AJAX first (must be before refreshLeads is patched)
        patchAjaxSend();

        // Patch the refreshLeads function
        patchRefreshLeads();

        // Inject the dropdown next to "Filter Options" in the .leftTitle area.
        injectPresetFiltersDropdown();

        // Inject the manage-filters modal into the page (hidden by default).
        injectManageFiltersModal();

        // If there's a hash parameter for loading a preset, handle it
        if (location.hash && location.hash.startsWith('#preset=')) {
            const presetName = decodeURIComponent(location.hash.substring(8));
            const presets = loadPresets();
            const preset = presets.find(p => p.presetName === presetName);
            if (preset) {
                // Small delay to ensure the page has finished loading
                setTimeout(() => {
                    // Open filter panel if not already open
                    if (!$('#filterContainer').hasClass('in')) {
                        $('#filterOptionsBtn').click();
                        setTimeout(() => {
                            applyFilterSettings(preset.data);
                        }, 500);
                    } else {
                        applyFilterSettings(preset.data);
                    }
                }, 500);
            }
        }
    });

})();

