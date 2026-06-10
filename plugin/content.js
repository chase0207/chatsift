
// ============================================================
// MODULE: shared/content-gate.js
// ============================================================

;(function () {
  'use strict'

  var DEFAULT_PAGE_URLS = [
    'https://life.douyin.com/cs/web/clue_private_message/chat/session',
    'https://im.douyin.com',
    'https://im.jinritemai.com',
  ]

  var _ready = false
  var _allowed = false
  var _matched = null

  function normalize(value) {
    return String(value || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
  }

  function pageUrlsFromDefinitions(definitions) {
    var urls = []
    ;(Array.isArray(definitions) ? definitions : []).forEach(function (platform) {
      var pages = Array.isArray(platform && platform.pages) ? platform.pages : []
      pages.forEach(function (page) {
        if (page && page.url) urls.push(page.url)
      })
      if (!pages.length && platform && platform.url) urls.push(platform.url)
    })
    return urls.map(normalize).filter(Boolean)
  }

  function matchUrl(url, definitions) {
    var normalizedUrl = normalize(url)
    var urls = pageUrlsFromDefinitions(definitions)
    if (!urls.length) urls = DEFAULT_PAGE_URLS.map(normalize)
    urls = urls.sort(function (a, b) { return b.length - a.length })
    for (var i = 0; i < urls.length; i++) {
      if (urls[i] && normalizedUrl.indexOf(urls[i]) !== -1) return urls[i]
    }
    return null
  }

  function evaluate(definitions) {
    _matched = matchUrl(location.href, definitions)
    _allowed = !!_matched
    _ready = true
    if (!_allowed) {
      console.info('[Chatsift] 当前页面不是已配置采集页面，采集 runtime 已阻断')
    }
  }

  function load() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      evaluate([])
      return
    }
    chrome.storage.local.get(['platformDefinitions'], function (data) {
      if (chrome.runtime && chrome.runtime.lastError) {
        evaluate([])
        return
      }
      evaluate((data && data.platformDefinitions) || [])
    })
    if (chrome.storage.onChanged && !window.__chatsiftContentGateStorageBound) {
      window.__chatsiftContentGateStorageBound = true
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local' || !changes.platformDefinitions) return
        evaluate(changes.platformDefinitions.newValue || [])
      })
    }
  }

  window.ChatsiftContentGate = {
    isReady: function () { return _ready },
    isAllowed: function () { return _allowed },
    matched: function () { return _matched },
  }

  load()
})()

// ============================================================
// MODULE: shared/constants.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 Runtime Protocol 全局常量。
  // 任何模块（runtime/* / adapters/**）需要状态、LK 编码或默认配置时，统一从这里读取。
  // 禁止在其他文件直接定义重复的状态名或 LK 编码，避免协议漂移。

  // ── RuntimeStateMachine 状态枚举（V1.9_Runtime_Protocol § Runtime State Machine）─
  var RuntimeState = {
    IDLE:                'IDLE',
    SCANNING:            'SCANNING',
    SESSION_SWITCHING:   'SESSION_SWITCHING',
    READING_MESSAGES:    'READING_MESSAGES',
    WAITING_STABLE:      'WAITING_STABLE',
    BUILDING_BATCH:      'BUILDING_BATCH',
    DECIDING:            'DECIDING',
    SENDING:             'SENDING',
    CONFIRMING:          'CONFIRMING',
    SYNCING:             'SYNCING',
    ERROR:               'ERROR',
    STOPPED:             'STOPPED',
  }

  // ── LK 节点编码（统一方案：9 组，权威定义见 docs/prd/V1.9/V1.9_Runtime_Protocol.md § LK Protocol）─
  // 注意：部分常量 key 沿用历史命名（如 RUNTIME_LOCK），但其【值】已按统一分层重编号。
  // 排障一律以字符串值（落库到 runtime_logs.lk_code）为准，不要以 key 名判断层级。
  // 标 "（未发射）" 的为新增占位节点：本轮只定义不埋点，待后续 Tier1/2 补 Tracer.log。
  var LK = {
    // ── 1. Bootstrap ──
    BOOT_INIT:            'LK-BOOT-01',   // runtime_bootstrap（← 原 RUNTIME_INIT，start/resume）
    BOOT_PLUGIN_ATTACH:   'LK-BOOT-02',   // plugin_attach（未发射）
    BOOT_STORAGE_RESTORE: 'LK-BOOT-03',   // storage_restore（未发射）
    RUNTIME_LOCK:         'LK-BOOT-04',   // runtime_lock（← 原 LK-RUNTIME-02）
    BOOT_OBSERVER_INIT:   'LK-BOOT-05',   // observer_init（未发射）

    // ── 2. Environment（整层未发射，逻辑现走 content_legacy） ──
    ENV_DETECT_PLATFORM:    'LK-ENV-01',  // detect_platform（未发射）
    ENV_DETECT_PAGE:        'LK-ENV-02',  // detect_page（未发射）
    ENV_DETECT_IFRAME:      'LK-ENV-03',  // detect_iframe（未发射）
    ENV_DETECT_SHADOW_ROOT: 'LK-ENV-04',  // detect_shadow_root（未发射，逻辑也缺）
    ENV_BUILD_DOM_CONTEXT:  'LK-ENV-05',  // build_dom_context（未发射）
    ENV_ADAPTER_ATTACH:     'LK-ENV-06',  // adapter_attach（未发射）
    ENV_CONTEXT_READY:      'LK-ENV-07',  // runtime_context_ready（未发射）

    // ── 3. Session ──
    SESSION_LIST:       'LK-SESSION-01',
    SESSION_TRIGGER:    'LK-SESSION-02',  // 已定义未发射，待补埋点
    SESSION_SWITCH:     'LK-SESSION-03',
    SESSION_ACTIVE:     'LK-SESSION-04',  // 已定义未发射，待补埋点
    SESSION_IDENTITY:   'LK-SESSION-05',  // build_session_identity（未发射）
    SESSION_STABLE_WAIT:'LK-SESSION-06',  // session_stable_wait（未发射）

    // ── 4. Message ──
    MSG_CONTAINER:      'LK-MSG-01',      // 已定义未发射，待补埋点
    MSG_SCAN:           'LK-MSG-02',
    MSG_CLASSIFY:       'LK-MSG-03',      // 已定义未发射，待补埋点
    MSG_SORT:           'LK-MSG-04',      // 已定义未发射，待补埋点
    MSG_STABLE_WAIT:    'LK-MSG-05',
    MSG_BATCH_BUILD:    'LK-MSG-06',
    MSG_DEDUP:          'LK-MSG-07',      // deduplicate_messages（未发射）
    MSG_OWNER:          'LK-MSG-08',      // detect_message_owner（未发射）
    MSG_TYPE:           'LK-MSG-09',      // detect_message_type（未发射）

    // ── 5. Decision（决策现走 legacy decideReply，runtime 未接管） ──
    DECISION_PROMPT:    'LK-DECISION-01',
    DECISION_KEYWORD:   'LK-DECISION-02',
    DECISION_INTENT:    'LK-DECISION-03',  // intent_detect（未实现）
    DECISION_GOAL:      'LK-DECISION-04',  // goal_check（未实现）
    DECISION_AI_REQ:    'LK-DECISION-05',  // ← 原 LK-DECISION-03
    DECISION_AI_RESP:   'LK-DECISION-06',  // ← 原 LK-DECISION-04
    DECISION_GAP_ACTION:'LK-DECISION-07',  // build_gap_action（未实现）

    // ── 6. Send ──
    SEND_PRECHECK:      'LK-SEND-01',
    SEND_LOCATE_INPUT:  'LK-SEND-02',  // locate_textarea（未发射）
    SEND_INPUT:         'LK-SEND-03',  // input_message（已定义未发射，待补埋点）
    SEND_LOCATE_BUTTON: 'LK-SEND-04',  // locate_send_button（未发射）
    SEND_CLICK:         'LK-SEND-05',  // ← 原 LK-SEND-03
    SEND_CONFIRM:       'LK-SEND-06',  // ← 原 LK-SEND-04（含自气泡判定，合并附件 05+06）
    SEND_TIMEOUT:       'LK-SEND-07',  // send_timeout（未发射）

    // ── 7. Sync ──
    SYNC_RUNTIME_LOG:   'LK-SYNC-01',  // 已定义未发射，待补埋点
    SYNC_MESSAGE:       'LK-SYNC-02',  // 已定义未发射，待补埋点
    SYNC_BATCH_FINAL:   'LK-SYNC-03',

    // ── 8. Recovery ──
    RUNTIME_HEARTBEAT:  'LK-RECOVERY-01',  // watchdog_heartbeat（← 原 LK-RUNTIME-03）
    RUNTIME_WATCHDOG:   'LK-RECOVERY-02',  // detect_runtime_stall（← 原 LK-RUNTIME-WATCHDOG）
    RECOVERY_RUNTIME:   'LK-RECOVERY-03',  // recover_runtime（← 原 RUNTIME_INIT @ recovery-manager）
    RECOVERY_QUEUE:     'LK-RECOVERY-04',  // restore_queue（未发射）
    RECOVERY_BATCH:     'LK-RECOVERY-05',  // restore_batch（未发射）
    RUNTIME_CLEANUP:    'LK-RECOVERY-06',  // cleanup_observer（← 原 LK-RUNTIME-04）

    // ── 9. Error（跨层横切） ──
    ERR_DOM_MISSING:    'LK-ERROR-01',
    ERR_SEND_FAILED:    'LK-ERROR-02',
    ERR_AI_TIMEOUT:     'LK-ERROR-03',  // 已定义未发射，待补埋点
    ERR_DUPLICATE:      'LK-ERROR-04',

    // ── 横切特殊标记（不参与层内编号） ──
    RUNTIME_STATE:      'LK-STATE',           // 状态机迁移（← 原 LK-RUNTIME-STATE）
    CHAOS_VIOLATION:    'LK-CHAOS-VIOLATION',  // chaos 不变量哨兵
  }

  var Stage = {
    RUNTIME:  'runtime',
    SESSION:  'session',
    MESSAGE:  'message',
    DECISION: 'decision',
    SEND:     'send',
    SYNC:     'sync',
    ERROR:    'error',
  }

  var Status = {
    SUCCESS: 'success',
    FAILED:  'failed',
    SKIPPED: 'skipped',
    WARNING: 'warning',
  }

  // ── Feature Flag 默认值（在 runtime-config 未返回 experimental 字段时兜底） ─
  // 全部默认 false。解锁路径见 runtime/feature-flags.js。
  // 二级 send_runtime_v19 保留为旧 runtime 状态约束开关。
  var FeatureFlagDefaults = {
    runtime_v19:        false,   // V1.9 Runtime 启动总开关
    send_runtime_v19:   false,   // V1.9-M4 发送链路总开关（最高风险）
    batch_protocol_v2:  false,
    adapter_layer_v19:  false,
    send_confirm_v19:   false,
    watchdog_v19:       false,
    auto_switch_session:false,
    collector_v1_enabled: false,  // ★默认关:必须点"启动"(START_PLATFORM 写 storage=true)才采集;停止=false
  }

  // ── 协议常量（V1.9_Runtime_Protocol 关键阈值，便于集中调整） ─────────
  var Protocol = {
    LK_BUFFER_MAX:       100,    // 内存缓存的 LK 条数，超过即刷盘
    LK_FLUSH_INTERVAL:   3000,   // 自动 flush 间隔（ms）
    LK_BATCH_MAX:        200,    // 单次上送服务端的最大条数
  }

  window.RpaConstants = {
    RuntimeState:         RuntimeState,
    LK:                   LK,
    Stage:                Stage,
    Status:               Status,
    FeatureFlagDefaults:  FeatureFlagDefaults,
    Protocol:             Protocol,
  }

})()

// ============================================================
// MODULE: shared/hash.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 统一哈希工具。
  // 不使用 crypto.subtle 是因为 content script 在某些受限 frame 中无法访问 SubtleCrypto，
  // 且 V1.9 用途仅为生成稳定指纹（session_id / batch_id / batch_hash），无需密码学强度。

  // FNV-1a 32-bit；用于 session_id 等场景，输出 8 位小写 hex
  function fnv32(str) {
    str = String(str || '')
    var h = 0x811c9dc5
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = (h * 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }

  // FNV-1a 64-bit 模拟（两段 32 位拼接）；用于 batch_id / batch_hash 场景，降低碰撞概率
  function fnv64(str) {
    str = String(str || '')
    var a = 0x811c9dc5
    var b = 0xcbf29ce4
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i)
      a ^= c
      a = (a * 0x01000193) >>> 0
      b ^= c
      b = (b * 0x100000001b3) >>> 0
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
  }

  // 将一组字段拼接后 hash，自动用  分隔避免边界歧义
  function joinAndHash(parts, hashFn) {
    var fn = hashFn || fnv64
    var joined = (parts || []).map(function (p) {
      if (p === null || p === undefined) return ''
      return String(p)
    }).join('')
    return fn(joined)
  }

  window.RpaHash = {
    fnv32:       fnv32,
    fnv64:       fnv64,
    joinAndHash: joinAndHash,
  }

})()

// ============================================================
// MODULE: shared/logger.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 统一日志器。
  // 仅做 console 输出格式化，不上报服务端（上报由 lk-tracer 负责）。
  // 设计目的：让 V1.9 路径的日志在 DevTools 中容易被一眼识别，方便和 V1.x legacy 日志区分。

  var DEBUG_DEFAULT = false   // V1.9 默认关闭 debug，避免污染 console；通过 setDebug 打开

  var _state = {
    debug: DEBUG_DEFAULT,
  }

  function _ts() {
    var d = new Date()
    var pad = function (n) { return n < 10 ? '0' + n : n }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  function _fmt(tag) {
    return '[V19][' + _ts() + '][' + (tag || '?') + ']'
  }

  function info(tag) {
    var args = Array.prototype.slice.call(arguments, 1)
    console.log.apply(console, [_fmt(tag)].concat(args))
  }
  function warn(tag) {
    var args = Array.prototype.slice.call(arguments, 1)
    console.warn.apply(console, [_fmt(tag)].concat(args))
  }
  function error(tag) {
    var args = Array.prototype.slice.call(arguments, 1)
    console.error.apply(console, [_fmt(tag)].concat(args))
  }
  function debug(tag) {
    if (!_state.debug) return
    var args = Array.prototype.slice.call(arguments, 1)
    console.log.apply(console, [_fmt(tag) + '[DEBUG]'].concat(args))
  }

  function setDebug(on) { _state.debug = !!on }
  function isDebug() { return _state.debug }

  window.RpaLogger = {
    info:     info,
    warn:     warn,
    error:    error,
    debug:    debug,
    setDebug: setDebug,
    isDebug:  isDebug,
  }

})()

// ============================================================
// MODULE: shared/dom-utils.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 Adapter 共享 DOM 工具。
  // 不复用 content_legacy 的工具函数（避免 V1.9 路径耦合 legacy）；这里独立实现。
  //
  // 设计原则：选择器候选数组顺序 = 稳定度降序，第一个命中即返回。

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false
    var rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return false
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null
    if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) {
      return false
    }
    return true
  }

  function queryFirst(selectors, root) {
    root = root || document
    if (!selectors) return null
    var list = Array.isArray(selectors) ? selectors : [selectors]
    for (var i = 0; i < list.length; i++) {
      try {
        var el = root.querySelector(list[i])
        if (el) return el
      } catch (_) {}
    }
    return null
  }

  function queryAll(selectors, root) {
    root = root || document
    if (!selectors) return []
    var list = Array.isArray(selectors) ? selectors : [selectors]
    var result = []
    var seen = new WeakSet()
    for (var i = 0; i < list.length; i++) {
      try {
        var nodes = root.querySelectorAll(list[i])
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j]
          if (!seen.has(n)) { seen.add(n); result.push(n) }
        }
      } catch (_) {}
    }
    return result
  }

  function getText(el) {
    if (!el) return ''
    return (el.textContent || '').replace(/ /g, ' ').trim()
  }

  function getAttr(el, names) {
    if (!el || !el.getAttribute) return null
    var list = Array.isArray(names) ? names : [names]
    for (var i = 0; i < list.length; i++) {
      var v = el.getAttribute(list[i])
      if (v) return v
    }
    return null
  }

  function simpleHash(str) {
    str = String(str || '')
    var h = 0x811c9dc5
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = (h * 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }

  function synthMessageId(args) {
    args = args || {}
    // W17:位置标识优先。message_id = syn_hash(conversationId|position),纯位置不含内容/方向(D5)。
    // 同会话同 position → 同 hash → 跨采集幂等(去重靠位置不靠内容)。
    if (args.position !== undefined && args.position !== null) {
      return 'syn_' + simpleHash((args.conversationId || args.conversation_id || '') + '|pos:' + args.position)
    }
    // 旧路径(seq/时间到分钟)保留兼容,W17 采集链路已不再走。
    var keyPart
    if (args.seq !== undefined && args.seq !== null) {
      keyPart = 'seq:' + args.seq
    } else {
      var occurredAt = args.occurredAt || args.occurred_at || new Date().toISOString()
      var d = new Date(occurredAt)
      keyPart = isNaN(d.getTime())
        ? String(occurredAt).slice(0, 16)
        : d.toISOString().slice(0, 16)
    }
    var raw = [
      args.conversationId || args.conversation_id || '',
      args.direction || '',
      args.text || args.content || '',
      keyPart,
    ].join('|')
    return 'syn_' + simpleHash(raw)
  }

  function getTextByXpath(contextNode, xpath) {
    if (!xpath || typeof document === 'undefined' || !document.evaluate) return ''
    try {
      var result = document.evaluate(
        xpath,
        contextNode || document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      )
      return getText(result.singleNodeValue)
    } catch (_) {
      return ''
    }
  }

  function queryAllByXpath(contextNode, xpath) {
    if (!xpath || typeof document === 'undefined' || !document.evaluate) return []
    var out = []
    try {
      var result = document.evaluate(
        xpath,
        contextNode || document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      )
      for (var i = 0; i < result.snapshotLength; i++) out.push(result.snapshotItem(i))
    } catch (_) {}
    return out
  }

  // 等待一个谓词为真（用于等待 DOM 变化），返回 Promise<true|false>
  function waitFor(predicate, opts) {
    opts = opts || {}
    var timeoutMs = opts.timeoutMs || 3000
    var intervalMs = opts.intervalMs || 100
    var start = Date.now()
    return new Promise(function (resolve) {
      function tick() {
        try {
          if (predicate()) return resolve(true)
        } catch (_) {}
        if (Date.now() - start >= timeoutMs) return resolve(false)
        setTimeout(tick, intervalMs)
      }
      tick()
    })
  }

  // 模拟用户级输入：兼容 React/Vue 受控组件
  function setInputValue(el, value) {
    if (!el) return false
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      var inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      var nativeSetter = (el.tagName === 'TEXTAREA') ? (setter && setter.set) : (inputSetter && inputSetter.set)
      if (nativeSetter) nativeSetter.call(el, value)
      else el.value = value
      el.dispatchEvent(new Event('input',  { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    } catch (_) {
      el.value = value
      return true
    }
  }

  function simulateClick(el) {
    if (!el) return false
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }))
      el.dispatchEvent(new MouseEvent('click',     { bubbles: true }))
      return true
    } catch (_) {
      try { el.click() } catch (__) {}
      return false
    }
  }

  // 同步抓快照（用于 detectSessions 内部辅助）
  function readRect(el) {
    if (!el || !el.getBoundingClientRect) return null
    var r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  }

  window.RpaDomUtils = {
    isVisible:       isVisible,
    queryFirst:      queryFirst,
    queryAll:        queryAll,
    getText:         getText,
    getAttr:         getAttr,
    simpleHash:      simpleHash,
    synthMessageId:  synthMessageId,
    getTextByXpath:  getTextByXpath,
    queryAllByXpath: queryAllByXpath,
    waitFor:         waitFor,
    setInputValue:   setInputValue,
    simulateClick:   simulateClick,
    readRect:        readRect,
  }

})()

// ============================================================
// MODULE: runtime/feature-flags.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 Feature Flags 中心（硬锁默认 deny）
  //
  // 三个 Flag：
  //   - runtime_v19       一级：V1.9 Runtime 启动总开关
  //   - send_runtime_v19  二级：旧 runtime 状态约束
  //   - watchdog_v19      看门狗启动总开关（保留）
  //
  // 解锁路径只有两条：
  //   A. background.js 接收 /api/devices/runtime-config 后，将 response.experimental 字段
  //      通过消息推到 content script，由 content script 调用 setFlags(...)
  //   B. DevTools 调试：window.RpaFeatureFlags.unlockForTesting('send_runtime_v19')
  //      会强烈警告，仅供 QA 在测试账号下灰度
  //
  // 不允许的解锁方式：
  //   ✗ 通过 chrome.storage.local 持久化解锁状态（reload 后保留 = 危险）
  //   ✗ 直接修改 _flags 对象（隐藏在闭包内）

  var C = window.RpaConstants
  if (!C) throw new Error('[V19] RpaConstants must load before FeatureFlags')

  var DEFAULTS = C.FeatureFlagDefaults || {}
  var _flags   = Object.assign({}, DEFAULTS)

  function get(name) {
    if ((name === 'collector_v1_enabled' || name === 'auto_switch_session') &&
        window.ChatsiftContentGate &&
        !window.ChatsiftContentGate.isAllowed()) {
      return false
    }
    return !!_flags[name]
  }

  function snapshot() { return Object.assign({}, _flags) }

  // 从服务端 runtime-config.experimental 字段更新（白名单字段，未知字段忽略）
  function setFlags(serverFlags) {
    if (!serverFlags || typeof serverFlags !== 'object') return
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k in serverFlags) _flags[k] = !!serverFlags[k]
    })
  }

  // DevTools 调试解锁；不会持久化，reload 后回到 default
  function unlockForTesting(name) {
    if (!(name in DEFAULTS)) {
      console.warn('[V19][FeatureFlags] unknown flag:', name)
      return false
    }
    console.warn(
      '[V19][FeatureFlags] ⚠️ unlockForTesting("' + name + '")\n' +
      '  此操作仅供调试期 / 测试账号灰度，不会持久化。\n' +
      '  禁止在生产账号或正常用户会话页面开启此 Flag。'
    )
    _flags[name] = true
    return true
  }

  function lock(name) {
    if (!(name in DEFAULTS)) return false
    _flags[name] = false
    return true
  }

  function _loadStorageFlags() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return
    chrome.storage.local.get(Object.keys(DEFAULTS), function (data) {
      if (chrome.runtime && chrome.runtime.lastError) return
      setFlags(data || {})
    })
    if (chrome.storage.onChanged && !window.__rpaFeatureFlagsStorageBound) {
      window.__rpaFeatureFlagsStorageBound = true
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local') return
        var next = {}
        var changed = false
        Object.keys(DEFAULTS).forEach(function (k) {
          if (changes[k]) {
            next[k] = changes[k].newValue
            changed = true
          }
        })
        if (changed) setFlags(next)
      })
    }
  }

  _loadStorageFlags()

  window.RpaFeatureFlags = {
    get:              get,
    snapshot:         snapshot,
    setFlags:         setFlags,
    unlockForTesting: unlockForTesting,
    lock:             lock,
  }

})()

