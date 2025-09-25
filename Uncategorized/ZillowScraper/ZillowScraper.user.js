// ==UserScript==
// @name         Zillow Property Data Grabber (Full Fields)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Extracts full property data including main level master/guest
// @match        https://www.zillow.com/homedetails/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const insertCustomButton = () => {
        const tourButton = Array.from(document.querySelectorAll('button')).find(
            btn => btn.textContent?.trim().toLowerCase() === "request a tour"
        );

        if (!tourButton || tourButton.parentElement.querySelector('#zillow-data-grabber')) return;

        const grabBtn = document.createElement('button');
        grabBtn.id = 'zillow-data-grabber';
        grabBtn.innerText = '📋 Grab Property Data';
        grabBtn.style.marginLeft = '10px';
        grabBtn.style.padding = '6px 12px';
        grabBtn.style.fontSize = '14px';
        grabBtn.style.cursor = 'pointer';
        grabBtn.style.background = '#0074e4';
        grabBtn.style.color = 'white';
        grabBtn.style.border = 'none';
        grabBtn.style.borderRadius = '4px';

        grabBtn.onclick = () => {
            const factContainers = document.querySelectorAll('[data-testid="bed-bath-sqft-fact-container"]');

            let bedrooms = "N/A", bathrooms = "N/A", sqft = "N/A";

            factContainers.forEach(container => {
                const spans = container.querySelectorAll('span');
                const value = spans[0]?.textContent.trim();
                const label = spans[1]?.textContent.toLowerCase();
                if (label?.includes('bed')) bedrooms = value;
                if (label?.includes('bath')) bathrooms = value;
                if (label?.includes('sqft')) sqft = value;
            });

            const getTextFromLabel = (label) => {
                const node = Array.from(document.querySelectorAll('li')).find(li =>
                    li.innerText.toLowerCase().includes(label.toLowerCase())
                );
                return node ? node.innerText.split(':').pop().trim() : "N/A";
            };

            const matchFact = (includes) => {
                const match = Array.from(document.querySelectorAll('li')).find(li =>
                    li.innerText.toLowerCase().includes(includes.toLowerCase())
                );
                if (!match) return "N/A";
                const parts = match.innerText.split(':');
                return parts.length > 1 ? parts[1].trim() : "Yes"; // fallback to 'Yes' if no colon
            };

            // Try normal fact lookup first
            let yearBuilt = getTextFromLabel('year built');

            // Fallback logic: use first "Sold" date
            if (yearBuilt === "N/A") {
                const firstSold = Array.from(document.querySelectorAll('tr'))
                .find(tr => tr.innerText.toLowerCase().includes('sold'));

                if (firstSold) {
                    const dateText = firstSold.querySelector('[data-testid="date-info"]')?.textContent?.trim();
                    const inferredYear = dateText?.match(/\d{4}/)?.[0];
                    if (inferredYear) yearBuilt = `${inferredYear} (inferred from sale date)`;
                }
            }

            const data = {
                "Bedrooms": bedrooms,
                "Bathrooms": bathrooms,
                "Square Footage": sqft.replace(/,/g, ''),
                "Main Level Master": matchFact("main level primary bedroom"),
                "Main Level Guest": matchFact("main level guest"),
                "Price": (document.querySelector('[data-testid="price"]')?.textContent || "N/A").replace(/\s*\/mo/, '').trim(),
                "Year Built": yearBuilt,
                "Location": document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() || "N/A",
                "Stories": getTextFromLabel('stories'),
                "Garage": getTextFromLabel('garage'),
                "Lot Size": getTextFromLabel('lot size')
            };

            const output = JSON.stringify(data, null, 2);
            console.log("📋 Copied Zillow Data:\n", output);
            GM_setClipboard(output);
            alert("Zillow property data copied to clipboard!");
        };

        tourButton.parentElement.appendChild(grabBtn);
    };

    const observer = new MutationObserver(() => {
        const found = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent?.trim().toLowerCase() === "request a tour");
        if (found) insertCustomButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
