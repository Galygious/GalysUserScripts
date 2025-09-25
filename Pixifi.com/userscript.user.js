// ==UserScript==
// @name         Questionaire Response Display
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Display quest item answers in the portlet
// @author       You
// @match        https://www.pixifi.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function displayQuestAnswers() {
        // Quest items with their labels
        const questData = [
            { id: 'questitem_13804', label: 'Parking:' },
            { id: 'questitem_16318', label: 'Stairs:' },
            { id: 'questitem_16898', label: 'Pets:' }
        ];

        // Find the leadEvents div and its portlet-body child
        const leadEventsDiv = document.getElementById('leadEvents');
        if (!leadEventsDiv) {
            return;
        }

        const portletBody = leadEventsDiv.querySelector('.portlet-body');
        if (!portletBody) {
            return;
        }

        // Remove any existing quest answer elements
        const existingQuestElements = portletBody.querySelectorAll('.normalThinRowStyle .leftTitle');
        existingQuestElements.forEach(leftTitle => {
            if (leftTitle.textContent.includes('Parking:') ||
                leftTitle.textContent.includes('Stairs:') ||
                leftTitle.textContent.includes('Pets:')) {
                leftTitle.closest('.normalThinRowStyle').remove();
            }
        });

        // Create elements for each quest item
        const answerElements = [];

        questData.forEach((quest) => {
            // Only look for quest items inside #customFieldsDIV
            const customFieldsDiv = document.getElementById('customFieldsDIV');
            let item = null;
            if (customFieldsDiv) {
                item = customFieldsDiv.querySelector(`#${quest.id}`);
            }
            let answer = 'no';

            if (item) {
                const rightTitleDiv = item.querySelector('.rightTitle');
                if (rightTitleDiv) {
                    // Get text content, but filter out extra whitespace and newlines
                    let text = rightTitleDiv.textContent || '';
                    // Remove excessive whitespace and newlines
                    text = text.replace(/\s+/g, ' ').trim();
                    // Filter out common empty/placeholder text
                    if (text === 'Empty' || text === '') {
                        text = '';
                    }
                    // If it's empty or just whitespace, try to get text from child elements
                    if (!text) {
                        const spans = rightTitleDiv.querySelectorAll('span');
                        if (spans.length > 0) {
                            text = Array.from(spans).map(span => span.textContent.trim()).filter(t => t && t !== 'Empty').join(', ');
                        }
                        // Also check for links/text inputs
                        if (!text) {
                            const links = rightTitleDiv.querySelectorAll('a');
                            if (links.length > 0) {
                                text = Array.from(links).map(link => link.textContent.trim()).filter(t => t && t !== 'Empty').join(', ');
                            }
                        }
                    }
                    answer = text || 'no';
                }
            }

            // Create new normalThinRowStyle element
            const answerElement = document.createElement('div');
            answerElement.className = 'normalThinRowStyle';
            answerElement.innerHTML = `
                <div class="leftTitle">${quest.label}</div>
                <div class="rightTitle">${answer}</div>
                <div class="clearSmall"><br style="clear: both; "></div>
            `;

            answerElements.push(answerElement);
        });

        // Insert all elements in the correct order (Parking, then Stairs, then Pets)
        const eventNoticeElement = portletBody.querySelector('#eventNoticeElement');
        if (eventNoticeElement) {
            let insertAfter = eventNoticeElement;
            answerElements.forEach(element => {
                insertAfter.insertAdjacentElement('afterend', element);
                insertAfter = element; // Next element goes after this one
            });
        } else {
            // Fallback: insert at the end
            answerElements.forEach(element => {
                portletBody.appendChild(element);
            });
        }
    }

    // Function to check if required elements are loaded
    function waitForElements() {
        // Check for quest items
        const targetIds = ['questitem_13804', 'questitem_16318', 'questitem_16898'];
        const questItemsLoaded = targetIds.some(id => document.getElementById(id) !== null);

        // Check for event notice element
        const eventNoticeLoaded = document.getElementById('eventNoticeElement') !== null;

        return questItemsLoaded && eventNoticeLoaded;
    }

    // Function to initialize
    function init() {
        if (!waitForElements()) {
            // If required elements not loaded yet, wait and try again
            setTimeout(init, 500);
            return;
        }

        // Check if we already added the answers
        const leadEventsDiv = document.getElementById('leadEvents');
        if (leadEventsDiv) {
            const existingLabels = leadEventsDiv.querySelectorAll('.leftTitle');
            const hasQuestLabels = Array.from(existingLabels).some(label =>
                label.textContent.includes('Parking:') ||
                label.textContent.includes('Stairs:') ||
                label.textContent.includes('Pets:')
            );
            if (hasQuestLabels) {
                return; // Already added
            }
        }

        displayQuestAnswers();
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
