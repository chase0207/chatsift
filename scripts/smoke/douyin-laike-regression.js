#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const CONTENT_PATH = path.join(ROOT, 'plugin', 'content.js')
const SNAPSHOT_PATH = path.join(ROOT, 'dom-collector', 'dom-snapshots', 'douyin-2.selectors.json')

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function readJson(file) {
  return JSON.parse(readText(file))
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

function assertSnapshotDirection(snapshot) {
  const messageClasses = snapshot.selectors.messageText.classes || []
  const selfClasses = snapshot.selectors.selfMessageText.classes || []
  assert(messageClasses.includes('chatd-bubble-main--other'), 'Snapshot messageText must mark user side as other')
  assert(selfClasses.includes('chatd-bubble-main--self'), 'Snapshot selfMessageText must mark AI side as self')
  assert(
    messageClasses.includes('chatd-bubble-main--left') && selfClasses.includes('chatd-bubble-main--left'),
    'Snapshot shows left is not a direction signal because both user and self include left'
  )
}

function assertSourceDirection(source) {
  const selectorBlockStart = source.indexOf('douyinLaike: {')
  assert(selectorBlockStart !== -1, 'Missing douyinLaike selector block')
  const selectorBlock = source.slice(selectorBlockStart, source.indexOf('douyinFeige:', selectorBlockStart))
  assert(selectorBlock.includes('chatd-bubble-main--other'), 'Laike incoming selector must include other')
  assert(!selectorBlock.includes('chatd-bubble--left'), 'Laike incoming selector must not treat left as user')
  assert(!selectorBlock.includes('chatd-bubble-main--left'), 'Laike bubbleText must not treat left as user')
  assert(source.includes('function isDouyinLaikeSelfMessageNode'), 'Missing Laike self classifier')
  assert(source.includes('function isDouyinLaikeUserMessageNode'), 'Missing Laike user classifier')
}

function assertChainGate(source) {
  const fn = extractFunction(source, 'logDouyinLaikeFullTrace')
  for (let i = 0; i <= 10; i++) {
    const id = String(i).padStart(2, '0')
    assert(fn.includes('var ok' + id), 'Missing LK-' + id + ' gate variable')
    assert(new RegExp('if \\(!ok' + id + '\\)[\\s\\S]{0,160}return').test(fn), 'Missing LK-' + id + ' short-circuit return')
  }
}

function assertNoEmptySessionFalsePositive(source) {
  assert(source.includes('暂无会话'), 'Empty-session text must be explicitly excluded')
  assert(source.includes('请从左侧列表选择'), 'Chat placeholder text must be explicitly excluded')
  assert(source.includes('function isLkRuntimeLog'), 'Floating log view must identify LK diagnostic logs')
  assert(source.includes('return getLkDebugVisible()'), 'LK diagnostic logs must be hidden unless developer mode is enabled')
  assert(source.includes('当前暂无会话，等待用户新消息'), 'Empty Laike contact state must show a user-facing final status')
  assert(source.includes('function getNodeListTailText'), 'LK-08 must be able to log latest user-side bubbles')
  assert(source.includes("'latest=' + getNodeListTailText(s.incomingBubbles, 3)"), 'LK-08 must log latest user-side bubbles, not the earliest samples')
  assert(source.includes("'stage=' + stage + ' count='"), 'LK-09 must include the diagnostic stage in its detail')
  assert(source.includes('消息已提取但近期已处理，跳过重复回复'), 'Dedup skip after successful extraction must be logged explicitly')
  assert(source.includes('function scheduleKefuRuntimeRetry'), 'Kefu runtime must retry when page DOM is not ready at startup')
  assert(source.includes('页面加载中，等待会话列表就绪'), 'DOM-not-ready startup must show a user-facing waiting status')
  assert(source.includes('页面DOM已就绪，恢复运行'), 'DOM retry must log when runtime resumes')
  assert(source.includes('rpa_processed_map_v1'), 'Processed message dedup must survive content.js reinjection')
  assert(source.includes('rememberRecentSelfReply'), 'Laike send path must remember recent self replies')
  assert(source.includes("isRecentSelfReplyPreview('douyin-laike', itemText)"), 'Laike trigger scan must skip recent AI/self reply previews')
  assert(source.includes('function getDouyinLaikeNickname'), 'Laike nickname must be extracted by a dedicated helper')
  const laikeNicknameFn = extractFunction(source, 'getDouyinLaikeNickname')
  assert(!laikeNicknameFn.includes('chatd-message-userName'), 'Laike nickname must not use message sender nodes because they can be self/shop names')
  assert(!source.includes('getCurrentCfg()'), 'content.js must not call undefined getCurrentCfg')
  const snapshotFn = extractFunction(source, 'getDouyinLaikeDomSnapshot')
  const contactsFn = extractFunction(source, 'getDouyinLaikeContactItems')
  assert(contactsFn.includes('list.querySelectorAll'), 'LK-03 must search contact items recursively inside #list-container')
  assert(snapshotFn.includes('var contacts = getDouyinLaikeContactItems()'), 'LK-03 must use filtered real contacts')
  assert(snapshotFn.includes('var allBubbles = getDouyinLaikeBubbleCandidates()'), 'LK-07/LK-08 must use classified Laike bubble candidates')
  assert(snapshotFn.includes('findDouyinLaikeInputTarget()'), 'LK-10/LK-11 must use scoped input target')
  assert(!snapshotFn.includes("querySelectorAll('button"), 'LK-11 must not scan all page buttons')

  const activeFn = extractFunction(source, 'findActiveLaikeMsg')
  assert(activeFn.includes('getDouyinLaikeBubbleCandidates()'), 'Active Laike detection must use classified bubble candidates')
  assert(!activeFn.includes('queryAll(PLATFORM_SELECTORS.douyinLaike.incomingBubble)'), 'Active Laike detection must not scan raw incomingBubble selectors')

  const activeHandleFn = extractFunction(source, 'handleActiveLaikeMsg')
  assert(activeHandleFn.includes('await waitForMsgStable'), 'Active Laike path must wait for user message burst stability before collecting')
  assert(activeHandleFn.indexOf('await waitForMsgStable') < activeHandleFn.indexOf('var messages = collectDouyinLaikeMessages()'),
    'Active Laike path must wait before collecting messages')
  assert(activeHandleFn.includes('isDouyinLaikeMessageProcessed(nickname, text, 3600000)'),
    'Active Laike path must share dedup keys with switched-session path')
  assert(source.includes('function markDouyinLaikeMessageProcessed'), 'Laike paths must share a message processed marker')
  const markFn = extractFunction(source, 'markDouyinLaikeMessageProcessed')
  assert(markFn.includes("buildProcessedKey('douyin-laike', nickname, text)"), 'Laike marker must mark switched-session key')
  assert(markFn.includes("buildProcessedKey('douyin-laike-active', '', text)"), 'Laike marker must mark active-session key')
}

function isLaikeSelf(cls) {
  if (/chatd-bubble-main--self|chatd-bubble--self/.test(cls)) return true
  if (/chatd-bubble-main--other|chatd-bubble--other/.test(cls)) return false
  return false
}

function isLaikeUser(cls) {
  if (isLaikeSelf(cls)) return false
  if (/chatd-bubble-main--other|chatd-bubble--other/.test(cls)) return true
  if (/chatd-bubble-main--self|chatd-bubble--self/.test(cls)) return false
  return false
}

function collectLaikeMessages(nodes) {
  let lastSelfIdx = -1
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (isLaikeSelf(nodes[i].cls)) {
      lastSelfIdx = i
      break
    }
  }
  const startIdx = lastSelfIdx >= 0 ? lastSelfIdx + 1 : Math.max(0, nodes.length - 3)
  const messages = []
  const seen = new Set()
  for (let i = startIdx; i < nodes.length; i++) {
    const node = nodes[i]
    if (!isLaikeUser(node.cls)) continue
    const key = node.text.replace(/\s+/g, '')
    if (node.text && !seen.has(key)) {
      seen.add(key)
      messages.push(node.text)
    }
  }
  return messages
}

