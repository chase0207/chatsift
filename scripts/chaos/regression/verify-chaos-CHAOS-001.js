#!/usr/bin/env node
/**
 * CHAOS-001 回归：self-check 副作用 → I3 queue 孤儿 item
 *
 * 真实环境（Playwright + chromium）reload chaos 暴露：
 *   self-check 的 _checkQueue 在 chrome.storage.local 写了 'self-check-q1'
 *   reload 后 RecoveryManager 加载到 queue，但 BatchManager 已 reset
 *   chaos-monitor I3 触发 (queue 孤儿)
 *
 * 修复：self-check.run() 末尾清理 Queue + Batch 状态。
 *
 * 本回归在 Node 模拟"持久化 chrome.storage" 验证：
 *   1. 跑 self-check
 *   2. 期望 chrome.storage 中 rpa_v19_queue.queue 为空（被清理）
 *   3. 期望内存 BatchManager.snapshot() 为空
 */

'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')

function makeBrowserContext() {
  const ctx = {
    console, Date, Math, JSON, Promise, URLSearchParams,
    Object, Array, String, Number, Boolean, Symbol,
    Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet,
    isNaN, isFinite, parseInt, parseFloat,
  }
  ctx.setInterval = (fn, ms) => setInterval(fn, ms)
  ctx.clearInterval = id => clearInterval(id)
  ctx.setTimeout = setTimeout
  ctx.clearTimeout = clearTimeout
  ctx.document = { createElement: () => ({ getAttribute: () => null }), querySelector: () => null, querySelectorAll: () => [] }
  ctx.window = ctx; ctx.self = ctx
  ctx.location = { href: 'https://example.com/' , search: ''}
  ctx.navigator = { userAgent: 't', clipboard: { writeText: () => Promise.resolve() } }
  ctx.HTMLTextAreaElement = function () {}; ctx.HTMLTextAreaElement.prototype = { value: '' }
  ctx.HTMLInputElement = function () {}; ctx.HTMLInputElement.prototype = { value: '' }
  ctx.MouseEvent = function () {}; ctx.KeyboardEvent = function () {}; ctx.Event = function () {}

  ctx._chromeStorage = {}  // 持久化（模拟 chrome.storage.local）
  ctx.chrome = {
    runtime: { sendMessage: (m, cb) => cb && cb({ ok: true }) },
    storage: {
      local: {
        get: (keys, cb) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          const out = {}
          for (const k of ks) if (ctx._chromeStorage[k] !== undefined) out[k] = ctx._chromeStorage[k]
          cb(out)
        },
        set: (d, cb) => { Object.assign(ctx._chromeStorage, d); if (cb) cb() },
        remove: (keys, cb) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          for (const k of ks) delete ctx._chromeStorage[k]
          if (cb) cb()
        },
      },
    },
  }
  return ctx
}

function loadV19Modules() {
  const full = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'plugin', 'content.js'), 'utf8')
  const idx = full.indexOf('// MODULE: content_legacy.js')
  return full.slice(0, idx)
}

const results = []
function check(label, cond, detail) {
  results.push({ label, ok: !!cond, detail: cond ? null : (detail !== undefined ? detail : 'failed') })
}

async function run() {
  const ctx = makeBrowserContext()
  vm.createContext(ctx)
  vm.runInContext(loadV19Modules(), ctx, { filename: 'content.js' })

  // 标准启动
  await ctx.RpaQueueManager.init()
  ctx.RpaLkTracer.init({ runtimeId: 'chaos-001', platform: 'douyin', pageKey: 'douyin-laike-message' })

  // 跑 self-check
  const sc = await ctx.RpaV19SelfCheck.run({ silent: true })
  check('CHAOS-001: self-check 通过', sc.ok, { pass: sc.pass, fail: sc.fail })

  // 关键断言：跑完后内存 + storage 都不应残留 self-check 测试数据
  const qSnap = ctx.RpaQueueManager.snapshot()
  check('CHAOS-001: 跑完 Queue.snapshot().queue 为空', qSnap.queue.length === 0,
    { queueSize: qSnap.queue.length, items: qSnap.queue.map(i => i.batchId) })

  const bmSnap = ctx.RpaBatchManager.snapshot()
  check('CHAOS-001: 跑完 BatchManager.snapshot() 为空', bmSnap.length === 0,
    { batchCount: bmSnap.length, ids: bmSnap.map(b => b.batch_id) })

  // 模拟 reload：chrome.storage 持久化，但 self-check cleanup 应该已 Q.clear() 清掉
  const storage = ctx._chromeStorage
  const queueStorage = storage['rpa_v19_queue']
  check('CHAOS-001: chrome.storage rpa_v19_queue.queue 为空',
    !queueStorage || queueStorage.queue.length === 0,
    { storage: queueStorage })

  // 输出
  const pass = results.filter(r => r.ok).length
  const fail = results.filter(r => !r.ok).length
  console.log('\n========== CHAOS-001 Regression ==========')
  for (const r of results) {
    console.log(` ${r.ok ? '✓' : '✗'} ${r.label}`)
    if (!r.ok && r.detail) console.log('     detail:', JSON.stringify(r.detail))
  }
  console.log(`PASS=${pass} FAIL=${fail} TOTAL=${results.length}`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(err => { console.error('crashed:', err.stack || err); process.exit(2) })
