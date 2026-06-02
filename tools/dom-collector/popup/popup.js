var STORAGE_KEY = 'rpaDomCollectorState'
var PLATFORM_KEY = 'rpaDomCollectorPlatform'
var PAGE_KEY = 'rpaDomCollectorPage'
var AUTH_KEY = 'rpaDomCollectorAuth'

var platformOptions = []
var pageOptions = []

var ELEMENT_TYPES = [
  { key: 'contactList', label: '会话列表容器', group: '会话列表', required: true, description: '用于 detect 和 observer 绑定' },
  { key: 'contactItem', label: '单个会话条目', group: '会话列表', required: true, description: '用于点击切换目标会话' },
  { key: 'sessionPreviewText', label: '会话末条消息预览', group: '会话列表', required: true, description: 'DiffEngine 四信号之一' },
  { key: 'sessionTimestamp', label: '会话时间戳', group: '会话列表', optional: true, description: 'DiffEngine 四信号之一，页面无时间时可选' },
  { key: 'sessionUnreadCount', label: '未读数字文本', group: '会话列表', optional: true, description: '未读数量，区别于红点存在性' },
  { key: 'unreadBadge', label: '未读消息角标', group: '会话列表', optional: true, description: '未读红点/数字触发点' },
  { key: 'sessionAvatar', label: '会话头像', group: '会话身份', optional: true, description: '辅助生成会话签名' },
  { key: 'sessionUserIdNode', label: '用户ID/主页节点', group: '会话身份', optional: true, description: '优先采 data-id、链接或稳定用户标识' },
  { key: 'activeContactItem', label: '当前选中会话', group: '会话校验', required: true, description: '用于 verifySession 防串号' },
  { key: 'activeSessionMarker', label: '选中态标识', group: '会话校验', required: true, description: '选中态 class/aria/data 标识' },
  { key: 'sessionTitle', label: '会话标题/昵称', group: '会话校验', required: true, description: '用于确认已切到目标会话' },
  { key: 'loadingIndicator', label: '会话加载中标识', group: '会话校验', optional: true, description: '用于等待会话切换稳定' },
  { key: 'messageList', label: '消息列表容器', group: '消息区', required: true, description: '限定消息扫描范围' },
  { key: 'messageItem', label: '单条消息容器', group: '消息区', required: true, description: '消息方向、时间、内容的父容器' },
  { key: 'messageText', label: '用户消息气泡', group: '消息区', required: true, description: '用户侧文本消息' },
  { key: 'selfMessageText', label: '自己消息气泡', group: '消息区', required: true, description: '避免把自己回复当成用户消息' },
  { key: 'messageTimestamp', label: '消息时间', group: '消息区', optional: true, description: '消息级时间戳' },
  { key: 'messageSenderName', label: '消息发送人/昵称', group: '消息区', optional: true, description: '多人/群聊或复杂客服页辅助识别' },
  { key: 'messageSystemText', label: '系统提示消息', group: '消息区', optional: true, description: '系统提示、时间分割、状态文本' },
  { key: 'messageProductCard', label: '商品/咨询卡片', group: '消息区', optional: true, description: '咨询商品或卡片消息' },
  { key: 'messageImage', label: '图片消息', group: '消息区', optional: true, description: '图片消息识别' },
  { key: 'inputBox', label: '输入框', group: '发送区', required: true, description: '回复输入目标' },
  { key: 'sendButton', label: '发送按钮', group: '发送区', required: true, description: '回复发送动作' },
  { key: 'sendButtonDisabledState', label: '发送按钮禁用态', group: '发送区', optional: true, description: '判断发送按钮不可用原因' },
  { key: 'inputDisabledHint', label: '输入不可用提示', group: '异常态', optional: true, description: '输入框不可用/禁言/关闭原因' },
  { key: 'closedHint', label: '会话关闭提示', group: '异常态', optional: true, description: '会话关闭或超时不可回复' },
  { key: 'loginDialog', label: '登录失效弹窗', group: '异常态', optional: true, description: 'LoginMonitor 掉线判断' },
  { key: 'historyLoadTrigger', label: '加载历史入口', group: '异常态', optional: true, description: '加载更多历史消息' },
]

