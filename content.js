async function initializePokekingTranslator() {
    console.log("Pokeking Translator: Content script running (Final Version)");

    // --- Constants ---
    const POKEKING_TRANSLATED_CLASS = "pokeking-translated";
    const POKEKING_WRAPPER_CLASS = "pokeking-translated-wrapper";
    const POKEKING_BUTTON_CLASS = "pokeking-toggle-button"; // Your existing translation button class
    const POKEKING_ORIGINAL_DATA_ATTR = "original";
    const POKEKING_TRANSLATED_DATA_ATTR = "translated";

    // Constants for custom alert
    const CUSTOM_ALERT_ID = "pokeking-custom-alert";
    const CUSTOM_ALERT_MESSAGE_CLASS = "pokeking-custom-alert-message";
    const CUSTOM_ALERT_BUTTON_CLASS = "pokeking-custom-alert-button";

    // Constants for error report form
    const POKEKING_ERROR_FORM_ID = "pokeking-error-report-form";
    // *** IMPORTANT: YOUR ACTUAL GOOGLE APPS SCRIPT WEB APP URL HAS BEEN REPLACED HERE ***
    const APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxz6Gx7VSwUWtLMN0qsgzhZujGaxCiXhNrhUXnwl5Waz-3-I5MD6C95V-MobdD6SHZiDQ/exec'; // Populate this with your actual Google Apps Script Web App URL

    // NEW CONSTANTS FOR BUTTONS CONTAINER AND ERROR BUTTON
    const POKEKING_BUTTONS_CONTAINER_ID = "pokeking-buttons-container";
    const POKEKING_ERROR_BUTTON_CLASS = "pokeking-error-button";
    // END NEW CONSTANTS

    let isShowingOriginal = false; // Track whether we're showing original or translated text

    // --- Get the Dictionary from the Background Script (with retry logic) ---
    async function getDictionaryWithRetry(retries = 5, delay = 500) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await chrome.runtime.sendMessage({ action: "getDictionary" });
                console.log("Pokeking Translator: Received dictionary from background script.");
                return response.dictionary || {}; // Ensure it's an object, even if empty
            } catch (error) {
                if (error.message.includes("Receiving end does not exist") && i < retries - 1) {
                    console.warn(`Pokeking Translator: Background script not ready, retrying... (${i + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error("Pokeking Translator: Failed to get dictionary from background:", error);
                    return {}; // Return empty dictionary on final error
                }
            }
        }
        return {}; // Should not be reached if retries are exhausted, but as a fallback
    }

    const DICT = await getDictionaryWithRetry();

    if (Object.keys(DICT).length === 0) {
        console.warn("Pokeking Translator: Dictionary is empty or failed to load. Translation will not occur.");
    }

    // Pre-compile regex for efficient keyword replacement
    // Only compile if DICT is not empty
    const keywordRegex = Object.keys(DICT).length > 0
        ? new RegExp(`(${Object.keys(DICT).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")})`, "g")
        : null;
    console.log("Pokeking Translator: Keyword Regex:", keywordRegex);


    // --- Helper Functions ---

    /**
     * Extracts all relevant text nodes from a given root element.
     * Filters out empty nodes, hidden elements, and already processed nodes.
     * @param {HTMLElement} root - The root element to start the walk from.
     * @returns {Node[]} An array of text nodes.
     */
    function getAllStaticTextElements(root = document.body) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                const parent = node.parentElement;
                if (!parent) {
                    return NodeFilter.FILTER_REJECT;
                }
                const style = window.getComputedStyle(parent);
                if (style.visibility === "hidden" || style.display === "none") {
                    return NodeFilter.FILTER_REJECT;
                }
                // Exclude our own elements from being processed
                if (parent.classList?.contains(POKEKING_WRAPPER_CLASS) ||
                    parent.id === CUSTOM_ALERT_ID || parent.closest(`#${CUSTOM_ALERT_ID}`) ||
                    parent.id === POKEKING_ERROR_FORM_ID || parent.closest(`#${POKEKING_ERROR_FORM_ID}`) ||
                    parent.id === POKEKING_BUTTONS_CONTAINER_ID || parent.closest(`#${POKEKING_BUTTONS_CONTAINER_ID}`)) { // Exclude new container
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
        console.log(`Pokeking Translator: Found ${nodes.length} static text elements.`);
        return nodes;
    }

    /**
     * Replaces keywords in the provided text nodes using the pre-compiled regex.
     * Wraps translated text in spans with original and translated data attributes.
     * @param {Node[]} nodes - An array of text nodes to process.
     */
    function replaceKeywords(nodes) {
        if (!keywordRegex || Object.keys(DICT).length === 0) {
            console.warn("Pokeking Translator: No keyword regex or empty dictionary available, skipping keyword replacement.");
            return;
        }

        let translationsMade = 0;
        nodes.forEach(node => {
            const originalText = node.nodeValue;

            // Only process if the text contains potential keywords
            if (!keywordRegex.test(originalText)) {
                return;
            }

            // Reset lastIndex for global regex in case it was used before
            keywordRegex.lastIndex = 0;
            const translatedText = originalText.replace(keywordRegex, match => DICT[match] || match);

            if (translatedText === originalText) {
                return;
            }

            const span = document.createElement("span");
            span.className = POKEKING_TRANSLATED_CLASS;
            span.dataset[POKEKING_ORIGINAL_DATA_ATTR] = originalText;
            span.dataset[POKEKING_TRANSLATED_DATA_ATTR] = translatedText;
            span.textContent = translatedText; // Initially show translated text

            const wrapper = document.createElement("span");
            wrapper.className = POKEKING_WRAPPER_CLASS;
            wrapper.appendChild(span);

            if (node.parentNode) {
                node.parentNode.replaceChild(wrapper, node);
                translationsMade++;
            }
        });
        if (translationsMade > 0) {
            console.log(`Pokeking Translator: Performed ${translationsMade} keyword replacements.`);
        }
    }

    /**
     * Toggles the visibility between original and translated text for all
     * currently translated elements.
     */
    function toggleTranslationDisplay() {
        console.log(`Pokeking Translator: Toggling translation display. isShowingOriginal: ${isShowingOriginal}`);
        document.querySelectorAll(`.${POKEKING_TRANSLATED_CLASS}`).forEach(span => {
            if (isShowingOriginal) {
                span.textContent = span.dataset[POKEKING_ORIGINAL_DATA_ATTR];
            } else {
                span.textContent = span.dataset[POKEKING_TRANSLATED_DATA_ATTR];
            }
        });
    }

    /**
     * Shows a custom alert pop-up with translated text.
     * @param {string} originalMessage - The original message from the native alert.
     */
    function showCustomAlert(originalMessage) {
        console.log("Pokeking Translator: Showing custom alert for:", originalMessage);
        let alertDiv = document.getElementById(CUSTOM_ALERT_ID);
        if (!alertDiv) {
            alertDiv = document.createElement("div");
            alertDiv.id = CUSTOM_ALERT_ID;

            const alertContent = document.createElement("div");
            alertContent.className = "pokeking-custom-alert-content";

            const messageElement = document.createElement("p");
            messageElement.className = CUSTOM_ALERT_MESSAGE_CLASS;
            alertContent.appendChild(messageElement);

            const okButton = document.createElement("button");
            okButton.className = CUSTOM_ALERT_BUTTON_CLASS;
            okButton.textContent = "OK";
            alertContent.appendChild(okButton);

            alertDiv.appendChild(alertContent);
            document.body.appendChild(alertDiv);

            if (!document.getElementById('pokeking-custom-alert-styles')) {
                const styleTag = document.createElement('style');
                styleTag.id = 'pokeking-custom-alert-styles';
                styleTag.textContent = `
                    #${CUSTOM_ALERT_ID} {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.7);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 10000;
                        font-family: Arial, sans-serif;
                    }
                    .pokeking-custom-alert-content {
                        background-color: #333;
                        color: #fff;
                        padding: 30px;
                        border-radius: 8px;
                        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
                        text-align: center;
                        min-width: 280px;
                        max-width: 80%;
                        box-sizing: border-box;
                    }
                    .${CUSTOM_ALERT_MESSAGE_CLASS} {
                        margin-bottom: 20px;
                        font-size: 1.1em;
                    }
                    .${CUSTOM_ALERT_BUTTON_CLASS} {
                        background-color: #4CAF50;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 1em;
                        transition: background-color 0.2s ease;
                    }
                    .${CUSTOM_ALERT_BUTTON_CLASS}:hover {
                        background-color: #45a049;
                    }
                `;
                document.head.appendChild(styleTag);
            }

            okButton.onclick = () => {
                alertDiv.style.display = 'none';
            };
        }

        const messageElement = alertDiv.querySelector(`.${CUSTOM_ALERT_MESSAGE_CLASS}`);
        // Translate the alert message using the fetched dictionary
        const translatedMessage = DICT[originalMessage.trim()] || originalMessage;
        messageElement.textContent = translatedMessage;

        alertDiv.style.display = 'flex';
    }

    // Function for temporary user feedback (optional but recommended)
    function showTemporaryMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.5s ease-in-out;
            pointer-events: none; /* Allows clicks to pass through */
        `;
        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.style.opacity = 1;
        }, 10); // Small delay to trigger transition

        setTimeout(() => {
            messageDiv.style.opacity = 0;
            messageDiv.addEventListener('transitionend', () => messageDiv.remove());
        }, 2000); // Message disappears after 2 seconds
    }


    // --- Error Report Form HTML (Injected) ---
    const errorReportFormHTML = `
        <div id="${POKEKING_ERROR_FORM_ID}" style="display: none;">
            <div class="pokeking-error-form-content">
                <h3>Report Translation Error</h3>

                <p><strong>Original Chinese Text:</strong> <span id="pokeking-display-chinese-text"></span></p>
                <label for="pokeking-user-provided-chinese-text">Correct Chinese Text (if different or missing):</label>
                <input type="text" id="pokeking-user-provided-chinese-text" placeholder="e.g., 请输入正确的中文文本">

                <p><strong>Current Translation:</strong> <span id="pokeking-display-current-translation"></span></p>

                <label for="pokeking-contributor-ign">Your IGN (optional):</label>
                <input type="text" id="pokeking-contributor-ign" placeholder="e.g., abc">

                <label for="pokeking-team-used">Your Team (optional):</label>
                <input type="text" id="pokeking-team-used" placeholder="e.g., wild taste">

                <label for="pokeking-pokeking-code">Pokeking Code (optional):</label>
                <input type="text" id="pokeking-pokeking-code" placeholder="e.g., 8E8EBC6ECBC9DEE4FE9BFAEC97A05375">

                <input type="hidden" id="pokeking-pokemon-region">
                <input type="hidden" id="pokeking-elite-four-member">
                <input type="hidden" id="pokeking-lead-pokemon">

                <label for="pokeking-user-suggested-correction">Suggested Correction/Extra Info (optional):</label>
                <textarea id="pokeking-user-suggested-correction" placeholder="e.g., Should be 'snorlax'"></textarea>

                <div class="pokeking-error-form-buttons">
                    <button id="pokeking-submit-error-btn">Submit Report</button>
                    <button id="pokeking-cancel-report-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    /**
     * Parses the DOM to extract relevant game context (region, E4 member, lead Pokemon).
     * This now directly reads text content from breadcrumb elements.
     * @returns {object} An object containing region, eliteFourMember, and leadPokemon.
     */
    function parseUrlForContext() {
        let region = '';
        let eliteFourMember = '';
        let leadPokemon = '';

        // Select all breadcrumb items (assuming ol.breadcrumb > li structure)
        const breadcrumbItems = document.querySelectorAll('ol.breadcrumb > li');

        if (breadcrumbItems.length > 0) {
            // Helper to safely extract text from a breadcrumb item
            const extractText = (item) => {
                // Prioritize the text content of an anchor tag if it exists (for links)
                // Otherwise, use the overall text content of the list item.
                const link = item.querySelector('a');
                return (link ? link.textContent : item.textContent).trim();
            };

            // Based on the screenshot's breadcrumb: /home / johto / will / 詞彙奇
            // Index 0: /home
            // Index 1: johto (Region)
            // Index 2: will (Elite Four Member)
            // Index 3: 詞彙奇 (Lead Pokemon)

            if (breadcrumbItems[1]) { // Check if 'johto' exists
                region = extractText(breadcrumbItems[1]);
            }

            if (breadcrumbItems[2]) { // Check if 'will' exists
                eliteFourMember = extractText(breadcrumbItems[2]);
            }

            if (breadcrumbItems[3]) { // Check if '詞彙奇' exists
                leadPokemon = extractText(breadcrumbItems[3]);
            }
        }

        console.log("Pokeking Translator: Parsed context:", { region, eliteFourMember, leadPokemon });
        return {
            region: region,
            eliteFourMember: eliteFourMember,
            leadPokemon: leadPokemon
        };
    }


    /**
     * Shows the custom error report form.
     * @param {string} originalChineseText - The Chinese text that needs translation (detected or provided).
     * @param {string} currentTranslation - The current (possibly incorrect or missing) translation.
     */
    function showErrorReportForm(originalChineseText, currentTranslation) {
        console.log("Pokeking Translator: Showing error report form for:", originalChineseText);

        let errorFormDiv = document.getElementById(POKEKING_ERROR_FORM_ID);
        if (!errorFormDiv) {
            // Inject the form HTML if it doesn't exist
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = errorReportFormHTML;
            errorFormDiv = tempDiv.firstElementChild; // Get the main div
            document.body.appendChild(errorFormDiv);

            // Attach event listeners for the form buttons after injection
            document.getElementById('pokeking-submit-error-btn').addEventListener('click', handleSubmitError);
            document.getElementById('pokeking-cancel-report-btn').addEventListener('click', () => {
                errorFormDiv.style.display = 'none'; // Hide the form
            });
        }

        // Populate the read-only and optional fields
        document.getElementById('pokeking-display-chinese-text').textContent = originalChineseText;
        document.getElementById('pokeking-display-current-translation').textContent = currentTranslation || 'N/A';

        // Clear user input fields for a fresh report
        document.getElementById('pokeking-contributor-ign').value = '';
        document.getElementById('pokeking-team-used').value = '';
        document.getElementById('pokeking-pokeking-code').value = '';
        document.getElementById('pokeking-user-suggested-correction').value = '';
        document.getElementById('pokeking-user-provided-chinese-text').value = ''; // Clear new editable field

        // --- Automatically pre-fill based on URL/DOM context ---
        const urlContext = parseUrlForContext();
        document.getElementById('pokeking-pokemon-region').value = urlContext.region;
        document.getElementById('pokeking-elite-four-member').value = urlContext.eliteFourMember;
        document.getElementById('pokeking-lead-pokemon').value = urlContext.leadPokemon;

        errorFormDiv.style.display = 'flex'; // Show the form
    }

    // --- Function to handle form submission ---
    async function handleSubmitError() {
        // Use the displayed text first, then user-provided text if it exists
        const chineseTextDisplayed = document.getElementById('pokeking-display-chinese-text').textContent;
        const userProvidedChineseText = document.getElementById('pokeking-user-provided-chinese-text').value.trim();
        const finalChineseText = userProvidedChineseText || chineseTextDisplayed;

        const formData = new FormData();
        formData.append('contributor', document.getElementById('pokeking-contributor-ign').value);
        formData.append('teamUsed', document.getElementById('pokeking-team-used').value);
        formData.append('pokekingCode', document.getElementById('pokeking-pokeking-code').value);

        // Get pre-filled values directly from the input fields (even if readonly)
        formData.append('pokemonRegion', document.getElementById('pokeking-pokemon-region').value);
        formData.append('eliteFourMember', document.getElementById('pokeking-elite-four-member').value);
        formData.append('leadPokemon', document.getElementById('pokeking-lead-pokemon').value);

        formData.append('chineseText', finalChineseText); // Use combined text (now optional)
        formData.append('currentTranslation', document.getElementById('pokeking-display-current-translation').textContent);
        formData.append('userSuggestedCorrection', document.getElementById('pokeking-user-suggested-correction').value);
        formData.append('pageUrl', window.location.href);


        try {
            const response = await fetch(APPS_SCRIPT_WEB_APP_URL, {
                method: 'POST',
                body: formData, // FormData handles the Content-Type: multipart/form-data header automatically
            });

            const result = await response.json();

            if (result.success) {
                showCustomAlert('Translation error reported successfully! Thank you for your contribution.');
                document.getElementById(POKEKING_ERROR_FORM_ID).style.display = 'none'; // Hide the form
            } else {
                showCustomAlert('Failed to report error: ' + (result.message || 'Unknown error.'));
                console.error('Error reporting translation:', result);
            }
        } catch (error) {
            showCustomAlert('An error occurred while sending the report. Please check your internet connection.');
            console.error('Network or fetch error:', error);
        }
    }

    function injectGameButtonStyles() {
        console.log("Pokeking Translator: Injecting game button specific styles.");
        if (!document.getElementById('pokeking-game-button-styles')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'pokeking-game-button-styles';
            styleTag.textContent = `
                /* Aggressive resets for html/body to ensure fixed positioning works correctly */
                html, body {
                    transform: none !important;
                    perspective: none !important;
                    filter: none !important;
                    /* Ensure no hidden overflow that might affect fixed elements */
                    /* overflow-x: visible !important; */ /* Be careful with this, can break website layout */
                    /* overflow-y: visible !important; */
                }

                /*
                 * Target the specific fixed button group on the right.
                 * This targets the div with specific inline styles for robustness.
                 * Uses 'left' and 'calc(100vw - ...)' for robust horizontal positioning
                 * that stays within the viewport even with horizontal scrolling.
                 */
                div[style*="position: fixed"][style*="bottom: 10px"][style*="right: 20px"] {
                    position: fixed !important; /* Ensure it's truly fixed to the viewport */
                    bottom: 15px !important; /* Keep bottom at 10px from viewport bottom */
                    left: calc(100vw - 160px) !important; /* Pin from left: 100vw - (approx_width_of_buttons) - margin */
                                                        /* Adjust 160px based on actual button group width */
                    right: auto !important; /* Crucial: ensures 'left' takes precedence */
                    transform: none !important; /* Reset any potential horizontal transforms */
                    width: auto !important; /* Allow width to be determined by content */
                    max-width: 155px !important; /* 155 Max width to prevent it from going too wide. Adjust if buttons get wider. */
                    z-index: 99999 !important; /* Extremely high z-index to ensure visibility */
                    overflow: visible !important; /* Ensure content isn't clipped */
                }

                /* Apply sizing and styling to the individual buttons within that specific fixed group */
                div[style*="position: fixed"][style*="bottom: 10px"][style*="right: 20px"] .btn-group .btn {
                    padding: 8px 12px !important; /* Increased vertical padding for taller buttons */
                    font-size: 15px !important; /* 0.85em Smaller font size relative to parent */
                    height: auto !important; /* Allow height to adjust naturally */
                    min-width: unset !important; /* Remove any minimum width restrictions */
                    line-height: 1.2 !important; /* Adjust line height for better appearance */
                    white-space: nowrap !important; /* Prevent text from wrapping inside the button */
                    border-radius: 6px !important; /* Consistent rounded corners */
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; /* Subtle shadow */
                }

                /* Ensure the translated span content also scales down */
                div[style*="position: fixed"][style*="bottom: 10px"][style*="right: 20px"] .btn-group .btn .${POKEKING_TRANSLATED_CLASS} {
                    font-size: 15px !important; /* Make sure nested span text matches or is smaller */
                    display: inline-block !important; /* maintain proper display */
                    padding: 0 !important; /* Remove any padding on the span itself */
                    line-height: inherit !important; /* Inherit line height from parent button */
                }

                /* Ensure the .btn-group uses flexbox and maintains row direction */
                div[style*="position: fixed"][style*="bottom: 10px"][style*="right: 20px"] .btn-group {
                    display: flex !important; /* Ensure flexbox for horizontal layout */
                    flex-direction: row !important; /* Explicitly keep them in a row */
                    gap: 5px !important; /* Adds a small gap between buttons within the group */
                    justify-content: flex-end !important; /* Align buttons to the right within their container */
                    align-items: center !important; /* Vertically align them */
                }

                /* --- Mobile-specific adjustments for Game Buttons --- */
                @media (max-width: 768px) {
                    div[style*="position: fixed"][style*="bottom: 10px"][style*="right: 20px"] {
                        bottom: 15px !important; /* Slightly raise from very bottom to avoid native UI on some devices */
                        left: calc(100vw - 125px) !important; /* Adjust 125px for mobile button group width */
                        max-width: 120px !important; /* More restrictive max-width for smaller screens */
                    }
                    div[style*="position: fixed"][style*="bottom: 10px"][style*="right: 20px"] .btn-group .btn {
                        padding: 5px 6px !important; /* Taller vertical padding for mobile, while keeping horizontal small */
                        font-size: 0.7em !important; /* Even smaller font size for mobile */
                    }
                }
            `;
            document.head.appendChild(styleTag);
        }
    }

    // --- Injected script setup (moved from inside a function) ---
    const s = document.createElement('script');
    // Ensure browser object is available for getURL
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    s.src = browserAPI.runtime.getURL('injected_script.js');
    s.onload = function() {
        this.remove();
        console.log("Pokeking Translator: Injected script loaded and removed.");
    };
    (document.head || document.documentElement).prepend(s);

    // --- Listen for Custom Events from the Injected Script ---

    // ** THIS IS THE NEWLY ADDED LISTENER FOR ALERT INTERCEPTION **
    window.addEventListener('pokekingAlertIntercepted', (event) => {
        const message = event.detail.message;
        console.log("Pokeking Translator: Received alert from injected script:", message);
        // Assuming showCustomAlert is defined elsewhere in your content script
        showCustomAlert(message);
    });

    // Your existing listener for report requests
    window.addEventListener('pokekingReportRequest', (event) => {
        const { originalText, currentTranslatedText, pageUrl } = event.detail;
        console.log("Pokeking Translator: Received report request via custom event:", originalText, currentTranslatedText, pageUrl);
        // Assuming showErrorReportForm is defined elsewhere in your content script
        showErrorReportForm(originalText, currentTranslatedText);
    });

    // --- Function to Add Extension Buttons (Left Side) ---
    function addExtensionButtons() {
        let container = document.getElementById(POKEKING_BUTTONS_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = POKEKING_BUTTONS_CONTAINER_ID;
            document.body.appendChild(container); // Ensure it's appended directly to body
        }

        // It's crucial this style block is appended only once
        if (!document.getElementById('pokeking-buttons-styles')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'pokeking-buttons-styles';
            styleTag.textContent = `
                /* Main container for extension buttons - ensure it's always visible */
                #${POKEKING_BUTTONS_CONTAINER_ID} {
                    position: fixed !important; /* Ensure it's truly fixed to the viewport */
                    top: 45px !important; /* Keep it at the very bottom of the viewport */
                    right: 5px !important; /* All the way left with a small indent */
                    left: auto !important; /* Ensure it's not fighting for space on the right */
                    width: fit-content !important; /* Allow width to shrink to content */
                    height: fit-content !important; /* Allow height to shrink to content */
                    z-index: 99999 !important; /* Extremely high z-index */
                    display: flex !important;
                    flex-direction: row !important; /* Stacks buttons vertically */
                    align-items: flex-start !important; /* Aligns items to the left */
                    gap: 5px !important;
                    /* padding-bottom: env(safe-area-inset-bottom) !important; */ /* For newer iOS safe areas, if applicable */
                }
                #${POKEKING_BUTTONS_CONTAINER_ID} button {
                    bottom: 0px !important;
                    padding: 4px 6px !important;
                    border: none !important;
                    border-radius: 8px !important;
                    font-size: 13px !important;
                    cursor: pointer !important;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
                    opacity: 0.7 !important;
                    text-align: center !important;
                    min-width: 45px !important;
                }
                .${POKEKING_BUTTON_CLASS} {
                    background-color:rgb(37, 37, 37) !important;
                    color: white !important;
                    transition: background 0.2s ease, transform 0.1s ease !important;
                }
                .${POKEKING_BUTTON_CLASS}:hover { background:rgb(80, 80, 80) !important; }
                .${POKEKING_BUTTON_CLASS}:active { transform: translateY(1px) !important; }

                .${POKEKING_ERROR_BUTTON_CLASS} {
                    background-color: #dc3545 !important;\
                    opacity: 0.7 !important;
                    color: white !important;
                    transition: background 0.2s ease, transform 0.1s ease !important;
                }
                .${POKEKING_ERROR_BUTTON_CLASS}:hover { background: #c82333 !important; }
                .${POKEKING_ERROR_BUTTON_CLASS}:active { transform: translateY(1px) !important; }

                /* --- Mobile-specific adjustments for Extension Buttons --- */
                @media (max-width: 768px) {
                    #${POKEKING_BUTTONS_CONTAINER_ID} {
                        bottom: 5px !important;
                        left: 250px !important; /* Slightly more room from left edge */
                    }
                    #${POKEKING_BUTTONS_CONTAINER_ID} button {
                            font-size: 10px !important;
                            padding: 3px 5px !important;
                            min-width: 45px !important; /* 65px */
                    }
                }
            `;
            document.head.appendChild(styleTag);
        }

        // Button creation/re-creation logic
        let translationButton = document.getElementById('myTranslationToggleButton');
        if (!translationButton || !container.contains(translationButton)) {
            translationButton = document.createElement("button");
            translationButton.id = 'myTranslationToggleButton';
            translationButton.textContent = "CN"; /* "Show Original" */
            translationButton.className = POKEKING_BUTTON_CLASS;
            container.appendChild(translationButton);
        }

        let errorReportButton = document.getElementById('myErrorReportButton');
        if (!errorReportButton || !container.contains(errorReportButton)) {
            errorReportButton = document.createElement("button");
            errorReportButton.id = 'myErrorReportButton';
            errorReportButton.textContent = 'Report Error';
            errorReportButton.className = POKEKING_ERROR_BUTTON_CLASS;
            container.appendChild(errorReportButton);
        }

        // Listener attachment logic
        if (!translationButton._pokekingListenerAttached) {
            translationButton.onclick = () => {
                const errorFormDiv = document.getElementById(POKEKING_ERROR_FORM_ID);
                if (errorFormDiv && errorFormDiv.style.display !== 'none') {
                    errorFormDiv.style.display = 'none';
                    return;
                }
                isShowingOriginal = !isShowingOriginal;
                console.log(`Pokeking Translator: Toggle button clicked. isShowingOriginal: ${isShowingOriginal}`);
                if (isShowingOriginal) {
                    toggleTranslationDisplay();
                    translationButton.textContent = "ENG"; /* "Show Translated" */
                } else {
                    replaceKeywords(getAllStaticTextElements()); // Re-translate new content
                    toggleTranslationDisplay(); // Show translated for existing elements
                    translationButton.textContent = "CN"; /* "Show Original" */
                }
            };
            translationButton._pokekingListenerAttached = true; // Mark as attached
        }

        if (!errorReportButton._pokekingListenerAttached) {
            errorReportButton.onclick = () => {
                const selection = window.getSelection();
                let originalChineseText = "";
                let currentTranslation = "";
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    let containingSpan = range.startContainer.parentElement;
                    while (containingSpan && !containingSpan.classList.contains(POKEKING_TRANSLATED_CLASS) && containingSpan !== document.body) {
                        containingSpan = containingSpan.parentElement;
                    }
                    if (containingSpan && containingSpan.classList.contains(POKEKING_TRANSLATED_CLASS)) {
                        originalChineseText = containingSpan.dataset[POKEKING_ORIGINAL_DATA_ATTR] || "";
                        currentTranslation = containingSpan.dataset[POKEKING_TRANSLATED_DATA_ATTR] || "";
                    } else {
                        originalChineseText = selection.toString().trim();
                        currentTranslation = DICT[originalChineseText] || originalChineseText;
                    }
                }
                if (!originalChineseText.trim()) {
                    const promptedText = prompt("Please enter the Chinese text to report (or select it on the page):", "");
                    if (promptedText === null) {
                        showTemporaryMessage("Error report cancelled.");
                        return;
                    }
                    originalChineseText = promptedText.trim();
                    currentTranslation = DICT[originalChineseText] || originalChineseText;
                }
                if (!originalChineseText.trim()) {
                    showTemporaryMessage("No text provided for error report.");
                    return;
                }
                showErrorReportForm(originalChineseText, currentTranslation);
                console.log("Pokeking Translator: Error Report button clicked. Original Text:", originalChineseText, "Current Translation:", currentTranslation);
            };
            errorReportButton._pokekingListenerAttached = true; // Mark as attached
        }
    }


    // --- Initialize Translation and Observer ---
    function initializeTranslationAndObserver() {
        console.log("Pokeking Translator: Initializing translation and observer setup.");

        // Initial translation after a short delay to allow DOM to settle
        setTimeout(() => {
            console.log("Pokeking Translator: Running initial keyword replacement (after 500ms delay).");
            replaceKeywords(getAllStaticTextElements());
            injectGameButtonStyles(); // Ensure game button styles are applied
            addExtensionButtons(); // Ensure extension buttons are present after initial load
        }, 500);

        const observer = new MutationObserver((mutations) => {
            if (isShowingOriginal) {
                // If showing original, don't auto-translate new nodes.
                // However, still re-apply styles and buttons if the DOM structure changes significantly.
                let domChangedSignificantly = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        domChangedSignificantly = true;
                        break; // Only need one significant change to trigger style/button re-check
                    }
                }
                if (domChangedSignificantly) {
                    injectGameButtonStyles();
                    setTimeout(() => {
                        addExtensionButtons();
                    }, 50);
                }
                return;
            }

            const nodesToTranslate = [];
            let domChangedSignificantly = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    domChangedSignificantly = true;
                    for (const node of mutation.addedNodes) {
                        // ... (your existing filtering logic for nodes to translate) ...
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (!node.parentNode || node.parentNode.id === CUSTOM_ALERT_ID || node.parentNode.closest(`#${CUSTOM_ALERT_ID}`) ||
                                node.parentNode.id === POKEKING_ERROR_FORM_ID || node.parentNode.closest(`#${POKEKING_ERROR_FORM_ID}`) ||
                                node.parentNode.classList?.contains(POKEKING_WRAPPER_CLASS) ||
                                node.parentNode.id === POKEKING_BUTTONS_CONTAINER_ID || node.parentNode.closest(`#${POKEKING_BUTTONS_CONTAINER_ID}`)) continue;
                            nodesToTranslate.push(node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList?.contains(POKEKING_WRAPPER_CLASS) || node.classList?.contains(POKEKING_BUTTON_CLASS) ||
                                node.classList?.contains(POKEKING_ERROR_BUTTON_CLASS) ||
                                node.id === CUSTOM_ALERT_ID || node.closest(`#${CUSTOM_ALERT_ID}`) ||
                                node.id === POKEKING_ERROR_FORM_ID || node.closest(`#${POKEKING_ERROR_FORM_ID}`) ||
                                node.id === POKEKING_BUTTONS_CONTAINER_ID || node.closest(`#${POKEKING_BUTTONS_CONTAINER_ID}`)) {
                                continue;
                            }
                            nodesToTranslate.push(...getAllStaticTextElements(node));
                        }
                    }
                }
            }
            if (nodesToTranslate.length > 0) {
                console.log(`Pokeking Translator: MutationObserver detected changes. Processing ${nodesToTranslate.length} nodes.`);
                replaceKeywords(nodesToTranslate);
            }

            // Re-inject styles and ensure buttons are present on significant DOM changes
            if (domChangedSignificantly) {
                injectGameButtonStyles(); // Re-apply styles for game buttons
                setTimeout(() => { // Add a slight delay for re-checking/re-adding extension buttons
                    addExtensionButtons();
                }, 50);
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: false,
                attributes: false
            });
            console.log("Pokeking Translator: MutationObserver active on document.body.");
        } else {
            console.error("Pokeking Translator: document.body not found even after DOMContentLoaded!");
        }
    }


    // --- Styles for the translation text ---
    if (!document.getElementById('pokeking-translation-text-styles')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'pokeking-translation-text-styles';
        styleTag.textContent = `
            .${POKEKING_TRANSLATED_CLASS} {
                padding: 1px 0;
                display: inline-block;
            }
        `;
        document.head.appendChild(styleTag);
    }

    // --- Styles for the Error Report Form ---
    if (!document.getElementById('pokeking-error-form-styles')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'pokeking-error-form-styles';
        styleTag.textContent = `
            #${POKEKING_ERROR_FORM_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10001; /* Higher than custom alert */
                font-family: Arial, sans-serif;
                color: #eee;
            }
            #${POKEKING_ERROR_FORM_ID} .pokeking-error-form-content {
                background-color: #222;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 5px 20px rgba(0, 0, 0, 0.7);
                max-width: 500px;
                width: 90%;
                box-sizing: border-box;
                max-height: 90vh; /* Allow scrolling for long forms */
                overflow-y: auto;
            }
            #${POKEKING_ERROR_FORM_ID} h3 {
                color: #4CAF50;
                margin-top: 0;
                text-align: center;
            }
            #${POKEKING_ERROR_FORM_ID} label {
                display: block;
                margin-top: 10px;
                margin-bottom: 5px;
                font-size: 0.9em;
                color: #bbb;
            }
            #${POKEKING_ERROR_FORM_ID} input[type="text"],
            #${POKEKING_ERROR_FORM_ID} textarea {
                width: calc(100% - 16px);
                padding: 8px;
                margin-bottom: 10px;
                border: 1px solid #555;
                border-radius: 4px;
                background-color: #333;
                color: #eee;
                font-size: 1em;
            }
            #${POKEKING_ERROR_FORM_ID} input[type="text"][readonly] {
                background-color: #444;
                color: #aaa;
                cursor: default;
            }
            #${POKEKING_ERROR_FORM_ID} p {
                margin: 5px 0;
                font-size: 0.9em;
            }
            #${POKEKING_ERROR_FORM_ID} strong {
                color: #ccc;
            }
            #${POKEKING_ERROR_FORM_ID} .pokeking-error-form-buttons {
                display: flex;
                justify-content: space-around;
                margin-top: 20px;
            }
            #${POKEKING_ERROR_FORM_ID} button {
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1em;
                transition: background-color 0.2s ease;
                min-width: 100px;
            }
            #${POKEKING_ERROR_FORM_ID} button:hover {
                background-color: #45a049;
            }
            #${POKEKING_ERROR_FORM_ID} button#pokeking-cancel-report-btn {
                background-color: #f44336;
            }
            #${POKEKING_ERROR_FORM_ID} button#pokeking-cancel-report-btn:hover {
                background-color: #da190b;
            }
        `;
        document.head.appendChild(styleTag);
    }

    // Check if the DOM is already loaded. If so, initialize immediately.
    // Otherwise, wait for DOMContentLoaded.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTranslationAndObserver);
        console.log("Pokeking Translator: Waiting for DOMContentLoaded...");
    } else {
        console.log("Pokeking Translator: DOM already loaded. Initializing immediately.");
        initializeTranslationAndObserver();
    }
}

// Call the main async function to start the script execution
initializePokekingTranslator();