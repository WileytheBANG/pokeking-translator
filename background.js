const DICTIONARY_URL = "https://compscimmo.github.io/pokeking-translator/dictionary.json"; // Your GitHub Pages URL
const DICTIONARY_STORAGE_KEY = "myDictionary";
const UPDATE_INTERVAL_MINUTES = 60; // Update every hour

async function fetchAndUpdateDictionary() {
    console.log("Background: Attempting to fetch and update dictionary...");
    try {
        const response = await fetch(DICTIONARY_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const dictionary = await response.json();

        // Store the dictionary in local storage
        await chrome.storage.local.set({ [DICTIONARY_STORAGE_KEY]: dictionary });
        console.log("Background: Dictionary updated from remote source and stored in local storage.");

        // Optionally, store the last updated timestamp
        await chrome.storage.local.set({ lastDictionaryUpdate: Date.now() });

    } catch (error) {
        console.error("Background: Failed to fetch or update dictionary:", error);
    }
}

async function getDictionary() {
    console.log("Background: Retrieving dictionary from storage...");
    const result = await chrome.storage.local.get(DICTIONARY_STORAGE_KEY);
    const dictionary = result[DICTIONARY_STORAGE_KEY] || {};
    if (Object.keys(dictionary).length === 0) {
        console.warn("Background: Dictionary not found in local storage or is empty. This might be normal on first run, fetching now.");
        // Attempt to fetch if not found, but don't block `getDictionary`'s return
        fetchAndUpdateDictionary();
    }
    return dictionary; // Return an empty object if not found
}

// --- New Context Menu Logic ---

// Function to create the context menu item
function createContextMenuItem() {
    chrome.contextMenus.create({
        id: "pokekingReportError", // Unique ID for our menu item
        title: "Pokeking Translator: Report Error/Mistranslation", // Text displayed in the menu
        contexts: ["selection", "page"], // Show when text is selected or on the page generally
        // Add a document URL pattern if you only want it on specific sites
        // documentUrlPatterns: ["*://*.example.com/*"]
    });
    console.log("Background: Context menu item 'pokekingReportError' created.");
}

// Function to be injected into the content script's world to get context for reporting
// Note: This function runs in the isolated world of the content script, not the background script.
function getSelectionAndDispatchReportEvent() {
    let originalChineseText = "";
    let currentTranslation = "";
    const selection = window.getSelection();

    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // Get the text the user selected
        const selectedText = selection.toString().trim();

        // Try to find if the selected text is part of one of our translated spans
        const commonAncestor = range.commonAncestorContainer;
        const closestWrapper = commonAncestor.nodeType === Node.ELEMENT_NODE ?
                                commonAncestor.closest('.pokeking-translated-wrapper') :
                                commonAncestor.parentElement ? commonAncestor.parentElement.closest('.pokeking-translated-wrapper') : null;

        if (closestWrapper) {
            const translatedSpan = closestWrapper.querySelector('.pokeking-translated');
            if (translatedSpan) {
                // If it's part of our translation, get the original and translated data
                originalChineseText = translatedSpan.dataset.original || selectedText;
                currentTranslation = translatedSpan.textContent || selectedText;
            } else {
                // If it's in a wrapper but not the span, something is off, use selected
                originalChineseText = selectedText;
                currentTranslation = "Could not identify specific translation for selection.";
            }
        } else {
            // If selection is not within our translated wrapper, it's likely untranslated text
            originalChineseText = selectedText;
            currentTranslation = "No translation applied to this selected text.";
        }
    } else {
        // If no text is selected, user clicked on the page. Ask them to provide text.
        originalChineseText = "Please manually provide the Chinese text.";
        currentTranslation = "N/A - No text selected.";
    }

    // Dispatch the custom event to the main content.js script's scope
    // Your content.js script needs to listen for 'pokekingReportRequest'
    window.dispatchEvent(new CustomEvent('pokekingReportRequest', {
        detail: {
            originalText: originalChineseText,
            currentTranslatedText: currentTranslation,
            pageUrl: window.location.href // Current URL
        }
    }));
    console.log("Injected script: Dispatched 'pokekingReportRequest' event.");
}


// --- Event Listeners for the Background Script ---

// Run on extension installation/update
chrome.runtime.onInstalled.addListener(() => {
    console.log("Background: Extension installed or updated. Fetching dictionary now.");
    fetchAndUpdateDictionary();
    createContextMenuItem(); // Create the context menu item on install
});

// Periodically run the update function using chrome.alarms
chrome.alarms.create('updateDictionary', { periodInMinutes: UPDATE_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'updateDictionary') {
        console.log("Background: Alarm triggered. Fetching dictionary.");
        fetchAndUpdateDictionary();
    }
});

// Listen for messages from content scripts to provide the dictionary
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getDictionary") {
        console.log("Background: Received 'getDictionary' request from content script. Sending dictionary.");
        // We use getDictionary() here which also handles potential initial fetch if storage is empty
        getDictionary().then(dict => {
            sendResponse({ dictionary: dict });
        });
        return true; // Indicates async response
    }
});

// Listen for clicks on the context menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pokekingReportError") {
        console.log("Background: Context menu 'Report Error' clicked. Executing script.");
        // Execute the function in the content script's isolated world
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getSelectionAndDispatchReportEvent // Function to inject and run
        });
    }
});