var CORE_VALIDATE_TYPES = ELEMENT_TYPES.filter(function (type) { return type.required }).map(function (type) { return type.key })
var expandedGroups = {}
var lastValidationByType = {}
var latestCollectedItems = {}

function $(id) {
  return document.getElementById(id)
}

function setMessage(text) {
  $('message').textContent = text || ''
}

async function getAuthState() {
  return (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY] || null
}

async function updateAuthButton() {
  var auth = await getAuthState()
  $('authButton').textContent = auth && auth.token ? '退出' : '登录'
  $('authButton').classList.toggle('active', !!(auth && auth.token))
}

async function toggleAuth() {
  var auth = await getAuthState()
  if (auth && auth.token) {
    await chrome.storage.local.remove([AUTH_KEY])
    platformOptions = []
    pageOptions = []
    renderPlatformOptions('')
    await updateAuthButton()
    setMessage('已退出 DOM 采集器')
    return
  }

  var serverUrl = window.prompt('管理后台地址', 'https://admin.kongyuekeji.com')
  if (!serverUrl) return
  var username = window.prompt('账号', 'admin')
  if (!username) return
  var password = window.prompt('密码')
  if (!password) return

  try {
    var baseUrl = serverUrl.replace(/\/$/, '')
    var res = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    })
    var json = await res.json()
    if (!res.ok || json.code !== 0 || !json.data || !json.data.token) {
      throw new Error(json.message || '登录失败')
    }
    await chrome.storage.local.set({
      [AUTH_KEY]: {
        serverUrl: baseUrl,
        token: json.data.token,
        userInfo: json.data.userInfo || null,
        loginAt: new Date().toISOString(),
      },
    })
    await updateAuthButton()
    await loadPlatformTree()
    loadPlatformInfo()
  } catch (err) {
    setMessage('登录失败：' + (err && err.message ? err.message : '未知错误'))
  }
}

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    return tabs && tabs[0] ? tabs[0] : null
  })
}

async function sendToContent(action) {
  var tab = await getActiveTab()
  if (!tab || !tab.id) throw new Error('未找到当前标签页')
  return sendMessageWithInjection(tab.id, { action: action })
}

async function sendPayloadToContent(message) {
  var tab = await getActiveTab()
  if (!tab || !tab.id) throw new Error('未找到当前标签页')
  return sendMessageWithInjection(tab.id, message)
}

function getStorageState() {
  return chrome.storage.local.get(STORAGE_KEY).then(function (res) {
    return res[STORAGE_KEY] || {}
  })
}

function countCollected(payload) {
  return Object.keys((payload && payload.collectedItems) || {}).length
}

function preferRicherPayload(messagePayload, storagePayload) {
  if (countCollected(storagePayload) > countCollected(messagePayload)) return storagePayload
  return messagePayload || storagePayload || {}
}

async function sendMessageWithInjection(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch (err) {
    await ensureContentScript(tabId)
    return chrome.tabs.sendMessage(tabId, message)
  }
}

async function ensureContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId: tabId, allFrames: true },
    files: ['overlay.css'],
  }).catch(function () {})
  await chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    files: ['content.js'],
  })
}

async function selectType(typeKey) {
  setMessage('')
  try {
    var tab = await getActiveTab()
    if (!tab || !tab.id) throw new Error('未找到当前标签页')
    var res = await sendMessageWithInjection(tab.id, { action: 'SELECT_TYPE', typeKey: typeKey })
    renderProgress(res && res.data)
  } catch (err) {
    setMessage('无法连接页面脚本，请刷新当前页面后重试')
  }
}

function getPlatformByKey(key) {
  return platformOptions.find(function (item) { return item.key === key }) || platformOptions[0] || null
}

function getPageByKey(key, platformKey) {
  var candidates = getPageOptionsForPlatform(platformKey)
  return candidates.find(function (item) { return item.key === key }) || candidates[0] || null
}

function getPageOptionsForPlatform(platformKey) {
  var candidates = pageOptions.filter(function (item) {
    return item.platform === '*' || item.platform === platformKey
  })
  return candidates
}

