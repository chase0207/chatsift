#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const BACKGROUND_PATH = path.join(ROOT, 'plugin', 'background.js')
const CONTENT_PATH = path.join(ROOT, 'plugin', 'content.js')
const POPUP_PATH = path.join(ROOT, 'plugin', 'popup', 'popup.js')

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

function assertBackgroundLock(source) {
  assert(source.includes('activeRuntimeLock'), 'Background must persist the active runtime lock')
  assert(source.includes('buildRuntimeLockKey'), 'Background must build a platform/page/account runtime lock key')
  assert(source.includes('RUNTIME_LOCK_HEARTBEAT'), 'Background must accept runtime lock heartbeat')
  assert(source.includes('CHECK_RUNTIME_LOCK'), 'Background must let content verify the holder tab')
  assert(source.includes('chrome.tabs.onRemoved.addListener'), 'Background must release lock when the holder tab closes')
  assert(source.includes('async function stopDeviceSession'), 'Background must release server-side device session on stop')
  assert(source.includes("authFetch(serverUrl, '/api/plugin/stop', 'POST'"), 'Background must call plugin stop API')

  const listener = source.slice(source.indexOf("if (msg.action === 'START_PLATFORM')"), source.indexOf("if (msg.action === 'STOP_PLATFORM')"))
  assert(listener.includes('msg.tabId || (sender.tab && sender.tab.id)'), 'START_PLATFORM must bind lock to a tab id')
  assert(listener.includes('msg.reloadAfterStart'), 'START_PLATFORM must own popup reload orchestration')
  assert(listener.includes('chrome.tabs.reload(tabId).catch'), 'START_PLATFORM must reload holder tab without blocking sendResponse')
  assert(listener.includes("chrome.tabs.sendMessage(tabId, { action: 'startKefu'"), 'START_PLATFORM must only notify the holder tab')
  assert(!listener.includes("notifyAllTabs({ action: 'startKefu'"), 'START_PLATFORM must not broadcast startKefu to every tab')

  const reinject = extractFunction(source, 'reinjectIfNeeded')
  assert(reinject.includes('const lock = await getRuntimeLock()'), 'Watchdog reinject must read the active runtime lock')
  assert(reinject.includes('tab.id !== lock.tabId'), 'Watchdog reinject must only target the holder tab')

  const stopFn = extractFunction(source, 'stopPlatform')
  assert(stopFn.includes('await stopDeviceSession(state)'), 'STOP_PLATFORM must mark the device session offline')
  assert(stopFn.indexOf('await stopDeviceSession(state)') < stopFn.indexOf('await clearRuntimeLock()'), 'STOP_PLATFORM must release server session before clearing local lock')
  const logoutFn = extractFunction(source, 'logout')
  assert(logoutFn.includes('await stopDeviceSession(state)'), 'Logout must mark the device session offline')
  const onRemoved = source.slice(source.indexOf('chrome.tabs.onRemoved.addListener'), source.indexOf('async function uploadStats'))
  assert(onRemoved.includes('await stopDeviceSession()'), 'Closing the holder tab must mark the device session offline')
}

function assertContentLock(source) {
  assert(source.includes('runtimeLockHeartbeatTimer'), 'Content must keep a runtime lock heartbeat timer')
  assert(source.includes('startRuntimeLockHeartbeat()'), 'Content must heartbeat after runtime starts')
  assert(source.includes('stopRuntimeLockHeartbeat()'), 'Content must stop heartbeat when runtime stops')
  assert(source.includes('checkRuntimeLockForCurrentTab'), 'Content must verify runtime lock before auto-resume')
  assert(source.includes("msg.action === 'runtimeLockLost'"), 'Content must stop when another tab takes the lock')
  assert(source.includes('var runtimeRunId = 0'), 'Content must keep a run id to invalidate async work after stop')
  assert(source.includes('function isRuntimeActive'), 'Content must centralize runtime active checks')
  assert(source.includes('function sleepIfRuntimeActive'), 'Content must make delayed send waits cancellable')

  const bootstrap = source.slice(source.indexOf('function bootstrapFloatBar'), source.indexOf('// 兼容 SPA'))
  assert(bootstrap.includes('checkRuntimeLockForCurrentTab'), 'Bootstrap auto-resume must be gated by runtime lock')
  assert(!bootstrap.includes('setTimeout(window._aiReply_startKefu'),
    'Content must not auto-start from platformServiceStatus alone')
  assert((bootstrap.match(/checkRuntimeLockForCurrentTab/g) || []).length >= 3,
    'Every bootstrap auto-start path must check runtime lock first')

  const stopFn = source.slice(source.indexOf('window._aiReply_stop = function'), source.indexOf('// 每5分钟清理1小时前的 processedMap 记录'))
  assert(stopFn.includes('runtimeRunId++'), 'Runtime stop must invalidate in-flight async loops')
  assert(stopFn.includes('Object.keys(processingFlags).forEach'), 'Runtime stop must clear processing flags')
  const sendFn = extractFunction(source, 'sendReply')
  assert(sendFn.includes('isRuntimeActive(runId)'), 'Generic send must check runtime active state')
  assert(sendFn.includes('sleepIfRuntimeActive'), 'Generic send sleeps must be cancellable')
  const loopFn = extractFunction(source, 'kefuLoop')
  assert(loopFn.includes('while (isRuntimeActive(runId))'), 'Kefu loop must stop by run id, not only boolean state')
}

function assertPopupLock(source) {
  const fn = extractFunction(source, 'handleStart')
  assert(fn.includes('chrome.tabs.query({ active: true, currentWindow: true })'), 'Popup start must identify active tab')
  assert(fn.includes('tabId: activeTab && activeTab.id'), 'Popup start must pass active tab id')
  assert(fn.includes('pageUrl: activeTab && activeTab.url'), 'Popup start must pass active page URL')
  assert(fn.includes('reloadAfterStart: true'), 'Popup start must delegate reload to background START_PLATFORM')
  assert(!fn.includes('chrome.tabs.reload(activeTab.id)'), 'Popup start must not reload directly after START_PLATFORM')

  const loadFn = extractFunction(source, 'loadPlatformDefinitions')
  assert(loadFn.includes("runtimeSend({ action: 'LOAD_PLATFORM_DEFINITIONS' })"), 'Popup platform detection must use background platform definition loader')
  assert(!loadFn.includes("authFetch('/api/platforms?enabled=1'"), 'Popup platform detection must not duplicate platform API loading')
}

function main() {
  assertBackgroundLock(readText(BACKGROUND_PATH))
  assertContentLock(readText(CONTENT_PATH))
  assertPopupLock(readText(POPUP_PATH))
  console.log('runtime-lock regression: PASS')
}

try {
  main()
} catch (err) {
  console.error('runtime-lock regression: FAIL')
  console.error(err.message)
  process.exit(1)
}
