// ==UserScript==
// @name         Event Data Logger
// @namespace    http://tampermonkey.net/
// @version      1.32.7
// @description  Extracts offer, invoice, payment, promo info, client's birthday, client name, event name, and event date for events and logs them as two separate TSV sheets when triggered via a keybinding (Ctrl+Alt+Shift+X). Grouped batch requests improve performance. One sheet is for "Advanced Baby" sessions (first payment < $100) and one for "Baby Here" sessions (first payment >= $100). The sheets include the following columns (tab-separated):
//              PROMOD, CLIENT NAME, EVENT NAME, EVENT ID, EVENT DATE, BIRTHDAY, OFFER DATE, INVOICED, DAYS BETWEEN OFFER AND INVOICED, PAID, DAYS BETWEEN INVOICED AND PAID, PAID > EVENT, EVENT AGE; and logs start/end timestamps and total runtime.
// @author       Galygious
// @match        https://www.pixifi.com/admin/events/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

(async function() {
    "use strict";

    const businessClientID = "12295";
    const parser = new DOMParser();

    // Helper: GET fetch wrapper returning response text.
    async function getHTML(url) {
        const response = await fetch(url, { method: "GET", credentials: "include" });
        return response.text();
    }

    // Helper: POST fetch wrapper returning response text.
    async function postHTML(url, body) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
               "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
               "accept": "*/*"
            },
            body,
            credentials: "include"
        });
        return response.text();
    }

    // Helper: Extract first occurrence of a MM/DD/YYYY date.
    function extractDate(text) {
        const match = text.match(/(\d{2}\/\d{2}\/\d{4})/);
        return match ? match[1] : "N/A";
    }

    // Helper: Parse a MM/DD/YYYY date into a Date object.
    function parseDate(dateStr) {
        if (dateStr === "N/A") return null;
        const parts = dateStr.split("/");
        return new Date(parts[2], parts[0] - 1, parts[1]);
    }

    // Helper: Calculate difference in days between two dates.
    function diffDays(dateStr1, dateStr2) {
        const d1 = parseDate(dateStr1);
        const d2 = parseDate(dateStr2);
        if (!d1 || !d2) return "N/A";
        return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    // Helper: Strip HTML tags.
    function stripHTML(html) {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }

    // Helper: Compute numeric average for a key in an array of events.
    function average(key, eventsArray) {
        let total = 0, count = 0;
        eventsArray.forEach(ev => {
            const val = parseFloat(ev[key]);
            if (!isNaN(val)) {
                total += val;
                count++;
            }
        });
        return count > 0 ? (total / count).toFixed(2) : "N/A";
    }

    // Function to build TSV string with an extra averages row.
    function buildTSV(evArray) {
        const tsvLines = evArray.map(ev => {
            return `${ev.promod}\t${ev.clientName}\t${ev.eventName}\t${ev.eventId}\t${ev.eventDate}\t${ev.birthday}\t${ev.offerDate}\t${ev.invoiceDate}\t${ev.daysOfferToInvoice}\t${ev.firstPaidDate}\t${ev.daysInvoiceToPaid}\t${ev.daysPaidToEvent}\t${ev.eventAge}`;
        });
        const header = "PROMOD\tCLIENT NAME\tEVENT NAME\tEVENT ID\tEVENT DATE\tBIRTHDAY\tOFFER DATE\tINVOICED\tOFFER > INVOICED\tPAID\tINVOICED > PAID\tPAID > EVENT\tEVENT AGE";
        const avgOfferToInvoice = average("daysOfferToInvoice", evArray);
        const avgInvoiceToPaid = average("daysInvoiceToPaid", evArray);
        const avgPaidToEvent = average("daysPaidToEvent", evArray);
        const avgEventAge = average("eventAge", evArray);
        const extraRow = [
            "Averages:",
            "", "", "", "", "", "",
            "",
            avgOfferToInvoice,
            "",
            avgInvoiceToPaid,
            avgPaidToEvent,
            avgEventAge
        ].join("\t");

        return [header, ...tsvLines, extraRow].join("\n");
    }

    // Main processing function.
    async function processEvents() {
        const startTime = new Date();
        console.log("Process start timestamp: " + startTime.toLocaleString());

        const eventDivs = document.querySelectorAll("div[id$='_event']");
        if (!eventDivs.length) {
            console.log("No events found on this page.");
            return;
        }

        // Build events array.
        const events = Array.from(eventDivs).map(div => {
            const eventId = div.id.split("_")[0];
            const clientObjMatch = div.innerHTML.match(/openWin\(\s*'(\d+)'\s*,/);
            const clientObjId = clientObjMatch ? clientObjMatch[1] : "N/A";
            return {
                eventId,
                clientId: clientObjId,  // Not used in TSV.
                birthday: "N/A",
                offerDate: "N/A",
                invoiceDate: "N/A",
                firstPaidDate: "N/A",
                firstPaidAmount: "N/A",
                promod: false,
                clientName: "N/A",
                eventName: "N/A",
                eventDate: "N/A",
                daysOfferToInvoice: "N/A",
                daysInvoiceToPaid: "N/A",
                daysPaidToEvent: "N/A",
                eventAge: "N/A"
            };
        });

        // Group 1: Batch fetch invoice listings.
        const invoicePromises = events.map(ev => {
            const body = `clientID=${businessClientID}&objectType=event&objectID=${ev.eventId}`;
            return postHTML("https://www.pixifi.com/admin/data/getObjectInvoiceListing/", body)
                     .then(html => ({ eventId: ev.eventId, html }));
        });
        const invoiceResults = await Promise.all(invoicePromises);
        invoiceResults.forEach(res => {
            const doc = parser.parseFromString(res.html, "text/html");
            const invAnchor = Array.from(doc.querySelectorAll("a")).find(a => /\d{2}\/\d{2}\/\d{4}/.test(a.textContent));
            const ev = events.find(e => e.eventId === res.eventId);
            if (invAnchor) {
                ev.invoiceDate = extractDate(invAnchor.textContent);
            }
            const invHref = invAnchor ? invAnchor.getAttribute("href") : "";
            const invIdMatch = invHref.match(/\/admin\/invoices\/(\d+)\//);
            if (invIdMatch) {
                ev._invoiceID = invIdMatch[1];
            }
        });

        // Group 2: Batch fetch invoice payment details.
        const paymentPromises = events.filter(ev => ev._invoiceID).map(ev => {
            const body = `clientID=${businessClientID}&invoiceID=${ev._invoiceID}`;
            return postHTML("https://www.pixifi.com/admin/fn/invoices/refreshInvoicePayments/", body)
                     .then(html => ({ eventId: ev.eventId, html }));
        });
        const paymentResults = await Promise.all(paymentPromises);
        paymentResults.forEach(res => {
            const doc = parser.parseFromString(res.html, "text/html");
            const ev = events.find(e => e.eventId === res.eventId);
            const payStrong = doc.querySelector("a.smallText strong");
            if (payStrong) {
                const amountText = payStrong.textContent;
                const amountNum = parseFloat(amountText.replace("$", "").trim());
                ev.firstPaidAmount = amountNum.toString();
            }
            const paySpan = Array.from(doc.querySelectorAll("span.smallText"))
                              .find(span => /\d{2}\/\d{2}\/\d{4}/.test(span.textContent));
            if (paySpan) {
                ev.firstPaidDate = extractDate(paySpan.textContent);
            }
        });

        // Group 3: Process communication items for promo detection.
        for (const ev of events) {
            const body = `clientID=${businessClientID}&objectType=event&objectID=${ev.eventId}`;
            const commHTML = await postHTML("https://www.pixifi.com/admin/fn/comm/getCommunicationItems/", body);
            const commDoc = parser.parseFromString(commHTML, "text/html");
            const offerAnchors = Array.from(commDoc.querySelectorAll("a")).filter(a => /Reserve\s*Your/i.test(a.textContent));
            if (offerAnchors.length > 0) {
                let earliestOffer = null;
                let earliestOfferStr = "N/A";
                for (const offerAnchor of offerAnchors) {
                    const commContainer = offerAnchor.closest("div[id*='_commitem']");
                    if (commContainer) {
                        const sentMatch = commContainer.innerHTML.match(/Sent:\s*<b>\s*(\d{2}\/\d{2}\/\d{4})/i);
                        if (sentMatch) {
                            const currentOfferStr = sentMatch[1];
                            const currentOfferDate = parseDate(currentOfferStr);
                            if (!earliestOffer || currentOfferDate < earliestOffer) {
                                earliestOffer = currentOfferDate;
                                earliestOfferStr = currentOfferStr;
                            }
                        }
                        const parts = commContainer.id.split("_");
                        const currentCommId = parts[0];
                        const emailBody = `clientID=${businessClientID}&objName=event&objID=${ev.eventId}&commID=${currentCommId}`;
                        const emailHTML = await postHTML("https://www.pixifi.com/admin/data/getCommunicationItem/", emailBody);

                        // Extract the SUCCESS{|} prefix if present
                        const cleanHTML = emailHTML.replace(/^SUCCESS\{\|\}/, '').trim();

                        // Parse the HTML into a document for better searching
                        const emailDoc = parser.parseFromString(cleanHTML, 'text/html');

                        // Debug logging
                        // console.log(`Checking communication ${currentCommId} for event ${ev.eventId}`);

                        // Get all text content from the email
                        const emailText = emailDoc.body.textContent
                            .replace(/\u00A0/g, ' ')  // Replace non-breaking spaces
                            .replace(/\s+/g, ' ')     // Normalize whitespace
                            .toLowerCase()
                            .trim();

                        // Debug logging
                        // console.log('Email text:', emailText);

                        // Look for gift emoji and promo text
                        if (emailText.includes('🎁')) {
                            // Check for promo patterns near the gift emoji
                            const giftIndex = emailText.indexOf('🎁');
                            const textAfterGift = emailText.slice(giftIndex, giftIndex + 200); // Look at next 200 chars

                            // console.log('Text after gift emoji:', textAfterGift);

                            // First check for the promo intro text
                            if (textAfterGift.includes('exclusive offer') ||
                                textAfterGift.includes('book today & save')) {

                                // Then check for the specific promo text
                                const hasPromoText = textAfterGift.includes('free black and white') ||
                                                   textAfterGift.includes('free black & white') ||
                                                   textAfterGift.includes('receive free black and white') ||
                                                   textAfterGift.includes('receive free black & white');

                                // Also check for the value mention
                                const hasValueMention = textAfterGift.includes('$45 value') ||
                                                      textAfterGift.includes('45 value');

                                // Only mark as promo if we have both the promo text and value mention
                                if (hasPromoText && hasValueMention) {
                                    ev.promod = true;
                                    // console.log(`Promo detected in email for event ${ev.eventId}`);
                                    // console.log('Matching text:', textAfterGift);
                                }
                            }
                        }
                    }
                }
                ev.offerDate = earliestOfferStr;
            }
        }

        // Group 4: Batch fetch event pages for additional details.
        const eventPagePromises = events.map(ev => {
            const url = `https://www.pixifi.com/admin/events/${ev.eventId}/`;
            return getHTML(url).then(html => ({ eventId: ev.eventId, html }));
        });
        const eventPageResults = await Promise.all(eventPagePromises);
        eventPageResults.forEach(res => {
            const ev = events.find(e => e.eventId === res.eventId);
            const doc = parser.parseFromString(res.html, "text/html");
            const birthdayElem = doc.querySelector("#questitem_8225 > div.rightTitle");
            ev.birthday = birthdayElem ? birthdayElem.textContent.trim() : "N/A";
            const clientNameElem = doc.querySelector('a[href^="/admin/clients"][class^="btn"]');
            ev.clientName = clientNameElem ? clientNameElem.textContent.trim() : "N/A";
            const eventNameElem = doc.querySelector("#af_eventName");
            ev.eventName = eventNameElem ? eventNameElem.getAttribute("data-value") : "N/A";
            const eventDateElem = doc.querySelector("#af_eventDateTimeStamp");
            ev.eventDate = eventDateElem ? eventDateElem.getAttribute("data-value") : "N/A";
        });

        // Compute additional day differences.
        events.forEach(ev => {
            ev.daysOfferToInvoice = (ev.offerDate !== "N/A" && ev.invoiceDate !== "N/A") ? diffDays(ev.offerDate, ev.invoiceDate) : "N/A";
            ev.daysInvoiceToPaid = (ev.invoiceDate !== "N/A" && ev.firstPaidDate !== "N/A") ? diffDays(ev.invoiceDate, ev.firstPaidDate) : "N/A";
            ev.daysPaidToEvent = (ev.firstPaidDate !== "N/A" && ev.eventDate !== "N/A") ? diffDays(ev.firstPaidDate, ev.eventDate) : "N/A";
            ev.eventAge = (ev.birthday !== "N/A" && ev.eventDate !== "N/A") ? diffDays(ev.birthday, ev.eventDate) : "N/A";
        });

        // Separate events based on first payment amount.
        const advancedEvents = events.filter(ev => ev.firstPaidAmount !== "N/A" && parseFloat(ev.firstPaidAmount) < 100);
        const babyHereEvents = events.filter(ev => ev.firstPaidAmount !== "N/A" && parseFloat(ev.firstPaidAmount) >= 100);

        // Build TSV outputs.
        const advancedTSV = buildTSV(advancedEvents);
        const babyHereTSV = buildTSV(babyHereEvents);

        const endTime = new Date();
        console.log("Process end timestamp: " + endTime.toLocaleString());
        console.log("Total runtime: " + ((endTime - startTime) / 1000).toFixed(2) + " seconds");

        console.log("Advanced Baby Sessions:\t" + advancedEvents.length + "\n" + advancedTSV, "\n\nBaby Here Sessions:\t" + babyHereEvents.length + "\n" + babyHereTSV);
    }

    // Keybinding: Trigger processing when Ctrl+Alt+Shift+X is pressed.
    document.addEventListener("keydown", function(e) {
        if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === "x") {
            console.log("Keybinding triggered: Processing events...");
            processEvents();
        }
    });

    console.log("Event Data Logger userscript loaded. Press Ctrl+Alt+Shift+X to trigger processing.");
})();
