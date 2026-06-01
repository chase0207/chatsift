function $(id) { return document.getElementById(id) }

var PRODUCTION_URL = ((window.PRA_APP_CONFIG && window.PRA_APP_CONFIG.serverUrl) || 'https://admin.kongyuekeji.com').replace(/\/$/, '')
var LOCAL_URL = 'http://127.0.0.1:3100'
var TEST_URL = 'https://test-admin.kongyuekeji.com'
var AUTO_SERVER_URL = null
var AUTO_ENV = 'prod'

var DEFAULT_SERVER_URL = PRODUCTION_URL
var CURRENT_PLATFORM = null
var CURRENT_STATE = null
var LAST_LOADED_PLATFORM = null
var STATUS_TIMER = null
var CLOUD_PLATFORM_MAP = []

async function detectServerUrl() {
  if (AUTO_SERVER_URL) return AUTO_SERVER_URL
  AUTO_SERVER_URL = PRODUCTION_URL
  AUTO_ENV = 'prod'
  DEFAULT_SERVER_URL = PRODUCTION_URL
  return AUTO_SERVER_URL
}

function cycleEnv() {
  if (AUTO_ENV === 'prod') {
    AUTO_SERVER_URL = TEST_URL
    AUTO_ENV = 'test'
    DEFAULT_SERVER_URL = TEST_URL
    showToast('已切换到测试环境')
  } else if (AUTO_ENV === 'test') {
    AUTO_SERVER_URL = LOCAL_URL
    AUTO_ENV = 'local'
    DEFAULT_SERVER_URL = LOCAL_URL
    $('loginUsername').value = 'admin'
    $('loginPassword').value = 'admin123'
    showToast('已切换到本地开发环境')
  } else {
    AUTO_SERVER_URL = PRODUCTION_URL
    AUTO_ENV = 'prod'
    DEFAULT_SERVER_URL = PRODUCTION_URL
    showToast('已切换到生产环境')
  }
  renderEnvBadge()
  // 切环境即写入 storage,采集 uploader 读 cfg.serverUrl,无需重新登录也能改向
  try {
    chrome.storage.local.get('cfg', function (d) {
      var c = d.cfg || {}
      c.serverUrl = AUTO_SERVER_URL
      chrome.storage.local.set({ cfg: c, serverUrl: AUTO_SERVER_URL })
    })
  } catch (_) {}
}

function renderEnvBadge() {
  var envName = AUTO_ENV === 'local' ? '本地开发' : (AUTO_ENV === 'test' ? '测试环境' : '生产环境')
  var ver = 'v' + chrome.runtime.getManifest().version
  ;['brandVersionSub', 'loginVersion'].forEach(function (id) {
    var el = $(id)
    if (!el) return
    el.textContent = ver + ' · ' + envName
    el.style.cursor = 'pointer'
    el.title = '点击切换环境（生产/测试/本地）'
  })
  var badge = $('envBadge')
  if (!badge) return
  badge.textContent = envName
  badge.className = 'env-badge ' + (AUTO_ENV === 'local' ? 'env-local' : (AUTO_ENV === 'test' ? 'env-test' : 'env-prod'))
  badge.style.cursor = 'pointer'
  badge.title = '点击切换环境'
  badge.onclick = cycleEnv
}

function normalizePlatformKey(value) {
  var aliasMap = {
    douyin: 'douyin',
    douyin_dm: 'douyin',
    feige_dm: 'douyin',
    life_douyin: 'douyin',
    xiaohongshu: 'xiaohongshu',
    xiaohongshu_dm: 'xiaohongshu',
    kuaishou: 'kuaishou',
    pinduoduo: 'pinduoduo',
    pdd_dm: 'pinduoduo',
    taobao: 'taobao',
    jd: 'jd',
    jd_dm: 'jd',
    meituan: 'meituan',
    meituan_jyb: 'meituan',
    wechat: 'wechat',
    shipinhao: 'wechat',
    baidu: 'baidu',
    bili: 'bili',
    bilibili: 'bili',
    tiktok: 'tiktok',
    alipay: 'alipay',
    xianyu: 'xianyu',
    wuba: 'wuba',
    kugou: 'kugou',
  }
  var key = String(value || '').trim().toLowerCase()
  return aliasMap[key] || key
}

function inferToastType(text) {
  if (/失败|错误|异常|未登录|失效|不支持|尚未|请|无法|敬请期待|不能|缺少|过期|拒绝|超时/.test(text)) return 'error'
  return 'success'
}

