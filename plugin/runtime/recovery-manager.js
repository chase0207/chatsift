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
