const statePerTab = {};

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;

  // Toggle the state for this tab
  statePerTab[tabId] = !statePerTab[tabId];

  // Send message to content script
  chrome.tabs.sendMessage(tabId, { type: "TOGGLE_TRANSLATION" });

  // Change icon
  const icon = statePerTab[tabId] ? "icons/on.png" : "icons/off.png";
  chrome.action.setIcon({ tabId, path: icon });
});

// Optional: reset icon when tab is closed or reloaded
chrome.tabs.onRemoved.addListener((tabId) => {
  delete statePerTab[tabId];
});
