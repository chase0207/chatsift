const DEFAULT_CFG = { serverUrl: 'http://127.0.0.1:3100', autoReply: false }

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
  const data = await storageGet(['token', 'refreshToken', 'cfg', 'userInfo', 'logs'])
  return {
    ok: true,
    token: data.token || '',
    refreshToken: data.refreshToken || '',
    cfg: Object.assign({}, DEFAULT_CFG, data.cfg || {}),
    userInfo: data.userInfo || null,
    logs: Array.isArray(data.logs) ? data.logs : [],
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
    if (action === 'APPEND_LOG') {
      await appendLog(message.message, message.level)
      return { ok: true }
    }
    if (action === 'GET_LOGS') {
      const data = await storageGet(['logs'])
      return { ok: true, logs: Array.isArray(data.logs) ? data.logs : [] }
    }
    if (action === 'CLEAR_LOGS') {
      await storageSet({ logs: [] })
      return { ok: true }
    }
    return { ok: false, error: 'unknown-action' }
  })().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message || String(err) }))
  return true
})
