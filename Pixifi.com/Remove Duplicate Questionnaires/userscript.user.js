// File: scripts/tampermonkey_removeDuplicateQuestionnaires.user.js
// ==UserScript==
// @name         Remove Duplicate Questionnaires
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds a "Remove Duplicate Questionnaires" button next to the "Create New Questionnaire from Template" button
// @author       You
// @match        https://www.pixifi.com/admin/leads/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function addRemoveButtonIfNeeded() {
        // The button may be inserted dynamically, so we search for it each time
        const targetButton = document.querySelector('div.rightTitle a.btn.btn-default.btn-sm[onclick*="addNewObjectQuestionnaire"]');
        if (targetButton && !document.getElementById('removeDuplicateQuestionnairesButton')) {
            // Create the "Remove Duplicate Questionnaires" button
            const removeButton = document.createElement('a');
            removeButton.id = 'removeDuplicateQuestionnairesButton';
            removeButton.href = 'javascript:void(0);';
            removeButton.className = 'btn btn-default btn-sm';
            removeButton.style.marginLeft = '10px';
            removeButton.innerHTML = '<i class="fa fa-trash font-red"></i> Remove Duplicate Questionnaires';

            // Insert our new button next to the existing one
            targetButton.parentNode.insertBefore(removeButton, targetButton.nextSibling);

            // Add click event to the new button
            removeButton.addEventListener('click', function() {
                // Extract objID from current URL
                const currentUrl = window.location.href;
                const objIDMatches = currentUrl.match(/(\d+)\/?$/);
                const objID = objIDMatches ? objIDMatches[1] : null;

                if (!objID) {
                    console.error("No object ID found in URL.");
                    return;
                }

                // Select all questionnaires
                const questionnairesContainer = document.getElementById('questionnairesListingDIV');
                if (!questionnairesContainer) {
                    console.error("Questionnaires container not found.");
                    return;
                }

                const questionnaires = questionnairesContainer.querySelectorAll('div[id^="questionnaire_"]');

                // Keep only the first two questionnaires
                const limit = 1;

                for (let i = limit; i < questionnaires.length; i++) {
                    const questionnaireElement = questionnaires[i];
                    const questionnaireID = questionnaireElement.id.replace('questionnaire_', '');

                    // Delete the questionnaire via the provided API call
                    fetch(`https://www.pixifi.com/admin/fn/quest/deleteQuestionnaireFromObject/?clientID=12295&questionnaireID=${questionnaireID}&objType=lead&objID=${objID}`, {
                        "headers": {
                            "accept": "*/*",
                            "x-requested-with": "XMLHttpRequest"
                        },
                        "referrer": currentUrl,
                        "method": "GET",
                        "credentials": "include"
                    })
                    .then(response => {
                        if (response.ok) {
                            // If deletion successful, remove from DOM
                            questionnaireElement.remove();
                        } else {
                            console.error(`Failed to delete questionnaire ${questionnaireID}`);
                        }
                    })
                    .catch(error => console.error(`Error deleting questionnaire ${questionnaireID}:`, error));
                }
            });
        }
    }

    // Some parts of the page load dynamically, so we use a MutationObserver to ensure the button shows up after the target element appears
    const observer = new MutationObserver(addRemoveButtonIfNeeded);
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial attempt in case elements are already present
    addRemoveButtonIfNeeded();
})();