// ============================================================
// MODULE: runtime/runtime-state-machine.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 RuntimeStateMachine（V1.9_Runtime_Protocol § 第六章）
  //
  // 设计原则：
  //   1. 禁止跨阶段跳转（例如 READING_MESSAGES 不能直接到 SENDING，必须经过 WAITING_STABLE / BUILDING_BATCH / DECIDING）
  //   2. 处于 SENDING/CONFIRMING/SYNCING 的实例不可被强制 STOPPED——只能等待自然结束或转为 ERROR
  //   3. 每次合法转换返回 { ok:true, from, to }；非法转换返回 { ok:false, reason }，调用方应记录 LK-ERROR

  var C = window.RpaConstants
  if (!C) throw new Error('[V19] RpaConstants must load before RuntimeStateMachine')

  var S = C.RuntimeState

  // 状态转换图：from → 允许的 to[]
  // STOPPED 是终态，无后继
  var TRANSITIONS = {}
  TRANSITIONS[S.IDLE]              = [S.SCANNING, S.STOPPED]
  TRANSITIONS[S.SCANNING]          = [S.SESSION_SWITCHING, S.IDLE, S.ERROR, S.STOPPED]
  TRANSITIONS[S.SESSION_SWITCHING] = [S.READING_MESSAGES, S.SCANNING, S.ERROR, S.STOPPED]
  TRANSITIONS[S.READING_MESSAGES]  = [S.WAITING_STABLE, S.ERROR, S.STOPPED]
  TRANSITIONS[S.WAITING_STABLE]    = [S.BUILDING_BATCH, S.READING_MESSAGES, S.ERROR, S.STOPPED]
  TRANSITIONS[S.BUILDING_BATCH]    = [S.DECIDING, S.ERROR, S.STOPPED]
  TRANSITIONS[S.DECIDING]          = [S.SENDING, S.SYNCING, S.ERROR, S.STOPPED]
  // SENDING / CONFIRMING / SYNCING：禁止 STOPPED，避免发送中被强制中断
  TRANSITIONS[S.SENDING]           = [S.CONFIRMING, S.ERROR]
  TRANSITIONS[S.CONFIRMING]        = [S.SYNCING, S.ERROR]
  TRANSITIONS[S.SYNCING]           = [S.IDLE, S.ERROR]
  TRANSITIONS[S.ERROR]             = [S.IDLE, S.STOPPED]
  TRANSITIONS[S.STOPPED]           = []

  function create(initial) {
    var current = initial || S.IDLE
    var listeners = []

    function canTransition(to) {
      var allowed = TRANSITIONS[current] || []
      return allowed.indexOf(to) >= 0
    }

    function transition(to, meta) {
      var from = current
      if (!canTransition(to)) {
        return { ok: false, from: from, to: to, reason: 'illegal-transition' }
      }
      current = to
      var event = { ok: true, from: from, to: to, meta: meta || null }
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](event) } catch (_) {}
      }
      return event
    }

    function onTransition(fn) {
      if (typeof fn === 'function') listeners.push(fn)
    }

    return {
      current:        function () { return current },
      canTransition:  canTransition,
      transition:     transition,
      onTransition:   onTransition,
    }
  }

  // 提供工具：判断某状态是否处于 "禁止中断" 区间（SENDING / CONFIRMING / SYNCING）
  // watchdog / stop 应据此决定是否强制清理
  function isCritical(state) {
    return state === S.SENDING || state === S.CONFIRMING || state === S.SYNCING
  }

  window.RpaRuntimeStateMachine = {
    create:      create,
    isCritical:  isCritical,
    TRANSITIONS: TRANSITIONS,
  }

})()

// ============================================================
// MODULE: runtime/lk-tracer.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 LK Tracer（V1.9_Runtime_Protocol § 第十章）
  //
  // 职责：
  //   1. 接收结构化 LK 日志（lk_code / stage / status / runtime_state / batchId / session_id / detail）
  //   2. 内存缓存 + 节流批量上送（POST /api/runtime/logs/batch）
  //   3. 上送失败时回退到本地缓存，下次再尝试
  //
  // 设计原则：
  //   - 单条立即可读，所以总是 console.log 一份（通过 RpaLogger）
  //   - 但服务端上送是批量、异步、节流的，不能阻塞 Runtime
  //   - 上送通过 chrome.runtime.sendMessage 转发到 background，content script 不直接 fetch

  var C = window.RpaConstants
  var Logger = window.RpaLogger
  if (!C || !Logger) throw new Error('[V19] RpaConstants / RpaLogger must load before LkTracer')

  var BUFFER_MAX     = C.Protocol.LK_BUFFER_MAX
  var FLUSH_INTERVAL = C.Protocol.LK_FLUSH_INTERVAL
  var BATCH_MAX      = C.Protocol.LK_BATCH_MAX

  var _state = {
    runtimeId:     '',
    platform:      'unknown',
    pageKey:       null,
    buffer:        [],   // 待上送
    pending:       [],   // 上送中（失败回滚到 buffer）
    flushTimer:    null,
    flushing:      false,
    droppedCount:  0,    // 缓冲区溢出丢弃数量（用于统计）
  }

  function _hasChromeMessaging() {
    return typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function'
  }

  function _startTimer() {
    if (_state.flushTimer) return
    _state.flushTimer = setInterval(flush, FLUSH_INTERVAL)
  }

  function _stopTimer() {
    if (_state.flushTimer) {
      clearInterval(_state.flushTimer)
      _state.flushTimer = null
    }
  }

  function init(opts) {
    opts = opts || {}
    if (opts.runtimeId) _state.runtimeId = opts.runtimeId
    if (opts.platform)  _state.platform  = opts.platform
    if (opts.pageKey)   _state.pageKey   = opts.pageKey
    _startTimer()
    Logger.info('LkTracer', 'init', { runtimeId: _state.runtimeId, platform: _state.platform, pageKey: _state.pageKey })
  }

  function setContext(ctx) {
    if (!ctx) return
    if (ctx.runtimeId !== undefined) _state.runtimeId = ctx.runtimeId
    if (ctx.platform  !== undefined) _state.platform  = ctx.platform
    if (ctx.pageKey   !== undefined) _state.pageKey   = ctx.pageKey
  }

  // 主入口：记录一条结构化 LK 日志
  // entry: { lk_code, stage, status, runtime_state, batchId, session_id, message, detail, platform?, pageKey? }
  function log(entry) {
    if (!entry || typeof entry !== 'object') return
    var record = {
      runtimeId:      entry.runtimeId      || _state.runtimeId      || '',
      platform:       entry.platform       || _state.platform       || 'unknown',
      pageKey:        entry.pageKey        || _state.pageKey        || null,
      lk_code:        entry.lk_code        || null,
      stage:          entry.stage          || null,
      status:         entry.status         || C.Status.SUCCESS,
      runtime_state:  entry.runtime_state  || null,
      batchId:        entry.batchId        || null,
      session_id:     entry.session_id     || null,
      message:        entry.message        || '',
      detail:         entry.detail         === undefined ? null : entry.detail,
      page_url:       (typeof location !== 'undefined' && location.href) ? location.href : null,
      ts:             Date.now(),
    }

    // 本地 console 输出（DEBUG 时打 detail，否则仅打关键字段）
    var consoleArgs = [
      record.lk_code || record.stage || 'lk',
      record.runtime_state || '',
      record.status,
      record.message || '',
    ]
    if (record.status === C.Status.FAILED || record.status === C.Status.WARNING) {
      Logger.warn.apply(null, ['LkTracer'].concat(consoleArgs))
    } else {
      Logger.info.apply(null, ['LkTracer'].concat(consoleArgs))
    }
    if (Logger.isDebug() && record.detail) Logger.debug('LkTracer', 'detail', record.detail)

    // 入缓冲区，必要时溢出
    _state.buffer.push(record)
    if (_state.buffer.length > BUFFER_MAX) {
      var dropped = _state.buffer.shift()
      _state.droppedCount++
      void dropped
    }
  }

  // 强制立即刷出（错误处理时使用）
  function flush() {
    if (_state.flushing) return Promise.resolve(false)
    if (!_state.buffer.length) return Promise.resolve(true)
    if (!_hasChromeMessaging()) return Promise.resolve(false)

    var batch = _state.buffer.slice(0, BATCH_MAX)
    _state.pending = batch
    _state.buffer  = _state.buffer.slice(batch.length)
    _state.flushing = true

    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'V19_LK_LOG_BATCH', logs: batch },
          function (resp) {
            _state.flushing = false
            var ok = resp && resp.ok
            if (!ok) {
              // 回滚 pending 到 buffer 头部，下次重试
              _state.buffer = _state.pending.concat(_state.buffer)
              Logger.warn('LkTracer', 'flush failed, will retry', resp && resp.error)
            }
            _state.pending = []
            resolve(!!ok)
          }
        )
      } catch (err) {
        // sendMessage 抛错（background 不可用）
        _state.flushing = false
        _state.buffer = _state.pending.concat(_state.buffer)
        _state.pending = []
        Logger.warn('LkTracer', 'flush throw', err && err.message)
        resolve(false)
      }
    })
  }

  function stop(reasonDetail) {
    _stopTimer()
    return flush().finally(function () {
      Logger.info('LkTracer', 'stopped', { dropped: _state.droppedCount, reason: reasonDetail || null })
    })
  }

  function snapshot() {
    return {
      runtimeId:     _state.runtimeId,
      bufferSize:    _state.buffer.length,
      pendingSize:   _state.pending.length,
      droppedCount:  _state.droppedCount,
      flushing:      _state.flushing,
    }
  }

  window.RpaLkTracer = {
    init:        init,
    setContext:  setContext,
    log:         log,
    flush:       flush,
    stop:        stop,
    snapshot:    snapshot,
  }

})()

// ============================================================
// MODULE: runtime/adapter-registry.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 Adapter Registry（V1.9_技术方案 § 6）
  //
  // 与历史 PRAAdapterRuntime 共存：
  //   - PRAAdapterRuntime（runtime/adapter-runtime.js）服务于 V1.x legacy 的 customer_service / live 场景调度
  //   - RpaAdapterRegistry（本文件）服务于 V1.9 PlatformPageAdapter 接口
  //
  // W5 后 Adapter 只保留采集探针接口：
  //   {
  //     adapterKey:   string           — 唯一键，建议 "platform/pageKey"
  //     platform:     string
  //     pageKey:      string
  //     matchPage(location): boolean
  //     detectSessions(): Promise<RawSession[]>
  //     selectTriggerSession(sessions): Promise<RawSession | null>
  //     switchSession(session): Promise<SwitchResult>
  //     confirmActiveSession(session): Promise<boolean>
  //     getMessages(session): Promise<RawMessage[]>
  //     classifyMessage(rawMessage): NormalizedMessage
  //     toConversationEvent(rawMessage, sessionInfo): ConversationEvent
  //     buildRuntimeContext(): RuntimePageContext
  //   }
  //
  // 发送/自动回复链路已于 W5 移除，registry 只负责页面匹配和采集 adapter 分发。

  var Logger = window.RpaLogger
  if (!Logger) throw new Error('[V19] RpaLogger must load before AdapterRegistry')

  var REQUIRED_FIELDS = ['adapterKey', 'platform', 'pageKey']
  var REQUIRED_METHODS = ['getMessages', 'toConversationEvent']
  var OPTIONAL_METHODS = [
    'matchPage',
    'detectSessions',
    'selectTriggerSession',
    'switchSession',
    'confirmActiveSession',
    'getMessages',
    'classifyMessage',
    'toConversationEvent',
    'buildRuntimeContext',
  ]

  var _adapters = []   // 注册顺序，便于 resolve 选择"最先匹配"

  function _validate(adapter) {
    if (!adapter || typeof adapter !== 'object') return 'adapter must be object'
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
      var k = REQUIRED_FIELDS[i]
      if (!adapter[k] || typeof adapter[k] !== 'string') return 'missing field: ' + k
    }
    for (var j = 0; j < REQUIRED_METHODS.length; j++) {
      var m = REQUIRED_METHODS[j]
      if (typeof adapter[m] !== 'function') return 'missing method: ' + m
    }
    return null
  }

  function register(adapter) {
    var err = _validate(adapter)
    if (err) {
      Logger.error('AdapterRegistry', 'register rejected:', err, adapter)
      throw new Error('[V19] AdapterRegistry.register: ' + err)
    }
    // 同 key 覆盖
    _adapters = _adapters.filter(function (a) { return a.adapterKey !== adapter.adapterKey })
    _adapters.push(adapter)
    Logger.info('AdapterRegistry', 'registered', adapter.adapterKey)
    return adapter
  }

  function unregister(adapterKey) {
    var before = _adapters.length
    _adapters = _adapters.filter(function (a) { return a.adapterKey !== adapterKey })
    return before !== _adapters.length
  }

  function list() {
    return _adapters.slice()
  }

  function getByKey(adapterKey) {
    for (var i = 0; i < _adapters.length; i++) {
      if (_adapters[i].adapterKey === adapterKey) return _adapters[i]
    }
    return null
  }

  // 按 platform + pageKey 精确匹配；都为空时表示"任意"
  function getByPage(platform, pageKey) {
    for (var i = 0; i < _adapters.length; i++) {
      var a = _adapters[i]
      if (platform && a.platform !== platform) continue
      if (pageKey  && a.pageKey  !== pageKey)  continue
      return a
    }
    return null
  }

  // 让 adapter 自己用 matchPage() 决定是否匹配
  function resolve(location) {
    var loc = location || (typeof window !== 'undefined' ? window.location : null)
    for (var i = 0; i < _adapters.length; i++) {
      var a = _adapters[i]
      if (typeof a.matchPage === 'function') {
        try {
          if (a.matchPage(loc)) return a
        } catch (err) {
          Logger.warn('AdapterRegistry', 'matchPage threw', a.adapterKey, err && err.message)
        }
      }
    }
    return null
  }

  // 工具：检查 adapter 是否实现了某个方法（区分"未实现"与"返回 null"）
  function hasMethod(adapter, methodName) {
    return !!(adapter && typeof adapter[methodName] === 'function')
  }

  window.RpaAdapterRegistry = {
    register:             register,
    unregister:           unregister,
    list:                 list,
    getByKey:             getByKey,
    getByPage:            getByPage,
    resolve:              resolve,
    hasMethod:            hasMethod,
    OPTIONAL_METHODS:     OPTIONAL_METHODS,
  }

})()

// ============================================================
// MODULE: runtime/batch-manager.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 BatchManager（V1.9_Runtime_Protocol § 第三章 + V1.9_技术方案 § 8）
  //
  // 职责：管理"一次完整对话处理"的生命周期。
  //   ⚠ batch 不是消息列表，而是【这一轮处理任务】。
  //   一个 batch 可能包含多条用户连续消息、一次决策、一次发送、一次确认。
  //
  // batchId 与 batch_hash 的区分：
  //   - batchId   = fnv64(session_id + first_inbound_text + first_timestamp)
  //                 唯一标识"哪一轮对话",同一轮内不变,合并消息时 batch_hash 会变但 batchId 不变
  //   - batch_hash= fnv64(session_id + 所有用户消息内容拼接 + 所有时间戳拼接)
  //                 去重指纹,用于服务端唯一约束 (platform+pageKey+session_id+batch_hash)
  //
  // ⚠ Caller 约束：
  //   session_id 必须全局唯一。生产路径由 SessionIdentityResolver 派生，
  //   resolver 内部 fnv64(platform | pageKey | account | userKey) 已含 platform，
  //   因此同一 user 跨平台拿到的 session_id 必然不同 → batchId 也不会跨平台碰撞。
  //   如果调用方手工构造 session_id 字面值，跨平台传同字符串会导致 _byId 覆盖。
  //   该场景在生产路径不应出现，单元测试若需要请用 resolver 派生。
  //
  // M2 范围：本地状态机 + 唯一约束去重，不负责消息聚合时机（stable_wait 在 M4）。

  var C      = window.RpaConstants
  var Hash   = window.RpaHash
  var Tracer = window.RpaLkTracer
  var Logger = window.RpaLogger
  if (!C || !Hash || !Tracer || !Logger) {
    throw new Error('[V19] BatchManager dependencies missing')
  }

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  // batch 状态机
  var BatchStatus = {
    NEW:          'NEW',
    COLLECTING:   'COLLECTING',
    STABLE_WAIT:  'STABLE_WAIT',
    DECIDING:     'DECIDING',
    SENDING:      'SENDING',
    CONFIRMING:   'CONFIRMING',
    SYNCING:      'SYNCING',
    DONE:         'DONE',
    FAILED:       'FAILED',
    ABORTED:      'ABORTED',
  }

  // 允许的状态转换
  var TRANS = {}
  TRANS[BatchStatus.NEW]         = [BatchStatus.COLLECTING, BatchStatus.ABORTED]
  TRANS[BatchStatus.COLLECTING]  = [BatchStatus.STABLE_WAIT, BatchStatus.ABORTED, BatchStatus.FAILED]
  TRANS[BatchStatus.STABLE_WAIT] = [BatchStatus.DECIDING, BatchStatus.COLLECTING, BatchStatus.ABORTED, BatchStatus.FAILED]
  TRANS[BatchStatus.DECIDING]    = [BatchStatus.SENDING, BatchStatus.SYNCING, BatchStatus.FAILED, BatchStatus.ABORTED]
  TRANS[BatchStatus.SENDING]     = [BatchStatus.CONFIRMING, BatchStatus.FAILED]
  TRANS[BatchStatus.CONFIRMING]  = [BatchStatus.SYNCING, BatchStatus.FAILED]
  TRANS[BatchStatus.SYNCING]     = [BatchStatus.DONE, BatchStatus.FAILED]
  TRANS[BatchStatus.DONE]        = []
  TRANS[BatchStatus.FAILED]      = [BatchStatus.ABORTED]
  TRANS[BatchStatus.ABORTED]     = []

  function isTerminal(status) {
    return status === BatchStatus.DONE || status === BatchStatus.ABORTED || status === BatchStatus.FAILED
  }

  // ── 内存索引 ────────────────────────────────────────────────────
  // _byId:   batchId    → batch object
  // _byUniq: uniqKey    → batchId       （uniqKey = platform|pageKey|session_id|batch_hash）
  // 双索引便于 reload 后从 uniq 去重
  var _byId   = Object.create(null)
  var _byUniq = Object.create(null)

  function _uniqKey(b) {
    return [b.platform, b.pageKey, b.session_id, b.batch_hash].join('|')
  }

  function _computeBatchId(session_id, firstInbound) {
    var first = firstInbound || {}
    return Hash.joinAndHash([session_id, first.content || '', first.timestamp || ''], Hash.fnv64)
  }

  function _computeBatchHash(session_id, inbounds) {
    var contents = (inbounds || []).map(function (m) { return m.content || '' }).join('|')
    var times    = (inbounds || []).map(function (m) { return m.timestamp || '' }).join('|')
    return Hash.joinAndHash([session_id, contents, times], Hash.fnv64)
  }

  // 创建 batch；如果同 uniqKey 已存在并且未结束，返回旧 batch（实现幂等）
  function create(opts) {
    opts = opts || {}
    if (!opts.platform || !opts.pageKey || !opts.session_id) {
      throw new Error('[V19] BatchManager.create requires platform/pageKey/session_id')
    }
    var inbounds = Array.isArray(opts.inbound_messages) ? opts.inbound_messages : []
    var batch_id   = opts.batch_id   || _computeBatchId(opts.session_id, inbounds[0])
    var batch_hash = opts.batch_hash || _computeBatchHash(opts.session_id, inbounds)

    var probe = {
      platform:   opts.platform,
      pageKey:    opts.pageKey,
      session_id: opts.session_id,
      batch_hash: batch_hash,
    }
    var uniq = _uniqKey(probe)

    var existing = _byUniq[uniq] && _byId[_byUniq[uniq]]
    if (existing && !isTerminal(existing.status)) {
      Logger.info('BatchManager', 'create returned existing batch', existing.batch_id)
      return existing
    }
    if (existing && isTerminal(existing.status)) {
      // 已完成的 batch 不允许重新激活，避免 reload 重复处理
      Tracer.log({
        lk_code:   LK.ERR_DUPLICATE,
        stage:     Stage.MESSAGE,
        status:    Status.WARNING,
        message:   'duplicate batch rejected (already terminal)',
        batchId:   existing.batch_id,
        session_id: existing.session_id,
        detail:    { existingStatus: existing.status, uniq: uniq },
      })
      return null
    }

    var batch = {
      batch_id:        batch_id,
      batch_hash:      batch_hash,
      platform:        opts.platform,
      pageKey:         opts.pageKey,
      session_id:      opts.session_id,
      status:          BatchStatus.NEW,
      inbound_messages: inbounds.slice(),
      outbound_messages: [],
      decision_source: null,
      send_confirm_status: null,
      first_message_at: inbounds[0] && inbounds[0].timestamp || null,
      last_message_at:  inbounds.length ? inbounds[inbounds.length - 1].timestamp || null : null,
      created_at:      Date.now(),
      updated_at:      Date.now(),
    }
    _byId[batch_id]   = batch
    _byUniq[uniq]     = batch_id

    Tracer.log({
      lk_code:   LK.MSG_BATCH_BUILD,
      stage:     Stage.MESSAGE,
      status:    Status.SUCCESS,
      message:   'batch created',
      batchId:   batch_id,
      session_id: opts.session_id,
      detail:    { inbound: inbounds.length, batch_hash: batch_hash },
    })
    return batch
  }

  function get(batch_id) {
    return _byId[batch_id] || null
  }

  // 状态机迁移
  function transition(batch_id, to, meta) {
    var batch = _byId[batch_id]
    if (!batch) return { ok: false, reason: 'batch not found' }
    var allowed = TRANS[batch.status] || []
    if (allowed.indexOf(to) < 0) {
      Tracer.log({
        lk_code:   LK.ERR_DUPLICATE,
        stage:     Stage.MESSAGE,
        status:    Status.FAILED,
        message:   'illegal batch transition: ' + batch.status + ' → ' + to,
        batchId:   batch_id,
        session_id: batch.session_id,
        detail:    { from: batch.status, to: to, meta: meta || null },
      })
      return { ok: false, from: batch.status, to: to, reason: 'illegal-transition' }
    }
    var from = batch.status
    batch.status = to
    batch.updated_at = Date.now()
    if (meta && meta.decision_source) batch.decision_source = meta.decision_source
    if (meta && meta.send_confirm_status) batch.send_confirm_status = meta.send_confirm_status

    Tracer.log({
      lk_code:   to === BatchStatus.DONE ? LK.SYNC_BATCH_FINAL : LK.MSG_BATCH_BUILD,
      stage:     Stage.MESSAGE,
      status:    Status.SUCCESS,
      message:   'batch ' + from + ' → ' + to,
      batchId:   batch_id,
      session_id: batch.session_id,
      detail:    { from: from, to: to, meta: meta || null },
    })
    return { ok: true, from: from, to: to }
  }

  // 合并新的入站消息到现有 batch；batch_hash 会重算并迁移到新 uniq
  function mergeInbound(batch_id, messages) {
    var batch = _byId[batch_id]
    if (!batch) return null
    if (isTerminal(batch.status)) return null

    var oldUniq = _uniqKey(batch)
    batch.inbound_messages = batch.inbound_messages.concat(messages || [])
    batch.last_message_at = (messages && messages.length)
      ? (messages[messages.length - 1].timestamp || batch.last_message_at)
      : batch.last_message_at
    batch.batch_hash = _computeBatchHash(batch.session_id, batch.inbound_messages)
    batch.updated_at = Date.now()

    var newUniq = _uniqKey(batch)
    if (oldUniq !== newUniq) {
      delete _byUniq[oldUniq]
      _byUniq[newUniq] = batch_id
    }
    return batch
  }

  function recordOutbound(batch_id, message) {
    var batch = _byId[batch_id]
    if (!batch) return null
    batch.outbound_messages.push(message)
    batch.updated_at = Date.now()
    return batch
  }

  function setConfirm(batch_id, confirmStatus) {
    var batch = _byId[batch_id]
    if (!batch) return null
    batch.send_confirm_status = confirmStatus
    batch.updated_at = Date.now()
    return batch
  }

  function abort(batch_id, reason) {
    var batch = _byId[batch_id]
    if (!batch) return false
    if (isTerminal(batch.status)) return false
    return transition(batch_id, BatchStatus.ABORTED, { reason: reason }).ok
  }

  // 用于 RecoveryManager 重建索引
  function rehydrate(batchList) {
    if (!Array.isArray(batchList)) return 0
    var n = 0
    batchList.forEach(function (b) {
      if (!b || !b.batch_id) return
      _byId[b.batch_id]   = b
      _byUniq[_uniqKey(b)] = b.batch_id
      n++
    })
    return n
  }

  function snapshot() {
    var arr = []
    for (var k in _byId) {
      if (Object.prototype.hasOwnProperty.call(_byId, k)) arr.push(_byId[k])
    }
    return arr
  }

  function reset() {
    _byId   = Object.create(null)
    _byUniq = Object.create(null)
  }

  // ── M4: stable_wait ─────────────────────────────────────────────
  // 等待 batch 的 inbound_messages 在 stableMs 内不再新增。
  // 调用方：M4 RuntimeManager 在 BUILDING_BATCH 前等待消息稳定。
  //
  // refetchMessages: 函数 → 返回当前页面用户侧消息数组（adapter.getMessages 过滤 inbound）
  //                  传入则会进入主动拉取模式；否则只等待外部 mergeInbound 触发
  // stableMs:        消息不增量持续多久视为稳定（默认 1500ms）
  // maxWaitMs:       总等待上限（避免饥饿，默认 8000ms）
  function stableWait(batch_id, opts) {
    opts = opts || {}
    var stableMs  = opts.stableMs  || 1500
    var maxWaitMs = opts.maxWaitMs || 8000
    var intervalMs = opts.intervalMs || 200
    var refetch   = typeof opts.refetchMessages === 'function' ? opts.refetchMessages : null
    var start     = Date.now()
    var batch     = _byId[batch_id]
    if (!batch) return Promise.resolve({ stable: false, reason: 'batch-missing' })

    var lastCount = batch.inbound_messages.length
    var lastChangeAt = Date.now()

    Tracer.log({
      lk_code: LK.MSG_STABLE_WAIT, stage: Stage.MESSAGE, status: Status.SUCCESS,
      batchId: batch_id, session_id: batch.session_id,
      message: 'stable_wait started',
      detail:  { stableMs: stableMs, maxWaitMs: maxWaitMs, initialCount: lastCount },
    })

    return new Promise(function (resolve) {
      function _tick() {
        var b = _byId[batch_id]
        if (!b) return resolve({ stable: false, reason: 'batch-disappeared' })

        // 主动拉取：如果 adapter 提供 refetchMessages，每轮调用合并
        if (refetch) {
          try {
            var fresh = refetch() || []
            if (fresh.length > b.inbound_messages.length) {
              var newOnes = fresh.slice(b.inbound_messages.length)
              mergeInbound(batch_id, newOnes)
            }
          } catch (_) {}
        }

        b = _byId[batch_id]
        var curCount = b.inbound_messages.length
        if (curCount !== lastCount) {
          lastCount = curCount
          lastChangeAt = Date.now()
        }

        var sinceChange = Date.now() - lastChangeAt
        if (sinceChange >= stableMs) {
          Tracer.log({
            lk_code: LK.MSG_STABLE_WAIT, stage: Stage.MESSAGE, status: Status.SUCCESS,
            batchId: batch_id, session_id: b.session_id,
            message: 'stable_wait satisfied',
            detail:  { count: curCount, sinceChange: sinceChange },
          })
          return resolve({ stable: true, count: curCount })
        }

        if (Date.now() - start >= maxWaitMs) {
          Tracer.log({
            lk_code: LK.MSG_STABLE_WAIT, stage: Stage.MESSAGE, status: Status.WARNING,
            batchId: batch_id, session_id: b.session_id,
            message: 'stable_wait timeout',
            detail:  { count: curCount, waited: Date.now() - start },
          })
          return resolve({ stable: false, reason: 'max-wait-exceeded', count: curCount })
        }
        setTimeout(_tick, intervalMs)
      }
      _tick()
    })
  }

  // ── M4: 公开的"上报到服务端"辅助 ─────────────────────────────────
  // 把 batch 当前快照通过 chrome.runtime.sendMessage('V19_BATCH_UPSERT') 转发到 background
  // 调用方：RuntimeManager 在状态机迁移到 DECIDING / DONE / FAILED 时主动触发
  function finalizeRemote(batch_id) {
    var batch = _byId[batch_id]
    if (!batch) return Promise.resolve({ ok: false, error: 'batch-missing' })
    if (typeof chrome === 'undefined' || !chrome.runtime) return Promise.resolve({ ok: false, error: 'no-chrome' })

    var payload = {
      batch_id:           batch.batch_id,
      batch_hash:         batch.batch_hash,
      platform:           batch.platform,
      page_key:           batch.pageKey,
      session_id:         batch.session_id,
      status:             batch.status,
      inbound_count:      batch.inbound_messages.length,
      outbound_count:     batch.outbound_messages.length,
      first_message_at:   batch.first_message_at,
      last_message_at:    batch.last_message_at,
      decision_source:    batch.decision_source,
      send_confirm_status: batch.send_confirm_status,
    }
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ action: 'V19_BATCH_UPSERT', batch: payload }, function (resp) {
          resolve(resp || { ok: false })
        })
      } catch (err) {
        resolve({ ok: false, error: (err && err.message) || 'send-failed' })
      }
    })
  }

  window.RpaBatchManager = {
    BatchStatus:      BatchStatus,
    TRANSITIONS:      TRANS,
    isTerminal:       isTerminal,
    create:           create,
    get:              get,
    transition:       transition,
    mergeInbound:     mergeInbound,
    recordOutbound:   recordOutbound,
    setConfirm:       setConfirm,
    abort:            abort,
    rehydrate:        rehydrate,
    snapshot:         snapshot,
    reset:            reset,
    // M4
    stableWait:       stableWait,
    finalizeRemote:   finalizeRemote,
  }

})()

