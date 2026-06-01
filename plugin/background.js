const DEFAULT_CFG = { serverUrl: 'https://admin.kongyuekeji.com', autoReply: false }

function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, data => resolve(data || {}))
  })
}

function storageSet(data) {
  return new Promise(resolve => {
    chrome.storage.local.set(data, () => resolve(true))
  })
}

async function appendLog(message, level) {
  const data = await storageGet(['logs'])
  const logs = Array.isArray(data.logs) ? data.logs : []
  logs.unshift({
    ts: new Date().toISOString(),
    level: level || 'info',
    message: String(message || ''),
  })
  await storageSet({ logs: logs.slice(0, 200) })
  return true
}

async function getStatus() {
  const data = await storageGet(['token', 'refreshToken', 'cfg', 'userInfo', 'logs', 'platformDefinitions', 'runningPlatform'])
  const runningPlatform = data.runningPlatform || ''
  return {
    ok: true,
    token: data.token || '',
    refreshToken: data.refreshToken || '',
    cfg: Object.assign({}, DEFAULT_CFG, data.cfg || {}),
    userInfo: data.userInfo || null,
    logs: Array.isArray(data.logs) ? data.logs : [],
    platforms: Array.isArray(data.platformDefinitions) ? data.platformDefinitions.map(item => ({ id: item.id, platform: item.key || item.platform_code || item.platform_key })) : [],
    currentPlatform: runningPlatform,
    platformServiceStatus: runningPlatform ? 'online' : 'offline',
  }
}

async function login(payload) {
  const cfg = Object.assign({}, DEFAULT_CFG, payload && payload.cfg || {})
  const serverUrl = String((payload && payload.serverUrl) || cfg.serverUrl || DEFAULT_CFG.serverUrl).replace(/\/$/, '')
  const res = await fetch(serverUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: payload && payload.username,
      password: payload && payload.password,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) throw new Error(json.message || '登录失败')
  const data = json.data || {}
  await storageSet({
    token: data.token || '',
    refreshToken: data.refreshToken || '',
    userInfo: data.userInfo || null,
    cfg: Object.assign({}, cfg, { serverUrl: serverUrl }),
  })
  await appendLog('登录成功', 'success')
  return { ok: true, data: data }
}

