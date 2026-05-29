/**
 * 周期性收集 dump 快照到磁盘，便于事后比对。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { dump } = require('./runtime-bootstrap')

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function tsTag() {
  const d = new Date()
  return d.toISOString().replace(/[:.]/g, '-')
}

async function periodicCapture(page, opts) {
  opts = opts || {}
  const scenario  = opts.scenario || 'chaos'
  const intervalMs = opts.intervalMs || 30000
  const maxRounds  = opts.maxRounds || Infinity

  const outDir = path.join(__dirname, '..', '_output', scenario + '-' + tsTag())
  ensureDir(outDir)
  ensureDir(path.join(outDir, 'dumps'))

  let round = 0
  const violations = []
  const memoryTimeline = []

  async function tick() {
    round++
    const snap = await dump(page)
    const file = path.join(outDir, 'dumps', `dump-${String(round).padStart(4, '0')}.json`)
    fs.writeFileSync(file, JSON.stringify(snap, null, 2))

    if (snap.memory) {
      memoryTimeline.push({
        round, ts: snap.meta.ts,
        used_mb: Math.round(snap.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
      })
    }

    if (snap.chaos && Array.isArray(snap.chaos.violations)) {
      for (const v of snap.chaos.violations) {
        if (!violations.find(x => x.checkNo === v.checkNo && x.rule_id === v.rule_id)) {
          violations.push(Object.assign({ round }, v))
        }
      }
    }

    console.log(`[chaos][${scenario}] round=${round}` +
      ` queue=${(snap.queue && snap.queue.size) || 0}` +
      ` batches=${(snap.batches && snap.batches.total) || 0}` +
      ` violations=${violations.length}` +
      ` mem=${memoryTimeline.length ? memoryTimeline[memoryTimeline.length-1].used_mb + 'MB' : 'n/a'}`)
  }

  while (round < maxRounds) {
    await tick()
    await new Promise(r => setTimeout(r, intervalMs))
  }

  const summary = {
    scenario, ts: tsTag(),
    rounds: round, violations, memory_timeline: memoryTimeline,
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
  return { outDir, summary }
}

module.exports = { periodicCapture, ensureDir, tsTag }
