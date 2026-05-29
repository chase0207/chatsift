// TODO V2.0 改造: 删除 prepareReply / sendReply，新增 toConversationEvent。见 MIGRATED_FROM_CHAT_RPA.md 第 1.3 节
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
      'div[class*="chatd-bubble-main--other"]',
      'div[class*="chatd-bubble--other"]',
      'div[class*="bubble"][class*="other"]',
      'div[class*="msg"][class*="other"]',
    ],
    selfBubble: [
      'div[class*="chatd-bubble-main--self"]',
      'div[class*="chatd-bubble--self"]',
      'div[class*="bubble"][class*="self"]',
    ],
    bubbleText: [
      '[class*="chatd-bubble-main--other"]',
      '[style*="white-space: pre-wrap"]',
      '[class*="bubble-main"]',
    ],
    bubbleTime: [
      '[class*="time"]',
      '[class*="timestamp"]',
    ],
    input: [
      'textarea[placeholder*="发送消息"]',
      'textarea[placeholder*="输入"]',
      'textarea[placeholder*="回复"]',
      '[class*="inputTextarea"] textarea',
      '[class*="input"] textarea',
      '[class*="editor"] textarea',
      'textarea',
    ],
    sendButton: [
      'button[type="submit"]',
      '[class*="sendBtn"]:not([disabled])',
      '[class*="send-btn"]:not([disabled])',
    ],
  }

  var PAGE_PATTERNS = [
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

  function classifyMessage(raw) {
    return Helpers.classifyByDirection(raw)
  }

  async function buildBatch(messages, context) {
    void messages
    void context
    // 实际 batch 构造由 RuntimeManager 调 BatchManager.create() 完成；
    // adapter 只负责"把 NormalizedMessage 喂出来"
    return null
  }

  async function prepareReply(replyText, context) {
    void replyText
    void context
    var input = Dom.queryFirst(SELECTORS.input)
    if (input && typeof input.focus === 'function') input.focus()
  }

  async function sendReply(replyText, context) {
    void context
    var input = Dom.queryFirst(SELECTORS.input)
    if (!input) {
      Tracer.log({
        lk_code: LK.ERR_DOM_MISSING, stage: Stage.SEND, status: Status.FAILED,
        message: 'douyin-laike input not found',
      })
      return { ok: false, reason: 'input-missing' }
    }
    Dom.setInputValue(input, replyText)
    await Dom.waitFor(function () { return (input.value || '').indexOf(replyText) >= 0 }, { timeoutMs: 500 })
    var btn = Dom.queryFirst(SELECTORS.sendButton)
    var clickedOk = btn ? Dom.simulateClick(btn) : false
    if (!btn) {
      // 兜底回车
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }))
      clickedOk = true
    }
    Tracer.log({
      lk_code:  LK.SEND_CLICK, stage: Stage.SEND,
      status:   clickedOk ? Status.SUCCESS : Status.FAILED,
      message:  'douyin-laike send click',
      detail:   { hasButton: !!btn },
    })
    return { ok: clickedOk, reason: clickedOk ? null : 'send-failed' }
  }

  async function confirmReply(replyText, context) {
    void context
    // 通过等待自己侧气泡出现且包含 replyText 来确认
    var ok = await Dom.waitFor(function () {
      var bubbles = Dom.queryAll(SELECTORS.selfBubble)
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var text = Dom.getText(bubbles[i])
        if (text && replyText && text.indexOf(replyText) >= 0) return true
      }
      return false
    }, { timeoutMs: 5000 })
    Tracer.log({
      lk_code:  LK.SEND_CONFIRM, stage: Stage.SEND,
      status:   ok ? Status.SUCCESS : Status.FAILED,
      message:  'douyin-laike confirm reply',
      detail:   { confirmType: 'self_bubble' },
    })
    return { confirmed: ok, confirm_type: ok ? 'self_bubble' : 'unknown', timeout: !ok }
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
    buildBatch:           buildBatch,
    prepareReply:         prepareReply,
    sendReply:            sendReply,
    confirmReply:         confirmReply,
    buildRuntimeContext:  buildRuntimeContext,
  })

})()
