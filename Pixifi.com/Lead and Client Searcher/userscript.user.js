// ==UserScript==
// @name         Pixifi Lead and Client Searcher
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  Search for leads or clients on Pixifi, display multiple results in a modal for selection, and open the selected link in a new tab while keeping the modal open until manually closed.
// @author       Your Name
// @match        https://www.pixifi.com/admin/leads/*
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const clientID = "12295"; // Fixed client ID

    /**
     * Display links in a modal for user selection
     * @param {Array} links - Array of link elements
     * @param {string} type - Type of results (e.g., "Lead" or "Client")
     */
    function showSelectionModal(links, type) {
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0px 4px 6px rgba(0,0,0,0.3)',
            zIndex: '2000',
            fontFamily: 'Arial, sans-serif',
            maxWidth: '400px',
            overflowY: 'auto',
        });

        modal.innerHTML = `
            <h3>Select a ${type}</h3>
            <ul style="list-style: none; padding: 0;">
                ${links
                    .map(
                        (link, index) =>
                            `<li style="margin-bottom: 10px;">
                                <button style="width: 100%; padding: 10px; text-align: left;" data-index="${index}">
                                    ${link.innerText || link.getAttribute('href')}
                                </button>
                            </li>`
                    )
                    .join('')}
            </ul>
            <button id="closeModal" style="display: block; margin: 20px auto 0; padding: 10px 20px; background-color: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer;">
                Close
            </button>
        `;

        // Add event listeners to open selected links without closing the modal
        modal.querySelectorAll('button[data-index]').forEach(button => {
            button.addEventListener('click', e => {
                const index = e.target.getAttribute('data-index');
                const link = links[index].getAttribute('href');
                const absoluteLink = new URL(link, window.location.origin).href;
                window.open(absoluteLink, '_blank');
            });
        });

        // Close button to manually close the modal
        modal.querySelector('#closeModal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        document.body.appendChild(modal);
    }

    /**
     * Perform a search on Pixifi leads
     * @param {string} searchQuery - The search query string
     */
    async function searchLeads(searchQuery) {
        console.log(`Searching for leads with query: ${searchQuery}`);
        try {
            const response = await fetch("https://www.pixifi.com/admin/fn/leads/getLeads/", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                referrer: "https://www.pixifi.com/admin/leads/",
                referrerPolicy: "strict-origin-when-cross-origin",
                body: new URLSearchParams({
                    clientID,
                    page: 1,
                    section: "id",
                    searchQuery,
                    dir: "D",
                    viewFilter: "all"
                }).toString(),
                method: "POST",
                mode: "cors",
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const text = await response.text();
            console.log('Lead Search Raw response:', text);

            // Extract the links for leads
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");
            const leadLinks = [...doc.querySelectorAll('a[href^="/admin/leads/"]')];

            if (leadLinks.length > 0) {
                showSelectionModal(leadLinks, 'Lead');
            } else {
                console.warn('No leads found, falling back to client search.');
                searchClients(searchQuery); // Fallback to client search
            }
        } catch (error) {
            console.error('Error:', error);
            alert(`Lead search failed: ${error.message}`);
        }
    }

    /**
     * Perform a search for clients on Pixifi
     * @param {string} searchQuery - The search query string
     */
    async function searchClients(searchQuery) {
        console.log(`Searching for clients with query: ${searchQuery}`);
        try {
            const response = await fetch("https://www.pixifi.com/admin/fn/clients/getClientListing/", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                referrer: "https://www.pixifi.com/admin/clients/",
                referrerPolicy: "strict-origin-when-cross-origin",
                body: new URLSearchParams({
                    clientID,
                    page: 1,
                    searchQuery,
                    section: "name",
                    dir: "A",
                    archived: "unarchived",
                    card: "all"
                }).toString(),
                method: "POST",
                mode: "cors",
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const text = await response.text();
            console.log('Client Search Raw response:', text);

            // Extract the links for clients
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");
            const clientLinks = [...doc.querySelectorAll('a[href^="/admin/clients/"]')];

            if (clientLinks.length > 0) {
                showSelectionModal(clientLinks, 'Client');
            } else {
                console.warn('No client link found in the response.');
                alert('No clients found. Please refine your search query.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert(`Client search failed: ${error.message}`);
        }
    }

    /**
     * Create the search form on the page
     */
    function createSearchForm() {
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            top: '100px',
            right: '10px',
            backgroundColor: '#f9f9f9',
            border: '1px solid #ccc',
            padding: '10px',
            borderRadius: '5px',
            boxShadow: '0px 4px 6px rgba(0,0,0,0.1)',
            zIndex: '1000',
            fontFamily: 'Arial, sans-serif'
        });

        const searchQueryInput = document.createElement('input');
        Object.assign(searchQueryInput.style, {
            width: '200px',
            marginBottom: '5px',
            padding: '5px',
            border: '1px solid #ccc',
            borderRadius: '3px'
        });
        searchQueryInput.type = 'text';
        searchQueryInput.placeholder = 'Search Query';

        const searchButton = document.createElement('button');
        Object.assign(searchButton.style, {
            display: 'block',
            padding: '5px 10px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontWeight: 'bold',
            textAlign: 'center'
        });
        searchButton.textContent = 'Search';

        // Add event listener to the search button
        searchButton.addEventListener('click', () => {
            const searchQuery = searchQueryInput.value.trim();
            if (searchQuery) {
                searchLeads(searchQuery); // Start with leads
            } else {
                alert('Please enter a Search Query.');
            }
        });

        container.appendChild(searchQueryInput);
        container.appendChild(searchButton);

        document.body.appendChild(container);
    }

    // Initialize the script
    createSearchForm();
})();
