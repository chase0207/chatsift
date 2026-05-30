;(function () {
  'use strict'

  var Flags = window.RpaFeatureFlags
  var Registry = window.RpaAdapterRegistry
  var Collector = window.RpaEventCollector
  var Uploader = window.RpaEventUploader
  var Dom = window.RpaDomUtils
  var Logger = window.RpaLogger || console
  if (!Flags || !Registry || !Collector || !Uploader || !Dom) {
    throw new Error('[W4] legacy collector dependencies missing')
  }

  var _observer = null
  var _timer = null
  var _collecting = false
  var _debounce = null

  function _param(name) {
    try { return new URL(location.href).searchParams.get(name) || '' } catch (_) { return '' }
  }

  function _readNickname(adapter) {
    var ctx = adapter && adapter.buildRuntimeContext ? adapter.buildRuntimeContext() : {}
    return ctx.sessionTitle ||
      Dom.getText(Dom.queryFirst([
        'div[class*="msgTitle"] span[class*="name"]',
        'div[class*="userInfo"] [class*="name"]',
        'div[class*="conversationName"]',
        '[class*="sessionTitle"]',
      ])) ||
      'unknown'
  }

  function _buildSessionInfo(adapter) {
    var nickname = _readNickname(adapter)
    var avatar = (Dom.queryFirst(['div[class*="userInfo"] img', 'div[class*="msgTitle"] img']) || {}).src || ''
    var pageKey = adapter && adapter.pageKey ? adapter.pageKey : 'douyin'
    var seed = [pageKey, nickname, avatar, _param('conGroupId'), _param('lifeAccountId'), _param('accountId')].join('|')
    return {
      conversationId: 'douyin_' + pageKey.replace(/[^a-z0-9]+/ig, '_') + '_' + Dom.simpleHash(seed),
      nickname: nickname,
      avatar: avatar || null,
      pageKey: pageKey,
    }
  }

  async function collectMessageSession(sessionInfo) {
    var adapter = Registry.resolve(location)
    if (!adapter) {
      Logger.warn && Logger.warn('LegacyCollector', 'no adapter matched current page')
      return { ok: false, reason: 'adapter-missing' }
    }
    if (typeof adapter.getMessages !== 'function' || typeof adapter.toConversationEvent !== 'function') {
      Logger.warn && Logger.warn('LegacyCollector', 'adapter missing collector methods', adapter.adapterKey)
      return { ok: false, reason: 'adapter-method-missing' }
    }
    var info = Object.assign(_buildSessionInfo(adapter), sessionInfo || {})
    var rawMessages = await adapter.getMessages(info)
    var events = (rawMessages || [])
      .map(function (m) { return adapter.toConversationEvent(m, info) })
      .filter(function (event) { return event && event.content_text })
    var result = await Collector.collect(events)
    Logger.info && Logger.info('LegacyCollector', 'collectMessageSession', {
      adapter: adapter.adapterKey,
      messages: rawMessages.length,
      collected: result.collected,
      skipped: result.skipped,
    })
    return { ok: true, adapter: adapter.adapterKey, collected: result.collected, skipped: result.skipped }
  }

  function _scheduleCollect() {
    if (_collecting) return
    clearTimeout(_debounce)
    _debounce = setTimeout(async function () {
      if (!Flags.get('collector_v1_enabled') || _collecting) return
      _collecting = true
      try { await collectMessageSession() } catch (err) {
        Logger.warn && Logger.warn('LegacyCollector', 'collect failed', err && err.message)
      } finally {
        _collecting = false
      }
    }, 800)
  }

  async function start() {
    if (_observer) return true
    await Uploader.start()
    _observer = new MutationObserver(function () { _scheduleCollect() })
    _observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true })
    _scheduleCollect()
    Logger.info && Logger.info('LegacyCollector', 'started')
    return true
  }

  function stop() {
    clearTimeout(_debounce)
    if (_observer) _observer.disconnect()
    _observer = null
    Uploader.stop()
    Logger.info && Logger.info('LegacyCollector', 'stopped')
  }

  function _syncFlag() {
    if (Flags.get('collector_v1_enabled')) start()
    else if (_observer) stop()
  }

  function boot() {
    if (_timer) return
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (!message || !message.action) return
        if (message.action === 'START_COLLECTOR') {
          start().then(function () { sendResponse({ ok: true }) })
          return true
        }
        if (message.action === 'STOP_COLLECTOR') {
          stop()
          sendResponse({ ok: true })
          return true
        }
      })
    }
    setTimeout(_syncFlag, 500)
    _timer = setInterval(_syncFlag, 1000)
  }

  window.RpaLegacyCollector = {
    boot: boot,
    start: start,
    stop: stop,
    collectMessageSession: collectMessageSession,
  }

  boot()
})()
