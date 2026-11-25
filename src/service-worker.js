// Runs in the background, separate from any page or panel.
// One job for now: clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("sidePanel setup failed:", err));
