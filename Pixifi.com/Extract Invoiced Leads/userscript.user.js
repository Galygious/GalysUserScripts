// ==UserScript==
// @name         Pixifi - Extract Invoiced Leads to CSV
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Extracts invoiced leads from Pixifi and downloads as CSV.
// @author       You
// @match        https://www.pixifi.com/admin/invoices/
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    GM_registerMenuCommand('Extract Invoiced Leads', extractLeads);

    const BRANDS = {
        '11473': 'BOOKING',
        '15793': 'SESSIONS',
        '18826': 'SCHEDULE',
        '19647': 'RESERVE'
    };

    async function extractLeads() {
        alert('Starting lead extraction. This may take a few moments.');

        let allLeadsData = [];
        const leadUrlsByBrand = {};

        for (const brandId in BRANDS) {
            const brandName = BRANDS[brandId];
            console.log(`Fetching invoices for brand: ${brandName}`);
            const leadUrls = await getInvoicesForBrand(brandId);
            leadUrlsByBrand[brandName] = leadUrls;
            console.log(`Found ${leadUrls.length} leads for ${brandName}`);
        }

        for (const brandName in leadUrlsByBrand) {
            const urls = leadUrlsByBrand[brandName];
            const leadDetailsPromises = urls.map(url => getLeadDetails(url, brandName));
            const results = await Promise.all(leadDetailsPromises);
            allLeadsData.push(...results.filter(Boolean)); // Filter out any null results from failed fetches
        }

        console.log(`Total leads extracted: ${allLeadsData.length}`);
        if (allLeadsData.length > 0) {
            downloadCSV(allLeadsData);
            alert(`Extraction complete! ${allLeadsData.length} leads downloaded.`);
        } else {
            alert('No leads found.');
        }
    }

    async function getInvoicesForBrand(brandId) {
        let page = 1;
        let allLeadUrls = new Set();

        while (true) {
            try {
                const html = await fetchInvoicePage(brandId, page);
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const leadLinks = doc.querySelectorAll('a[href*="/admin/leads/"]');

                if (leadLinks.length === 0) {
                    break; // No leads found on this page, stop pagination for this brand.
                }

                leadLinks.forEach(link => {
                    const url = new URL(link.href, window.location.origin).href;
                    allLeadUrls.add(url);
                });

                page++;
            } catch (error) {
                console.error(`Error fetching page ${page} for brand ID ${brandId}:`, error);
                break; // Stop on error
            }
        }
        return Array.from(allLeadUrls);
    }

    function fetchInvoicePage(brandId, page) {
        return new Promise((resolve, reject) => {
            const body = `clientID=12295&page=${page}&section=issue&dir=A&statuses=unpaid%7C%7Cpaid&brands=${brandId}&year=&dueDateStart=&dueDateEnd=&createdDateStart=&createdDateEnd=&type=6&archive=unarchived`;
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.pixifi.com/admin/fn/invoices/getInvoiceListing/',
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                data: body,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(`HTTP error! status: ${response.status}`);
                    }
                },
                onerror: function(error) {
                    reject(`Network error: ${error}`);
                }
            });
        });
    }

    function getLeadDetails(leadUrl, brandName) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: leadUrl,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        const nameElement = doc.querySelector('.px-4 .text-lg.font-bold');
                        const name = nameElement ? nameElement.innerText.trim() : 'N/A';

                        const emailElement = doc.querySelector('a[href^="mailto:"]');
                        const email = emailElement ? emailElement.innerText.trim() : 'N/A';

                        const phoneElement = doc.querySelector('a[href^="tel:"]');
                        const phone = phoneElement ? phoneElement.innerText.trim() : 'N/A';

                        resolve({
                            'Name': name,
                            'Profile Link': leadUrl,
                            'Email': email,
                            'Phone': phone,
                            'Brand': brandName
                        });
                    } else {
                        console.error(`Failed to fetch lead details for ${leadUrl}`);
                        resolve(null); // Resolve with null to not break Promise.all
                    }
                },
                onerror: function(error) {
                    console.error(`Network error fetching ${leadUrl}:`, error);
                    resolve(null);
                }
            });
        });
    }

    function downloadCSV(data) {
        const header = Object.keys(data[0]).join(',');
        const rows = data.map(row =>
            Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
        );
        const csvContent = [header, ...rows].join('\n');

        GM_download({
            url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent),
            name: 'invoiced_leads.csv',
            saveAs: true
        });
    }
})();
