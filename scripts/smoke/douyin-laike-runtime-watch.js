#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const mysql = require('../../server/node_modules/mysql2/promise')

const ROOT = path.resolve(__dirname, '..', '..')

function parseArgs(argv) {
  const args = {
    duration: 90,
    sinceSeconds: 120,
    expect: 'auto',
    poll: 3000,
  }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--duration') args.duration = Number(argv[++i])
    else if (arg === '--since-seconds') args.sinceSeconds = Number(argv[++i])
    else if (arg === '--expect') args.expect = argv[++i]
    else if (arg === '--poll') args.poll = Number(argv[++i])
    else if (arg === '--help') usage(0)
    else usage(1, 'Unknown arg: ' + arg)
  }
  if (!['auto', 'empty', 'active'].includes(args.expect)) usage(1, 'Invalid --expect: ' + args.expect)
  return args
}

function usage(code, message) {
  if (message) console.error(message)
  console.log(`
Usage:
  node scripts/smoke/douyin-laike-runtime-watch.js [--duration 90] [--expect auto|empty|active]

Examples:
  node scripts/smoke/douyin-laike-runtime-watch.js --expect empty
  node scripts/smoke/douyin-laike-runtime-watch.js --expect active --duration 120

Checks runtime_logs for Douyin Laike LK-chain regressions:
  - LK chain must stop at the first failed node.
  - Empty-session pages must not continue into message/input/send checks.
  - "立即开启" must not be accepted as a send button.
  - AI/self-side phrases must not be treated as user-side LK-08 samples.
`)
  process.exit(code)
}

function loadEnv() {
  const file = path.join(ROOT, 'server', '.env')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

async function connect() {
  loadEnv()
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rpa_system',
    timezone: '+08:00',
  }
  try {
    return await mysql.createConnection(config)
  } catch (err) {
    if (config.host !== 'localhost') throw err
    try {
      return await mysql.createConnection({ ...config, host: '127.0.0.1' })
    } catch (fallbackErr) {
      fallbackErr.message = `MySQL connection failed for ${config.host} and 127.0.0.1: ${fallbackErr.message}`
      throw fallbackErr
    }
  }
}

async function fetchRows(conn, sinceSeconds) {
  const [rows] = await conn.query(
    `SELECT id, level, message, page_url, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS ts
     FROM runtime_logs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       AND platform = 'douyin'
       AND (message LIKE '%LK-%' OR message LIKE '%来客DOM探测%' OR message LIKE '%发送%' OR message LIKE '%会话%')
     ORDER BY id ASC`,
    [sinceSeconds]
  )
  return rows
}

function parseLk(message) {
  const match = String(message || '').match(/LK-(\d{2})\s+([✅❌])([^：:]*)(?:[：:](.*))?/)
  if (!match) return null
  return {
    no: Number(match[1]),
    ok: match[2] === '✅',
    label: (match[3] || '').trim(),
    detail: (match[4] || '').trim(),
    raw: message,
  }
}

function groupTraces(rows) {
  const traces = []
  let current = []
  for (const row of rows) {
    const lk = parseLk(row.message)
    if (!lk) continue
    if (lk.no === 0 && current.length) {
      traces.push(current)
      current = []
    }
    current.push({ row, lk })
  }
  if (current.length) traces.push(current)
  return traces
}

function firstFailure(trace) {
  return trace.find(item => !item.lk.ok) || null
}

function validateTrace(trace, issues) {
  const firstBad = firstFailure(trace)
  if (firstBad) {
    const later = trace.find(item => item.lk.no > firstBad.lk.no)
    if (later) {
      issues.push({
        severity: 'error',
        message: `LK chain continued after LK-${String(firstBad.lk.no).padStart(2, '0')} failed: later LK-${String(later.lk.no).padStart(2, '0')}`,
        row: later.row,
      })
    }
  }

  for (const item of trace) {
    const text = item.row.message || ''
    if (/LK-11.*✅.*立即开启/.test(text)) {
      issues.push({ severity: 'error', message: 'LK-11 misidentified "立即开启" as send button', row: item.row })
    }
    if (/LK-08.*✅.*(很高兴为您服务|收到您的消息|请问有什么可以帮您)/.test(text)) {
      issues.push({ severity: 'error', message: 'LK-08 appears to classify AI/self-side text as user-side message', row: item.row })
    }
    if (/LK-10.*❌/.test(text)) {
      const hasLk11 = trace.some(next => next.lk.no === 11)
      if (hasLk11) {
        issues.push({ severity: 'error', message: 'LK-11 ran after LK-10 failed', row: item.row })
      }
    }
  }
}

function validate(rows, expect) {
  const traces = groupTraces(rows)
  const issues = []
  traces.forEach(trace => validateTrace(trace, issues))

  const latestTrace = traces[traces.length - 1] || []
  const latest = latestTrace.map(item => item.lk)
  const hasContacts = latest.some(lk => lk.no === 3 && lk.ok)
  const hasMessages = latest.some(lk => lk.no === 9 && lk.ok)
  const stoppedAtEmpty = latest.some(lk => lk.no === 3 && !lk.ok) && !latest.some(lk => lk.no > 3)

  if (expect === 'empty' && !stoppedAtEmpty) {
    issues.push({ severity: 'error', message: 'Expected empty-session trace to stop at LK-03, but it did not' })
  }
  if (expect === 'active' && (!hasContacts || !hasMessages)) {
    issues.push({ severity: 'error', message: 'Expected active session to reach LK-09 with extracted messages' })
  }

  return { traces, issues }
}

function printSummary(rows, result) {
  const recent = rows.slice(-20)
  console.log('Recent Douyin runtime rows:', rows.length)
  for (const row of recent) {
    console.log(`${row.ts} #${row.id} ${row.level} ${row.message}`)
  }
  console.log('')
  console.log('LK traces:', result.traces.length)
  if (result.issues.length) {
    console.log('Issues:')
    result.issues.forEach(issue => {
      const suffix = issue.row ? ` (#${issue.row.id} ${issue.row.ts})` : ''
      console.log(`- [${issue.severity}] ${issue.message}${suffix}`)
    })
  } else {
    console.log('No LK-chain issues detected.')
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const conn = await connect()
  const end = Date.now() + args.duration * 1000
  let rows = []
  try {
    while (Date.now() < end) {
      rows = await fetchRows(conn, args.sinceSeconds)
      await new Promise(resolve => setTimeout(resolve, args.poll))
    }
    rows = await fetchRows(conn, args.sinceSeconds)
  } finally {
    await conn.end()
  }
  const result = validate(rows, args.expect)
  printSummary(rows, result)
  if (result.issues.some(issue => issue.severity === 'error')) process.exit(1)
}

main().catch(err => {
  console.error(err.stack || err.message)
  process.exit(1)
})
