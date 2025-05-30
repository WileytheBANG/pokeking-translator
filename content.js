// content.js - Pokeking Translator (Final Version with Injected Script, Background Dictionary, and Error Reporting)

// This content script runs in an isolated world, handling UI for translation
// and communicating with an injected script that overrides native functions.

// Define your main async function
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


    // --- Core Logic: Inject the script that performs the actual alert override into the page's context ---
    const s = document.createElement('script');
    // Ensure browser object is available for getURL
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    s.src = browserAPI.runtime.getURL('injected_script.js');
    s.onload = function() {
        this.remove();
        console.log("Pokeking Translator: Injected script loaded and removed.");
    };
    (document.head || document.documentElement).prepend(s);


    // ** THIS IS THE NEWLY ADDED LISTENER FOR ALERT INTERCEPTION **
    window.addEventListener('pokekingAlertIntercepted', (event) => {
        const message = event.detail.message;
        console.log("Pokeking Translator: Received alert from injected script:", message);
        showCustomAlert(message); // Call your custom alert function
    });
    
    // This event is dispatched by the function injected from the background script
    window.addEventListener('pokekingReportRequest', (event) => {
        const { originalText, currentTranslatedText, pageUrl } = event.detail;
        console.log("Pokeking Translator: Received report request via custom event:", originalText, currentTranslatedText, pageUrl);
        // Now show your report form with the collected data
        showErrorReportForm(originalText, currentTranslatedText);
    });
    // --- Main Logic (for static content) ---

    // MODIFIED FUNCTION: addExtensionButtons to handle both buttons and a container
    function addExtensionButtons() {
        // Create the main container for both buttons
        let container = document.getElementById(POKEKING_BUTTONS_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = POKEKING_BUTTONS_CONTAINER_ID;
            container.style.cssText = `
                position: fixed;
                bottom: 20px; /* Distance from bottom */
                left: 20px;   /* Distance from left */
                z-index: 9999; /* Ensure it's on top */
                display: flex;
                flex-direction: column; /* Stacks buttons vertically (error above translation) */
                align-items: flex-start; /* Aligns buttons to the left within the column */
                gap: 10px; /* Space between buttons */
            `;
            document.body.appendChild(container);

            // Inject styles for the container and buttons
            if (!document.getElementById('pokeking-buttons-styles')) {
                const styleTag = document.createElement('style');
                styleTag.id = 'pokeking-buttons-styles';
                styleTag.textContent = `
                    #${POKEKING_BUTTONS_CONTAINER_ID} button {
                        padding: 10px 15px;
                        border: none;
                        border-radius: 8px; /* Consistent rounded corners */
                        font-size: 14px;
                        cursor: pointer;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                        min-width: 120px; /* Ensure consistent width for better alignment */
                        text-align: center;
                    }
                    /* Styling for the Translation Toggle Button */
                    .${POKEKING_BUTTON_CLASS} {
                        background-color: #007bff; /* Blue */
                        color: white;
                        transition: background 0.2s ease, transform 0.1s ease;
                    }
                    .${POKEKING_BUTTON_CLASS}:hover {
                        background: #0056b3;
                    }
                    .${POKEKING_BUTTON_CLASS}:active {
                        transform: translateY(1px);
                    }

                    /* Styling for the new Error Report Button */
                    .${POKEKING_ERROR_BUTTON_CLASS} {
                        background-color: #dc3545; /* Red */
                        color: white;
                        transition: background 0.2s ease, transform 0.1s ease;
                    }
                    .${POKEKING_ERROR_BUTTON_CLASS}:hover {
                        background: #c82333;
                    }
                    .${POKEKING_ERROR_BUTTON_CLASS}:active {
                        transform: translateY(1px);
                    }
                `;
                document.head.appendChild(styleTag);
            }
        }

        // Create or get the Translation Toggle Button
        let translationButton = document.getElementById('myTranslationToggleButton');
        if (!translationButton) {
            translationButton = document.createElement("button");
            translationButton.id = 'myTranslationToggleButton'; // Give it a unique ID
            translationButton.textContent = "Show Original";
            translationButton.className = POKEKING_BUTTON_CLASS; // Use your existing class
            container.appendChild(translationButton);
        }

        // Create or get the Error Report Button
        let errorReportButton = document.getElementById('myErrorReportButton');
        if (!errorReportButton) {
            errorReportButton = document.createElement("button");
            errorReportButton.id = 'myErrorReportButton'; // Give it a unique ID
            errorReportButton.textContent = 'Report Error';
            errorReportButton.className = POKEKING_ERROR_BUTTON_CLASS; // New class for styling
            // Append error button above translation button (due to flex-direction: column)
            container.insertBefore(errorReportButton, translationButton);
        }


        // Attach event listeners for both buttons

        // Translation Button Logic
        translationButton.onclick = () => {
            // If the error form is currently open, this button should hide it
            const errorFormDiv = document.getElementById(POKEKING_ERROR_FORM_ID);
            if (errorFormDiv && errorFormDiv.style.display !== 'none') {
                errorFormDiv.style.display = 'none';
                return; // Just hide the form if it's open
            }

            isShowingOriginal = !isShowingOriginal;
            console.log(`Pokeking Translator: Toggle button clicked. isShowingOriginal: ${isShowingOriginal}`);

            if (isShowingOriginal) {
                toggleTranslationDisplay(); // Show original text
                translationButton.textContent = "Show Translated"; // Update button text
            } else {
                replaceKeywords(getAllStaticTextElements()); // Re-run translation on full page for new content
                toggleTranslationDisplay(); // Apply current display state (translated)
                translationButton.textContent = "Show Original"; // Update button text
            }
        };

// Error Report Button Logic
        errorReportButton.onclick = () => {
            const selection = window.getSelection();
            let originalChineseText = "";
            let currentTranslation = "";

            // Check if there is a selection
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                let containingSpan = range.startContainer.parentElement;

                // Traverse up the DOM tree to find the closest .pokeking-translated span
                while (containingSpan && !containingSpan.classList.contains(POKEKING_TRANSLATED_CLASS) && containingSpan !== document.body) {
                    containingSpan = containingSpan.parentElement;
                }

                if (containingSpan && containingSpan.classList.contains(POKEKING_TRANSLATED_CLASS)) {
                    // If a translated span is found, use its original and translated data attributes
                    originalChineseText = containingSpan.dataset[POKEKING_ORIGINAL_DATA_ATTR] || "";
                    currentTranslation = containingSpan.dataset[POKEKING_TRANSLATED_DATA_ATTR] || "";
                } else {
                    // No translated span found, use the selected text directly (it might be untranslated or a partial word)
                    originalChineseText = selection.toString().trim();
                    // If it's untranslated, the current translation is just the original text itself
                    currentTranslation = DICT[originalChineseText] || originalChineseText;
                }
            }

            // Fallback: If nothing was selected or identified, prompt the user
            if (!originalChineseText.trim()) {
                const promptedText = prompt("Please enter the Chinese text to report (or select it on the page):", "");
                if (promptedText === null) { // User clicked cancel
                    showTemporaryMessage("Error report cancelled.");
                    return;
                }
                originalChineseText = promptedText.trim();
                currentTranslation = DICT[originalChineseText] || originalChineseText; // Attempt to translate it if it's a known term
            }

            // Final check: if after all attempts, originalChineseText is still empty, cancel
            if (!originalChineseText.trim()) {
                showTemporaryMessage("No text provided for error report.");
                return;
            }

            showErrorReportForm(originalChineseText, currentTranslation);
            console.log("Pokeking Translator: Error Report button clicked. Original Text:", originalChineseText, "Current Translation:", currentTranslation);
        };
    }

    function initializeTranslationAndObserver() {
        console.log("Pokeking Translator: Initializing translation and observer setup.");

        // Initial translation after a short delay to allow DOM to settle
        setTimeout(() => {
            console.log("Pokeking Translator: Running initial keyword replacement (after 500ms delay).");
            replaceKeywords(getAllStaticTextElements());
        }, 500);

        const observer = new MutationObserver((mutations) => {
            // If showing original, do not translate new content
            if (isShowingOriginal) {
                return;
            }

            const nodesToTranslate = [];
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            // Ensure parent exists and is not within our alert, wrapper, or error form
                            if (!node.parentNode || node.parentNode.id === CUSTOM_ALERT_ID || node.parentNode.closest(`#${CUSTOM_ALERT_ID}`) ||
                                node.parentNode.id === POKEKING_ERROR_FORM_ID || node.parentNode.closest(`#${POKEKING_ERROR_FORM_ID}`) ||
                                node.parentNode.classList?.contains(POKEKING_WRAPPER_CLASS) ||
                                node.parentNode.id === POKEKING_BUTTONS_CONTAINER_ID || node.parentNode.closest(`#${POKEKING_BUTTONS_CONTAINER_ID}`)) continue; // Exclude new container
                            nodesToTranslate.push(node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            // Exclude our own elements and their children
                            if (node.classList?.contains(POKEKING_WRAPPER_CLASS) || node.classList?.contains(POKEKING_BUTTON_CLASS) ||
                                node.classList?.contains(POKEKING_ERROR_BUTTON_CLASS) || // Exclude new error button class
                                node.id === CUSTOM_ALERT_ID || node.closest(`#${CUSTOM_ALERT_ID}`) ||
                                node.id === POKEKING_ERROR_FORM_ID || node.closest(`#${POKEKING_ERROR_FORM_ID}`) ||
                                node.id === POKEKING_BUTTONS_CONTAINER_ID || node.closest(`#${POKEKING_BUTTONS_CONTAINER_ID}`)) { // Exclude new container
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
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: false, // We only care about text nodes and element changes
                attributes: false
            });
            console.log("Pokeking Translator: MutationObserver active on document.body.");
        } else {
            console.error("Pokeking Translator: document.body not found even after DOMContentLoaded!");
        }

        // Call the function that adds both buttons
        addExtensionButtons();

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
        // THIS SECTION WAS ADDED/MOVED TO ENSURE IT'S INCLUDED
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
