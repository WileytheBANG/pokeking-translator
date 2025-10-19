// ==UserScript==
// @name         Pokeking Translator (Safari Version)
// @version      1.2
// @description  Dictionary-based translator with draggable buttons and injected CSS for improved visuals
// @author       cuteasduckk
// @match        *
// @grant        none
// ==/UserScript==

(async function() {
    console.log("Pokeking Translator: Content script running (Safari version)");

    // --- Constants ---
    const DICTIONARY_URL = "https://compscimmo.github.io/pokeking-translator/dictionary.json";
    const POKEKING_TRANSLATED_CLASS = "pokeking-translated";
    const POKEKING_WRAPPER_CLASS = "pokeking-translated-wrapper";
    const POKEKING_BUTTON_CLASS = "pokeking-toggle-button";
    const POKEKING_ORIGINAL_DATA_ATTR = "original";
    const POKEKING_TRANSLATED_DATA_ATTR = "translated";
    const POKEKING_BUTTONS_CONTAINER_ID = "pokeking-buttons-container";
    const CUSTOM_ALERT_ID = "pokeking-custom-alert";
    const CUSTOM_ALERT_MESSAGE_CLASS = "pokeking-custom-alert-message";
    const CUSTOM_ALERT_BUTTON_CLASS = "pokeking-custom-alert-button";

    let isShowingOriginal = false;
    let DICT = {};
    let keywordRegex = null;

    // --- Inject Styles ---
    function injectStyle() {
        const style = document.createElement("style");
        style.textContent = `
        .pet-dev {
            height: 134.5px;
            min-height: 100px;
            overflow: hidden;
            padding: 0;
        }

        .pet-dev > div > div[style*="top: -15px; right: 0px;"] {
            display: none !important;
        }

        .pet-dev h3 .pokeking-translated {
            color: #32CD32 !important;
            font-size: 0.8em !important;
            text-shadow:
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                -2px 0 0 #000,
                2px 0 0 #000,
                0 -2px 0 #000,
                0 2px 0 #000;
            position: relative;
            z-index: 10;
        }
        `;
        document.head.appendChild(style);
    }

    // --- Fetch Dictionary ---
    async function fetchDictionary() {
        try {
            const res = await fetch(DICTIONARY_URL);
            if (!res.ok) throw new Error(res.statusText);
            DICT = await res.json();
            if (Object.keys(DICT).length) {
                keywordRegex = new RegExp(
                    `(${Object.keys(DICT)
                        .sort((a, b) => b.length - a.length)
                        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                        .join("|")})`,
                    "g"
                );
                console.log("Pokeking Translator: Dictionary loaded.");
            }
        } catch (e) {
            console.error("Pokeking Translator: Failed to load dictionary:", e);
        }
    }

    // --- Helper: Get all text nodes ---
    function getTextNodes(root = document.body) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest(`#${CUSTOM_ALERT_ID}, #${POKEKING_BUTTONS_CONTAINER_ID}`) || parent.classList.contains(POKEKING_WRAPPER_CLASS)) return NodeFilter.FILTER_REJECT;
                if (['SCRIPT', 'STYLE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }

    // --- Replace keywords ---
    function translateNodes(nodes) {
        if (!keywordRegex) return;
        nodes.forEach(node => {
            if (node.parentNode.classList.contains(POKEKING_WRAPPER_CLASS)) return;
            const originalText = node.nodeValue;
            if (!keywordRegex.test(originalText)) return;
            const translatedText = originalText.replace(keywordRegex, m => DICT[m] || m);
            if (translatedText === originalText) return;

            const span = document.createElement("span");
            span.className = POKEKING_TRANSLATED_CLASS;
            span.dataset[POKEKING_ORIGINAL_DATA_ATTR] = originalText;
            span.dataset[POKEKING_TRANSLATED_DATA_ATTR] = translatedText;
            span.textContent = translatedText;

            const wrapper = document.createElement("span");
            wrapper.className = POKEKING_WRAPPER_CLASS;
            wrapper.appendChild(span);

            node.parentNode.replaceChild(wrapper, node);
        });
    }

    // --- Toggle display ---
    function toggleDisplay() {
        document.querySelectorAll(`.${POKEKING_TRANSLATED_CLASS}`).forEach(span => {
            span.textContent = isShowingOriginal
                ? span.dataset[POKEKING_ORIGINAL_DATA_ATTR]
                : span.dataset[POKEKING_TRANSLATED_DATA_ATTR];
        });
    }

    // --- Custom alert ---
    function showAlert(msg) {
        let alertDiv = document.getElementById(CUSTOM_ALERT_ID);
        if (!alertDiv) {
            alertDiv = document.createElement('div');
            alertDiv.id = CUSTOM_ALERT_ID;
            alertDiv.style = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:15px 20px;border-radius:8px;z-index:10000;display:flex;align-items:center;gap:10px;';
            const msgP = document.createElement('p');
            msgP.className = CUSTOM_ALERT_MESSAGE_CLASS;
            alertDiv.appendChild(msgP);
            const btn = document.createElement('button');
            btn.className = CUSTOM_ALERT_BUTTON_CLASS;
            btn.textContent = "OK";
            btn.onclick = () => alertDiv.style.display = 'none';
            alertDiv.appendChild(btn);
            document.body.appendChild(alertDiv);
        }
        alertDiv.querySelector(`.${CUSTOM_ALERT_MESSAGE_CLASS}`).textContent = msg;
        alertDiv.style.display = 'flex';
    }

    // --- Add buttons with draggable, persistent positions ---
    function addButtons() {
        let container = document.getElementById(POKEKING_BUTTONS_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = POKEKING_BUTTONS_CONTAINER_ID;
            container.style.position = 'fixed';
            container.style.top = '50%';
            container.style.left = '5px';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '5px';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        // --- Toggle Button ---
        let toggleBtn = document.getElementById('pokeking-toggle-btn');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'pokeking-toggle-btn';
            toggleBtn.textContent = "CN";
            toggleBtn.className = POKEKING_BUTTON_CLASS;
            toggleBtn.style.position = 'fixed';
            toggleBtn.style.top = localStorage.getItem(toggleBtn.id + '-top') || '10px';
            toggleBtn.style.left = localStorage.getItem(toggleBtn.id + '-left') || '10px';
            toggleBtn.style.zIndex = '10000';
            toggleBtn.onclick = () => {
                isShowingOriginal = !isShowingOriginal;
                toggleDisplay();
                toggleBtn.textContent = isShowingOriginal ? "ENG" : "CN";
            };
            document.body.appendChild(toggleBtn);
            makeButtonDraggable(toggleBtn);
        }

        // --- Alert Button ---
        const alertBtn = document.createElement('button');
        alertBtn.textContent = "Alert Test";
        alertBtn.id = 'pokeking-alert-btn';
        alertBtn.style.position = 'fixed';
        alertBtn.style.top = localStorage.getItem(alertBtn.id + '-top') || '100px';
        alertBtn.style.left = localStorage.getItem(alertBtn.id + '-left') || '10px';
        alertBtn.style.zIndex = '10000';
        alertBtn.onclick = () => showAlert("Pokeking Translator Active!");
        document.body.appendChild(alertBtn);
        makeButtonDraggable(alertBtn);
    }

    // --- Make button draggable (touch) ---
    function makeButtonDraggable(btn) {
        let offsetX = 0, offsetY = 0;
        btn.style.transition = 'left 0.3s ease, top 0.3s ease';

        btn.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            offsetX = touch.clientX - btn.getBoundingClientRect().left;
            offsetY = touch.clientY - btn.getBoundingClientRect().top;
            btn.style.transition = '';
        });

        btn.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            btn.style.left = (touch.clientX - offsetX) + 'px';
            btn.style.top = (touch.clientY - offsetY) + 'px';
        });

        btn.addEventListener('touchend', () => {
            const btnRect = btn.getBoundingClientRect();
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            btn.style.transition = 'left 0.3s ease, top 0.3s ease';

            // Snap horizontally
            btn.style.left = (btnRect.left + btnRect.width / 2 < screenWidth / 2)
                ? '10px'
                : (screenWidth - btnRect.width - 10) + 'px';

            // Constrain vertically
            if (btnRect.top < 10) btn.style.top = '10px';
            if (btnRect.bottom > screenHeight - 10) btn.style.top = (screenHeight - btnRect.height - 10) + 'px';

            // Save
            localStorage.setItem(btn.id + '-top', btn.style.top);
            localStorage.setItem(btn.id + '-left', btn.style.left);
        });
    }

    // --- MutationObserver ---
    const observer = new MutationObserver(muts => {
        if (isShowingOriginal) return;
        let nodes = [];
        muts.forEach(m => {
            m.addedNodes.forEach(n => nodes.push(...getTextNodes(n)));
        });
        if (nodes.length) translateNodes(nodes);
    });

    // --- Initialize ---
    async function init() {
        injectStyle(); // 🔹 Inject the CSS styling
        await fetchDictionary();
        translateNodes(getTextNodes());
        addButtons();
        observer.observe(document.body, { childList: true, subtree: true });
        console.log("Pokeking Translator: Initialized (Safari-ready, with CSS).");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