function normalizePlatformTree(rows) {
  var platforms = []
  var pages = []
  ;(rows || []).forEach(function (row) {
    var platformKey = String(row.platform_key || row.platform_code || row.runtime_key || '').trim()
    if (!platformKey) return
    var platformUrl = row.url || (Array.isArray(row.detect_hosts) ? row.detect_hosts.join(', ') : '')
    platforms.push({
      key: platformKey,
      name: row.platform_name || platformKey,
      hosts: platformUrl,
    })
    ;(row.pages || []).forEach(function (page) {
      var pageKey = String(page.page_code || page.id || '').trim()
      if (!pageKey) return
      pages.push({
        key: pageKey,
        name: page.page_name || pageKey,
        platform: platformKey,
        urlPattern: page.url || (Array.isArray(page.detect_hosts) ? page.detect_hosts.join(', ') : platformUrl),
        suggestedFile: platformKey + '-' + pageKey + '.selectors.json',
      })
    })
  })
  return {
    platforms: platforms,
    pages: pages,
  }
}

async function loadPlatformTree() {
  var auth = (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY]
  if (!auth || !auth.token || !auth.serverUrl) {
    platformOptions = []
    pageOptions = []
    setMessage('请先登录 DOM 采集器')
    return
  }
  try {
    var res = await fetch(auth.serverUrl.replace(/\/$/, '') + '/api/platforms', {
      headers: { Authorization: 'Bearer ' + auth.token },
    })
    var json = await res.json()
    if (!res.ok || json.code !== 0) throw new Error(json.message || '平台接口返回异常')
    var normalized = normalizePlatformTree(json.data || [])
    platformOptions = normalized.platforms
    pageOptions = normalized.pages
    setMessage(platformOptions.length ? '已拉取管理后台平台-页面树' : '管理后台暂无平台-页面数据')
  } catch (err) {
    platformOptions = []
    pageOptions = []
    setMessage('平台-页面树拉取失败：' + (err && err.message ? err.message : '未知错误'))
  }
}

function renderPlatformOptions(selectedKey) {
  var select = $('platformSelect')
  select.innerHTML = ''
  if (!platformOptions.length) {
    var empty = document.createElement('option')
    empty.value = ''
    empty.textContent = '请先登录并拉取平台'
    select.appendChild(empty)
    select.value = ''
    renderPageOptions('', '')
    return
  }
  platformOptions.forEach(function (item) {
    var option = document.createElement('option')
    option.value = item.key
    option.textContent = item.key + ' | ' + item.name
    select.appendChild(option)
  })
  select.value = (getPlatformByKey(selectedKey) || platformOptions[0]).key
  updatePlatformFields()
}

function renderPageOptions(platformKey, selectedKey) {
  var select = $('pageSelect')
  select.innerHTML = ''
  var pages = getPageOptionsForPlatform(platformKey)
  if (!pages.length) {
    var empty = document.createElement('option')
    empty.value = ''
    empty.textContent = platformKey ? '该平台暂无页面' : '请先选择平台'
    select.appendChild(empty)
    select.value = ''
    updatePageFields()
    return
  }
  pages.forEach(function (item) {
    var option = document.createElement('option')
    option.value = item.key
    option.textContent = item.key + ' | ' + item.name
    select.appendChild(option)
  })
  select.value = (getPageByKey(selectedKey, platformKey) || pages[0]).key
  updatePageFields()
}

function updatePlatformFields() {
  var platform = getPlatformByKey($('platformSelect').value)
  if (!platform) {
    $('urlPattern').value = ''
    chrome.storage.local.remove(PLATFORM_KEY)
    return
  }
  chrome.storage.local.set({
    [PLATFORM_KEY]: {
      platform_name: platform.name,
      platform_key: platform.key,
    },
  })
  renderPageOptions(platform.key, $('pageSelect') ? $('pageSelect').value : '')
}

