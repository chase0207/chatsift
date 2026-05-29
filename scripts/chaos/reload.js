#!/usr/bin/env node
/**
 * QA-1 Reload Chaos 自动化（通过 RPC bridge 调 V1.9 isolated world API）
 *
 * 验证：reload N 次后无 observer 残留 / 无 duplicate batch / 无 chaos violation
 *
 * 用法：
 *   node scripts/chaos/reload.js --rounds=10 --url=https://example.com/
 *
 * 退出码：
 *   0 = N 轮全部正常，violations 数 ≤ 期望
 *   1 = 出现 violation
 *   2 = 脚本崩溃
 */

'use strict'

const fs = require('fs')
const path = require('path')
const playwright = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'))
const PLUGIN_DIR = path.join(__dirname, '..', '..', 'plugin')

const { setupRpc } = require('./_lib/rpc')
const { ensureDir, tsTag } = require('./_lib/snapshot')

function parseArgs() {
  const out = { rounds: 10, url: 'https://example.com/', headless: false, expected_violations: 0 }
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
  console.log('[QA-1 Reload Chaos]', args)

  const outDir = path.join(__dirname, '_output', 'reload-' + tsTag())
  ensureDir(outDir)
  ensureDir(path.join(outDir, 'dumps'))

  const ctx = await playwright.chromium.launchPersistentContext('/tmp/rpa-qa1-' + Date.now(), {
    headless: args.headless,
    args: [
      `--disable-extensions-except=${PLUGIN_DIR}`,
      `--load-extension=${PLUGIN_DIR}`,
      '--no-default-browser-check', '--no-first-run',
    ],
  })

  const page = await ctx.newPage()
  await page.goto(args.url, { waitUntil: 'load', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  let rpc = await setupRpc(ctx, page)
  const allViolations = []
  const rounds = []

  try {
    // 启动
    await rpc('flag.unlock', 'runtime_v19')
    await rpc('flag.unlock', 'send_runtime_v19')
    await rpc('chaos.start', { strictMode: false, intervalMs: 2000 })
    const startResult = await rpc('rt.start', { platform: 'douyin', pageKey: 'douyin-laike-message' })
    console.log('[QA-1] initial rt.start:', startResult)

    // 等 recovery 完成
    await new Promise(r => setTimeout(r, 3000))

    // self-check 确认初始 ok
    const initSc = await rpc('selfcheck.run')
    if (!initSc.ok) {
      console.error('[QA-1] FATAL: initial self-check failed', initSc.fail, 'fails')
      const fails = initSc.results.filter(r => !r.ok)
      for (const f of fails) console.error('     ✗', f.label)
      await ctx.close()
      process.exit(2)
    }
    console.log('[QA-1] initial self-check ok:', initSc.pass + '/' + initSc.total)

    // chaos 循环
    for (let i = 1; i <= args.rounds; i++) {
      console.log(`\n[QA-1] round ${i}/${args.rounds} — reload`)

      // 短暂运行让 watchdog/autosave 写入
      await new Promise(r => setTimeout(r, 2500))

      // dump before
      const before = await rpc('dump')
      fs.writeFileSync(path.join(outDir, 'dumps', `before-${String(i).padStart(3,'0')}.json`),
        JSON.stringify(before, null, 2))

      // reload
      await page.reload({ waitUntil: 'load', timeout: 30000 })
      await new Promise(r => setTimeout(r, 3000))

      // tabId 可能变
      await rpc.refreshTabId()

      // 重新启动
      await rpc('flag.unlock', 'runtime_v19')
      await rpc('flag.unlock', 'send_runtime_v19')
      await rpc('chaos.start', { strictMode: false, intervalMs: 2000 })
      const reboot = await rpc('rt.start', { platform: 'douyin', pageKey: 'douyin-laike-message' })
      await new Promise(r => setTimeout(r, 2000))

      // dump after
      const after = await rpc('dump')
      fs.writeFileSync(path.join(outDir, 'dumps', `after-${String(i).padStart(3,'0')}.json`),
        JSON.stringify(after, null, 2))

      // 收集 violation
      const violations = (after.chaos && after.chaos.violations) || []
      for (const v of violations) {
        allViolations.push(Object.assign({ round: i }, v))
      }

      rounds.push({
        round: i,
        before_runtime: before.runtime && before.runtime.runtimeId,
        after_runtime:  reboot.runtimeId,
        runtime_id_changed: before.runtime && (before.runtime.runtimeId !== reboot.runtimeId),
        before_batches: before.batches && before.batches.total,
        after_batches:  after.batches && after.batches.total,
        before_queue:   before.queue && before.queue.size,
        after_queue:    after.queue && after.queue.size,
        violations_count: violations.length,
        violations_new:   violations.filter(v => !allViolations.find(av => av.round !== i && av.rule_id === v.rule_id && av.checkNo === v.checkNo)).length,
      })

      console.log(`[QA-1] round ${i} done. cumulative violations: ${allViolations.length}` +
        ` runtimeId ${rounds[rounds.length-1].before_runtime} → ${rounds[rounds.length-1].after_runtime}`)
    }
  } catch (err) {
    console.error('[QA-1] crashed:', err.stack || err)
    await ctx.close()
    process.exit(2)
  }

  await ctx.close()

  const summary = {
    scenario: 'QA-1 Reload Chaos',
    ts: tsTag(),
    args,
    total_rounds: args.rounds,
    total_violations: allViolations.length,
    expected_violations: args.expected_violations,
    pass: allViolations.length <= args.expected_violations,
    rounds,
    violations: allViolations,
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log('\n' + '='.repeat(60))
  console.log('[QA-1] Reload Chaos summary')
  console.log('='.repeat(60))
  console.log('  rounds:    ', args.rounds)
  console.log('  violations:', allViolations.length, '(expected ≤', args.expected_violations + ')')
  console.log('  output:    ', outDir)
  console.log('  PASS:      ', summary.pass)
  if (!summary.pass) {
    console.log('\n  Top violations:')
    const byRule = {}
    for (const v of allViolations) byRule[v.rule_id] = (byRule[v.rule_id] || 0) + 1
    for (const k of Object.keys(byRule)) console.log(`    ${k}: ${byRule[k]}`)
  }
  console.log('='.repeat(60))

  process.exit(summary.pass ? 0 : 1)
}

run().catch(err => { console.error('[QA-1] uncaught:', err.stack || err); process.exit(2) })
