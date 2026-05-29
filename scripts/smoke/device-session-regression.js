#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const CONTROLLER_PATH = path.join(ROOT, 'server', 'src', 'controllers', 'deviceController.js')
const ROUTES_PATH = path.join(ROOT, 'server', 'src', 'routes', 'devices.js')
const BACKGROUND_PATH = path.join(ROOT, 'plugin', 'background.js')

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function extractFunction(source, name) {
  const marker = 'function ' + name + '('
  const start = source.indexOf(marker)
  if (start === -1) fail('Missing function: ' + name)
  let depth = 0
  let bodyStarted = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') {
      depth++
      bodyStarted = true
    } else if (ch === '}') {
      depth--
      if (bodyStarted && depth === 0) return source.slice(start, i + 1)
    }
  }
  fail('Unclosed function: ' + name)
}

function assertController(source) {
  assert(source.includes('async function normalizeDeviceSessionRows'), 'Device controller must dedupe sessions by plugin/device')
  assert(source.includes('ORDER BY id DESC'), 'Session dedupe must keep the newest row')
  assert(source.includes('status = 0'), 'Session dedupe/stop must mark stale sessions offline')

  const startFn = extractFunction(source, 'start')
  assert(startFn.includes('normalizeDeviceSessionRows(grant.id, device_id)'), 'Start must dedupe current device rows before online-limit check')
  assert(startFn.includes('getActiveSessionCount(grant.id)'), 'Start must still enforce max_online')

  const stopFn = extractFunction(source, 'stop')
  assert(stopFn.includes('resolveUserGrant(req.user.id, platform)'), 'Stop must resolve the current user platform grant')
  assert(stopFn.includes('UPDATE device_sessions SET status = 0'), 'Stop must mark matching device sessions offline')
  assert(stopFn.includes('plugin_id = ? AND device_id = ?'), 'Stop must only release the current plugin/device pair')

  const exportsBlock = source.slice(source.indexOf('module.exports ='))
  assert(exportsBlock.includes('stop,'), 'Device controller must export stop')
}

function assertRoutes(source) {
  assert(source.includes("router.post('/stop',          controller.stop)"), 'Devices routes must expose POST /stop')
}

function assertBackground(source) {
  assert(source.includes('async function stopDeviceSession'), 'Background must implement stopDeviceSession')
  assert(source.includes("authFetch(serverUrl, '/api/plugin/stop', 'POST'"), 'Background must call /api/plugin/stop')
  assert(extractFunction(source, 'stopPlatform').includes('await stopDeviceSession(state)'), 'Manual stop must release server-side session')
  assert(extractFunction(source, 'logout').includes('await stopDeviceSession(state)'), 'Logout must release server-side session')
  const onRemoved = source.slice(source.indexOf('chrome.tabs.onRemoved.addListener'), source.indexOf('async function uploadStats'))
  assert(onRemoved.includes('await stopDeviceSession()'), 'Closing the holder tab must release server-side session')
}

function main() {
  assertController(readText(CONTROLLER_PATH))
  assertRoutes(readText(ROUTES_PATH))
  assertBackground(readText(BACKGROUND_PATH))
  console.log('device-session regression: PASS')
}

try {
  main()
} catch (err) {
  console.error('device-session regression: FAIL')
  console.error(err.message)
  process.exit(1)
}
