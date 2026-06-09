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

  // ── 常量 ────────────────────────────────────────────────
  var TICK_MS = 5000
  var HUMAN_IDLE_MS = 15 * 60 * 1000   // 默认 15min 无人工操作才扫描
  var MAX_CANDIDATES = 5
  var SWITCH_GAP_MS = 12000            // 两次切换最小间隔
  var SWITCH_JITTER_MS = 4000          // 叠加随机抖动
  var COOLDOWN_MS = 3 * 60 * 1000      // 单轮后冷却
  var RATE_PER_MIN = 6                 // 单账号每分钟最多切换次数
  var CONFIRM_WAIT_MS = 1500           // 切换确认后等 DOM 稳定
  var SUPPRESS_MS = 3500               // 切换前后抑制"弱人工事件"窗口(吸收切换/重排引发的 mousemove/focus)
  var TARGET_ADAPTER = 'douyin/private-message'
  var DEFAULT_SERVER_URL = 'https://admin.kongyuekeji.com'

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
          await _sleepInterruptible(SWITCH_GAP_MS + Math.floor(Math.random() * SWITCH_JITTER_MS))
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
  setTimeout(_syncEnabled, 1500) // 等 feature-flags 从 storage 载入持久开关后再判

  window.RpaAssistedCollector = {
    getState: function () { return _state },
    _syncEnabled: _syncEnabled,
    // DevTools 调试用,真机验收可临时调小;不改默认值
    _debugSetHumanIdleMs: function (ms) { HUMAN_IDLE_MS = ms | 0 },
    _debugSetSwitchGapMs: function (ms) { SWITCH_GAP_MS = ms | 0 },
    _debugSetCooldownMs: function (ms) { COOLDOWN_MS = ms | 0 },
  }
})()