async function refreshAuth() {
  const state = await getStatus()
  if (!state.refreshToken) return { ok: false, error: 'missing-refresh-token' }
  const res = await fetch(state.cfg.serverUrl + '/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) return { ok: false, error: json.message || 'refresh-failed' }
  await storageSet({ token: json.data && json.data.token || '' })
  return { ok: true }
}

async function authFetch(path, opts = {}) {
  let state = await getStatus()
  const headers = Object.assign({}, opts.headers || {}, {
    Authorization: 'Bearer ' + state.token,
  })
  let res = await fetch(state.cfg.serverUrl + path, Object.assign({}, opts, { headers }))
  if (res.status === 401) {
    const refreshed = await refreshAuth()
    if (refreshed && refreshed.ok) {
      state = await getStatus()
      headers.Authorization = 'Bearer ' + state.token
      res = await fetch(state.cfg.serverUrl + path, Object.assign({}, opts, { headers }))
    }
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) throw new Error(json.message || json.error || 'request-failed')
  return json
}

async function loadPlatformDefinitions() {
  let data = []
  try {
    const json = await authFetch('/api/platforms?enabled=1')
    data = json.data || []
  } catch (_) {
    data = fallbackPlatformDefinitions()
  }
  await storageSet({ platformDefinitions: data })
  return { ok: true, data }
}

function fallbackPlatformDefinitions() {
  // W4.5 已修复服务端 /api/platforms 500;这里保留为服务端异常时的降级保险。
  return [{
    id: 1,
    platform_name: '抖音系',
    platform_key: 'douyin',
    platform_code: 'douyin',
    runtime_key: 'douyin',
    enabled: 1,
    dom_status: 3,
    detect_hosts: [
      'life.douyin.com',
      'im.douyin.com',
      'im.jinritemai.com',
      'fxg.jinritemai.com',
      'anchor.douyin.com',
    ],
    pages: [
      {
        id: 101,
        page_code: 'douyin_life_private_message',
        page_name: '抖音私信',
        url: 'https://life.douyin.com/cs/web/clue_private_message/chat/session',
        detect_hosts: ['life.douyin.com/cs/web/clue_private_message/chat/session'],
        sort_order: 1,
      },
      {
        id: 102,
        page_code: 'douyin_feige',
        page_name: '飞鸽',
        url: 'https://im.jinritemai.com',
        detect_hosts: ['im.jinritemai.com'],
        sort_order: 2,
      },
    ],
  }]
}

async function loadCloudConfig(platform) {
  const state = await getStatus()
  const platforms = state.platforms || []
  const grant = platforms.find(item => item.platform === platform)
  if (!grant || !grant.id) return { ok: true, data: {} }
  const json = await authFetch('/api/configs/' + grant.id + '/' + encodeURIComponent(platform))
  return { ok: true, data: (json.data && json.data.config_json) || {} }
}

function normalizeDetectFragment(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

function collectDetectHosts(platformDef) {
  const hosts = Array.isArray(platformDef && platformDef.detect_hosts) ? platformDef.detect_hosts.slice() : []
  const pages = Array.isArray(platformDef && platformDef.pages) ? platformDef.pages : []
  pages.forEach(page => {
    ;(Array.isArray(page.detect_hosts) ? page.detect_hosts : []).forEach(host => {
      if (host && hosts.indexOf(host) === -1) hosts.push(host)
    })
    if (page && page.url && hosts.indexOf(page.url) === -1) hosts.push(page.url)
  })
  return hosts.map(normalizeDetectFragment).filter(Boolean)
}

async function reloadMatchedPlatformTabs(message) {
  const stored = await storageGet(['platformDefinitions'])
  const platformDefinitions = Array.isArray(stored.platformDefinitions) ? stored.platformDefinitions : fallbackPlatformDefinitions()
  let platformDef = platformDefinitions.find(item => {
    const key = item.key || item.platform_code || item.platform_key || item.runtime_key
    return key === message.platform
  })
  if (!platformDef) {
    platformDef = fallbackPlatformDefinitions().find(item => {
      const key = item.key || item.platform_code || item.platform_key || item.runtime_key
      return key === message.platform
    })
  }
  const hosts = collectDetectHosts(platformDef)
  const shouldReload = url => {
    const normalizedUrl = normalizeDetectFragment(url)
    return hosts.some(host => normalizedUrl.indexOf(host) !== -1)
  }
  const matched = []

  if (message.tabId && shouldReload(message.pageUrl || '')) {
    matched.push(message.tabId)
  } else {
    const tabs = await chrome.tabs.query({})
    tabs.forEach(tab => {
      if (tab.id && shouldReload(tab.url || '')) matched.push(tab.id)
    })
  }

  const uniqueIds = Array.from(new Set(matched))
  for (const tabId of uniqueIds) {
    try { await chrome.tabs.reload(tabId) } catch (_) {}
  }
  return uniqueIds.length
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message && message.action
  ;(async () => {
    if (action === 'GET_STATUS') return getStatus()
    if (action === 'LOGIN') return login(message.payload || {})
    if (action === 'LOGOUT') {
      await storageSet({ token: '', refreshToken: '', userInfo: null })
      await appendLog('已退出登录', 'info')
      return { ok: true }
    }
    if (action === 'REFRESH_AUTH') return refreshAuth()
    if (action === 'LOAD_PLATFORM_DEFINITIONS') return loadPlatformDefinitions()
    if (action === 'LOAD_CLOUD_CONFIG') return loadCloudConfig(message.platform)
    if (action === 'SAVE_CLOUD_CONFIG') return { ok: true }
    if (action === 'START_PLATFORM') {
      await storageSet({
        runningPlatform: message.platform || '',
        collector_v1_enabled: true,
      })
      let reloaded = 0
      if (message.reloadAfterStart) {
        reloaded = await reloadMatchedPlatformTabs(message)
      }
      if (!reloaded && message.tabId) {
        try { await chrome.tabs.sendMessage(message.tabId, { action: 'START_COLLECTOR' }) } catch (_) {}
      }
      await appendLog(reloaded ? 'W4 采集已启动,已自动刷新目标页面' : 'W4 采集已启动', 'success')
      return { ok: true }
    }
    if (action === 'STOP_PLATFORM') {
      await storageSet({
        runningPlatform: '',
        collector_v1_enabled: false,
      })
      if (message.tabId) {
        try { await chrome.tabs.sendMessage(message.tabId, { action: 'STOP_COLLECTOR' }) } catch (_) {}
      }
      await appendLog('W4 采集已停止', 'info')
      return { ok: true }
    }
    if (action === 'APPEND_LOG') {
      await appendLog(message.message, message.level)
      return { ok: true }
    }
    if (action === 'GET_LOGS') {
      const data = await storageGet(['logs'])
      return { ok: true, data: Array.isArray(data.logs) ? data.logs : [] }
    }
    if (action === 'CLEAR_LOGS') {
      await storageSet({ logs: [] })
      return { ok: true }
    }
    return { ok: false, error: 'unknown-action' }
  })().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message || String(err) }))
  return true
})