// ============================================================
// MODULE: runtime/queue-manager.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 QueueManager（V1.9_Runtime_Protocol § 第十一章 + V1.9_技术方案 § 9）
  //
  // Queue 不是消息队列，是 batch 调度器。
  // 调度约束（V1.9_技术方案 § 9.4）：
  //   1. 同 session 同时只允许一个 batch 处于 processing
  //   2. 同 batchId 不重复入队
  //   3. 老 batch 不应饥饿（FIFO 兜底 + priority）
  //   4. L3 unstable session 不进入自动回复队列（M4 落地，本模块仅在 enqueue 时拒绝）
  //   5. STOPPED 状态不允许继续处理
  //
  // 持久化：chrome.storage.local["rpa_v19_queue"]
  // 结构：{ queue: QueueItem[], processing: batchId | null, paused: bool, updated_at }

  var C      = window.RpaConstants
  var Tracer = window.RpaLkTracer
  var Logger = window.RpaLogger
  if (!C || !Tracer || !Logger) {
    throw new Error('[V19] QueueManager dependencies missing')
  }

  var STORAGE_KEY = 'rpa_v19_queue'
  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  // 内存镜像（chrome.storage 是异步，所有写操作 = 改内存 + persist；读优先从内存）
  var _state = {
    queue:       [],      // QueueItem[]
    processing:  null,    // 当前处理中的 batchId
    paused:      false,
    updated_at:  0,
    persisting:  false,
  }

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  function _persist() {
    if (!_hasStorage()) return Promise.resolve(false)
    _state.updated_at = Date.now()
    var snapshot = {
      queue:      _state.queue,
      processing: _state.processing,
      paused:     _state.paused,
      updated_at: _state.updated_at,
    }
    return new Promise(function (resolve) {
      var data = {}
      data[STORAGE_KEY] = snapshot
      try {
        chrome.storage.local.set(data, function () { resolve(true) })
      } catch (err) {
        Logger.warn('QueueManager', 'persist failed', err && err.message)
        resolve(false)
      }
    })
  }

  function init() {
    if (!_hasStorage()) {
      Logger.warn('QueueManager', 'chrome.storage.local unavailable; using memory only')
      return Promise.resolve()
    }
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(STORAGE_KEY, function (data) {
          var stored = data && data[STORAGE_KEY]
          if (stored && typeof stored === 'object') {
            _state.queue      = Array.isArray(stored.queue) ? stored.queue : []
            _state.processing = stored.processing || null
            _state.paused     = !!stored.paused
            _state.updated_at = stored.updated_at || 0
            Logger.info('QueueManager', 'restored', { size: _state.queue.length, processing: _state.processing })
          }
          resolve()
        })
      } catch (err) {
        Logger.warn('QueueManager', 'init failed', err && err.message)
        resolve()
      }
    })
  }

  function enqueue(item) {
    if (!item || !item.batchId || !item.session_id) {
      throw new Error('[V19] QueueManager.enqueue requires batchId / session_id')
    }
    if (item.unstable) {
      Tracer.log({
        lk_code:   LK.SEND_PRECHECK,
        stage:     Stage.MESSAGE,
        status:    Status.SKIPPED,
        message:   'enqueue rejected: unstable session_id (L3)',
        batchId:   item.batchId,
        session_id: item.session_id,
        detail:    { item: item },
      })
      return false
    }

    // 重复检查：batchId 已存在则跳过
    for (var i = 0; i < _state.queue.length; i++) {
      if (_state.queue[i].batchId === item.batchId) {
        return false
      }
    }
    if (_state.processing === item.batchId) return false

    var queueItem = {
      batchId:     item.batchId,
      session_id:  item.session_id,
      platform:    item.platform || 'unknown',
      pageKey:     item.pageKey  || null,
      priority:    item.priority || 0,
      status:      'queued',
      retry_count: 0,
      created_at:  Date.now(),
      updated_at:  Date.now(),
    }
    _state.queue.push(queueItem)
    // 按 priority 降序，FIFO 内部稳定
    _state.queue.sort(function (a, b) {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.created_at - b.created_at
    })
    _persist()
    return true
  }

  // 取下一个可处理的 batch；遵守 "同 session 同时只允许一个 processing"
  // 此调用不会标记 processing，需要 markProcessing() 显式调度
  function peekNext() {
    if (_state.paused || _state.processing) return null
    // 找第一个 status==queued 的 item
    for (var i = 0; i < _state.queue.length; i++) {
      if (_state.queue[i].status === 'queued') return _state.queue[i]
    }
    return null
  }

  function markProcessing(batchId) {
    if (_state.processing && _state.processing !== batchId) {
      Logger.warn('QueueManager', 'markProcessing collision', { current: _state.processing, requested: batchId })
      return false
    }
    var item = _findItem(batchId)
    if (!item) return false
    item.status = 'processing'
    item.updated_at = Date.now()
    _state.processing = batchId
    _persist()
    return true
  }

  function markDone(batchId) {
    var item = _findItem(batchId)
    if (!item) return false
    item.status = 'done'
    item.updated_at = Date.now()
    if (_state.processing === batchId) _state.processing = null
    // 已 done 的从队列移除（保留索引由 chat_batches 维护）
    _state.queue = _state.queue.filter(function (x) { return x.batchId !== batchId })
    _persist()
    return true
  }

  function markFailed(batchId, reason) {
    var item = _findItem(batchId)
    if (!item) return false
    item.status = 'failed'
    item.retry_count = (item.retry_count || 0) + 1
    item.last_reason = reason || null
    item.updated_at = Date.now()
    if (_state.processing === batchId) _state.processing = null
    _persist()
    return true
  }

  // 把 status==processing 的项重置为 queued（仅 RecoveryManager 在 reload 后调用）
  function resetStuckProcessing() {
    var n = 0
    _state.queue.forEach(function (it) {
      if (it.status === 'processing') { it.status = 'queued'; n++ }
    })
    _state.processing = null
    if (n > 0) _persist()
    return n
  }

  function _findItem(batchId) {
    for (var i = 0; i < _state.queue.length; i++) {
      if (_state.queue[i].batchId === batchId) return _state.queue[i]
    }
    return null
  }

  function pause() { _state.paused = true; _persist() }
  function resume() { _state.paused = false; _persist() }

  function clear() {
    _state.queue = []
    _state.processing = null
    _persist()
  }

  function snapshot() {
    return {
      queue:      _state.queue.slice(),
      processing: _state.processing,
      paused:     _state.paused,
      updated_at: _state.updated_at,
    }
  }

  window.RpaQueueManager = {
    init:                  init,
    enqueue:               enqueue,
    peekNext:              peekNext,
    markProcessing:        markProcessing,
    markDone:              markDone,
    markFailed:            markFailed,
    resetStuckProcessing:  resetStuckProcessing,
    pause:                 pause,
    resume:                resume,
    clear:                 clear,
    snapshot:              snapshot,
  }

})()

// ============================================================
// MODULE: runtime/event-queue.js
// ============================================================

;(function () {
  'use strict'

  var Logger = window.RpaLogger || console
  var STORAGE_KEY = 'chatsift_event_queue'
  var _queue = []
  var _restored = false
  var _listeners = []

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  function _storageGet(key) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(key, function (data) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(data || {})
      })
    })
  }

  function _storageSet(data) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve(false)
      chrome.storage.local.set(data, function () {
        resolve(!(chrome.runtime && chrome.runtime.lastError))
      })
    })
  }

  async function restore() {
    var data = await _storageGet(STORAGE_KEY)
    _queue = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].slice() : []
    _restored = true
    Logger.info && Logger.info('EventQueue', 'restored', { size: _queue.length })
    return _queue.length
  }

  async function persist() {
    var data = {}
    data[STORAGE_KEY] = _queue.slice()
    return _storageSet(data)
  }

  function enqueue(event) {
    if (!event) return false
    _queue.push(event)
    persist()
    _notify()
    return true
  }

  function dequeueBatch(n) {
    var max = Math.max(0, Number(n) || 0)
    if (!max || !_queue.length) return []
    return _queue.splice(0, max)
  }

  function requeueFront(events) {
    if (!Array.isArray(events) || !events.length) return false
    _queue = events.concat(_queue)
    persist()
    return true
  }

  function size() { return _queue.length }

  function snapshot() {
    return { storageKey: STORAGE_KEY, size: _queue.length, restored: _restored }
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return false
    _listeners.push(fn)
    return function () {
      _listeners = _listeners.filter(function (item) { return item !== fn })
    }
  }

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(_queue.length) } catch (_) {}
    })
  }

  window.RpaEventQueue = {
    enqueue:      enqueue,
    dequeueBatch: dequeueBatch,
    requeueFront: requeueFront,
    persist:      persist,
    restore:      restore,
    size:         size,
    snapshot:     snapshot,
    onChange:     onChange,
  }
})()

// ============================================================
// MODULE: runtime/event-collector.js
// ============================================================

;(function () {
  'use strict'

  var Queue = window.RpaEventQueue
  var Logger = window.RpaLogger || console
  if (!Queue) throw new Error('[W4] RpaEventQueue must load before EventCollector')

  var STORAGE_KEY = 'chatsift_event_seen_ids'
  var MAX_SEEN = 1000
  var _seen = new Set()
  var _loaded = false

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  function _storageGet(key) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(key, function (data) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(data || {})
      })
    })
  }

  function _storageSet(data) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve(false)
      chrome.storage.local.set(data, function () {
        resolve(!(chrome.runtime && chrome.runtime.lastError))
      })
    })
  }

  async function restoreSeen() {
    var data = await _storageGet(STORAGE_KEY)
    var ids = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : []
    _seen = new Set(ids)
    _loaded = true
    return _seen.size
  }

  function _persistSeen() {
    var ids = Array.from(_seen)
    if (ids.length > MAX_SEEN) ids = ids.slice(ids.length - MAX_SEEN)
    _seen = new Set(ids)
    var data = {}
    data[STORAGE_KEY] = ids
    _storageSet(data)
  }

  async function collect(events) {
    if (!_loaded) await restoreSeen()
    var list = Array.isArray(events) ? events : []
    var collected = 0
    var skipped = 0
    list.forEach(function (event) {
      var id = event && event.message_id
      if (!id || _seen.has(id)) {
        skipped += 1
        return
      }
      _seen.add(id)
      Queue.enqueue(event)
      collected += 1
    })
    if (collected) _persistSeen()
    Logger.info && Logger.info('EventCollector', 'collect', { collected: collected, skipped: skipped })
    return { collected: collected, skipped: skipped }
  }

  function resetSeenForTesting() {
    _seen = new Set()
    _loaded = true
    var data = {}
    data[STORAGE_KEY] = []
    _storageSet(data)
  }

  window.RpaEventCollector = {
    collect:             collect,
    restoreSeen:         restoreSeen,
    resetSeenForTesting: resetSeenForTesting,
  }
})()

// ============================================================
// MODULE: runtime/instance-identity.js
// ============================================================

;(function () {
  'use strict'

  // W20-D1:采集实例标识 + heartbeat。
  //   device_id / browser_profile_id:chrome.storage.local 持久(首次随机),跨会话稳定。
  //   tab_id:sessionStorage 每页签一个。collector_instance_id = hash(三者),作 server 实例唯一键。
  //   getIdentity() 取/首次生成;sendHeartbeat(context) 上报当前 account/conv,返回 {conflict, action}。
  //   ★只生成随机标识 + 采集维度,只读不越界(红线 R4)。

  var Hash = window.RpaHash
  var Logger = window.RpaLogger || console
  var DEFAULT_SERVER_URL = 'https://admin.kongyuekeji.com'
  var DEVICE_KEY = 'w20_device_id'
  var PROFILE_KEY = 'w20_browser_profile_id'
  var TAB_KEY = 'w20_tab_id'
  var _identity = null

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }
  function _get(keys) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(keys, function (d) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(d || {})
      })
    })
  }
  function _set(obj) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve(false)
      chrome.storage.local.set(obj, function () { resolve(!(chrome.runtime && chrome.runtime.lastError)) })
    })
  }
  function _rand() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) }

  function _sessionTabId() {
    try {
      var v = window.sessionStorage.getItem(TAB_KEY)
      if (!v) { v = 't_' + _rand(); window.sessionStorage.setItem(TAB_KEY, v) }
      return v
    } catch (_) {
      return 't_' + _rand() // sessionStorage 不可用 → 退化为内存标识
    }
  }

  async function getIdentity() {
    if (_identity) return _identity
    var data = await _get([DEVICE_KEY, PROFILE_KEY])
    var deviceId = data[DEVICE_KEY]
    var profileId = data[PROFILE_KEY]
    var toSet = {}
    if (!deviceId) { deviceId = 'd_' + _rand(); toSet[DEVICE_KEY] = deviceId }
    if (!profileId) { profileId = 'bp_' + _rand(); toSet[PROFILE_KEY] = profileId }
    if (Object.keys(toSet).length) await _set(toSet)
    var tabId = _sessionTabId()
    var cid = Hash && Hash.joinAndHash
      ? Hash.joinAndHash([deviceId, profileId, tabId])
      : String(deviceId) + String(profileId) + String(tabId)
    _identity = { device_id: deviceId, browser_profile_id: profileId, tab_id: tabId, collector_instance_id: cid }
    return _identity
  }

  function _normalizeBaseUrl(url) {
    var n = String(url || DEFAULT_SERVER_URL).replace(/\/$/, '')
    if (n === 'http://127.0.0.1:3000' || n === 'http://localhost:3000') return DEFAULT_SERVER_URL
    return n
  }
  async function _loadAuth() {
    var data = await _get(['token', 'authToken', 'accessToken', 'cfg', 'serverUrl', 'auth'])
    var cfg = data.cfg || {}
    var auth = data.auth || {}
    return {
      token: data.token || data.authToken || data.accessToken || auth.token || auth.accessToken || '',
      serverUrl: _normalizeBaseUrl(cfg.serverUrl || data.serverUrl || auth.serverUrl),
    }
  }

  // 上报当前采集上下文的 heartbeat。返回 {conflict, action} 或 null(失败不阻断采集)。
  async function sendHeartbeat(context) {
    try {
      var id = await getIdentity()
      var auth = await _loadAuth()
      if (!auth.token) return null
      var body = {
        collector_instance_id: id.collector_instance_id,
        device_id: id.device_id,
        browser_profile_id: id.browser_profile_id,
        tab_id: id.tab_id,
        platform: (context && context.platform) || null,
        platform_page: (context && context.platform_page) || null,
        account_biz_id: (context && context.account_biz_id) || null,
        conversation_id: (context && context.conversation_id) || null,
      }
      var resp = await fetch(auth.serverUrl + '/api/v1/events/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token },
        body: JSON.stringify(body),
      })
      if (!resp.ok) return null
      var json = {}
      try { json = await resp.json() } catch (_) {}
      return (json && json.data) || null
    } catch (err) {
      Logger.warn && Logger.warn('InstanceIdentity', 'heartbeat failed', { error: err && err.message })
      return null
    }
  }

  window.RpaInstanceIdentity = {
    getIdentity: getIdentity,
    sendHeartbeat: sendHeartbeat,
  }
})()