function updatePageFields() {
  var platform = getPlatformByKey($('platformSelect').value)
  var page = platform ? getPageByKey($('pageSelect').value, platform.key) : null
  if (!platform || !page) {
    $('urlPattern').value = ''
    chrome.storage.local.remove(PAGE_KEY)
    return
  }
  var urlPattern = page.urlPattern || platform.hosts
  $('urlPattern').value = urlPattern
  chrome.storage.local.set({
    [PAGE_KEY]: {
      page_name: page.name,
      page_key: page.key,
      url_pattern: urlPattern,
      suggested_file: page.suggestedFile,
    },
  })
}

function loadPlatformInfo() {
  chrome.storage.local.get([PLATFORM_KEY, PAGE_KEY], function (res) {
    var data = res[PLATFORM_KEY] || {}
    var page = res[PAGE_KEY] || {}
    renderPlatformOptions(data.platform_key || '')
    var platform = getPlatformByKey(data.platform_key || '')
    renderPageOptions(platform ? platform.key : '', page.page_key || '')
  })
}

function savePlatformInfo() {
  var platform = getPlatformByKey($('platformSelect').value)
  if (!platform) return {}
  var data = {
    platform_name: platform.name,
    platform_key: platform.key,
  }
  chrome.storage.local.set({ [PLATFORM_KEY]: data })
  return data
}

function savePageInfo() {
  var platform = getPlatformByKey($('platformSelect').value)
  var page = platform ? getPageByKey($('pageSelect').value, platform.key) : null
  if (!platform || !page) return {}
  var urlPattern = page.urlPattern || platform.hosts
  var data = {
    page_name: page.name,
    page_key: page.key,
    url_pattern: urlPattern,
    suggested_file: page.suggestedFile,
  }
  chrome.storage.local.set({ [PAGE_KEY]: data })
  return data
}

function renderProgress(payload) {
  payload = payload || {}
  var collected = payload.collectedItems || {}
  latestCollectedItems = collected
  var list = $('progressList')
  list.innerHTML = ''
  var doneCount = 0
  var requiredTotal = ELEMENT_TYPES.filter(function (type) { return type.required }).length
  var requiredDone = 0
  var currentGroup = ''
  var groupStats = buildGroupStats(collected)

  ELEMENT_TYPES.forEach(function (type) {
    var item = collected[type.key]
    if (item) doneCount += 1
    if (item && type.required) requiredDone += 1
    if (type.group !== currentGroup) {
      currentGroup = type.group
      var expanded = !!expandedGroups[currentGroup]
      var stats = groupStats[currentGroup] || { done: 0, total: 0 }
      var groupLi = document.createElement('li')
      groupLi.className = 'group-row'
      groupLi.dataset.group = currentGroup
      groupLi.innerHTML =
        '<span class="group-title"><b>' + (expanded ? '⌄' : '›') + '</b>' + escapeHtml(currentGroup) + '</span>' +
        '<button type="button" class="group-toggle" data-group="' + escapeHtml(currentGroup) + '">' +
          '已采 ' + stats.done + '/' + stats.total +
        '</button>'
      list.appendChild(groupLi)
    }
    if (!expandedGroups[type.group]) return
    var li = document.createElement('li')
    var validationStatus = lastValidationByType[type.key]
    var validationFailed = validationStatus && validationStatus !== 'hit' && validationStatus !== 'warn'
    li.className =
      'point-row ' +
      (validationFailed ? 'validate-failed ' : item ? 'done ' : 'missing ') +
      (type.required ? 'required ' : 'optional ') +
      (payload.selectedType === type.key ? 'selected' : '')
    li.dataset.type = type.key
    li.title = (type.required ? '必采：' : '可选：') + type.description
    li.innerHTML =
      '<div class="point-main">' +
        '<div class="point-line">' +
          '<span class="point-name">' + escapeHtml(type.label) + '</span>' +
          (validationFailed ? '<strong>校验失败</strong>' : '') +
          '<em>' + (type.required ? '必采' : '建议') + '</em>' +
        '</div>' +
        '<div class="point-desc">' + escapeHtml(type.description) + '</div>' +
      '</div>'
    list.appendChild(li)
  })

  $('progressCount').textContent = doneCount + '/' + ELEMENT_TYPES.length
  $('btnExport').disabled = doneCount === 0
  $('btnValidate').disabled = doneCount === 0
  $('btnStart').disabled = !!payload.isCollecting
  $('btnStop').disabled = !payload.isCollecting
}