function showToast(msg, type, dur) {
  if (typeof type === 'number') {
    dur = type
    type = ''
  }
  dur = dur || 2400
  var el = $('toast')
  var text = String(msg || '')
  if (text.indexOf('Token无效或已过期') !== -1 || text.indexOf('token无效或已过期') !== -1) {
    text = '登录状态已失效，请重新登录'
  }
  var toastType = type || inferToastType(text)
  el.textContent = text
  el.className = toastType === 'error' ? 'error' : 'success'
  el.style.display = 'block'
  clearTimeout(el._t)
  el._t = setTimeout(function () { el.style.display = 'none' }, dur)
}

function setLoginError(msg) {
  var el = $('loginError')
  if (!el) return
  el.textContent = msg || ''
}

function clearLoginError() {
  setLoginError('')
}

function isAuthExpiredMessage(message) {
  var text = String(message || '')
  return text.indexOf('Token无效或已过期') !== -1 ||
    text.indexOf('token无效或已过期') !== -1 ||
    text.indexOf('登录状态已失效，请重新登录') !== -1 ||
    text.indexOf('缺少认证Token') !== -1
}

function handleSessionExpiredUI() {
  stopStatusPolling()
  LAST_LOADED_PLATFORM = null
  CURRENT_PLATFORM = null
  CURRENT_STATE = null
  updateLoginMode(false)
  setActivePage('page-platform')
  renderStatusCards()
  setLoginError('')
  $('loginPassword').value = ''
  $('loginUsername').focus()
  showToast('登录状态已失效，请重新登录')
}

function runtimeSend(message) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(message, function (res) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(res)
    })
  })
}

async function getCurrentTabPlatform() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tabs || !tabs[0]) return null
  var url = tabs[0].url || ''
  var allMaps = CLOUD_PLATFORM_MAP
  for (var i = 0; i < allMaps.length; i++) {
    var matchedHost = (allMaps[i].hosts || []).find(function (host) { return host && url.indexOf(host) !== -1 })
    if (matchedHost) {
      var platform = Object.assign({ url: url }, allMaps[i])
      // 匹配具体页面
      var matchedPage = getMatchedPlatformPage(platform, url)
      if (matchedPage) platform.page = matchedPage
      return platform
    }
  }
  return null
}

