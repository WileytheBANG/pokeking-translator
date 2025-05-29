// content.js - Pokeking Translator (Final Version with Injected Script)

// This content script runs in an isolated world, handling UI for translation
// and communicating with an injected script that overrides native functions.

// Define your main async function
async function initializePokekingTranslator() {
    console.log("Pokeking Translator: Content script running (Final Version)");

    // --- Constants ---
    // Ensure browser object is available before attempting to use it
    const DICT = await fetch(browser.runtime.getURL("dictionary.json"))
        .then(res => res.json())
        .catch(error => {
            console.error("Pokeking Translator: Failed to load dictionary.json", error);
            return {}; // Return empty object to prevent script from crashing
        });
    console.log("Pokeking Translator: Loaded dictionary:", DICT);

    if (Object.keys(DICT).length === 0) {
        console.warn("Pokeking Translator: Dictionary is empty or failed to load. Translation will not occur.");
    }

    const POKEKING_TRANSLATED_CLASS = "pokeking-translated";
    const POKEKING_WRAPPER_CLASS = "pokeking-translated-wrapper";
    const POKEKING_BUTTON_CLASS = "pokeking-toggle-button";
    const POKEKING_ORIGINAL_DATA_ATTR = "original";
    const POKEKING_TRANSLATED_DATA_ATTR = "translated";

    // New constants for custom alert
    const CUSTOM_ALERT_ID = "pokeking-custom-alert";
    const CUSTOM_ALERT_MESSAGE_CLASS = "pokeking-custom-alert-message";
    const CUSTOM_ALERT_BUTTON_CLASS = "pokeking-custom-alert-button";

    let isShowingOriginal = false; // Track whether we're showing original or translated text

    // Pre-compile regex for efficient keyword replacement
    const escapedKeys = Object.keys(DICT)
        .sort((a, b) => b.length - a.length) // Sort by length descending for greedy matching
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const keywordRegex = escapedKeys.length > 0 ? new RegExp(`(${escapedKeys.join("|")})`, "g") : null;
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
                if (parent.classList?.contains(POKEKING_WRAPPER_CLASS) || parent.id === CUSTOM_ALERT_ID || parent.closest(`#${CUSTOM_ALERT_ID}`)) {
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
        if (!keywordRegex) {
            console.warn("Pokeking Translator: No keyword regex available, skipping keyword replacement.");
            return;
        }

        let translationsMade = 0;
        nodes.forEach(node => {
            const originalText = node.nodeValue;

            if (!keywordRegex.test(originalText)) {
                return;
            }

            const translatedText = originalText.replace(keywordRegex, match => DICT[match] || match);

            if (translatedText === originalText) {
                return;
            }

            const span = document.createElement("span");
            span.className = POKEKING_TRANSLATED_CLASS;
            span.dataset[POKEKING_ORIGINAL_DATA_ATTR] = originalText;
            span.dataset[POKEKING_TRANSLATED_DATA_ATTR] = translatedText;
            span.textContent = translatedText;

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
        const translatedMessage = DICT[originalMessage.trim()] || originalMessage;
        messageElement.textContent = translatedMessage;

        alertDiv.style.display = 'flex';
    }


    // --- Core Logic: Inject the script that performs the actual alert override into the page's context ---
    const s = document.createElement('script');
    s.src = browser.runtime.getURL('injected_script.js');
    s.onload = function() {
        this.remove();
        console.log("Pokeking Translator: Injected script loaded and removed.");
    };
    (document.head || document.documentElement).prepend(s);


    // --- Listen for Custom Events from the Injected Script ---
    window.addEventListener('pokekingAlertIntercepted', (event) => {
        const message = event.detail.message;
        console.log("Pokeking Translator: Received alert from injected script:", message);
        showCustomAlert(message);
    });

    // --- Main Logic (for static content, unchanged from previous version) ---

    function addToggleButton() {
        const btn = document.createElement("button");
        btn.textContent = "Show Original";
        btn.className = POKEKING_BUTTON_CLASS;

        if (!document.getElementById('pokeking-button-styles')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'pokeking-button-styles';
            styleTag.textContent = `
                .${POKEKING_BUTTON_CLASS} {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    z-index: 9999;
                    padding: 10px 15px;
                    background: #111;
                    color: #fff;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    transition: background 0.2s ease, transform 0.1s ease;
                }
                .${POKEKING_BUTTON_CLASS}:hover {
                    background: #333;
                }
                .${POKEKING_BUTTON_CLASS}:active {
                    transform: translateY(1px);
                }
            `;
            document.head.appendChild(styleTag);
        }

        btn.onclick = () => {
            isShowingOriginal = !isShowingOriginal;
            console.log(`Pokeking Translator: Toggle button clicked. isShowingOriginal: ${isShowingOriginal}`);

            if (isShowingOriginal) {
                toggleTranslationDisplay();
                btn.textContent = "Show Translated";
            } else {
                console.log("Pokeking Translator: Switching back to translated. Re-running replaceKeywords for full page.");
                replaceKeywords(getAllStaticTextElements());
                toggleTranslationDisplay();
                btn.textContent = "Show Original";
            }
        };

        document.body.appendChild(btn);
    }

    function initializeTranslationAndObserver() {
        console.log("Pokeking Translator: Initializing translation and observer setup.");

        setTimeout(() => {
            console.log("Pokeking Translator: Running initial keyword replacement (after 500ms delay).");
            replaceKeywords(getAllStaticTextElements());
        }, 500);

        const observer = new MutationObserver((mutations) => {
            if (isShowingOriginal) {
                return;
            }

            const nodesToTranslate = [];
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (!node.parentNode || node.parentNode.id === CUSTOM_ALERT_ID || node.parentNode.closest(`#${CUSTOM_ALERT_ID}`)) continue;
                            nodesToTranslate.push(node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList?.contains(POKEKING_WRAPPER_CLASS) || node.classList?.contains(POKEKING_BUTTON_CLASS) || node.id === CUSTOM_ALERT_ID || node.closest(`#${CUSTOM_ALERT_ID}`)) {
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
                characterData: false,
                attributes: false
            });
            console.log("Pokeking Translator: MutationObserver active on document.body.");
        } else {
            console.error("Pokeking Translator: document.body not found even after DOMContentLoaded!");
        }

        addToggleButton();

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