function buildGroupStats(collected) {
  var stats = {}
  ELEMENT_TYPES.forEach(function (type) {
    if (!stats[type.group]) stats[type.group] = { done: 0, total: 0 }
    stats[type.group].total += 1
    if (collected && collected[type.key]) stats[type.group].done += 1
  })
  return stats
}

function renderValidation(report) {
  if (!report || !report.results) {
    lastValidationByType = {}
    return
  }

  lastValidationByType = {}
  report.results.forEach(function (result) {
    lastValidationByType[result.type] = result.status
  })
}

function getCoreValidationFailures(report) {
  if (!report || !report.results) return []
  return report.results.filter(function (result) {
    return CORE_VALIDATE_TYPES.indexOf(result.type) !== -1 && result.status !== 'hit'
  })
}

async function getCurrentPayload() {
  try {
    var res = await sendToContent('GET_COLLECTED')
    return preferRicherPayload(res && res.data, await getStorageState())
  } catch (_) {
    return getStorageState()
  }
}

async function validateSelectors(payload) {
  setMessage('')
  payload = payload || await getCurrentPayload()
  var selectors = (payload && payload.collectedItems) || {}
  if (!Object.keys(selectors).length) {
    setMessage('请至少采集一个元素后再验证')
    renderValidation(null)
    return null
  }

  try {
    var res = await sendPayloadToContent({
      action: 'VALIDATE_SELECTORS',
      collectedItems: selectors,
    })
    renderValidation(res && res.data)
    renderProgress(payload)
    return res && res.data
  } catch (err) {
    setMessage('验证失败：无法连接页面脚本，请刷新当前页面后重试')
    return null
  }
}

async function refreshState() {
  try {
    var res = await sendToContent('GET_COLLECTED')
    var storageState = await getStorageState()
    renderProgress(preferRicherPayload(res && res.data, storageState))
  } catch (err) {
    renderProgress(await getStorageState())
  }
}

async function startCollect() {
  setMessage('')
  savePlatformInfo()
  savePageInfo()
  try {
    var firstType = getNextTypeKey()
    var tab = await getActiveTab()
    if (!tab || !tab.id) throw new Error('未找到当前标签页')
    var res = await sendMessageWithInjection(tab.id, { action: 'START_COLLECT', typeKey: firstType })
    renderProgress(res && res.data)
  } catch (err) {
    setMessage('无法连接页面脚本，请刷新当前页面后重试')
  }
}

async function stopCollect() {
  setMessage('')
  try {
    var res = await sendToContent('STOP_COLLECT')
    renderProgress(res && res.data)
  } catch (err) {
    setMessage('停止失败：' + err.message)
  }
}

async function resetCollect() {
  setMessage('')
  lastValidationByType = {}
  try {
    var res = await sendToContent('RESET')
    renderProgress(res && res.data)
  } catch (err) {
    await chrome.storage.local.remove(STORAGE_KEY)
    renderProgress({})
  }
}

async function exportJson() {
  setMessage('')
  savePlatformInfo()
  var platform = savePlatformInfo()
  var page = savePageInfo()
  if (!platform.platform_name || !platform.platform_key || !page.page_key || !page.url_pattern) {
    setMessage('请先确认平台、页面和 URL')
    return
  }

  var payload = await getCurrentPayload()

  var selectors = (payload && payload.collectedItems) || {}
  if (!Object.keys(selectors).length) {
    setMessage('请至少采集一个元素后再导出')
    return
  }

  var report = await validateSelectors(payload)
  var failures = getCoreValidationFailures(report)
  if (failures.length) {
    var names = failures.map(function (item) { return item.label }).join('、')
    var confirmed = window.confirm('以下核心选择器未验证通过：' + names + '。是否仍然导出？')
    if (!confirmed) return
  }

  var output = {
    schema_version: 'dom-collector.v1.9',
    platform_name: platform.platform_name,
    platform_key: platform.platform_key,
    page_name: page.page_name,
    page_key: page.page_key,
    platform_url_pattern: getPlatformByKey(platform.platform_key).hosts,
    url_pattern: page.url_pattern,
    captured_at: new Date().toISOString(),
    page_url: payload && payload.frame ? payload.frame.url : '',
    page_title: payload && payload.frame ? payload.frame.title : '',
    capture_points: buildCapturePointSummary(selectors),
    validation_summary: report && report.summary ? report.summary : null,
    selectors: selectors,
  }
  var filename = platform.platform_key + '-' + page.page_key + '.selectors.json'
  var text = JSON.stringify(output, null, 2)
  await saveSnapshotFile(filename, text)
}

