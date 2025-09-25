// ==UserScript==
// @name         AHK Web JavaScript API
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Execute JavaScript via AHK
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const WEBSOCKET_SERVER = "ws://localhost:9000";  // Matches AHK WebSocket

    let socket = new WebSocket(WEBSOCKET_SERVER);

    socket.onopen = function() {
        console.log("Connected to AHK WebSocket");
    };

    socket.onmessage = function(event) {
        let command = event.data.trim();
        console.log("Received from AHK:", command);

        try {
            if (command.startsWith("JS(")) {
                let jsCode = command.match(/JS\(['"](.+?)['"]\)/)[1];
                let result = eval(jsCode);  // Executes JavaScript safely
                socket.send(result?.toString() || "null");
            }
        } catch (error) {
            console.error("JS Execution Error:", error);
            socket.send("ERROR: " + error.message);
        }
    };

    socket.onclose = function() {
        console.log("Disconnected from AHK WebSocket");
    };
})();
