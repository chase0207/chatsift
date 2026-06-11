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
  var Identity = window.RpaInstanceIdentity   // W20-D1:可选,缺失则不做实例冲突心跳(不影响采集)

  var _observer = null
  var _timer = null
  var _collecting = false
  var _debounce = null
  var COLLECT_DEBOUNCE_MS = 10000

  // W20-D1:采集实例冲突心跳 + 阻断态。
  var _blocked = false          // 被 session 级冲突阻断 → 暂停本 tab 采集
  var _hbTimer = null
  var _hbInflight = false
  var HEARTBEAT_INTERVAL_MS = 15000

  // v0.6.5:采集上下文 = env(normalized serverUrl 的 hash) + tenant_id + account_biz_id。
  //   用途:① seen/position 命名空间隔离;② contextKey 变化时 flush 未上传缓冲(防残留发往新环境/新租户)。
  //   tenant_id 取 userInfo.tenant_id,缺则 decode JWT payload;仍缺/serverUrl/account 缺 → fail-closed 跳过本轮。
  function _ctxStorageGet(keys) {
    return new Promise(function (resolve) {
      try {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return resolve({})
        chrome.storage.local.get(keys, function (d) { resolve((chrome.runtime && chrome.runtime.lastError) ? {} : (d || {})) })
      } catch (_) { resolve({}) }
    })
  }
  function _normalizeServerUrl(url) {
    var n = String(url || '').replace(/\/$/, '')
    if (n === 'http://127.0.0.1:3000' || n === 'http://localhost:3000') return 'https://admin.kongyuekeji.com'
    return n
  }
  function _decodeJwtTenant(token) {
    try {
      var parts = String(token || '').split('.')
      if (parts.length < 2) return null
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      var pad = b64.length % 4 ? b64 + '===='.slice(b64.length % 4) : b64
      var json = decodeURIComponent(atob(pad).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      }).join(''))
      var p = JSON.parse(json)
      return (p && p.tenant_id != null) ? p.tenant_id : null
    } catch (_) { return null }
  }
  async function _resolveContext(accountBizId) {
    var data = await _ctxStorageGet(['cfg', 'serverUrl', 'auth', 'userInfo', 'token', 'authToken', 'accessToken'])
    var cfg = data.cfg || {}, auth = data.auth || {}, ui = data.userInfo || {}
    var serverUrl = _normalizeServerUrl(cfg.serverUrl || data.serverUrl || auth.serverUrl)
    var token = data.token || data.authToken || data.accessToken || auth.token || auth.accessToken || ''
    var tenant = (ui && ui.tenant_id != null) ? ui.tenant_id : _decodeJwtTenant(token)
    if (!serverUrl || tenant == null || tenant === '' || !accountBizId || !token) return { ok: false }
    var envHash = Dom.simpleHash(serverUrl.toLowerCase())
    return {
      ok: true,
      envHash: envHash, tenant_id: String(tenant), account_biz_id: String(accountBizId),
      serverUrl: serverUrl, token: token,
      contextKey: envHash + '_' + tenant + '_' + accountBizId,
    }
  }
  var _lastContextKey = ''

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
    var accountBizId = _readAccountBizId()
    // B3:conversation_id 纳入 account_biz_id(商家账号)维度,防跨账号同名客户误并;
    //     坐席(account_nickname)不进——同账号换坐席仍是同一会话(坐席体现在 service_account_id)。
    //     有 bizId(private-message 真机恒有)→ 新口径;无(laike/feige 暂未抓)→ 退回旧口径,不破。
    var seed = (accountBizId ? [pageKey, accountBizId, nickname] : [pageKey, nickname]).join('|')
    var idBase = 'douyin_' + pageKey.replace(/[^a-z0-9]+/ig, '_') + (accountBizId ? '_' + accountBizId : '')
    return {
      conversationId: idBase + '_' + Dom.simpleHash(seed),
      nickname: nickname,
      accountNickname: account,
      accountBizId: accountBizId,
      pageKey: pageKey,
    }
  }

  async function collectMessageSession(sessionInfo) {
    if (_blocked) {
      // W20-D1:session 级实例冲突阻断中,暂停本 tab 采集(心跳解除后自动恢复)
      Logger.warn && Logger.warn('LegacyCollector', 'skip collect: blocked by session-level instance conflict')
      return { ok: false, reason: 'instance-blocked' }
    }
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) {
      Logger.debug && Logger.debug('LegacyCollector', 'skip collect: page not allowlisted')
      return { ok: false, reason: 'page-not-allowlisted' }
    }
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
    // v0.6.5:解析采集上下文(env/tenant/account);缺失 → fail-closed 跳过本轮(不采、不写本地态、不上传)
    var ctx = await _resolveContext(baseInfo.accountBizId)
    if (!ctx.ok) {
      Logger.debug && Logger.debug('LegacyCollector', 'skip collect: context incomplete (env/tenant/account)')
      return { ok: false, reason: 'context-incomplete' }
    }
    // 上下文(env/tenant/account)真实变化 → flush 未上传缓冲,防残留事件发往新环境/新租户
    if (_lastContextKey && _lastContextKey !== ctx.contextKey) {
      try { if (window.RpaEventQueue && window.RpaEventQueue.flush) await window.RpaEventQueue.flush() } catch (_) {}
      Logger.info && Logger.info('LegacyCollector', 'context changed, queue flushed', { to: ctx.contextKey })
    }
    _lastContextKey = ctx.contextKey

    var info = Object.assign(baseInfo, sessionInfo || {})
    var rawMessages = await adapter.getMessages(info)
    var events = (rawMessages || [])
      .map(function (m) { return adapter.toConversationEvent(m, info) })
      .filter(function (event) { return event && event.content_text })
    // W17 + v0.6.5:命名空间化锚点窗口对齐赋 position;冷启动从 server re-align,失败/无法对齐 → 跳过本轮。
    // message_id = syn_hash(conversationId|position),合成规则不变(不触 Stop Gate)。
    var assignRes = await PositionTracker.assign(baseInfo.conversationId, events, ctx)
    if (assignRes && assignRes.skip) {
      Logger.info && Logger.info('LegacyCollector', 'skip collect: position re-align unavailable', { reason: assignRes.reason })
      return { ok: false, reason: 'position-skip:' + assignRes.reason }
    }
    events.forEach(function (event) {
      event.message_id = Dom.synthMessageId({
        conversationId: event.conversation_id,
        position: event.position,
      })
    })
    var result = await Collector.collect(events, ctx)
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

  // W20-D1:取当前会话的实例冲突心跳上下文(无打开会话/无商家账号 → null,不参与冲突)
  function _currentHeartbeatContext() {
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) return null
    var adapter = Registry.resolve(location)
    if (!adapter) return null
    var info = _buildSessionInfo(adapter)
    if (!info || !info.accountBizId) return null   // laike/feige 等无 bizId → 不做实例冲突
    return {
      platform: 'douyin',
      platform_page: info.pageKey,
      account_biz_id: info.accountBizId,
      conversation_id: info.conversationId,
    }
  }

  var _lastConflictKey = ''
  function _appendPluginLog(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPEND_LOG', message: message, level: 'warn' })
      }
    } catch (_) {}
  }
  function _notifyConflict(kind, context) {
    var bizId = context && context.account_biz_id
    Logger.warn && Logger.warn('LegacyCollector', 'instance conflict', { kind: kind, account_biz_id: bizId })
    try {
      window.dispatchEvent(new CustomEvent('chatsift:collect-conflict', {
        detail: { conflict: 'account', action: kind, context: context },
      }))
    } catch (_) {}
    // W20:写入插件消息日志(节流:同 kind+账号 不重复刷)
    var key = kind + '|' + bizId
    if (key === _lastConflictKey) return
    _lastConflictKey = key
    _appendPluginLog(kind === 'block'
      ? '[实例]: 同一客服账号已有更早的采集实例在运行，本页已暂停采集'
      : '[实例]: 检测到同账号其他采集实例，本实例为最早，继续采集')
  }

  // 周期心跳:session-block → 暂停本 tab 采集;account-warn → 仅强提醒不停采;无冲突 → 解除阻断恢复采集。
  // ★心跳失败(网络/无 token,sendHeartbeat 返回 null)→ fail-open,不改变采集态,绝不误停合法采集。
  async function _heartbeatTick() {
    if (_hbInflight || !Identity || !Identity.sendHeartbeat) return
    if (!Flags.get('collector_v1_enabled')) return
    var context = _currentHeartbeatContext()
    if (!context) return
    _hbInflight = true
    try {
      var res = await Identity.sendHeartbeat(context)
      if (!res) return
      // ★账号级 + 仲裁:server 按注册先后判定 —— action='block'(更晚,暂停)/'primary'(最早,继续)/无(独占)。
      if (res.action === 'block') {
        _blocked = true
        _notifyConflict('block', context)
      } else if (res.action === 'primary') {
        if (_blocked) { _blocked = false; Logger.info && Logger.info('LegacyCollector', 'now primary, collection resumed') }
        _notifyConflict('primary', context)
      } else {
        if (_blocked) {
          _blocked = false
          Logger.info && Logger.info('LegacyCollector', 'instance conflict cleared, collection resumed')
          _appendPluginLog('[实例]: 冲突解除，恢复采集')
        }
        _lastConflictKey = ''
      }
    } catch (err) {
      Logger.warn && Logger.warn('LegacyCollector', 'heartbeat tick failed', err && err.message)
    } finally {
      _hbInflight = false
    }
  }

  function _startHeartbeat() {
    if (_hbTimer || !Identity || !Identity.sendHeartbeat) return
    _hbTimer = setInterval(function () { _heartbeatTick() }, HEARTBEAT_INTERVAL_MS)
  }

  function _stopHeartbeat() {
    if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null }
    _blocked = false   // 停采时清阻断态,下次 start 重新检测
  }

  async function start() {
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) {
      Logger.info && Logger.info('LegacyCollector', 'blocked: page not allowlisted')
      return false
    }
    if (_observer) return true
    await Uploader.start()
    _startHeartbeat()
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
    _stopHeartbeat()
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
          start().then(function (ok) { sendResponse({ ok: !!ok }) })
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

  // W21:安全显式采集当前会话入口(供 assisted collector 切换确认后立即采集)。
  //   复用 collectMessageSession()——★不改 position/message_id/occurred_at/batch 契约;
  //   仍受 _blocked(实例冲突)与 collector_v1_enabled 门控,不绕过任何采集约束。
  async function collectNow() {
    if (_blocked) return { ok: false, reason: 'instance-blocked' }
    if (!Flags.get('collector_v1_enabled')) return { ok: false, reason: 'collector-disabled' }
    return collectMessageSession()
  }

  window.RpaLegacyCollector = {
    boot: boot,
    start: start,
    stop: stop,
    collectMessageSession: collectMessageSession,
    collectNow: collectNow,                        // W21:显式采集入口
    isBlocked: function () { return _blocked },   // W20-D1:观测当前是否被实例冲突阻断
  }

  boot()
})()