// ============================================================
// MODULE: runtime/event-uploader.js
// ============================================================

;(function () {
  'use strict'

  var Queue = window.RpaEventQueue
  var Logger = window.RpaLogger || console
  if (!Queue) throw new Error('[W4] RpaEventQueue must load before EventUploader')

  var UPLOAD_INTERVAL = 15000
  var UPLOAD_FLUSH_SIZE = 10
  var UPLOAD_BATCH_MAX = 50
  var DEFAULT_SERVER_URL = 'https://admin.kongyuekeji.com'
  var _timer = null
  var _uploading = false
  var _offQueueChange = null

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  function _storageGet(keys) {
    return new Promise(function (resolve) {
      if (!_hasStorage()) return resolve({})
      chrome.storage.local.get(keys, function (data) {
        if (chrome.runtime && chrome.runtime.lastError) return resolve({})
        resolve(data || {})
      })
    })
  }

  function _normalizeBaseUrl(url) {
    var normalized = String(url || DEFAULT_SERVER_URL).replace(/\/$/, '')
    if (normalized === 'http://127.0.0.1:3000' || normalized === 'http://localhost:3000') {
      return DEFAULT_SERVER_URL
    }
    return normalized
  }

  async function _loadAuth() {
    var data = await _storageGet(['token', 'authToken', 'accessToken', 'cfg', 'serverUrl', 'auth'])
    var cfg = data.cfg || {}
    var auth = data.auth || {}
    return {
      token: data.token || data.authToken || data.accessToken || auth.token || auth.accessToken || '',
      serverUrl: _normalizeBaseUrl(cfg.serverUrl || data.serverUrl || auth.serverUrl),
    }
  }

  async function tick() {
    if (_uploading || !Queue.size()) return { ok: true, skipped: true }
    _uploading = true
    var batch = Queue.dequeueBatch(UPLOAD_BATCH_MAX)
    try {
      var auth = await _loadAuth()
      if (!auth.token) {
        Queue.requeueFront(batch)
        Logger.warn && Logger.warn('EventUploader', 'missing token, requeued', { count: batch.length })
        return { ok: false, status: 401, reason: 'missing-token' }
      }
      // W20-D1:批量上报透传采集实例标识(server 侧统一识别实例,§2.5)
      var payload = { events: batch }
      if (window.RpaInstanceIdentity && window.RpaInstanceIdentity.getIdentity) {
        try {
          var ident = await window.RpaInstanceIdentity.getIdentity()
          if (ident) {
            payload.collector_instance_id = ident.collector_instance_id
            payload.device_id = ident.device_id
            payload.browser_profile_id = ident.browser_profile_id
            payload.tab_id = ident.tab_id
          }
        } catch (_) {}
      }
      var resp = await fetch(auth.serverUrl + '/api/v1/events/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth.token,
        },
        body: JSON.stringify(payload),
      })
      if (resp.ok) {
        var json = {}
        try { json = await resp.json() } catch (_) {}
        await Queue.persist()
        Logger.info && Logger.info('EventUploader', 'uploaded', json.data || json)
        _logRejectReasons(json.data && json.data.reject_reasons) // W20:采集权拒/原因写入消息日志
        return { ok: true, response: json }
      }
      Queue.requeueFront(batch)
      Logger.warn && Logger.warn('EventUploader', 'upload failed, requeued', { status: resp.status, count: batch.length })
      return { ok: false, status: resp.status }
    } catch (err) {
      Queue.requeueFront(batch)
      Logger.warn && Logger.warn('EventUploader', 'network failed, requeued', { count: batch.length, error: err && err.message })
      return { ok: false, error: err && err.message }
    } finally {
      _uploading = false
    }
  }

  // W20:把 server 返回的 reject_reasons 汇总成中文写入插件消息日志(节流:同一汇总不重复刷)。
  var _lastRejectSig = ''
  var REJECT_LABEL = {
    missing_account_biz_id: '私信缺商家账号ID',
    account_disabled: '账号已停用，采集冻结',
    pending_grab: '账号待确认且采集权属他人',
    not_collector: '你不是该账号采集负责人',
    no_collect_permission: '无采集权（账号待客服认领/确认）',
  }
  function _logRejectReasons(reasons) {
    if (!reasons || !reasons.length) { _lastRejectSig = ''; return }
    var counts = {}
    reasons.forEach(function (r) {
      var k = r && r.reason
      if (k && k !== 'invalid_event') counts[k] = (counts[k] || 0) + 1
    })
    var parts = Object.keys(counts).map(function (k) { return counts[k] + '条·' + (REJECT_LABEL[k] || k) })
    if (!parts.length) return
    var msg = '[采集]: ' + parts.join('；') + '，未上报'
    if (msg === _lastRejectSig) return // 节流:同样的拒绝汇总不重复刷屏
    _lastRejectSig = msg
    _appendPluginLog(msg)
  }
  function _appendPluginLog(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPEND_LOG', message: message, level: 'warn' })
      }
    } catch (_) {}
  }

  async function start() {
    if (_timer) return true
    await Queue.restore()
    _timer = setInterval(tick, UPLOAD_INTERVAL)
    if (Queue.onChange) {
      _offQueueChange = Queue.onChange(function (size) {
        if (size >= UPLOAD_FLUSH_SIZE) tick()
      })
    }
    tick()
    Logger.info && Logger.info('EventUploader', 'started')
    return true
  }

  function stop() {
    if (!_timer) return false
    clearInterval(_timer)
    _timer = null
    if (_offQueueChange) _offQueueChange()
    _offQueueChange = null
    Logger.info && Logger.info('EventUploader', 'stopped')
    return true
  }

  window.RpaEventUploader = {
    start: start,
    stop:  stop,
    tick:  tick,
  }
})()

// ============================================================
// MODULE: runtime/watchdog.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 Watchdog（V1.9_Runtime_Protocol § 第七章 + V1.9_技术方案 § 11）
  //
  // 设计准则（V1.x 看门狗教训）：
  //   1. Watchdog 不是无限重试机制，是【恢复卡死 Runtime】
  //   2. 禁止在 SENDING / CONFIRMING / SYNCING 状态触发恢复（可能导致重复发送）
  //   3. 仅允许恢复 SCANNING / WAITING_STABLE / DECIDING / SESSION_SWITCHING / READING_MESSAGES
  //   4. 每次恢复都必须落 LK-RUNTIME-WATCHDOG 日志，附 reason + action
  //
  // 工作方式：
  //   - 每 N 秒检查 RuntimeManager 当前实例的 lastTickAt
  //   - 如果超过 stuckTimeout 仍未更新，且当前状态在恢复白名单内，触发恢复回调
  //   - 恢复回调由 RuntimeManager 注入（避免循环依赖）

  var C       = window.RpaConstants
  var SM      = window.RpaRuntimeStateMachine
  var Tracer  = window.RpaLkTracer
  var Logger  = window.RpaLogger
  if (!C || !SM || !Tracer || !Logger) {
    throw new Error('[V19] Watchdog dependencies missing')
  }

  var S       = C.RuntimeState
  var LK      = C.LK
  var Stage   = C.Stage
  var Status  = C.Status

  // 允许恢复的状态白名单（critical 状态显式排除）
  var RECOVERABLE = {}
  RECOVERABLE[S.SCANNING]          = true
  RECOVERABLE[S.SESSION_SWITCHING] = true
  RECOVERABLE[S.READING_MESSAGES]  = true
  RECOVERABLE[S.WAITING_STABLE]    = true
  RECOVERABLE[S.DECIDING]          = true

  var DEFAULTS = {
    intervalMs:    10000,    // 心跳间隔 10s
    stuckTimeout:  60000,    // 超过 60s 未 tick 视为卡死
  }

  var _state = {
    timer:         null,
    intervalMs:    DEFAULTS.intervalMs,
    stuckTimeout:  DEFAULTS.stuckTimeout,
    onTick:        null,
    onRecover:     null,
    getStatus:     null,    // () => { runtimeId, state, lastTickAt, batchId, session_id }
  }

  function start(opts) {
    if (_state.timer) return false
    opts = opts || {}
    if (opts.intervalMs)   _state.intervalMs   = opts.intervalMs
    if (opts.stuckTimeout) _state.stuckTimeout = opts.stuckTimeout
    if (typeof opts.onTick     === 'function') _state.onTick     = opts.onTick
    if (typeof opts.onRecover  === 'function') _state.onRecover  = opts.onRecover
    if (typeof opts.getStatus  === 'function') _state.getStatus  = opts.getStatus

    _state.timer = setInterval(_check, _state.intervalMs)
    Logger.info('Watchdog', 'started', { interval: _state.intervalMs, timeout: _state.stuckTimeout })
    return true
  }

  function stop() {
    if (_state.timer) {
      clearInterval(_state.timer)
      _state.timer = null
      Logger.info('Watchdog', 'stopped')
    }
  }

  function _check() {
    try {
      var status = _state.getStatus ? _state.getStatus() : null
      if (typeof _state.onTick === 'function') {
        try { _state.onTick(status) } catch (_) {}
      }
      if (!status) return
      Tracer.log({
        lk_code:       LK.RUNTIME_HEARTBEAT,
        stage:         Stage.RUNTIME,
        status:        Status.SUCCESS,
        runtime_state: status.state,
        batchId:       status.batchId || null,
        session_id:    status.session_id || null,
        message:       'watchdog heartbeat',
        detail:        { lastTickAt: status.lastTickAt },
      })

      var now = Date.now()
      var idle = now - (status.lastTickAt || now)
      if (idle < _state.stuckTimeout) return

      // 超时：判断是否可恢复
      if (SM.isCritical(status.state) || !RECOVERABLE[status.state]) {
        Tracer.log({
          lk_code:       LK.RUNTIME_WATCHDOG,
          stage:         Stage.RUNTIME,
          status:        Status.WARNING,
          runtime_state: status.state,
          batchId:       status.batchId || null,
          session_id:    status.session_id || null,
          message:       'stuck detected but state is not recoverable',
          detail:        { idle_ms: idle, state: status.state },
        })
        return
      }

      Tracer.log({
        lk_code:       LK.RUNTIME_WATCHDOG,
        stage:         Stage.RUNTIME,
        status:        Status.WARNING,
        runtime_state: status.state,
        batchId:       status.batchId || null,
        session_id:    status.session_id || null,
        message:       'recovering stuck runtime',
        detail:        { idle_ms: idle, state: status.state },
      })

      if (typeof _state.onRecover === 'function') {
        try { _state.onRecover(status) } catch (err) {
          Logger.error('Watchdog', 'onRecover threw', err && err.message)
        }
      }
    } catch (err) {
      Logger.error('Watchdog', '_check threw', err && err.message)
    }
  }

  function isRecoverable(state) { return !!RECOVERABLE[state] }

  function configure(opts) {
    if (opts && opts.intervalMs)   _state.intervalMs   = opts.intervalMs
    if (opts && opts.stuckTimeout) _state.stuckTimeout = opts.stuckTimeout
  }

  window.RpaWatchdog = {
    start:         start,
    stop:          stop,
    configure:     configure,
    isRecoverable: isRecoverable,
    RECOVERABLE:   RECOVERABLE,
  }

})()

// ============================================================
// MODULE: runtime/recovery-manager.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 RecoveryManager（V1.9_Runtime_Protocol § 第十二章 + V1.9_技术方案 § M2）
  //
  // 职责：页面 reload / tab 重新激活 / 浏览器重开后，恢复以下状态：
  //   1. queue（chrome.storage.local["rpa_v19_queue"]）
  //   2. batch 索引（重新载入未结束 batch）
  //   3. runtime lock heartbeat（防止旧 tab 残留处理）
  //
  // 关键约束：
  //   - 已 DONE / ABORTED 的 batch 不能被重新激活
  //   - status==processing 的 queue item reset 为 queued（旧 tab 已死）
  //   - 处于 SENDING/CONFIRMING 的 batch 强制标 FAILED（无法确认是否发出，由人工处理）

  var C      = window.RpaConstants
  var Tracer = window.RpaLkTracer
  var Logger = window.RpaLogger
  var Queue  = window.RpaQueueManager
  var Batch  = window.RpaBatchManager
  if (!C || !Tracer || !Logger || !Queue || !Batch) {
    throw new Error('[V19] RecoveryManager dependencies missing')
  }

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  var STORAGE_KEY = 'rpa_v19_batches'

  function _hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
  }

  // 从 storage 加载 batch 索引快照
  function _loadBatchSnapshot() {
    if (!_hasStorage()) return Promise.resolve([])
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(STORAGE_KEY, function (data) {
          var stored = data && data[STORAGE_KEY]
          resolve(Array.isArray(stored) ? stored : [])
        })
      } catch (err) {
        Logger.warn('RecoveryManager', 'load batches failed', err && err.message)
        resolve([])
      }
    })
  }

  function persistBatchSnapshot() {
    if (!_hasStorage()) return Promise.resolve(false)
    var snapshot = Batch.snapshot()
    return new Promise(function (resolve) {
      var data = {}
      data[STORAGE_KEY] = snapshot
      try {
        chrome.storage.local.set(data, function () { resolve(true) })
      } catch (_) {
        resolve(false)
      }
    })
  }

  // 恢复主入口；返回 { recoveredQueue, recoveredBatches, abortedCritical }
  function recover() {
    return Promise.resolve().then(function () {
      return Queue.init()
    }).then(function () {
      return _loadBatchSnapshot()
    }).then(function (snapshot) {
      var aborted = []
      var ok = []
      for (var i = 0; i < snapshot.length; i++) {
        var b = snapshot[i]
        if (!b || !b.batch_id) continue
        // 处于 SENDING/CONFIRMING 的 batch reload 后强制 FAILED：无法确认对方是否收到
        if (b.status === 'SENDING' || b.status === 'CONFIRMING') {
          b.status = 'FAILED'
          b.recovery_reason = 'reload during ' + b.status
          aborted.push(b.batch_id)
        }
        ok.push(b)
      }
      var n = Batch.rehydrate(ok)
      var resetQueue = Queue.resetStuckProcessing()

      Tracer.log({
        lk_code:   LK.RECOVERY_RUNTIME,
        stage:     Stage.RUNTIME,
        status:    Status.SUCCESS,
        message:   'runtime recovered from storage',
        detail: {
          batches:        n,
          aborted_critical: aborted,
          queue_reset:    resetQueue,
          queue_size:     Queue.snapshot().queue.length,
        },
      })

      return {
        recoveredBatches: n,
        recoveredQueue:   Queue.snapshot().queue.length,
        abortedCritical:  aborted,
      }
    })
  }

  // 周期性把 batch 快照写入 storage（供下次 reload 恢复）
  // 调用者：RuntimeManager 在状态机迁移完成后触发
  var _autoTimer = null

  function startAutosave(intervalMs) {
    intervalMs = intervalMs || 5000
    if (_autoTimer) return
    _autoTimer = setInterval(persistBatchSnapshot, intervalMs)
  }

  function stopAutosave() {
    if (_autoTimer) {
      clearInterval(_autoTimer)
      _autoTimer = null
    }
  }

  function clearStorage() {
    if (!_hasStorage()) return Promise.resolve()
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.remove([STORAGE_KEY, 'rpa_v19_queue'], function () { resolve() })
      } catch (_) {
        resolve()
      }
    })
  }

  window.RpaRecoveryManager = {
    recover:               recover,
    persistBatchSnapshot:  persistBatchSnapshot,
    startAutosave:         startAutosave,
    stopAutosave:          stopAutosave,
    clearStorage:          clearStorage,
  }

})()

// ============================================================
// MODULE: runtime/session-identity-resolver.js
// ============================================================

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

// ============================================================
// MODULE: shared/adapter-helpers.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 Adapter 通用辅助：
  //   - 构造统一的 RawSession / NormalizedMessage 结构
  //   - 调用 SessionIdentityResolver 派生 session_id
  //   - 校验 unstable 标志

  var Identity = window.RpaSessionIdentityResolver
  var Logger   = window.RpaLogger
  if (!Identity || !Logger) throw new Error('[V19] AdapterHelpers dependencies missing')

  // RawSession（V1.9_技术方案 § 6.3）：
  //   {
  //     raw_id, nickname, avatar, last_message_text, last_message_time, unread_count,
  //     dom_ref, raw_payload
  //   }
  function buildRawSession(fields) {
    return {
      raw_id:             fields.raw_id            || null,
      nickname:           fields.nickname          || '',
      avatar:             fields.avatar            || null,
      last_message_text:  fields.last_message_text || null,
      last_message_time:  fields.last_message_time || null,
      unread_count:       fields.unread_count      || 0,
      dom_ref:            fields.dom_ref           || null,
      raw_payload:        fields.raw_payload       || null,
    }
  }

  // 派生 IdentityResult（V1.9_技术方案 § 6.3 + § 7）
  //   { session_id, identity_level, identity_source, unstable, raw_identity }
  // V1.9 签名：resolveIdentity(platform, pageKey, platformAccount, rawSession)
  // 兼容三参签名：resolveIdentity(platform, platformAccount, rawSession)
  function resolveIdentity(platform, pageKeyOrAccount, accountOrSession, maybeSession) {
    var pageKey, platformAccount, rawSession
    if (arguments.length >= 4) {
      pageKey         = pageKeyOrAccount
      platformAccount = accountOrSession
      rawSession      = maybeSession
    } else {
      pageKey         = ''
      platformAccount = pageKeyOrAccount
      rawSession      = accountOrSession
    }
    if (!rawSession) return null
    var resolved = Identity.resolve(platform, pageKey, platformAccount || '', rawSession.dom_ref)
    if (!resolved) return null
    return {
      session_id:      resolved.session_id,
      identity_level:  'L' + resolved.level,
      identity_source: resolved.source,
      unstable:        !!resolved.unstable,
      raw_identity:    resolved.session_id,
    }
  }

  // NormalizedMessage（V1.9_技术方案 § 6.3）
  function buildNormalizedMessage(fields) {
    return {
      message_id:   fields.message_id  || null,
      session_id:   fields.session_id  || null,
      batchId:      fields.batchId     || null,
      direction:    fields.direction   || 'inbound',
      owner:        fields.owner       || 'user',
      message_type: fields.message_type || 'user_text',
      content:      String(fields.content || ''),
      timestamp:    fields.timestamp   || null,
      raw_payload:  fields.raw_payload || null,
    }
  }

  function classifyByDirection(rawMessage) {
    // 默认按 direction 字段；adapter 可在 classifyMessage 中覆盖
    if (!rawMessage) return null
    return buildNormalizedMessage({
      session_id:  rawMessage.session_id,
      direction:   rawMessage.direction || 'inbound',
      owner:       rawMessage.owner     || (rawMessage.direction === 'outbound' ? 'self' : 'user'),
      message_type: rawMessage.message_type || 'user_text',
      content:     rawMessage.content,
      timestamp:   rawMessage.timestamp,
      raw_payload: rawMessage.raw_payload,
    })
  }

  // 检查 unstable 是否禁止自动回复（V1.9_技术方案 § 7.2 L3 不允许自动回复）
  function shouldBlockAutoReply(identity) {
    if (!identity) return true
    return identity.unstable === true || identity.identity_level === 'L3'
  }

  window.RpaAdapterHelpers = {
    buildRawSession:        buildRawSession,
    resolveIdentity:        resolveIdentity,
    buildNormalizedMessage: buildNormalizedMessage,
    classifyByDirection:    classifyByDirection,
    shouldBlockAutoReply:   shouldBlockAutoReply,
  }

})()