function normalizeDetectFragment(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

function getMatchedPlatformPage(platform, url) {
  var pages = Array.isArray(platform && platform.pages) ? platform.pages.slice() : []
  var normalizedUrl = normalizeDetectFragment(url)
  return pages
    .filter(function (page) {
      var fragment = normalizeDetectFragment(page.url)
      return fragment && normalizedUrl.indexOf(fragment) !== -1
    })
    .sort(function (a, b) {
      return normalizeDetectFragment(b.url).length - normalizeDetectFragment(a.url).length
    })[0] || null
}

function normalizePopupPlatformDefinition(item) {
  var key = normalizePlatformKey(item.platform_code || item.runtime_key || item.platform_key)
  var hosts = Array.isArray(item.detect_hosts) ? item.detect_hosts.slice() : []
  var pages = Array.isArray(item.pages) ? item.pages : []
  pages.forEach(function (page) {
    var pageHosts = Array.isArray(page.detect_hosts) ? page.detect_hosts : []
    pageHosts.forEach(function (host) { if (host && hosts.indexOf(host) === -1) hosts.push(host) })
  })
  return {
    key: key,
    label: item.platform_name || item.runtime_key || item.platform_key,
    hosts: hosts,
    scenes: Array.isArray(item.scenes) ? item.scenes : [],
    dom_status: item.dom_status ?? 0,
    pages: pages,
  }
}

function detectSceneForPlatform(platform) {
  if (!platform || !platform.url) return { key: '', label: '' }
  if (platform.page) {
    return {
      key: String(platform.page.page_code || platform.page.id || ''),
      label: platform.page.page_name || '',
    }
  }
  var url = String(platform.url || '')
  var scenes = Array.isArray(platform.scenes) ? platform.scenes : []

  if (scenes.length === 1) {
    return {
      key: scenes[0],
      label: scenes[0] === 'live' ? '直播' : '私信消息',
    }
  }

  if (url.indexOf('anchor.douyin.com') !== -1) return { key: 'live', label: '' }
  if (url.indexOf('/p/liteapp/leads_analysis/') !== -1) return { key: 'live', label: '' }
  if (url.indexOf('clue_private_message') !== -1) return { key: 'private_message', label: '' }
  if (url.indexOf('/cs/web/') !== -1) return { key: 'customer_service', label: '' }

  return { key: '', label: '' }
}

async function loadPlatformDefinitions() {
  try {
    var res = await runtimeSend({ action: 'LOAD_PLATFORM_DEFINITIONS' })
    if (!res || !res.ok) throw new Error((res && res.error) || '平台定义加载失败')
    CLOUD_PLATFORM_MAP = (res.data || [])
      .map(normalizePopupPlatformDefinition)
      .filter(function (item) { return item.key && item.hosts && item.hosts.length })
    try { await chrome.storage.local.set({ platformDefinitions: CLOUD_PLATFORM_MAP }) } catch (_) {}
  } catch (_) {
    CLOUD_PLATFORM_MAP = []
  }
}

function getPlatformPageNames(platform) {
  return (Array.isArray(platform && platform.pages) ? platform.pages : [])
    .map(function (page) { return String(page.page_name || '').trim() })
    .filter(Boolean)
}

function getPlatformPageLabel(platform) {
  return platform && platform.page && platform.page.page_name ? String(platform.page.page_name).trim() : ''
}

function getPlatformPageDisplay(platform) {
  var pageName = getPlatformPageLabel(platform)
  return (platform && platform.label ? platform.label : '') + (pageName ? '-' + pageName : '')
}

function renderPlatformLists() {
  var allPlatforms = CLOUD_PLATFORM_MAP
  var supported = allPlatforms.filter(function (p) { return p.dom_status == 3 })
  var upcoming = allPlatforms.filter(function (p) { return p.dom_status == 2 })

  // 已支持的平台
  var supportEl = $('supportList')
  supportEl.innerHTML = ''
  if (!supported.length) {
    supportEl.innerHTML = '<div class="support-item" style="color:var(--color-ink-3)">暂无</div>'
  } else {
    supported.forEach(function (p) {
      var pageLabels = getPlatformPageNames(p)
      var div = document.createElement('div')
      div.className = 'support-item'
      var labelSpan = document.createElement('span')
      labelSpan.className = 'support-label'
      labelSpan.textContent = p.label + '：'
      div.appendChild(labelSpan)
      div.appendChild(document.createTextNode(pageLabels.join(' · ') || p.label))
      supportEl.appendChild(div)
    })
  }

  // 即将上线
  var upcomingEl = $('upcomingList')
  upcomingEl.innerHTML = ''
  if (!upcoming.length) {
    upcomingEl.innerHTML = '<div class="support-item" style="color:var(--color-ink-3)">暂无</div>'
  } else {
    upcoming.forEach(function (p) {
      var pageLabels = getPlatformPageNames(p)
      var div = document.createElement('div')
      div.className = 'support-item upcoming'
      var labelSpan = document.createElement('span')
      labelSpan.className = 'support-label'
      labelSpan.textContent = p.label + '：'
      div.appendChild(labelSpan)
      div.appendChild(document.createTextNode(pageLabels.join(' · ') || p.label))
      upcomingEl.appendChild(div)
    })
  }
}

function updateLoginMode(loggedIn) {
  $('loginShell').classList.toggle('hidden', !!loggedIn)
  $('appShell').classList.toggle('app-hidden', !loggedIn)
  if (loggedIn) clearLoginError()
}

function setActivePage(pageId) {
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.page === pageId)
  })
  document.querySelectorAll('.page').forEach(function (page) {
    page.classList.toggle('active', page.id === pageId)
  })
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setActivePage(btn.dataset.page)
      if (btn.dataset.page === 'page-logs') refreshLogs()
      if (!CURRENT_PLATFORM && btn.dataset.page !== 'page-platform' && btn.dataset.page !== 'page-logs' && btn.dataset.page !== 'page-account') {
        showToast('当前页面不支持，请切换页面')
      }
    })
  })
}

function bindPanels() {
  document.querySelectorAll('.panel-head').forEach(function (head) {
    head.addEventListener('click', function () {
      var panel = $(head.dataset.toggle)
      if (!panel) return
      panel.classList.toggle('collapsed')
      var arrow = head.lastElementChild
      if (arrow) arrow.textContent = panel.classList.contains('collapsed') ? '▼' : '▲'
    })
  })
}

