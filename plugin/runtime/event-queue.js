;(function () {
  'use strict'

  var Logger = window.RpaLogger || console
  var STORAGE_KEY = 'chatsift_event_queue'
  var _queue = []
  var _restored = false
  var _listeners = []

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

  async function restore() {
    var data = await _storageGet(STORAGE_KEY)
    _queue = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].slice() : []
    _restored = true
    Logger.info && Logger.info('EventQueue', 'restored', { size: _queue.length })
    return _queue.length
  }

  async function persist() {
    var data = {}
    data[STORAGE_KEY] = _queue.slice()
    return _storageSet(data)
  }

  function enqueue(event) {
    if (!event) return false
    _queue.push(event)
    persist()
    _notify()
    return true
  }

  function dequeueBatch(n) {
    var max = Math.max(0, Number(n) || 0)
    if (!max || !_queue.length) return []
    return _queue.splice(0, max)
  }

  function requeueFront(events) {
    if (!Array.isArray(events) || !events.length) return false
    _queue = events.concat(_queue)
    persist()
    return true
  }

  function size() { return _queue.length }

  function snapshot() {
    return { storageKey: STORAGE_KEY, size: _queue.length, restored: _restored }
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return false
    _listeners.push(fn)
    return function () {
      _listeners = _listeners.filter(function (item) { return item !== fn })
    }
  }

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(_queue.length) } catch (_) {}
    })
  }

  window.RpaEventQueue = {
    enqueue:      enqueue,
    dequeueBatch: dequeueBatch,
    requeueFront: requeueFront,
    persist:      persist,
    restore:      restore,
    size:         size,
    snapshot:     snapshot,
    onChange:     onChange,
  }
})()