// ============================================================
// MODULE: runtime/runtime-manager.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 RuntimeManager（V1.9_技术方案 § 5.1）
  //
  // 范围（M2 升级版）：
  //   - M1 骨架：状态机 + LK Trace
  //   - M2 接入：BatchManager / QueueManager / Watchdog / RecoveryManager / AdapterRegistry
  //
  // 仍然遵循：
  //   1. 不自动启动；必须由 legacy bootstrap 显式调用 start()
  //   2. Feature Flag 关闭时直接返回，Runtime 不构造任何资源
  //   3. 所有状态迁移都通过 stateMachine.transition()，自动写 LK-RUNTIME-STATE 日志
  //   4. M2 不调 adapter 业务方法；只验证 recovery → ready → idle 链路

  var C        = window.RpaConstants
  var SM       = window.RpaRuntimeStateMachine
  var Tracer   = window.RpaLkTracer
  var Logger   = window.RpaLogger
  var Hash     = window.RpaHash
  var Batch    = window.RpaBatchManager
  var Queue    = window.RpaQueueManager
  var Watchdog = window.RpaWatchdog
  var Recovery = window.RpaRecoveryManager
  var Registry = window.RpaAdapterRegistry
  var Helpers  = window.RpaAdapterHelpers
  if (!C || !SM || !Tracer || !Logger || !Hash || !Batch || !Queue || !Watchdog || !Recovery || !Registry) {
    throw new Error('[V19] RuntimeManager dependencies missing')
  }

  var S      = C.RuntimeState
  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  var _instance = null

  function _genRuntimeId() {
    var seed = Date.now() + ':' + Math.random() + ':' + (typeof navigator !== 'undefined' ? navigator.userAgent.length : 0)
    return 'rt_' + Hash.fnv32(seed)
  }

  function _logState(event, extra) {
    Tracer.log({
      lk_code:       LK.RUNTIME_STATE,
      stage:         Stage.RUNTIME,
      status:        event.ok ? Status.SUCCESS : Status.FAILED,
      runtime_state: event.ok ? event.to : event.from,
      message:       event.ok
        ? (event.from + ' → ' + event.to)
        : ('illegal transition ' + event.from + ' → ' + event.to),
      detail: Object.assign({ from: event.from, to: event.to }, extra || {}),
    })
  }

  // 启动：context = { platform, pageKey, pluginId?, userId?, tabId? }
  // options:
  //   featureFlag         (bool) — 显式开关；false 时 RuntimeManager 不启动
  //   autoRecover         (bool) — 启动前是否从 chrome.storage 恢复 batch/queue（默认 true）
  //   enableWatchdog      (bool) — 是否启动 watchdog（默认 true）
  //   watchdogInterval    (ms)
  //   watchdogStuckTimeout(ms)
  //   adapter             (PlatformPageAdapter) — 当前页面已解析的 adapter；可选，M3 用
  // 返回 runtime 实例句柄；如果 Feature Flag 关闭，返回 null
  function start(context, options) {
    context = context || {}
    options = options || {}

    if (_instance) {
      Logger.warn('RuntimeManager', 'start called while already running, ignored')
      return _instance
    }
    if (options.featureFlag === false) {
      Logger.info('RuntimeManager', 'feature flag OFF, skipping V1.9 runtime')
      return null
    }

    var runtimeId = _genRuntimeId()
    var sm = SM.create(S.IDLE)

    Tracer.init({
      runtimeId: runtimeId,
      platform:  context.platform || 'unknown',
      pageKey:   context.pageKey  || null,
    })

    sm.onTransition(function (event) { _logState(event) })

    Tracer.log({
      lk_code:       LK.BOOT_INIT,
      stage:         Stage.RUNTIME,
      status:        Status.SUCCESS,
      runtime_state: sm.current(),
      message:       'runtime initialized',
      detail: {
        runtimeId: runtimeId,
        context:   context,
        adapter:   options.adapter ? options.adapter.adapterKey : null,
      },
    })

    _instance = {
      runtimeId:    runtimeId,
      startedAt:    Date.now(),
      lastTickAt:   Date.now(),
      context:      context,
      adapter:      options.adapter || null,
      sm:           sm,
      currentBatchId:  null,
      currentSessionId: null,
      stop:         stop,
      tick:         tick,
      state:        function () { return sm.current() },
      transition:   function (to, meta) {
        var ev = sm.transition(to, meta)
        if (!ev.ok) _logState(ev, { meta: meta || null })
        return ev
      },
    }

    var autoRecover = options.autoRecover !== false
    var enableWatchdog = options.enableWatchdog !== false

    var bootChain = autoRecover
      ? Recovery.recover()
      : Promise.resolve({ recoveredBatches: 0, recoveredQueue: 0, abortedCritical: [] })

    bootChain.then(function (recoveryResult) {
      Tracer.log({
        lk_code:       LK.RUNTIME_LOCK,
        stage:         Stage.RUNTIME,
        status:        Status.SUCCESS,
        runtime_state: sm.current(),
        message:       'recovery completed',
        detail:        recoveryResult,
      })

      if (enableWatchdog) {
        Watchdog.start({
          intervalMs:    options.watchdogInterval    || undefined,
          stuckTimeout:  options.watchdogStuckTimeout || undefined,
          getStatus:     function () { return tickStatus() },
          onRecover:     function (st) { _onWatchdogRecover(st) },
        })
      }

      // batch 快照自动保存
      Recovery.startAutosave(options.autosaveInterval || 5000)
    }).catch(function (err) {
      Tracer.log({
        lk_code:       LK.ERR_DOM_MISSING,
        stage:         Stage.RUNTIME,
        status:        Status.FAILED,
        runtime_state: sm.current(),
        message:       'recovery boot failed',
        detail:        { error: (err && err.message) || String(err) },
      })
    })

    Logger.info('RuntimeManager', 'started', { runtimeId: runtimeId })
    return _instance
  }

  // 状态快照（watchdog / 控制台用）
  function tickStatus() {
    if (!_instance) return null
    return {
      runtimeId:    _instance.runtimeId,
      state:        _instance.sm.current(),
      lastTickAt:   _instance.lastTickAt,
      batchId:      _instance.currentBatchId,
      session_id:   _instance.currentSessionId,
      adapter:      _instance.adapter ? _instance.adapter.adapterKey : null,
    }
  }

  function _onWatchdogRecover(status) {
    // 默认行为：把当前 state 强制重置为 IDLE，触发下一轮调度
    if (!_instance) return
    if (SM.isCritical(status.state)) return  // 双保险
    var ev = _instance.sm.transition(S.IDLE, { reason: 'watchdog-recover' })
    if (!ev.ok) {
      // 如果不能直接迁回 IDLE，尝试通过 ERROR
      _instance.sm.transition(S.ERROR, { reason: 'watchdog-recover' })
      _instance.sm.transition(S.IDLE,  { reason: 'watchdog-recover-via-error' })
    }
    _instance.lastTickAt = Date.now()
  }

  // 停止：强制把状态迁到 STOPPED；如果当前处于 critical 区间，记录警告但不强制中断
  function stop(reason) {
    if (!_instance) return false
    var current = _instance.sm.current()

    if (SM.isCritical(current)) {
      Tracer.log({
        lk_code:       LK.RUNTIME_CLEANUP,
        stage:         Stage.RUNTIME,
        status:        Status.WARNING,
        runtime_state: current,
        message:       'stop requested during critical state, deferred',
        detail:        { reason: reason || null, state: current },
      })
      return false
    }

    Watchdog.stop()
    Recovery.stopAutosave()

    var event = _instance.sm.transition(S.STOPPED, { reason: reason || null })
    Tracer.log({
      lk_code:       LK.RUNTIME_CLEANUP,
      stage:         Stage.RUNTIME,
      status:        event.ok ? Status.SUCCESS : Status.FAILED,
      runtime_state: _instance.sm.current(),
      message:       event.ok ? 'runtime stopped' : 'stop transition rejected',
      detail:        { from: event.from, to: event.to, reason: reason || null },
    })
    Recovery.persistBatchSnapshot()
    Tracer.stop(reason)
    var stopped = _instance
    _instance = null
    return stopped
  }

  // tick：更新 lastTickAt + 返回当前快照（非业务驱动；adapter 调用时序在 M3+ 接入）
  function tick() {
    if (!_instance) return null
    _instance.lastTickAt = Date.now()
    return Object.assign(tickStatus(), { tracer: Tracer.snapshot(), queue: Queue.snapshot() })
  }

  function current() { return _instance }

  // 暴露当前 batch / session 给外部（M3+ 在切换会话时主动写入）
  function setActiveBatch(batchId)     { if (_instance) _instance.currentBatchId   = batchId  || null }
  function setActiveSession(sessionId) { if (_instance) _instance.currentSessionId = sessionId || null }

  // ── M1 文档要求：pause / resume 支持 ────────────────────────────
  // 语义：暂停 / 恢复 Queue 调度。observer 不停（heartbeat / autosave 继续）。
  // 状态机不引入 PAUSED 状态（不在 V1.9_Runtime_Protocol 协议内），仅在 Queue 层 pause。
  function pause(reason) {
    if (!_instance) return false
    Queue.pause()
    Tracer.log({
      lk_code:       LK.RUNTIME_CLEANUP,
      stage:         Stage.RUNTIME,
      status:        Status.SUCCESS,
      runtime_state: _instance.sm.current(),
      message:       'runtime paused (queue suspended)',
      detail:        { reason: reason || null },
    })
    _instance.paused = true
    return true
  }

  function resume(reason) {
    if (!_instance) return false
    Queue.resume()
    Tracer.log({
      lk_code:       LK.BOOT_INIT,
      stage:         Stage.RUNTIME,
      status:        Status.SUCCESS,
      runtime_state: _instance.sm.current(),
      message:       'runtime resumed (queue active)',
      detail:        { reason: reason || null },
    })
    _instance.paused = false
    return true
  }

  function isPaused() { return !!(_instance && _instance.paused) }

  window.RpaRuntimeManager = {
    start:             start,
    stop:              stop,
    pause:             pause,
    resume:            resume,
    isPaused:          isPaused,
    tick:              tick,
    current:           current,
    setActiveBatch:    setActiveBatch,
    setActiveSession:  setActiveSession,
  }

})()

// ============================================================
// MODULE: runtime/session-parser.js
// ============================================================

;(function () {
  'use strict'

  // session-parser.js — DOM → SessionSnapshot 结构化解析
  //
  // 职责: 扫描当前页面的会话列表 DOM，为每个会话节点提取结构化快照。
  // 不判断"是否新消息"，那是 diff-engine 的工作。
  //
  // SessionSnapshot 结构:
  // {
  //   session_id:        string   — 稳定会话指纹 (via SessionIdentityResolver)
  //   platform:          string
  //   platform_account:  string   — 坐席平台账号（TODO: 各平台确认取法）
  //   unstable:          boolean  — session_id 是否来自 L3 兜底
  //   last_message_text: string   — 最后一条消息预览文本
  //   last_timestamp:    string   — 时间戳文本（原始，不做转换）
  //   unread_count:      number   — 未读消息数，0 表示无或未知
  //   node:              Element  — 对应 DOM 节点（不序列化，内存引用）
  //   snapshot_at:       number   — Date.now()
  // }

  // ── 各平台解析实现（STUB）────────────────────────────────────────
  //
  // 每个解析器签名:
  //   function() → SessionSnapshot[]
  //
  // M1 开工后根据真实 DOM 结构补充实现。

  var _parsers = {

    douyinLaike: function () {
      // TODO: 实现抖音来客会话列表解析
      // 预期: 联系人列表每一项 → 提取 lastMsg / timestamp / unreadBadge
      return []
    },

    douyinFeige: function () {
      // TODO: 实现抖音飞鸽会话列表解析
      return []
    },

    kuaishou: function () {
      // TODO: 实现快手会话列表解析
      return []
    },

    meituanJyb: function () {
      // TODO: 实现美团经营宝会话列表解析（注意 ShadowRoot）
      return []
    },

    xiaohongshu: function () {
      // TODO: 实现小红书会话列表解析
      return []
    },
  }

  // ── 公开 API ─────────────────────────────────────────────────────

  // parse(platform, platformAccount) → SessionSnapshot[]
  // 解析当前页面所有可见会话，返回快照数组。空数组表示无会话或解析失败。
  function parse(platform, platformAccount) {
    var parser = _parsers[platform]
    if (!parser) {
      console.warn('[SessionParser] 无此平台解析器:', platform)
      return []
    }
    try {
      var snapshots = parser()
      // 补全公共字段
      var now = Date.now()
      return snapshots.map(function (s) {
        return Object.assign({
          platform:         platform,
          platform_account: platformAccount || '',
          unstable:         false,
          last_message_text: '',
          last_timestamp:   '',
          unread_count:     0,
          node:             null,
          snapshot_at:      now,
        }, s)
      })
    } catch (e) {
      console.error('[SessionParser] 解析异常:', platform, e)
      return []
    }
  }

  // 注册/覆盖平台解析器（M1 正式实现时调用）
  function registerParser(platform, fn) {
    _parsers[platform] = fn
  }

  window.RpaSessionParser = {
    parse:          parse,
    registerParser: registerParser,
  }

})()

// ============================================================
// MODULE: runtime/session-detector.js
// ============================================================

;(function () {
  'use strict'

  // session-detector.js — 新消息检测（M1 核心入口）
  //
  // 职责:
  //   1. 调用 SessionParser 拿到当前快照列表
  //   2. 与上一轮快照对比，通过 DiffEngine 判定哪些会话有新消息
  //   3. 将有新消息的会话放入待处理队列（M2 的 SessionQueue）
  //   4. 将快照上报服务端 /api/session/snapshot
  //
  // M1 阶段: 只检测，不自动回复。
  //
  // 依赖（concat 顺序保证它们先于本模块加载）:
  //   window.RpaSessionParser
  //   window.RpaSessionIdentityResolver
  //   window.RpaDiffEngine

  var _state = {
    platform:        '',
    platformAccount: '',
    lastSnapshots:   {},   // session_id → SessionSnapshot
    pollingTimer:    null,
    config: {
      polling_interval:   5000,  // ms，从 /api/session/config 拉取
      observer_debounce:  300,
    },
  }

  // ── 初始化 ────────────────────────────────────────────────────────

  function init(platform, platformAccount) {
    _state.platform        = platform
    _state.platformAccount = platformAccount
    _loadConfig()
  }

  function _loadConfig() {
    // M1 实现：GET /api/session/config，更新 _state.config
    // STUB: 使用默认值
  }

  // ── 检测循环 ──────────────────────────────────────────────────────

  function start() {
    if (_state.pollingTimer) return
    _tick()
    _state.pollingTimer = setInterval(_tick, _state.config.polling_interval)
  }

  function stop() {
    if (_state.pollingTimer) {
      clearInterval(_state.pollingTimer)
      _state.pollingTimer = null
    }
  }

  function _tick() {
    try {
      var snapshots = window.RpaSessionParser
        ? window.RpaSessionParser.parse(_state.platform, _state.platformAccount)
        : []

      if (!snapshots.length) return

      var changed = []
      snapshots.forEach(function (snap) {
        var prev = _state.lastSnapshots[snap.session_id]
        var diff = window.RpaDiffEngine
          ? window.RpaDiffEngine.diff(prev, snap)
          : { hasNew: false }

        if (diff.hasNew) changed.push(snap)
        _state.lastSnapshots[snap.session_id] = snap
      })

      if (changed.length) _onNewMessages(changed)
      _uploadSnapshots(snapshots)
    } catch (e) {
      console.error('[SessionDetector] tick 异常:', e)
    }
  }

  // ── 新消息回调 ────────────────────────────────────────────────────

  function _onNewMessages(sessions) {
    // M1: 只打日志，不触发回复
    sessions.forEach(function (s) {
      console.log('[SessionDetector] 新消息:', s.session_id, s.last_message_text && s.last_message_text.slice(0, 30))
    })
    // M2 接入后改为: window.RpaSessionQueue.enqueue(sessions)
  }

  // ── 服务端上报 ────────────────────────────────────────────────────

  function _uploadSnapshots(snapshots) {
    // M1 实现：POST /api/session/snapshot
    // STUB: 暂不上报
    void snapshots
  }

  // ── 公开 API ─────────────────────────────────────────────────────

  window.RpaSessionDetector = {
    init:  init,
    start: start,
    stop:  stop,
  }

})()

// ============================================================
// MODULE: runtime/diff-engine.js
// ============================================================

;(function () {
  'use strict'

  // diff-engine.js — 四信号新消息判定（ADR-005 依赖 session_id 稳定）
  //
  // 四信号（全部来自 SessionSnapshot 字段）:
  //   1. last_message_text 变化
  //   2. last_timestamp    变化
  //   3. unread_count      增加
  //   4. processed         = false（本轮未处理）
  //
  // 设计原则:
  //   - 四信号任意一个命中即判定 hasNew=true
  //   - 自己回复成功后必须立即标记 processed=true，避免 AI 回复被误判为新消息
  //   - unstable session_id（L3 兜底）命中时降低置信度，仅打日志，不自动回复

  // ── DiffResult 结构 ───────────────────────────────────────────────
  // {
  //   hasNew:     boolean
  //   signals:    string[]   — 命中的信号名列表
  //   confidence: 'high' | 'low'   — unstable 时为 low
  // }

  function diff(prev, curr) {
    if (!curr) return { hasNew: false, signals: [], confidence: 'high' }

    // 首次出现（无历史快照）
    if (!prev) {
      var firstSignals = []
      if (curr.unread_count > 0) firstSignals.push('unread_count:new')
      if (curr.last_message_text) firstSignals.push('last_message:new')
      return {
        hasNew:     firstSignals.length > 0,
        signals:    firstSignals,
        confidence: curr.unstable ? 'low' : 'high',
      }
    }

    var signals = []

    // 信号 1: 消息文本变化
    if (curr.last_message_text && curr.last_message_text !== prev.last_message_text) {
      signals.push('last_message:changed')
    }

    // 信号 2: 时间戳变化
    if (curr.last_timestamp && curr.last_timestamp !== prev.last_timestamp) {
      signals.push('last_timestamp:changed')
    }

    // 信号 3: 未读数增加
    if (curr.unread_count > prev.unread_count) {
      signals.push('unread_count:increased')
    }

    // 信号 4: 当前快照未标记已处理
    if (!curr.processed) {
      signals.push('processed:false')
    }

    var hasNew     = signals.length > 0
    var confidence = curr.unstable ? 'low' : 'high'

    if (hasNew && confidence === 'low') {
      console.warn('[DiffEngine] 命中但 session_id 不稳定（L3）:', curr.session_id, signals)
    }

    return { hasNew: hasNew, signals: signals, confidence: confidence }
  }

  // 发送成功后调用，防止 AI 自己的回复被误判为新消息
  // snapshot: SessionSnapshot 引用，直接修改 processed 和 last_message_text
  function markReplied(snapshot, replyText) {
    if (!snapshot) return
    snapshot.processed        = true
    snapshot.last_message_text = replyText || snapshot.last_message_text
  }

  window.RpaDiffEngine = {
    diff:        diff,
    markReplied: markReplied,
  }

})()

// ============================================================
// MODULE: adapters/douyin/laike-message.adapter.js
// ============================================================

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

// ============================================================
// MODULE: adapters/douyin/private-message.adapter.js
// ============================================================

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
      '[class*="conversationItem-"]',             // 抖音私信新版会话项(conversationItem-<hash>)
      '[data-qa-id="qa-conversation-chat-item"]', // 旧版兜底
      '[class*="conversation"][class*="item"]',
      '[class*="contactCard"]',
      '[role="option"]',
      '[role="listitem"]',
    ],
    activeContactItem: [
      '[class*="conversationActiveItem"]',        // 新版激活项(与 conversationItem 并存)
      '[data-qa-id="qa-conversation-chat-item"][class*="active"]',
      '[data-qa-id="qa-conversation-chat-item"][class*="selected"]',
      '[class*="conversation"][class*="active"]',
    ],
    nickname: [
      '[class*="conversationName"]',              // 新版会话名(conversationName-<hash>)
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
      'sup[class*="byted-badge-sup-show"]',       // 新版:未读红点显示态(激活/已读项的 sup 无 -show)
      '[class*="newConv"]',                        // 新版:"[新会话]"标识
      '[aria-label*="未读"]',
      'sup[class*="byted-badge-type-danger"]',
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
    // 未读判定:红点显示态(byted-badge-sup-show)或"[新会话]"标识即视为未读。
    // 数字红点是 byted-animated-number(CSS 位移动画),文本解析不可靠 → 用存在性,unread=1。
    var unread     = Dom.queryFirst(SELECTORS.unreadBadge, item) ? 1 : 0
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
    if (!window.RpaFeatureFlags || !window.RpaFeatureFlags.get('auto_switch_session')) return { ok: false, reason: 'auto-switch-disabled' }
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
    var conversationId = sessionInfo.conversationId || sessionInfo.conversation_id || sessionInfo.session_id ||
      ('douyin-private-' + (sessionInfo.accountBizId ? sessionInfo.accountBizId + '-' : '') +
       Dom.simpleHash((sessionInfo.accountBizId ? sessionInfo.accountBizId + '|' : '') + fallbackName))
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

// ============================================================
// MODULE: adapters/douyin/feige.adapter.js
// ============================================================

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
    if (!window.RpaFeatureFlags || !window.RpaFeatureFlags.get('auto_switch_session')) return { ok: false, reason: 'auto-switch-disabled' }
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

// ============================================================
// MODULE: runtime/position-tracker.js
// ============================================================

/*
 * W17 位置标识:锚点窗口对齐(替代旧 _seqMap)
 *
 * 目标:给每条消息一个"会话内位置号 position"(纯位置不含内容),满足:
 *   - 幂等:同一条消息跨采集 → 锚点匹配 → position 不变(D5 message_id 幂等的基础)
 *   - 有几条存几条:重复连发(1/1/1)各自 position 不同 → 都保留
 *   - 稳定:chrome.storage 持久化每会话已采序列,掉线/重启后续编不从头乱编
 *
 * 排序不靠 position(滚动加载的旧段 position 反而更大);段间排序靠 segment_at(见 Task3)。
 * position 只做"身份(去重)+段内相对序"。
 *
 * 纯函数 computeAssignments / findOffset 不依赖 window/chrome,便于 node 单测。
 */
;(function () {
  'use strict'

  // 自包含的 key 哈希(仅用于已采序列内部匹配,与 message_id 的 Dom.simpleHash 无关)
  function keyOf(direction, content) {
    var s = (direction === 'outbound' ? 'o' : 'i') + '' + String(content == null ? '' : content)
    var h = 5381
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(36)
  }

  // 在已采序列 Sk 中为当前 DOM 序列 cur 找对齐偏移:cur[i] 对应 Sk[off + i]
  // 取连续锚点窗口(先宽后窄 5→4→3),从 cur 末尾向前扫,返回"唯一匹配"的偏移;歧义/无重叠返回 null
  function findOffset(cur, Sk) {
    var sizes = [5, 4, 3]
    for (var w = 0; w < sizes.length; w++) {
      var W = sizes[w]
      if (cur.length < W || Sk.length < W) continue
      for (var a = cur.length - W; a >= 0; a--) {
        var found = -1
        var dup = false
        for (var m = 0; m + W <= Sk.length; m++) {
          var ok = true
          for (var x = 0; x < W; x++) {
            if (Sk[m + x] !== cur[a + x]) { ok = false; break }
          }
          if (ok) {
            if (found === -1) found = m
            else { dup = true; break }
          }
        }
        if (found !== -1 && !dup) return found - a
      }
    }
    return null
  }

  // 输入:cur = 当前 DOM 序列的 key 数组(按 DOM 顺序);state = {nextPos, seq:[{k,p}]}(seq 按时间顺序)
  // 输出:{positions:[每条的position], state:新state, mode}
  function computeAssignments(cur, state) {
    state = state || { nextPos: 0, seq: [] }
    var seq = (state.seq || []).slice()
    var nextPos = state.nextPos || 0
    var positions = new Array(cur.length)

    // 冷启动:首次采该会话
    if (seq.length === 0) {
      var newSeq0 = []
      for (var i0 = 0; i0 < cur.length; i0++) {
        positions[i0] = nextPos++
        newSeq0.push({ k: cur[i0], p: positions[i0] })
      }
      return { positions: positions, state: { nextPos: nextPos, seq: newSeq0 }, mode: 'cold' }
    }

    var Sk = seq.map(function (e) { return e.k })
    var off = findOffset(cur, Sk)

    // 降级:无唯一锚点(无重叠/冷滚动/全重复歧义)→ 全部续编新 position,追加进 seq(时序由 segment_at 解决)
    if (off === null) {
      var addD = []
      for (var iD = 0; iD < cur.length; iD++) {
        positions[iD] = nextPos++
        addD.push({ k: cur[iD], p: positions[iD] })
      }
      return { positions: positions, state: { nextPos: nextPos, seq: seq.concat(addD) }, mode: 'degrade' }
    }

    // 已对齐:cur[i] ↔ Sk[off+i]
    var prepend = []   // off+i<0:滚动加载出的更早消息(新身份)
    var appendNew = [] // off+i>=len:底部新到消息
    for (var i = 0; i < cur.length; i++) {
      var sIdx = off + i
      if (sIdx >= 0 && sIdx < seq.length && seq[sIdx].k === cur[i]) {
        positions[i] = seq[sIdx].p                       // 命中:复用旧 position(幂等)
      } else if (sIdx < 0) {
        positions[i] = nextPos++; prepend.push({ k: cur[i], p: positions[i] })
      } else if (sIdx >= seq.length) {
        positions[i] = nextPos++; appendNew.push({ k: cur[i], p: positions[i] })
      } else {
        positions[i] = nextPos++                         // 区间内错配(撤回/编辑/错位):给新身份,绝不误并
      }
    }
    var newSeq = prepend.concat(seq, appendNew)
    return { positions: positions, state: { nextPos: nextPos, seq: newSeq }, mode: 'aligned', off: off }
  }

  // ---- chrome.storage 持久化封装(浏览器运行时) ----
  // M24/B4-A:key = 'w17_pos_' + conversationId。B3 后 conversationId 已含 account_biz_id(商家账号=
  // 租户专属),不同租户必不同账号 → 不同 conversationId → 不同 key,跨租户天然不串号,无需另加 tenant 前缀。
  // (清库重采时连带清本地 w17_pos_* + EventQueue/seen —— 阶段E 执行清单。)
  var STORAGE_PREFIX = 'w17_pos_'

  function _get(key) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([key], function (r) { resolve((r && r[key]) || null) })
      } catch (_) { resolve(null) }
    })
  }
  function _set(key, val) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.set({ [key]: val }, function () { resolve() })
      } catch (_) { resolve() }
    })
  }

  // 给一批 events(同会话,按 DOM 顺序)赋 position;就地写 event.position 并返回 events
  async function assign(conversationId, events) {
    if (!events || !events.length) return events
    var key = STORAGE_PREFIX + conversationId
    var state = await _get(key)
    var cur = events.map(function (e) { return keyOf(e.direction, e.content_text) })
    var out = computeAssignments(cur, state)
    for (var i = 0; i < events.length; i++) {
      events[i].position = out.positions[i]
      // W17-C:记录 position 来源(锚点 pass mode),便于排查 + 阶段二判 position 可信度
      var rs = events[i].raw_snapshot || (events[i].raw_snapshot = {})
      rs.position_source = out.mode               // cold / aligned / degrade
      if (out.off !== undefined) rs.anchor_off = out.off
    }
    await _set(key, out.state)
    return events
  }

  var api = {
    keyOf: keyOf,
    findOffset: findOffset,
    computeAssignments: computeAssignments,
    assign: assign,
    STORAGE_PREFIX: STORAGE_PREFIX,
  }

  if (typeof window !== 'undefined') window.RpaPositionTracker = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()

