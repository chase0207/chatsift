// V2.0 采集探针: 仅 getMessages + toConversationEvent,发送方法已于 W5 移除
;(function () {
  'use strict'

  // V1.9 抖音来客消息 Adapter（V1.9_技术方案 § 6 / V1.9_Runtime_Protocol § 5）
  //
  // 页面：fxg.jinritemai.com 系（抖店）来客消息。
  // 与 V1.x content_legacy 的 PLATFORM_SELECTORS.douyinLaike 选择器一致，但完全独立：
  // V1.9 路径修改 selector 不影响 legacy，反之亦然。

  var Dom      = window.RpaDomUtils
  var Helpers  = window.RpaAdapterHelpers
  var Registry = window.RpaAdapterRegistry
  var Tracer   = window.RpaLkTracer
  var C        = window.RpaConstants
  if (!Dom || !Helpers || !Registry || !Tracer || !C) {
    throw new Error('[V19] douyin laike-message adapter dependencies missing')
  }

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  var SELECTORS = {
    contactItem: [
      '#list-container > div',
      '[class*="conversation"][class*="item"]',
      '[class*="contactCard"]',
      '[class*="chat-item"]',
      '[class*="contactCard-"]',
    ],
    activeContactItem: [
      '[class*="contactCard"][class*="active"]',
      '[class*="contactCard"][class*="selected"]',
      '[class*="conversation"][class*="active"]',
    ],
    nickname: [
      '[class*="nickname"]',
      '[class*="userName"]',
      '[class*="title"]',
    ],
    sessionTitle: [
      'div[class*="msgTitle"] span[class*="name"]',
      'div[class*="userInfo"] [class*="name"]',
      '[class*="sessionTitle"]',
      '[class*="header-title"]',
      '[class*="customer-info"] [class*="title"]',
    ],
    unreadBadge: [
      'sup[class*="badge"]',
      '[class*="badge"][class*="count"]',
      '[class*="unread"]',
    ],
    incomingBubble: [
      'div[class*="my-4"]',
      'div[class*="chatd-bubble-main--other"]',
      'div[class*="chatd-bubble--other"]',
      'div[class*="bubble"][class*="other"]',
      'div[class*="msg"][class*="other"]',
    ],
    selfBubble: [
      'div[class*="my-4"]',
      'div[class*="chatd-bubble-main--self"]',
      'div[class*="chatd-bubble--self"]',
      'div[class*="bubble"][class*="self"]',
    ],
    bubbleText: [
      'div[class*="px-3"][class*="py-2"][class*="break-all"][class*="whitespace"]',
      '[class*="chatd-bubble-main--other"]',
      '[style*="white-space: pre-wrap"]',
      '[class*="bubble-main"]',
    ],
    bubbleTime: [
      '[class*="time"]',
      '[class*="timestamp"]',
    ],
    input: [
      'textarea[placeholder*="回复内容"]',
      'textarea[placeholder*="发送消息"]',
      'textarea[placeholder*="输入"]',
      'textarea[placeholder*="回复"]',
      '[class*="inputTextarea"] textarea',
      '[class*="input"] textarea',
      '[class*="editor"] textarea',
      'textarea',
    ],
    sendButton: [
      'button[class*="byted-btn"]:not([disabled])',
      'button[type="submit"]',
      '[class*="sendBtn"]:not([disabled])',
      '[class*="send-btn"]:not([disabled])',
    ],
  }

  var PAGE_PATTERNS = [
    /life\.douyin\.com\/cs\/web\/(?!.*clue_private_message)/,
    /fxg\.jinritemai\.com.*\/im\//,
    /fxg\.jinritemai\.com.*\/cs\//,
    /fxg\.jinritemai\.com.*\/laike/,
    /fxg\.jinritemai\.com.*\/message/,
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
      raw_id:    Dom.getAttr(item, ['data-conversation-id', 'data-session-id', 'data-id']),
      nickname:  nickname,
      avatar:    (item.querySelector('img') || {}).src || null,
      unread_count: unread,
      dom_ref:   item,
      raw_payload: { rect: Dom.readRect(item), nicknameSelectorHit: !!nicknameEl },
    })
  }

  async function detectSessions() {
    var items = Dom.queryAll(SELECTORS.contactItem)
    var visible = []
    for (var i = 0; i < items.length; i++) {
      if (!Dom.isVisible(items[i])) continue
      visible.push(items[i])
    }
    Tracer.log({
      lk_code:       LK.SESSION_LIST,
      stage:         Stage.SESSION,
      status:        visible.length ? Status.SUCCESS : Status.SKIPPED,
      message:       'douyin-laike contact items: ' + visible.length,
      detail:        { total: items.length, visible: visible.length },
    })
    var sessions = []
    for (var j = 0; j < visible.length; j++) {
      var s = _parseContact(visible[j])
      if (s) sessions.push(s)
    }
    return sessions
  }

  async function selectTriggerSession(sessions) {
    if (!sessions || !sessions.length) return null
    // 优先级：有未读 → 第一个；否则当前选中
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].unread_count > 0) return sessions[i]
    }
    var active = _detectActiveItem()
    if (active) {
      for (var j = 0; j < sessions.length; j++) {
        if (sessions[j].dom_ref === active) return sessions[j]
      }
    }
    return sessions[0] || null
  }

  async function switchSession(session) {
    if (!window.RpaFeatureFlags || !window.RpaFeatureFlags.get('auto_switch_session')) return { ok: false, reason: 'auto-switch-disabled' }
    if (!session || !session.dom_ref) return { ok: false, reason: 'no-dom-ref' }
    Dom.simulateClick(session.dom_ref)
    var ok = await Dom.waitFor(function () {
      var active = _detectActiveItem()
      return active === session.dom_ref
    }, { timeoutMs: 3000 })
    Tracer.log({
      lk_code:       LK.SESSION_SWITCH,
      stage:         Stage.SESSION,
      status:        ok ? Status.SUCCESS : Status.FAILED,
      message:       'douyin-laike switch session',
      detail:        { ok: ok, raw_id: session.raw_id, nickname: session.nickname },
    })
    return { ok: ok, reason: ok ? null : 'switch-timeout' }
  }

  async function confirmActiveSession(session) {
    if (!session || !session.dom_ref) return false
    var active = _detectActiveItem()
    return active === session.dom_ref
  }

  async function getMessages(session) {
    void session
    if (/life\.douyin\.com\/cs\/web\/clue_private_message/.test(location.href || '')) {
      var items = Dom.queryAll('div[class*="my-4"]').filter(Dom.isVisible)
      var currentDate = ''
      var list = []
      for (var idx = 0; idx < items.length; idx++) {
        var item = items[idx]
        var text = _extractMessageText(item)
        if (!text) {
          var systemText = Dom.getText(item)
          if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(systemText)) currentDate = systemText
          continue
        }
        var direction = _isOutbound(item) ? 'outbound' : 'inbound'
        list.push({
          direction:    direction,
          owner:        direction === 'outbound' ? 'self' : 'user',
          message_type: 'user_text',
          type:         'text',
          content:      text,
          timestamp:    _normalizeOccurredAt(_extractMessageTime(item) || currentDate),
          raw_payload:  { selector: 'life-message-item', rect: Dom.readRect(item) },
        })
      }
      Tracer.log({
        lk_code:       LK.MSG_SCAN,
        stage:         Stage.MESSAGE,
        status:        Status.SUCCESS,
        message:       'douyin-laike life messages scanned',
        detail:        { total: list.length },
      })
      return list
    }
    var incoming = Dom.queryAll(SELECTORS.incomingBubble)
    var outgoing = Dom.queryAll(SELECTORS.selfBubble)
    var messages = []
    for (var i = 0; i < incoming.length; i++) {
      var el = incoming[i]
      if (!Dom.isVisible(el)) continue
      var textEl = Dom.queryFirst(SELECTORS.bubbleText, el) || el
      messages.push({
        direction:    'inbound',
        owner:        'user',
        message_type: 'user_text',
        content:      Dom.getText(textEl),
        timestamp:    null,
        raw_payload:  { selector: 'incomingBubble', rect: Dom.readRect(el) },
      })
    }
    for (var j = 0; j < outgoing.length; j++) {
      var elf = outgoing[j]
      if (!Dom.isVisible(elf)) continue
      messages.push({
        direction:    'outbound',
        owner:        'self',
        message_type: 'self_reply',
        content:      Dom.getText(elf),
        timestamp:    null,
        raw_payload:  { selector: 'selfBubble', rect: Dom.readRect(elf) },
      })
    }
    Tracer.log({
      lk_code:       LK.MSG_SCAN,
      stage:         Stage.MESSAGE,
      status:        Status.SUCCESS,
      message:       'douyin-laike messages scanned',
      detail:        { inbound: incoming.length, outbound: outgoing.length },
    })
    return messages
  }

  function _extractMessageText(el) {
    var text = Dom.getTextByXpath(el, './/div[contains(@class,"px-3") and contains(@class,"py-2")]')
    if (text) return text
    var textEl = Dom.queryFirst(SELECTORS.bubbleText, el) || el
    return Dom.getText(textEl)
  }

  function _extractMessageTime(el) {
    return Dom.getTextByXpath(el, './/span[contains(@class,"text-xs")]') ||
      Dom.getTextByXpath(el, './/p[contains(@class,"text")]//span')
  }

  function _isOutbound(el) {
    var row = el.querySelector('[class*="px-4"][class*="flex"][class*="relative"]') || el
    var cls = String(row.className || '')
    if (/rightMsg|flex-row-reverse|self|right/i.test(cls)) return true
    if (row.querySelector('p[class*="text-right"]')) return true
    return false
  }

  function _normalizeOccurredAt(value) {
    if (!value) return new Date().toISOString()
    var text = String(value).trim()
    var match = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
    if (match) {
      return new Date(
        Number(match[1]), Number(match[2]) - 1, Number(match[3]),
        Number(match[4]), Number(match[5]), Number(match[6] || 0)
      ).toISOString()
    }
    var d = new Date(text)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }

  function classifyMessage(raw) {
    return Helpers.classifyByDirection(raw)
  }

  function toConversationEvent(rawMsg, sessionInfo) {
    sessionInfo = sessionInfo || {}
    var normalized = classifyMessage(rawMsg)
    var direction = (normalized && normalized.direction) || rawMsg.direction || 'inbound'
    var content = rawMsg.content || rawMsg.text || ''
    var occurredAt = _normalizeOccurredAt(rawMsg.timestamp || rawMsg.time || rawMsg.occurred_at)
    var fallbackName = sessionInfo.nickname || ''
    if (!fallbackName || fallbackName === 'unknown') return null
    var conversationId = sessionInfo.conversationId || sessionInfo.conversation_id || sessionInfo.session_id || 'douyin-laike-' + Dom.simpleHash(fallbackName)
    return {
      platform: 'douyin',
      platform_page: 'laike-message',
      conversation_id: conversationId,
      message_id: Dom.synthMessageId({
        conversationId: conversationId,
        direction: direction,
        text: content,
        occurredAt: occurredAt,
      }),
      direction: direction,
      sender_nickname: direction === 'inbound' ? (sessionInfo.nickname || '') : (sessionInfo.accountNickname || ''),
      content_type: rawMsg.type || 'text',
      content_text: content,
      content_url: rawMsg.url || null,
      occurred_at: occurredAt,
      raw_snapshot: rawMsg.raw_payload || null,
    }
  }

  function buildRuntimeContext() {
    return {
      platform: 'douyin',
      pageKey:  'douyin-laike-message',
      url:      typeof location !== 'undefined' ? location.href : '',
      sessionTitle: Dom.getText(Dom.queryFirst(SELECTORS.sessionTitle)),
    }
  }

  Registry.register({
    adapterKey:           'douyin/laike-message',
    platform:             'douyin',
    pageKey:              'douyin-laike-message',
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