function fillCustomerConfig(cfg) {
  $('autoReplySwitch').checked = !!cfg.autoReply
  $('kefuBreak').value = cfg.kefuBreak != null ? cfg.kefuBreak : 10
  $('sendDelay').value = cfg.speakLimit != null ? cfg.speakLimit : (cfg.sendDelay != null ? cfg.sendDelay : 3)
  $('blackWords').value = cfg.blackWords || ''
  $('keywords').value = cfg.keywords || cfg.qaKeywords || ''
  $('fallback').value = cfg.fallback || cfg.finalReply || ''
  $('transferKeywords').value = Array.isArray(cfg.transfer_keywords)
    ? cfg.transfer_keywords.join(',')
    : (cfg.transfer_keywords || cfg.transferKeywords || '')
}

function setBaseURLMode(val) {
  var isCustom = val === '__custom__'
  $('baseURL').style.display = isCustom ? 'none' : ''
  $('baseURLCustom').style.display = isCustom ? '' : 'none'
}

function setModelMode(isCustom) {
  $('model').style.display = isCustom ? 'none' : ''
  $('modelCustom').style.display = isCustom ? '' : 'none'
}

function getBaseURLVal() {
  return $('baseURL').value === '__custom__' ? $('baseURLCustom').value.trim() : $('baseURL').value
}

function getModelVal() {
  var customMode = $('baseURL').value === '__custom__'
  return customMode ? $('modelCustom').value.trim() : $('model').value
}

function fillAiConfig(cfg) {
  var url = cfg.baseURL || 'https://api.deepseek.com'
  var isCustom = url !== 'https://api.deepseek.com' && url !== ''
  if (isCustom) {
    $('baseURL').value = '__custom__'
    $('baseURLCustom').value = url
    setBaseURLMode('__custom__')
    setModelMode(true)
    $('modelCustom').value = cfg.model || 'deepseek-chat'
  } else {
    $('baseURL').value = url
    setBaseURLMode(url)
    setModelMode(false)
    $('model').value = cfg.model || 'deepseek-v4-flash'
    $('modelCustom').value = 'deepseek-chat'
  }
  $('apiKey').value = cfg.apiKey || ''
  $('systemPrompt').value = cfg.system_prompt || cfg.systemPrompt || ''
}

function buildCustomerConfig() {
  return {
    autoReply: $('autoReplySwitch').checked,
    kefuBreak: parseInt($('kefuBreak').value, 10) || 10,
    speakLimit: parseInt($('sendDelay').value, 10) || 3,
    blackWords: $('blackWords').value.trim(),
    keywords: $('keywords').value,
    fallback: $('fallback').value.trim(),
    transfer_keywords: $('transferKeywords').value.trim(),
  }
}

function buildAiConfig() {
  return {
    baseURL: getBaseURLVal(),
    apiKey: $('apiKey').value.trim(),
    model: getModelVal(),
    system_prompt: $('systemPrompt').value,
  }
}

async function getServerUrl() {
  var state = await runtimeSend({ action: 'GET_STATUS' })
  var cfg = state.cfg || {}
  return cfg.serverUrl || DEFAULT_SERVER_URL
}

async function authFetch(path, opts) {
  var state = await runtimeSend({ action: 'GET_STATUS' })
  var serverUrl = ((state.cfg || {}).serverUrl) || DEFAULT_SERVER_URL
  if (!state.token) throw new Error('未登录')
  opts = opts || {}
  var headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + state.token })
  var res = await fetch(serverUrl + path, Object.assign({}, opts, { headers: headers }))
  var json = await res.json()
  if ((res.status === 401 || json.code === 401) && isAuthExpiredMessage(json.message)) {
    var refreshed = await runtimeSend({ action: 'REFRESH_AUTH' })
    if (!refreshed || !refreshed.ok) {
      handleSessionExpiredUI()
      throw new Error('登录状态已失效，请重新登录')
    }
    state = await runtimeSend({ action: 'GET_STATUS' })
    headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + state.token })
    res = await fetch(serverUrl + path, Object.assign({}, opts, { headers: headers }))
    json = await res.json()
  }
  if (!res.ok || json.code !== 0) throw new Error(json.message || '请求失败')
  return json
}

