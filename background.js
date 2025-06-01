importScripts('browser-polyfill.min.js'); 
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
        await browser.storage.local.set({ [DICTIONARY_STORAGE_KEY]: dictionary });
        console.log("Background: Dictionary updated from remote source and stored in local storage.");

        // Optionally, store the last updated timestamp
        await browser.storage.local.set({ lastDictionaryUpdate: Date.now() });

    } catch (error) {
        console.error("Background: Failed to fetch or update dictionary:", error);
    }
}

async function getDictionary() {
    console.log("Background: Retrieving dictionary from storage...");
    const result = await browser.storage.local.get(DICTIONARY_STORAGE_KEY);
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
    browser.contextMenus.create({
        id: "pokekingReportError", // Unique ID for our menu item
        title: "Pokeking Translator: Report Error/Mistranslation", // Text displayed in the menu
        contexts: ["selection", "page"], // Show when text is selected or on the page generally
        // Add a document URL pattern if you only want it on specific sites
        // documentUrlPatterns: ["*://*.example.com/*"]
    });
    console.log("Background: Context menu item 'pokekingReportError' created.");
}



// --- Event Listeners for the Background Script ---

// Run on extension installation/update
browser.runtime.onInstalled.addListener(() => {
    console.log("Background: Extension installed or updated. Fetching dictionary now.");
    fetchAndUpdateDictionary();
    createContextMenuItem(); // Create the context menu item on install
});

// Periodically run the update function using browser.alarms
browser.alarms.create('updateDictionary', { periodInMinutes: UPDATE_INTERVAL_MINUTES });

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'updateDictionary') {
        console.log("Background: Alarm triggered. Fetching dictionary.");
        fetchAndUpdateDictionary();
    }
});

// Listen for messages from content scripts to provide the dictionary
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
browser.contextMenus.onClicked.addListener((info, tab) => { // Using browser.contextMenus
    if (info.menuItemId === "pokekingReportError") {
        console.log("Background: Context menu 'Report Error' clicked. Executing script.");
        // Execute the script file in the content script's isolated world
        browser.scripting.executeScript({ // Using browser.scripting
            target: { tabId: tab.id },
            files: ["get_selection_and_dispatch.js"] // <--- CORRECTED: Specify the file to inject
        });
    }
});
