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
