// V2.0 采集探针: 仅 getMessages + toConversationEvent,发送方法已于 W5 移除
;(function () {
  'use strict'

  // V1.9 抖音私信 Adapter（im.douyin.com）。
  // 与 douyinLaike adapter 完全独立的 selectors。

  var Dom      = window.RpaDomUtils
  var Helpers  = window.RpaAdapterHelpers
  var Registry = window.RpaAdapterRegistry
  var Tracer   = window.RpaLkTracer
  var C        = window.RpaConstants
  if (!Dom || !Helpers || !Registry || !Tracer || !C) {
    throw new Error('[V19] douyin private-message adapter dependencies missing')
  }

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  var SELECTORS = {
    contactItem: [
      '[data-qa-id="qa-conversation-chat-item"]',
      '[class*="conversation"][class*="item"]',
      '[class*="contactCard"]',
      '[role="option"]',
      '[role="listitem"]',
    ],
    activeContactItem: [
      '[data-qa-id="qa-conversation-chat-item"][class*="active"]',
      '[data-qa-id="qa-conversation-chat-item"][class*="selected"]',
      '[class*="conversation"][class*="active"]',
    ],
    nickname: [
      '[class*="nickname"]',
      '[class*="userName"]',
      '[class*="title"]',
    ],
    sessionTitle: [
      // 客户昵称:会话头 msgTitle 里的 name(来客 life.douyin 实测 span.name-*)
      'div[class*="msgTitle"] span[class*="name"]',
      'div[class*="msgTitle"] [class*="name"]',
      // 不再退回 div.userInfo —— 该布局下那是"登录客服自己"的信息区,会误读成客服名
      '[class*="conversation-header"] [class*="title"]',
      '[class*="header-title"]',
    ],
    unreadBadge: [
      'sup[class*="byted-badge-type-danger"]',
      'sup[class*="byted"]',
      '[aria-label*="未读"]',
      '[class*="badge"][class*="count"]',
      '[class*="unread"]',
    ],
    incomingBubble: [
      'div[class*="my-4"]',
      'div[class*="chatd-bubble-main--other"]',
      'div[class*="chatd-bubble--other"]',
      'div[class*="bubble"][class*="other"]',
      'div[class*="msg-item"][class*="left"]',
    ],
    selfBubble: [
      'div[class*="my-4"]',
      'div[class*="chatd-bubble-main--self"]',
      'div[class*="chatd-bubble--self"]',
      'div[class*="bubble"][class*="self"]',
      'div[class*="msg-item"][class*="right"]',
    ],
    bubbleText: [
      'div[class*="px-3"][class*="py-2"][class*="break-all"][class*="whitespace"]',
      '[class*="chatd-bubble-main--other"]',
      '[class*="text-content"]',
      '[class*="bubble-main"]',
    ],
    input: [
      'textarea[placeholder*="回复内容"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="输入"]',
      '[contenteditable="true"][class*="editor"]',
      '[class*="input"] textarea',
      'textarea',
    ],
    sendButton: [
      'button[class*="byted-btn"]:not([disabled])',
      'button[type="submit"]',
      '[class*="send-button"]:not([disabled])',
      '[class*="sendBtn"]:not([disabled])',
    ],
  }

  var PAGE_PATTERNS = [
    /life\.douyin\.com\/cs\/web\/clue_private_message\/chat\/session/,
    /life\.douyin\.com\/cs\/web\/.*private_message/,
    /im\.douyin\.com/,
    /\.douyin\.com\/.*\/im\//,
  ]

  function matchPage(loc) {
    var url = (loc && loc.href) || (typeof location !== 'undefined' ? location.href : '')
    for (var i = 0; i < PAGE_PATTERNS.length; i++) {
      if (PAGE_PATTERNS[i].test(url)) return true
    }
    return false
  }

  function _detectActiveItem() {
    return Dom.queryFirst(SELECTORS.activeContactItem)
  }

  function _parseContact(item) {
    if (!item) return null
    var nicknameEl = Dom.queryFirst(SELECTORS.nickname, item)
    var nickname   = Dom.getText(nicknameEl)
    var badgeEl    = Dom.queryFirst(SELECTORS.unreadBadge, item)
    var unreadStr  = Dom.getText(badgeEl)
    var unread     = parseInt(unreadStr, 10) || (badgeEl ? 1 : 0)
    return Helpers.buildRawSession({
      raw_id:    Dom.getAttr(item, ['data-conversation-id', 'data-session-id', 'data-id', 'data-qa-id']),
      nickname:  nickname,
      avatar:    (item.querySelector('img') || {}).src || null,
      unread_count: unread,
      dom_ref:   item,
      raw_payload: { rect: Dom.readRect(item) },
    })
  }

  async function detectSessions() {
    var items = Dom.queryAll(SELECTORS.contactItem).filter(Dom.isVisible)
    Tracer.log({
      lk_code: LK.SESSION_LIST, stage: Stage.SESSION,
      status:  items.length ? Status.SUCCESS : Status.SKIPPED,
      message: 'douyin-private contact items: ' + items.length,
    })
    return items.map(_parseContact).filter(Boolean)
  }

  async function selectTriggerSession(sessions) {
    if (!sessions || !sessions.length) return null
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].unread_count > 0) return sessions[i]
    }
    var active = _detectActiveItem()
    if (active) {
      for (var j = 0; j < sessions.length; j++) if (sessions[j].dom_ref === active) return sessions[j]
    }
    return sessions[0] || null
  }

  async function switchSession(session) {
    if (!session || !session.dom_ref) return { ok: false, reason: 'no-dom-ref' }
    Dom.simulateClick(session.dom_ref)
    var ok = await Dom.waitFor(function () { return _detectActiveItem() === session.dom_ref }, { timeoutMs: 3000 })
    Tracer.log({
      lk_code: LK.SESSION_SWITCH, stage: Stage.SESSION,
      status:  ok ? Status.SUCCESS : Status.FAILED,
      message: 'douyin-private switch session',
      detail:  { ok: ok, raw_id: session.raw_id },
    })
    return { ok: ok, reason: ok ? null : 'switch-timeout' }
  }

  async function confirmActiveSession(session) {
    return !!session && session.dom_ref === _detectActiveItem()
  }

  async function getMessages(session) {
    void session
    var collectAt = new Date()
    // life.douyin.com 私信页(含 clue 与非 clue): 消息行 div.my-4 + 隐藏精确时间,统一走精确时间扫描
    var lifeItems = Dom.queryAll('div[class*="my-4"]').filter(Dom.isVisible)
    if (lifeItems.length) {
      var lifeList = _scanLifeMessages(lifeItems, collectAt)
      Tracer.log({
        lk_code: LK.MSG_SCAN, stage: Stage.MESSAGE, status: Status.SUCCESS,
        message: 'douyin-private life messages scanned',
        detail:  { total: lifeList.length },
      })
      return lifeList
    }
    // 老版气泡结构(im.douyin 等)兜底: 逐条尽力提取精确/相对时间,取不到才标 estimated,不冒充采集当刻
    var bubbleNodes = _collectBubbleNodes()
    var currentAnchor = null
    var anchorOffset = 0
    var lastOccurredAt = 0
    var messages = []
    bubbleNodes.forEach(function (el) {
      var text = _extractMessageText(el) || Dom.getText(el)
      if (!text) return
      var preciseTimeText = _extractPreciseMessageTime(el)
      var timeText = preciseTimeText || _extractMessageTime(el)
      var occurred = _resolveOccurredAt(timeText, currentAnchor, anchorOffset, collectAt, lastOccurredAt)
      if (!timeText && currentAnchor) anchorOffset += 1
      lastOccurredAt = occurred.ms
      var direction = _isOutbound(el) ? 'outbound' : 'inbound'
      messages.push({
        direction: direction,
        owner: direction === 'outbound' ? 'self' : 'user',
        message_type: direction === 'outbound' ? 'self_reply' : 'user_text',
        type: 'text',
        content: text,
        timestamp: occurred.iso,
        time_meta: occurred,
        raw_payload: {
          selector: direction === 'outbound' ? 'selfBubble' : 'incomingBubble',
          rect: Dom.readRect(el),
          time_text: timeText || '',
          time_source: preciseTimeText ? 'precise-invisible' : occurred.source,
          time_estimated: occurred.estimated,
        },
      })
    })
    Tracer.log({
      lk_code: LK.MSG_SCAN, stage: Stage.MESSAGE, status: Status.SUCCESS,
      message: 'douyin-private bubble messages scanned',
      detail:  { total: messages.length },
    })
    return messages
  }

  function _scanLifeMessages(items, collectAt) {
    var currentAnchor = null
    var anchorOffset = 0
    var lastOccurredAt = 0
    var pendingDivider = ''
    var currentSegmentIso = null
    var list = []
    items.forEach(function (el) {
      var text = _extractMessageText(el)
      if (!text) {
        var systemText = Dom.getText(el)
        var anchor = _parseOccurredAt(systemText, collectAt)
        currentAnchor = anchor.ok ? anchor : null
        anchorOffset = 0
        // 抖音时间分隔条原文(仅时间类),挂到其后第一条消息,展示端原样还原,与平台一致
        // W17:段时间条(抖音超5分钟一条)解析为 segment_at,段内消息同值,作段间排序键(纯排序,非真实时间)
        if (anchor.ok) { pendingDivider = String(systemText || '').trim(); currentSegmentIso = anchor.iso }
        return
      }
      var preciseTimeText = _extractPreciseMessageTime(el)
      var timeText = preciseTimeText || _extractMessageTime(el)
      var occurred = _resolveOccurredAt(timeText, currentAnchor, anchorOffset, collectAt, lastOccurredAt)
      if (!timeText && currentAnchor) anchorOffset += 1
      lastOccurredAt = occurred.ms
      var direction = _isOutbound(el) ? 'outbound' : 'inbound'
      list.push({
        direction: direction,
        owner: direction === 'outbound' ? 'self' : 'user',
        message_type: 'user_text',
        type: 'text',
        content: text,
        agent_name: direction === 'outbound' ? _extractAgentName(el) : '',
        timestamp: occurred.iso,
        time_meta: occurred,
        segment_at: currentSegmentIso,
        raw_payload: {
          selector: 'life-message-item',
          rect: Dom.readRect(el),
          time_text: timeText || '',
          time_source: preciseTimeText ? 'precise-invisible' : occurred.source,
          time_estimated: occurred.estimated,
          divider_text: pendingDivider || undefined,
          segment_at: currentSegmentIso || undefined,
        },
      })
      pendingDivider = ''
    })
    // W17-A:无 segment_at 的段(无时间条),取段内首条 inbound 的 occurred_at 作兜底排序值(纯排序);
    // 整段无 inbound→维持 null(由 position 兜底)。标 segment_fallback 便于排查(C)。
    var s = 0
    while (s < list.length) {
      if (list[s].segment_at != null) { s++; continue }
      var e = s
      while (e < list.length && list[e].segment_at == null) e++
      var fb = null
      for (var f = s; f < e; f++) {
        if (list[f].direction === 'inbound' && list[f].time_meta && list[f].time_meta.iso) { fb = list[f].time_meta.iso; break }
      }
      if (fb) for (var g = s; g < e; g++) {
        list[g].segment_at = fb
        list[g].raw_payload.segment_at = fb
        list[g].raw_payload.segment_fallback = 'inbound-occurred'
      }
      s = e
    }
    return list
  }

  function _collectBubbleNodes() {
    var incoming = Dom.queryAll(SELECTORS.incomingBubble).filter(Dom.isVisible)
    var outgoing = Dom.queryAll(SELECTORS.selfBubble).filter(Dom.isVisible)
    var nodes = []
    incoming.concat(outgoing).forEach(function (el) {
      if (nodes.indexOf(el) === -1) nodes.push(el)
    })
    nodes.sort(function (a, b) {
      if (a === b || !a.compareDocumentPosition) return 0
      var pos = a.compareDocumentPosition(b)
      if (pos & 4) return -1 // DOCUMENT_POSITION_FOLLOWING: b 在 a 之后
      if (pos & 2) return 1  // DOCUMENT_POSITION_PRECEDING: b 在 a 之前
      return 0
    })
    return nodes
  }

  function _extractMessageText(el) {
    var text = Dom.getTextByXpath(el, './/div[contains(@class,"px-3") and contains(@class,"py-2")]')
    if (text) return text
    var textEl = Dom.queryFirst(SELECTORS.bubbleText, el)
    return Dom.getText(textEl)
  }

  function _findMessageTextNode(el) {
    if (!el.querySelector) return null
    return el.querySelector('div[class*="px-3"][class*="py-2"]') ||
      Dom.queryFirst(SELECTORS.bubbleText, el)
  }

  function _extractAgentName(el) {
    // outbound 消息行内的客服名:p.text-right.text-gray-2(内含时间 span,需排除,只取文本节点)
    if (!el || !el.querySelector) return ''
    var p = el.querySelector('p[class*="text-right"][class*="text-gray"]') || el.querySelector('p[class*="text-right"]')
    if (!p) return ''
    var name = ''
    var nodes = p.childNodes || []
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3) name += nodes[i].textContent || ''
    }
    name = String(name || '').trim()
    if (!name) name = String(Dom.getText(p) || '').trim()
    return name
  }

  function _extractMessageTime(el) {
    return Dom.getTextByXpath(el, './/span[contains(@class,"text-xs")]') ||
      Dom.getTextByXpath(el, './/p[contains(@class,"text")]//span')
  }

  function _extractPreciseMessageTime(el) {
    var textNode = _findMessageTextNode(el)
    var scope = _findMessageColumn(textNode) || el
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('*') : []
    for (var i = 0; i < nodes.length; i++) {
      var cls = String(nodes[i].className || '')
      if (!/invisible/.test(cls) || !/whitespace-nowrap/.test(cls) || !/absolute/.test(cls)) continue
      var text = Dom.getText(nodes[i])
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(text)) return text
    }
    return ''
  }

  function _findMessageColumn(node) {
    var current = node
    while (current && current.parentElement) {
      current = current.parentElement
      var cls = String(current.className || '')
      if (/flex-col/.test(cls) && /flex-1/.test(cls)) return current
    }
    return null
  }

  function _isOutbound(el) {
    var row = el.querySelector('[class*="px-4"][class*="flex"][class*="relative"]') || el
    var cls = String(row.className || '')
    if (/rightMsg|flex-row-reverse|self|right/i.test(cls)) return true
    if (row.querySelector('p[class*="text-right"]')) return true
    return false
  }

  function _parseOccurredAt(value, collectAt) {
    collectAt = collectAt instanceof Date ? collectAt : new Date()
    if (!value) return { ok: false, iso: collectAt.toISOString(), ms: collectAt.getTime(), source: 'fallback', estimated: true, raw: '' }
    var text = String(value).trim()
    var match = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (match) {
      return _timeResult(new Date(
        Number(match[1]), Number(match[2]) - 1, Number(match[3]),
        Number(match[4]), Number(match[5]), Number(match[6] || 0)
      ), 'absolute', false, text)
    }
    match = text.match(/(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (match) {
      return _timeResult(new Date(
        collectAt.getFullYear(), Number(match[1]) - 1, Number(match[2]),
        Number(match[3]), Number(match[4]), Number(match[5] || 0)
      ), 'absolute-partial', true, text)
    }
    match = text.match(/(\d{1,2})月(\d{1,2})日\s*(上午|下午|晚上|中午|凌晨|早上)?\s*(\d{1,2})(?::|：|点)(\d{1,2})?/)
    if (match) {
      return _timeResult(new Date(
        collectAt.getFullYear(), Number(match[1]) - 1, Number(match[2]),
        _normalizeHour(Number(match[4]), match[3]), Number(match[5] || 0), 0
      ), 'absolute-partial', true, text)
    }
    match = text.match(/^(今天|昨天)\s*(上午|下午|晚上|中午|凌晨|早上)?\s*(\d{1,2})(?::|：|点)(\d{1,2})?/)
    if (match) {
      var day = new Date(collectAt.getFullYear(), collectAt.getMonth(), collectAt.getDate())
      if (match[1] === '昨天') day.setDate(day.getDate() - 1)
      day.setHours(_normalizeHour(Number(match[3]), match[2]), Number(match[4] || 0), 0, 0)
      return _timeResult(day, 'relative-day', true, text)
    }
    match = text.match(/^(上午|下午|晚上|中午|凌晨|早上)?\s*(\d{1,2})(?::|：|点)(\d{1,2})?$/)
    if (match) {
      var sameDay = new Date(collectAt.getFullYear(), collectAt.getMonth(), collectAt.getDate())
      sameDay.setHours(_normalizeHour(Number(match[2]), match[1]), Number(match[3] || 0), 0, 0)
      return _timeResult(sameDay, 'relative-day', true, text)
    }
    match = text.match(/(\d+)\s*秒前/)
    if (match) return _timeResult(new Date(collectAt.getTime() - Number(match[1]) * 1000), 'relative-offset', true, text)
    match = text.match(/(\d+)\s*分钟前/)
    if (match) return _timeResult(new Date(collectAt.getTime() - Number(match[1]) * 60000), 'relative-offset', true, text)
    match = text.match(/(\d+)\s*小时前/)
    if (match) return _timeResult(new Date(collectAt.getTime() - Number(match[1]) * 3600000), 'relative-offset', true, text)
    if (/刚刚|刚才/.test(text)) return _timeResult(collectAt, 'relative-now', true, text)
    var d = new Date(text)
    if (!isNaN(d.getTime())) return _timeResult(d, 'absolute-native', false, text)
    return { ok: false, iso: collectAt.toISOString(), ms: collectAt.getTime(), source: 'fallback', estimated: true, raw: text }
  }

  function _resolveOccurredAt(timeText, anchor, anchorOffset, collectAt, lastOccurredAt) {
    var parsed = _parseOccurredAt(timeText, collectAt)
    // 有真实时间(客户隐藏精确时间): 采用之;仅当 ≤ 上一条才单调校正防倒挂
    if (timeText && parsed.ok) {
      if (lastOccurredAt && parsed.ms <= lastOccurredAt) {
        return _timeResult(new Date(lastOccurredAt + 1000), parsed.source + '+monotonic', true, parsed.raw)
      }
      return parsed
    }
    // 读不到真实时间(客服消息、或读不到隐藏时间的客户消息): 继承上一条 +1s 保证排序,绝不用采集当刻冒充
    if (lastOccurredAt) {
      return _timeResult(new Date(lastOccurredAt + 1000), 'inherited', true, timeText || '')
    }
    // 会话开头无上一条: 退分隔条锚点,再退采集当刻
    if (anchor && anchor.ok) {
      return _timeResult(new Date(anchor.ms + (anchorOffset + 1) * 1000), 'anchor', true, anchor.raw)
    }
    var fb = _timeResult(collectAt, 'fallback', true, timeText || '')
    fb.ok = false
    return fb
  }

  function _normalizeHour(hour, period) {
    if (/下午|晚上/.test(period || '') && hour < 12) return hour + 12
    if (/中午/.test(period || '') && hour < 11) return hour + 12
    if (/凌晨/.test(period || '') && hour === 12) return 0
    return hour
  }

  function _timeResult(date, source, estimated, raw) {
    return {
      ok: !isNaN(date.getTime()),
      iso: date.toISOString(),
      ms: date.getTime(),
      source: source,
      estimated: !!estimated,
      raw: raw || '',
    }
  }

  function _normalizeOccurredAt(value) {
    return _parseOccurredAt(value, new Date()).iso
  }

  function classifyMessage(raw) { return Helpers.classifyByDirection(raw) }

  function toConversationEvent(rawMsg, sessionInfo) {
    sessionInfo = sessionInfo || {}
    var normalized = classifyMessage(rawMsg)
    var direction = (normalized && normalized.direction) || rawMsg.direction || 'inbound'
    var content = rawMsg.content || rawMsg.text || ''
    // W17:outbound 无精确时间 → occurred_at=NULL,不存合成假时间;inbound 保持 W12.6 精确时间逻辑
    var occurredAt = direction === 'outbound'
      ? null
      : (rawMsg.time_meta && rawMsg.time_meta.iso
          ? rawMsg.time_meta.iso
          : _normalizeOccurredAt(rawMsg.timestamp || rawMsg.time || rawMsg.occurred_at))
    var fallbackName = sessionInfo.nickname || ''
    if (!fallbackName || fallbackName === 'unknown') return null
    var conversationId = sessionInfo.conversationId || sessionInfo.conversation_id || sessionInfo.session_id || 'douyin-private-' + Dom.simpleHash(fallbackName)
    return {
      platform: 'douyin',
      platform_page: 'private-message',
      conversation_id: conversationId,
      message_id: Dom.synthMessageId({
        conversationId: conversationId,
        direction: direction,
        text: content,
        occurredAt: occurredAt,
      }),
      direction: direction,
      sender_nickname: direction === 'inbound' ? (sessionInfo.nickname || '') : (rawMsg.agent_name || sessionInfo.accountNickname || ''),
      account_biz_id:   sessionInfo.accountBizId || '',
      account_nickname: sessionInfo.accountNickname || '',
      content_type: rawMsg.type || 'text',
      content_text: content,
      content_url: rawMsg.url || null,
      occurred_at: occurredAt,
      segment_at: rawMsg.segment_at || null,
      raw_snapshot: rawMsg.raw_payload || null,
    }
  }

  function buildRuntimeContext() {
    return {
      platform: 'douyin',
      pageKey:  'douyin-private-message',
      url:      typeof location !== 'undefined' ? location.href : '',
      sessionTitle: Dom.getText(Dom.queryFirst(SELECTORS.sessionTitle)),
    }
  }

  Registry.register({
    adapterKey:           'douyin/private-message',
    platform:             'douyin',
    pageKey:              'douyin-private-message',
    selectors:            SELECTORS,
    matchPage:            matchPage,
    detectSessions:       detectSessions,
    selectTriggerSession: selectTriggerSession,
    switchSession:        switchSession,
    confirmActiveSession: confirmActiveSession,
    getMessages:          getMessages,
    classifyMessage:      classifyMessage,
    toConversationEvent:  toConversationEvent,
    buildRuntimeContext:  buildRuntimeContext,
  })

})()
