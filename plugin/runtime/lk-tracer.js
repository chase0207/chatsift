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
