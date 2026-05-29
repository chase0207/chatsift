// TODO V2.0 改造: 删除 prepareReply / sendReply，新增 toConversationEvent。见 MIGRATED_FROM_CHAT_RPA.md 第 1.3 节
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
      'div[class*="chatd-bubble--other"]',
      'div[class*="chatd-bubble--left"]',
    ],
    selfBubble: [
      'div[class*="chatd-bubble--self"]',
      'div[class*="chatd-bubble--right"]',
    ],
    bubbleText: [
      '[class*="bubble-main"]',
      '[class*="text-content"]',
    ],
    input: [
      'textarea[placeholder*="输入"]',
      'textarea',
      '[contenteditable="true"]',
    ],
    sendButton: [
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

  function classifyMessage(raw) { return Helpers.classifyByDirection(raw) }
  async function buildBatch() { return null }

  async function prepareReply() {
    var input = Dom.queryFirst(SELECTORS.input)
    if (input && typeof input.focus === 'function') input.focus()
  }

  async function sendReply(replyText) {
    var input = Dom.queryFirst(SELECTORS.input)
    if (!input) return { ok: false, reason: 'input-missing' }
    Dom.setInputValue(input, replyText)
    var btn = Dom.queryFirst(SELECTORS.sendButton)
    var clicked = false
    if (btn) clicked = Dom.simulateClick(btn)
    else { input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 })); clicked = true }
    return { ok: clicked, reason: clicked ? null : 'send-failed' }
  }

  async function confirmReply(replyText) {
    var ok = await Dom.waitFor(function () {
      var bubbles = Dom.queryAll(SELECTORS.selfBubble)
      for (var i = bubbles.length - 1; i >= 0; i--) {
        if (Dom.getText(bubbles[i]).indexOf(replyText) >= 0) return true
      }
      return false
    }, { timeoutMs: 5000 })
    return { confirmed: ok, confirm_type: ok ? 'self_bubble' : 'unknown', timeout: !ok }
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
    buildBatch:           buildBatch,
    prepareReply:         prepareReply,
    sendReply:            sendReply,
    confirmReply:         confirmReply,
    buildRuntimeContext:  buildRuntimeContext,
  })

})()
