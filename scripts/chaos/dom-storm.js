#!/usr/bin/env node
/**
 * QA-7 DOM Chaos 自动化（真实 chromium + RPC bridge）
 *
 * 大量 DOM mutation 验证 Runtime/observer 是否稳定。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const playwright = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'))
const PLUGIN_DIR = path.join(__dirname, '..', '..', 'plugin')

const { setupRpc } = require('./_lib/rpc')
const { ensureDir, tsTag } = require('./_lib/snapshot')

function parseArgs() {
  const out = { rounds: 5, mutations_per_round: 2000, url: 'https://example.com/', headless: false }
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
  console.log('[QA-7 DOM Storm]', args)

  const outDir = path.join(__dirname, '_output', 'dom-storm-' + tsTag())
  ensureDir(outDir)

  const ctx = await playwright.chromium.launchPersistentContext('/tmp/rpa-qa7-' + Date.now(), {
    headless: args.headless,
    args: [`--disable-extensions-except=${PLUGIN_DIR}`, `--load-extension=${PLUGIN_DIR}`, '--no-default-browser-check'],
  })
  const page = await ctx.newPage()
  await page.goto(args.url)
  await new Promise(r => setTimeout(r, 3000))

  const rpc = await setupRpc(ctx, page)

  try {
    await rpc('flag.unlock', 'runtime_v19')
    await rpc('chaos.start', { strictMode: false, intervalMs: 2000 })
    await rpc('rt.start', { platform: 'douyin', pageKey: 'douyin-laike-message' })
    await new Promise(r => setTimeout(r, 2000))

    const initSc = await rpc('selfcheck.run')
    console.log(`[QA-7] init self-check: ${initSc.pass}/${initSc.total}`)
    if (!initSc.ok) {
      const fails = initSc.results.filter(r => !r.ok)
      console.log('   ⚠ initial fails:', fails.map(f => f.label).join(', '))
    }

    const allViolations = []
    const rounds = []
    for (let i = 1; i <= args.rounds; i++) {
      // 在 main world 跑 DOM mutation —— 不需要 RPC（DOM 是共享的）
      await page.evaluate((count) => {
        const root = document.body
        for (let k = 0; k < count; k++) {
          const el = document.createElement('div')
          el.textContent = 'chaos-' + k
          root.appendChild(el)
        }
        for (let k = 0; k < count; k++) {
          if (root.lastChild) root.removeChild(root.lastChild)
        }
      }, args.mutations_per_round)
      await new Promise(r => setTimeout(r, 1500))

      const chaosSnap = await rpc('chaos.snapshot')
      const newViolations = (chaosSnap.violations || []).filter(v =>
        !allViolations.find(av => av.checkNo === v.checkNo && av.rule_id === v.rule_id))
      allViolations.push(...newViolations.map(v => Object.assign({ round: i }, v)))

      const rt = await rpc('rt.current')
      const sc = await rpc('selfcheck.run')
      rounds.push({
        round: i,
        runtime_alive: !!rt && rt.runtimeId,
        selfcheck: { pass: sc.pass, fail: sc.fail },
        new_violations: newViolations.length,
      })

      console.log(`[QA-7] round ${i}/${args.rounds}: runtime=${rt && rt.state} sc=${sc.pass}/${sc.total} violations+${newViolations.length}`)
    }

    await rpc('rt.stop', 'qa-7-end')
    await rpc('chaos.stop')

    const summary = {
      scenario: 'QA-7 DOM Storm', ts: tsTag(), args,
      total_mutations: args.rounds * args.mutations_per_round,
      total_violations: allViolations.length,
      violations: allViolations,
      rounds,
      pass: allViolations.length === 0 && rounds.every(r => r.runtime_alive),
    }
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))

    console.log('\n' + '='.repeat(60))
    console.log('[QA-7] DOM Storm summary')
    console.log('='.repeat(60))
    console.log('  mutations:        ', summary.total_mutations)
    console.log('  violations:       ', allViolations.length)
    console.log('  output:           ', outDir)
    console.log('  PASS:             ', summary.pass)
    console.log('='.repeat(60))

    await ctx.close()
    process.exit(summary.pass ? 0 : 1)
  } catch (err) {
    console.error('[QA-7] crashed:', err.stack || err)
    await ctx.close()
    process.exit(2)
  }
}

run().catch(err => { console.error('[QA-7] uncaught:', err.stack || err); process.exit(2) })
