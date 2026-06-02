chrome.runtime.onInstalled.addListener(function () {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {})
  }
})

chrome.runtime.onStartup.addListener(function () {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {})
  }
})

chrome.action.onClicked.addListener(function (tab) {
  if (!chrome.sidePanel || !chrome.sidePanel.open) return
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(function () {})
})
