;(function () {
  'use strict'

  var DEFAULT_PAGE_URLS = [
    'https://life.douyin.com/cs/web/clue_private_message/chat/session',
    'https://im.douyin.com',
    'https://im.jinritemai.com',
  ]

  var _ready = false
  var _allowed = false
  var _matched = null

  function normalize(value) {
    return String(value || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
  }

  function pageUrlsFromDefinitions(definitions) {
    var urls = []
    ;(Array.isArray(definitions) ? definitions : []).forEach(function (platform) {
      var pages = Array.isArray(platform && platform.pages) ? platform.pages : []
      pages.forEach(function (page) {
        if (page && page.url) urls.push(page.url)
      })
      if (!pages.length && platform && platform.url) urls.push(platform.url)
    })
    return urls.map(normalize).filter(Boolean)
  }

  function matchUrl(url, definitions) {
    var normalizedUrl = normalize(url)
    var urls = pageUrlsFromDefinitions(definitions)
    if (!urls.length) urls = DEFAULT_PAGE_URLS.map(normalize)
    urls = urls.sort(function (a, b) { return b.length - a.length })
    for (var i = 0; i < urls.length; i++) {
      if (urls[i] && normalizedUrl.indexOf(urls[i]) !== -1) return urls[i]
    }
    return null
  }

  function evaluate(definitions) {
    _matched = matchUrl(location.href, definitions)
    _allowed = !!_matched
    _ready = true
    if (!_allowed) {
      console.info('[Chatsift] 当前页面不是已配置采集页面，采集 runtime 已阻断')
    }
  }

  function load() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      evaluate([])
      return
    }
    chrome.storage.local.get(['platformDefinitions'], function (data) {
      if (chrome.runtime && chrome.runtime.lastError) {
        evaluate([])
        return
      }
      evaluate((data && data.platformDefinitions) || [])
    })
    if (chrome.storage.onChanged && !window.__chatsiftContentGateStorageBound) {
      window.__chatsiftContentGateStorageBound = true
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local' || !changes.platformDefinitions) return
        evaluate(changes.platformDefinitions.newValue || [])
      })
    }
  }

  window.ChatsiftContentGate = {
    isReady: function () { return _ready },
    isAllowed: function () { return _allowed },
    matched: function () { return _matched },
  }

  load()
})()
