// content.js - Pokeking Translator (API Version with sessionStorage cache)

async function initializePokekingTranslator() {
    console.log("Pokeking Translator: Content script running (API Version)");

    const SHEET_API_URL = "https://sheet2api.com/v1/W2ACjwbRUC7c/pokeking-translations/dictionary";
    let DICT = {};
    let keywordRegex = null;

    const cachedDict = sessionStorage.getItem("pokekingDict");
    const cachedRegexSource = sessionStorage.getItem("pokekingRegex");

    if (cachedDict && cachedRegexSource) {
        DICT = JSON.parse(cachedDict);
        keywordRegex = new RegExp(cachedRegexSource, "g");
        console.log("Pokeking Translator: Loaded dictionary and regex from sessionStorage");
    } else {
        try {
            const response = await fetch(SHEET_API_URL);
            const data = await response.json();

            // Parse dictionary
            DICT = data.reduce((acc, row) => {
                if (typeof row.Chinese === "string" && typeof row.English === "string") {
                    acc[row.Chinese.trim()] = row.English;
                }
                return acc;
            }, {});

            // Save to sessionStorage
            sessionStorage.setItem("pokekingDict", JSON.stringify(DICT));

            // Generate and cache regex
            const escapedKeys = Object.keys(DICT)
                .sort((a, b) => b.length - a.length)
                .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

            const regexSource = `(${escapedKeys.join("|")})`;
            keywordRegex = new RegExp(regexSource, "g");
            sessionStorage.setItem("pokekingRegex", regexSource);

            console.log("Pokeking Translator: Fetched and cached dictionary and regex from API");
        } catch (error) {
            console.error("Pokeking Translator: Failed to fetch dictionary from API", error);
        }
    }

    if (!keywordRegex || Object.keys(DICT).length === 0) {
        console.warn("Pokeking Translator: Missing dictionary or regex. Aborting translation.");
        return;
    }



    const POKEKING_TRANSLATED_CLASS = "pokeking-translated";
    const POKEKING_WRAPPER_CLASS = "pokeking-translated-wrapper";
    const POKEKING_BUTTON_CLASS = "pokeking-toggle-button";
    const POKEKING_ORIGINAL_DATA_ATTR = "original";
    const POKEKING_TRANSLATED_DATA_ATTR = "translated";
    const CUSTOM_ALERT_ID = "pokeking-custom-alert";
    const CUSTOM_ALERT_MESSAGE_CLASS = "pokeking-custom-alert-message";
    const CUSTOM_ALERT_BUTTON_CLASS = "pokeking-custom-alert-button";

    let isShowingOriginal = false;


    // --- Helper Functions ---

    function getAllStaticTextElements(root = document.body) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const style = window.getComputedStyle(parent);
                if (style.visibility === "hidden" || style.display === "none") return NodeFilter.FILTER_REJECT;
                if (
                    parent.classList?.contains(POKEKING_WRAPPER_CLASS) ||
                    parent.id === CUSTOM_ALERT_ID ||
                    parent.closest(`#${CUSTOM_ALERT_ID}`)
                ) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }

        console.log(`Pokeking Translator: Found ${nodes.length} static text elements.`);
        return nodes;
    }

    function replaceKeywords(nodes) {
        if (!keywordRegex) {
            console.warn("Pokeking Translator: No keyword regex available, skipping keyword replacement.");
            return;
        }

        let translationsMade = 0;
        nodes.forEach(node => {
            const originalText = node.nodeValue;
            if (!keywordRegex.test(originalText)) return;

            const translatedText = originalText.replace(keywordRegex, match => DICT[match] || match);
            if (translatedText === originalText) return;

            const span = document.createElement("span");
            span.className = POKEKING_TRANSLATED_CLASS;
            span.setAttribute(`data-${POKEKING_ORIGINAL_DATA_ATTR}`, originalText);
            span.setAttribute(`data-${POKEKING_TRANSLATED_DATA_ATTR}`, translatedText);
            span.textContent = isShowingOriginal ? originalText : translatedText;

            const wrapper = document.createElement("span");
            wrapper.className = POKEKING_WRAPPER_CLASS;
            wrapper.appendChild(span);

            node.parentNode.replaceChild(wrapper, node);
            translationsMade++;
        });

        if (translationsMade > 0) {
            console.log(`Pokeking Translator: ${translationsMade} text nodes translated.`);
        }
    }

    function toggleTranslationDisplay() {
        const translatedSpans = document.querySelectorAll(`.${POKEKING_TRANSLATED_CLASS}`);
        translatedSpans.forEach(span => {
            const original = span.getAttribute(`data-${POKEKING_ORIGINAL_DATA_ATTR}`);
            const translated = span.getAttribute(`data-${POKEKING_TRANSLATED_DATA_ATTR}`);
            span.textContent = isShowingOriginal ? original : translated;
        });
    }

    function showCustomAlert(message) {
        if (document.getElementById(CUSTOM_ALERT_ID)) return;

        const alertBox = document.createElement("div");
        alertBox.id = CUSTOM_ALERT_ID;

        const messageDiv = document.createElement("div");
        messageDiv.className = CUSTOM_ALERT_MESSAGE_CLASS;
        messageDiv.textContent = message;

        const button = document.createElement("button");
        button.className = CUSTOM_ALERT_BUTTON_CLASS;
        button.textContent = "OK";
        button.onclick = () => alertBox.remove();

        alertBox.appendChild(messageDiv);
        alertBox.appendChild(button);
        document.body.appendChild(alertBox);
    }

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
            if (isShowingOriginal) {
                toggleTranslationDisplay();
                btn.textContent = "Show Translated";
            } else {
                replaceKeywords(getAllStaticTextElements());
                toggleTranslationDisplay();
                btn.textContent = "Show Original";
            }
        };

        document.body.appendChild(btn);
    }

    function initializeTranslationAndObserver() {
        console.log("Pokeking Translator: Initializing translation and observer");

        setTimeout(() => {
            replaceKeywords(getAllStaticTextElements());
        }, 500);

        const observer = new MutationObserver((mutations) => {
            if (isShowingOriginal) return;
            const nodesToTranslate = [];

            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (!node.parentNode || node.parentNode.id === CUSTOM_ALERT_ID || node.parentNode.closest(`#${CUSTOM_ALERT_ID}`)) continue;
                            nodesToTranslate.push(node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            if (
                                node.classList?.contains(POKEKING_WRAPPER_CLASS) ||
                                node.classList?.contains(POKEKING_BUTTON_CLASS) ||
                                node.id === CUSTOM_ALERT_ID ||
                                node.closest(`#${CUSTOM_ALERT_ID}`)
                            ) continue;
                            nodesToTranslate.push(...getAllStaticTextElements(node));
                        }
                    }
                }
            }

            if (nodesToTranslate.length > 0) {
                replaceKeywords(nodesToTranslate);
            }
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
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

    // --- Inject alert override script ---
    const s = document.createElement('script');
    s.src = browser.runtime.getURL('injected_script.js');
    s.onload = function () {
        this.remove();
        console.log("Pokeking Translator: Injected script loaded and removed.");
    };
    (document.head || document.documentElement).prepend(s);

    window.addEventListener('pokekingAlertIntercepted', (event) => {
        const message = event.detail.message;
        showCustomAlert(message);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTranslationAndObserver);
    } else {
        initializeTranslationAndObserver();
    }
}

// Start it all
initializePokekingTranslator();
