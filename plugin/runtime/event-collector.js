;(function () {
  'use strict'

  var Queue = window.RpaEventQueue
  var Logger = window.RpaLogger || console
  if (!Queue) throw new Error('[W4] RpaEventQueue must load before EventCollector')

  var STORAGE_KEY = 'chatsift_event_seen_ids'
  var MAX_SEEN = 1000
  var _seen = new Set()
  var _loaded = false

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

  async function restoreSeen() {
    var data = await _storageGet(STORAGE_KEY)
    var ids = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : []
    _seen = new Set(ids)
    _loaded = true
    return _seen.size
  }

  function _persistSeen() {
    var ids = Array.from(_seen)
    if (ids.length > MAX_SEEN) ids = ids.slice(ids.length - MAX_SEEN)
    _seen = new Set(ids)
    var data = {}
    data[STORAGE_KEY] = ids
    _storageSet(data)
  }

  async function collect(events) {
    if (!_loaded) await restoreSeen()
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

  function resetSeenForTesting() {
    _seen = new Set()
    _loaded = true
    var data = {}
    data[STORAGE_KEY] = []
    _storageSet(data)
  }

  window.RpaEventCollector = {
    collect:             collect,
    restoreSeen:         restoreSeen,
    resetSeenForTesting: resetSeenForTesting,
  }
})()
