;(function () {
  'use strict'

  var Queue = window.RpaEventQueue
  var Logger = window.RpaLogger || console
  if (!Queue) throw new Error('[W4] RpaEventQueue must load before EventCollector')

  // v0.6.5:seen 按 env+tenant+account 命名空间隔离(旧全局 key 'chatsift_event_seen_ids' 弃用、不再读)。
  var SEEN_PREFIX = 'chatsift_seen_'
  var MAX_SEEN = 1000
  var _seen = new Set()
  var _seenKey = null                  // 当前已加载的命名空间 key

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  function _storageGet(key) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(key, function (data) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(data || {})
      })
    })
  }

  function _storageSet(data) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve(false)
      chrome.storage.local.set(data, function () {
        resolve(!(chrome.runtime && chrome.runtime.lastError))
      })
    })
  }

  // v0.6.5:命名空间 key = SEEN_PREFIX + envHash + tenant + account_biz_id。切上下文即切 key、加载对应 Set。
  function _nsKey(ctx) {
    return SEEN_PREFIX + ctx.envHash + '_' + ctx.tenant_id + '_' + ctx.account_biz_id
  }
  async function _ensureNamespace(ctx) {
    var key = _nsKey(ctx)
    if (key === _seenKey) return
    var data = await _storageGet(key)
    _seen = new Set(Array.isArray(data[key]) ? data[key] : [])
    _seenKey = key
  }

  function _persistSeen() {
    if (!_seenKey) return
    var ids = Array.from(_seen)
    if (ids.length > MAX_SEEN) ids = ids.slice(ids.length - MAX_SEEN)
    _seen = new Set(ids)
    var data = {}
    data[_seenKey] = ids
    _storageSet(data)
  }

  async function collect(events, ctx) {
    if (!ctx || !ctx.ok) {
      // v0.6.5 fail-closed:无有效上下文(env/tenant/account)→ 不去重、不入队、不写本地态
      var n = Array.isArray(events) ? events.length : 0
      return { collected: 0, skipped: n }
    }
    await _ensureNamespace(ctx)
    var list = Array.isArray(events) ? events : []
    var collected = 0
    var skipped = 0
    list.forEach(function (event) {
      var id = event && event.message_id
      if (!id || _seen.has(id)) {
        skipped += 1
        return
      }
      _seen.add(id)
      Queue.enqueue(event)
      collected += 1
    })
    if (collected) _persistSeen()
    Logger.info && Logger.info('EventCollector', 'collect', { collected: collected, skipped: skipped })
    return { collected: collected, skipped: skipped }
  }

  // v0.6.4:从本地 seen 移除指定 message_id(采集权类 rejected 后释放,开权后可重新上报)。
  //   作用于当前命名空间(forgetSeen 在一次 collect 之后调用,_seenKey 已就位);有变化才持久化。
  function forgetSeen(ids) {
    var list = Array.isArray(ids) ? ids : []
    var changed = false
    list.forEach(function (id) {
      if (id && _seen.has(id)) { _seen.delete(id); changed = true }
    })
    if (changed) _persistSeen()
    return changed
  }

  // 兼容导出:旧 restoreSeen 不再全局加载(命名空间随 collect 切),保留为 no-op。
  async function restoreSeen() { return _seen.size }

  function resetSeenForTesting() {
    _seen = new Set()
    if (_seenKey) { var data = {}; data[_seenKey] = []; _storageSet(data) }
  }

  window.RpaEventCollector = {
    collect:             collect,
    restoreSeen:         restoreSeen,
    forgetSeen:          forgetSeen,
    resetSeenForTesting: resetSeenForTesting,
  }
})()