async function refreshLogs() {
  var res = await runtimeSend({ action: 'GET_LOGS' })
  var logs = ((res && res.data) || []).filter(shouldShowRuntimeLog)
  if (!logs.length) {
    $('logList').textContent = '暂无消息日志'
    return
  }
  $('logList').textContent = logs.map(function (item) {
    return '[' + item.time + '] ' + item.message
  }).join('\n')
  $('logList').scrollTop = $('logList').scrollHeight
}

function shouldShowRuntimeLog(item) {
  var text = String((item && item.message) || '')
  return text.indexOf('[自检]') === 0 ||
    text.indexOf('[❌ 发送失败]') !== -1 ||
    text.indexOf('❌ 启动失败') === 0 ||
    /^\[(发送|会话|消息|看门狗|防串话|配置|授权|路径B)\]/.test(text) ||
    /(登录失败|启动失败|启动异常|授权加载失败|平台定义加载失败|平台启动失败|心跳失败|心跳异常|强制下线|未配置服务器地址|未配置serverUrl|注入失败)/.test(text) ||
    /^\[[^\]]+\]:/.test(text)
}

function renderStatusCards() {
  var platform = CURRENT_PLATFORM
  var state = CURRENT_STATE || {}
  var isVerified = !!(platform && platform.dom_status == 3)
  var running = state.platformServiceStatus === 'online' && state.currentPlatform === (platform && platform.key)
  var hasGrant = !!(platform && (state.platforms || []).some(function (item) { return item.platform === platform.key }))
  var isDetecting = !platform
  var softHint = isDetecting ? '请打开目标平台页面' : ''
  var hardHint = ''
  var statusText = '识别中'
  var statusClass = 'detecting'
  var pageLabel = getPlatformPageLabel(platform)

  if (running) {
    statusText = pageLabel ? pageLabel + '在线' : '在线'
    statusClass = 'online'
  } else if (platform && !isVerified) {
    statusText = '暂未支持'
    statusClass = 'offline'
    var statusTip = platform.dom_status == 4 ? '该平台适配修复中，敬请期待' : '该平台暂未支持'
    hardHint = statusTip
  } else if (platform) {
    statusText = pageLabel ? pageLabel + '离线' : '离线'
    statusClass = 'offline'
    if (!hasGrant) {
      hardHint = state.serviceHint || '提示：您尚未购买此平台的服务'
    } else if (state.serviceHint && !isAuthExpiredMessage(state.serviceHint)) {
      hardHint = state.serviceHint
    }
  }

  // 平台检测面板
  var platformTextEl = $('currentPlatformText')
  var platformActionEl = $('platformAction')
  if (platform && isVerified) {
    var displayLabel = getPlatformPageDisplay(platform) || platform.label
    platformTextEl.textContent = displayLabel
    platformTextEl.className = 'platform-detected'
    if (platformActionEl) platformActionEl.style.display = 'none'
  } else {
    platformTextEl.textContent = '温馨提示：当前页面不支持，请切换并刷新网址'
    platformTextEl.className = 'platform-unsupported'
    if (platformActionEl) platformActionEl.style.display = 'inline'
  }

  // 顶栏客服状态 + 启动/停止按钮
  var isOnline = running || statusClass === 'online'
  $('brandStatusText').textContent = isOnline ? 'AI客服在线' : 'AI客服离线'
  $('brandStatus').className = 'brand-status' + (isOnline ? ' online' : '')

  $('btnStart').classList.toggle('hidden', running || isDetecting || !isVerified)
  $('btnStop').classList.toggle('hidden', !running)
}

async function refreshStatus() {
  CURRENT_PLATFORM = await getCurrentTabPlatform()
  CURRENT_STATE = await runtimeSend({ action: 'GET_STATUS' })
  if (CURRENT_STATE && !CURRENT_STATE.token) {
    handleSessionExpiredUI()
    return
  }
  renderStatusCards()
  if (CURRENT_STATE && CURRENT_STATE.userInfo) {
    $('accountName').textContent = CURRENT_STATE.userInfo.username || '-'
    $('accountStatus').textContent = CURRENT_STATE.token ? '已登录' : '未登录'
    $('accountExpire').textContent = CURRENT_STATE.userInfo.expire_at
      ? String(CURRENT_STATE.userInfo.expire_at).replace('T', ' ').slice(0, 10)
      : '长期'
  } else {
    $('accountName').textContent = '-'
    $('accountStatus').textContent = '未登录'
    $('accountExpire').textContent = '-'
  }

  if (CURRENT_STATE && CURRENT_STATE.token) {
    var platformKey = CURRENT_PLATFORM ? CURRENT_PLATFORM.key : ''
    if (platformKey && platformKey !== LAST_LOADED_PLATFORM) {
      LAST_LOADED_PLATFORM = platformKey
      await loadCloudConfigForCurrentPlatform()
      await loadKnowledgeList()
    }
  }
}