async function saveSnapshotFile(filename, text) {
  var blob = new Blob([text], { type: 'application/json' })

  if (window.showDirectoryPicker) {
    try {
      var dir = await window.showDirectoryPicker({
        id: 'rpa-dom-snapshots',
        mode: 'readwrite',
        startIn: 'documents',
      })
      var handle = await dir.getFileHandle(filename, { create: true })
      var writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      setMessage('已导出：dom-collector/dom-snapshots/' + filename)
      return
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setMessage('已取消导出')
        return
      }
      setMessage('目录写入失败，已改用浏览器下载：' + (err && err.message ? err.message : '未知错误'))
    }
  }

  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
}

function buildCapturePointSummary(selectors) {
  var requiredTotal = 0
  var requiredDone = 0
  var points = ELEMENT_TYPES.map(function (type) {
    var implemented = !!(selectors && selectors[type.key])
    if (type.required) {
      requiredTotal += 1
      if (implemented) requiredDone += 1
    }
    return {
      key: type.key,
      label: type.label,
      group: type.group,
      required: !!type.required,
      optional: !!type.optional,
      implemented: implemented,
      status: implemented ? 'implemented' : 'missing',
      description: type.description,
    }
  })
  return {
    total: ELEMENT_TYPES.length,
    implemented: points.filter(function (item) { return item.implemented }).length,
    missing: points.filter(function (item) { return !item.implemented }).length,
    required_total: requiredTotal,
    required_implemented: requiredDone,
    required_missing: requiredTotal - requiredDone,
    points: points,
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getNextTypeKey() {
  var selected = document.querySelector('#progressList li.selected')
  if (selected) return selected.dataset.type
  for (var i = 0; i < ELEMENT_TYPES.length; i++) {
    if (!latestCollectedItems[ELEMENT_TYPES[i].key]) return ELEMENT_TYPES[i].key
  }
  return ELEMENT_TYPES[0].key
}

document.addEventListener('DOMContentLoaded', function () {
  updateAuthButton()
  loadPlatformTree().then(function () {
    loadPlatformInfo()
    refreshState()
  })
  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      renderProgress(changes[STORAGE_KEY].newValue || {})
    }
  })
  setInterval(refreshState, 1200)
  $('btnStart').addEventListener('click', startCollect)
  $('btnStop').addEventListener('click', stopCollect)
  $('btnReset').addEventListener('click', resetCollect)
  $('btnValidate').addEventListener('click', function () { validateSelectors() })
  $('btnExport').addEventListener('click', exportJson)
  $('authButton').addEventListener('click', toggleAuth)
  $('platformSelect').addEventListener('change', function () {
    updatePlatformFields()
    updatePageFields()
    setMessage('已切换平台，请确认当前页面点位是否需要重置后重新采集')
  })
  $('pageSelect').addEventListener('change', function () {
    updatePageFields()
    setMessage('已切换页面；导出时会按当前平台-页面生成单个 JSON')
  })
  $('progressList').addEventListener('click', function (event) {
    var toggle = event.target.closest('.group-toggle, li.group-row')
    if (toggle) {
      var group = toggle.dataset.group || (toggle.closest('li.group-row') || {}).dataset.group
      if (group) {
        expandedGroups[group] = !expandedGroups[group]
        refreshState()
      }
      return
    }
    var row = event.target.closest('li[data-type]')
    if (row) selectType(row.dataset.type)
  })
})
