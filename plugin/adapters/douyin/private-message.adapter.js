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
      'div[class*="msgTitle"] span[class*="name"]',
      'div[class*="userInfo"] [class*="name"]',
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
    if (/life\.douyin\.com\/cs\/web\/clue_private_message/.test(location.href || '')) {
      var items = Dom.queryAll('div[class*="my-4"]').filter(Dom.isVisible)
      var currentDate = ''
      var list = []
      items.forEach(function (el) {
        var text = _extractMessageText(el)
        if (!text) {
          var systemText = Dom.getText(el)
          if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(systemText)) currentDate = systemText
          return
        }
        var timeText = _extractMessageTime(el) || currentDate
        var direction = _isOutbound(el) ? 'outbound' : 'inbound'
        list.push({
          direction: direction,
          owner: direction === 'outbound' ? 'self' : 'user',
          message_type: 'user_text',
          type: 'text',
          content: text,
          timestamp: _normalizeOccurredAt(timeText),
          raw_payload: { selector: 'life-message-item', rect: Dom.readRect(el) },
        })
      })
      Tracer.log({
        lk_code: LK.MSG_SCAN, stage: Stage.MESSAGE, status: Status.SUCCESS,
        message: 'douyin-private life messages scanned',
        detail:  { total: list.length },
      })
      return list
    }
    var incoming = Dom.queryAll(SELECTORS.incomingBubble).filter(Dom.isVisible)
    var outgoing = Dom.queryAll(SELECTORS.selfBubble).filter(Dom.isVisible)
    var messages = []
    incoming.forEach(function (el) {
      var textEl = Dom.queryFirst(SELECTORS.bubbleText, el) || el
      messages.push({
        direction: 'inbound', owner: 'user', message_type: 'user_text',
        content: Dom.getText(textEl),
        raw_payload: { selector: 'incomingBubble' },
      })
    })
    outgoing.forEach(function (el) {
      messages.push({
        direction: 'outbound', owner: 'self', message_type: 'self_reply',
        content: Dom.getText(el),
        raw_payload: { selector: 'selfBubble' },
      })
    })
    Tracer.log({
      lk_code: LK.MSG_SCAN, stage: Stage.MESSAGE, status: Status.SUCCESS,
      message: 'douyin-private messages scanned',
      detail:  { inbound: incoming.length, outbound: outgoing.length },
    })
    return messages
  }

  function _extractMessageText(el) {
    var text = Dom.getTextByXpath(el, './/div[contains(@class,"px-3") and contains(@class,"py-2")]')
    if (text) return text
    var textEl = Dom.queryFirst(SELECTORS.bubbleText, el)
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

  function classifyMessage(raw) { return Helpers.classifyByDirection(raw) }

  function toConversationEvent(rawMsg, sessionInfo) {
    sessionInfo = sessionInfo || {}
    var normalized = classifyMessage(rawMsg)
    var direction = (normalized && normalized.direction) || rawMsg.direction || 'inbound'
    var content = rawMsg.content || rawMsg.text || ''
    var occurredAt = _normalizeOccurredAt(rawMsg.timestamp || rawMsg.time || rawMsg.occurred_at)
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
