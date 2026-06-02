;(function () {
  'use strict'

  if (window.__PRA_DOM_COLLECTOR__) return
  window.__PRA_DOM_COLLECTOR__ = true

  var STORAGE_KEY = 'rpaDomCollectorState'
  var isCollecting = false
  var currentTarget = null
  var pendingTarget = null
  var selectedType = ''
  var collectedItems = {}
  var lockedElements = new Map()
  var boundRoots = new WeakSet()
  var hoverStyleMap = new WeakMap()
  var lockStyleMap = new WeakMap()
  var lastPickAt = 0
  var lastPickTarget = null

  var ELEMENT_TYPES = [
    { key: 'contactList', label: '会话列表容器', color: '#3b82f6', group: '会话列表', required: true, description: '用于 detect 和 observer 绑定' },
    { key: 'contactItem', label: '单个会话条目', color: '#10b981', group: '会话列表', required: true, description: '用于点击切换目标会话' },
    { key: 'sessionPreviewText', label: '会话末条消息预览', color: '#38bdf8', group: '会话列表', required: true, description: 'DiffEngine 四信号之一' },
    { key: 'sessionTimestamp', label: '会话时间戳', color: '#60a5fa', group: '会话列表', optional: true, description: 'DiffEngine 四信号之一，页面无时间时可选' },
    { key: 'sessionUnreadCount', label: '未读数字文本', color: '#f43f5e', group: '会话列表', optional: true, description: '未读数量，区别于红点存在性' },
    { key: 'unreadBadge', label: '未读消息角标', color: '#ef4444', group: '会话列表', optional: true, description: '未读红点/数字触发点' },
    { key: 'sessionAvatar', label: '会话头像', color: '#a78bfa', group: '会话身份', optional: true, description: '辅助生成会话签名' },
    { key: 'sessionUserIdNode', label: '用户ID/主页节点', color: '#c084fc', group: '会话身份', optional: true, description: '优先采 data-id、链接或稳定用户标识' },
    { key: 'activeContactItem', label: '当前选中会话', color: '#22c55e', group: '会话校验', required: true, description: '用于 verifySession 防串号' },
    { key: 'activeSessionMarker', label: '选中态标识', color: '#16a34a', group: '会话校验', required: true, description: '选中态 class/aria/data 标识' },
    { key: 'sessionTitle', label: '会话标题/昵称', color: '#84cc16', group: '会话校验', required: true, description: '用于确认已切到目标会话' },
    { key: 'loadingIndicator', label: '会话加载中标识', color: '#f97316', group: '会话校验', optional: true, description: '用于等待会话切换稳定' },
    { key: 'messageList', label: '消息列表容器', color: '#fb923c', group: '消息区', required: true, description: '限定消息扫描范围' },
    { key: 'messageItem', label: '单条消息容器', color: '#f59e0b', group: '消息区', required: true, description: '消息方向、时间、内容的父容器' },
    { key: 'messageText', label: '用户消息气泡', color: '#d97706', group: '消息区', required: true, description: '用户侧文本消息' },
    { key: 'selfMessageText', label: '自己消息气泡', color: '#14b8a6', group: '消息区', required: true, description: '避免把自己回复当成用户消息' },
    { key: 'messageTimestamp', label: '消息时间', color: '#0ea5e9', group: '消息区', optional: true, description: '消息级时间戳' },
    { key: 'messageSenderName', label: '消息发送人/昵称', color: '#06b6d4', group: '消息区', optional: true, description: '多人/群聊或复杂客服页辅助识别' },
    { key: 'messageSystemText', label: '系统提示消息', color: '#64748b', group: '消息区', optional: true, description: '系统提示、时间分割、状态文本' },
    { key: 'messageProductCard', label: '商品/咨询卡片', color: '#f97316', group: '消息区', optional: true, description: '咨询商品或卡片消息' },
    { key: 'messageImage', label: '图片消息', color: '#8b5cf6', group: '消息区', optional: true, description: '图片消息识别' },
    { key: 'inputBox', label: '输入框', color: '#7c3aed', group: '发送区', required: true, description: '回复输入目标' },
    { key: 'sendButton', label: '发送按钮', color: '#0891b2', group: '发送区', required: true, description: '回复发送动作' },
    { key: 'sendButtonDisabledState', label: '发送按钮禁用态', color: '#0e7490', group: '发送区', optional: true, description: '判断发送按钮不可用原因' },
    { key: 'inputDisabledHint', label: '输入不可用提示', color: '#475569', group: '异常态', optional: true, description: '输入框不可用/禁言/关闭原因' },
    { key: 'closedHint', label: '会话关闭提示', color: '#64748b', group: '异常态', optional: true, description: '会话关闭或超时不可回复' },
    { key: 'loginDialog', label: '登录失效弹窗', color: '#dc2626', group: '异常态', optional: true, description: 'LoginMonitor 掉线判断' },
    { key: 'historyLoadTrigger', label: '加载历史入口', color: '#4f46e5', group: '异常态', optional: true, description: '加载更多历史消息' },
  ]

  init()

  function init() {
    setupCollectorEventTargets()
    loadState()
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || !message.action) return
      if (message.action === 'START_COLLECT') {
        startCollect(message.typeKey)
        sendResponse({ ok: true, data: getPayload() })
        return true
      }
      if (message.action === 'SELECT_TYPE') {
        selectType(message.typeKey)
        sendResponse({ ok: true, data: getPayload() })
        return true
      }
      if (message.action === 'STOP_COLLECT') {
        stopCollect()
        sendResponse({ ok: true, data: getPayload() })
        return true
      }
      if (message.action === 'GET_COLLECTED') {
        sendResponse({ ok: true, data: getPayload() })
        return true
      }
      if (message.action === 'RESET') {
        resetCollected()
        sendResponse({ ok: true, data: getPayload() })
        return true
      }
      if (message.action === 'VALIDATE_SELECTORS') {
        var report = validateCollectedSelectors(message.collectedItems || collectedItems || {})
        sendResponse({ ok: true, data: report })
        return true
      }
    })
  }

  function startCollect(typeKey) {
    isCollecting = true
    if (typeKey) selectedType = typeKey
    if (!selectedType) selectedType = getNextTypeKey()
    document.documentElement.classList.add('rpa-collector-crosshair')
    saveState()
    renderProgress()
  }

  function stopCollect() {
    isCollecting = false
    document.documentElement.classList.remove('rpa-collector-crosshair')
    clearHover()
    removeTooltip()
    removeModal()
    saveState()
    removeProgress()
  }

  function selectType(typeKey) {
    if (ELEMENT_TYPES.some(function (type) { return type.key === typeKey })) {
      selectedType = typeKey
    }
    saveState()
    renderProgress()
  }

  function resetCollected() {
    collectedItems = {}
    lockedElements.forEach(function (el) { restoreLockedStyle(el) })
    lockedElements.clear()
    removeProgress()
    saveState({ replace: true })
  }

  function getPayload() {
    return {
      isCollecting: isCollecting,
      selectedType: selectedType,
      elementTypes: ELEMENT_TYPES,
      collectedItems: collectedItems,
      frame: {
        url: location.href,
        title: document.title,
      },
    }
  }

  function loadState() {
    chrome.storage.local.get(STORAGE_KEY, function (res) {
      var state = res && res[STORAGE_KEY]
      if (state && state.collectedItems) collectedItems = state.collectedItems
      if (state && state.selectedType) selectedType = state.selectedType
      if (state && state.isCollecting) startCollect()
      else removeProgress()
    })
  }

  function saveState(options) {
    options = options || {}
    chrome.storage.local.get(STORAGE_KEY, function (res) {
      var previous = (res && res[STORAGE_KEY]) || {}
      var mergedItems = options.replace
        ? Object.assign({}, collectedItems)
        : Object.assign({}, previous.collectedItems || {}, collectedItems)
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          isCollecting: isCollecting,
          selectedType: selectedType || previous.selectedType || '',
          collectedItems: mergedItems,
          frame: previous.frame || { url: location.href, title: document.title },
          updatedAt: new Date().toISOString(),
        },
      })
    })
  }

  function setupCollectorEventTargets() {
    bindCollectorRoot(document)
    scanShadowRoots(document)

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.from(mutation.addedNodes || []).forEach(function (node) {
          if (!node || node.nodeType !== 1) return
          if (node.shadowRoot) bindCollectorRoot(node.shadowRoot)
          scanShadowRoots(node)
        })
      })
    })
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true })

    setInterval(function () {
      scanShadowRoots(document)
    }, 1500)
  }

  function scanShadowRoots(root) {
    if (!root || !root.querySelectorAll) return
    root.querySelectorAll('*').forEach(function (node) {
      if (node.shadowRoot) {
        bindCollectorRoot(node.shadowRoot)
        scanShadowRoots(node.shadowRoot)
      }
    })
  }

  function bindCollectorRoot(root) {
    if (!root || boundRoots.has(root)) return
    boundRoots.add(root)
    root.addEventListener('mouseover', handleCollectorMouseOver, true)
    root.addEventListener('mousemove', handleCollectorMouseMove, true)
    root.addEventListener('mouseout', handleCollectorMouseOut, true)
    root.addEventListener('pointerdown', handleCollectorPick, true)
    root.addEventListener('mousedown', handleCollectorPick, true)
    root.addEventListener('click', handleCollectorClick, true)
  }

  function handleCollectorMouseOver(event) {
    if (!isCollecting || isCollectorNode(event.target)) return
    var target = getEventElement(event)
    if (!target || target === currentTarget) return
    clearHover()
    currentTarget = target
    applyHoverStyle(currentTarget)
    showTooltip(currentTarget, event.clientX, event.clientY)
  }

  function handleCollectorMouseMove(event) {
    if (!isCollecting || !currentTarget) return
    moveTooltip(event.clientX, event.clientY)
  }

  function handleCollectorMouseOut(event) {
    if (!isCollecting || !currentTarget) return
    var related = event.relatedTarget
    if (related && currentTarget.contains && currentTarget.contains(related)) return
    clearHover()
    removeTooltip()
  }

  function handleCollectorClick(event) {
    handleCollectorPick(event)
  }

  function handleCollectorPick(event) {
    if (!isCollecting || isCollectorNode(event.target)) return
    var target = getEventElement(event)
    if (!target) return
    var now = Date.now()
    if (lastPickTarget === target && now - lastPickAt < 600) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    lastPickAt = now
    lastPickTarget = target
    pendingTarget = target
    if (selectedType) {
      var ok = collectElement(selectedType, target)
      if (ok) {
        selectedType = getNextTypeKey()
        saveState()
        renderProgress()
      }
      return
    }
    showTypeModal(target)
  }

  function getEventElement(event) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : []
    for (var i = 0; i < path.length; i++) {
      if (path[i] && path[i].nodeType === 1 && path[i] !== document.documentElement && path[i] !== document.body) {
        return path[i]
      }
    }
    return event.target && event.target.nodeType === 1 ? event.target : null
  }

  function isCollectorNode(node) {
    if (!node || !node.closest) return false
    return !!node.closest('#rpa-collector-modal, #rpa-collector-tooltip, #rpa-collector-progress')
  }

  function clearHover() {
    if (currentTarget) restoreHoverStyle(currentTarget)
    currentTarget = null
  }

  function applyHoverStyle(el) {
    if (!el || !el.style || lockStyleMap.has(el)) return
    if (!hoverStyleMap.has(el)) {
      hoverStyleMap.set(el, {
        outline: el.style.outline,
        outlineOffset: el.style.outlineOffset,
        cursor: el.style.cursor,
      })
    }
    if (el.classList) el.classList.add('rpa-collector-hover')
    el.style.setProperty('outline', '2px dashed #ef4444', 'important')
    el.style.setProperty('outline-offset', '2px', 'important')
    el.style.setProperty('cursor', 'crosshair', 'important')
  }

  function restoreHoverStyle(el) {
    if (!el || !el.style) return
    if (el.classList) el.classList.remove('rpa-collector-hover')
    if (lockStyleMap.has(el)) return
    var prev = hoverStyleMap.get(el)
    if (prev) restoreInlineStyle(el, prev)
    hoverStyleMap.delete(el)
  }

  function applyLockedStyle(el, color) {
    if (!el || !el.style) return
    restoreHoverStyle(el)
    if (!lockStyleMap.has(el)) {
      lockStyleMap.set(el, {
        outline: el.style.outline,
        outlineOffset: el.style.outlineOffset,
        cursor: el.style.cursor,
      })
    }
    if (el.classList) el.classList.add('rpa-collector-locked')
    el.style.setProperty('--rpa-lock-color', color)
    el.style.setProperty('outline', '3px solid ' + color, 'important')
    el.style.setProperty('outline-offset', '2px', 'important')
    el.style.setProperty('cursor', 'crosshair', 'important')
  }

  function restoreLockedStyle(el) {
    if (!el || !el.style) return
    if (el.classList) el.classList.remove('rpa-collector-locked')
    el.style.removeProperty('--rpa-lock-color')
    var prev = lockStyleMap.get(el)
    if (prev) restoreInlineStyle(el, prev)
    lockStyleMap.delete(el)
  }

  function restoreInlineStyle(el, prev) {
    setOrRemoveStyle(el, 'outline', prev.outline)
    setOrRemoveStyle(el, 'outline-offset', prev.outlineOffset)
    setOrRemoveStyle(el, 'cursor', prev.cursor)
  }

  function setOrRemoveStyle(el, name, value) {
    if (value) el.style.setProperty(name, value)
    else el.style.removeProperty(name)
  }

  function showTooltip(el, x, y) {
    var tip = ensureTooltip()
    var rect = el.getBoundingClientRect()
    var classText = Array.from(el.classList || []).slice(0, 4).join('.')
    tip.textContent = el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (classText ? '.' + classText : '') +
      '  ' + Math.round(rect.width) + 'x' + Math.round(rect.height)
    moveTooltip(x, y)
  }

  function ensureTooltip() {
    var tip = document.getElementById('rpa-collector-tooltip')
    if (!tip) {
      tip = document.createElement('div')
      tip.id = 'rpa-collector-tooltip'
      document.documentElement.appendChild(tip)
    }
    return tip
  }

  function moveTooltip(x, y) {
    var tip = document.getElementById('rpa-collector-tooltip')
    if (!tip) return
    var left = Math.min(x + 14, window.innerWidth - tip.offsetWidth - 12)
    var top = Math.min(y + 14, window.innerHeight - tip.offsetHeight - 12)
    tip.style.left = Math.max(8, left) + 'px'
    tip.style.top = Math.max(8, top) + 'px'
  }

  function removeTooltip() {
    var tip = document.getElementById('rpa-collector-tooltip')
    if (tip) tip.remove()
  }

  function showTypeModal(el) {
    removeModal()
    var selectors = generateSelectors(el)
    var modal = document.createElement('div')
    modal.id = 'rpa-collector-modal'
    modal.innerHTML =
      '<h3>这是什么元素？</h3>' +
      '<div class="rpa-modal-subtitle">选择类型后会保存选择器，并给元素加固定标记。</div>' +
      '<div class="type-grid"></div>' +
      '<pre class="preview"></pre>' +
      '<div class="rpa-modal-actions"><button type="button" data-type="cancel">取消</button></div>'

    var grid = modal.querySelector('.type-grid')
    ELEMENT_TYPES.forEach(function (type) {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.type = type.key
      btn.textContent = type.label
      grid.appendChild(btn)
    })
    modal.querySelector('.preview').textContent = JSON.stringify(selectors, null, 2)

    modal.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-type]')
      if (!btn) return
      event.preventDefault()
      event.stopPropagation()
      var typeKey = btn.dataset.type
      if (typeKey === 'cancel') {
        removeModal()
        return
      }
      collectElement(typeKey, pendingTarget || el)
      removeModal()
    })

    document.documentElement.appendChild(modal)
  }

  function removeModal() {
    var modal = document.getElementById('rpa-collector-modal')
    if (modal) modal.remove()
  }

  function collectElement(typeKey, el) {
    if (!el) return false
    var type = ELEMENT_TYPES.find(function (item) { return item.key === typeKey })
    var selectors
    try {
      selectors = generateSelectors(el)
    } catch (err) {
      renderProgress('采集失败：' + (err && err.message ? err.message : '无法生成选择器'))
      return false
    }
    collectedItems[typeKey] = Object.assign({}, selectors, {
      label: type ? type.label : typeKey,
      group: type ? type.group : '',
      required: type ? !!type.required : false,
      optional: type ? !!type.optional : false,
      description: type ? type.description : '',
      color: type ? type.color : '#10b981',
      captured_at: new Date().toISOString(),
      page_url: location.href,
      frame_title: document.title,
    })

    if (type) {
      applyLockedStyle(el, type.color)
      lockedElements.set(typeKey, el)
    }

    saveState()
    renderProgress()
    return true
  }

  function validateCollectedSelectors(items) {
    var report = {
      checked_at: new Date().toISOString(),
      page_url: location.href,
      page_title: document.title,
      results: [],
      summary: {
        total: ELEMENT_TYPES.length,
        hit: 0,
        warn: 0,
        missing: 0,
        uncollected: 0,
      },
    }

    ELEMENT_TYPES.forEach(function (type) {
      var item = items && items[type.key]
      var result = validateSelectorItem(type, item)
      report.results.push(result)
      report.summary[result.status] += 1
      if (result.element) {
        highlightValidationHit(result.element, type.color)
        delete result.element
      }
    })

    return report
  }

  function validateSelectorItem(type, item) {
    if (!item) {
      return {
        type: type.key,
        label: type.label,
        status: 'uncollected',
        message: '未采集',
      }
    }

    var attempts = buildValidationAttempts(item)
    var roots = resolveValidationRoots(item)
    for (var i = 0; i < attempts.length; i++) {
      for (var j = 0; j < roots.length; j++) {
        var found = findByAttempt(roots[j], attempts[i])
        if (found && found.element) {
          return {
            type: type.key,
            label: item.label || type.label,
            status: 'hit',
            method: attempts[i].method,
            selector: attempts[i].selector,
            root_type: describeRoot(roots[j]),
            count: found.count,
            message: '已命中',
            element: found.element,
          }
        }
      }
    }

    var optionalType = !!type.optional
    return {
      type: type.key,
      label: item.label || type.label,
      status: optionalType ? 'warn' : 'missing',
      method: attempts[0] ? attempts[0].method : '',
      selector: attempts[0] ? attempts[0].selector : '',
      root_type: item.root_type || 'document',
      count: 0,
      message: optionalType ? '当前页面无该可选样本' : '未命中',
    }
  }

  function buildValidationAttempts(item) {
    var attempts = []
    if (item.primary) attempts.push({ method: 'primary', selector: item.primary, kind: 'css' })
    ;(item.css_list || []).forEach(function (selector, index) {
      if (selector) attempts.push({ method: 'css_list[' + index + ']', selector: selector, kind: 'css' })
    })
    if (item.xpath) attempts.push({ method: 'xpath', selector: item.xpath, kind: 'xpath' })
    if (item.text_xpath) attempts.push({ method: 'text_xpath', selector: item.text_xpath, kind: 'xpath' })

    var seen = {}
    return attempts.filter(function (attempt) {
      var key = attempt.kind + ':' + attempt.selector
      if (seen[key]) return false
      seen[key] = true
      return true
    })
  }

  function resolveValidationRoots(item) {
    var roots = []
    var rootType = item && item.root_type

    if (rootType === 'shadowRoot') {
      roots = roots.concat(collectOpenShadowRoots(document))
    }

    roots.push(document)
    roots = roots.concat(collectOpenShadowRoots(document))

    var frameDocs = collectSameOriginFrameDocuments(document)
    roots = roots.concat(frameDocs)
    for (var i = 0; i < frameDocs.length; i++) {
      roots = roots.concat(collectOpenShadowRoots(frameDocs[i]))
    }

    return uniqueRoots(roots)
  }

  function collectOpenShadowRoots(root) {
    var roots = []
    if (!root || !root.querySelectorAll) return roots
    root.querySelectorAll('*').forEach(function (node) {
      if (node.shadowRoot) {
        roots.push(node.shadowRoot)
        roots = roots.concat(collectOpenShadowRoots(node.shadowRoot))
      }
    })
    return roots
  }

  function collectSameOriginFrameDocuments(root) {
    var docs = []
    if (!root || !root.querySelectorAll) return docs
    root.querySelectorAll('iframe').forEach(function (frame) {
      try {
        if (frame.contentDocument) docs.push(frame.contentDocument)
      } catch (_) {}
    })
    return docs
  }

  function uniqueRoots(roots) {
    var result = []
    roots.forEach(function (root) {
      if (root && result.indexOf(root) === -1) result.push(root)
    })
    return result
  }

  function findByAttempt(root, attempt) {
    if (!root || !attempt || !attempt.selector) return null
    if (attempt.kind === 'xpath') return findByXPath(root, attempt.selector)
    return findByCss(root, attempt.selector)
  }

  function findByCss(root, selector) {
    try {
      var nodes = root.querySelectorAll(selector)
      return { element: nodes[0] || null, count: nodes.length }
    } catch (_) {
      return null
    }
  }

  function findByXPath(root, xpath) {
    try {
      var doc = root.ownerDocument || document
      var snapshot = doc.evaluate(xpath, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
      return {
        element: snapshot.snapshotItem(0),
        count: snapshot.snapshotLength,
      }
    } catch (_) {
      return null
    }
  }

  function describeRoot(root) {
    if (!root) return ''
    if (root.nodeType === 11) return 'shadowRoot'
    if (root.nodeType === 9) return root === document ? 'document' : 'iframe'
    return root.tagName ? root.tagName.toLowerCase() : 'root'
  }

  function highlightValidationHit(el, color) {
    if (!el || !el.style) return
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }) } catch (_) {}
    el.classList.add('rpa-collector-verify-hit')
    el.style.setProperty('--rpa-verify-color', color || '#2563eb')
    setTimeout(function () {
      if (!el || !el.classList) return
      el.classList.remove('rpa-collector-verify-hit')
      el.style.removeProperty('--rpa-verify-color')
    }, 2200)
  }

  function renderProgress(errorText) {
    if (!isCollecting) {
      removeProgress()
      return
    }
    var progress = document.getElementById('rpa-collector-progress')
    if (!progress) {
      progress = document.createElement('div')
      progress.id = 'rpa-collector-progress'
      document.documentElement.appendChild(progress)
    }
    var count = ELEMENT_TYPES.filter(function (type) { return collectedItems[type.key] }).length
    var pct = Math.round(count / ELEMENT_TYPES.length * 100)
    var selected = ELEMENT_TYPES.find(function (type) { return type.key === selectedType })
    progress.innerHTML =
      '<div class="rpa-progress-title"><span>DOM 采集</span><span>' + count + '/' + ELEMENT_TYPES.length + '</span></div>' +
      '<div class="rpa-progress-tip">' + (isCollecting ? '当前采集：' + (selected ? selected.label : '未选择') : '已停止') + '</div>' +
      (errorText ? '<div class="rpa-progress-error">' + escapeHtml(errorText) + '</div>' : '') +
      '<div class="rpa-progress-bar"><div class="rpa-progress-fill" style="width:' + pct + '%"></div></div>'
  }

  function removeProgress() {
    var progress = document.getElementById('rpa-collector-progress')
    if (progress) progress.remove()
  }

  function generateSelectors(el) {
    var tag = el.tagName.toLowerCase()
    var rawClasses = Array.from(el.classList || []).filter(function (item) {
      return item.indexOf('rpa-collector-') !== 0
    })
    var stableClasses = unique(rawClasses.map(normalizeClass).filter(Boolean))
    var attrs = collectStableAttributes(el)
    var cssSelectors = []

    if (el.id) cssSelectors.push('#' + cssEscape(el.id))
    attrs.forEach(function (attr) {
      cssSelectors.push(tag + '[' + attr.name + '="' + cssEscapeAttr(attr.value) + '"]')
    })
    if (stableClasses.length) {
      cssSelectors.push(tag + stableClasses.map(function (c) { return '[class*="' + cssEscapeAttr(c) + '"]' }).join(''))
    }
    if (rawClasses.length) {
      cssSelectors.push(tag + rawClasses.map(function (c) { return '.' + cssEscape(c) }).join(''))
    }
    cssSelectors.push(buildCssPath(el))
    cssSelectors = unique(cssSelectors.filter(Boolean))

    var text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    var textXPath = null
    if (text && /^(button|span|a|div)$/i.test(tag)) {
      textXPath = '//' + tag + '[contains(normalize-space(.),"' + escapeXPathText(text.slice(0, 18)) + '")]'
    }

    var primary = pickUniqueSelector(cssSelectors, el) || cssSelectors[0] || null
    var root = el.getRootNode && el.getRootNode()
    return {
      primary: primary,
      css_list: cssSelectors,
      xpath: generateXPath(el),
      text_xpath: textXPath,
      tag: tag,
      id: el.id || null,
      classes: rawClasses,
      stable_classes: stableClasses,
      attributes: attrs,
      text: text || null,
      root_type: root && root.toString && root.toString() === '[object ShadowRoot]' ? 'shadowRoot' : 'document',
      sample_html: (el.outerHTML || '').slice(0, 500),
      dom_path: buildDomPath(el),
    }
  }

  function buildDomPath(el) {
    var parts = []
    var curr = el
    while (curr && curr.nodeType === 1 && curr !== document.documentElement) {
      var tag = curr.tagName.toLowerCase()
      var segment = tag
      if (curr.id) segment += '#' + curr.id
      else {
        var cls = Array.from(curr.classList || []).map(normalizeClass).filter(Boolean)[0]
        if (cls) segment += '.' + cls
      }
      parts.unshift(segment)
      curr = curr.parentElement
      if (parts.length >= 8) break
    }
    return parts.join(' > ')
  }

  function normalizeClass(value) {
    var cls = String(value || '').trim()
    if (!cls) return ''
    var match = cls.match(/^([a-zA-Z_-]+?)-[a-zA-Z0-9_-]{5,}$/)
    if (match) return match[1].replace(/-$/, '')
    if (/^[a-zA-Z0-9_-]{8,}$/.test(cls) && /[A-Z]/.test(cls) && /\d/.test(cls)) return ''
    return cls
  }

  function collectStableAttributes(el) {
    var names = ['data-testid', 'data-test', 'data-e2e', 'data-role', 'role', 'aria-label', 'placeholder', 'name', 'type', 'title']
    return names.map(function (name) {
      var value = el.getAttribute && el.getAttribute(name)
      if (!value) return null
      value = String(value).trim()
      if (!value || value.length > 80) return null
      return { name: name, value: value }
    }).filter(Boolean)
  }

  function buildCssPath(el) {
    var parts = []
    var curr = el
    while (curr && curr.nodeType === 1 && curr !== document.body && curr !== document.documentElement) {
      var tag = curr.tagName.toLowerCase()
      var segment = tag
      if (curr.id) {
        segment += '#' + cssEscape(curr.id)
        parts.unshift(segment)
        break
      }
      var stable = Array.from(curr.classList || []).map(normalizeClass).filter(Boolean)[0]
      if (stable) segment += '[class*="' + cssEscapeAttr(stable) + '"]'
      else {
        var siblings = curr.parentElement ? Array.from(curr.parentElement.children).filter(function (node) {
          return node.tagName === curr.tagName
        }) : []
        if (siblings.length > 1) segment += ':nth-of-type(' + (siblings.indexOf(curr) + 1) + ')'
      }
      parts.unshift(segment)
      curr = curr.parentElement
      if (parts.length >= 5) break
    }
    return parts.join(' > ')
  }

  function generateXPath(el) {
    if (el.id) return '//*[@id="' + escapeXPathText(el.id) + '"]'

    var stableClasses = Array.from(el.classList || []).map(normalizeClass).filter(Boolean)
    if (stableClasses.length) {
      return '//' + el.tagName.toLowerCase() + '[contains(@class,"' + escapeXPathText(stableClasses[0]) + '")]'
    }

    var path = ''
    var curr = el
    while (curr && curr.tagName) {
      var tag = curr.tagName.toLowerCase()
      if (tag === 'html' || tag === 'body') break
      var siblings = curr.parentNode ? Array.from(curr.parentNode.children).filter(function (node) {
        return node.tagName === curr.tagName
      }) : []
      var idx = siblings.indexOf(curr) + 1
      path = '/' + tag + '[' + idx + ']' + path
      curr = curr.parentNode
    }
    return '/' + path.replace(/^\/+/, '')
  }

  function pickUniqueSelector(selectors, el) {
    var root = (el && el.getRootNode && el.getRootNode()) || document
    for (var i = 0; i < selectors.length; i++) {
      try {
        if (root.querySelectorAll && root.querySelectorAll(selectors[i]).length === 1) return selectors[i]
      } catch (_) {}
    }
    return ''
  }

  function unique(list) {
    return list.filter(function (item, index, arr) {
      return item && arr.indexOf(item) === index
    })
  }

  function getNextTypeKey() {
    for (var i = 0; i < ELEMENT_TYPES.length; i++) {
      if (!collectedItems[ELEMENT_TYPES[i].key]) return ELEMENT_TYPES[i].key
    }
    return selectedType || ELEMENT_TYPES[0].key
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value)
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return '\\' + ch })
  }

  function cssEscapeAttr(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  function escapeXPathText(value) {
    return String(value).replace(/"/g, '\\"')
  }
})()
