/**
 * 在 page 中注入 V1.9 标准启动序列。
 * 等同于 docs/prd/2.0/V1.9-QA_执行手册.md § 二的 DevTools 命令。
 */

'use strict'

async function bootstrap(page, opts) {
  opts = opts || {}
  const platform = opts.platform || 'douyin'
  const pageKey  = opts.pageKey  || 'douyin-laike-message'
  const enableSend = opts.enableSend !== false

  // 等 V1.9 全局加载完（content_script 注入 + IIFE 跑完）
  await page.waitForFunction(() => !!window.RpaRuntimeManager && !!window.RpaFeatureFlags, { timeout: 10000 })

  return page.evaluate(({ platform, pageKey, enableSend }) => {
    window.RpaFeatureFlags.unlockForTesting('runtime_v19')
    if (enableSend) window.RpaFeatureFlags.unlockForTesting('send_runtime_v19')
    window.RpaChaosMonitor.start({ strictMode: false, intervalMs: 3000 })
    const rt = window.RpaRuntimeManager.start({ platform, pageKey })
    return {
      runtimeId: rt && rt.runtimeId,
      flags:     window.RpaFeatureFlags.snapshot(),
    }
  }, { platform, pageKey, enableSend })
}

async function teardown(page) {
  try {
    await page.evaluate(() => {
      if (window.RpaRuntimeManager) window.RpaRuntimeManager.stop('chaos-script-end')
      if (window.RpaChaosMonitor) window.RpaChaosMonitor.stop()
    })
  } catch (_) {}
}

async function selfCheck(page) {
  return page.evaluate(async () => {
    if (!window.RpaV19SelfCheck) return { ok: false, missing: 'RpaV19SelfCheck' }
    const r = await window.RpaV19SelfCheck.run({ silent: true })
    return { ok: r.ok, pass: r.pass, fail: r.fail, total: r.total }
  })
}

async function dump(page) {
  return page.evaluate(async () => {
    if (!window.RpaV19DumpForBug) return { _missing: 'RpaV19DumpForBug' }
    return await window.RpaV19DumpForBug({ silent: true, skipClipboard: true })
  })
}

module.exports = { bootstrap, teardown, selfCheck, dump }