function assertMessageDirectionFixtures() {
  const beforeReply = [
    { cls: 'chatd-bubble-main--other chatd-bubble-main--left', text: '价格' },
    { cls: 'chatd-bubble-main--self chatd-bubble-main--left', text: '12000元' },
    { cls: 'chatd-bubble-main--other chatd-bubble-main--left', text: '报名优惠' },
  ]
  assert(collectLaikeMessages(beforeReply).join('|') === '报名优惠', 'Should collect only user messages after last AI self message')

  const afterReply = [
    { cls: 'chatd-bubble-main--other chatd-bubble-main--left', text: '报名优惠' },
    { cls: 'chatd-bubble-main--self chatd-bubble-main--left', text: '报名优惠目前有满减和赠品活动' },
  ]
  assert(collectLaikeMessages(afterReply).length === 0, 'Should not collect AI self message as user')

  assert(isLaikeSelf('chatd-bubble-main--self chatd-bubble-main--left'), 'self+left must be AI side')
  assert(isLaikeUser('chatd-bubble-main--other chatd-bubble-main--left'), 'other+left must be user side')
}

function markLaikeProcessed(store, nickname, text) {
  store.add(['douyin-laike', 'douyin', 'customer_service', nickname || '', text || ''].join('|'))
  store.add(['douyin-laike-active', 'douyin', 'customer_service', '', text || ''].join('|'))
}

