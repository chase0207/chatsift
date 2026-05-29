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
