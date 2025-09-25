// ==UserScript==
// @name         Sweet Me Photography Tools
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Creates a single draggable window for tools. Other scripts can register their tools here.
// @match        https://www.pixifi.com/admin/*
// @license      GPL
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/523684/Sweet%20Me%20Photography%20Tools.user.js
// @updateURL https://update.greasyfork.org/scripts/523684/Sweet%20Me%20Photography%20Tools.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const MASTER_TOOL_NAME = 'Sweet Me Photography Tools';

    // Create a global object to store MasterTools functionality.
    // This allows child scripts to call `window.SMPT.registerTool(...)`
    window.SMPT = {
        container: null,
        tools: [],
        // 1) Start minimized by default
        isMinimized: true,
        // Store collapsed state of each tool
        collapsedTools: {},

        /**
         * Ensure the container stays fully within the viewport
         */
        constrainToViewport(container) {
            // First, measure the current container dimensions
            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
            
            // Get viewport dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Get current position
            let currentLeft = parseInt(container.style.left || '0', 10);
            let currentTop = parseInt(container.style.top || '0', 10);
            
            // Convert bottom positioning to top if needed
            if (container.style.bottom && container.style.bottom !== 'unset') {
                currentTop = viewportHeight - containerHeight - parseInt(container.style.bottom, 10);
                container.style.bottom = 'unset';
            }
            
            // Constrain horizontally
            const maxLeft = viewportWidth - containerWidth;
            currentLeft = Math.max(0, Math.min(currentLeft, maxLeft));
            
            // Constrain vertically
            const maxTop = viewportHeight - containerHeight;
            currentTop = Math.max(0, Math.min(currentTop, maxTop));
            
            // Apply constrained position
            container.style.left = `${currentLeft}px`;
            container.style.top = `${currentTop}px`;
        },

        /**
         * Initialize the master container, if not already created.
         */
        initContainer() {
            if (this.container) return this.container;

            const container = document.createElement('div');
            container.id = 'smptToolsContainer';

            // 2) Set default position to bottom-left
            Object.assign(container.style, {
                position: 'fixed',
                bottom: '0px',
                left: '0px',
                backgroundColor: '#f9f9f9',
                border: '1px solid #ccc',
                padding: '10px',
                borderRadius: '5px',
                boxShadow: '0px 4px 6px rgba(0,0,0,0.1)',
                zIndex: '10000',
                fontFamily: 'Arial, sans-serif',
                cursor: 'grab',
                minWidth: '220px'
            });

            let isDragging = false;
            let offsetX = 0;
            let offsetY = 0;

            // Draggable logic
            container.addEventListener('mousedown', (e) => {
                // Only start dragging if the click is NOT on our minimize/expand button
                // or any tool title used for collapsing
                if (e.target.id === 'smptToolsToggleBtn' || 
                    e.target.classList.contains('tool-title')) return;
                
                isDragging = true;
                // Use the current offset when mouse is pressed
                offsetX = e.clientX - container.offsetLeft;
                offsetY = e.clientY - container.offsetTop;
                container.style.cursor = 'grabbing';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                // Calculate new position
                let newLeft = e.clientX - offsetX;
                let newTop = e.clientY - offsetY;
                
                // 3) As soon as we move, un-pin bottom and switch to top-based positioning
                container.style.bottom = 'unset';
                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                
                // Apply viewport constraints to keep fully in view
                this.constrainToViewport(container);
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                container.style.cursor = 'grab';
                
                // Ensure we're fully in view after drag ends
                this.constrainToViewport(container);
            });

            // ------------------------------------------
            // HEADER (Title + Minimize/Expand button)
            // ------------------------------------------
            const header = document.createElement('div');
            Object.assign(header.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px'
            });

            // Title text
            const title = document.createElement('span');
            title.innerText = MASTER_TOOL_NAME;
            Object.assign(title.style, {
                fontWeight: 'bold',
                fontSize: '14px'
            });
            header.appendChild(title);

            // Minimize / Expand button (using + or -)
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'smptToolsToggleBtn';
            // 4) Since we start minimized, set initial button text to "+"
            toggleBtn.innerText = '+';
            Object.assign(toggleBtn.style, {
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: '#333',
                border: '1px solid #ccc',
                borderRadius: '3px',
                padding: '0 5px',
                fontSize: '14px',
                marginLeft: '10px'
            });

            toggleBtn.addEventListener('click', () => {
                this.isMinimized = !this.isMinimized;
                this.toggleToolsDisplay();
                toggleBtn.innerText = this.isMinimized ? '+' : '-';
                
                // After expanding/collapsing, ensure we're still fully in viewport
                setTimeout(() => this.constrainToViewport(container), 0);
            });

            header.appendChild(toggleBtn);
            container.appendChild(header);

            // This div will hold all the tool containers
            const toolsArea = document.createElement('div');
            toolsArea.id = 'smptToolsArea';
            container.appendChild(toolsArea);

            document.body.appendChild(container);
            this.container = container;

            // 5) Immediately call toggleToolsDisplay() so it starts hidden
            this.toggleToolsDisplay();
            
            // Add mutation observer to check for size changes
            const resizeObserver = new ResizeObserver(() => {
                this.constrainToViewport(container);
            });
            resizeObserver.observe(container);
            
            // Add window resize event listener to ensure the container stays in bounds
            window.addEventListener('resize', () => {
                this.constrainToViewport(container);
            });

            return container;
        },

        /**
         * Toggle visibility for the tools area when minimized/expanded.
         */
        toggleToolsDisplay() {
            const toolsArea = document.getElementById('smptToolsArea');
            if (!toolsArea) return;
            toolsArea.style.display = this.isMinimized ? 'none' : 'block';
        },

        /**
         * Toggle collapse/expand for an individual tool
         */
        toggleToolCollapse(toolName) {
            // Toggle the collapsed state
            this.collapsedTools[toolName] = !this.collapsedTools[toolName];
            
            // Get the content div for this tool
            const toolContent = document.getElementById(`toolContent-${this.sanitizeId(toolName)}`);
            if (toolContent) {
                // Toggle display
                toolContent.style.display = this.collapsedTools[toolName] ? 'none' : 'block';
                
                // Toggle the indicator on the title
                const toolTitle = document.getElementById(`toolTitle-${this.sanitizeId(toolName)}`);
                if (toolTitle) {
                    const indicator = toolTitle.querySelector('.collapse-indicator');
                    if (indicator) {
                        indicator.textContent = this.collapsedTools[toolName] ? '+' : '-';
                    }
                }
                
                // After expanding/collapsing a tool, ensure container stays in viewport
                setTimeout(() => this.constrainToViewport(this.container), 0);
            }
        },
        
        /**
         * Helper to sanitize a string for use as an ID
         */
        sanitizeId(str) {
            return str.replace(/[^a-z0-9]/gi, '');
        },

        /**
         * Register a tool (with domain matching and a render function).
         */
        registerTool(toolObj) {
            this.tools.push(toolObj);
            this.renderTool(toolObj);
        },

        /**
         * Render a single tool if the domain matches.
         */
        renderTool(toolObj) {
            const currentURL = window.location.href;
            if (!toolObj.domainRegex.test(currentURL)) {
                return;
            }

            const container = this.initContainer();
            const toolsArea = document.getElementById('smptToolsArea');
            if (!toolsArea) return;

            // Create a sub-container for this tool
            const toolContainer = document.createElement('div');
            toolContainer.className = 'smpt-tool';
            toolContainer.style.marginTop = '10px';
            
            // Initialize collapsed state if not already set
            if (this.collapsedTools[toolObj.name] === undefined) {
                this.collapsedTools[toolObj.name] = true; // Start collapsed by default
            }

            // Create collapsible title
            const titleContainer = document.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.justifyContent = 'space-between';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.cursor = 'pointer';
            titleContainer.style.backgroundColor = '#444';
            titleContainer.style.color = 'white';
            titleContainer.style.padding = '5px 8px';
            titleContainer.style.borderRadius = '3px';
            
            // Create title text
            const title = document.createElement('h4');
            title.innerText = `SMPT - ${toolObj.name}`;
            title.id = `toolTitle-${this.sanitizeId(toolObj.name)}`;
            title.className = 'tool-title';
            title.style.margin = '0';
            title.style.fontWeight = 'bold';
            title.style.fontSize = '14px';
            
            // Create collapse indicator
            const collapseIndicator = document.createElement('span');
            collapseIndicator.className = 'collapse-indicator';
            collapseIndicator.textContent = this.collapsedTools[toolObj.name] ? '+' : '-';
            collapseIndicator.style.fontSize = '14px';
            collapseIndicator.style.fontWeight = 'bold';
            
            // Add click event to toggle collapse
            titleContainer.addEventListener('click', () => {
                this.toggleToolCollapse(toolObj.name);
            });
            
            // Assemble title container
            titleContainer.appendChild(title);
            titleContainer.appendChild(collapseIndicator);
            toolContainer.appendChild(titleContainer);
            
            // Create content container that can be collapsed
            const contentContainer = document.createElement('div');
            contentContainer.id = `toolContent-${this.sanitizeId(toolObj.name)}`;
            contentContainer.className = 'tool-content';
            contentContainer.style.padding = '8px 5px 5px 5px';
            contentContainer.style.display = this.collapsedTools[toolObj.name] ? 'none' : 'block';
            
            // Call the tool's render function with the content container
            toolObj.render(contentContainer);
            
            // Add content to tool container
            toolContainer.appendChild(contentContainer);

            // Append the tool's UI to the master container's tools area
            toolsArea.appendChild(toolContainer);
            
            // After rendering the tool, ensure container stays in viewport
            setTimeout(() => this.constrainToViewport(container), 0);
        },

        /**
         * Rerun domain checks if user navigates to another page
         * without reloading.
         */
        rerenderAllTools() {
            this.initContainer();
            const toolsArea = document.getElementById('smptToolsArea');
            if (toolsArea) {
                toolsArea.innerHTML = '';
            }
            this.tools.forEach(tool => this.renderTool(tool));
        }
    };

    // Add some CSS for the tool styling
    const style = document.createElement('style');
    style.textContent = `
        .smpt-tool {
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 3px;
            overflow: hidden;
        }
        .tool-title {
            user-select: none;
        }
        .tool-content {
            background-color: '#222';
            color: '#eee';
        }
        #smptToolsContainer {
            max-height: 100vh;
            max-width: 100vw;
            overflow: auto;
        }
    `;
    document.head.appendChild(style);

    // Initialize container once (so it's visible).
    window.SMPT.initContainer();
})();