async function loadCloudConfigForCurrentPlatform() {
  if (!CURRENT_PLATFORM) return
  var res = await runtimeSend({ action: 'LOAD_CLOUD_CONFIG', platform: CURRENT_PLATFORM.key })
  if (res && res.ok) {
    var data = res.data || {}
    fillCustomerConfig(data)
    fillAiConfig(data)
  }
}

async function loadKnowledgeList() {
  var state = await runtimeSend({ action: 'GET_STATUS' })
  var grants = state.platforms || []
  if (!CURRENT_PLATFORM) {
    $('kbList').innerHTML = ''
    return
  }
  var grant = grants.find(function (item) { return item.platform === CURRENT_PLATFORM.key })
  if (!grant) {
    $('kbList').innerHTML = ''
    return
  }
  try {
    var json = await authFetch('/api/knowledge/' + grant.id, { method: 'GET' })
    renderKnowledgeFiles(json.data || [], grant.id)
  } catch (err) {
    $('kbList').innerHTML = '<div class="file-item"><div>知识库加载失败：' + err.message + '</div></div>'
  }
}

function renderKnowledgeFiles(files, pluginId) {
  var list = $('kbList')
  list.innerHTML = ''
  if (!files.length) {
    list.innerHTML = '<div class="file-item"><div>暂无知识库文件</div></div>'
    return
  }
  files.forEach(function (file) {
    var item = document.createElement('div')
    item.className = 'file-item'
    item.innerHTML =
      '<div>' +
        '<div style="font-size:18px;font-weight:700;color:#4d586c;">📄 ' + escapeHtml(file.filename) + '</div>' +
        '<div class="file-meta">' + (file.chunk_count || 0) + ' 片段 · ' + String(file.created_at || '').replace('T', ' ').slice(0, 16) + '</div>' +
      '</div>' +
      '<button class="mini-btn" data-file-id="' + file.id + '">删除</button>'
    list.appendChild(item)
  })

  list.querySelectorAll('[data-file-id]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        await authFetch('/api/knowledge/' + pluginId + '/' + btn.dataset.fileId, { method: 'DELETE' })
        showToast('已删除知识库文件')
        await loadKnowledgeList()
      } catch (err) {
        showToast(err.message)
      }
    })
  })
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function uploadKnowledgeFiles(files) {
  if (!CURRENT_PLATFORM || !files.length) return
  var state = await runtimeSend({ action: 'GET_STATUS' })
  var grant = (state.platforms || []).find(function (item) { return item.platform === CURRENT_PLATFORM.key })
  if (!grant) {
    showToast('您尚未购买此平台的服务')
    return
  }

  var serverUrl = ((state.cfg || {}).serverUrl) || DEFAULT_SERVER_URL
  for (var i = 0; i < files.length; i++) {
    var formData = new FormData()
    formData.append('file', files[i])
    var res = await fetch(serverUrl + '/api/knowledge/' + grant.id + '/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
      body: formData,
    })
    var json = await res.json()
    if ((res.status === 401 || json.code === 401) && isAuthExpiredMessage(json.message)) {
      var refreshed = await runtimeSend({ action: 'REFRESH_AUTH' })
      if (!refreshed || !refreshed.ok) {
        handleSessionExpiredUI()
        throw new Error('登录状态已失效，请重新登录')
      }
      state = await runtimeSend({ action: 'GET_STATUS' })
      res = await fetch(serverUrl + '/api/knowledge/' + grant.id + '/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + state.token },
        body: formData,
      })
      json = await res.json()
    }
    if (!res.ok || json.code !== 0) throw new Error(json.message || '上传失败')
  }
  showToast('知识库文件上传成功')
  await runtimeSend({ action: 'APPEND_LOG', message: '知识库上传完成', level: 'success' })
  await loadKnowledgeList()
}

