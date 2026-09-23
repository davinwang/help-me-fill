async function configure() {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}
// Explicit action handling grants activeTab consistently; automatic panel opening
// did not grant it in the Chrome/Edge production-artifact tests.
chrome.action.onClicked.addListener(tab => {
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
    void chrome.action.setBadgeText({ text: '!' });
  });
});
chrome.runtime.onInstalled.addListener(() => { void configure(); });
chrome.runtime.onStartup.addListener(() => { void configure(); });
void configure();

// Short-lived authorization only; parsing and provider calls live in the panel.
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'CHECK_ACTIVE') return false;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !sender.documentId) { respond(false); return false; }
  const expectedUrl = 'expectedUrl' in message ? message.expectedUrl : undefined;
  if (typeof expectedUrl !== 'string' || sender.url !== expectedUrl) { respond(false); return false; }
  const tabId = sender.tab.id, windowId = sender.tab.windowId;
  void chrome.tabs.query({ active: true, windowId }).then(tabs => {
    respond(tabs[0]?.id === tabId && tabs[0]?.url === expectedUrl);
  }, () => respond(false));
  return true;
});
