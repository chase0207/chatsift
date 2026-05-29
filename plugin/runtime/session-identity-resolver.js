;(function () {
  'use strict'

  // V1.9 SessionIdentityResolver（V1.9_技术方案 § 7 + V1.9_Runtime_Protocol § 第四章）
  //
  // ADR-005 + V1.9 升级：
  //   - session_id = fnv64(platform + pageKey + platformAccount + normalized_user_key)
  //   - identity_level：
  //       L1  平台稳定 ID（data-* 或 URL param）
  //       L2  nickname + avatar
  //       L3  nickname + last message + DOM position（unstable=true，禁止自动回复）
  //
  // 接口（V1.9）：
  //   resolve(platform, pageKey, platformAccount, node) → IdentityResult
  //   resolve(platform, platformAccount, node)          → IdentityResult（V1.8 兼容签名）
  //
  // 提取器组织方式：
  //   _extractors[platform + '/' + pageKey] —— 精确匹配（V1.9）
  //   _extractors[platform]                  —— 回退（V1.8 旧 key）

  var Hash = window.RpaHash

  function _fnv64(str) {
    if (Hash && typeof Hash.fnv64 === 'function') return Hash.fnv64(str)
    // 没有 RpaHash 时本地 fallback（保留 V1.8 fnv32 兼容）
    var h = 0x811c9dc5
    str = String(str || '')
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }

  function makeSessionId(platform, pageKey, platformAccount, userKey) {
    return _fnv64(platform + '|' + (pageKey || '') + '|' + (platformAccount || '') + '|' + (userKey || ''))
  }

  // ── 工具：DOM 提取 ──────────────────────────────────────────────
  function _getAttr(node, names) {
    if (!node || !node.getAttribute) return null
    for (var i = 0; i < names.length; i++) {
      var v = node.getAttribute(names[i])
      if (v) return v
    }
    return null
  }

  function _findChildText(node, selectors) {
    if (!node) return ''
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = node.querySelector(selectors[i])
        if (el) return (el.textContent || '').trim()
      } catch (_) {}
    }
    return ''
  }

  function _findChildAttr(node, selectors, attrs) {
    if (!node) return null
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = node.querySelector(selectors[i])
        if (!el) continue
        for (var j = 0; j < attrs.length; j++) {
          var v = el.getAttribute(attrs[j])
          if (v) return v
        }
      } catch (_) {}
    }
    return null
  }

  // ── 提取器：返回 { key, level, source } 或 null ───────────────────
  // key 命名规约：和 adapter.pageKey 严格对齐，避免 platform/pageKey 误拼。
  // 当 adapter.pageKey='douyin-laike-message' 时，resolver 直接按 pageKey 查 _extractors。
  var _extractors = {

    // 抖音来客（fxg.jinritemai.com 来客）
    'douyin-laike-message': function (node) {
      var id = _getAttr(node, ['data-conversation-id', 'data-session-id', 'data-id'])
      if (id) return { key: id, level: 1, source: 'attr:conversation-id' }
      var nick = _findChildText(node, ['[class*="nickname"]', '[class*="userName"]', '[class*="title"]'])
      var avatar = _findChildAttr(node, ['img'], ['src'])
      if (nick) return { key: nick + '|' + _fnv64(avatar || ''), level: 2, source: 'nickname+avatar' }
      return null
    },

    // 抖音私信（im.douyin.com）
    'douyin-private-message': function (node) {
      var id = _getAttr(node, ['data-conversation-id', 'data-session-id', 'data-id', 'data-qa-id'])
      if (id && id !== 'qa-conversation-chat-item') return { key: id, level: 1, source: 'attr:conversation-id' }
      // 私信侧栏 URL 有时含 conversationId
      try {
        var params = new URLSearchParams(window.location.search)
        var cid = params.get('conversationId') || params.get('conversation_id') || params.get('sessionId')
        if (cid) return { key: cid, level: 1, source: 'url:conversationId' }
      } catch (_) {}
      var nick = _findChildText(node, ['[class*="nickname"]', '[class*="userName"]', '[class*="title"]'])
      var avatar = _findChildAttr(node, ['img'], ['src'])
      if (nick) return { key: nick + '|' + _fnv64(avatar || ''), level: 2, source: 'nickname+avatar' }
      return null
    },

    // 抖音飞鸽
    'douyin-feige': function (node) {
      var id = _getAttr(node, ['data-conversation-id', 'data-id', 'data-qa-id'])
      if (id && id !== 'qa-conversation-chat-item') return { key: id, level: 1, source: 'attr:data-id' }
      try {
        var params = new URLSearchParams(window.location.search)
        var cid = params.get('conversationId') || params.get('conversation_id')
        if (cid) return { key: cid, level: 1, source: 'url:conversationId' }
      } catch (_) {}
      var nick = _findChildText(node, ['[class*="nickname"]', '[class*="userName"]', '[class*="title"]'])
      if (nick) return { key: nick, level: 2, source: 'nickname' }
      return null
    },

    // 小红书私信（暂只能 L2）
    'xiaohongshu-private-message': function (node) {
      var nick   = _findChildText(node, ['[class*="nickname"]', '[class*="name"]'])
      var avatar = _findChildAttr(node, ['img'], ['src'])
      if (nick) return { key: nick + '|' + _fnv64(avatar || ''), level: 2, source: 'nickname+avatar' }
      return null
    },

    // 快手客服
    'kuaishou-customer-service': function (node) {
      var id = _getAttr(node, ['data-id', 'data-session-id'])
      if (id) return { key: id, level: 1, source: 'attr:data-id' }
      var nick = _findChildText(node, ['[class*="nickname"]', '[class*="name"]'])
      if (nick) return { key: nick, level: 2, source: 'nickname' }
      return null
    },

    // 美团经营宝（ShadowRoot 未穿透，L2 限定）
    'meituan-jingyingbao': function (node) {
      var nick = _findChildText(node, ['[class*="userinfo-username"]', '[class*="nickname"]', '[class*="name"]'])
      if (nick) return { key: nick, level: 2, source: 'nickname' }
      return null
    },

    // ── V1.8 兼容 key（保留，便于旧调用方）───────────────────────
    douyinLaike: function (node) { return _extractors['douyin-laike-message'](node) },
    douyinFeige: function (node) { return _extractors['douyin-feige'](node) },
    kuaishou:    function (node) { return _extractors['kuaishou-customer-service'](node) },
    meituanJyb:  function (node) { return _extractors['meituan-jingyingbao'](node) },
    xiaohongshu: function (node) { return _extractors['xiaohongshu-private-message'](node) },
  }

  // 主入口；同时兼容旧的三参签名
  function resolve(platform, pageKeyOrAccount, accountOrNode, maybeNode) {
    var pageKey, platformAccount, node
    if (arguments.length >= 4) {
      pageKey         = pageKeyOrAccount
      platformAccount = accountOrNode
      node            = maybeNode
    } else {
      // V1.8 兼容签名 resolve(platform, platformAccount, node)
      pageKey         = ''
      platformAccount = pageKeyOrAccount
      node            = accountOrNode
    }

    // 提取器 key 命名约定：直接用 adapter.pageKey（已含 platform 前缀）
    // 兼容旧 'platform/scene' 形式作为二次尝试
    var fn = _extractors[pageKey]
          || _extractors[platform + '/' + pageKey]
          || _extractors[platform]

    var result = null
    if (fn) {
      try { result = fn(node) } catch (_) {}
    }

    if (!result) {
      var nickText = ((node && node.textContent) || '').trim().slice(0, 32)
      var pos      = (node && node.getBoundingClientRect) ? (node.getBoundingClientRect().top | 0) : 0
      result = { key: nickText + '|pos=' + pos, level: 3, source: 'dom-fallback' }
    }

    var sessionId = makeSessionId(platform, pageKey, platformAccount, result.key)
    var unstable  = result.level === 3

    if (unstable && typeof console !== 'undefined') {
      console.warn('[V19][SessionIdentity] L3 fallback', platform + '/' + (pageKey || ''), result.source)
    }

    return {
      session_id: sessionId,
      unstable:   unstable,
      level:      result.level,
      source:     result.source,
    }
  }

  function registerExtractor(key, fn) { _extractors[key] = fn }
  function listExtractors() { return Object.keys(_extractors) }

  window.RpaSessionIdentityResolver = {
    resolve:           resolve,
    registerExtractor: registerExtractor,
    listExtractors:    listExtractors,
  }

})()
