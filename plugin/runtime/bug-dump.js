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