async function handleLogin() {
  var serverUrl = AUTO_SERVER_URL
  var username = $('loginUsername').value.trim()
  var password = $('loginPassword').value
  if (!username || !password) {
    setLoginError('请输入账号和密码')
    return
  }
  clearLoginError()
  $('btnLogin').disabled = true
  $('btnLogin').textContent = '登录中...'
  try {
    var res = await runtimeSend({
      action: 'LOGIN',
      payload: {
        serverUrl: serverUrl,
        username: username,
        password: password,
        cfg: { serverUrl: serverUrl, autoReply: false },
      },
    })
    if (!res || !res.ok) {
      setLoginError((res && res.error) || '登录失败')
      return
    }
    updateLoginMode(true)
    $('loginPassword').value = ''
    await loadPlatformDefinitions()
    renderPlatformLists()
    await refreshStatus()
    startStatusPolling()
    showToast('登录成功')
  } catch (err) {
    setLoginError(err.message || '登录失败')
  } finally {
    $('btnLogin').disabled = false
    $('btnLogin').textContent = '登 录'
  }
}

async function handleLogout() {
  await runtimeSend({ action: 'LOGOUT' })
  stopStatusPolling()
  LAST_LOADED_PLATFORM = null
  CURRENT_PLATFORM = null
  CURRENT_STATE = null
  $('loginPassword').value = ''
  updateLoginMode(false)
  setActivePage('page-platform')
  renderStatusCards()
  $('loginUsername').focus()
  showToast('已退出登录')
}

async function handleSaveConfig() {
  if (!CURRENT_PLATFORM) {
    showToast('请打开目标平台页面')
    return
  }
  var cfg = Object.assign({}, buildCustomerConfig(), buildAiConfig())
  console.log('[SAVE-CONFIG] step1 构建配置:', JSON.stringify(cfg))

  var status = await runtimeSend({ action: 'GET_STATUS' })
  console.log('[SAVE-CONFIG] step2 GET_STATUS serverUrl:', (status.cfg || {}).serverUrl)
  var localCfg = Object.assign({}, status.cfg || {}, buildCustomerConfig())
  await chrome.storage.local.set({ cfg: localCfg })
  console.log('[SAVE-CONFIG] step3 本地已保存')

  var payload = {
    platform: CURRENT_PLATFORM.key,
    config_json: cfg,
  }
  console.log('[SAVE-CONFIG] step4 提交云保存, payload:', JSON.stringify(payload))

  var res = await runtimeSend({
    action: 'SAVE_CLOUD_CONFIG',
    payload: payload,
  })
  console.log('[SAVE-CONFIG] step5 云端响应:', JSON.stringify(res))
  if (!res || !res.ok) {
    if (res && isAuthExpiredMessage(res.error)) {
      handleSessionExpiredUI()
      return
    }
    showToast((res && res.error) || '保存失败')
    return
  }
  await runtimeSend({ action: 'APPEND_LOG', message: '配置已保存到云端', level: 'success' })
  showToast('保存配置成功')
}

function resetCustomerInputs() {
  $('autoReplySwitch').checked = false
  $('kefuBreak').value = 10
  $('sendDelay').value = 3
  $('blackWords').value = ''
  $('keywords').value = ''
  $('fallback').value = ''
  $('transferKeywords').value = '人工,客服,投诉,转人工'
}

function resetAiInputs() {
  $('baseURL').value = 'https://api.deepseek.com'
  setBaseURLMode('https://api.deepseek.com')
  setModelMode(false)
  $('baseURLCustom').value = ''
  $('apiKey').value = ''
  $('model').value = 'deepseek-v4-flash'
  $('modelCustom').value = 'deepseek-chat'
  $('systemPrompt').value = ''
}

async function handleStart() {
  if (!CURRENT_PLATFORM) {
    CURRENT_STATE = CURRENT_STATE || {}
    CURRENT_STATE.serviceHint = '请打开目标平台页面'
    renderStatusCards()
    showToast('请打开目标平台页面')
    return
  }
  if (CURRENT_PLATFORM.dom_status != 3) {
    showToast(CURRENT_PLATFORM.dom_status == 4 ? '该平台适配修复中，敬请期待' : '该平台暂未支持')
    return
  }
  var scene = detectSceneForPlatform(CURRENT_PLATFORM)
  var pageLabel = getPlatformPageLabel(CURRENT_PLATFORM)
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  var activeTab = tabs && tabs[0]
  var res = await runtimeSend({
    action: 'START_PLATFORM',
    platform: CURRENT_PLATFORM.key,
    label: CURRENT_PLATFORM.label,
    scene: scene.key,
    sceneLabel: pageLabel,
    tabId: activeTab && activeTab.id,
    pageUrl: activeTab && activeTab.url,
    reloadAfterStart: true,
  })
  if (!res || !res.ok) {
    if (res && isAuthExpiredMessage(res.error)) {
      handleSessionExpiredUI()
      return
    }
    CURRENT_STATE = CURRENT_STATE || {}
    CURRENT_STATE.serviceHint = (res && res.error) || '启动失败'
    renderStatusCards()
    showToast((res && res.error) || '启动失败')
    return
  }
  CURRENT_STATE = await runtimeSend({ action: 'GET_STATUS' })
  CURRENT_STATE.serviceHint = ''
  renderStatusCards()
  showToast('已启动')
  window.close()
}

