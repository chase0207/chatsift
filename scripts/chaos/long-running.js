#!/usr/bin/env node
/**
 * QA-6 Long Running Chaos（真实 chromium + RPC bridge）
 *
 * 每 capture-interval-mins 一次 dump，跑 duration-mins。
 * 12h+ 时 qa 应外部用 nohup/tmux 保活。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const playwright = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'))
const PLUGIN_DIR = path.join(__dirname, '..', '..', 'plugin')

const { setupRpc } = require('./_lib/rpc')
const { ensureDir, tsTag } = require('./_lib/snapshot')

function parseArgs() {
  const out = { duration_mins: 720, capture_interval_mins: 30, url: 'https://example.com/', headless: false }
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
  console.log('[QA-6 Long Running]', args)

  const outDir = path.join(__dirname, '_output', 'long-running-' + tsTag())
  ensureDir(outDir)
  ensureDir(path.join(outDir, 'dumps'))

  const ctx = await playwright.chromium.launchPersistentContext('/tmp/rpa-qa6-' + Date.now(), {
    headless: args.headless,
    args: [`--disable-extensions-except=${PLUGIN_DIR}`, `--load-extension=${PLUGIN_DIR}`, '--no-default-browser-check'],
  })
  const page = await ctx.newPage()
  await page.goto(args.url)
  await new Promise(r => setTimeout(r, 3000))

  const rpc = await setupRpc(ctx, page)

  await rpc('flag.unlock', 'runtime_v19')
  await rpc('chaos.start', { strictMode: false, intervalMs: 5000 })
  await rpc('rt.start', { platform: 'douyin', pageKey: 'douyin-laike-message' })

  const startTs = Date.now()
  const endTs = startTs + args.duration_mins * 60 * 1000
  const intervalMs = args.capture_interval_mins * 60 * 1000
  const timeline = []

  let round = 0
  try {
    while (Date.now() < endTs) {
      round++
      const elapsedMins = Math.round((Date.now() - startTs) / 60000)
      const dump = await rpc('dump')
      fs.writeFileSync(path.join(outDir, 'dumps', `round-${String(round).padStart(4,'0')}.json`),
        JSON.stringify(dump, null, 2))

      timeline.push({
        round, elapsed_mins: elapsedMins,
        ts: dump.meta && dump.meta.ts,
        memory_mb: dump.memory && Math.round(dump.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
        runtime_running: dump.runtime && dump.runtime.running,
        runtime_state: dump.runtime && dump.runtime.state,
        queue_size: dump.queue && dump.queue.size,
        batches_total: dump.batches && dump.batches.total,
        violations: (dump.chaos && dump.chaos.violations.length) || 0,
      })

      console.log(`[QA-6] round=${round} elapsed=${elapsedMins}min` +
        ` mem=${timeline[timeline.length-1].memory_mb || 'n/a'}MB` +
        ` violations=${timeline[timeline.length-1].violations}`)

      // 写中间 summary
      fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({
        scenario: 'QA-6 Long Running', ts: tsTag(), args, in_progress: true, timeline,
      }, null, 2))

      await new Promise(r => setTimeout(r, intervalMs))
    }
  } catch (err) {
    console.error('[QA-6] crashed mid-run:', err.message)
  }

  await rpc('rt.stop', 'qa-6-end').catch(() => {})
  await rpc('chaos.stop').catch(() => {})

  const memStart = timeline[0] && timeline[0].memory_mb || 0
  const memEnd = timeline[timeline.length-1] && timeline[timeline.length-1].memory_mb || 0
  const memGrowthPerHour = (memEnd - memStart) / Math.max(args.duration_mins / 60, 1/60)

  const summary = {
    scenario: 'QA-6 Long Running', ts: tsTag(), args, in_progress: false, timeline,
    memory_start_mb: memStart, memory_end_mb: memEnd,
    memory_growth_per_hour_mb: Math.round(memGrowthPerHour * 100) / 100,
    memory_leak_suspected: memGrowthPerHour > 10,
    total_violations: Math.max(0, ...timeline.map(t => t.violations)),
  }
  summary.pass = !summary.memory_leak_suspected && summary.total_violations === 0
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log('\n' + '='.repeat(60))
  console.log('[QA-6] Long Running summary')
  console.log('='.repeat(60))
  console.log('  duration:                 ', args.duration_mins, 'min')
  console.log('  capture rounds:           ', timeline.length)
  console.log('  memory start → end:       ', memStart, '→', memEnd, 'MB')
  console.log('  growth/h:                 ', summary.memory_growth_per_hour_mb, 'MB')
  console.log('  leak suspected:           ', summary.memory_leak_suspected)
  console.log('  violations (max in round):', summary.total_violations)
  console.log('  output:                   ', outDir)
  console.log('  PASS:                     ', summary.pass)
  console.log('='.repeat(60))

  await ctx.close()
  process.exit(summary.pass ? 0 : 1)
}

run().catch(err => { console.error('[QA-6] uncaught:', err.stack || err); process.exit(2) })