// ============================================================
// MODULE: runtime/legacy-collector.js
// ============================================================

;(function () {
  'use strict'

  var Flags = window.RpaFeatureFlags
  var Registry = window.RpaAdapterRegistry
  var Collector = window.RpaEventCollector
  var Uploader = window.RpaEventUploader
  var Dom = window.RpaDomUtils
  var PositionTracker = window.RpaPositionTracker
  var Logger = window.RpaLogger || console
  if (!Flags || !Registry || !Collector || !Uploader || !Dom || !PositionTracker) {
    throw new Error('[W4] legacy collector dependencies missing')
  }
  var Identity = window.RpaInstanceIdentity   // W20-D1:可选,缺失则不做实例冲突心跳(不影响采集)

  var _observer = null
  var _timer = null
  var _collecting = false
  var _debounce = null
  var COLLECT_DEBOUNCE_MS = 10000

  // W20-D1:采集实例冲突心跳 + 阻断态。
  var _blocked = false          // 被 session 级冲突阻断 → 暂停本 tab 采集
  var _hbTimer = null
  var _hbInflight = false
  var HEARTBEAT_INTERVAL_MS = 15000

  function _readNickname(adapter) {
    var ctx = adapter && adapter.buildRuntimeContext ? adapter.buildRuntimeContext() : {}
    return ctx.sessionTitle ||
      Dom.getText(Dom.queryFirst([
        'div[class*="msgTitle"] span[class*="name"]',
        // 不再退回 div.userInfo —— 该布局下那是"登录客服自己"的信息区,会误读成客服名
        'div[class*="conversationName"]',
        '[class*="sessionTitle"]',
      ])) ||
      'unknown'
  }

  function _readAccountNickname() {
    // 登录客服(agent)账号名。优先旧版 [class*="imUserName"];
    // life.douyin 来客布局取 outbound 行 p.text-right.text-gray-2 文本(内含时间 span,需剔除)
    var el = Dom.queryFirst([
      '[class*="imUserName"]',
      'p[class*="text-right"][class*="text-gray"]',
      'p[class*="text-right"]',
    ])
    if (!el) return ''
    if (el.childNodes) {
      var name = ''
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === 3) name += el.childNodes[i].textContent || ''
      }
      name = String(name || '').trim()
      if (name) return name
    }
    return String(Dom.getText(el) || '').trim()
  }

  function _readAccountBizId() {
    // W19-B1:商家账号稳定键 = URL query accountId(Q1 实测:换客户/换坐席不变,在 '?' 之后)
    try {
      var v = new URLSearchParams(location.search).get('accountId')
      return v ? String(v).trim() : ''
    } catch (_) { return '' }
  }

  function _buildSessionInfo(adapter) {
    var nickname = _readNickname(adapter)
    var pageKey = adapter && adapter.pageKey ? adapter.pageKey : 'douyin'
    if (!nickname || nickname === 'unknown') return null
    var account = _readAccountNickname()
    // 防护:客户昵称若等于登录客服账号名,判为误读(否则所有会话会折叠成一条"客服会话")
    if (account && nickname === account) {
      Logger.warn && Logger.warn('LegacyCollector', 'skip collect: nickname equals agent account (likely misread)')
      return null
    }
    var accountBizId = _readAccountBizId()
    // B3:conversation_id 纳入 account_biz_id(商家账号)维度,防跨账号同名客户误并;
    //     坐席(account_nickname)不进——同账号换坐席仍是同一会话(坐席体现在 service_account_id)。
    //     有 bizId(private-message 真机恒有)→ 新口径;无(laike/feige 暂未抓)→ 退回旧口径,不破。
    var seed = (accountBizId ? [pageKey, accountBizId, nickname] : [pageKey, nickname]).join('|')
    var idBase = 'douyin_' + pageKey.replace(/[^a-z0-9]+/ig, '_') + (accountBizId ? '_' + accountBizId : '')
    return {
      conversationId: idBase + '_' + Dom.simpleHash(seed),
      nickname: nickname,
      accountNickname: account,
      accountBizId: accountBizId,
      pageKey: pageKey,
    }
  }

  async function collectMessageSession(sessionInfo) {
    if (_blocked) {
      // W20-D1:session 级实例冲突阻断中,暂停本 tab 采集(心跳解除后自动恢复)
      Logger.warn && Logger.warn('LegacyCollector', 'skip collect: blocked by session-level instance conflict')
      return { ok: false, reason: 'instance-blocked' }
    }
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) {
      Logger.debug && Logger.debug('LegacyCollector', 'skip collect: page not allowlisted')
      return { ok: false, reason: 'page-not-allowlisted' }
    }
    var adapter = Registry.resolve(location)
    if (!adapter) {
      // 非匹配页(切到别的抖音页)优雅跳过,降 debug 免刷扩展错误页
      Logger.debug && Logger.debug('LegacyCollector', 'no adapter matched current page')
      return { ok: false, reason: 'adapter-missing' }
    }
    if (typeof adapter.getMessages !== 'function' || typeof adapter.toConversationEvent !== 'function') {
      Logger.warn && Logger.warn('LegacyCollector', 'adapter missing collector methods', adapter.adapterKey)
      return { ok: false, reason: 'adapter-method-missing' }
    }
    var baseInfo = _buildSessionInfo(adapter)
    if (!baseInfo) {
      // 无打开会话/昵称 DOM 未出来时优雅跳过,降 debug 免刷扩展错误页
      Logger.debug && Logger.debug('LegacyCollector', 'skip collect: nickname missing')
      return { ok: false, reason: 'nickname-missing' }
    }
    var info = Object.assign(baseInfo, sessionInfo || {})
    var rawMessages = await adapter.getMessages(info)
    var events = (rawMessages || [])
      .map(function (m) { return adapter.toConversationEvent(m, info) })
      .filter(function (event) { return event && event.content_text })
    // W17:锚点窗口对齐赋"会话内 position"(纯位置,持久化于 chrome.storage,跨采集幂等),
    // message_id = syn_hash(conversationId|position),不含内容/方向(D5)。替代旧 _seqMap 内容去重。
    await PositionTracker.assign(baseInfo.conversationId, events)
    events.forEach(function (event) {
      event.message_id = Dom.synthMessageId({
        conversationId: event.conversation_id,
        position: event.position,
      })
    })
    var result = await Collector.collect(events)
    Logger.info && Logger.info('LegacyCollector', 'collectMessageSession', {
      adapter: adapter.adapterKey,
      messages: rawMessages.length,
      collected: result.collected,
      skipped: result.skipped,
    })
    return { ok: true, adapter: adapter.adapterKey, collected: result.collected, skipped: result.skipped }
  }

  function _scheduleCollect() {
    if (_collecting) return
    clearTimeout(_debounce)
    _debounce = setTimeout(async function () {
      if (!Flags.get('collector_v1_enabled') || _collecting) return
      _collecting = true
      try { await collectMessageSession() } catch (err) {
        Logger.warn && Logger.warn('LegacyCollector', 'collect failed', err && err.message)
      } finally {
        _collecting = false
      }
    }, COLLECT_DEBOUNCE_MS)
  }

  // W20-D1:取当前会话的实例冲突心跳上下文(无打开会话/无商家账号 → null,不参与冲突)
  function _currentHeartbeatContext() {
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) return null
    var adapter = Registry.resolve(location)
    if (!adapter) return null
    var info = _buildSessionInfo(adapter)
    if (!info || !info.accountBizId) return null   // laike/feige 等无 bizId → 不做实例冲突
    return {
      platform: 'douyin',
      platform_page: info.pageKey,
      account_biz_id: info.accountBizId,
      conversation_id: info.conversationId,
    }
  }

  var _lastConflictKey = ''
  function _appendPluginLog(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPEND_LOG', message: message, level: 'warn' })
      }
    } catch (_) {}
  }
  function _notifyConflict(kind, context) {
    var bizId = context && context.account_biz_id
    Logger.warn && Logger.warn('LegacyCollector', 'instance conflict', { kind: kind, account_biz_id: bizId })
    try {
      window.dispatchEvent(new CustomEvent('chatsift:collect-conflict', {
        detail: { conflict: 'account', action: kind, context: context },
      }))
    } catch (_) {}
    // W20:写入插件消息日志(节流:同 kind+账号 不重复刷)
    var key = kind + '|' + bizId
    if (key === _lastConflictKey) return
    _lastConflictKey = key
    _appendPluginLog(kind === 'block'
      ? '[实例]: 同一客服账号已有更早的采集实例在运行，本页已暂停采集'
      : '[实例]: 检测到同账号其他采集实例，本实例为最早，继续采集')
  }

  // 周期心跳:session-block → 暂停本 tab 采集;account-warn → 仅强提醒不停采;无冲突 → 解除阻断恢复采集。
  // ★心跳失败(网络/无 token,sendHeartbeat 返回 null)→ fail-open,不改变采集态,绝不误停合法采集。
  async function _heartbeatTick() {
    if (_hbInflight || !Identity || !Identity.sendHeartbeat) return
    if (!Flags.get('collector_v1_enabled')) return
    var context = _currentHeartbeatContext()
    if (!context) return
    _hbInflight = true
    try {
      var res = await Identity.sendHeartbeat(context)
      if (!res) return
      // ★账号级 + 仲裁:server 按注册先后判定 —— action='block'(更晚,暂停)/'primary'(最早,继续)/无(独占)。
      if (res.action === 'block') {
        _blocked = true
        _notifyConflict('block', context)
      } else if (res.action === 'primary') {
        if (_blocked) { _blocked = false; Logger.info && Logger.info('LegacyCollector', 'now primary, collection resumed') }
        _notifyConflict('primary', context)
      } else {
        if (_blocked) {
          _blocked = false
          Logger.info && Logger.info('LegacyCollector', 'instance conflict cleared, collection resumed')
          _appendPluginLog('[实例]: 冲突解除，恢复采集')
        }
        _lastConflictKey = ''
      }
    } catch (err) {
      Logger.warn && Logger.warn('LegacyCollector', 'heartbeat tick failed', err && err.message)
    } finally {
      _hbInflight = false
    }
  }

  function _startHeartbeat() {
    if (_hbTimer || !Identity || !Identity.sendHeartbeat) return
    _hbTimer = setInterval(function () { _heartbeatTick() }, HEARTBEAT_INTERVAL_MS)
  }

  function _stopHeartbeat() {
    if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null }
    _blocked = false   // 停采时清阻断态,下次 start 重新检测
  }

  async function start() {
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) {
      Logger.info && Logger.info('LegacyCollector', 'blocked: page not allowlisted')
      return false
    }
    if (_observer) return true
    await Uploader.start()
    _startHeartbeat()
    _observer = new MutationObserver(function () { _scheduleCollect() })
    _observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true })
    _scheduleCollect()
    Logger.info && Logger.info('LegacyCollector', 'started')
    return true
  }

  function stop() {
    clearTimeout(_debounce)
    if (_observer) _observer.disconnect()
    _observer = null
    Uploader.stop()
    _stopHeartbeat()
    Logger.info && Logger.info('LegacyCollector', 'stopped')
  }

  function _syncFlag() {
    if (Flags.get('collector_v1_enabled')) start()
    else if (_observer) stop()
  }

  function boot() {
    if (_timer) return
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (!message || !message.action) return
        if (message.action === 'START_COLLECTOR') {
          start().then(function (ok) { sendResponse({ ok: !!ok }) })
          return true
        }
        if (message.action === 'STOP_COLLECTOR') {
          stop()
          sendResponse({ ok: true })
          return true
        }
      })
    }
    setTimeout(_syncFlag, 500)
    _timer = setInterval(_syncFlag, 1000)
  }

  // W21:安全显式采集当前会话入口(供 assisted collector 切换确认后立即采集)。
  //   复用 collectMessageSession()——★不改 position/message_id/occurred_at/batch 契约;
  //   仍受 _blocked(实例冲突)与 collector_v1_enabled 门控,不绕过任何采集约束。
  async function collectNow() {
    if (_blocked) return { ok: false, reason: 'instance-blocked' }
    if (!Flags.get('collector_v1_enabled')) return { ok: false, reason: 'collector-disabled' }
    return collectMessageSession()
  }

  window.RpaLegacyCollector = {
    boot: boot,
    start: start,
    stop: stop,
    collectMessageSession: collectMessageSession,
    collectNow: collectNow,                        // W21:显式采集入口
    isBlocked: function () { return _blocked },   // W20-D1:观测当前是否被实例冲突阻断
  }

  boot()
})()

// ============================================================
// MODULE: runtime/assisted-collector.js
// ============================================================

