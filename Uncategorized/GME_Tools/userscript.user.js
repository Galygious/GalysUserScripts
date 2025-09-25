// ==UserScript==
// @name         GME_Tools
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  A shared library of tools for Galy's Tampermonkey scripts.
// @author       Galy
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function(window) {
    'use strict';

    console.log('GME_Tools library loaded.');

    const GME_Tools = {
        /**
         * Waits for an element to exist in the DOM.
         * @param {string} selector - The CSS selector of the element.
         * @param {number} [timeout=10000] - The maximum time to wait in milliseconds.
         * @returns {Promise<Element>} A promise that resolves with the element when it's found.
         */
        waitForElement: (selector, timeout = 10000) =>
            new Promise((resolve, reject) => {
                const immediate = document.querySelector(selector);
                if (immediate) return resolve(immediate);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timed out after ${timeout}ms waiting for selector: ${selector}`));
                }, timeout);
            }),
    };

    class PixifiAPI {
        // A private, reusable fetch wrapper
        async #fetch(endpoint, { data, method = 'POST' }) {
            const url = `https://www.pixifi.com${endpoint}`;
            const body = new URLSearchParams(data).toString();

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body
            });

            if (!response.ok) {
                throw new Error(`Pixifi API request failed: ${response.status} ${response.statusText}`);
            }

            let text = await response.text();

            if (text.startsWith('SUCCESS{|}')) {
                return text.substring('SUCCESS{|}'.length);
            }
            if (text.startsWith('ERROR{|}')) {
                throw new Error(`Pixifi API Error: ${text.substring('ERROR{|}'.length)}`);
            }

            return text;
        }

        // Domain for category-related actions
        categories = {
            getAddForm: (objectType, objectID, clientID = 12295) => {
                 const data = { clientID, objectType, objectID };
                 return this.#fetch('/admin/fn/misc/getAddObjectCategoryForm/', { data });
            },
            associate: (objectType, objectID, categoryID, clientID = 12295) => {
                 const data = { clientID, categoryID, objectType, objectID };
                 return this.#fetch('/admin/fn/misc/associateObjectCategoryToItem/', { data });
            },
            refreshListing: (objectType, objectID, clientID = 12295) => {
                 const data = { clientID, objectType, objectID };
                 return this.#fetch('/admin/fn/misc/refreshObjectCategoriesListing/', { data });
            }
        };

        // Other domains like 'leads', 'events', 'clients' can be added here
    }


    // Expose the library to the window object
    window.GME_Tools = {
        ...GME_Tools,
        PixifiAPI
    };

})(window);
