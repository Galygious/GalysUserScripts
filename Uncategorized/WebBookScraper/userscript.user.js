// ==UserScript==
// @name         Web Book Scraper
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Scrapes content from a web book reader (iframe direct read, #scrolling-content observed) and saves as Markdown. (Button Activated)
// @match        https://openpage-ebooks.jblearning.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// ==/UserScript==

// Prevent multiple script instances on the same page (e.g., due to frames or script managers)
if (window.webBookScraperLoaded) {
    console.warn('[Scraper] Script already loaded. Exiting to prevent duplicates.');
    return;
}
window.webBookScraperLoaded = true;

(function() {
    'use strict';

    let accumulatedContent = '';
    const iframeSelector = '#scrolling-content > div > iframe';
    const nextButtonSelector = '#next-page-button';
    const nextButtonContainerSelector = '.next-div';
    const contentContainerSelector = '#opr-reflow-scrolling-container';

    // --- State Variables ---
    let scrapingInitiated = false;
    let lastScrapedContentSignature = null; // Signature of the last processed iframe content
    const POLLING_DELAY_MS = 500;      // Short delay between main loop iterations WHEN content has changed
    const INNER_POLL_INTERVAL_MS = 250;  // How often to check for content change
    const INNER_POLL_TIMEOUT_MS = 15000;  // Increased Max time (ms) to wait for content change
    const CLICK_RETRIES = 2;           // Number of retries if content doesn't change

    /**
     * Basic HTML to Markdown converter.
     * Handles common tags like p, h1-h6, ul, ol, li, a, strong, em, hr, img, br.
     * This is a simplified converter and may not handle all HTML complexities or styling.
     * @param {string} htmlString - The HTML content (inner HTML of body) to convert.
     * @returns {string} The converted Markdown string.
     */
     function htmlToMarkdown(htmlString) {
        // Create a temporary element to parse the HTML string
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        let markdown = '';

        function processNode(node) {
            let nodeMarkdown = '';
            switch (node.nodeName.toLowerCase()) {
                case '#text':
                    // Trim whitespace around text nodes, but replace multiple spaces with one
                    nodeMarkdown = node.nodeValue.replace(/\s+/g, ' ').trim();
                    break;
                case 'p':
                    nodeMarkdown = '\n\n' + processChildren(node) + '\n\n';
                    break;
                case 'h1': nodeMarkdown = '\n# ' + processChildren(node) + '\n'; break;
                case 'h2': nodeMarkdown = '\n## ' + processChildren(node) + '\n'; break;
                case 'h3': nodeMarkdown = '\n### ' + processChildren(node) + '\n'; break;
                case 'h4': nodeMarkdown = '\n#### ' + processChildren(node) + '\n'; break;
                case 'h5': nodeMarkdown = '\n##### ' + processChildren(node) + '\n'; break;
                case 'h6': nodeMarkdown = '\n###### ' + processChildren(node) + '\n'; break;
                case 'ul':
                    nodeMarkdown = '\n' + processList(node, '*') + '\n';
                    break;
                case 'ol':
                    nodeMarkdown = '\n' + processList(node, '1.') + '\n';
                    break;
                case 'li': // Should be handled by processList, but process as paragraph if orphaned
                    nodeMarkdown = processChildren(node);
                    break;
                case 'a':
                    const href = node.getAttribute('href') || '';
                    // Avoid converting internal anchors/links without href
                    if (href && !href.startsWith('#')) {
                         nodeMarkdown = `[${processChildren(node)}](${href})`;
                    } else {
                        nodeMarkdown = processChildren(node); // Treat as normal text if no useful href
                    }
                    break;
                case 'strong':
                case 'b':
                    nodeMarkdown = '**' + processChildren(node) + '**';
                    break;
                case 'em':
                case 'i':
                    nodeMarkdown = '_' + processChildren(node) + '_';
                    break;
                case 'hr':
                    nodeMarkdown = '\n\n---\n\n';
                    break;
                case 'br':
                    nodeMarkdown = '  \n'; // Markdown line break
                    break;
                case 'img':
                    // Basic image handling: ![alt](src "title")
                    const alt = node.getAttribute('alt') || '';
                    const src = node.getAttribute('src') || '';
                    const title = node.getAttribute('title') || '';
                    nodeMarkdown = `![${alt}](${src}${title ? ` "${title}"` : ''})`;
                    break;
                 case 'figure': // Treat figure like a paragraph break
                    nodeMarkdown = '\n\n' + processChildren(node) + '\n\n';
                    break;
                 case 'figcaption': // Treat caption like a paragraph
                    nodeMarkdown = '\n\n_' + processChildren(node) + '_\n\n'; // Italicize caption
                    break;
                 case 'table':
                     // Very basic table conversion (might need a library for complex tables)
                     nodeMarkdown = '\n' + convertTableToMarkdown(node) + '\n';
                     break;
                // Ignore tags that usually don't have direct Markdown equivalents or contain metadata
                case 'head':
                case 'script':
                case 'style':
                case 'meta':
                case 'link':
                case 'span': // Often used for styling, extract content
                     nodeMarkdown = processChildren(node);
                     break;
                default: // Process children of unknown tags
                    nodeMarkdown = processChildren(node);
            }
            return nodeMarkdown;
        }

        function processChildren(node) {
            let childrenMarkdown = '';
            for (let child of node.childNodes) {
                childrenMarkdown += processNode(child);
            }
            return childrenMarkdown;
        }

        function processList(node, marker) {
            let listMarkdown = '';
            let itemIndex = 1;
            for (let child of node.childNodes) {
                if (child.nodeName === 'LI') {
                    const itemMarker = (marker === '1.') ? `${itemIndex++}.` : marker;
                    // Process children of li for nested formatting
                    const itemContent = processChildren(child).trim();
                    listMarkdown += `  ${itemMarker} ${itemContent}\n`;
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    // Handle nested lists or other elements within lists if necessary
                    listMarkdown += processNode(child);
                } else if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
                    // Handle text nodes directly within ul/ol if any (unlikely but possible)
                     listMarkdown += child.nodeValue.trim();
                }
            }
            return listMarkdown;
        }

         // Basic HTML Table to Markdown Table converter
         function convertTableToMarkdown(tableNode) {
            let md = '';
            const rows = Array.from(tableNode.querySelectorAll('tr'));
            const headers = Array.from(rows[0]?.querySelectorAll('th, td') || []).map(cell => processChildren(cell).trim());
            const alignments = headers.map(() => ':--'); // Default left align
            const separator = alignments.join('|');

            md += `| ${headers.join(' | ')} |\n`;
            md += `|${separator}|\n`;

            rows.slice(1).forEach(row => {
                const cells = Array.from(row.querySelectorAll('td')).map(cell => processChildren(cell).trim().replace(/\|/g, '\\|')); // Escape pipes in content
                md += `| ${cells.join(' | ')} |\n`;
            });

             return md;
         }

        // Start processing from the root temporary element
        markdown = processChildren(tempDiv);

        // Final cleanup: Remove excessive newlines
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

        return markdown;
     }

    /**
     * Extracts the main content from the HTML string and converts it to Markdown.
     * @param {string} htmlString - The HTML content of a book page.
     * @returns {string} The extracted and cleaned content as Markdown.
     */
    function extractContent(htmlString) {
        // Convert the body's innerHTML to Markdown
        const markdownContent = htmlToMarkdown(htmlString);
        return markdownContent;
    }

    /**
     * Saves the accumulated content to a local Markdown file.
     */
    function saveContent() {
        console.log('[Scraper] Reached the end or error occurred. Saving content...');
        // Ensure scraping stops if save is called unexpectedly
        scrapingInitiated = false; 
        const button = document.getElementById('webbook-scraper-button');
        if(button) { 
            if (!button.textContent.includes('Complete') && !button.textContent.includes('Error')) {
                 button.textContent = 'Saved (Check Console)';
            }
            // Keep disabled state if already set
         }

        const title = document.title || 'scraped-ebook';
        // Sanitize title for filename
        const filename = `${title.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').toLowerCase()}.md`;

        // Add title at the beginning of the Markdown file
        const finalMarkdown = `# ${title}\n\n${accumulatedContent}`;

        const blob = new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' });
        // Add an alert right before download attempt
        alert(`[Scraper] Attempting to download file:\n${filename}\n\nCheck your browser downloads!`);
        GM_download(blob, filename);
        console.log(`[Scraper] Download initiated as ${filename}.`);
    }

    /**
     * Waits for the iframe content to change from the previous signature.
     * @param {string} previousSignature - The signature of the previous page's content.
     * @returns {Promise<boolean>} True if content changed, false if timed out or error.
     */
    async function waitForContentChange(previousSignature) {
        console.log(`[Inner Poll] Waiting for content signature to differ from [${previousSignature?.substring(0,30)}...] (max ${INNER_POLL_TIMEOUT_MS}ms)...`);
        const startTime = Date.now();

        return new Promise((resolve) => {
            const intervalId = setInterval(() => {
                const iframeNow = document.querySelector(iframeSelector);
                let currentSignatureNow = '';

                if (iframeNow && iframeNow.contentDocument && iframeNow.contentDocument.body) {
                    // Target the specific container
                    const container = iframeNow.contentDocument.querySelector('#opr-reflow-scrolling-container');
                    if (container) {
                        const currentHtmlNow = container.innerHTML;
                        currentSignatureNow = currentHtmlNow.substring(0, 100); // Use consistent signature length
                        
                        // Debug Log: Show what signatures are being compared
                        // console.log(`[Inner Poll Debug] Comparing: Previous=[${previousSignature?.substring(0,30)}...], Current=[${currentSignatureNow.substring(0,30)}...]`);

                        // Check if content signature IS DIFFERENT and container is not empty
                        if (currentHtmlNow.trim().length > 0 && currentSignatureNow !== previousSignature) {
                            console.log(`[Inner Poll] Content changed detected after ${Date.now() - startTime}ms.`);
                            clearInterval(intervalId);
                            resolve(true);
                            return;
                        }
                    } else {
                         console.warn('[Inner Poll] #opr-reflow-scrolling-container not found during check.');
                    }
                } else {
                    // Iframe might be temporarily inaccessible or gone
                    console.warn('[Inner Poll] Iframe inaccessible during content check.');
                }

                // Check timeout
                if (Date.now() - startTime > INNER_POLL_TIMEOUT_MS) {
                    clearInterval(intervalId);
                    const timeoutCheckButtonContainer = document.querySelector(nextButtonContainerSelector);
                    const isTimeoutDisabled = timeoutCheckButtonContainer && timeoutCheckButtonContainer.classList.contains('disabled');
                    console.warn(`[Inner Poll] Timeout waiting for content change after ${INNER_POLL_TIMEOUT_MS}ms. Next button disabled state on timeout: ${isTimeoutDisabled}`);
                    resolve(false); // Resolve false on timeout
                }
            }, INNER_POLL_INTERVAL_MS);
        });
    }

    /**
     * The main scraping loop using content signature polling.
     */
    async function scrapeLoop() {
        if (!scrapingInitiated) return; // Stop if flag is turned off

        const iframe = document.querySelector(iframeSelector);
        if (!iframe) {
            console.error('[Scraper Loop] Iframe not found. Stopping.');
            alert('Scraper Error: Iframe disappeared during scraping.');
            scrapingInitiated = false;
            const button = document.getElementById('webbook-scraper-button');
            if(button) { button.textContent = 'Error: Iframe Lost'; button.disabled = true; button.style.backgroundColor = '#f44336'; }
            return;
        }

        const nextButtonContainer = document.querySelector(nextButtonContainerSelector);
        const isNextDisabled = nextButtonContainer && nextButtonContainer.classList.contains('disabled');
        const pageUrl = iframe.src; // Get src for logging

        console.log(`[Scraper Loop] Checking state: Page=${pageUrl}, isNextDisabled=${isNextDisabled}`);

        // --- Scrape Current Page --- 
        let currentContentSignature = '';
        try {
             // Give content a moment to settle, especially on first load
             await new Promise(resolve => setTimeout(resolve, 150)); 
             let htmlString = '';
             const container = iframe.contentDocument?.querySelector('#opr-reflow-scrolling-container');

             if (container && container.innerHTML.trim().length > 0) {
                  htmlString = container.innerHTML;
                  currentContentSignature = htmlString.substring(0, 100); // Calculate signature

                  // Avoid double-scraping if the loop somehow runs before content changes
                  if (currentContentSignature !== lastScrapedContentSignature) {
                      const content = extractContent(htmlString);
                      if (content) {
                          accumulatedContent += content + '\n\n---\n\n';
                          console.log(`[Scraper Loop] Processed and appended content. Total accumulated length: ${accumulatedContent.length}`);
                          lastScrapedContentSignature = currentContentSignature; // Store signature only after successful processing
                      } else {
                          console.warn(`[Scraper Loop] No content extracted after conversion from: ${pageUrl}`);
                      }
                  } else {
                      console.log(`[Scraper Loop] Content signature matches last scraped page. Skipping scrape, checking button state.`);
                  }
             } else {
                  console.warn(`[Scraper Loop] #opr-reflow-scrolling-container empty or inaccessible for ${pageUrl}.`);
                  // Cannot scrape this, need to decide whether to retry or stop
                  // Let's check the disabled button and decide based on that below
             }
         } catch (error) {
             console.error('[Scraper Loop] Error processing iframe content:', pageUrl, error);
             alert(`Scraper Error: Failed to process content from iframe ${pageUrl}. Check console. Stopping.`);
             saveContent(); // Save partial content
             scrapingInitiated = false;
             const button = document.getElementById('webbook-scraper-button');
             if(button) { button.textContent = 'Error Occurred (Saved)'; button.disabled = true; button.style.backgroundColor = '#f44336'; }
             return;
         }

        // --- Check Termination Condition (Disabled Button) ---
        // Re-check button state *after* attempting scrape
        const latestNextButtonContainer = document.querySelector(nextButtonContainerSelector);
        if (latestNextButtonContainer && latestNextButtonContainer.classList.contains('disabled')) {
             console.log('[Scraper Loop] Next button is disabled. Finishing.');
             saveContent();
             scrapingInitiated = false;
             const button = document.getElementById('webbook-scraper-button');
             if(button) { button.textContent = 'Scraping Complete!'; button.disabled = true; button.style.backgroundColor = '#aaa'; }
             return;
        }

        // --- Click Next and Wait for Content Change ---
        const nextButton = document.querySelector(nextButtonSelector);
        if (nextButton) {
            const signatureToWaitFor = currentContentSignature;
            let retriesLeft = 2; // e.g., 2 retries after the initial attempt
            let contentChanged = false;

            // Initial Click + Wait
            console.log(`[Scraper Loop] Clicking next page button... (Will wait for content signature change from: ${signatureToWaitFor.substring(0,30)}...)`);
            nextButton.click();
            contentChanged = await waitForContentChange(signatureToWaitFor);

            // Retry Loop if content didn't change and button isn't disabled
            while (!contentChanged && retriesLeft > 0) {
                const checkButtonContainer = document.querySelector(nextButtonContainerSelector);
                if (checkButtonContainer && checkButtonContainer.classList.contains('disabled')) {
                    console.log('[Scraper Loop] Next button became disabled during retry wait. Breaking retry loop.');
                    break; // Exit retry loop, main loop will handle disabled state
                }

                console.warn(`[Scraper Loop] Content did not change. Retrying click (${3 - retriesLeft}/2)...`);
                nextButton.click(); // Click again
                contentChanged = await waitForContentChange(signatureToWaitFor); // Wait again
                retriesLeft--;
            }

            // After loop, check final state
            if (contentChanged) {
                // Content changed, schedule the next iteration of the main loop shortly
                console.log(`[Scraper Loop] Content change detected. Scheduling next loop check in ${POLLING_DELAY_MS}ms...`);
                setTimeout(scrapeLoop, POLLING_DELAY_MS);
            } else {
                // Content still didn't change after initial try and retries
                // Check disabled button one last time before giving up
                const finalCheckButtonContainer = document.querySelector(nextButtonContainerSelector);
                if (finalCheckButtonContainer && finalCheckButtonContainer.classList.contains('disabled')) {
                    console.log('[Scraper Loop] Content did not change after retries, but Next button is now disabled. Assuming end of book.');
                    saveContent();
                    scrapingInitiated = false;
                    const button = document.getElementById('webbook-scraper-button');
                    if(button) { button.textContent = 'Scraping Complete!'; button.disabled = true; button.style.backgroundColor = '#aaa'; }
                } else {
                    console.warn('[Scraper Loop] Content did not change after retries, but Next button is not disabled. Assuming end of book.');
                    saveContent();
                    scrapingInitiated = false;
                    const button = document.getElementById('webbook-scraper-button');
                    if(button) { button.textContent = 'Warning: Stalled (Saved)'; button.disabled = true; button.style.backgroundColor = '#ff9800'; }
                }
            }
        } else {
            console.error('[Scraper Loop] Next button not found before click attempt. Stopping.');
            alert('Scraper Error: Next button disappeared.');
            saveContent(); // Save what we have
            scrapingInitiated = false;
             const button = document.getElementById('webbook-scraper-button');
             if(button) { button.textContent = 'Error: Next Button Lost'; button.disabled = true; button.style.backgroundColor = '#f44336'; }
        }
    }

    /**
     * Initializes scraping when the button is clicked.
     */
    function startScraping() {
        if (scrapingInitiated) {
            console.log('[Scraper] Scraping already in progress.');
            return;
        }
        console.log('[Scraper] Starting scraping process...');
        accumulatedContent = ''; // Reset content
        lastScrapedContentSignature = null; // Reset last signature
        scrapingInitiated = true;

        const button = document.getElementById('webbook-scraper-button');
         if (button) {
            button.textContent = 'Scraping... (Check Console)';
            button.disabled = true;
            button.style.backgroundColor = '#aaa';
         }

        // Start the loop
        scrapeLoop();
    }

     // --- Control Button ---

    function addScraperButton() {
         if (document.getElementById('webbook-scraper-button')) return; // Don't add multiple buttons

        const button = document.createElement('button');
        button.textContent = 'Start Scraping Book';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 15px';
        button.style.backgroundColor = '#4CAF50'; // Green
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.style.fontSize = '14px';
        button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        button.id = 'webbook-scraper-button';

        button.addEventListener('click', () => {
            console.log('[Scraper] Start button clicked.');
            startScraping();
        });

        document.body.appendChild(button);
         console.log('[Scraper] Control button added to page.');
    }


    // Wait for the DOM to be ready before adding the button.
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', addScraperButton);
    } else {
        addScraperButton(); // Already loaded
    }

    // Cleanup logic
     window.addEventListener('beforeunload', () => {
        if (scrapingInitiated) {
            scrapingInitiated = false;
            console.log('[Scraper] Disconnected scraping on page unload.');
        }
    });

})();
