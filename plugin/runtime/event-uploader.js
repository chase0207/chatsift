;(function () {
  'use strict'

  var Queue = window.RpaEventQueue
  var Logger = window.RpaLogger || console
  if (!Queue) throw new Error('[W4] RpaEventQueue must load before EventUploader')

  var UPLOAD_INTERVAL = 5000
  var UPLOAD_BATCH_MAX = 50
  var DEFAULT_SERVER_URL = 'http://127.0.0.1:3100'
  var _timer = null
  var _uploading = false

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
      var resp = await fetch(auth.serverUrl + '/api/v1/events/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth.token,
        },
        body: JSON.stringify({ events: batch }),
      })
      if (resp.ok) {
        var json = {}
        try { json = await resp.json() } catch (_) {}
        await Queue.persist()
        Logger.info && Logger.info('EventUploader', 'uploaded', json.data || json)
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

  async function start() {
    if (_timer) return true
    await Queue.restore()
    _timer = setInterval(tick, UPLOAD_INTERVAL)
    tick()
    Logger.info && Logger.info('EventUploader', 'started')
    return true
  }

  function stop() {
    if (!_timer) return false
    clearInterval(_timer)
    _timer = null
    Logger.info && Logger.info('EventUploader', 'stopped')
    return true
  }

  window.RpaEventUploader = {
    start: start,
    stop:  stop,
    tick:  tick,
  }
})()