function isLaikeProcessed(store, nickname, text) {
  return store.has(['douyin-laike', 'douyin', 'customer_service', nickname || '', text || ''].join('|')) ||
    store.has(['douyin-laike-active', 'douyin', 'customer_service', '', text || ''].join('|'))
}

function assertLaikeDedupFixtures() {
  const store = new Set()
  markLaikeProcessed(store, '上海空月-小正', '明天去看看')
  assert(isLaikeProcessed(store, '上海空月-小正', '明天去看看'), 'Switched-session key must be treated as processed')
  assert(isLaikeProcessed(store, '', '明天去看看'), 'Active-session key must be treated as processed')
}

function traceSteps(state) {
  const steps = []
  function step(no, ok) {
    steps.push(no)
    return ok
  }
  if (!step('00', state.page)) return steps
  if (!step('01', state.runtime)) return steps
  if (!step('02', state.list)) return steps
  if (!step('03', state.contacts)) return steps
  if (!step('04', state.trigger)) return steps
  if (!step('05', state.active)) return steps
  if (!step('06', state.chatRoom)) return steps
  if (!step('07', state.bubbles)) return steps
  if (!step('08', state.userBubbles)) return steps
  if (!step('09', state.messages)) return steps
  if (!step('10', state.input)) return steps
  step('11', state.send)
  return steps
}

function assertChainGateFixtures() {
  assert(traceSteps({ page: true, runtime: true, list: true, contacts: false }).join(',') === '00,01,02,03',
    'Empty contact list must stop at LK-03')
  assert(traceSteps({ page: true, runtime: true, list: true, contacts: true, trigger: false }).join(',') === '00,01,02,03,04',
    'Missing trigger must stop at LK-04')
  assert(traceSteps({ page: true, runtime: true, list: true, contacts: true, trigger: true, active: true, chatRoom: true, bubbles: true, userBubbles: true, messages: false }).join(',') === '00,01,02,03,04,05,06,07,08,09',
    'Missing extracted messages must stop at LK-09')
}

function main() {
  const source = readText(CONTENT_PATH)
  const snapshot = readJson(SNAPSHOT_PATH)
  assertSnapshotDirection(snapshot)
  assertSourceDirection(source)
  assertChainGate(source)
  assertNoEmptySessionFalsePositive(source)
  assertMessageDirectionFixtures()
  assertLaikeDedupFixtures()
  assertChainGateFixtures()
  console.log('douyin-laike regression: PASS')
}

try {
  main()
} catch (err) {
  console.error('douyin-laike regression: FAIL')
  console.error(err.message)
  process.exit(1)
}
