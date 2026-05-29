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
