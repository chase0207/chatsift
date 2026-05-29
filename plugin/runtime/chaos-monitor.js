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
