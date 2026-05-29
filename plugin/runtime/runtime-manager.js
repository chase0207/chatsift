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
  var PreCheck = window.RpaPreCheck
  var Confirm  = window.RpaSendConfirm
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

  // ── M4: 高阶发送链路（供 legacy bootstrap / 控制台调用） ───────────
  // sendInBatch({ batch, identity, adapter, replyText, decisionSource? })
  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
  //         → state.CONFIRMING → SendConfirm.confirm() → state.SYNCING → batch.finalizeRemote
  //
  // 若当前 runtime_state 不在 DECIDING / batch 不在 DECIDING，会"快走"前置状态。
  // 这是高阶 entry 的便利性桥接，M5+ 真实主循环应按场景驱动每一步迁移。
  function _walkToDeciding() {
    if (!_instance) return false
    var path = [S.SCANNING, S.SESSION_SWITCHING, S.READING_MESSAGES,
                S.WAITING_STABLE, S.BUILDING_BATCH, S.DECIDING]
    var cur = _instance.sm.current()
    var startIdx = path.indexOf(cur)
    var i = startIdx >= 0 ? (startIdx + 1) : 0
    for (; i < path.length; i++) {
      var ev = _instance.sm.transition(path[i], { reason: 'walk-to-deciding' })
      if (!ev.ok) return false
    }
    return true
  }

  // batch 状态机也要走到 DECIDING；否则后续 Batch.transition(SENDING) 会被状态机拒绝
  function _walkBatchToDeciding(batch_id) {
    var BS = Batch.BatchStatus
    var b = Batch.get(batch_id)
    if (!b) return false
    if (b.status === BS.DECIDING) return true
    var path = [BS.COLLECTING, BS.STABLE_WAIT, BS.DECIDING]
    var startIdx = path.indexOf(b.status)
    var i = startIdx >= 0 ? (startIdx + 1) : 0
    for (; i < path.length; i++) {
      var ev = Batch.transition(batch_id, path[i], { reason: 'walk-batch-to-deciding' })
      if (!ev.ok) return false
    }
    return true
  }

  function sendInBatch(args) {
    args = args || {}
    if (!_instance) return Promise.resolve({ ok: false, reason: 'runtime-not-started' })
    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })

    var batch    = args.batch
    var identity = args.identity
    var adapter  = args.adapter
    var replyText = args.replyText
    var decisionSource = args.decisionSource || 'unknown'

    // ── V1.9-M4 二级 Flag 门禁（adapter-registry 层之外的第二道防线） ──
    var Flags = window.RpaFeatureFlags
    if (!Flags || !Flags.get('send_runtime_v19')) {
      Tracer.log({
        lk_code:    LK.SEND_PRECHECK,
        stage:      Stage.SEND,
        status:     Status.SKIPPED,
        batchId:    batch && batch.batch_id,
        session_id: identity && identity.session_id,
        message:    'sendInBatch blocked: send_runtime_v19=false',
      })
      return Promise.resolve({
        ok:     false,
        reason: 'send-runtime-v19-locked',
        hint:   'V1.9-M4 send link is locked by default. ' +
                'Unlock via RpaFeatureFlags.unlockForTesting("send_runtime_v19") in DevTools, ' +
                'or set server runtime-config.experimental.send_runtime_v19=true for grey-channel test account.',
      })
    }

    var pre = PreCheck.check({ batch: batch, identity: identity, adapter: adapter, replyText: replyText })
    if (!pre.ok) return Promise.resolve({ ok: false, reason: pre.reason, lk_code: pre.lk_code, detail: pre.detail })

    // 自动走 runtime 状态机到 DECIDING
    if (_instance.sm.current() !== S.DECIDING) {
      if (!_walkToDeciding()) {
        return Promise.resolve({ ok: false, reason: 'cannot-walk-runtime-to-deciding', state: _instance.sm.current() })
      }
    }

    // 自动走 batch 状态机到 DECIDING（与 runtime 状态机独立）
    if (batch && batch.status !== Batch.BatchStatus.DECIDING) {
      if (!_walkBatchToDeciding(batch.batch_id)) {
        return Promise.resolve({ ok: false, reason: 'cannot-walk-batch-to-deciding', batchStatus: batch.status })
      }
    }

    var lkContext = {
      batchId:    batch && batch.batch_id,
      session_id: identity && identity.session_id,
      platform:   adapter.platform,
      pageKey:    adapter.pageKey,
    }

    return Promise.resolve()
      .then(function () {
        return typeof adapter.prepareReply === 'function' ? adapter.prepareReply(replyText, lkContext) : null
      })
      .then(function () {
        Batch.transition(batch.batch_id, Batch.BatchStatus.SENDING, { decision_source: decisionSource })
        _instance.sm.transition(S.SENDING)
        return adapter.sendReply(replyText, lkContext)
      })
      .then(function (sendResult) {
        if (!sendResult || !sendResult.ok) {
          Batch.transition(batch.batch_id, Batch.BatchStatus.FAILED, { send_confirm_status: 'failed' })
          _instance.sm.transition(S.ERROR)
          return { ok: false, reason: (sendResult && sendResult.reason) || 'send-failed' }
        }
        Batch.transition(batch.batch_id, Batch.BatchStatus.CONFIRMING)
        _instance.sm.transition(S.CONFIRMING)
        // 构造 confirm detectors：优先从 adapter.selectors.selfBubble 读取，
        // 若 adapter 没暴露 selectors，detectors 返回空数组，再 fallback 到 adapter.confirmReply
        return Confirm.confirm(replyText, {
          selfBubbleTexts: function () {
            var Dom = window.RpaDomUtils
            if (!Dom || !adapter.selectors || !adapter.selectors.selfBubble) return []
            var els = Dom.queryAll(adapter.selectors.selfBubble)
            return els.map(function (el) { return Dom.getText(el) })
          },
        }, {
          lkContext:   lkContext,
          timeoutMs:   args.confirmTimeoutMs || 6000,
        }).then(function (confirmResult) {
          // 如果 SendConfirm 通过 detectors 失败（M4 通用接口），fallback 用 adapter.confirmReply
          if (!confirmResult.confirmed && typeof adapter.confirmReply === 'function') {
            return adapter.confirmReply(replyText, lkContext).then(function (adapterConfirm) {
              return {
                confirmed:    adapterConfirm && adapterConfirm.confirmed,
                confirm_type: (adapterConfirm && adapterConfirm.confirm_type) || 'unknown',
                timeout:      adapterConfirm && adapterConfirm.timeout,
                evidence:     adapterConfirm && adapterConfirm.evidence || {},
              }
            })
          }
          return confirmResult
        }).then(function (finalConfirm) {
          Batch.recordOutbound(batch.batch_id, { content: replyText, ts: Date.now() })
          Batch.setConfirm(batch.batch_id, finalConfirm.confirmed ? 'confirmed' : (finalConfirm.timeout ? 'timeout' : 'unknown'))

          if (finalConfirm.confirmed) {
            Batch.transition(batch.batch_id, Batch.BatchStatus.SYNCING)
            _instance.sm.transition(S.SYNCING)
          } else {
            Batch.transition(batch.batch_id, Batch.BatchStatus.FAILED)
            _instance.sm.transition(S.ERROR)
          }
          return Batch.finalizeRemote(batch.batch_id).then(function () {
            if (finalConfirm.confirmed) {
              Batch.transition(batch.batch_id, Batch.BatchStatus.DONE)
              _instance.sm.transition(S.IDLE)
            }
            return { ok: !!finalConfirm.confirmed, confirm: finalConfirm }
          })
        })
      })
      .catch(function (err) {
        Tracer.log({
          lk_code: LK.ERR_SEND_FAILED, stage: Stage.SEND, status: Status.FAILED,
          batchId: batch && batch.batch_id, session_id: identity && identity.session_id,
          message: 'sendInBatch threw', detail: { error: (err && err.message) || String(err) },
        })
        Batch.transition(batch.batch_id, Batch.BatchStatus.FAILED)
        try { _instance.sm.transition(S.ERROR) } catch (_) {}
        return { ok: false, reason: 'exception', error: (err && err.message) || String(err) }
      })
  }

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
    sendInBatch:       sendInBatch,
  }

})()
