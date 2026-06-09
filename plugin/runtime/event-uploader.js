;(function () {
  'use strict'

  var Queue = window.RpaEventQueue
  var Logger = window.RpaLogger || console
  if (!Queue) throw new Error('[W4] RpaEventQueue must load before EventUploader')

  var UPLOAD_INTERVAL = 15000
  var UPLOAD_FLUSH_SIZE = 10
  var UPLOAD_BATCH_MAX = 50
  var DEFAULT_SERVER_URL = 'https://admin.kongyuekeji.com'
  var _timer = null
  var _uploading = false
  var _offQueueChange = null

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  function _storageGet(keys) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(keys, function (data) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(data || {})
      })
    })
  }

  function _normalizeBaseUrl(url) {
    var normalized = String(url || DEFAULT_SERVER_URL).replace(/\/$/, '')
    if (normalized === 'http://127.0.0.1:3000' || normalized === 'http://localhost:3000') {
      return DEFAULT_SERVER_URL
    }
    return normalized
  }

  async function _loadAuth() {
    var data = await _storageGet(['token', 'authToken', 'accessToken', 'cfg', 'serverUrl', 'auth'])
    var cfg = data.cfg || {}
    var auth = data.auth || {}
    return {
      token: data.token || data.authToken || data.accessToken || auth.token || auth.accessToken || '',
      serverUrl: _normalizeBaseUrl(cfg.serverUrl || data.serverUrl || auth.serverUrl),
    }
  }

  async function tick() {
    if (_uploading || !Queue.size()) return { ok: true, skipped: true }
    _uploading = true
    var batch = Queue.dequeueBatch(UPLOAD_BATCH_MAX)
    try {
      var auth = await _loadAuth()
      if (!auth.token) {
        Queue.requeueFront(batch)
        Logger.warn && Logger.warn('EventUploader', 'missing token, requeued', { count: batch.length })
        return { ok: false, status: 401, reason: 'missing-token' }
      }
      // W20-D1:批量上报透传采集实例标识(server 侧统一识别实例,§2.5)
      var payload = { events: batch }
      if (window.RpaInstanceIdentity && window.RpaInstanceIdentity.getIdentity) {
        try {
          var ident = await window.RpaInstanceIdentity.getIdentity()
          if (ident) {
            payload.collector_instance_id = ident.collector_instance_id
            payload.device_id = ident.device_id
            payload.browser_profile_id = ident.browser_profile_id
            payload.tab_id = ident.tab_id
          }
        } catch (_) {}
      }
      var resp = await fetch(auth.serverUrl + '/api/v1/events/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth.token,
        },
        body: JSON.stringify(payload),
      })
      if (resp.ok) {
        var json = {}
        try { json = await resp.json() } catch (_) {}
        await Queue.persist()
        Logger.info && Logger.info('EventUploader', 'uploaded', json.data || json)
        _logRejectReasons(json.data && json.data.reject_reasons) // W20:采集权拒/原因写入消息日志
        return { ok: true, response: json }
      }
      Queue.requeueFront(batch)
      Logger.warn && Logger.warn('EventUploader', 'upload failed, requeued', { status: resp.status, count: batch.length })
      return { ok: false, status: resp.status }
    } catch (err) {
      Queue.requeueFront(batch)
      Logger.warn && Logger.warn('EventUploader', 'network failed, requeued', { count: batch.length, error: err && err.message })
      return { ok: false, error: err && err.message }
    } finally {
      _uploading = false
    }
  }

  // W20:把 server 返回的 reject_reasons 汇总成中文写入插件消息日志(节流:同一汇总不重复刷)。
  var _lastRejectSig = ''
  var REJECT_LABEL = {
    missing_account_biz_id: '私信缺商家账号ID',
    account_disabled: '账号已停用，采集冻结',
    pending_grab: '账号待确认且采集权属他人',
    not_collector: '你不是该账号采集负责人',
    no_collect_permission: '无采集权（账号待客服认领/确认）',
  }
  function _logRejectReasons(reasons) {
    if (!reasons || !reasons.length) { _lastRejectSig = ''; return }
    var counts = {}
    reasons.forEach(function (r) {
      var k = r && r.reason
      if (k && k !== 'invalid_event') counts[k] = (counts[k] || 0) + 1
    })
    var parts = Object.keys(counts).map(function (k) { return counts[k] + '条·' + (REJECT_LABEL[k] || k) })
    if (!parts.length) return
    var msg = '[采集]: ' + parts.join('；') + '，未上报'
    if (msg === _lastRejectSig) return // 节流:同样的拒绝汇总不重复刷屏
    _lastRejectSig = msg
    _appendPluginLog(msg)
  }
  function _appendPluginLog(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPEND_LOG', message: message, level: 'warn' })
      }
    } catch (_) {}
  }

  async function start() {
    if (_timer) return true
    await Queue.restore()
    _timer = setInterval(tick, UPLOAD_INTERVAL)
    if (Queue.onChange) {
      _offQueueChange = Queue.onChange(function (size) {
        if (size >= UPLOAD_FLUSH_SIZE) tick()
      })
    }
    tick()
    Logger.info && Logger.info('EventUploader', 'started')
    return true
  }

  function stop() {
    if (!_timer) return false
    clearInterval(_timer)
    _timer = null
    if (_offQueueChange) _offQueueChange()
    _offQueueChange = null
    Logger.info && Logger.info('EventUploader', 'stopped')
    return true
  }

  window.RpaEventUploader = {
    start: start,
    stop:  stop,
    tick:  tick,
  }
})()
