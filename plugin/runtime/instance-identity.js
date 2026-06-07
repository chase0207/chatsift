;(function () {
  'use strict'

  // W20-D1:采集实例标识 + heartbeat。
  //   device_id / browser_profile_id:chrome.storage.local 持久(首次随机),跨会话稳定。
  //   tab_id:sessionStorage 每页签一个。collector_instance_id = hash(三者),作 server 实例唯一键。
  //   getIdentity() 取/首次生成;sendHeartbeat(context) 上报当前 account/conv,返回 {conflict, action}。
  //   ★只生成随机标识 + 采集维度,只读不越界(红线 R4)。

  var Hash = window.RpaHash
  var Logger = window.RpaLogger || console
  var DEFAULT_SERVER_URL = 'https://admin.kongyuekeji.com'
  var DEVICE_KEY = 'w20_device_id'
  var PROFILE_KEY = 'w20_browser_profile_id'
  var TAB_KEY = 'w20_tab_id'
  var _identity = null

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }
  function _get(keys) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(keys, function (d) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(d || {})
      })
    })
  }
  function _set(obj) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve(false)
      chrome.storage.local.set(obj, function () { resolve(!(chrome.runtime && chrome.runtime.lastError)) })
    })
  }
  function _rand() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) }

  function _sessionTabId() {
    try {
      var v = window.sessionStorage.getItem(TAB_KEY)
      if (!v) { v = 't_' + _rand(); window.sessionStorage.setItem(TAB_KEY, v) }
      return v
    } catch (_) {
      return 't_' + _rand() // sessionStorage 不可用 → 退化为内存标识
    }
  }

  async function getIdentity() {
    if (_identity) return _identity
    var data = await _get([DEVICE_KEY, PROFILE_KEY])
    var deviceId = data[DEVICE_KEY]
    var profileId = data[PROFILE_KEY]
    var toSet = {}
    if (!deviceId) { deviceId = 'd_' + _rand(); toSet[DEVICE_KEY] = deviceId }
    if (!profileId) { profileId = 'bp_' + _rand(); toSet[PROFILE_KEY] = profileId }
    if (Object.keys(toSet).length) await _set(toSet)
    var tabId = _sessionTabId()
    var cid = Hash && Hash.joinAndHash
      ? Hash.joinAndHash([deviceId, profileId, tabId])
      : String(deviceId) + String(profileId) + String(tabId)
    _identity = { device_id: deviceId, browser_profile_id: profileId, tab_id: tabId, collector_instance_id: cid }
    return _identity
  }

  function _normalizeBaseUrl(url) {
    var n = String(url || DEFAULT_SERVER_URL).replace(/\/$/, '')
    if (n === 'http://127.0.0.1:3000' || n === 'http://localhost:3000') return DEFAULT_SERVER_URL
    return n
  }
  async function _loadAuth() {
    var data = await _get(['token', 'authToken', 'accessToken', 'cfg', 'serverUrl', 'auth'])
    var cfg = data.cfg || {}
    var auth = data.auth || {}
    return {
      token: data.token || data.authToken || data.accessToken || auth.token || auth.accessToken || '',
      serverUrl: _normalizeBaseUrl(cfg.serverUrl || data.serverUrl || auth.serverUrl),
    }
  }

  // 上报当前采集上下文的 heartbeat。返回 {conflict, action} 或 null(失败不阻断采集)。
  async function sendHeartbeat(context) {
    try {
      var id = await getIdentity()
      var auth = await _loadAuth()
      if (!auth.token) return null
      var body = {
        collector_instance_id: id.collector_instance_id,
        device_id: id.device_id,
        browser_profile_id: id.browser_profile_id,
        tab_id: id.tab_id,
        platform: (context && context.platform) || null,
        platform_page: (context && context.platform_page) || null,
        account_biz_id: (context && context.account_biz_id) || null,
        conversation_id: (context && context.conversation_id) || null,
      }
      var resp = await fetch(auth.serverUrl + '/api/v1/events/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token },
        body: JSON.stringify(body),
      })
      if (!resp.ok) return null
      var json = {}
      try { json = await resp.json() } catch (_) {}
      return (json && json.data) || null
    } catch (err) {
      Logger.warn && Logger.warn('InstanceIdentity', 'heartbeat failed', { error: err && err.message })
      return null
    }
  }

  window.RpaInstanceIdentity = {
    getIdentity: getIdentity,
    sendHeartbeat: sendHeartbeat,
  }
})()