;(function () {
  'use strict'

  // W21 辅助采集器:低频自动切换"当前客服页面"的可见未读会话,切换确认后显式触发一次采集。
  //   ★只切换、不发送、不输入、不回复;只走 adapter.switchSession()(不直接点击 DOM 节点);
  //   ★不改 position/message_id/occurred_at(采集仍走 legacy collectNow → collectMessageSession);
  //   ★服从 W20:采集权(collect-permission 只读接口)+ 账号级 account block;人工操作立即暂停。
  //   入口=插件面板"客服配置-自动化配置-自动切换会话"开关 auto_switch_session(默认 false)。

  var Flags = window.RpaFeatureFlags
  var Registry = window.RpaAdapterRegistry
  var Legacy = window.RpaLegacyCollector
  var Logger = window.RpaLogger || console
  if (!Flags || !Registry) return // 缺核心依赖则不启用(不影响采集)

  // ── 常量(环境无关)────────────────────────────────────
  var TARGET_ADAPTER = 'douyin/private-message'
  var DEFAULT_SERVER_URL = 'https://admin.kongyuekeji.com'

  // ── 时间参数 Profile:prod 与 test/local 两套,按 serverUrl 环境固化进代码 ──
  //   ★环境判据(_detectProfile):原始 serverUrl 含 localhost / 127.0.0.1 / "test" => test/local;
  //     否则默认 prod(保守)。SWITCH_JITTER 用 [min,max] 表达 prod 的 3000~6000 抖动区间。
  var PROFILES = {
    prod: {
      HUMAN_IDLE_MS: 1 * 60 * 1000,   // 1min 无人工才扫描(v0.6.3:5min→1min,Chase)
      SWITCH_GAP_MS: 12000,            // 两次切换最小间隔
      SWITCH_JITTER_MIN_MS: 3000,      // 抖动下限
      SWITCH_JITTER_MAX_MS: 6000,      // 抖动上限(实际抖动随机落在 [3000,6000])
      COOLDOWN_MS: 180000,             // 单轮后冷却 3min
      RATE_PER_MIN: 6,                 // 单账号每分钟最多切换次数
      MAX_CANDIDATES: 5,
      SUPPRESS_MS: 3500,               // 切换前后抑制弱人工事件窗口
      CONFIRM_WAIT_MS: 1500,           // 切换确认后等 DOM 稳定
      TICK_MS: 5000,
    },
    test: {
      HUMAN_IDLE_MS: 5000,
      SWITCH_GAP_MS: 4000,
      SWITCH_JITTER_MIN_MS: 0,
      SWITCH_JITTER_MAX_MS: 1000,      // test 抖动 [0,1000]
      COOLDOWN_MS: 15000,
      RATE_PER_MIN: 12,
      MAX_CANDIDATES: 5,
      SUPPRESS_MS: 3500,
      CONFIRM_WAIT_MS: 1500,
      TICK_MS: 2000,
    },
  }

  var _profile = 'prod'
  var TICK_MS, HUMAN_IDLE_MS, MAX_CANDIDATES, SWITCH_GAP_MS,
    SWITCH_JITTER_MIN_MS, SWITCH_JITTER_MAX_MS, COOLDOWN_MS, RATE_PER_MIN,
    CONFIRM_WAIT_MS, SUPPRESS_MS
  function _applyProfile(name) {
    _profile = PROFILES[name] ? name : 'prod'
    var p = PROFILES[_profile]
    TICK_MS = p.TICK_MS; HUMAN_IDLE_MS = p.HUMAN_IDLE_MS; MAX_CANDIDATES = p.MAX_CANDIDATES
    SWITCH_GAP_MS = p.SWITCH_GAP_MS; SWITCH_JITTER_MIN_MS = p.SWITCH_JITTER_MIN_MS; SWITCH_JITTER_MAX_MS = p.SWITCH_JITTER_MAX_MS
    COOLDOWN_MS = p.COOLDOWN_MS; RATE_PER_MIN = p.RATE_PER_MIN; CONFIRM_WAIT_MS = p.CONFIRM_WAIT_MS; SUPPRESS_MS = p.SUPPRESS_MS
  }
  function _detectProfile(rawServerUrl) {
    var u = String(rawServerUrl || '').toLowerCase()
    if (u.indexOf('localhost') >= 0 || u.indexOf('127.0.0.1') >= 0 || u.indexOf('test') >= 0) return 'test'
    return 'prod'
  }
  _applyProfile('prod') // 同步默认 prod;init 异步读 serverUrl 后按环境切换

  // 强人工事件:始终暂停(真人点击/打字),不被抑制窗口屏蔽;弱事件:切换窗口内忽略(可能由切换/页面重排引发)。
  var STRONG_EVENTS = { mousedown: 1, keydown: 1 }
  var WEAK_EVENTS = { mousemove: 1, wheel: 1, focus: 1 }

  var STATE = {
    DISABLED: 'disabled', IDLE: 'idle', PAUSED_HUMAN: 'paused_by_human',
    SCANNING: 'scanning', COOLDOWN: 'cooldown', BLOCKED: 'blocked_by_w20',
  }

  // ── 运行态 ──────────────────────────────────────────────
  var _state = STATE.DISABLED
  var _timer = null
  var _scanning = false
  var _abortRound = false
  var _lastHumanActionAt = Date.now() // 初始视为刚有人工 → 需静默 15min 才扫描
  var _cooldownUntil = 0
  var _lastSwitchAt = 0
  var _switchTs = []                   // 限速时间戳
  var _bound = false
  var _lastLog = ''
  var _suppressHumanUntil = 0          // 切换抑制窗口截止(此前的弱人工事件忽略)

  function _now() { return Date.now() }
  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  async function _sleepInterruptible(ms) {
    var end = _now() + ms
    while (_now() < end) {
      if (_abortRound) return
      await _sleep(Math.min(200, Math.max(0, end - _now())))
    }
  }

  function _setState(s, reason) {
    _state = s
    var key = s + '|' + (reason || '')
    if (key === _lastLog) return
    _lastLog = key
    var msg = _stateMessage(s, reason)
    if (msg) _appendLog(msg)
  }
  function _stateMessage(s, reason) {
    switch (s) {
      // PAUSED_HUMAN 不在此处记:扫描中由 _onHuman 带 event type 记;轮首人工活跃静默(避免刷屏)
      case STATE.PAUSED_HUMAN: return ''
      case STATE.BLOCKED: return '[自动切换]: 该客服账号被实例冲突阻断，暂停自动切换'
      case STATE.SCANNING: return '[自动切换]: 开始一轮自动切换'
      case STATE.COOLDOWN: return '[自动切换]: 本轮结束，进入冷却'
      case STATE.IDLE:
        if (reason && reason.indexOf('collect-perm') === 0) return '[自动切换]: 当前账号无采集权(' + reason.replace('collect-perm:', '') + ')，不自动切换'
        return ''
      default: return ''
    }
  }
  function _appendLog(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'APPEND_LOG', message: message, level: 'info' })
      }
    } catch (_) {}
    Logger.info && Logger.info('AssistedCollector', message)
  }

  function _readAccountBizId() {
    try { var v = new URLSearchParams(location.search).get('accountId'); return v ? String(v).trim() : '' } catch (_) { return '' }
  }
  function _humanActiveRecently() { return (_now() - _lastHumanActionAt) < HUMAN_IDLE_MS }

  // ── W20 采集权只读检查 ─────────────────────────────────
  function _normalizeBaseUrl(url) {
    var n = String(url || DEFAULT_SERVER_URL).replace(/\/$/, '')
    if (n === 'http://127.0.0.1:3000' || n === 'http://localhost:3000') return DEFAULT_SERVER_URL
    return n
  }
  function _storageGet(keys) {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return resolve({})
      chrome.storage.local.get(keys, function (d) { resolve((chrome.runtime && chrome.runtime.lastError) ? {} : (d || {})) })
    })
  }
  async function _loadAuth() {
    var data = await _storageGet(['token', 'authToken', 'accessToken', 'cfg', 'serverUrl', 'auth'])
    var cfg = data.cfg || {}, auth = data.auth || {}
    return {
      token: data.token || data.authToken || data.accessToken || auth.token || auth.accessToken || '',
      serverUrl: _normalizeBaseUrl(cfg.serverUrl || data.serverUrl || auth.serverUrl),
    }
  }
  async function _checkCollectPermission(bizId) {
    try {
      var auth = await _loadAuth()
      if (!auth.token) return { allowed: false, reason: 'no-auth' }
      var url = auth.serverUrl + '/api/v1/service-accounts/collect-permission'
        + '?platform=douyin&platform_page=private-message&account_biz_id=' + encodeURIComponent(bizId)
      var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + auth.token } })
      if (!resp.ok) return { allowed: false, reason: 'http-' + resp.status }
      var json = {}; try { json = await resp.json() } catch (_) {}
      return (json && json.data) || { allowed: false, reason: 'unknown' }
    } catch (_) { return { allowed: false, reason: 'error' } }
  }

  // ── 候选 ────────────────────────────────────────────────
  function _candidateKey(s) { return s && s.raw_id ? ('id:' + s.raw_id) : (s && s.nickname ? ('nk:' + s.nickname) : null) }
  function _planCandidates(sessions) {
    var list = (sessions || []).filter(function (s) { return s && s.dom_ref && s.unread_count > 0 && _candidateKey(s) })
    list.sort(function (a, b) { return (b.unread_count || 0) - (a.unread_count || 0) }) // unread 降序;同序保持 DOM 顺序(稳定排序)
    var plan = []
    for (var i = 0; i < list.length && plan.length < MAX_CANDIDATES; i++) {
      plan.push({ key: _candidateKey(list[i]), unread: list[i].unread_count })
    }
    return plan
  }
  function _rematch(sessions, key) {
    for (var i = 0; i < (sessions || []).length; i++) {
      if (_candidateKey(sessions[i]) === key && sessions[i].dom_ref && sessions[i].unread_count > 0) return sessions[i]
    }
    return null
  }

  // ── 限速:单账号每分钟 <= RATE_PER_MIN ───────────────────
  function _rateOk() {
    var cut = _now() - 60000
    _switchTs = _switchTs.filter(function (t) { return t > cut })
    return _switchTs.length < RATE_PER_MIN
  }
  function _recordSwitch() { _lastSwitchAt = _now(); _switchTs.push(_now()) }

  // ── 同步启动闸门(不含异步采集权)──────────────────────
  function _evaluateGates() {
    if (!Flags.get('auto_switch_session')) return { ok: false, state: STATE.DISABLED }
    if (!Flags.get('collector_v1_enabled')) return { ok: false, state: STATE.DISABLED }
    if (window.ChatsiftContentGate && !window.ChatsiftContentGate.isAllowed()) return { ok: false, state: STATE.DISABLED }
    var adapter = Registry.resolve(location)
    if (!adapter || adapter.adapterKey !== TARGET_ADAPTER) return { ok: false, state: STATE.DISABLED }
    if (typeof adapter.detectSessions !== 'function' || typeof adapter.switchSession !== 'function') return { ok: false, state: STATE.DISABLED }
    var bizId = _readAccountBizId()
    if (!bizId) return { ok: false, state: STATE.IDLE }
    if (_humanActiveRecently()) return { ok: false, state: STATE.PAUSED_HUMAN }
    if (Legacy && Legacy.isBlocked && Legacy.isBlocked()) return { ok: false, state: STATE.BLOCKED }
    if (_now() < _cooldownUntil) return { ok: false, state: STATE.COOLDOWN }
    return { ok: true, adapter: adapter, bizId: bizId }
  }

  // ── 一轮扫描 ────────────────────────────────────────────
  async function _runRound(adapter) {
    if (_scanning) return
    _scanning = true
    _abortRound = false
    _setState(STATE.SCANNING)
    try {
      var sessions = await adapter.detectSessions()
      var plan = _planCandidates(sessions) // 轮首只存稳定键,不缓存 dom_ref
      if (!plan.length) { _appendLog('[自动切换]: 当前无未读候选'); return }
      _appendLog('[自动切换]: 本轮候选 ' + plan.length + ' 个(最多 ' + MAX_CANDIDATES + ')')
      for (var i = 0; i < plan.length; i++) {
        // 每候选前复查:人工(_abortRound 由真实人工事件置位)/ 开关 / block / 限速
        if (_abortRound) { _setState(STATE.PAUSED_HUMAN); return }
        if (!Flags.get('auto_switch_session')) { _setState(STATE.DISABLED); return }
        if (Legacy && Legacy.isBlocked && Legacy.isBlocked()) { _setState(STATE.BLOCKED); return }
        if (i > 0) {
          var _jit = SWITCH_JITTER_MIN_MS + Math.floor(Math.random() * (SWITCH_JITTER_MAX_MS - SWITCH_JITTER_MIN_MS + 1))
          await _sleepInterruptible(SWITCH_GAP_MS + _jit)
          if (_abortRound) { _setState(STATE.PAUSED_HUMAN); return }
        }
        if (!_rateOk()) { _appendLog('[自动切换]: 达单账号每分钟上限，跳过'); continue }
        // ★每次切换前重新 detect + 按稳定键重匹配当前 DOM 节点(不复用旧 dom_ref)
        var fresh = await adapter.detectSessions()
        var cand = _rematch(fresh, plan[i].key)
        if (!cand) { _appendLog('[自动切换]: 候选已不在列表，跳过'); continue }
        _suppress(SUPPRESS_MS) // ★切换前开抑制窗口:吸收切换/页面重排引发的弱事件(mousemove/focus)
        var sw = await adapter.switchSession(cand) // 只走 adapter,内部硬闸再校验 auto_switch_session
        if (!sw || !sw.ok) { _appendLog('[自动切换]: 切换未成(' + (sw && sw.reason) + ')'); continue }
        _recordSwitch()
        _suppress(SUPPRESS_MS) // 延续抑制覆盖确认+稳定+采集
        var confirmed = await adapter.confirmActiveSession(cand)
        if (!confirmed) { _appendLog('[自动切换]: 激活确认失败，跳过采集'); continue }
        await _sleepInterruptible(CONFIRM_WAIT_MS)
        if (_abortRound) { _setState(STATE.PAUSED_HUMAN); return }
        if (Legacy && Legacy.collectNow) {
          _suppress(SUPPRESS_MS) // 覆盖 collectNow 的 DOM 读取重排
          var r = await Legacy.collectNow() // 显式采集(复用 legacy 链路,不改 position/message_id)
          _appendLog('[自动切换]: 已切换并采集(' + (r && r.ok ? ('收 ' + (r.collected || 0)) : ('未采:' + (r && r.reason))) + ')')
        }
      }
    } catch (err) {
      _appendLog('[自动切换]: 本轮异常 ' + (err && err.message))
    } finally {
      _scanning = false
      _suppressHumanUntil = 0
      _cooldownUntil = _now() + COOLDOWN_MS
      _setState(STATE.COOLDOWN)
    }
  }

  // ── tick:闸门 → 采集权 → 扫描 ──────────────────────────
  async function _tick() {
    if (_scanning) return
    var g = _evaluateGates()
    if (!g.ok) { _setState(g.state); return }
    var perm = await _checkCollectPermission(g.bizId)
    if (!perm.allowed) { _setState(STATE.IDLE, 'collect-perm:' + (perm.reason || 'unknown')); return }
    if (_humanActiveRecently() || !Flags.get('auto_switch_session')) return // 异步期间状态可能变
    await _runRound(g.adapter)
  }

  // ── 人工互锁监听 ───────────────────────────────────────
  //   ★区分真人 vs 插件/页面:isTrusted=false(脚本派发的合成事件)直接忽略;
  //   强事件(mousedown/keydown)始终暂停;弱事件(mousemove/wheel/focus)在切换抑制窗口内忽略。
  function _suppress(ms) { var u = _now() + ms; if (u > _suppressHumanUntil) _suppressHumanUntil = u }
  function _onHuman(e) {
    if (!e || e.isTrusted === false) return // 插件自身/脚本合成事件不算人工
    var type = e.type
    if (WEAK_EVENTS[type] && _now() < _suppressHumanUntil) return // 切换抑制窗口内弱事件忽略
    _lastHumanActionAt = _now()
    if (_scanning && !_abortRound) {
      _abortRound = true
      _appendLog('[自动切换]: 检测到人工操作(' + type + ')，暂停本轮')
    }
  }
  function _bindHuman() {
    if (_bound) return
    _bound = true
    Object.keys(STRONG_EVENTS).concat(Object.keys(WEAK_EVENTS)).forEach(function (ev) {
      try { window.addEventListener(ev, _onHuman, { passive: true, capture: true }) } catch (_) {}
    })
  }

  // ── 启停(开关联动:关闭立停 timer + 中止本轮)──────────
  function _startTimer() {
    _bindHuman()
    if (_timer) return
    _timer = setInterval(function () { _tick() }, TICK_MS)
    _appendLog('[自动切换]: 已开启（低频自动切换当前客服页会话，人工操作时暂停；不承诺全量无漏）')
  }
  function _stopTimer(reason) {
    if (_timer) { clearInterval(_timer); _timer = null }
    _abortRound = true
    _cooldownUntil = 0
    _setState(STATE.DISABLED, reason)
    if (reason === 'switch-off') _appendLog('[自动切换]: 已关闭，停止自动切换')
  }
  function _syncEnabled() {
    if (Flags.get('auto_switch_session')) _startTimer()
    else _stopTimer('switch-off')
  }

  // storage 变更联动开关
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.auto_switch_session) setTimeout(_syncEnabled, 0)
      })
    }
  } catch (_) {}
  _bindHuman()
  // 异步探测环境(原始 serverUrl,不经 normalize)→ 固化时间参数 profile;再判开关。两者都默认 prod,竞态安全。
  ;(async function _initProfile() {
    try {
      var data = await _storageGet(['cfg', 'serverUrl', 'auth'])
      var cfg = data.cfg || {}, auth = data.auth || {}
      var raw = cfg.serverUrl || data.serverUrl || auth.serverUrl || DEFAULT_SERVER_URL
      _applyProfile(_detectProfile(raw))
    } catch (_) {}
    setTimeout(_syncEnabled, 1500) // 等 feature-flags 从 storage 载入持久开关后再判
  })()

  function _debugConfig() {
    return {
      profile: _profile,
      HUMAN_IDLE_MS: HUMAN_IDLE_MS, SWITCH_GAP_MS: SWITCH_GAP_MS,
      SWITCH_JITTER_MIN_MS: SWITCH_JITTER_MIN_MS, SWITCH_JITTER_MAX_MS: SWITCH_JITTER_MAX_MS,
      COOLDOWN_MS: COOLDOWN_MS, RATE_PER_MIN: RATE_PER_MIN, MAX_CANDIDATES: MAX_CANDIDATES,
      SUPPRESS_MS: SUPPRESS_MS, CONFIRM_WAIT_MS: CONFIRM_WAIT_MS, TICK_MS: TICK_MS,
    }
  }

  window.RpaAssistedCollector = {
    getState: function () { return _state },
    getDebugConfig: _debugConfig, // 验收用:看当前 profile + 全部时间参数
    _syncEnabled: _syncEnabled,
    // DevTools 调试:仅临时覆盖当前页面运行态,不写 storage、不持久化;刷新即恢复 profile 值。
    _debugSetHumanIdleMs: function (ms) { HUMAN_IDLE_MS = ms | 0 },
    _debugSetSwitchGapMs: function (ms) { SWITCH_GAP_MS = ms | 0 },
    _debugSetCooldownMs: function (ms) { COOLDOWN_MS = ms | 0 },
    _debugSetProfile: function (name) { _applyProfile(name); return _debugConfig() }, // 临时切 prod/test 验收
  }
})()

// ============================================================
// MODULE: runtime/self-check.js
// ============================================================

;(function () {
  'use strict'

  // V1.9 Runtime Self-Check（M6）
  //
  // 用途：让人工 QA 通过 DevTools 一行命令验证 V1.9 链路完整性，
  //       不依赖真实平台 DOM，可在任意页面执行。
  //
  // 用法：window.RpaV19SelfCheck.run()  →  Promise<{ ok, results }>
  //
  // 检查项（covers M1-M5）：
  //   1. 全局模块是否注册齐全
  //   2. RuntimeStateMachine 转换约束（合法 + 非法都验）
  //   3. LkTracer 写入 + flush 链路
  //   4. BatchManager 创建 / 合并 / 状态机
  //   5. QueueManager 入队 / unstable 拒绝 / 调度
  //   6. AdapterRegistry 注册数量 + matchPage 路由
  //   7. SessionIdentityResolver L1/L2/L3 三档
  //   8. RuntimeManager start / stop 生命周期

  function _expect(actual, expected, label) {
    return { label: label, ok: actual === expected, actual: actual, expected: expected }
  }

  function _has(globalName) {
    return { label: 'globals.' + globalName, ok: !!window[globalName] }
  }

  async function _checkSM() {
    var SM = window.RpaRuntimeStateMachine
    var C  = window.RpaConstants
    if (!SM || !C) return [{ label: 'sm.deps', ok: false }]
    var S = C.RuntimeState
    var sm = SM.create(S.IDLE)
    var ok1 = sm.transition(S.SCANNING).ok
    var ok2 = sm.transition(S.SENDING).ok   // 非法：SCANNING → SENDING
    return [
      _expect(ok1, true,  'sm.IDLE→SCANNING legal'),
      _expect(ok2, false, 'sm.SCANNING→SENDING illegal'),
      _expect(SM.isCritical(S.SENDING),    true,  'sm.isCritical(SENDING)'),
      _expect(SM.isCritical(S.IDLE),       false, 'sm.isCritical(IDLE)'),
    ]
  }

  function _checkBatchManager() {
    var B = window.RpaBatchManager
    if (!B) return [{ label: 'batch.deps', ok: false }]
    var initialSnap = B.snapshot().length
    var batch = B.create({
      platform:   'douyin',
      pageKey:    'douyin-laike-message',
      session_id: 'test-session-self-check',
      inbound_messages: [{ content: 'hi', timestamp: '2026-05-25 12:00:00' }],
    })
    var hasBatchId = !!(batch && batch.batch_id)

    var dup = B.create({
      platform:   'douyin',
      pageKey:    'douyin-laike-message',
      session_id: 'test-session-self-check',
      inbound_messages: [{ content: 'hi', timestamp: '2026-05-25 12:00:00' }],
    })
    var dupSameId = !!(dup && batch && dup.batch_id === batch.batch_id)

    // BatchManager.mergeInbound 是 in-place 修改并返回同一引用，
    // 必须在 merge 前先保存 hash 副本再对比，否则比较的是同一字符串
    var originalHash = batch.batch_hash
    var merged = B.mergeInbound(batch.batch_id, [{ content: 'second', timestamp: '2026-05-25 12:00:01' }])
    var mergedCount = merged ? merged.inbound_messages.length : 0
    var hashChanged = merged && merged.batch_hash !== originalHash

    // 转换：NEW → COLLECTING → STABLE_WAIT → DECIDING → SENDING → CONFIRMING → SYNCING → DONE
    var t1 = B.transition(batch.batch_id, B.BatchStatus.COLLECTING).ok
    var t2 = B.transition(batch.batch_id, B.BatchStatus.DONE).ok   // 非法跳转
    var t3 = B.transition(batch.batch_id, B.BatchStatus.STABLE_WAIT).ok

    return [
      _expect(hasBatchId,     true, 'batch.create returns batchId'),
      _expect(dupSameId,      true, 'batch.create idempotent on same uniq'),
      _expect(mergedCount,    2,    'batch.mergeInbound appends'),
      _expect(!!hashChanged,  true, 'batch.mergeInbound recomputes hash'),
      _expect(t1, true,  'batch.transition NEW→COLLECTING legal'),
      _expect(t2, false, 'batch.transition COLLECTING→DONE illegal'),
      _expect(t3, true,  'batch.transition COLLECTING→STABLE_WAIT legal'),
      _expect(B.snapshot().length >= initialSnap + 1, true, 'batch.snapshot grows'),
    ]
  }

  function _checkQueue() {
    var Q = window.RpaQueueManager
    if (!Q) return [{ label: 'queue.deps', ok: false }]
    Q.clear()
    var ok1 = Q.enqueue({
      batchId:    'self-check-q1',
      session_id: 'q1-sess',
      platform:   'douyin',
      pageKey:    'douyin-laike-message',
    })
    var dup  = Q.enqueue({
      batchId:    'self-check-q1',
      session_id: 'q1-sess',
      platform:   'douyin',
    })
    var rejL3 = Q.enqueue({
      batchId:    'self-check-q-l3',
      session_id: 'q-l3-sess',
      platform:   'douyin',
      unstable:   true,
    })
    var snap = Q.snapshot()
    return [
      _expect(ok1,  true,  'queue.enqueue accepts'),
      _expect(dup,  false, 'queue.enqueue dedupe'),
      _expect(rejL3, false, 'queue.enqueue rejects unstable=true (L3)'),
      _expect(snap.queue.length, 1, 'queue snapshot size'),
    ]
  }

  function _checkRegistry() {
    var R = window.RpaAdapterRegistry
    if (!R) return [{ label: 'registry.deps', ok: false }]
    var list = R.list()
    var hasLaike   = !!R.getByKey('douyin/laike-message')
    var hasPrivate = !!R.getByKey('douyin/private-message')
    var hasFeige   = !!R.getByKey('douyin/feige')
    return [
      _expect(list.length >= 3, true, 'registry has ≥3 adapters'),
      _expect(hasLaike,   true,  'douyin/laike-message registered'),
      _expect(hasPrivate, true,  'douyin/private-message registered'),
      _expect(hasFeige,   true,  'douyin/feige registered'),
    ]
  }

  function _checkIdentity() {
    var I = window.RpaSessionIdentityResolver
    if (!I) return [{ label: 'identity.deps', ok: false }]

    // 直接构造 plain object node，避免依赖 DOM API（兼容 Node 验证脚本）。
    // 提供最小子集：getAttribute / querySelector / textContent / getBoundingClientRect。
    function makeMockNode(attrs, children, text) {
      attrs = attrs || {}
      children = children || []
      return {
        getAttribute: function (k) { return attrs[k] || null },
        querySelector: function (sel) {
          for (var i = 0; i < children.length; i++) {
            if (children[i].matches && children[i].matches(sel)) return children[i]
          }
          return null
        },
        querySelectorAll: function () { return [] },
        textContent: text || '',
        getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0 } },
      }
    }
    function makeChild(matchSel, text, attrs) {
      attrs = attrs || {}
      return {
        matches: function (sel) {
          return matchSel === sel || (sel && matchSel.indexOf(sel.replace(/\[class\*=/, '').replace(/[\]"]/g, '')) >= 0)
        },
        getAttribute: function (k) { return attrs[k] || null },
        textContent: text || '',
        src: attrs.src || '',
      }
    }

    // L1：有 data-conversation-id
    var mock1 = makeMockNode({ 'data-conversation-id': 'cid-12345' })
    var r1 = I.resolve('douyin', 'douyin-laike-message', 'acct1', mock1)

    // L2：无 attr，但 querySelector 能匹配到 nickname + img
    var mock2 = makeMockNode({}, [
      { matches: function (s) { return /nickname|userName|title/.test(s) }, textContent: '小张', src: '' },
      { matches: function (s) { return s === 'img' }, src: 'https://avatar.example.com/x.png', getAttribute: function () { return null }, textContent: '' },
    ])
    var r2 = I.resolve('douyin', 'douyin-laike-message', 'acct1', mock2)

    // L3：什么都没有，只有 textContent
    var mock3 = makeMockNode({}, [], '小李说：你好')
    var r3 = I.resolve('douyin', 'douyin-laike-message', 'acct1', mock3)

    return [
      _expect(r1.level, 1, 'identity L1 from data-conversation-id'),
      _expect(r1.unstable, false, 'L1 unstable=false'),
      _expect(r2.level, 2, 'identity L2 from nickname+avatar'),
      _expect(r2.unstable, false, 'L2 unstable=false'),
      _expect(r3.level, 3, 'identity L3 fallback'),
      _expect(r3.unstable, true,  'L3 unstable=true'),
    ]
  }

  function _checkLkTracer() {
    var T = window.RpaLkTracer
    if (!T) return [{ label: 'tracer.deps', ok: false }]
    T.init({ runtimeId: 'self-check-rt', platform: 'douyin', pageKey: 'self-check' })
    var beforeSnap = T.snapshot()
    T.log({ lk_code: 'LK-STATE', stage: 'runtime', status: 'success', message: 'self-check log A' })
    T.log({ lk_code: 'LK-STATE', stage: 'runtime', status: 'failed',  message: 'self-check log B' })
    var afterSnap = T.snapshot()
    return [
      _expect(afterSnap.bufferSize >= beforeSnap.bufferSize + 2, true, 'tracer.log adds to buffer'),
    ]
  }

  async function run(opts) {
    opts = opts || {}
    var results = []

    // 1. 全局模块
    var globals = [
      'RpaConstants', 'RpaHash', 'RpaLogger',
      'RpaFeatureFlags',
      'RpaRuntimeStateMachine', 'RpaLkTracer',
      'RpaAdapterRegistry', 'RpaBatchManager', 'RpaQueueManager',
      'RpaWatchdog', 'RpaRecoveryManager',
      'RpaSessionIdentityResolver',
      'RpaDomUtils', 'RpaAdapterHelpers',
      'RpaRuntimeManager',
    ]
    globals.forEach(function (g) { results.push(_has(g)) })

    // 2. StateMachine
    results = results.concat(await _checkSM())
    // 3. Batch
    results = results.concat(_checkBatchManager())
    // 4. Queue
    results = results.concat(_checkQueue())
    // 5. Registry
    results = results.concat(_checkRegistry())
    // 6. Identity
    results = results.concat(_checkIdentity())
    // 7. LkTracer
    results = results.concat(_checkLkTracer())

    // ── self-check 完成后必须清理自己的副作用 ────────────────
    // _checkBatchManager / _checkQueue 等会往内存 + chrome.storage 写测试数据。
    // 如果不清理，reload 后这些孤儿数据会触发 chaos-monitor I3 violation。
    try {
      if (window.RpaQueueManager) window.RpaQueueManager.clear()
      if (window.RpaBatchManager) window.RpaBatchManager.reset()
    } catch (_) {}

    var pass = results.filter(function (r) { return r.ok }).length
    var fail = results.filter(function (r) { return !r.ok }).length
    var ok   = fail === 0

    if (!opts.silent && typeof console !== 'undefined') {
      console.group('[V19][SelfCheck] result: ' + (ok ? 'PASS' : 'FAIL') + ' (' + pass + '/' + (pass + fail) + ')')
      results.forEach(function (r) {
        var prefix = r.ok ? '✓' : '✗'
        console[r.ok ? 'log' : 'warn'](prefix + ' ' + r.label, r.ok ? '' : { actual: r.actual, expected: r.expected })
      })
      console.groupEnd()
    }

    return { ok: ok, pass: pass, fail: fail, total: results.length, results: results }
  }

  window.RpaV19SelfCheck = { run: run }

})()

// ============================================================
// MODULE: runtime/chaos-monitor.js
// ============================================================

// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9-QA Chaos Monitor（V1.9-QA_Runtime_Chaos_Verification 阶段使用）
  //
  // 这不是业务逻辑，是 Runtime 内部的"不变量哨兵"。
  // 周期性轮询全局状态，检查 6 条不变量；任一违反 → 立即 LK-CHAOS-VIOLATION + 控制台 error。
  //
  // 设计原则：
  //   - 只读，不改任何业务状态
  //   - 默认不启动，DevTools 显式 `window.RpaChaosMonitor.start()` 才跑
  //   - strict 模式下违反抛异常（让 chaos 测试明确失败），非 strict 仅记录
  //   - 不依赖任何 V1.9 协议外的接口，纯通过公开 snapshot() 读取
  //
  // 6 条不变量：
  //   I1  同 session_id 同时刻 batch in {SENDING, CONFIRMING, SYNCING} ≤ 1
  //       —— 抓 duplicate send / 并发发送
  //   I2  queue.processing 引用的 batch 必须处于 in-flight 状态
  //       —— 抓 queue state drift
  //   I3  Queue 中所有 batchId 都能在 BatchManager 中找到（无孤儿 queue item）
  //       —— 抓 BatchManager 被清空但 Queue 没同步
  //   I4  adapter 注册数量在 runtime 运行期间稳定
  //       —— 抓重复注入 / 模块重复加载
  //   I5  send_runtime_v19 关闭时不应有 SENDING/CONFIRMING/SYNCING batch
  //       —— 抓 Flag 失效
  //   I6  终态 batch（DONE/FAILED/ABORTED）数量只升不降
  //       —— 抓 zombie batch 复活 / Recovery 错误重激活
  //
  // 注：plugin 端的 BatchManager._byId 是单值索引，"同 batch_id 跨 session_id"
  // 在内存层面会被自动覆盖（生产路径上 session_id 由 resolver 派生不会碰撞）。
  // 跨平台 batch_id 唯一性的真正保护在服务端 chat_batches 复合唯一约束
  // (platform, page_key, session_id, batch_hash)，由后端 SQL 层兜底，不在此监控。

  var C       = window.RpaConstants
  var Tracer  = window.RpaLkTracer
  var Logger  = window.RpaLogger
  if (!C || !Tracer || !Logger) throw new Error('[V19] ChaosMonitor dependencies missing')

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  var DEFAULTS = {
    intervalMs: 5000,
    strictMode: false,
    maxViolationsKept: 100,
  }

  var _state = {
    timer:           null,
    intervalMs:      DEFAULTS.intervalMs,
    strictMode:      DEFAULTS.strictMode,
    violations:      [],
    checkCount:      0,
    lastAdapterCount: null,
    lastTerminalCount: 0,
  }

  // _record 只记录，不抛。strict 模式的 throw 由 check() 顶层处理，
  // 避免 invariant 函数内的 try-catch 吞掉 strict 的异常。
  function _record(ruleId, ruleText, detail) {
    var violation = {
      rule_id:   ruleId,
      rule_text: ruleText,
      detail:    detail || {},
      ts:        Date.now(),
      checkNo:   _state.checkCount,
    }
    _state.violations.push(violation)
    if (_state.violations.length > DEFAULTS.maxViolationsKept) {
      _state.violations.shift()
    }
    Tracer.log({
      lk_code: LK.CHAOS_VIOLATION,
      stage:   Stage.ERROR,
      status:  Status.FAILED,
      message: 'CHAOS VIOLATION ' + ruleId + ': ' + ruleText,
      detail:  detail || {},
    })
    Logger.error('ChaosMonitor', 'VIOLATION', ruleId, detail)
  }

  // ── 不变量实现 ───────────────────────────────────────────────────

  // I1: 同 session_id 同时刻 batch in critical ≤ 1
  function _i1() {
    var BM = window.RpaBatchManager
    if (!BM) return
    var critical = ['SENDING', 'CONFIRMING', 'SYNCING']
    var bySession = Object.create(null)
    var snap = BM.snapshot()
    for (var i = 0; i < snap.length; i++) {
      var b = snap[i]
      if (critical.indexOf(b.status) < 0) continue
      var sid = b.session_id
      if (bySession[sid]) {
        _record('I1', 'same session has multiple batches in critical state', {
          session_id:    sid,
          batch_a:       bySession[sid].batch_id,
          batch_a_state: bySession[sid].status,
          batch_b:       b.batch_id,
          batch_b_state: b.status,
        })
        return
      }
      bySession[sid] = b
    }
  }

  // I2: queue.processing 必须引用 in-flight batch
  function _i2() {
    var QM = window.RpaQueueManager
    var BM = window.RpaBatchManager
    var RM = window.RpaRuntimeManager
    if (!QM || !BM || !RM) return
    if (!RM.current()) return       // Runtime 未启动跳过
    var qSnap = QM.snapshot()
    var procId = qSnap.processing
    if (!procId) return
    var batch = BM.get(procId)
    if (!batch) {
      _record('I2', 'queue.processing references unknown batch', { processing: procId })
      return
    }
    var inFlight = ['COLLECTING', 'STABLE_WAIT', 'DECIDING', 'SENDING', 'CONFIRMING', 'SYNCING']
    if (inFlight.indexOf(batch.status) < 0) {
      _record('I2', 'queue.processing batch is not in-flight', {
        processing: procId,
        status:     batch.status,
      })
    }
  }

  // I3: Queue 中所有 batchId 都能在 BatchManager 中找到（无孤儿 queue item）
  function _i3() {
    var QM = window.RpaQueueManager
    var BM = window.RpaBatchManager
    if (!QM || !BM) return
    var snap = QM.snapshot()
    var orphans = []
    for (var i = 0; i < snap.queue.length; i++) {
      var item = snap.queue[i]
      if (!BM.get(item.batchId)) {
        orphans.push({ batchId: item.batchId, status: item.status })
      }
    }
    if (orphans.length > 0) {
      _record('I3', 'queue has orphan items (batch missing in BatchManager)', {
        orphan_count: orphans.length,
        sample:       orphans.slice(0, 5),
      })
    }
  }

  // I4: adapter 注册数量稳定
  function _i4() {
    var Reg = window.RpaAdapterRegistry
    if (!Reg) return
    var n = Reg.list().length
    if (_state.lastAdapterCount !== null && _state.lastAdapterCount !== n) {
      _record('I4', 'adapter count changed during runtime', {
        before: _state.lastAdapterCount,
        after:  n,
      })
    }
    _state.lastAdapterCount = n
  }

  // I5: send_runtime_v19=false 时不应有发送中 batch
  function _i5() {
    var F  = window.RpaFeatureFlags
    var BM = window.RpaBatchManager
    if (!F || !BM) return
    if (F.get('send_runtime_v19')) return  // Flag 开则不约束
    var critical = ['SENDING', 'CONFIRMING', 'SYNCING']
    var snap = BM.snapshot()
    for (var i = 0; i < snap.length; i++) {
      var b = snap[i]
      if (critical.indexOf(b.status) >= 0) {
        _record('I5', 'send_runtime_v19=false but batch is in sending pipeline', {
          batch_id: b.batch_id,
          status:   b.status,
        })
        return
      }
    }
  }

  // I6: 终态 batch 数量只升不降（无人复活终态）
  function _i6() {
    var BM = window.RpaBatchManager
    if (!BM) return
    var terminal = ['DONE', 'FAILED', 'ABORTED']
    var snap = BM.snapshot()
    var cur = 0
    for (var i = 0; i < snap.length; i++) {
      if (terminal.indexOf(snap[i].status) >= 0) cur++
    }
    if (cur < _state.lastTerminalCount) {
      _record('I6', 'terminal batch count decreased (resurrected?)', {
        before: _state.lastTerminalCount,
        after:  cur,
      })
    }
    _state.lastTerminalCount = cur
  }

  function check() {
    _state.checkCount++
    var beforeCount = _state.violations.length

    // 每个 invariant 单独 try-catch 防止内部异常打断后续检查。
    // _record 已经只是记录不抛，所以这里捕获的只是 invariant 逻辑本身的 throw（编程错误）。
    try { _i1() } catch (e) { Logger.warn('ChaosMonitor', 'I1 threw', e && e.message) }
    try { _i2() } catch (e) { Logger.warn('ChaosMonitor', 'I2 threw', e && e.message) }
    try { _i3() } catch (e) { Logger.warn('ChaosMonitor', 'I3 threw', e && e.message) }
    try { _i4() } catch (e) { Logger.warn('ChaosMonitor', 'I4 threw', e && e.message) }
    try { _i5() } catch (e) { Logger.warn('ChaosMonitor', 'I5 threw', e && e.message) }
    try { _i6() } catch (e) { Logger.warn('ChaosMonitor', 'I6 threw', e && e.message) }

    // strict 模式：本次 check 期间记录了新 violation → 抛异常让 chaos 测试明确失败
    if (_state.strictMode && _state.violations.length > beforeCount) {
      var newOnes = _state.violations.slice(beforeCount)
      var rules   = newOnes.map(function (v) { return v.rule_id }).join(',')
      throw new Error('[V19][ChaosMonitor] strict violations: ' + rules)
    }
  }

  function start(opts) {
    opts = opts || {}
    if (_state.timer) return false
    if (opts.intervalMs) _state.intervalMs = opts.intervalMs
    if (opts.strictMode !== undefined) _state.strictMode = !!opts.strictMode

    // 重置基线
    _state.violations = []
    _state.checkCount = 0
    _state.lastAdapterCount = null
    _state.lastTerminalCount = 0

    _state.timer = setInterval(check, _state.intervalMs)
    Logger.info('ChaosMonitor', 'started', {
      interval: _state.intervalMs, strict: _state.strictMode,
    })
    return true
  }

  function stop() {
    if (!_state.timer) return false
    clearInterval(_state.timer)
    _state.timer = null
    Logger.info('ChaosMonitor', 'stopped', {
      checks:     _state.checkCount,
      violations: _state.violations.length,
    })
    return true
  }

  function snapshot() {
    return {
      running:    !!_state.timer,
      strictMode: _state.strictMode,
      intervalMs: _state.intervalMs,
      checkCount: _state.checkCount,
      violations: _state.violations.slice(),
    }
  }

  function reset() {
    _state.violations = []
    _state.checkCount = 0
    _state.lastAdapterCount = null
    _state.lastTerminalCount = 0
  }

  window.RpaChaosMonitor = {
    start:    start,
    stop:     stop,
    check:    check,
    snapshot: snapshot,
    reset:    reset,
  }

})()

