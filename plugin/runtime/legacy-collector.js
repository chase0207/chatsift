;(function () {
  'use strict'

  var Flags = window.RpaFeatureFlags
  var Registry = window.RpaAdapterRegistry
  var Collector = window.RpaEventCollector
  var Uploader = window.RpaEventUploader
  var Dom = window.RpaDomUtils
  var PositionTracker = window.RpaPositionTracker
  var Logger = window.RpaLogger || console
  if (!Flags || !Registry || !Collector || !Uploader || !Dom || !PositionTracker) {
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
        // 不再退回 div.userInfo —— 该布局下那是"登录客服自己"的信息区,会误读成客服名
        'div[class*="conversationName"]',
        '[class*="sessionTitle"]',
      ])) ||
      'unknown'
  }

  function _readAccountNickname() {
    // 登录客服(agent)账号名。优先旧版 [class*="imUserName"];
    // life.douyin 来客布局取 outbound 行 p.text-right.text-gray-2 文本(内含时间 span,需剔除)
    var el = Dom.queryFirst([
      '[class*="imUserName"]',
      'p[class*="text-right"][class*="text-gray"]',
      'p[class*="text-right"]',
    ])
    if (!el) return ''
    if (el.childNodes) {
      var name = ''
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === 3) name += el.childNodes[i].textContent || ''
      }
      name = String(name || '').trim()
      if (name) return name
    }
    return String(Dom.getText(el) || '').trim()
  }

  function _readAccountBizId() {
    // W19-B1:商家账号稳定键 = URL query accountId(Q1 实测:换客户/换坐席不变,在 '?' 之后)
    try {
      var v = new URLSearchParams(location.search).get('accountId')
      return v ? String(v).trim() : ''
    } catch (_) { return '' }
  }

  function _buildSessionInfo(adapter) {
    var nickname = _readNickname(adapter)
    var pageKey = adapter && adapter.pageKey ? adapter.pageKey : 'douyin'
    if (!nickname || nickname === 'unknown') return null
    var account = _readAccountNickname()
    // 防护:客户昵称若等于登录客服账号名,判为误读(否则所有会话会折叠成一条"客服会话")
    if (account && nickname === account) {
      Logger.warn && Logger.warn('LegacyCollector', 'skip collect: nickname equals agent account (likely misread)')
      return null
    }
    var seed = [pageKey, nickname].join('|')
    return {
      conversationId: 'douyin_' + pageKey.replace(/[^a-z0-9]+/ig, '_') + '_' + Dom.simpleHash(seed),
      nickname: nickname,
      accountNickname: account,
      accountBizId: _readAccountBizId(),
      pageKey: pageKey,
    }
  }

  async function collectMessageSession(sessionInfo) {
    var adapter = Registry.resolve(location)
    if (!adapter) {
      // 非匹配页(切到别的抖音页)优雅跳过,降 debug 免刷扩展错误页
      Logger.debug && Logger.debug('LegacyCollector', 'no adapter matched current page')
      return { ok: false, reason: 'adapter-missing' }
    }
    if (typeof adapter.getMessages !== 'function' || typeof adapter.toConversationEvent !== 'function') {
      Logger.warn && Logger.warn('LegacyCollector', 'adapter missing collector methods', adapter.adapterKey)
      return { ok: false, reason: 'adapter-method-missing' }
    }
    var baseInfo = _buildSessionInfo(adapter)
    if (!baseInfo) {
      // 无打开会话/昵称 DOM 未出来时优雅跳过,降 debug 免刷扩展错误页
      Logger.debug && Logger.debug('LegacyCollector', 'skip collect: nickname missing')
      return { ok: false, reason: 'nickname-missing' }
    }
    var info = Object.assign(baseInfo, sessionInfo || {})
    var rawMessages = await adapter.getMessages(info)
    var events = (rawMessages || [])
      .map(function (m) { return adapter.toConversationEvent(m, info) })
      .filter(function (event) { return event && event.content_text })
    // W17:锚点窗口对齐赋"会话内 position"(纯位置,持久化于 chrome.storage,跨采集幂等),
    // message_id = syn_hash(conversationId|position),不含内容/方向(D5)。替代旧 _seqMap 内容去重。
    await PositionTracker.assign(baseInfo.conversationId, events)
    events.forEach(function (event) {
      event.message_id = Dom.synthMessageId({
        conversationId: event.conversation_id,
        position: event.position,
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
