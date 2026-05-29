// TODO V2.0 改造: 删除 prepareReply / sendReply，新增 toConversationEvent。见 MIGRATED_FROM_CHAT_RPA.md 第 1.3 节
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
      'div[class*="chatd-bubble-main--other"]',
      'div[class*="chatd-bubble--other"]',
      'div[class*="bubble"][class*="other"]',
      'div[class*="msg-item"][class*="left"]',
    ],
    selfBubble: [
      'div[class*="chatd-bubble-main--self"]',
      'div[class*="chatd-bubble--self"]',
      'div[class*="bubble"][class*="self"]',
      'div[class*="msg-item"][class*="right"]',
    ],
    bubbleText: [
      '[class*="chatd-bubble-main--other"]',
      '[class*="text-content"]',
      '[class*="bubble-main"]',
    ],
    input: [
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="输入"]',
      '[contenteditable="true"][class*="editor"]',
      '[class*="input"] textarea',
      'textarea',
    ],
    sendButton: [
      'button[type="submit"]',
      '[class*="send-button"]:not([disabled])',
      '[class*="sendBtn"]:not([disabled])',
    ],
  }

  var PAGE_PATTERNS = [
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

  function classifyMessage(raw) { return Helpers.classifyByDirection(raw) }
  async function buildBatch() { return null }

  async function prepareReply() {
    var input = Dom.queryFirst(SELECTORS.input)
    if (input && typeof input.focus === 'function') input.focus()
  }

  async function sendReply(replyText) {
    var input = Dom.queryFirst(SELECTORS.input)
    if (!input) {
      Tracer.log({
        lk_code: LK.ERR_DOM_MISSING, stage: Stage.SEND, status: Status.FAILED,
        message: 'douyin-private input not found',
      })
      return { ok: false, reason: 'input-missing' }
    }
    Dom.setInputValue(input, replyText)
    await Dom.waitFor(function () { return (input.value || '').indexOf(replyText) >= 0 }, { timeoutMs: 500 })
    var btn = Dom.queryFirst(SELECTORS.sendButton)
    var clicked = false
    if (btn) clicked = Dom.simulateClick(btn)
    else {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }))
      clicked = true
    }
    Tracer.log({
      lk_code: LK.SEND_CLICK, stage: Stage.SEND,
      status:  clicked ? Status.SUCCESS : Status.FAILED,
      message: 'douyin-private send click',
    })
    return { ok: clicked, reason: clicked ? null : 'send-failed' }
  }

  async function confirmReply(replyText) {
    var ok = await Dom.waitFor(function () {
      var bubbles = Dom.queryAll(SELECTORS.selfBubble)
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var text = Dom.getText(bubbles[i])
        if (text && replyText && text.indexOf(replyText) >= 0) return true
      }
      return false
    }, { timeoutMs: 5000 })
    Tracer.log({
      lk_code: LK.SEND_CONFIRM, stage: Stage.SEND,
      status:  ok ? Status.SUCCESS : Status.FAILED,
      message: 'douyin-private confirm reply',
    })
    return { confirmed: ok, confirm_type: ok ? 'self_bubble' : 'unknown', timeout: !ok }
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
    buildBatch:           buildBatch,
    prepareReply:         prepareReply,
    sendReply:            sendReply,
    confirmReply:         confirmReply,
    buildRuntimeContext:  buildRuntimeContext,
  })

})()
