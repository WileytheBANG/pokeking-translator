async function initializePokekingTranslator() {
    console.log("Pokeking Translator: Content script running (Optimized Version)");

    // --- Constants ---
    const POKEKING_TRANSLATED_CLASS = "pokeking-translated";
    const POKEKING_WRAPPER_CLASS = "pokeking-translated-wrapper";
    const POKEKING_BUTTON_CLASS = "pokeking-toggle-button";
    const POKEKING_ORIGINAL_DATA_ATTR = "original";
    const POKEKING_TRANSLATED_DATA_ATTR = "translated";

    // Constants for custom alert
    const CUSTOM_ALERT_ID = "pokeking-custom-alert";
    const CUSTOM_ALERT_MESSAGE_CLASS = "pokeking-custom-alert-message";
    const CUSTOM_ALERT_BUTTON_CLASS = "pokeking-custom-alert-button";

    // Constants for error report form
    const POKEKING_ERROR_FORM_ID = "pokeking-error-report-form";
    const APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxz6Gx7VSwUWtLMN0qsgzhZujGaxCiXhNrhUXnwl5Waz-3-I5MD6C95V-MobdD6SHZiDQ/exec';

    // NEW CONSTANTS FOR BUTTONS CONTAINER AND ERROR BUTTON
    const POKEKING_BUTTONS_CONTAINER_ID = "pokeking-buttons-container";
    const POKEKING_ERROR_BUTTON_CLASS = "pokeking-error-button";
    // END NEW CONSTANTS

    let isShowingOriginal = false; // Track whether we're showing original or translated text
    let DICT = {}; // Initialize DICT here
    let keywordRegex = null; // Initialize regex here
    let kingCODE = null; // global variable in content script

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
    window.addEventListener('load', () => {  // Check sessionStorage for kingCODE
        kingCODE = sessionStorage.getItem('kingCODE');
        
        if (!kingCODE) {    // Not found, fetch from background
            browser.runtime.sendMessage({ action: "getKingCode" })
                .then(response => {
                    if (response.success && response.kingCODE) {
                        kingCODE = response.kingCODE;
                        // Save to sessionStorage
                        sessionStorage.setItem('kingCODE', kingCODE);
                        console.log("Received and saved kingCODE in sessionStorage:", kingCODE);
                        onKingCodeReady(kingCODE);
                    } else {
                        console.error("Failed to get kingCODE:", response.error);
                    }})
                .catch(err => {
                    console.error("Error sending message:", err);
                });
        } else {
            console.log("Loaded kingCODE from sessionStorage:", kingCODE);
            onKingCodeReady(kingCODE);
        }
    });
    
    // Optional: callback function to use kingCODE once it's ready
    function onKingCodeReady(code) {
        // You can put here any code that depends on kingCODE
        // For example:
        console.log("kingCODE is ready to use globally:", code);
    }

    DICT = await getDictionaryWithRetry();

    if (Object.keys(DICT).length === 0) {
        console.warn("Pokeking Translator: Dictionary is empty or failed to load. Translation will not occur.");
    } else {
        // Pre-compile regex for efficient keyword replacement ONLY if DICT is not empty
        keywordRegex = new RegExp(`(${Object.keys(DICT).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")})`, "g");
        console.log("Pokeking Translator: Keyword Regex compiled.");
    }

    // --- Helper Functions ---

    /**
     * Extracts all relevant text nodes from a given root element.
     * Filters out empty nodes and already processed/extension-specific nodes.
     * @param {HTMLElement} root - The root element to start the walk from.
     * @returns {Node[]} An array of text nodes.
     */
    function getAllStaticTextElements(root = document.body) {
        const nodes = [];
        // Ensure root is a valid element node
        if (root.nodeType !== Node.ELEMENT_NODE) {
            // If the root itself is a text node, and it's not trimmed or already handled, add it.
            if (root.nodeType === Node.TEXT_NODE && root.nodeValue.trim()) {
                const parent = root.parentElement;
                if (parent && !parent.classList.contains(POKEKING_WRAPPER_CLASS) &&
                    !parent.closest(`#${CUSTOM_ALERT_ID}, #${POKEKING_ERROR_FORM_ID}, #${POKEKING_BUTTONS_CONTAINER_ID}`)) {
                    nodes.push(root);
                }
            }
            // No further traversal if root is not an element
            return nodes;
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                const parent = node.parentElement;
                if (!parent) {
                    return NodeFilter.FILTER_REJECT; // Text node has no parent
                }

                // Check if the parent or any ancestor is one of OUR elements
                // This is crucial to avoid re-processing or infinite loops
                if (parent.classList.contains(POKEKING_WRAPPER_CLASS) ||
                    parent.closest(`#${CUSTOM_ALERT_ID}, #${POKEKING_ERROR_FORM_ID}, #${POKEKING_BUTTONS_CONTAINER_ID}`)) {
                    return NodeFilter.FILTER_REJECT;
                }

                // Additional checks for specific problematic elements if needed, based on site structure.
                // For example, if some text is inside <script> or <style> tags, which is unlikely for visible text.
                if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        });

        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
        return nodes;
    }

    /**
     * Replaces keywords in the provided text nodes using the pre-compiled regex.
     * Wraps translated text in spans with original and translated data attributes.
     * @param {Node[]} nodes - An array of text nodes to process.
     */
    function replaceKeywords(nodes) {
        if (!keywordRegex || Object.keys(DICT).length === 0) {
            return;
        }

        let translationsMade = 0;
        nodes.forEach(node => {
            // Check if this node is already part of a translated wrapper
            if (node.parentNode && node.parentNode.classList.contains(POKEKING_WRAPPER_CLASS)) {
                return; // Skip already translated nodes
            }

            const originalText = node.nodeValue;

            // Only process if the text contains potential keywords
            if (!keywordRegex.test(originalText)) {
                return;
            }

            // Reset lastIndex for global regex in case it was used before
            keywordRegex.lastIndex = 0;
            const translatedText = originalText.replace(keywordRegex, match => DICT[match] || match);

            if (translatedText === originalText) {
                return; // No translation occurred for this node
            }

            // Create the span for the translated text
            const span = document.createElement("span");
            span.className = POKEKING_TRANSLATED_CLASS;
            span.dataset[POKEKING_ORIGINAL_DATA_ATTR] = originalText;
            span.dataset[POKEKING_TRANSLATED_DATA_ATTR] = translatedText;
            span.textContent = translatedText; // Initially show translated text

            // Create the wrapper span
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

            okButton.onclick = () => {
                alertDiv.style.display = 'none';
            };
        }

        const messageElement = alertDiv.querySelector(`.${CUSTOM_ALERT_MESSAGE_CLASS}`);
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
        <div id="${POKEKING_ERROR_FORM_ID}">
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

                <input type="hidden" id="pokeking-pokeking-code">

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

        const breadcrumbItems = document.querySelectorAll('ol.breadcrumb > li');

        if (breadcrumbItems.length > 0) {
            const extractText = (item) => {
                const link = item.querySelector('a');
                // Prefer translated text if available, otherwise original
                const translatedSpan = item.querySelector(`.${POKEKING_TRANSLATED_CLASS}`);
                if (translatedSpan && translatedSpan.dataset[POKEKING_TRANSLATED_DATA_ATTR]) {
                     return translatedSpan.dataset[POKEKING_TRANSLATED_DATA_ATTR].trim();
                }
                return (link ? link.textContent : item.textContent).trim();
            };

            if (breadcrumbItems[1]) {
                region = extractText(breadcrumbItems[1]);
            }
            if (breadcrumbItems[2]) {
                eliteFourMember = extractText(breadcrumbItems[2]);
            }
            if (breadcrumbItems[3]) {
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
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = errorReportFormHTML;
            errorFormDiv = tempDiv.firstElementChild;
            document.body.appendChild(errorFormDiv);

            document.getElementById('pokeking-submit-error-btn').addEventListener('click', handleSubmitError);
            document.getElementById('pokeking-cancel-report-btn').addEventListener('click', () => {
                errorFormDiv.style.display = 'none';
            });
        }

        document.getElementById('pokeking-display-chinese-text').textContent = originalChineseText;
        document.getElementById('pokeking-display-current-translation').textContent = currentTranslation || 'N/A';

        document.getElementById('pokeking-contributor-ign').value = '';
        document.getElementById('pokeking-team-used').value = '';
        document.getElementById('pokeking-pokeking-code').value = kingCODE;
        document.getElementById('pokeking-user-suggested-correction').value = '';
        document.getElementById('pokeking-user-provided-chinese-text').value = '';

        const urlContext = parseUrlForContext();
        document.getElementById('pokeking-pokemon-region').value = urlContext.region;
        document.getElementById('pokeking-elite-four-member').value = urlContext.eliteFourMember;
        document.getElementById('pokeking-lead-pokemon').value = urlContext.leadPokemon;

        errorFormDiv.style.display = 'flex';
    }

    // --- Function to handle form submission ---
    async function handleSubmitError() {
        const chineseTextDisplayed = document.getElementById('pokeking-display-chinese-text').textContent;
        const userProvidedChineseText = document.getElementById('pokeking-user-provided-chinese-text').value.trim();
        const finalChineseText = userProvidedChineseText || chineseTextDisplayed;

        const formData = new FormData();
        formData.append('contributor', document.getElementById('pokeking-contributor-ign').value);
        formData.append('teamUsed', document.getElementById('pokeking-team-used').value);
        formData.append('pokekingCode', document.getElementById('pokeking-pokeking-code').value);

        formData.append('pokemonRegion', document.getElementById('pokeking-pokemon-region').value);
        formData.append('eliteFourMember', document.getElementById('pokeking-elite-four-member').value);
        formData.append('leadPokemon', document.getElementById('pokeking-lead-pokemon').value);

        formData.append('chineseText', finalChineseText);
        formData.append('currentTranslation', document.getElementById('pokeking-display-current-translation').textContent);
        formData.append('userSuggestedCorrection', document.getElementById('pokeking-user-suggested-correction').value);
        formData.append('pageUrl', window.location.href);

        try {
            const response = await fetch(APPS_SCRIPT_WEB_APP_URL, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                showCustomAlert('Translation error reported successfully! Thank you for your contribution.');
                document.getElementById(POKEKING_ERROR_FORM_ID).style.display = 'none';
            } else {
                showCustomAlert('Failed to report error: ' + (result.message || 'Unknown error.'));
                console.error('Error reporting translation:', result);
            }
        } catch (error) {
            showCustomAlert('An error occurred while sending the report. Please check your internet connection.');
            console.error('Network or fetch error:', error);
        }
    }

    // --- Function to Add Extension Buttons (Left Side) ---
    function addExtensionButtons() {
        let container = document.getElementById(POKEKING_BUTTONS_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = POKEKING_BUTTONS_CONTAINER_ID;
            document.body.appendChild(container);
        }

        let translationButton = document.getElementById('myTranslationToggleButton');
        if (!translationButton) { // Only create if it doesn't exist
            translationButton = document.createElement("button");
            translationButton.id = 'myTranslationToggleButton';
            translationButton.textContent = "CN";
            translationButton.className = POKEKING_BUTTON_CLASS;
            container.appendChild(translationButton);

            translationButton.onclick = () => {
                const errorFormDiv = document.getElementById(POKEKING_ERROR_FORM_ID);
                if (errorFormDiv && errorFormDiv.style.display !== 'none') {
                    errorFormDiv.style.display = 'none';
                    return;
                }
                isShowingOriginal = !isShowingOriginal;
                console.log(`Pokeking Translator: Toggle button clicked. isShowingOriginal: ${isShowingOriginal}`);

                toggleTranslationDisplay(); // This now ONLY swaps textContent

                if (isShowingOriginal) {
                    translationButton.textContent = "ENG";
                } else {
                    translationButton.textContent = "CN";
                }
            };
        }

        let errorReportButton = document.getElementById('myErrorReportButton');
        if (!errorReportButton) { // Only create if it doesn't exist
            errorReportButton = document.createElement("button");
            errorReportButton.id = 'myErrorReportButton';
            errorReportButton.textContent = 'Report Error';
            errorReportButton.className = POKEKING_ERROR_BUTTON_CLASS;
            container.appendChild(errorReportButton);

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
        }
    }

    // --- Injected script setup ---
    const s = document.createElement('script');
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    s.src = browserAPI.runtime.getURL('injected_script.js');
    s.onload = function() {
        this.remove();
        console.log("Pokeking Translator: Injected script loaded and removed.");
    };
    (document.head || document.documentElement).prepend(s);

    window.addEventListener('pokekingAlertIntercepted', (event) => {
        const message = event.detail.message;
        console.log("Pokeking Translator: Received alert from injected script:", message);
        showCustomAlert(message);
    });

    window.addEventListener('pokekingReportRequest', (event) => {
        const { originalText, currentTranslatedText, pageUrl } = event.detail;
        console.log("Pokeking Translator: Received report request via custom event:", originalText, currentTranslatedText, pageUrl);
        showErrorReportForm(originalText, currentTranslatedText);
    });

    // MutationObserver debouncing setup
    let nodesToTranslateOnMutation = [];
    let mutationObserverTimeout = null;
    const MUTATION_DEBOUNCE_DELAY = 50; // Reduced delay for faster updates

    const processMutations = () => {
        if (!isShowingOriginal && nodesToTranslateOnMutation.length > 0) {
            console.log(`Pokeking Translator: Debounced processing of ${nodesToTranslateOnMutation.length} new nodes.`);
            // Only process nodes that haven't been translated yet
            const unprocessedNodes = nodesToTranslateOnMutation.filter(node =>
                !node.parentNode || !node.parentNode.classList.contains(POKEKING_WRAPPER_CLASS)
            );
            if (unprocessedNodes.length > 0) {
                replaceKeywords(unprocessedNodes);
            }
        }
        nodesToTranslateOnMutation = []; // Clear array after processing
        mutationObserverTimeout = null;
    };

    // --- Initialize Translation and Observer ---
    function initializeTranslationAndObserver() {
        console.log("Pokeking Translator: Initializing translation and observer setup.");

        // Initial translation immediately after DOM is ready
        console.log("Pokeking Translator: Running initial keyword replacement on full document.");
        // Process the entire document initially
        replaceKeywords(getAllStaticTextElements());
        addExtensionButtons(); // Ensure extension buttons are present after initial load

        const observer = new MutationObserver((mutations) => {
            // If showing original, we don't process new content for translation
            if (isShowingOriginal) {
                return;
            }

            let newNodesDetected = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const addedNode of mutation.addedNodes) {
                        // Exclude script tags, style tags, and our own elements explicitly
                        if (addedNode.nodeType === Node.ELEMENT_NODE) {
                            if (addedNode.tagName === 'SCRIPT' || addedNode.tagName === 'STYLE') {
                                continue;
                            }
                            // Crucial: Check if the addedNode itself is part of our UI or a wrapper
                            if (addedNode.classList.contains(POKEKING_WRAPPER_CLASS) ||
                                addedNode.id === CUSTOM_ALERT_ID || addedNode.id === POKEKING_ERROR_FORM_ID ||
                                addedNode.id === POKEKING_BUTTONS_CONTAINER_ID ||
                                addedNode.closest(`#${CUSTOM_ALERT_ID}, #${POKEKING_ERROR_FORM_ID}, #${POKEKING_BUTTONS_CONTAINER_ID}`)) {
                                continue;
                            }
                        } else if (addedNode.nodeType === Node.TEXT_NODE) {
                            // If a text node is added, check if its parent is part of our UI
                            if (addedNode.parentNode && addedNode.parentNode.closest(`.${POKEKING_WRAPPER_CLASS}, #${CUSTOM_ALERT_ID}, #${POKEKING_ERROR_FORM_ID}, #${POKEKING_BUTTONS_CONTAINER_ID}`)) {
                                continue;
                            }
                        }

                        // Get text nodes from added node and its subtree
                        const textNodesInAddedTree = getAllStaticTextElements(addedNode);
                        if (textNodesInAddedTree.length > 0) {
                            nodesToTranslateOnMutation.push(...textNodesInAddedTree);
                            newNodesDetected = true;
                        }
                    }
                }
                // Also consider characterData mutations (text changes within existing elements)
                // This is less common for new text, but can happen for updates.
                if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
                    const textNode = mutation.target;
                    // Ensure the text node's parent is not part of our UI (e.g., inside our translated span)
                    if (!textNode.parentNode || textNode.parentNode.closest(`.${POKEKING_WRAPPER_CLASS}, #${CUSTOM_ALERT_ID}, #${POKEKING_ERROR_FORM_ID}, #${POKEKING_BUTTONS_CONTAINER_ID}`)) {
                        continue;
                    }
                    // Only add if it's not already within a translated span (which would be the `pokeking-translated` span itself)
                    if (textNode.nodeValue.trim() && !textNode.parentNode.classList.contains(POKEKING_TRANSLATED_CLASS)) {
                         nodesToTranslateOnMutation.push(textNode);
                         newNodesDetected = true;
                    }
                }
            }

            // Debounce the actual processing to avoid layout thrashing
            if (newNodesDetected) { // Use this flag to decide if we need to debounce
                if (mutationObserverTimeout) {
                    clearTimeout(mutationObserverTimeout);
                }
                mutationObserverTimeout = setTimeout(processMutations, MUTATION_DEBOUNCE_DELAY);
            }
        });

        // Ensure we observe document.body
        if (document.body) {
            observer.observe(document.body, {
                childList: true,   // Observe addition/removal of nodes
                subtree: true,     // Observe in the entire subtree
                characterData: true, // Observe changes to text content of nodes (important for dynamic updates)
                attributes: false  // Not needed for text translation
            });
            console.log("Pokeking Translator: MutationObserver active on document.body.");
        } else {
            console.error("Pokeking Translator: document.body not found even after DOMContentLoaded!");
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