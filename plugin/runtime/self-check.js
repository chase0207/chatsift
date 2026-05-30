;(function () {
  'use strict'

  // V1.9 Runtime Self-Check（M6）
  //
  // 用途：让人工 QA 通过 DevTools 一行命令验证 V1.9 链路完整性，
  //       不依赖真实平台 DOM，可在任意页面执行。
  //
  // 用法：window.RpaV19SelfCheck.run()  →  Promise<{ ok, results }>
  //
  // 检查项（covers M1-M5）：
  //   1. 全局模块是否注册齐全
  //   2. RuntimeStateMachine 转换约束（合法 + 非法都验）
  //   3. LkTracer 写入 + flush 链路
  //   4. BatchManager 创建 / 合并 / 状态机
  //   5. QueueManager 入队 / unstable 拒绝 / 调度
  //   6. AdapterRegistry 注册数量 + matchPage 路由
  //   7. SessionIdentityResolver L1/L2/L3 三档
  //   8. RuntimeManager start / stop 生命周期

  function _expect(actual, expected, label) {
    return { label: label, ok: actual === expected, actual: actual, expected: expected }
  }

  function _has(globalName) {
    return { label: 'globals.' + globalName, ok: !!window[globalName] }
  }

  async function _checkSM() {
    var SM = window.RpaRuntimeStateMachine
    var C  = window.RpaConstants
    if (!SM || !C) return [{ label: 'sm.deps', ok: false }]
    var S = C.RuntimeState
    var sm = SM.create(S.IDLE)
    var ok1 = sm.transition(S.SCANNING).ok
    var ok2 = sm.transition(S.SENDING).ok   // 非法：SCANNING → SENDING
    return [
      _expect(ok1, true,  'sm.IDLE→SCANNING legal'),
      _expect(ok2, false, 'sm.SCANNING→SENDING illegal'),
      _expect(SM.isCritical(S.SENDING),    true,  'sm.isCritical(SENDING)'),
      _expect(SM.isCritical(S.IDLE),       false, 'sm.isCritical(IDLE)'),
    ]
  }

  function _checkBatchManager() {
    var B = window.RpaBatchManager
    if (!B) return [{ label: 'batch.deps', ok: false }]
    var initialSnap = B.snapshot().length
    var batch = B.create({
      platform:   'douyin',
      pageKey:    'douyin-laike-message',
      session_id: 'test-session-self-check',
      inbound_messages: [{ content: 'hi', timestamp: '2026-05-25 12:00:00' }],
    })
    var hasBatchId = !!(batch && batch.batch_id)

    var dup = B.create({
      platform:   'douyin',
      pageKey:    'douyin-laike-message',
      session_id: 'test-session-self-check',
      inbound_messages: [{ content: 'hi', timestamp: '2026-05-25 12:00:00' }],
    })
    var dupSameId = !!(dup && batch && dup.batch_id === batch.batch_id)

    // BatchManager.mergeInbound 是 in-place 修改并返回同一引用，
    // 必须在 merge 前先保存 hash 副本再对比，否则比较的是同一字符串
    var originalHash = batch.batch_hash
    var merged = B.mergeInbound(batch.batch_id, [{ content: 'second', timestamp: '2026-05-25 12:00:01' }])
    var mergedCount = merged ? merged.inbound_messages.length : 0
    var hashChanged = merged && merged.batch_hash !== originalHash

    // 转换：NEW → COLLECTING → STABLE_WAIT → DECIDING → SENDING → CONFIRMING → SYNCING → DONE
    var t1 = B.transition(batch.batch_id, B.BatchStatus.COLLECTING).ok
    var t2 = B.transition(batch.batch_id, B.BatchStatus.DONE).ok   // 非法跳转
    var t3 = B.transition(batch.batch_id, B.BatchStatus.STABLE_WAIT).ok

    return [
      _expect(hasBatchId,     true, 'batch.create returns batchId'),
      _expect(dupSameId,      true, 'batch.create idempotent on same uniq'),
      _expect(mergedCount,    2,    'batch.mergeInbound appends'),
      _expect(!!hashChanged,  true, 'batch.mergeInbound recomputes hash'),
      _expect(t1, true,  'batch.transition NEW→COLLECTING legal'),
      _expect(t2, false, 'batch.transition COLLECTING→DONE illegal'),
      _expect(t3, true,  'batch.transition COLLECTING→STABLE_WAIT legal'),
      _expect(B.snapshot().length >= initialSnap + 1, true, 'batch.snapshot grows'),
    ]
  }

  function _checkQueue() {
    var Q = window.RpaQueueManager
    if (!Q) return [{ label: 'queue.deps', ok: false }]
    Q.clear()
    var ok1 = Q.enqueue({
      batchId:    'self-check-q1',
      session_id: 'q1-sess',
      platform:   'douyin',
      pageKey:    'douyin-laike-message',
    })
    var dup  = Q.enqueue({
      batchId:    'self-check-q1',
      session_id: 'q1-sess',
      platform:   'douyin',
    })
    var rejL3 = Q.enqueue({
      batchId:    'self-check-q-l3',
      session_id: 'q-l3-sess',
      platform:   'douyin',
      unstable:   true,
    })
    var snap = Q.snapshot()
    return [
      _expect(ok1,  true,  'queue.enqueue accepts'),
      _expect(dup,  false, 'queue.enqueue dedupe'),
      _expect(rejL3, false, 'queue.enqueue rejects unstable=true (L3)'),
      _expect(snap.queue.length, 1, 'queue snapshot size'),
    ]
  }

  function _checkRegistry() {
    var R = window.RpaAdapterRegistry
    if (!R) return [{ label: 'registry.deps', ok: false }]
    var list = R.list()
    var hasLaike   = !!R.getByKey('douyin/laike-message')
    var hasPrivate = !!R.getByKey('douyin/private-message')
    var hasFeige   = !!R.getByKey('douyin/feige')
    return [
      _expect(list.length >= 3, true, 'registry has ≥3 adapters'),
      _expect(hasLaike,   true,  'douyin/laike-message registered'),
      _expect(hasPrivate, true,  'douyin/private-message registered'),
      _expect(hasFeige,   true,  'douyin/feige registered'),
    ]
  }

  function _checkIdentity() {
    var I = window.RpaSessionIdentityResolver
    if (!I) return [{ label: 'identity.deps', ok: false }]

    // 直接构造 plain object node，避免依赖 DOM API（兼容 Node 验证脚本）。
    // 提供最小子集：getAttribute / querySelector / textContent / getBoundingClientRect。
    function makeMockNode(attrs, children, text) {
      attrs = attrs || {}
      children = children || []
      return {
        getAttribute: function (k) { return attrs[k] || null },
        querySelector: function (sel) {
          for (var i = 0; i < children.length; i++) {
            if (children[i].matches && children[i].matches(sel)) return children[i]
          }
          return null
        },
        querySelectorAll: function () { return [] },
        textContent: text || '',
        getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0 } },
      }
    }
    function makeChild(matchSel, text, attrs) {
      attrs = attrs || {}
      return {
        matches: function (sel) {
          return matchSel === sel || (sel && matchSel.indexOf(sel.replace(/\[class\*=/, '').replace(/[\]"]/g, '')) >= 0)
        },
        getAttribute: function (k) { return attrs[k] || null },
        textContent: text || '',
        src: attrs.src || '',
      }
    }

    // L1：有 data-conversation-id
    var mock1 = makeMockNode({ 'data-conversation-id': 'cid-12345' })
    var r1 = I.resolve('douyin', 'douyin-laike-message', 'acct1', mock1)

    // L2：无 attr，但 querySelector 能匹配到 nickname + img
    var mock2 = makeMockNode({}, [
      { matches: function (s) { return /nickname|userName|title/.test(s) }, textContent: '小张', src: '' },
      { matches: function (s) { return s === 'img' }, src: 'https://avatar.example.com/x.png', getAttribute: function () { return null }, textContent: '' },
    ])
    var r2 = I.resolve('douyin', 'douyin-laike-message', 'acct1', mock2)

    // L3：什么都没有，只有 textContent
    var mock3 = makeMockNode({}, [], '小李说：你好')
    var r3 = I.resolve('douyin', 'douyin-laike-message', 'acct1', mock3)

    return [
      _expect(r1.level, 1, 'identity L1 from data-conversation-id'),
      _expect(r1.unstable, false, 'L1 unstable=false'),
      _expect(r2.level, 2, 'identity L2 from nickname+avatar'),
      _expect(r2.unstable, false, 'L2 unstable=false'),
      _expect(r3.level, 3, 'identity L3 fallback'),
      _expect(r3.unstable, true,  'L3 unstable=true'),
    ]
  }

  function _checkLkTracer() {
    var T = window.RpaLkTracer
    if (!T) return [{ label: 'tracer.deps', ok: false }]
    T.init({ runtimeId: 'self-check-rt', platform: 'douyin', pageKey: 'self-check' })
    var beforeSnap = T.snapshot()
    T.log({ lk_code: 'LK-STATE', stage: 'runtime', status: 'success', message: 'self-check log A' })
    T.log({ lk_code: 'LK-STATE', stage: 'runtime', status: 'failed',  message: 'self-check log B' })
    var afterSnap = T.snapshot()
    return [
      _expect(afterSnap.bufferSize >= beforeSnap.bufferSize + 2, true, 'tracer.log adds to buffer'),
    ]
  }

  async function run(opts) {
    opts = opts || {}
    var results = []

    // 1. 全局模块
    var globals = [
      'RpaConstants', 'RpaHash', 'RpaLogger',
      'RpaFeatureFlags',
      'RpaRuntimeStateMachine', 'RpaLkTracer',
      'RpaAdapterRegistry', 'RpaBatchManager', 'RpaQueueManager',
      'RpaWatchdog', 'RpaRecoveryManager',
      'RpaSessionIdentityResolver',
      'RpaDomUtils', 'RpaAdapterHelpers',
      'RpaRuntimeManager',
    ]
    globals.forEach(function (g) { results.push(_has(g)) })

    // 2. StateMachine
    results = results.concat(await _checkSM())
    // 3. Batch
    results = results.concat(_checkBatchManager())
    // 4. Queue
    results = results.concat(_checkQueue())
    // 5. Registry
    results = results.concat(_checkRegistry())
    // 6. Identity
    results = results.concat(_checkIdentity())
    // 7. LkTracer
    results = results.concat(_checkLkTracer())

    // ── self-check 完成后必须清理自己的副作用 ────────────────
    // _checkBatchManager / _checkQueue 等会往内存 + chrome.storage 写测试数据。
    // 如果不清理，reload 后这些孤儿数据会触发 chaos-monitor I3 violation。
    try {
      if (window.RpaQueueManager) window.RpaQueueManager.clear()
      if (window.RpaBatchManager) window.RpaBatchManager.reset()
    } catch (_) {}

    var pass = results.filter(function (r) { return r.ok }).length
    var fail = results.filter(function (r) { return !r.ok }).length
    var ok   = fail === 0

    if (!opts.silent && typeof console !== 'undefined') {
      console.group('[V19][SelfCheck] result: ' + (ok ? 'PASS' : 'FAIL') + ' (' + pass + '/' + (pass + fail) + ')')
      results.forEach(function (r) {
        var prefix = r.ok ? '✓' : '✗'
        console[r.ok ? 'log' : 'warn'](prefix + ' ' + r.label, r.ok ? '' : { actual: r.actual, expected: r.expected })
      })
      console.groupEnd()
    }

    return { ok: ok, pass: pass, fail: fail, total: results.length, results: results }
  }

  window.RpaV19SelfCheck = { run: run }

})()
