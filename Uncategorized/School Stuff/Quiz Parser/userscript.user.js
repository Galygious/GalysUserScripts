// ==UserScript==
// @name         APUS Quiz Copier
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Copy APUS D2L quiz to clipboard in text format
// @author       OpenAI
// @match        https://myclassroom.apus.edu/d2l/lms/quizzing*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Utility to decode HTML entities
    function decodeHtmlEntities(str) {
        const txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    }

    function parseQuiz() {
        const anchors = Array.from(document.querySelectorAll('a[id^="q"]'));
        if (!anchors.length) return '';
        const results = [];

        anchors.forEach((anchor, index) => {
            const nextAnchor = anchors[index + 1] || null;

            // Collect nodes that belong to this question (between this anchor and the next)
            const segmentNodes = [];
            let node = anchor.nextElementSibling;
            while (node && node !== nextAnchor) {
                segmentNodes.push(node);
                node = node.nextElementSibling;
            }

            // Question number
            let qNum = index + 1;
            const h2 = segmentNodes.find(n => n.querySelector && n.querySelector('h2'))?.querySelector('h2');
            if (h2) {
                const match = h2.textContent.match(/Question\s*(\d+)/i);
                if (match) qNum = match[1];
            }

            // Question text: first d2l-html-block not inside a fieldset/label
            let qText = '';
            for (const seg of segmentNodes) {
                if (seg.querySelector) {
                    const blocks = Array.from(seg.querySelectorAll('d2l-html-block'));
                    for (const blk of blocks) {
                        if (!blk.closest('fieldset')) {
                            let raw = blk.getAttribute('html') || blk.textContent.trim();
                            qText = decodeHtmlEntities(raw);
                            break;
                        }
                    }
                }
                if (qText) break;
            }

            // Options
            const options = [];
            const fieldset = segmentNodes.find(n => n.querySelector && n.querySelector('fieldset'))?.querySelector('fieldset');
            if (fieldset) {
                const rows = fieldset.querySelectorAll('table tbody tr');
                rows.forEach((tr, i) => {
                    const labelBlock = tr.querySelector('label d2l-html-block');
                    let raw = labelBlock ? (labelBlock.getAttribute('html') || labelBlock.textContent.trim()) : tr.textContent.trim();
                    const text = decodeHtmlEntities(raw);
                    options.push(String.fromCharCode(65 + i) + ') ' + text);
                });
            }

            if (qText && options.length) {
                results.push(`Question ${qNum} - ${qText}\n${options.join('\n')}`);
            }
        });

        return results.join('\n\n');
    }

    function waitForQuizContent(maxWaitMs = 20000) {
        return new Promise((resolve, reject) => {
            // quick check first
            if (document.querySelector('a[id^="q"]') && document.querySelector('fieldset')) {
                return resolve();
            }

            const observer = new MutationObserver(() => {
                if (document.querySelector('a[id^="q"]') && document.querySelector('fieldset')) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject();
            }, maxWaitMs);
        });
    }

    function copyQuizToClipboard() {
        // Prevent multiple concurrent copy attempts
        if (copyQuizToClipboard._busy) return;
        copyQuizToClipboard._busy = true;

        waitForQuizContent(20000).then(() => {
            const quizText = parseQuiz();
            if (quizText) {
                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(quizText);
                } else {
                    navigator.clipboard.writeText(quizText);
                }
                alert('Quiz copied to clipboard!');
            } else {
                alert('Could not find quiz content. Please scroll through the quiz so all questions are loaded.');
            }
        }).catch(() => {
            alert('Quiz content did not load in time. Try again once the page finishes loading.');
        }).finally(() => {
            copyQuizToClipboard._busy = false;
        });
    }

    // Register menu command for manual trigger
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('Copy Quiz to Clipboard', copyQuizToClipboard);
    }

    // No auto-execution, manual trigger only
})(); 