async function handleStop() {
  await runtimeSend({ action: 'STOP_PLATFORM' })
  CURRENT_STATE = await runtimeSend({ action: 'GET_STATUS' })
  CURRENT_STATE.serviceHint = ''
  renderStatusCards()
  showToast('已停止')
}

async function initialize() {
  var manifest = chrome.runtime.getManifest()
  var ver = 'v' + manifest.version
  $('brandVersionSub').textContent = ver
  $('loginVersion').textContent = ver

  await detectServerUrl()

  $('loginVersion').addEventListener('click', cycleEnv)
  $('brandVersionSub').addEventListener('click', cycleEnv)
  renderEnvBadge()

  bindNav()
  bindPanels()

  var state = await runtimeSend({ action: 'GET_STATUS' })
  updateLoginMode(!!state.token)
  if (state.token) {
    var me = await runtimeSend({ action: 'LOAD_ME' })
    if (!me || !me.ok) {
      if (isAuthExpiredMessage(me && me.error)) {
        handleSessionExpiredUI()
        return
      }
    }
    await loadPlatformDefinitions()
    renderPlatformLists()
    await refreshStatus()
    startStatusPolling()
  } else {
    $('loginUsername').focus()
    clearLoginError()
  }
  await refreshLogs()

  $('btnLogin').addEventListener('click', handleLogin)
  $('btnLoginClose').addEventListener('click', function () { window.close() })
  $('loginUsername').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('loginPassword').focus()
  })
  $('loginPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleLogin()
  })
  $('btnLogout').addEventListener('click', handleLogout)
  $('btnClearLogs').addEventListener('click', async function () {
    await runtimeSend({ action: 'CLEAR_LOGS' })
    await refreshLogs()
  })
  $('btnSaveKefu').addEventListener('click', handleSaveConfig)
  $('btnSaveAi').addEventListener('click', handleSaveConfig)
  $('btnResetKefu').addEventListener('click', resetCustomerInputs)
  $('btnResetAi').addEventListener('click', resetAiInputs)
  $('baseURL').addEventListener('change', function () {
    var val = $('baseURL').value
    var isCustom = val === '__custom__'
    setBaseURLMode(val)
    setModelMode(isCustom)
  })
  $('btnStart').addEventListener('click', handleStart)
  $('btnStop').addEventListener('click', handleStop)
  $('platformAction').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id)
    })
  })

  $('kbDropzone').addEventListener('dragover', function (e) { e.preventDefault() })
  $('kbDropzone').addEventListener('drop', async function (e) {
    e.preventDefault()
    try {
      await uploadKnowledgeFiles([].slice.call(e.dataTransfer.files || []))
    } catch (err) {
      showToast(err.message)
    }
  })
  $('kbFileInput').addEventListener('change', async function (e) {
    try {
      await uploadKnowledgeFiles([].slice.call(e.target.files || []))
      e.target.value = ''
    } catch (err) {
      showToast(err.message)
    }
  })

  setInterval(async function () {
    if (document.getElementById('page-logs').classList.contains('active')) {
      await refreshLogs()
    }
  }, 3000)
}

function startStatusPolling() {
  stopStatusPolling()
  STATUS_TIMER = setInterval(async function () {
    var state = await runtimeSend({ action: 'GET_STATUS' })
    if (!state.token) {
      handleSessionExpiredUI()
      return
    }
    await refreshStatus()
    if (document.getElementById('page-logs').classList.contains('active')) {
      await refreshLogs()
    }
  }, 2500)
}

function stopStatusPolling() {
  if (STATUS_TIMER) {
    clearInterval(STATUS_TIMER)
    STATUS_TIMER = null
  }
}

document.addEventListener('DOMContentLoaded', initialize)