// ============================================================
// MODULE: runtime/bug-dump.js
// ============================================================

;(function () {
  'use strict'

  // V1.9-QA Bug Dump 工具
  //
  // qa 在 DevTools 一行命令：window.RpaV19DumpForBug() 即可：
  //   1. 收集 6 类全局状态快照
  //   2. 自动 copy 到剪贴板（JSON）
  //   3. 同步打印到 console（可视）
  //   4. 返回结构化对象（程序化使用）
  //
  // 用途：贴入 bug 报告模板，杜绝"reproduce_steps 漏字段"。

  var C       = window.RpaConstants
  var Tracer  = window.RpaLkTracer
  var Logger  = window.RpaLogger
  if (!C || !Tracer || !Logger) throw new Error('[V19] BugDump dependencies missing')

  function _safe(fn) {
    try { return fn() } catch (e) { return { _error: (e && e.message) || String(e) } }
  }

  // 收集所有快照
  function collect() {
    var snap = {
      meta: {
        ts:        new Date().toISOString(),
        url:       (typeof location !== 'undefined') ? location.href : null,
        userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : null,
        version:   'v1.9',
      },

      // ──── 1. Runtime ────
      runtime: _safe(function () {
        var RM = window.RpaRuntimeManager
        if (!RM) return { _missing: 'RpaRuntimeManager' }
        var current = RM.current && RM.current()
        if (!current) return { running: false }
        return {
          running:           true,
          runtimeId:         current.runtimeId,
          state:             current.state(),
          paused:            RM.isPaused && RM.isPaused(),
          startedAt:         current.startedAt,
          lastTickAt:        current.lastTickAt,
          adapter:           current.adapter && current.adapter.adapterKey || null,
          currentBatchId:    current.currentBatchId,
          currentSessionId:  current.currentSessionId,
          context:           current.context,
        }
      }),

      // ──── 2. Feature Flags ────
      flags: _safe(function () {
        var F = window.RpaFeatureFlags
        if (!F) return { _missing: 'RpaFeatureFlags' }
        return F.snapshot()
      }),

      // ──── 3. Batch Manager ────
      batches: _safe(function () {
        var BM = window.RpaBatchManager
        if (!BM) return { _missing: 'RpaBatchManager' }
        var all = BM.snapshot()
        // 太多 batch 只保留最近 30 个 + status 统计
        var byStatus = {}
        all.forEach(function (b) { byStatus[b.status] = (byStatus[b.status] || 0) + 1 })
        return {
          total:       all.length,
          by_status:   byStatus,
          recent_30:   all.slice(-30).map(function (b) {
            return {
              batch_id:    b.batch_id,
              session_id:  b.session_id,
              platform:    b.platform,
              pageKey:     b.pageKey,
              status:      b.status,
              inbound:     b.inbound_messages.length,
              outbound:    b.outbound_messages.length,
              decision:    b.decision_source,
              confirm:     b.send_confirm_status,
              updated_at:  b.updated_at,
            }
          }),
        }
      }),

      // ──── 4. Queue ────
      queue: _safe(function () {
        var QM = window.RpaQueueManager
        if (!QM) return { _missing: 'RpaQueueManager' }
        var snap = QM.snapshot()
        return {
          size:        snap.queue.length,
          processing:  snap.processing,
          paused:      snap.paused,
          updated_at:  snap.updated_at,
          items:       snap.queue.slice(0, 20),  // 前 20 个
        }
      }),

      // ──── 5. Adapter Registry ────
      adapters: _safe(function () {
        var R = window.RpaAdapterRegistry
        if (!R) return { _missing: 'RpaAdapterRegistry' }
        return R.list().map(function (a) {
          return {
            adapterKey: a.adapterKey,
            platform:   a.platform,
            pageKey:    a.pageKey,
            stub:       !!a.stub,
            hasSelectors: !!a.selectors,
          }
        })
      }),

      // ──── 6. LK Trace（最近 100 条）────
      lk_tracer: _safe(function () {
        var T = window.RpaLkTracer
        if (!T) return { _missing: 'RpaLkTracer' }
        return T.snapshot()
      }),

      // ──── 7. Chaos Monitor ────
      chaos: _safe(function () {
        var CM = window.RpaChaosMonitor
        if (!CM) return { _missing: 'RpaChaosMonitor' }
        return CM.snapshot()
      }),

      // ──── 8. chrome.storage.local（V1.9 key 子集）────
      storage: _safe(function () {
        return new Promise(function (resolve) {
          if (typeof chrome === 'undefined' || !chrome.storage) {
            return resolve({ _missing: 'chrome.storage' })
          }
          try {
            chrome.storage.local.get(['rpa_v19_queue', 'rpa_v19_batches'], function (data) {
              resolve({
                queue:   data.rpa_v19_queue   || null,
                batches: (data.rpa_v19_batches || []).slice(-30),
                batches_total: (data.rpa_v19_batches || []).length,
              })
            })
          } catch (err) {
            resolve({ _error: err && err.message })
          }
        })
      }),

      // ──── 9. Performance Memory（如果可读）────
      memory: _safe(function () {
        if (typeof performance === 'undefined' || !performance.memory) return null
        return {
          usedJSHeapSize:  performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        }
      }),
    }
    return snap
  }

  // ── 主入口 ────────────────────────────────────────────────────
  function dump(opts) {
    opts = opts || {}

    var snap = collect()

    // storage 是 Promise，需要等待
    var storagePromise = snap.storage && typeof snap.storage.then === 'function'
      ? snap.storage
      : Promise.resolve(snap.storage)

    return storagePromise.then(function (storageResolved) {
      snap.storage = storageResolved

      var asJson = JSON.stringify(snap, null, 2)

      // 1. console 打印（折叠 group，方便看）
      if (!opts.silent) {
        try {
          console.group('%c[V19 BugDump] ' + snap.meta.ts, 'color: #d97706; font-weight: bold')
          console.log('runtime:',  snap.runtime)
          console.log('flags:',    snap.flags)
          console.log('batches:',  snap.batches)
          console.log('queue:',    snap.queue)
          console.log('adapters:', snap.adapters)
          console.log('lk_tracer:', snap.lk_tracer)
          console.log('chaos:',    snap.chaos)
          console.log('storage:',  snap.storage)
          console.log('memory:',   snap.memory)
          console.groupEnd()
        } catch (_) {}
      }

      // 2. 自动复制到剪贴板
      if (!opts.skipClipboard) {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(asJson).then(function () {
              if (!opts.silent) console.log('%c[V19 BugDump] ✓ JSON 已复制到剪贴板，可粘贴到 bug 报告', 'color: #16a34a')
            }, function (err) {
              if (!opts.silent) console.warn('[V19 BugDump] 剪贴板复制失败', err && err.message)
            })
          }
        } catch (_) {}
      }

      return snap
    })
  }

  // 同步收集（不等 storage），用于程序化场景
  function dumpSync() {
    var snap = collect()
    // storage 替换为 placeholder
    if (snap.storage && typeof snap.storage.then === 'function') {
      snap.storage = { _async: '需要使用异步版本 RpaV19DumpForBug() 才能拿到 chrome.storage 数据' }
    }
    return snap
  }

  // 暴露 API
  window.RpaV19DumpForBug = dump
  window.RpaV19DumpForBug.sync = dumpSync
  window.RpaV19DumpForBug.collect = collect

})()

// ============================================================
// MODULE: runtime/rpc-bridge.js
// ============================================================

;(function () {
  'use strict'

  // V1.9-QA Item 7 RPC Bridge
  //
  // 问题：Chrome Extension content script 跑在 isolated world，
  //       DevTools 默认 console + Playwright page.evaluate 都跑在 main world，
  //       无法直接看到 window.RpaXxx 全局。
  //
  // 解：content script 监听 chrome.runtime.onMessage(action='V19_RPC')，
  //     Playwright 通过 service worker → chrome.tabs.sendMessage 调用。
  //     用户 DevTools 在"JavaScript context" 下拉切到 plugin frame 后可直接调。
  //
  // 安全：仅响应 'V19_RPC' action；method 名白名单；不允许任意 eval。
  //       不发送/接收文件路径、密钥、token。

  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
    return  // 非 extension 环境，跳过（如 Node verify 脚本）
  }

  // 白名单方法表：method → 函数
  // 在 content script 的 isolated world 可访问所有 RpaXxx 全局，所以这里直接调。
  var METHODS = {
    // 探针 / 状态
    'getGlobals': function () {
      return {
        keys: Object.keys(window).filter(function (k) { return k.indexOf('Rpa') === 0 }),
        hasRuntimeManager: !!window.RpaRuntimeManager,
        hasFeatureFlags:   !!window.RpaFeatureFlags,
        hasChaosMonitor:   !!window.RpaChaosMonitor,
        hasBugDump:        !!window.RpaV19DumpForBug,
        hasSelfCheck:      !!window.RpaV19SelfCheck,
        adapters_count:    window.RpaAdapterRegistry ? window.RpaAdapterRegistry.list().length : 0,
        location:          (typeof location !== 'undefined') ? location.href : null,
      }
    },

    // Feature Flag
    'flag.snapshot': function () { return window.RpaFeatureFlags && window.RpaFeatureFlags.snapshot() },
    'flag.unlock':   function (name) {
      if (!window.RpaFeatureFlags) return { error: 'no FeatureFlags' }
      return window.RpaFeatureFlags.unlockForTesting(name)
    },
    'flag.lock':     function (name) {
      if (!window.RpaFeatureFlags) return { error: 'no FeatureFlags' }
      return window.RpaFeatureFlags.lock(name)
    },

    // ChaosMonitor
    'chaos.start':    function (opts) { return window.RpaChaosMonitor && window.RpaChaosMonitor.start(opts) },
    'chaos.stop':     function () { return window.RpaChaosMonitor && window.RpaChaosMonitor.stop() },
    'chaos.check':    function () { return window.RpaChaosMonitor && window.RpaChaosMonitor.check() },
    'chaos.snapshot': function () { return window.RpaChaosMonitor && window.RpaChaosMonitor.snapshot() },
    'chaos.reset':    function () { return window.RpaChaosMonitor && window.RpaChaosMonitor.reset() },

    // RuntimeManager
    'rt.start': function (ctx) {
      var rt = window.RpaRuntimeManager && window.RpaRuntimeManager.start(ctx)
      return rt && { runtimeId: rt.runtimeId, state: rt.state() }
    },
    'rt.stop':    function (reason) { return window.RpaRuntimeManager && window.RpaRuntimeManager.stop(reason) },
    'rt.tick':    function () { return window.RpaRuntimeManager && window.RpaRuntimeManager.tick() },
    'rt.current': function () {
      var c = window.RpaRuntimeManager && window.RpaRuntimeManager.current()
      return c && { runtimeId: c.runtimeId, state: c.state(), startedAt: c.startedAt, lastTickAt: c.lastTickAt }
    },
    'rt.pause':   function (reason) { return window.RpaRuntimeManager && window.RpaRuntimeManager.pause(reason) },
    'rt.resume':  function (reason) { return window.RpaRuntimeManager && window.RpaRuntimeManager.resume(reason) },

    // SelfCheck
    'selfcheck.run': function () {
      if (!window.RpaV19SelfCheck) return { error: 'no SelfCheck' }
      return window.RpaV19SelfCheck.run({ silent: true })
    },

    // BugDump
    'dump': function () {
      if (!window.RpaV19DumpForBug) return { error: 'no BugDump' }
      return window.RpaV19DumpForBug({ silent: true, skipClipboard: true })
    },

    // Batch / Queue snapshots
    'batch.snapshot': function () { return window.RpaBatchManager && window.RpaBatchManager.snapshot() },
    'queue.snapshot': function () { return window.RpaQueueManager && window.RpaQueueManager.snapshot() },

    // LkTracer
    'lk.snapshot': function () { return window.RpaLkTracer && window.RpaLkTracer.snapshot() },
    'lk.flush':    function () { return window.RpaLkTracer && window.RpaLkTracer.flush() },
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.action !== 'V19_RPC') return
    var method = msg.method
    var fn = METHODS[method]
    if (!fn) {
      sendResponse({ ok: false, error: 'unknown-method: ' + method })
      return false
    }
    try {
      var result = fn(msg.args)
      // 处理 Promise（selfcheck.run / dump 等异步方法）
      if (result && typeof result.then === 'function') {
        result.then(function (r) {
          sendResponse({ ok: true, result: r })
        }, function (err) {
          sendResponse({ ok: false, error: (err && err.message) || String(err) })
        })
        return true  // 关键：异步响应必须返 true 才能让 sendResponse 生效
      }
      sendResponse({ ok: true, result: result })
      return false
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || String(err) })
      return false
    }
  })

  if (typeof console !== 'undefined') {
    console.log('[V19] RPC bridge ready (', Object.keys(METHODS).length, 'methods )')
  }

})()
