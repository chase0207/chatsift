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
  var COLLECT_DEBOUNCE_MS = 10000

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

  function _readAccountNickname() {
    // 登录客服(agent)账号名:抖音私信顶部账号区 [class*="imUserName"]
    // (W13 按客服昵称分组用;adapter 已把 outbound sender_nickname 取自 accountNickname)
    return Dom.getText(Dom.queryFirst([
      '[class*="imUserName"]',
    ])) || ''
  }

  function _buildSessionInfo(adapter) {
    var nickname = _readNickname(adapter)
    var pageKey = adapter && adapter.pageKey ? adapter.pageKey : 'douyin'
    if (!nickname || nickname === 'unknown') return null
    var seed = [pageKey, nickname].join('|')
    return {
      conversationId: 'douyin_' + pageKey.replace(/[^a-z0-9]+/ig, '_') + '_' + Dom.simpleHash(seed),
      nickname: nickname,
      accountNickname: _readAccountNickname(),
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
    var baseInfo = _buildSessionInfo(adapter)
    if (!baseInfo) {
      Logger.warn && Logger.warn('LegacyCollector', 'skip collect: nickname missing')
      return { ok: false, reason: 'nickname-missing' }
    }
    var info = Object.assign(baseInfo, sessionInfo || {})
    var rawMessages = await adapter.getMessages(info)
    var events = (rawMessages || [])
      .map(function (m) { return adapter.toConversationEvent(m, info) })
      .filter(function (event) { return event && event.content_text })
    // 用稳定的"会话+方向+内容+出现序号"重算 message_id,替代依赖 occurred_at 的旧键。
    // occurred_at 跨采集轮不稳定(尤其 outbound 无精确时间)会导致同消息每轮换 id 重复入库。
    var _seqMap = {}
    events.forEach(function (event) {
      var k = (event.conversation_id || '') + '|' + (event.direction || '') + '|' + event.content_text
      var seq = _seqMap[k] || 0
      _seqMap[k] = seq + 1
      event.message_id = Dom.synthMessageId({
        conversationId: event.conversation_id,
        direction: event.direction,
        text: event.content_text,
        seq: seq,
      })
    })
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
    }, COLLECT_DEBOUNCE_MS)
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
