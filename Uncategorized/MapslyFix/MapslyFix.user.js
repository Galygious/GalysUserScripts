// ==UserScript==
// @name         Mapsly Marker Pane Remover
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Remove the leaflet marker pane on Mapsly map page whenever it appears
// @author       You
// @match        https://app.mapsly.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const SELECTOR = '#app > main > div.main-container > div.c-map-page-container > div.c-map-page.map-tiles-osm > div.map-column > div > div.c-map.leaflet-container.leaflet-touch.leaflet-retina.leaflet-fade-anim.leaflet-grab.leaflet-touch-drag.leaflet-touch-zoom > div.leaflet-pane.leaflet-map-pane > div.leaflet-pane.leaflet-marker-pane';

    function deexistMarkerPane(root = document) {
        const panes = root.querySelectorAll(SELECTOR);
        if (panes.length) {
            panes.forEach(p => p.remove());
        }
    }

    // Remove immediately if present
    deexistMarkerPane();

    // Watch for future additions
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                // Check added nodes and their descendants
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches(SELECTOR)) {
                            node.remove();
                        } else {
                            deexistMarkerPane(node);
                        }
                    }
                });
            }
        }
    });

    observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true
    });

    // Lightweight periodic sweep as a safety net (rare dynamic re-parenting cases)
    const intervalId = setInterval(deexistMarkerPane, 1000);

    // Optional: stop the interval if the page becomes hidden for long periods
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(intervalId);
        }
    });
})();