// V2.0 采集探针: 仅 getMessages + toConversationEvent,发送方法已于 W5 移除
;(function () {
  'use strict'

  // V1.9 抖音飞鸽 Adapter（fxg.jinritemai.com 飞鸽客服）。
  // 飞鸽与来客是同域名不同业务路径，selectors 独立维护。

  var Dom      = window.RpaDomUtils
  var Helpers  = window.RpaAdapterHelpers
  var Registry = window.RpaAdapterRegistry
  var Tracer   = window.RpaLkTracer
  var C        = window.RpaConstants
  if (!Dom || !Helpers || !Registry || !Tracer || !C) {
    throw new Error('[V19] douyin feige adapter dependencies missing')
  }

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  var SELECTORS = {
    contactItem: [
      '[data-qa-id="qa-conversation-chat-item"]',
      '[class*="conversation"][class*="item"]',
      '[role="option"]',
      '[role="listitem"]',
    ],
    activeContactItem: [
      '[class*="conversation"][class*="active"]',
      '[class*="conversation"][class*="selected"]',
    ],
    nickname: [
      '[class*="nickname"]', '[class*="userName"]', '[class*="title"]',
    ],
    unreadBadge: [
      '.auxo-badge-top-right .auxo-scroll-number',
      'sup.auxo-badge-count',
      '[class*="badge"][class*="count"]',
      'span[class*="badge"]',
    ],
    incomingBubble: [
      'div[class*="my-4"]',
      'div[class*="chatd-bubble--other"]',
      'div[class*="chatd-bubble--left"]',
    ],
    selfBubble: [
      'div[class*="my-4"]',
      'div[class*="chatd-bubble--self"]',
      'div[class*="chatd-bubble--right"]',
    ],
    bubbleText: [
      'div[class*="px-3"][class*="py-2"][class*="break-all"][class*="whitespace"]',
      '[class*="bubble-main"]',
      '[class*="text-content"]',
    ],
    input: [
      'textarea[placeholder*="回复内容"]',
      'textarea[placeholder*="输入"]',
      'textarea',
      '[contenteditable="true"]',
    ],
    sendButton: [
      'button[class*="byted-btn"]:not([disabled])',
      'button[type="submit"]',
      '[class*="send"]:not([disabled])',
    ],
  }

  var PAGE_PATTERNS = [
    /fxg\.jinritemai\.com.*\/im\/feige/,
    /fxg\.jinritemai\.com.*feige/,
  ]

  function matchPage(loc) {
    var url = (loc && loc.href) || (typeof location !== 'undefined' ? location.href : '')
    for (var i = 0; i < PAGE_PATTERNS.length; i++) if (PAGE_PATTERNS[i].test(url)) return true
    return false
  }

  function _parseContact(item) {
    if (!item) return null
    var nicknameEl = Dom.queryFirst(SELECTORS.nickname, item)
    var badgeEl    = Dom.queryFirst(SELECTORS.unreadBadge, item)
    return Helpers.buildRawSession({
      raw_id:    Dom.getAttr(item, ['data-conversation-id', 'data-id', 'data-qa-id']),
      nickname:  Dom.getText(nicknameEl),
      unread_count: parseInt(Dom.getText(badgeEl), 10) || (badgeEl ? 1 : 0),
      dom_ref:   item,
    })
  }

  async function detectSessions() {
    var items = Dom.queryAll(SELECTORS.contactItem).filter(Dom.isVisible)
    Tracer.log({
      lk_code: LK.SESSION_LIST, stage: Stage.SESSION,
      status:  items.length ? Status.SUCCESS : Status.SKIPPED,
      message: 'douyin-feige contact items: ' + items.length,
    })
    return items.map(_parseContact).filter(Boolean)
  }

  async function selectTriggerSession(sessions) {
    if (!sessions || !sessions.length) return null
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].unread_count > 0) return sessions[i]
    }
    return sessions[0] || null
  }

  async function switchSession(session) {
    if (!session || !session.dom_ref) return { ok: false, reason: 'no-dom-ref' }
    Dom.simulateClick(session.dom_ref)
    var ok = await Dom.waitFor(function () {
      var active = Dom.queryFirst(SELECTORS.activeContactItem)
      return active === session.dom_ref
    }, { timeoutMs: 3000 })
    Tracer.log({
      lk_code: LK.SESSION_SWITCH, stage: Stage.SESSION,
      status:  ok ? Status.SUCCESS : Status.FAILED,
      message: 'douyin-feige switch session',
    })
    return { ok: ok, reason: ok ? null : 'switch-timeout' }
  }

  async function confirmActiveSession(session) {
    return !!session && session.dom_ref === Dom.queryFirst(SELECTORS.activeContactItem)
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
        var direction = _isOutbound(el) ? 'outbound' : 'inbound'
        list.push({
          direction: direction,
          owner: direction === 'outbound' ? 'self' : 'user',
          message_type: 'user_text',
          type: 'text',
          content: text,
          timestamp: _normalizeOccurredAt(_extractMessageTime(el) || currentDate),
          raw_payload: { selector: 'life-message-item', rect: Dom.readRect(el) },
        })
      })
      return list
    }
    var incoming = Dom.queryAll(SELECTORS.incomingBubble).filter(Dom.isVisible)
    var outgoing = Dom.queryAll(SELECTORS.selfBubble).filter(Dom.isVisible)
    var messages = []
    incoming.forEach(function (el) {
      var textEl = Dom.queryFirst(SELECTORS.bubbleText, el) || el
      messages.push({ direction: 'inbound', owner: 'user', message_type: 'user_text', content: Dom.getText(textEl) })
    })
    outgoing.forEach(function (el) {
      messages.push({ direction: 'outbound', owner: 'self', message_type: 'self_reply', content: Dom.getText(el) })
    })
    return messages
  }

  function _extractMessageText(el) {
    return Dom.getTextByXpath(el, './/div[contains(@class,"px-3") and contains(@class,"py-2")]') ||
      Dom.getText(Dom.queryFirst(SELECTORS.bubbleText, el))
  }

  function _extractMessageTime(el) {
    return Dom.getTextByXpath(el, './/span[contains(@class,"text-xs")]') ||
      Dom.getTextByXpath(el, './/p[contains(@class,"text")]//span')
  }

  function _isOutbound(el) {
    var row = el.querySelector('[class*="px-4"][class*="flex"][class*="relative"]') || el
    var cls = String(row.className || '')
    return /rightMsg|flex-row-reverse|self|right/i.test(cls) || !!row.querySelector('p[class*="text-right"]')
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
    var conversationId = sessionInfo.conversationId || sessionInfo.conversation_id || sessionInfo.session_id || 'douyin-feige-' + Dom.simpleHash(fallbackName)
    return {
      platform: 'douyin',
      platform_page: 'feige',
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
      pageKey:  'douyin-feige',
      url:      typeof location !== 'undefined' ? location.href : '',
    }
  }

  Registry.register({
    adapterKey:           'douyin/feige',
    platform:             'douyin',
    pageKey:              'douyin-feige',
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
