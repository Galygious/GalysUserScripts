// ==UserScript==
// @name         Pixifi Auto Log In
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automatically logs into Pixifi admin page using saved credentials and redirects to leads page
// @author       You
// @match        https://www.pixifi.com/admin/login.php
// @match        https://pixifi.com/admin/login.php
// @match        https://www.pixifi.com/admin/
// @match        https://pixifi.com/admin/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG_KEY = 'pixifi_credentials';
    
    // Function to save credentials
    function saveCredentials(username, password) {
        const credentials = {
            username: username,
            password: password,
            timestamp: Date.now()
        };
        GM_setValue(CONFIG_KEY, credentials);
        console.log('Pixifi Auto Log In: Credentials saved');
    }
    
    // Function to get saved credentials
    function getCredentials() {
        return GM_getValue(CONFIG_KEY, null);
    }
    
    // Function to clear saved credentials
    function clearCredentials() {
        GM_setValue(CONFIG_KEY, null);
        console.log('Pixifi Auto Log In: Credentials cleared');
        alert('Pixifi Auto Log In: Credentials have been cleared');
    }
    
    // Function to show credentials management dialog
    function showCredentialsDialog() {
        const credentials = getCredentials();
        const currentUsername = credentials ? credentials.username : '';
        const currentPassword = credentials ? credentials.password : '';
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #ccc;
            border-radius: 8px;
            padding: 20px;
            z-index: 10000;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
            min-width: 300px;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin-top: 0; color: #333;">Pixifi Auto Log In - Credentials</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Username:</label>
                <input type="text" id="cred-username" value="${currentUsername}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Password:</label>
                <input type="password" id="cred-password" value="${currentPassword}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div style="text-align: right; margin-bottom: 15px;">
                <button id="save-credentials" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">Save</button>
                <button id="clear-credentials" style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">Clear</button>
                <button id="close-dialog" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Close</button>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Event listeners
        document.getElementById('save-credentials').addEventListener('click', () => {
            const username = document.getElementById('cred-username').value.trim();
            const password = document.getElementById('cred-password').value.trim();
            
            if (username && password) {
                saveCredentials(username, password);
                alert('Pixifi Auto Log In: Credentials saved successfully!');
                document.body.removeChild(dialog);
            } else {
                alert('Pixifi Auto Log In: Please enter both username and password');
            }
        });
        
        document.getElementById('clear-credentials').addEventListener('click', () => {
            if (confirm('Pixifi Auto Log In: Are you sure you want to clear saved credentials?')) {
                clearCredentials();
                document.body.removeChild(dialog);
            }
        });
        
        document.getElementById('close-dialog').addEventListener('click', () => {
            document.body.removeChild(dialog);
        });
    }
    
    // Function to perform auto login
    function performAutoLogin() {
        const credentials = getCredentials();
        
        if (!credentials || !credentials.username || !credentials.password) {
            console.log('Pixifi Auto Log In: No saved credentials found');
            return false;
        }
        
        // Check if we're on the login page
        const loginForm = document.getElementById('loginForm');
        if (!loginForm) {
            console.log('Pixifi Auto Log In: Login form not found');
            return false;
        }
        
        // Fill in the credentials
        const usernameField = document.getElementById('username');
        const passwordField = document.getElementById('password');
        
        if (usernameField && passwordField) {
            usernameField.value = credentials.username;
            passwordField.value = credentials.password;
            
            // Trigger change events to ensure the form recognizes the values
            usernameField.dispatchEvent(new Event('input', { bubbles: true }));
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            
            console.log('Pixifi Auto Log In: Credentials filled in');
            
            // Submit the form after a short delay to ensure the page is fully loaded
            setTimeout(() => {
                const submitButton = document.getElementById('submit');
                if (submitButton) {
                    submitButton.click();
                    console.log('Pixifi Auto Log In: Login form submitted');
                } else {
                    loginForm.submit();
                    console.log('Pixifi Auto Log In: Login form submitted via form.submit()');
                }
            }, 500);
            
            return true;
        }
        
        return false;
    }
    
    // Register menu commands
    GM_registerMenuCommand('Manage Pixifi Credentials', showCredentialsDialog);
    GM_registerMenuCommand('Clear Pixifi Credentials', clearCredentials);
    
    // Function to handle post-login redirect
    function handlePostLoginRedirect() {
        // Check if we're on the main admin page (not login page)
        if (window.location.pathname === '/admin/' || window.location.pathname === '/admin') {
            console.log('Pixifi Auto Log In: Detected successful login, redirecting to leads page');
            
            // Redirect to the leads page
            setTimeout(() => {
                window.location.href = 'https://www.pixifi.com/admin/leads/';
            }, 500);
        }
    }
    
    // Main execution
    function init() {
        console.log('Pixifi Auto Log In: Script loaded');
        
        // Check if we're on the login page
        if (window.location.pathname === '/admin/login.php') {
            // Check if we should auto-login
            const credentials = getCredentials();
            if (credentials && credentials.username && credentials.password) {
                console.log('Pixifi Auto Log In: Attempting auto-login');
                
                // Wait for the page to be fully loaded
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(performAutoLogin, 1000);
                    });
                } else {
                    setTimeout(performAutoLogin, 1000);
                }
            } else {
                console.log('Pixifi Auto Log In: No saved credentials, skipping auto-login');
            }
        } else if (window.location.pathname === '/admin/' || window.location.pathname === '/admin') {
            // Handle post-login redirect
            handlePostLoginRedirect();
        }
    }
    
    // Start the script
    init();
    
})();
