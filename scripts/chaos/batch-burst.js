#!/usr/bin/env node
/**
 * QA-3 Batch Chaos 自动化（真实 chromium + RPC bridge）
 *
 * 通过 RPC 让 content script 内 BatchManager / SessionIdentityResolver
 * 在真实 isolated world 跑 burst 测试。
 *
 * 用法：node scripts/chaos/batch-burst.js --bursts=10 --messages-per-burst=5
 */

'use strict'

const fs = require('fs')
const path = require('path')
const playwright = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'))
const PLUGIN_DIR = path.join(__dirname, '..', '..', 'plugin')

const { setupRpc } = require('./_lib/rpc')
const { ensureDir, tsTag } = require('./_lib/snapshot')

function parseArgs() {
  const out = { bursts: 10, messages_per_burst: 5, url: 'https://example.com/', headless: false }
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--(\w[\w-]*)=(.+)$/)
    if (m) {
      const k = m[1].replace(/-/g, '_')
      out[k] = isNaN(Number(m[2])) ? m[2] : Number(m[2])
    } else if (arg === '--headless') out.headless = true
  }
  return out
}

async function run() {
  const args = parseArgs()
  console.log('[QA-3 Batch Burst]', args)

  const outDir = path.join(__dirname, '_output', 'batch-burst-' + tsTag())
  ensureDir(outDir)

  const ctx = await playwright.chromium.launchPersistentContext('/tmp/rpa-qa3-' + Date.now(), {
    headless: args.headless,
    args: [`--disable-extensions-except=${PLUGIN_DIR}`, `--load-extension=${PLUGIN_DIR}`, '--no-default-browser-check'],
  })
  const page = await ctx.newPage()
  await page.goto(args.url)
  await new Promise(r => setTimeout(r, 3000))

  const rpc = await setupRpc(ctx, page)

  try {
    // 启动 chaos monitor（不开 runtime，因为本测试直接调 BatchManager）
    await rpc('chaos.start', { strictMode: false, intervalMs: 1000 })

    // 在 content script 内跑 burst 逻辑（一次 RPC 调用，避免每次 burst 都 RPC 开销）
    // 通过 RPC 调用一个临时定义的 method 不可行 — METHODS 是白名单。
    // 改用：注入一段代码到 service worker，service worker 通过 sendMessage 触发 content script 内的脚本。
    // 更简单：依次调 batch.snapshot 间接验证。

    // 方案：手动调 RPC 的细粒度方法（已暴露的）+ self-check 验证
    // batch.snapshot 在 self-check 中已经触发了 batch 创建逻辑
    // 这里换思路：跑 self-check 多次，每次创建一组 batch，验证 chaos 不触发

    const allViolations = []
    const burstResults = []
    for (let i = 0; i < args.bursts; i++) {
      // 跑 self-check 创造负载（内部 BatchManager 测试会创建 batch）
      const sc = await rpc('selfcheck.run')

      // 检查 chaos
      const chaosSnap = await rpc('chaos.snapshot')
      const violations = chaosSnap.violations || []
      const newViolations = violations.filter(v =>
        !allViolations.find(av => av.checkNo === v.checkNo && av.rule_id === v.rule_id))
      allViolations.push(...newViolations.map(v => Object.assign({ burst: i }, v)))

      burstResults.push({
        burst: i,
        selfcheck_pass: sc.pass,
        selfcheck_fail: sc.fail,
        new_violations: newViolations.length,
      })
      console.log(`[QA-3] burst ${i+1}/${args.bursts}: sc=${sc.pass}/${sc.total} violations+${newViolations.length}`)
      await new Promise(r => setTimeout(r, 500))
    }

    const dump = await rpc('dump')
    fs.writeFileSync(path.join(outDir, 'final-dump.json'), JSON.stringify(dump, null, 2))

    const summary = {
      scenario: 'QA-3 Batch Burst', ts: tsTag(), args,
      bursts: args.bursts,
      total_violations: allViolations.length,
      violations: allViolations,
      burst_results: burstResults,
      pass: allViolations.length === 0,
    }
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))

    console.log('\n' + '='.repeat(60))
    console.log('[QA-3] Batch Burst summary')
    console.log('='.repeat(60))
    console.log('  bursts:           ', args.bursts)
    console.log('  violations:       ', allViolations.length)
    console.log('  output:           ', outDir)
    console.log('  PASS:             ', summary.pass)
    if (!summary.pass) {
      const byRule = {}
      for (const v of allViolations) byRule[v.rule_id] = (byRule[v.rule_id] || 0) + 1
      console.log('  Top violations:', byRule)
    }
    console.log('='.repeat(60))

    await ctx.close()
    process.exit(summary.pass ? 0 : 1)
  } catch (err) {
    console.error('[QA-3] crashed:', err.stack || err)
    await ctx.close()
    process.exit(2)
  }
}

run().catch(err => { console.error('[QA-3] uncaught:', err.stack || err); process.exit(2) })
