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
